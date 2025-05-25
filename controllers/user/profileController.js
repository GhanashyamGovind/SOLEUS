const User = require('../../models/userSchema');
const Address = require("../../models/addressSchema")
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');
const { isFloat32Array } = require('util/types');



function generateOtp(){
    return Math.floor(100000 + Math.random() * 900000).toString()
}

const sendVerificationEamil = async (email, otp) => {
    try {

        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        });

        const mailOption = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Your OTP for changing the password",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP: ${otp}</h4></b>`
        }

        const info = await transporter.sendMail(mailOption);
        console.log("Email sent : ", info.messageId);
        return true;
        
    } catch (error) {
        console.error("error while emial verification", error)
    }
}

const getForgotPassPage = async (req, res, next) =>{
    try {
        return res.render("user/forgot-password");
    } catch (error) {
        next(error)
    }
}

//hashing the password

const securePassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
        
    } catch (error) {
        console.error("error while hashing", error)
    }
}

const forgotEmailValid = async (req, res, next) => {
    try {
        const {email} = req.body;
        const findUser = await User.findOne({email: email});

        if(findUser){
            const otp = generateOtp();
            const emailSent = await sendVerificationEamil(email, otp);

            if(emailSent){
                req.session.userOtp = otp;
                req.session.email = email;
                req.session.otpGeneratedAt = Date.now(); // Store OTP generation timestamp
                res.render('user/forgotPass-otp');
                console.log("OTP: ", otp)
            } else {
                res.json({success: false, message: "Failed to send OTP, Please try again later"})
            }

        }else{
            res.render("user/forgot-password", {
                message: "User with this email does not exist"
            })
        }
    } catch (error) {
        next(error)
    }
}

const verifyForgotPassOtp = async (req, res, next) => {
    try {
        const enterdOtp = req.body.otp;

// Check if OTP has expired (60 seconds = 60000 milliseconds)
        const otpGeneratedAt = req.session.otpGeneratedAt;
        const currentTime = Date.now();
        const timeElapsed = currentTime - otpGeneratedAt;

        if (!otpGeneratedAt || timeElapsed > 60000) {
            // Optionally clear the OTP from session
            req.session.userOtp = null;
            req.session.otpGeneratedAt = null;
            return res.json({ success: false, message: "OTP has expired. Please resend a new OTP." });
        }

        if(req.session.userOtp === enterdOtp){
// Clear OTP and timestamp after successful verification
            req.session.userOtp = null;
            req.session.otpGeneratedAt = null;

            res.json({success: true, redirectUrl: '/reset-password'})
        }else{
            res.json({success: false, message: "OTP not matching"})
        }
    } catch (error) {
        next(error)
    }
}

const getResetPassPage = async (req, res) => {
    try {
        res.render('user/reset-password')
    } catch (error) {
        next(error)
    }
}

const resendOtp = async (req, res) => {
    try {

        const email = req.session.email;

        if (!email) {
            const error = new Error("No emial found in the session. Please try agian")
            error.statusCode = 400;
            throw error;
        }
        console.log("resending otp to email", email);
        const otp = generateOtp();
        req.session.userOtp = otp;
        req.session.otpGeneratedAt = Date.now(); // Store new OTP generation timestamp

        const emailSent = await sendVerificationEamil(email, otp);
        if(emailSent){
            console.log("Resend otp", otp);
            res.status(200).json({success: true, message: "Resend OTP Successful"})
        }
        
    } catch (error) {
        next(error)
    }
}

const postNewPassword = async (req, res, next) => {
    try {

        const {password, confirmPassword} = req.body; 
        const email = req.session.email;

        if(password === confirmPassword){
            const passwordHash = await securePassword(password);

            await User.updateOne({email: email}, {$set: {password: passwordHash}});
            res.status(200).json({success: true, message: "New Password Successfully Accepted", redirectUrl: '/login'})
        } else {
            res.status(401).json({success: false, message: "Password id not matching"})
        }
        
    } catch (error) {
        next(error)
    }
}



