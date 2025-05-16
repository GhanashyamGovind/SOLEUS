const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController');
const categoryController = require('../controllers/admin/categoryController');
const brandController = require('../controllers/admin/brandController');
const productController = require('../controllers/admin/productController')
const {userAuth, adminAuth} = require('../middlewares/auth');
const multer = require('multer');
const storage = require('../helpers/multer');
const Brand = require('../models/brandSchema');
const uploads = multer({storage:storage})


router.get('/pageerror', adminController.pageerror);

// Login-log out management
router.get('/login', adminController.loadLogin);
router.post('/login', adminController.login);
router.get('/',adminAuth, adminController.loadDashboard);
router.get('/logout', adminController.logout);

//Customer management
router.get('/users',adminAuth, customerController.customerInfo);
router.get('/blockCustomer', adminAuth, customerController.customerBlocked);
router.get('/unblockCustomer', adminAuth, customerController.customerunBlocked);
router.get('/deleteCustomer', adminAuth, customerController.customerDeleted);

//Category managemnt
router.get('/category', adminAuth, categoryController.categoryInfo);
router.post('/addCategory', adminAuth, categoryController.addCategory);

router.get('/listCategory', adminAuth, categoryController.getListCategory);
router.get('/unlistCategory', adminAuth, categoryController.getUnlistCategory);
router.get('/editCategory', adminAuth, categoryController.getEditCategory);
router.post('/editCategory/:id', adminAuth, categoryController.editCategory);


//brand controller 
router.get('/brands', adminAuth, brandController.getBrandPage);
router.post('/addBrand', adminAuth, uploads.single("image"), brandController.addBrand);
router.get('/blockBrand', adminAuth, brandController.blockBrand);
router.get('/unBlockBrand', adminAuth, brandController.unBlockBrand);
router.get('/deleteBrand', adminAuth, brandController.deleteBrand);

//product controller
router.get('/addProducts', adminAuth, productController.getProductPage);
router.post('/addProducts', adminAuth, uploads.array("images", 4), productController.addProducts);
router.get('/productlist', adminAuth, productController.productList);
router.get('/blockProduct', adminAuth, productController.productBlock);
router.get('/unBlockProduct', adminAuth, productController.productUnBlock);
router.get('/editProduct', adminAuth, productController.getEditProduct);
router.post('/editProduct/:id', adminAuth, uploads.array("images", 4), productController.editProduct)


module.exports = router