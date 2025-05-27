const User = require('../../models/userSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');



const getCart = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.render('user/cart', { cart: { items: [], totalPrice: 0 } });
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        const cartData = cart || { items: [], totalPrice: 0 };

        // Ensure cartData.items have SKU and variant data
        if (cartData.items.length > 0) {
            for (let item of cartData.items) {
                const product = item.productId;
                const variant = product.variants.find(v => v.size === item.size && v.sku === item.sku);
                item.availableVariants = product.variants; // Add all variants for size selection
            }
        }

        return res.render('user/cart', { cart: cartData });
    } catch (error) {
        next(error);
    }
};

const addToCart = async (req, res) => {
    try {

        const userId = req.session.user;
        if(!userId){
            return res.status(401).json({success: false, message: "Please login to add to cart"})
        }

        const {productId, size, sku, quantity} = req.body

        if (!productId || !size || !quantity || !sku) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const variant = product.variants.find(v => v.size == size && v.sku == sku);
        if (!variant) {
            return res.status(400).json({ success: false, message: 'Invalid size or SKU for this product' });
        }

        //stock indo nokkunu
        if(variant.stock < quantity) {
            return res.status(400).json({success: false, message: `Only ${variant.stock} items available for in stock for size ${size}`});
        }

        let cart = await Cart.findOne({userId});
        if(!cart){
            cart = new Cart({userId, items: []});
        }

        //already eixist in the cart check cheyyunu
        const itemIndex = cart.items.findIndex(item => item.productId.toString() == productId && item.size == size && item.sku == sku);

        //  total quantity (existing + requested)
        const existingQuantity = itemIndex > -1 ? cart.items[itemIndex].quantity : 0;
        const totalQuantity = existingQuantity + quantity;

        // Enforce max 3 units per product (size and SKU)
        if (totalQuantity > 3) {
            return res.status(400).json({
                success: false,
                message: `You can only add up to 3 units of this product (size ${size}). Currently in cart: ${existingQuantity} units.`
            });
        }



        if(itemIndex > -1){
            cart.items[itemIndex].quantity += quantity;
        } else {
            cart.items.push({
                productId,
                quantity,
                price: variant.salePrice,
                size,
                sku
            });
        }

        //product korakkunu
        variant.stock -= quantity;
        await product.save();

        // calculte total price
        cart.totalPrice = cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        await cart.save();

        return res.status(200).json({success: true, message: 'Product added to cart successfully'})

    } catch (error) {
        next(error)
    }
}

const updateCart = async (req, res, next) => {
    try {

        const userId = req.session.user;
        const {productId, size, sku, quantity} = req.body;

        if(!userId) {
            return res.status(401).json({ message: 'Unauthorized: Please login to update cart' });
        }

        //min 1 max 3 
        if(quantity < 1) {
           return res.status(400).json({ message: 'Quantity cannot be less than 1' });
        }

        if(quantity > 3) {
            return res.status(400).json({ message: `Maximum 3 units of a product (${size}) are allowed in the cart` });
        }

        //cart finding and cart items
        const cart = await Cart.findOne({userId});
        if(!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const cartItem = cart.items.find(item => item.productId.toString() === productId && item.size === size && item.sku === sku);
        if (!cartItem) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        //product with variants :/
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }

        const variant = product.variants.find(v => v.size === size && v.sku === sku);
        if (!variant) {
            return res.status(404).json({ message: 'Product variant not found' });
        }

        // calculation :(
        const oldQuantity = cartItem.quantity;
        const quantityChange = quantity - oldQuantity;

        // checking the enough stock 
        if (quantityChange > 0) {
            if (variant.stock < quantityChange) {
                return res.status(400).json({ message: `Insufficient stock. Only ${variant.stock} units available for size ${size}` });
            }
        }

        //update stock
        variant.stock -= quantityChange;

        await product.save();

        // Update cart item quantity
        cartItem.quantity = quantity;

        cart.totalPrice = cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        await cart.save();

        return res.status(200).json({ message: 'Cart updated successfully' });
        
    } catch (error) {
        next(error);
    }
}

const removeFromCart = async (req, res, next) => {
    try {

        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: Please login to update cart' });
        }

        const {productId, size, sku } = req.body;

        const cart = await Cart.findOne({userId});
        if (!cart) {
            return res.status(404).json({ message: 'Cart not found' });
        }

        const cartItemIndex = cart.items.findIndex(item => item.productId.toString() == productId && item.size == size && item.sku == sku);
        if (cartItemIndex === -1) {
            return res.status(404).json({ message: 'Item not found in cart' });
        }

        const cartItem = cart.items[cartItemIndex];
        const quantityToReturn = cartItem.quantity;

        const product = await Product.findById(productId)
        if (!product) {
            return res.status(404).json({ message: 'Product not found' });
        }


        // console.log('Product:', JSON.stringify(product, null, 2));
        const variant = product.variants.find(v => v.size === size && v.sku === sku);
        if (!variant) {
            return res.status(404).json({ message: 'Product variant not found' });
        }

        // return quantity to stock
        variant.stock += quantityToReturn;
        await product.save();

        // remove the item from the cart
        cart.items.splice(cartItemIndex, 1);

        // recalculate total price
        cart.totalPrice = cart.items.reduce((total, item) => {
            return total + (item.price * item.quantity);
        }, 0);

        await cart.save();

        return res.status(200).json({ message: 'Item removed from cart successfully' });
    } catch (error) {
        next(error);
    }
}


module.exports = {
    getCart,
    addToCart,
    updateCart,
    removeFromCart,
}


