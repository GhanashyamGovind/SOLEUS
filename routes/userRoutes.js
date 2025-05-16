const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userControllers');
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





module.exports = router;