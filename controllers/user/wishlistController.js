const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');

const wishList = async (req, res, next) => {
    try {
        
        const userId = req.session.user;
        const user = await User.findById(userId);
        const products = await Product.find({_id: {$in: user.wishlist}}).populate('category');
        
        return res.render('user/wishlist', {
            user: user,
            wishlist: products
        })
        
    } catch (error) {
        next(error)
    }
}

const addToWishlist = async (req, res, next) => {
    try {

        const userId = req.session.user;

        if(!userId) {
            return res.status(200).json({ status: false, message:"Please login to add to wishlist"}); 
        }

        const productId = req.body.productId;
        const user = await User.findById(userId);
        if(user.wishlist.includes(productId)){
            return res.status(200).json({status: false, message: "Product alredy in wishlist"});
        }

        user.wishlist.push(productId);
        await user.save();

        return res.status(200).json({status: true, message: "Product added to wishlist"})
        
    } catch (error) {
        next(error)
    }
}


const removeFromWishlist = async (req, res, next) => {
    try {

        const userId = req.session.user;
        const productId = req.params.productId;

        if(!userId){
            const error = new Error('Please login to remove from wihslist');
            error.statusCode = 401;
            throw error;
        }
        

        const user = await User.findByIdAndUpdate(
            userId,
            {$pull: {wishlist: productId}},
            {new: true}
        );

        return res.status(200).json({
            status: true, 
            message: "Item removed form the wishlist",
            updatedWishlist: user.wishlist,
        })

         
    } catch (error) {
        next(error)
    }
}


module.exports = {
    wishList,
    addToWishlist,
    removeFromWishlist,
}