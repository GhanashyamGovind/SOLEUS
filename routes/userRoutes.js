const express = require('express');
const router = express.Router();
const userController = require('../controllers/user/userControllers');
const profileController = require('../controllers/user/profileController');
const productController = require('../controllers/user/productController');
const wishlistController = require('../controllers/user/wishlistController')
const passport = require('passport');
const { userAuth } = require('../middlewares/auth');
const {userStorage} = require('../helpers/multer');
const multer = require('multer');

const upload = multer({storage: userStorage})


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
router.get('/profile', userAuth, userController.loadProfile);


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

//profile and profile deatls
router.get('/getProfileDetails', userAuth, profileController.getProfileDetails);
router.post('/updateImage', userAuth, upload.single('profileImage'), profileController.updateImage);
router.delete('/delete-profile-img/:id', userAuth, profileController.deleteImage);
router.post('/updateUsername', userAuth, profileController.updateUsername);
router.post('/updatePhone', userAuth, profileController.updatePhone);
router.post('/generateEmailOtp', userAuth, profileController.emailValid);
router.get('/verify-EmailOtp', userAuth, profileController.emailOTPverify); 
router.post('/verify-email-otp', userAuth, profileController.verifyEmailOtp);
router.post('/resend-email-otp', userAuth, profileController.resendOtp);
router.get('/update-email', userAuth, profileController.getUpdateEmail);
router.post('/update-email', userAuth, profileController.updateEmail);
router.post('/updatePassword', userAuth, profileController.updatePassword);
router.get('/confirm-delete', userAuth, profileController.deletePage);
router.delete('/confirm-delete', userAuth, profileController.confirmDelete);




//product management
router.get('/productDetails', productController.productDeatils);

//whishlist manager
router.get('/wishlist', userAuth, wishlistController.wishList);
router.post('/addToWishlist', wishlistController.addToWishlist);
router.delete('/removeWishlist/:productId', userAuth, wishlistController.removeFromWishlist);






module.exports = router;