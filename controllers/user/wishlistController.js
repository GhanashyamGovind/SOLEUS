const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');

const wishList = async (req, res) => {
    try {
        
        const userId = req.session.user;
        const user = await User.findById(userId);
        const products = await Product.find({_id: {$in: user.wishlist}}).populate('category');
        
        return res.render('user/wishlist', {
            user: user,
            wishlist: products
        })
        
    } catch (error) {
        console.error(error)
        return res.redirect('/pageNotFound')
    }
}

const addToWishlist = async (req, res) => {
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
        console.error("error while adding to wishlist", error);
        return res.status(500).json({status: false, message: "Internal Server Error"})
    }
}


const removeFromWishlist = async (req, res) => {
    try {

        const userId = req.session.user;
        const productId = req.params.productId;

        if(!userId){
            return res.status(404).json({status: false, message: "User not found"})
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
        console.error('Error removing wishlist item:', error);
        res.status(500).json({status: false, message: 'Internal server error' });
    }
}


module.exports = {
    wishList,
    addToWishlist,
    removeFromWishlist,
}