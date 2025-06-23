const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const Referral = require('../../models/referralSchema');
const nodemailer = require('nodemailer');
const env = require('dotenv').config();
const bcrypt = require('bcrypt');
const {Resend} = require('resend');
const Wallet = require('../../models/walletSchema');
const { default: mongoose } = require('mongoose');
const resend = new Resend(process.env.RESEND_API_KEY);



function generateOtp(){
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createReferralCode (name, userId){
  try {
    let namePart = name.slice(0, 3).toUpperCase();
    let userIdPart = userId.toString().slice(4, 7).toUpperCase()

    return `${namePart}${userIdPart}`
  } catch (error) {
    console.error("Error while generating referral code", error);
    return false;
  }
}

async function sendVerificationEmail(email, otp){
    try {
        // sent otp through mail
        const transporter = nodemailer.createTransport({

            service: 'gmail',
            port: 587, // default port of gmail
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }

        });

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify your Account",
            text: `Your verification OTP is ${otp}`,
            html: `<b>Your OTP : ${otp}</b>`
        })

        return info.accepted.length > 0

    } catch (error) {
        console.error("Error sending email", error);
        return false;
    }
}



//home page
const loadHomepage = async (req, res, next) => {
    try{
        const user = req.session.user;

        const categories = await Category.find({isListed: true});
        let productData = await Product.find(
            {
                isBlocked: false,
                category: {$in: categories.map(category => category._id)},
                quantity: {$gt: 0}
            }    
        ).populate('brand').exec()

        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        if(user){
            const userData = await User.findOne({_id: user._id});
            return res.render('user/home', {user: userData, products: productData});
        } else {
            return res.render('user/home', {products: productData})
        }
       
    } catch (error){
        next(error);
    }
}

//login-load
const loadLogin = async (req, res, next) => {  
    try {

        if(!req.session.user){
            return res.render('user/login');
        }else{
            res.redirect('/profile');
        }
        
    } catch (error) {
        next(error);
    }
}

// signup-load 
const loadSignUp = async (req, res, next) => {
    try {

      if(!req.session.user){
        return res.render('user/signUp');
      } else {
        return res.redirect('/')
      }
        
    } catch (error) {
        next(error)
    }
}

 //login-submit 
 const login = async (req, res, next) =>{
    try {

        const {email, password} = req.body;

        const findUser = await User.findOne({isAdmin: 0, email: email});

        if(!findUser){
            return res.render('user/login', {message: "User not found"});
        }

        if(findUser.isBlocked){
            return res.render('user/login', {message: "This user is blocked by admin"})
        }

        const passwordMatch = await bcrypt.compare(password, findUser.password); // 2 password compre cheyyum

        if(!passwordMatch){
            return res.render('user/login', {message: 'Incorrect Password'})
        }

        req.session.user = findUser._id; // => ivide aanu user session store aakunnath athum id aanu store aakunnath
        res.redirect('/')
        
    } catch (error) {

        // console.error('login error', error);
        // res.render('user/login', {message: "Login Failed !. Please try again later"})
        next(error)
        
    }
 }



// submit signUp
const signUp = async (req, res, next) => {
    try {
        const {name, email, password, confirmPassword, phone, referralCode} = req.body;

        if(password !== confirmPassword){
            return res.render('user/signUp', {message: "Password not Matchig"})
        }

        const findUser = await User.findOne({email});
        if(findUser){
            return res.render("user/signUp", {message: "User with this email already exists"})
        }

        const otp = generateOtp();

        const emailSent = await sendVerificationEmail(email, otp);
        if(!emailSent){
            return res.json("email error");
        }

        req.session.userOtp = otp;
        req.session.userData = {name,phone,email,password, referralCode};

        res.render("user/verify-otp");
        console.log("otp sent", otp)

    } catch (error) {
        next(error)
    }
}


const securePassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password, 10);

        return passwordHash;
        
    } catch (error) {
        
    }
}

