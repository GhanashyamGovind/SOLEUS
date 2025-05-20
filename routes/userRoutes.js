const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userControllers');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const passport = require('passport');


// error
router.get('/pageNotFound', userController.pageNotFound)

// login and auth
router.get('/login', userController.loadLogin);
router.post('/login', userController.login);

router.get('/signUp', userController.loadSignUp);
router.post('/signUp', userController.signUp);

router.post('/verify-otp', userController.verifyOtp);
router.post("/resend-otp", userController.resendOtp);

router.get('/logout', userController.logOut)

//google autgh
router.get('/auth/google', passport.authenticate('google', {scope:['profile', 'email']}));

router.get('/auth/google/callback', passport.authenticate('google', {failureRedirect:'/signUp'}), (req, res) => {
    console.log('google login successful ==> ', req.user);
    req.session.user=req.user
    res.redirect('/')
});

// profile
router.get('/profile', userController.loadProfile);


//homepage and shope pages
router.get('/',userController.loadHomepage);
router.get('/allproducts', userController.loadAllProductPage);
router.get('/productFilter', userController.filterProduct);
router.get('/clearSearch', userController.clearSearch);


//profileMangement
router.get('/forgot-password', profileController.getForgotPassPage);
router.post('/forgot-email-valid', profileController.forgotEmailValid);
router.post('/verify-passForgot-otp', profileController.verifyForgotPassOtp);
router.get('/reset-password', profileController.getResetPassPage);
router.post('/resend-forgot-otp', profileController.resendOtp);
router.post('/reset-password', profileController.postNewPassword);

//product management
router.get('/productDetails', productController.productDeatils)





module.exports = router;