const getProfileDetails  = async (req, res, next) => {
    try {

        const userId = req.session.user;
        if(!userId) {
            const error = new Error("User not Found");
            error.statusCode = 404;
            throw error;
        }
        console.log(userId);
        const userData = await User.findOne({_id: userId});
        console.log(userData)
        return res.render('user/profile-details', {
            user: userData,
        })

    } catch (error) {
        next(error)
    }
}

const updateImage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            const error = new Error("User Not Found");
            error.statusCode = 404;
            throw error;
        }

        // Check if file was uploaded
        if (!req.file) {
            const error = new Error("No file uploaded");
            error.statusCode = 400;
            throw error;
        }

        // Log file details for debugging
        console.log('Uploaded file details:', req.file);

        // Define the upload directory
        const uploadDir = path.join(__dirname, '../../public/uploads/userImage');

        // Ensure the upload directory exists
        await fs.mkdir(uploadDir, { recursive: true });

        // Verify the file exists on disk
        const filePath = path.join(uploadDir, req.file.filename);
        try {
            await fs.access(filePath);
            console.log('File verified at:', filePath);
        } catch (err) {
            console.error('File not found at:', filePath);
            const error = new Error("Uploaded file not found on server");
            error.statusCode = 500;
            throw error;
        }

        // Construct the image path for the database
        const imagePath = `/uploads/userImage/${req.file.filename}`;

        // Update user profile with the image path
        await User.findByIdAndUpdate(userId, { profileImage: imagePath });

        return res.redirect('/getProfileDetails');
    } catch (error) {
        console.error('Error in updateImage:', error);
        next(error);
    }
};


const deleteImage = async (req, res, next) => {
    try {
        const id = req.params.id;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (user.profileImage) {
            // Construct the correct file path
            const imagePath = path.join(__dirname, '../../public/uploads/userImage', user.profileImage.replace('/uploads/userImage/', ''));

            // Verify the file exists
            try {
                await fs.access(imagePath);
                await fs.unlink(imagePath);
                console.log('File deleted:', imagePath);
            } catch (err) {
                console.error('Error accessing/deleting file:', imagePath, err);
                // Optionally, proceed with updating the database even if the file is missing
            }

            // Update the user's profileImage to null
            user.profileImage = null;
            await user.save();

            return res.status(200).json({ success: true, message: "Profile image deleted successfully" });
        }

        return res.status(400).json({ success: false, message: "No profile image to delete" });
    } catch (error) {
        console.error('Error in deleteImage:', error);
        next(error);
    }
};

const updateUsername = async (req, res, next) => {
  try {
    const { username } = req.body;
    const userId = req.session.user

    if (!username) {
      return res.status(400).json({ status: false, message: 'Username is required' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name: username },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ status: false, message: 'User not found' });
    }

    return res.status(200).json({ status: true, message: 'Username updated successfully' });
    } catch (error) {
    next(error)
  }
};


const updatePhone = async (req, res, next) => {
    try {
        const { phone } = req.body; 
        const userId = req.session.user;

        if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        const updatedUser = await User.findByIdAndUpdate(
        userId,
        { phone },
        { new: true }
        );

        if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.status(200).json({ success: true, message: 'Phone number updated successfully' });
    } catch (error) {
        next(error)
    }
};

const emailValid = async (req, res, next) => {
    try {
        const { email } = req.body;
        const findUser = await User.findOne({ email: email });
        if (findUser) {
            const otp = generateOtp();
            const emailSent = await sendVerificationEamil(email, otp);
            if (emailSent) {
                req.session.userOtp = otp;
                req.session.email = email;
                req.session.otpGeneratedAt = Date.now();
                console.log("OTP: ", otp);
                return res.status(200).json({ success: true, message: "OTP sent to your email" });
            } else {
                return res.json({ success: false, message: "Failed to send OTP, please try again later" });
            }
        } else {
            return res.json({ success: false, message: "User not found" });
        }
    } catch (error) {
        next(error);
    }
};

