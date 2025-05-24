const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const User = require('../../models/userSchema');


const productDeatils = async (req, res, next) => {
    try {

        const productId = req.query.id;
        const product = await Product.findById(productId).populate(['category', 'brand']);
        const findCategory = product.category;
        const findBrand = product.brand;
        const variants = product.variants

        const relatedProducts = await Product.find({
            category: findCategory._id,
            _id: {$ne: productId} // current product avoid cheyyan
        }).populate('brand');

        res.render('user/product-details',{
            product: product,
            brand: findBrand,
            category: findCategory,
            variants: variants,
            relatedProducts: relatedProducts
        })
        
    } catch (error) {
       next(error)
    }
}


module.exports = {
    productDeatils,
}