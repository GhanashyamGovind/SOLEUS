const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Brand = require('../../models/brandSchema');
const nodemailer = require('nodemailer');
const env = require('dotenv').config();
const bcrypt = require('bcrypt');



function generateOtp(){
    return Math.floor(100000 + Math.random() * 900000).toString();
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
const loadHomepage = async (req, res) => {
    try{
        const user = req.session.user;

        const categories = await Category.find({isListed: true});
        let productData = await Product.find(
            {
                isBlocked: false,
                category: {$in: categories.map(category => category._id)},
                quantity: {$gt: 0}
            }    
        )

        productData.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0, 4);

        if(user){
            const userData = await User.findOne({_id: user._id});
            return res.render('user/home', {user: userData, products: productData});
        } else {
            return res.render('user/home', {products: productData})
        }
       
    } catch (error){
        console.error("home page not found", error);
        res.status(500).send("server error");
    }
}

//login-load
const loadLogin = async (req, res) => {  
    try {

        if(!req.session.user){
            return res.render('user/login');
        }else{
            res.redirect('/profile');
        }
        
    } catch (error) {
        console.log("login is not loading ", error);
        res.redirect('/pageNotFound')
    }
}

// signup-load 
const loadSignUp = async (req, res) => {
    try {
        return res.render('user/signUp');
    } catch (error) {
        console.log("signup is not loading", error);
        res.status(500).send("Server Error")
    }
}

 //login-submit 
 const login = async (req, res) =>{
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

        req.session.user = findUser._id;
        // console.log(req.session.user)
        res.redirect('/')
        
    } catch (error) {

        console.error('login error', error);
        res.render('user/login', {message: "Login Failed !. Please try again later"})
        
    }
 }





// submit signUp
const signUp = async (req, res) => {
    try {
        const {name, email, password, confirmPassword, phone} = req.body;

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
        req.session.userData = {name,phone,email, password};

        res.render("user/verify-otp");
        console.log("otp sent", otp)

    } catch (error) {
        console.error("signup error", error);
        res.redirect("/page-404")
    }
}


const securePassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password, 10);

        return passwordHash;
        
    } catch (error) {
        
    }
}

const verifyOtp = async (req, res) => {
    try {

        const {otp} = req.body;
        console.log(`user enterd otp ${otp}`);

        if(otp === req.session.userOtp){
            const user = req.session.userData; // session ill ulla otp aay compare cheyyunu
            const passwordHash = await securePassword(user.password);

            const saveUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await saveUserData.save(); // saved user data in DB
            // req.session.user = saveUserData._id =====> (ith karanam user reg cheyyummbol thanne login akunnu)
            res.json({success: true, redirectUrl: "/login"})
        }else {
            res.status(400).json({success: false, message: "Invalid OTP, Please try again"})
        }

    } catch (error) {
        console.error("otp verification error ====>", error);
        res.status(500).json({success:false, message: "An error occured"})
    }
}

const resendOtp = async (req, res) => {
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
        console.error("Error resendig OTP ", error);
        res.status(500).json({success: false, message: "Internal Server Error. Please try again"})
    }
}

// profile load
const loadProfile = async (req, res) =>{
    try {
        const user = req.session.user
        // console.log(user)
        if(user){
            const userData = await User.findOne({_id:user});

            // console.log("User Data:", userData);

            res.render('user/profile', {user: userData});
        }else{
            res.redirect('/');
        }
    } catch (error) {
        console.error("Error in profile loadingcls ", error);
        res.redirect('/pageNotFound')
    }
}

//logout
const logOut = async (req, res) => {
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

        console.error("LogOut error", error);
        res.redirect('/pageNotFound')
        
    }
}


const pageNotFound = async (req, res) => {
    
    try {
        res.render('user/page-404')
    } catch (error) {
        res.redirect('/pageNotFound')
    }

}

const loadAllProductPage = async (req, res) => {
  try {
    // Extract query parameters with defaults
    const { brand = '', category = '', minPrice = '', maxPrice = '', onFire = '', search = '', sort = '', page = 1, ajax = '' } = req.query;

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
    if (category) {
      query.category = category; // Expects category as ObjectId
    }
    if (minPrice || maxPrice) {
      query.salePrice = {};
      if (minPrice) query.salePrice.$gte = parseInt(minPrice);
      if (maxPrice) query.salePrice.$lte = parseInt(maxPrice);
    }
    if (onFire) {
      query.onFire = onFire; // 
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
      .limit(limit);

    const brands = await Brand.find({ isBlocked: false });
    const categoriesWithIds = categories.map(category => ({ _id: category._id, name: category.name }));

    const totalPages = Math.ceil(totalProducts / limit);

    const isAjax = ajax === 'true';

    if (isAjax) {
      // Return JSON for fetch requests
      return res.json({
        products,
        currentPage,
        totalPages,
        selectedBrand: brand,
        selectedCategory: category,
        minPrice,
        maxPrice,
        selectedOnFire: onFire,
        search,
        sort,
      });
    }

    // Render EJS for regular requests
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
      selectedOnFire: onFire,
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
    
    const { brand = '', category = '', minPrice = '', maxPrice = '', onFire = '', search = '', sort = '', page = 1, ajax = '' } = req.query;

    
    let query = {};
    if (brand) query.brand = brand;
    if (category) query.category = category; 
    if (minPrice || maxPrice) {
      query.salePrice = {};
      if (minPrice) query.salePrice.$gte = parseInt(minPrice);
      if (maxPrice) query.salePrice.$lte = parseInt(maxPrice);
    }
    if (onFire) {
      query.onFire = onFire; 
    }
    if (search) {
      query.productName = { $regex: search, $options: 'i' }; 
    }

    
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
      .limit(limit);


    const brands = await Brand.find({ isBlocked: false });
    const categories = await Category.find({ isListed: true });

    const totalPages = Math.ceil(totalProducts / limit);

    
    const isAjax = ajax === 'true';

    if (isAjax) {
      // return JSON for fetch requests
      return res.json({
        products,
        currentPage,
        totalPages,
        selectedBrand: brand,
        selectedCategory: category,
        minPrice,
        maxPrice,
        selectedOnFire: onFire,
        search,
        sort,
      });
    }

    // render ejs for normal requests
    return res.render('user/all-products', {
      products,
      brand: brands,
      category: categories,
      currentPage,
      totalPages,
      selectedBrand: brand,
      selectedCategory: category,
      minPrice,
      maxPrice,
      selectedOnFire: onFire,
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
    filterProduct
}