const emailOTPverify = async (req, res, next) => {
    try {
        const user = req.session.user;
        if (user) {
            return res.render('user/change-email-otp');
        } else {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
    } catch (error) {
        next(error);
    }
};

const verifyEmailOtp = async (req, res, next) => {
    try {
        const { otp } = req.body;
        const storedOtp = req.session.userOtp;
        const otpGeneratedAt = req.session.otpGeneratedAt;
        const currentTime = Date.now();
        const timeElapsed = currentTime - otpGeneratedAt;

        if (!otpGeneratedAt || timeElapsed > 60000) {
            req.session.userOtp = null;
            req.session.otpGeneratedAt = null;
            return res.json({ success: false, message: "OTP has expired. Please resend a new OTP." });
        }

        if (storedOtp === otp) {
            req.session.userOtp = null;
            req.session.otpGeneratedAt = null;
            return res.json({ success: true, redirectUrl: '/update-email' });
        } else {
            return res.json({ success: false, message: "OTP not matching" });
        }
    } catch (error) {
        next(error);
    }
};


const resendEmailOtp = async (req, res, next) => {
    try {
        const email = req.session.email;
        if (!email) {
            return res.status(400).json({ success: false, message: "No email found in the session. Please try again" });
        }
        const otp = generateOtp();
        req.session.userOtp = otp;
        req.session.otpGeneratedAt = Date.now();
        const emailSent = await sendVerificationEmail(email, otp);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            return res.status(200).json({ success: true, message: "Resend OTP Successful" });
        } else {
            return res.status(500).json({ success: false, message: "Failed to resend OTP" });
        }
    } catch (error) {
        next(error);
    }
};

const getUpdateEmail = async (req, res, next) => {
    try {
        const user = req.session.user;
        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
        res.render('user/update-email', { title: 'Update Email' });
    } catch (error) {
        next(error);
    }
};


const updateEmail = async (req, res, next) => {
    try {
        const { email } = req.body;
        const userId = req.session.user;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email is required" });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser._id.toString() !== userId) {
            return res.status(400).json({ success: false, message: "Email already in use" });
        }
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { email },
            { new: true }
        );
        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        req.session.email = null;
        delete req.session.user
            
        return res.status(200).json({ success: true, message: "Email updated successfully", redirectUrl: "/login" });
    } catch (error) {
        next(error);
    }
};