const verifyOtp = async (req, res, next) => {
  try {

        const {otp} = req.body;

       if(otp === req.session.userOtp){ // session ill ulla otp aay compare cheyyunu
            const user = req.session.userData; 
            const passwordHash = await securePassword(user.password);

            let referralCode = await createReferralCode(user.name, new mongoose.Types.ObjectId())
            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                referralCode: referralCode
            });

            const refCod = user.referralCode;

            //save user first 
            const createdUser = await saveUserData.save(); // saved user data in DB

            // createdUser.referralCode = await createReferralCode (createdUser.name, createdUser._id);
            // console.log("referal code ====> ",createdUser.referralCode)

            // creat a wallet for the new user
            const newWallet = new Wallet({
              userId: createdUser._id
            });
            const savedWallet = await newWallet.save();

            //update user walleid
            createdUser.walletId = savedWallet._id;
            await createdUser.save();

            //reffer part
            const refer = await Referral.findOne({isActive: true});
            let referreUser = await User.findOne({referralCode: refCod.trim().toUpperCase()});

            if(refCod && refer && referreUser){
              await Wallet.updateOne(
                {userId: referreUser._id},
                {
                  $inc: { balance: refer.referrerAmount },
                  $push: {
                    transactions: {
                      type: 'credit',
                      amount: refer.referrerAmount,
                      reason: `Referral - Reward for inviting a user(${createdUser.name})`
                    }
                  }
                }
              )
              console.log("1st money ok")

              savedWallet.balance += refer.refereeAmount;
              savedWallet.transactions.push({
                type: 'credit',
                amount: refer.refereeAmount,
                reason: `Welcome reward for using a referral`
              })
              console.log("second money ok")
              await savedWallet.save();
            }
            
            res.json({success: true, redirectUrl: "/login"})
        }else {
            res.status(400).json({success: false, message: "Invalid OTP, Please try again"})
        }

  } catch (error) {
      next(error)
   }
}

const resendOtp = async (req, res, next) => {
    try {
        
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success: false, message: 'Email not found in session'});
        }
        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email, otp);
        if(emailSent){
            console.log(`Resend OTP ${otp}`);
            res.status(200).json({success: true, message: 'OTP Resend Successfully'});
        }else {
            res.status(500).json({success: false, message: 'Failed to Resend OTP. Please try again'});
        }

    } catch (error) {
        next(error);
    }
}

// profile load
const loadProfile = async (req, res, next) =>{
    try {
        const userId = req.session.user
        console.log(userId)
        const userData = await User.findOne({_id:userId});

        if(!userData){
          console.log("user not found", userId);
          return res.redirect('/login');
        }

        res.render('user/profile', {user: userData});
        
    } catch (error) {
        next(error)
    }
}

//logout
const logOut = async (req, res, next) => {
    try {

            delete req.session.user;
            return res.redirect('/login')
      
        // req.session.destroy((err) => {
        //     if(err){
        //         console.log("Session destruction error ===> ", err);
        //         return res.redirect('/pageNotFound');
        //     }
        //     console.log("session is deleted")
        //     return res.redirect('/login');
        // })
    } catch (error) {

        next(error)
        
    }
}


const pageNotFound = async (req, res, next) => {
    
    try {
        res.render('user/page-404')
    } catch (error) {
        next(error)
    }

}

