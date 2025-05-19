const User = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const env = require('dotenv').config();
const session = require('express-session');



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

const getForgotPassPage = async (req, res) =>{
    try {
        return res.render("user/forgot-password");
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

//hashing the password

const securePassword = async (password) => {
    try {

        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
        
    } catch (error) {
        
    }
}

const forgotEmailValid = async (req, res) => {
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
        console.error("error regarding to email asccesing", error)
        res.redirect('/pageNotFound')
    }
}

const verifyForgotPassOtp = async (req, res) => {
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
        res.status(500).josn({success: false, message: "An error occured please try again"})
    }
}

const getResetPassPage = async (req, res) => {
    try {
        res.render('user/reset-password')
    } catch (error) {
        res.redirect('/pageNotFound')
    }
}

const resendOtp = async (req, res) => {
    try {

        const email = req.session.email;

        if (!email) {
            return res.status(400).json({ success: false, message: "No email found in session. Please try again." });
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
        console.error("Error in resend otp", error);
        res.status(500).json({success: false, message: "Internal server error"})
    }
}

const postNewPassword = async (req, res) => {
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
        console.error("error in setting newPSWd", error);
        res.status(500).json({success: false, message: "Internal server error"});
    }
}


module.exports = {
    getForgotPassPage,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassPage,
    resendOtp,
    postNewPassword,
}