const updatePassword = async (req, res, next) => {
    try {

        const {oldPassword, newPassword} = req.body;

        if(!oldPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Old password and new password are required' });
        }

        const userId = req.session.user;
        const user = await User.findById(userId);
        if(!user){
            return res.status(404).json({success: false, message: "user not found"});
        }

        const isMatch = await bcrypt.compare(oldPassword, user.password)
        if(!isMatch) {
           return res.status(400).json({ success: false, message: 'Incorrect old password' }); 
        }

        const isSamePassword = await bcrypt.compare(newPassword, user.password);
        if(isSamePassword) {
            return res.status(400).json({ success: false, message: 'New password cannot be the same as the old password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        user.password = hashedPassword;
        await user.save();

        return res.status(200).json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        next(error)
    }
}

const deletePage = async (req, res, next) => {
    try {

        const user = req.session.user;
        if(!user){
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        return res.render('user/delete-profile');
        
    } catch (error) {
        next(error)
    }
}

const confirmDelete = async (req, res, next) => {
    try {

        const userId = req.session.user;
        const user = await User.findById(userId);
        if(!user) {
            return res.status(404).json({success: false, message: "user not found"});
        }

        const {email, password} = req.body;

        if(email !== user.email){
            return res.status(404).json({success: false, message: "Wrong email"});
        }

        const comparePassword = await bcrypt.compare(password, user.password);
        if(!comparePassword){
            return res.status(404).json({success: false, message: "Password is not matching"});
        }
        
        await User.findByIdAndDelete(userId)
        delete req.session.user;
        return res.status(200).json({success: true, message: "Successfully deleted the user"});
        
    } catch (error) {
        next(error)
    }
}

const loadAddress = async (req, res, next) => {
    try {


        const userId = req.session.user;
        const user = await User.findById(userId);
        if(!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const addressData = await Address.findOne({userId: userId});

        return res.render('user/address', {
            user: user,
            address: addressData || {address: []}
        });

    } catch (error) {
        next(error)
    }
}

// this the page for adding the new addres not he page of showing the address
const getAddAdress = async (req, res, next) => {
    try {

        const userId = req.session.user;
        const user = await User.findById(userId);

        if(!user){
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error
        }

        return res.render('user/add-address');
    } catch (error) {
        next(error);
    }
}

const addAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if(!userId){
            return res.status(401).json({success: false, message: "Unauthorized user"});
        }

        const {
            addressType,
            name,
            buildingName,
            phone,
            pincode,
            landMark,
            city,
            state,
        } = req.body;

        if(!addressType || !name || !buildingName || !city || !landMark || !state || !phone || !pincode) {
            return res.status(400).json({success: false, message: "All required fields must be provided"});
        }

        const pincodeNumber = Number(pincode);
        if (isNaN(pincodeNumber)) {
            return res.status(400).json({ success: false, message: 'Invalid pincode' });
        }

        // address obj
        const newAddress = {
            addressType,
            name,
            city,
            landMark,
            state,
            pincode: pincodeNumber,
            phone,
            buildingName
        }

        let addressDoc = await Address.findOne({userId});

        if(addressDoc) {
            addressDoc.address.push(newAddress);
            await addressDoc.save();
        } else {
            addressDoc = new Address({
                userId,
                address: [newAddress]
            });
            await addressDoc.save();
        }

        return res.status(201).json({success: true, message: "Address added successfully"});
    } catch (error) {
        next(error);
    }
}

const loadEdit = async (req, res, next) => {
        try {
            const userId = req.session.user;
            if(!userId){
                const error = new Error("User not found");
                error.statusCode = 404;
                throw error
            }

            const addressId = req.query.id

            const userAddress = await Address.findOne({userId, 'address._id': addressId}, {'address.$': 1})
            console.log(userAddress)

            const address = userAddress.address[0];

            console.log(`this is adddress: ${address}`)

            return res.render('user/edit-address', {address})
        } catch (error) {
            
        }
    }

    const editAddress = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const addressId = req.query.id;

        if (!userId) {
                return res.status(401).json({success: false, message: 'User not authenticated' });
        } 

        const {
            addressType,
            name,
            buildingName,
            phone,
            pincode,
            landMark,
            city,
            state
        } = req.body;

        if (!addressType || !name || !buildingName || !phone || !pincode || !landMark || !city || !state) {
                return res.status(400).json({success: false, message: 'All address fields are required' });
        }

        if (!/^\d{6}$/.test(pincode)) {
                return res.status(400).json({success: false, message: 'Pincode must be a 6-digit number' });
        }

        if (!/^\d{10}$/.test(phone)) {
                return res.status(400).json({success: false, message: 'Phone number must be 10 digits' });
        }

        const updateAddress = await Address.findOneAndUpdate(
            {userId, 'address._id': addressId},
            {
                $set: {
                    'address.$.addressType': addressType,
                    'address.$.name': name,
                    'address.$.buildingName': buildingName,
                    'address.$.phone': phone,
                    'address.$.pincode': pincode,
                    'address.$.landMark': landMark,
                    'address.$.city': city,
                    'address.$.state': state
                }
            },
            {new: true}
        );

        if (!updateAddress) {
                return res.status(404).json({success: false, message: 'Address not found' });
        }

        
        return res.status(200).json({success: true, message: 'Address updated successfully' });
    } catch (error) {
        next(error)
    }
}

const deleteAddress = async (req, res, next) => {
    try {
        const userId = req.session.user; 
        if(!userId) {
            return res.status(401).json({success: false, message: "Unautherized user"});
        }

        const addressId = req.params.id;
        console.log('ad id', addressId);

        const updateAddress = await Address.findOneAndUpdate(
            {userId},
            {$pull: {address: {_id: addressId}}},
            {new: true}
        );

        console.log(updateAddress)

        if (!updateAddress) {
            return res.status(404).json({success: false, message: 'Address not found' });
        }

        return res.status(200).json({success: true, message: 'Address deleted successfully' });
    } catch (error) {
        next(error)
    }
}



module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
    getProfileDetails,
    updateImage,
    deleteImage,
    updateUsername,
    updatePhone,
    emailValid,
    emailOTPverify,
    verifyEmailOtp,
    resendEmailOtp,
    updateEmail,
    getUpdateEmail,
    updatePassword,
    deletePage,
    confirmDelete,
    loadAddress,
    getAddAdress,
    addAddress,
    loadEdit,
    editAddress,
    deleteAddress,
}