const loadAllProductPage = async (req, res) => {
  try {
    const { brand = '', category = '', minPrice = '', maxPrice = '', search = '', sort = '', page = 1, ajax = '' } = req.query;
    // Handle onFire as an array
    let onFire = req.query['onFire[]'];
    if (onFire && !Array.isArray(onFire)) {
      onFire = [onFire]; // Convert single value to array
    }
    onFire = onFire || []; // Default to empty array if not provided

    // Validate onFire values
    const validOnFireValues = ['newArrival', 'topSelling'];
    const validatedOnFire = onFire.filter(value => validOnFireValues.includes(value));

    // Fetch categories
    const categories = await Category.find({ isListed: true });
    const categoryIds = categories.map((category) => category._id.toString());

    // Build query object
    let query = {
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    };
    if (brand) query.brand = brand;
    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.salePrice = {};
      if (minPrice) query.salePrice.$gte = parseInt(minPrice);
      if (maxPrice) query.salePrice.$lte = parseInt(maxPrice);
    }
    if (validatedOnFire.length > 0) {
      query.onFire = { $in: validatedOnFire };
    }
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    // Build sort option
    let sortOption = {};
    switch (sort) {
      case 'priceLow':
        sortOption.salePrice = 1;
        break;
      case 'priceHigh':
        sortOption.salePrice = -1;
        break;
      case 'nameAsc':
        sortOption.productName = 1;
        break;
      case 'nameDesc':
        sortOption.productName = -1;
        break;
      default:
        sortOption.createdAt = -1;
    }

    const limit = 12;
    const currentPage = parseInt(page) || 1;
    const skip = (currentPage - 1) * limit;

    const totalProducts = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('brand', 'brandName')
      .populate('category', 'name');

    const brands = await Brand.find({ isBlocked: false });
    const categoriesWithIds = categories.map(category => ({ _id: category._id, name: category.name }));

    const totalPages = Math.ceil(totalProducts / limit);

    const isAjax = ajax === 'true';

    if (isAjax) {
      return res.json({
        products,
        currentPage,
        totalPages,
        selectedBrand: brand,
        selectedCategory: category,
        minPrice,
        maxPrice,
        selectedOnFire: validatedOnFire,
        search,
        sort,
      });
    }

    return res.render('user/all-products', {
      products,
      category: categoriesWithIds,
      brand: brands,
      totalProducts,
      currentPage,
      totalPages,
      selectedBrand: brand,
      selectedCategory: category,
      minPrice,
      maxPrice,
      selectedOnFire: validatedOnFire,
      search,
      sort,
    });
  } catch (error) {
    console.error('Error in loadAllProductPage:', error);
    const isAjax = req.query.ajax === 'true';
    if (isAjax) {
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
    return res.status(500).render('user/error', {
      message: 'Something went wrong. Please try again.',
    });
  }
};

