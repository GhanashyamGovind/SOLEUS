const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const brandController = require('../controllers/admin/brandController');
const productController = require('../controllers/admin/productController');
const orderController = require('../controllers/admin/orderController');
const couponController = require('../controllers/admin/couponController');
const bannerController = require('../controllers/admin/bannerController');
const {userAuth, adminAuth} = require('../middlewares/auth');
const multer = require('multer');
const {storage, bannerStorage} = require('../helpers/multer');
const Brand = require('../models/brandSchema');
const uploads = multer({storage:storage});
const bannerUploads = multer({storage: bannerStorage});


router.get('/pageerror', adminController.pageerror);

// Login-log out management
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/',adminAuth, adminController.loadDashboard);
router.get('/logout', adminController.logout);
router.post('/sales-report', adminAuth, adminController.saleReport);
router.post('/download-pdf', adminAuth, adminController.downloadPDF);
router.post('/download-excel', adminController.downloadExcel);

//Customer management
router.get('/users',adminAuth, customerController.customerInfo);
router.delete('/deleteCustomer', adminAuth, customerController.customerDeleted);
router.patch('/blockandUnblock', adminAuth, customerController.blockAndUnblock)

//Category managemnt
router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);
router.patch('/listCategory', adminAuth, categoryController.getListCategory);
router.patch('/unlistCategory', adminAuth, categoryController.getUnlistCategory);
router.get('/editCategory', adminAuth, categoryController.getEditCategory);
router.post('/editCategory/:id', adminAuth, categoryController.editCategory);
router.post('/addCategoryOffer', adminAuth, categoryController.addCategoryOffer);
router.post('/removeCategoryOffer', adminAuth, categoryController.removeCategoryOffer);


//brand controller 
router.get('/brands', adminAuth, brandController.getBrandPage);
router.post('/addBrand', adminAuth, uploads.single("image"), brandController.addBrand);
router.get('/deleteBrand', adminAuth, brandController.deleteBrand);
router.get('/brandBlockAndUnblock', adminAuth, brandController.blockAndUnblockBrand);

//product controller
router.get('/addProducts', adminAuth, productController.getProductPage);
router.post('/addProducts', adminAuth, uploads.array("images", 4), productController.addProducts);
router.get('/productlist', adminAuth, productController.productList); // ith product list cheytha prodct show cheyyan vendi
router.get('/blockProduct', adminAuth, productController.productBlock);
router.get('/unBlockProduct', adminAuth, productController.productUnBlock);
router.get('/editProduct', adminAuth, productController.getEditProduct);
router.post('/editProduct/:id', adminAuth, uploads.array("images", 4), productController.editProduct);
router.post('/addProductOffer', adminAuth, productController.addProductOffer);
router.post('/removeProductOffer', adminAuth, productController.removeProductOffer)

//order controller 
router.get('/orders', adminAuth, orderController.getAdminOrder);
router.patch('/orders/status/:orderId', adminAuth, orderController.updateStatus);
router.get('/orders/products/:orderId', adminAuth, orderController.getOrderProducts);
router.put('/orders/return/approve/:orderId', adminAuth, orderController.approveReturn);
router.put('/orders/return/reject/:orderId', adminAuth, orderController.rejectReturn);

//coupon controller
router.get('/coupon', adminAuth, couponController.getAdminCoupon)
router.post('/coupon/add', adminAuth, couponController.addCoupon);
router.get('/coupons/edit/:code', adminAuth, couponController.getEditCoupon);
router.put('/coupons/edit/:code', adminAuth, couponController.editCoupon);
router.patch('/coupons/edit/:code/toggle', adminAuth, couponController.listAndUnlit);
router.delete('/coupons/delete/:code', adminAuth, couponController.deleteCoupon);

//referral
router.get('/referral', adminAuth, couponController.getReferral);
router.post('/referral', adminAuth, couponController.editReferral);
router.patch('/referral', adminAuth, couponController.onAndOff);

//banner
router.get('/banner', adminAuth, bannerController.getBanner);
router.post('/createBanner', adminAuth, bannerUploads.single("image"), bannerController.creatBanner);
router.patch('/editBanner', adminAuth, bannerUploads.single("image"), bannerController.editBanner);
router.patch('/toggleBannerStatus', adminAuth, bannerController.listAndUnlist);
router.delete('/deleteBanner', adminAuth, bannerController.deleteBanner)


module.exports = router;