const filterProduct = async (req, res) => {
  try {
    const { brand = '', category = '', minPrice = '', maxPrice = '', search = '', sort = '', page = 1, ajax = '' } = req.query;
    // Handle onFire as an array
    let onFire = req.query['onFire[]'];
    if (onFire && !Array.isArray(onFire)) {
      onFire = [onFire]; // Convert single value to array
    }
    onFire = onFire || []; // Default to empty array if not provided

    // Validate onFire values
    const validOnFireValues = ['newArrival', 'topSelling'];
    const validatedOnFire = onFire.filter(value => validOnFireValues.includes(value));

    // Fetch categories and ensure products are from listed categories
    const categories = await Category.find({ isListed: true });
    const categoryIds = categories.map((category) => category._id.toString());

    // Build query object
    let query = {
      isBlocked: false,
      category: { $in: categoryIds },
      quantity: { $gt: 0 },
    };
    if (brand) query.brand = brand;
    if (category) query.category = category;
    if (minPrice || maxPrice) {
      query.salePrice = {};
      if (minPrice) query.salePrice.$gte = parseInt(minPrice);
      if (maxPrice) query.salePrice.$lte = parseInt(maxPrice);
    }
    if (validatedOnFire.length > 0) {
      query.onFire = { $in: validatedOnFire };
    }
    if (search) {
      query.productName = { $regex: search, $options: 'i' };
    }

    // Build sort option
    let sortOption = {};
    switch (sort) {
      case 'priceLow':
        sortOption.salePrice = 1;
        break;
      case 'priceHigh':
        sortOption.salePrice = -1;
        break;
      case 'nameAsc':
        sortOption.productName = 1;
        break;
      case 'nameDesc':
        sortOption.productName = -1;
        break;
      default:
        sortOption.createdAt = -1;
    }

    const limit = 12;
    const currentPage = parseInt(page) || 1;
    const skip = (currentPage - 1) * limit;

    const totalProducts = await Product.countDocuments(query);
    const products = await Product.find(query)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .populate('brand', 'brandName')
      .populate('category', 'name');

    const brands = await Brand.find({ isBlocked: false });
    const categoriesWithIds = categories.map(category => ({ _id: category._id, name: category.name }));

    const totalPages = Math.ceil(totalProducts / limit);

    const isAjax = ajax === 'true';

    if (isAjax) {
      return res.json({
        products,
        currentPage,
        totalPages,
        selectedBrand: brand,
        selectedCategory: category,
        minPrice,
        maxPrice,
        selectedOnFire: validatedOnFire,
        search,
        sort,
      });
    }

    return res.render('user/all-products', {
      products,
      brand: brands,
      category: categoriesWithIds,
      totalProducts,
      currentPage,
      totalPages,
      selectedBrand: brand,
      selectedCategory: category,
      minPrice,
      maxPrice,
      selectedOnFire: validatedOnFire,
      search,
      sort,
    });
  } catch (error) {
    console.error('Error in filterProduct:', error);
    const isAjax = req.query.ajax === 'true';
    if (isAjax) {
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
    return res.status(500).render('user/error', {
      message: 'Something went wrong. Please try again.',
    });
  }
};


const clearSearch = async (req, res) => {
  try {

    const { brand = '', category = '', minPrice = '', maxPrice = '', onFire = '', sort = '', page = 1, ajax = '' } = req.query;

    const queryParams = {
      brand,
      category,
      minPrice,
      maxPrice,
      onFire,
      sort,
      page,
    };
    if (ajax) queryParams.ajax = ajax;

    // Redirect to filterProduct with remaining parameters
    const queryString = new URLSearchParams(queryParams).toString();
    return res.redirect(`/productFilter?${queryString}`);
  } catch (error) {
    console.error('Error in clearSearch:', error);
    const isAjax = req.query.ajax === 'true';
    if (isAjax) {
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
    return res.status(500).render('user/page-404', {
      message: 'Something went wrong. Please try again.',
    });
  }
};


const aboutUs = async (req, res, next) => {
  try {
    return res.render('user/aboutUs');
  } catch (error) {
    next(error);
  }
}

const contact = async (req, res, next) => {
  try {
    return res.render('user/contact')
  } catch (error) {
    next(error)
  }
}

const emailMessage = async (req, res, next) => {
  try {

    const userId = req.session.user;
    if(!userId){
      return res.json({success: false, message: "Please Login To send EMAIL"})
    }
    console.log("got the userid", userId)

    const user = await User.findById(userId);
    console.log("got the user", user)
    
    const {email, message} = req.body;
    console.log(email, message)

    if(!email || !message) {
      return res.json({success: false, message: "Fields are missing"});
    }

    if(email != user.email){
      return res.json({success: false, message: "Please enter the email that belong to your account, dont enter other email"});
    }


    //emial sending with resennd
    const response = await resend.emails.send({
      from: 'Acme <onboarding@resend.dev>', //domain purchase cheythitt ith maattanam
      to: process.env.COMPANY_EMAIL,
      subject: `New message from ${user.name}`,
      text: `Name: ${user.name} \nEmail: ${email} \n\n${message}`,
      replyTo: email
    })

    console.log(response)

    if (response.error) {
      return res.status(500).json({ success: false, message: "Failed to send message to the company. Please try again." });
    }

    return res.status(200).json({ success: true, message: "Message sent successfully." });
  } catch (error) {
    console.error(error)
    next(error)
  }
}

module.exports = {
    loadHomepage,
    loadLogin,
    loadSignUp,
    signUp,
    login,
    verifyOtp,
    resendOtp,
    loadProfile,
    logOut,
    pageNotFound,
    loadAllProductPage,
    clearSearch,
    filterProduct,
    aboutUs,
    contact,
    emailMessage,
}