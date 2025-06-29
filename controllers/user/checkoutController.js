
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Coupon = require('../../models/couponSchema');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const Razorpay = require('razorpay');

function generateOrderId(shopName) {
  const digits = () => Math.floor(1000 + Math.random() * 9000);
  const letters = () => Math.random().toString(36).substring(2, 5);
  const moreDigits = () => Math.floor(100 + Math.random() * 900);
  return `${digits()}${letters()}${moreDigits()}${shopName}`;
}
//for getting the rewardBased Coupon
const rewardEligibleCoupon = async (userId, amountPaid) => {
    try {
        const bestCoupon = await Coupon.findOne({
            rewardThreshold: { $lte: amountPaid },
            isPublic: { $eq: false },
            givenTo: { $nin: [userId] },
            isListed: true,
            expireOn: { $gt: new Date() },
        }).sort({ rewardThreshold: -1 }); // get highest qualifyig coupon

        if (bestCoupon) {
            bestCoupon.givenTo.push(userId);
            console.log(`Coupon '${bestCoupon.name}'- ${bestCoupon.code} is given to user ${userId} `);
            await bestCoupon.save();
        } else {
            console.log('No eligible coupon found to reward.');
        }

    } catch (error) {
        console.error('Error giving coupon to user:', error);
    }
};

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const loadCheckOut = async (req, res, next) => {
    try {
        const userId = req.session.user;
        console.log('User ID:', userId);

        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId).select('name email phone');
        if (!user) {
            req.session.user = null;
            return res.redirect('/login');
        }

        const { buyNow, orderId } = req.query;
        const isBuyNow = buyNow === 'true' && req.session.buyNow;
        const isFailedPayment = !!orderId;
        const addressDoc = await Address.findOne({ userId });
        const address = addressDoc && addressDoc.address.length > 0 ? addressDoc.address : null;

        let cartItems = [];
        let priceDetails = {
            subtotal: 0,
            deliveryCharges: 0,
            discount: 0,
            totalAmount: 0,
            itemCount: 0
        };

        if (isFailedPayment) {
            // retry payment for failed order
            const order = await Order.findOne({ orderId, user: userId }).populate('orderedItems.product');
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.redirect('/cart?error=Invalid or non-failed order');
            }

            // stock availability indo check cheyyam
            for (const item of order.orderedItems) {
                const product = item.product;
                if (!product || product.isBlocked) {
                    return res.redirect(`/cart?error=Product ${item.product.productName} is unavailable or blocked`);
                }

                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.stock < item.quantity) {
                    return res.redirect(`/cart?error=Insufficient stock for ${item.product.productName} (Size: ${item.size})`);
                }
            }

            cartItems = order.orderedItems.map(item => ({
                name: item.product.productName,
                size: item.size,
                color: item.color || 'N/A',
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity,
                image: item.product.productImage && item.product.productImage.length > 0 ? item.product.productImage[0] : null
            }));

            priceDetails.subtotal = order.totalPrice;
            priceDetails.deliveryCharges = order.totalPrice >= 2500 ? 0 : 99;
            priceDetails.discount = order.discount || 0;
            priceDetails.totalAmount = order.finalAmount;
            priceDetails.itemCount = cartItems.length;

            // sesssion ill order id retry payment nu save cheyyam
            req.session.retryOrder = { orderId: order.orderId };
        } else if (isBuyNow) {
            // Handle Buy Now checkout
            const { productId, size, sku, quantity, price } = req.session.buyNow || {};
            if (!productId) {
                return res.redirect('/cart?error=Buy Now session expired');
            }
            const product = await Product.findById(productId);
            if (product.isBlocked || !product) {
                req.session.buyNow = null;
                return res.redirect('/cart?error=Product not found');
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant || variant.stock < quantity) {
                req.session.buyNow = null;
                return res.redirect('/cart?error=Invalid size or insufficient stock');
            }

            cartItems = [{
                name: product.productName,
                size,
                color: variant.color || product.color || 'N/A',
                quantity,
                price,
                total: price * quantity,
                image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
            }];

            priceDetails.subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
            priceDetails.deliveryCharges = priceDetails.subtotal >= 2500 ? 0 : 99;
            priceDetails.totalAmount = priceDetails.subtotal + priceDetails.deliveryCharges - priceDetails.discount;
            priceDetails.itemCount = cartItems.length;
        } else {
            // Handle cart-based checkout
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                console.log('Cart is empty');
                return res.redirect('/cart');
            }

            cartItems = cart.items.map(item => {
                const product = item.productId;
                if (!product || !product.variants || !product.variants.length || product.isBlocked) {
                    console.warn(`Product not found or has no variants: ${item.productId}`);
                    return null;
                }

                const variant = product.variants.find(v => v.size === item.size && v.sku === item.sku);
                if (!variant || variant.stock < item.quantity) {
                    console.warn(`Variant not found or insufficient stock for product ${product.productName}, size: ${item.size}, sku: ${item.sku}`);
                    return null;
                }

                return {
                    name: product.productName,
                    size: item.size,
                    color: product.color || 'N/A',
                    quantity: item.quantity,
                    price: variant.salePrice,
                    total: variant.salePrice * item.quantity,
                    image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
                };
            }).filter(item => item !== null);

            // If no valid items remain after filtering, redirect to cart
            if (!cartItems.length) {
                console.log('No valid items in cart after filtering blocked products or insufficient stock');
                return res.redirect('/cart?error=All items in your cart are unavailable or out of stock');
            }

            priceDetails.subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
            priceDetails.deliveryCharges = priceDetails.subtotal >= 2500 ? 0 : 99;
            priceDetails.totalAmount = priceDetails.subtotal + priceDetails.deliveryCharges - priceDetails.discount;
            priceDetails.itemCount = cartItems.length;
        }

        //apply cheyyan pattunna coupons chek cheyyam
        const applicableCoupons = await Coupon.find({
            isListed: true,
            expireOn: { $gte: new Date() },
            $or: [
                { isPublic: true },
                { givenTo: userId }
            ],
            usedBy: { $nin: userId},
            minimumPrice: { $lte: priceDetails.subtotal + priceDetails.deliveryCharges }
        }).select('code name offerPrice discountType minimumPrice');

        return res.render('user/checkout', {
            title: 'Check Out',
            address,
            cartItems,
            priceDetails,
            isBuyNow: isBuyNow || isFailedPayment,
            isFailedPayment,
            orderId: isFailedPayment ? orderId : null,
            user,
            applicableCoupons
        });
    } catch (error) {
        console.error('Error in loadCheckOut:', error);
        next(error);
    }
};

const applyCoupon = async (req, res, next) => {
    try {
        const { couponCode, isBuyNow, orderId } = req.body;
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not logged in' });
        }

        const coupon = await Coupon.findOne({
            code: couponCode,
            isListed: true,
            expireOn: { $gte: new Date() },
            usedBy: { $nin: [userId] },
            $or: [
                { isPublic: true },
                { givenTo: userId }
            ]
        });

        if (!coupon) {
            return res.status(400).json({ success: false, message: 'Invalid or expired coupon' });
        }

        let cartItems = [];
        let priceDetails = {
            subtotal: 0,
            deliveryCharges: 0,
            discount: 0,
            totalAmount: 0,
            itemCount: 0
        };

        const isBuyNowBoolean = isBuyNow === 'true' || isBuyNow === true;
        const isFailedPayment = !!orderId;

        if (isFailedPayment) {
            const order = await Order.findOne({ orderId, user: userId }).populate('orderedItems.product');
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.status(400).json({ success: false, message: 'Invalid or non-failed order' });
            }

            for (const item of order.orderedItems) {
                const product = item.product;
                if (!product || product.isBlocked) {
                    return res.status(400).json({ success: false, message: `Product ${item.product.productName} is unavailable or blocked` });
                }

                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.stock < item.quantity) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for ${item.product.productName} (Size: ${item.size})` });
                }
            }

            cartItems = order.orderedItems.map(item => ({
                name: item.product.productName,
                size: item.size,
                color: item.color || 'N/A',
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity,
                image: item.product.productImage && item.product.productImage.length > 0 ? item.product.productImage[0] : null
            }));

            priceDetails.subtotal = order.totalPrice;
        } else if (isBuyNowBoolean && req.session.buyNow) {
            const { productId, size, sku, quantity, price } = req.session.buyNow;
            if (!productId) {
                return res.status(400).json({ success: false, message: 'Buy Now session expired' });
            }
            const product = await Product.findById(productId);
            if (product.isBlocked || !product) {
                return res.status(400).json({ success: false, message: 'Product not found' });
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant || variant.stock < quantity) {
                return res.status(400).json({ success: false, message: 'Invalid size or insufficient stock' });
            }

            cartItems = [{
                name: product.productName,
                size,
                color: variant.color || product.color || 'N/A',
                quantity,
                price,
                total: price * quantity,
                image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
            }];

            priceDetails.subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
        } else {
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                return res.status(400).json({ success: false, message: 'Cart is empty' });
            }

            cartItems = cart.items.map(item => {
                const product = item.productId;
                if (!product || !product.variants || !product.variants.length || product.isBlocked) {
                    return null;
                }

                const variant = product.variants.find(v => v.size === item.size && v.sku === item.sku);
                if (!variant || variant.stock < item.quantity) {
                    return null;
                }

                return {
                    name: product.productName,
                    size: item.size,
                    color: product.color || 'N/A',
                    quantity: item.quantity,
                    price: variant.salePrice,
                    total: variant.salePrice * item.quantity,
                    image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
                };
            }).filter(item => item !== null);

            if (!cartItems.length) {
                return res.status(400).json({ success: false, message: 'No valid items in cart' });
            }

            priceDetails.subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
        }

        //cheking with the delivary charge

        if(priceDetails.subtotal >= 2500) {
            if (priceDetails.subtotal< coupon.minimumPrice) {
                return res.status(400).json({ success: false, message: `Minimum purchase of ₹${coupon.minimumPrice} required` });
            }
        } else {
            if (priceDetails.subtotal + 99 < coupon.minimumPrice) {
                return res.status(400).json({ success: false, message: `Minimum purchase of ₹${coupon.minimumPrice} required` });
            }
        }

        // Calculate discount
        let discount = 0;
        if (coupon.discountType === 'fixed') {
            discount = coupon.offerPrice;
        } else if (coupon.discountType === 'percentage') {
           const baseAmount = priceDetails.subtotal >= 2500 ? discount = priceDetails.subtotal : priceDetails.subtotal + 99;

           // normal discount
           let rawDiscount = Math.round((coupon.offerPrice * baseAmount ) / 100);

           // scale down the discount for large orders
           const scaleDiscount = (amount, percent) => {
            if(amount <= 2500) return rawDiscount; // full discount allowed
            if(amount <= 5000) return Math.min(rawDiscount, amount * (percent / 100) * 0.8) //max 80%
            if(amount <= 10000) return Math.min(rawDiscount, amount * (percent / 100) * 0.6) // max 60%
            if(amount <= 20000) return Math.min(rawDiscount, amount * (percent / 100) * 0.4) // max 40%
            return Math.min(rawDiscount, amount * (percent / 100) * 0.25) // max 25%
           }

           //
           discount = Math.round(scaleDiscount(baseAmount, coupon.offerPrice));
        }

        priceDetails.discount = discount;
        priceDetails.deliveryCharges = priceDetails.subtotal >= 2500 ? 0 : 99;
        priceDetails.totalAmount = Math.max(0, priceDetails.subtotal + priceDetails.deliveryCharges - priceDetails.discount);
        priceDetails.itemCount = cartItems.length;

        // store applied coupon in session
        req.session.couponDiscount = discount;
        req.session.appliedCoupon = { code: coupon.code };

        return res.json({
            success: true,
            priceDetails,
            message: 'Coupon applied successfully'
        });
    } catch (error) {
        console.error('Error in applyCoupon:', error);
        return res.status(500).json({ success: false, message: 'Failed to apply coupon' });
    }
};

const removeCoupon = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'User not logged in' });
        }

        const { isBuyNow, orderId } = req.body;
        const isBuyNowBoolean = isBuyNow === 'true' || isBuyNow === true;
        const isFailedPayment = !!orderId;
        let cartItems = [];
        let priceDetails = {
            subtotal: 0,
            deliveryCharges: 0,
            discount: 0,
            totalAmount: 0,
            itemCount: 0
        };

        if (isFailedPayment) {
            const order = await Order.findOne({ orderId, user: userId }).populate('orderedItems.product');
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.status(400).json({ success: false, message: 'Invalid or non-failed order' });
            }

            cartItems = order.orderedItems.map(item => ({
                name: item.product.productName,
                size: item.size,
                color: item.color || 'N/A',
                quantity: item.quantity,
                price: item.price,
                total: item.price * item.quantity,
                image: item.product.productImage && item.product.productImage.length > 0 ? item.product.productImage[0] : null
            }));

            priceDetails.subtotal = order.totalPrice;
        } else if (isBuyNowBoolean && req.session.buyNow) {
            const { productId, size, sku, quantity, price } = req.session.buyNow;
            if (!productId) {
                return res.status(400).json({ success: false, message: 'Buy Now session expired' });
            }
            const product = await Product.findById(productId);
            if (product.isBlocked || !product) {
                return res.status(400).json({ success: false, message: 'Product not found' });
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant || variant.stock < quantity) {
                return res.status(400).json({ success: false, message: 'Invalid size or insufficient stock' });
            }

            cartItems = [{
                name: product.productName,
                size,
                color: variant.color || product.color || 'N/A',
                quantity,
                price,
                total: price * quantity,
                image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
            }];

            priceDetails.subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
        } else {
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                return res.status(400).json({ success: false, message: 'Cart is empty' });
            }

            cartItems = cart.items.map(item => {
                const product = item.productId;
                if (!product || !product.variants || !product.variants.length || product.isBlocked) {
                    return null;
                }

                const variant = product.variants.find(v => v.size === item.size && v.sku === item.sku);
                if (!variant || variant.stock < item.quantity) {
                    return null;
                }

                return {
                    name: product.productName,
                    size: item.size,
                    color: product.color || 'N/A',
                    quantity: item.quantity,
                    price: variant.salePrice,
                    total: variant.salePrice * item.quantity,
                    image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
                };
            }).filter(item => item !== null);

            if (!cartItems.length) {
                return res.status(400).json({ success: false, message: 'No valid items in cart' });
            }

            priceDetails.subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
        }

        priceDetails.deliveryCharges = priceDetails.subtotal >= 2500 ? 0 : 99;
        priceDetails.totalAmount = priceDetails.subtotal + priceDetails.deliveryCharges;
        priceDetails.itemCount = cartItems.length;

        // Clear coupon from session        
        req.session.couponDiscount = null;
        req.session.appliedCoupon = null;

        return res.json({
            success: true,
            priceDetails,
            message: 'Coupon removed successfully'
        });
    } catch (error) {
        console.error('Error in removeCoupon:', error);
        return res.status(500).json({ success: false, message: 'Failed to remove coupon' });
    }
};
//check
const proceedToPayment = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized user' });
        }

        const { isBuyNow, addressId, paymentMethod, orderId } = req.body;
        const isBuyNowBoolean = isBuyNow === 'true' || isBuyNow === true;
        const isFailedPayment = !!orderId;
        if (!addressId) {
            return res.status(400).json({ success: false, message: 'Please select a shipping address' });
        }
        if (!['Razorpay', 'COD', 'Wallet'].includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method' });
        }

        // Handle Razorpay separately
        if (paymentMethod === 'Razorpay') {
            return res.status(400).json({
                success: false,
                message: 'Use /create-razorpay-order for Razorpay payments'
            });
        }

        const userAddressDoc = await Address.findOne({ userId });
        const selectedAddress = userAddressDoc.address.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Invalid address' });
        }
        const clonedAddress = structuredClone(selectedAddress.toObject());

        let order;
        let totalPrice = 0;
        let deliveryCharges = 0;
        let discount = req.session.couponDiscount || 0;
        let finalAmount = 0;

        if (isFailedPayment) {
            // Handle retry payment for failed order
            order = await Order.findOne({ orderId, user: userId }).populate('orderedItems.product');
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.status(400).json({ success: false, message: 'Invalid or non-failed order' });
            }

            // Check stock availability
            for (const item of order.orderedItems) {
                const product = item.product;
                if (!product || product.isBlocked) {
                    return res.status(400).json({ success: false, message: `Product ${item.product.productName} is unavailable or blocked` });
                }

                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.stock < item.quantity) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for ${item.product.productName} (Size: ${item.size})` });
                }
            }

            totalPrice = order.totalPrice;
            deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            finalAmount = Math.max(0, totalPrice + deliveryCharges - discount);

            //no cod above 3000
            if(paymentMethod === 'COD' && finalAmount > 3000) {
                return res.status(400).json({ success: false, message: 'Cash on Delivery is not available for orders above ₹3000'});
            }

            // Update order details
            order.address = clonedAddress;
            order.paymentMethod = paymentMethod;
            order.discount = discount;
            order.finalAmount = finalAmount;
            order.couponApplied = !!discount;
            order.couponCode = req.session.appliedCoupon ? req.session.appliedCoupon.code : null;
            order.status = 'Pending';
            order.paymentStatus = 'Pending';
            order.invoiceDate = new Date();
        } else if (isBuyNowBoolean && req.session.buyNow) {
            // Handle Buy Now for COD and Wallet
            const { productId, size, sku, quantity, price } = req.session.buyNow;
            if (!productId) {
                return res.status(400).json({ success: false, message: 'Buy Now session expired' });
            }
            const product = await Product.findById(productId);
            if (!product || product.isBlocked) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Product not found or blocked' });
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant || variant.stock < quantity) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Invalid size or insufficient stock' });
            }

            const color = product.color;
            totalPrice = price * quantity;
            deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            finalAmount = Math.max(0, totalPrice + deliveryCharges - discount);

            // no cod above 3000
            if (paymentMethod === 'COD' && finalAmount > 3000) {
                return res.status(400).json({ success: false, message:'Cash on Delivery is not available for orders above ₹3000'})
            }

            order = new Order({
                orderId: generateOrderId('SOLEUS'),
                user: userId,
                orderedItems: [{
                    product: productId,
                    size,
                    sku,
                    quantity,
                    price,
                    color,
                }],
                totalPrice,
                discount,
                finalAmount,
                address: clonedAddress,
                invoiceDate: new Date(),
                paymentMethod: paymentMethod,
                status: 'Pending',
                createdOn: new Date(),
                couponApplied: !!discount,
                couponCode: req.session.appliedCoupon ? req.session.appliedCoupon.code : null
            });
        } else {
            // Handle cart-based payment for COD and wallet
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                return res.status(400).json({ success: false, message: 'Cart is empty' });
            }

            // Filter out blocked products and invalid items
            const validItems = [];
            const invalidItems = [];

            for (const item of cart.items) {
                const product = item.productId;
                if (!product || product.isBlocked) {
                    invalidItems.push(item);
                    continue;
                }

                const variant = product.variants.find(v => v.size === item.size && v.sku === item.sku);
                if (!variant) {
                    invalidItems.push(item);
                    continue;
                }
                if (variant.stock < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for ${product.productName} (Size: ${item.size})`
                    });
                }

                validItems.push({
                    product: item.productId._id,
                    size: item.size,
                    sku: variant.sku,
                    quantity: item.quantity,
                    price: variant.salePrice,
                    color: item.productId.color,
                });
            }

            // If no valid items remain, return an error
            if (!validItems.length) {
                return res.status(400).json({
                    success: false,
                    message: 'All items in your cart are unavailable or out of stock'
                });
            }

            // Remove invalid items from the cart
            if (invalidItems.length > 0) {
                await Cart.findOneAndUpdate(
                    { userId },
                    { $pull: { items: { _id: { $in: invalidItems.map(item => item._id) } } } }
                );
            }

            totalPrice = validItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
            deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            finalAmount = Math.max(0, totalPrice + deliveryCharges - discount);

            // no cod above 3000
            if (paymentMethod === 'COD' && finalAmount > 3000) {
                return res.status(400).json({ success: false, message:'Cash on Delivery is not available for orders above ₹3000'})
            }

            order = new Order({
                orderId: generateOrderId('SOLEUS'),
                user: userId,
                orderedItems: validItems,
                totalPrice,
                discount,
                finalAmount,
                address: clonedAddress,
                invoiceDate: new Date(),
                paymentMethod: paymentMethod,
                status: 'Pending',
                createdOn: new Date(),
                couponApplied: !!discount,
                couponCode: req.session.appliedCoupon ? req.session.appliedCoupon.code : null
            });
        }

        // Handle Wallet payment
        if (paymentMethod === 'Wallet') {
            const wallet = await Wallet.findOne({ userId });
            if (!wallet) {
                return res.status(400).json({ success: false, message: 'Wallet not found for this user' });
            }

            if (wallet.balance < finalAmount) {
                return res.status(400).json({ success: false, message: `Insufficient wallet balance: ₹${wallet.balance}` });
            }

            // Debit money from the wallet and add transaction
            wallet.balance -= finalAmount;
            wallet.transactions.push({
                type: 'debit',
                amount: finalAmount,
                reason: `Order payment for order ${order.orderId}`,
                orderId: order.orderId,
                createdAt: new Date()
            });

            await wallet.save();
            order.paymentStatus = 'Completed';
            console.log('Wallet payment completed');
            await rewardEligibleCoupon(userId, order.finalAmount); // Coupon for wallet payment (not for COD)
        }

        await order.save();

        if (order.couponCode) {
            await Coupon.findOneAndUpdate(
                { code: order.couponCode.trim().toUpperCase() },
                { $addToSet: { usedBy: userId } }
            );
            console.log('Coupon marked as used');
        }

        if (!isFailedPayment) {
            await User.findByIdAndUpdate(userId, { $push: { orderHistory: order._id } }, { new: true });
        }

        if (isBuyNowBoolean || isFailedPayment) {
            req.session.buyNow = null;
            req.session.retryOrder = null;
        } else {
            await Cart.findOneAndUpdate({ userId }, { $set: { items: [], totalPrice: 0 } }, { new: true });
        }
        req.session.couponDiscount = null;
        req.session.appliedCoupon = null;

        if (!isFailedPayment) {
            for (const item of order.orderedItems) {
                const result = await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { 'variants.$[elem].stock': -item.quantity } },
                    { arrayFilters: [{ 'elem.sku': item.sku }], new: true }
                );
                if (!result) {
                    throw new Error(`Failed to update stock for product ${item.product}`);
                }
            }
        }

        const redirectUrl = `/order/success?orderId=${order._id}`;
        console.log(`Order processed: ${order._id}, Payment Method: ${paymentMethod}, Redirecting to: ${redirectUrl}`);

        res.status(200).json({
            success: true,
            message: 'Order processed successfully',
            redirectUrl
        });
    } catch (error) {
        console.error('Error in proceedToPayment:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Something went wrong'
        });
    }
};

const createRazorpayOrder = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized user' });
        }

        const { isBuyNow, addressId, orderId } = req.body;
        const isBuyNowBoolean = isBuyNow === 'true' || isBuyNow === true;
        const isFailedPayment = !!orderId;
        if (!addressId) {
            return res.status(400).json({ success: false, message: 'Please select a shipping address' });
        }

        const userAddressDoc = await Address.findOne({ userId });
        const selectedAddress = userAddressDoc.address.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Invalid address' });
        }

        let totalPrice, deliveryCharges, discount, finalAmount, items;

        if (isFailedPayment) {
            const order = await Order.findOne({ orderId, user: userId }).populate('orderedItems.product');
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.status(400).json({ success: false, message: 'Invalid or non-failed order' });
            }

            for (const item of order.orderedItems) {
                const product = item.product;
                if (!product || product.isBlocked) {
                    return res.status(400).json({ success: false, message: `Product ${item.product.productName} is unavailable or blocked` });
                }

                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.stock < item.quantity) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for ${item.product.productName} (Size: ${item.size})` });
                }
            }

            totalPrice = order.totalPrice;
            deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            discount = req.session.couponDiscount || 0;
            finalAmount = Math.max(1, totalPrice + deliveryCharges - discount);

            items = order.orderedItems.map(item => ({
                product: item.product._id,
                size: item.size,
                sku: item.sku,
                quantity: item.quantity,
                price: item.price,
                color: item.color
            }));
        } else if (isBuyNowBoolean && req.session.buyNow) {
            const { productId, size, sku, quantity, price } = req.session.buyNow;
            const product = await Product.findById(productId);
            if (!product || product.isBlocked) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Product not found or blocked' });
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant || variant.stock < quantity) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Invalid size or insufficient stock' });
            }

            totalPrice = price * quantity;
            deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            discount = req.session.couponDiscount || 0;
            finalAmount = Math.max(1, totalPrice + deliveryCharges - discount);

            items = [{
                product: productId,
                size,
                sku,
                quantity,
                price,
                color: product.color
            }];
        } else {
            const cart = await Cart.findOne({ userId }).populate('items.productId');
            if (!cart || !cart.items.length) {
                return res.status(400).json({ success: false, message: 'Cart is empty' });
            }

            const validItems = [];
            const invalidItems = [];

            for (const item of cart.items) {
                const product = item.productId;
                if (!product || product.isBlocked) {
                    invalidItems.push(item);
                    continue;
                }

                const variant = product.variants.find(v => v.size === item.size && v.sku === item.sku);
                if (!variant) {
                    invalidItems.push(item);
                    continue;
                }
                if (variant.stock < item.quantity) {
                    return res.status(400).json({
                        success: false,
                        message: `Insufficient stock for ${product.productName} (Size: ${item.size})`
                    });
                }

                validItems.push({
                    product: item.productId._id,
                    size: item.size,
                    sku: variant.sku,
                    quantity: item.quantity,
                    price: variant.salePrice,
                    color: item.productId.color
                });
            }

            if (!validItems.length) {
                return res.status(400).json({
                    success: false,
                    message: 'All items in your cart are unavailable or out of stock'
                });
            }

            if (invalidItems.length > 0) {
                await Cart.findOneAndUpdate(
                    { userId },
                    { $pull: { items: { _id: { $in: invalidItems.map(item => item._id) } } } }
                );
            }

            items = validItems;
            totalPrice = validItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
            deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            discount = req.session.couponDiscount || 0;
            finalAmount = Math.max(1, totalPrice + deliveryCharges - discount);
        }

        const options = {
            amount: Math.round(finalAmount * 100), // Convert to paise
            currency: 'INR',
            receipt: `order_${orderId || generateOrderId('SOLEUS')}`
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Store order details in session
        req.session.razorpayOrderDetails = {
            isBuyNow: isBuyNowBoolean,
            isFailedPayment,
            orderId: isFailedPayment ? orderId : null,
            addressId,
            items,
            totalPrice,
            deliveryCharges,
            discount,
            finalAmount,
            razorpayOrderId: razorpayOrder.id,
            couponCode: req.session.appliedCoupon ? req.session.appliedCoupon.code : null
        };

        res.status(200).json({
            success: true,
            order: razorpayOrder,
            key_id: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create Razorpay order'
        });
    }
};

const verifyRazorpayPayment = async (req, res) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized user' });
        }

        const {
            razorpay_payment_id,
            razorpay_order_id,
            razorpay_signature,
            isBuyNow,
            addressId,
            paymentMethod,
            orderId
        } = req.body;

        const isBuyNowBoolean = isBuyNow === 'true' || isBuyNow === true;
        const isFailedPayment = !!orderId;

        if (!req.session.razorpayOrderDetails || req.session.razorpayOrderDetails.razorpayOrderId !== razorpay_order_id) {
            console.warn('Invalid order details - session:', req.session.razorpayOrderDetails);
            const failureRedirectUrl = `/order/failure?razorpayOrderId=${razorpay_order_id}&isBuyNow=${isBuyNowBoolean || isFailedPayment}`;
            return res.status(400).json({
                success: false,
                message: 'Invalid order details',
                redirectUrl: failureRedirectUrl
            });
        }

        const isValidPayment = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex') === razorpay_signature;

        const { items, totalPrice, deliveryCharges, discount, finalAmount, couponCode } = req.session.razorpayOrderDetails;

        let order;
        if (isFailedPayment) {
            order = await Order.findOne({ orderId, user: userId }).populate('orderedItems.product');
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.status(400).json({ success: false, message: 'Invalid or non-failed order' });
            }

            // Check stock availability
            for (const item of order.orderedItems) {
                const product = item.product;
                if (!product || product.isBlocked) {
                    return res.status(400).json({ success: false, message: `Product ${item.product.productName} is unavailable or blocked` });
                }

                const variant = product.variants.find(v => v.sku === item.sku && v.size === item.size);
                if (!variant || variant.stock < item.quantity) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for ${item.product.productName} (Size: ${item.size})` });
                }
            }

            // Update existing order
            const userAddressDoc = await Address.findOne({ userId });
            const selectedAddress = userAddressDoc.address.id(addressId);
            if (!selectedAddress) {
                return res.status(400).json({ success: false, message: 'Invalid address' });
            }
            const clonedAddress = structuredClone(selectedAddress.toObject());

            order.address = clonedAddress;
            order.paymentMethod = 'Razorpay';
            order.paymentStatus = isValidPayment ? 'Completed' : 'Failed';
            order.status = isValidPayment ? 'Pending' : 'Payment-Failed';
            order.discount = isValidPayment ? discount : 0;
            order.finalAmount = isValidPayment ? finalAmount : totalPrice + deliveryCharges;
            order.couponApplied = isValidPayment && !!discount;
            order.couponCode = isValidPayment ? couponCode : null;
            order.razorpayPaymentId = razorpay_payment_id;
            order.razorpayOrderId = razorpay_order_id;
            order.invoiceDate = new Date();
        } else {
            const userAddressDoc = await Address.findOne({ userId });
            const selectedAddress = userAddressDoc.address.id(addressId);
            if (!selectedAddress) {
                return res.status(400).json({ success: false, message: 'Invalid address' });
            }
            const clonedAddress = structuredClone(selectedAddress.toObject());

            order = new Order({
                orderId: generateOrderId('SOLEUS'),
                user: userId,
                orderedItems: items,
                totalPrice,
                discount: isValidPayment ? discount : 0,
                finalAmount: isValidPayment ? finalAmount : totalPrice + deliveryCharges,
                address: clonedAddress,
                invoiceDate: new Date(),
                paymentMethod: 'Razorpay',
                paymentStatus: isValidPayment ? 'Completed' : 'Failed',
                status: isValidPayment ? 'Pending' : 'Payment-Failed',
                createdOn: new Date(),
                couponApplied: isValidPayment && !!discount,
                couponCode: isValidPayment ? couponCode : null,
                razorpayPaymentId: razorpay_payment_id,
                razorpayOrderId: razorpay_order_id
            });
        }

        await order.save();

        if (isValidPayment) {
            // Update stock
            for (const item of order.orderedItems) {
                const result = await Product.findByIdAndUpdate(
                    item.product,
                    { $inc: { 'variants.$[elem].stock': -item.quantity } },
                    { arrayFilters: [{ 'elem.sku': item.sku }], new: true }
                );
                if (!result) {
                    throw new Error(`Failed to update stock for product ${item.product}`);
                }
            }

            // Mark coupon as used
            if (couponCode) {
                await Coupon.findOneAndUpdate(
                    { code: couponCode },
                    { $addToSet: { usedBy: userId } }
                );
            }

            // Reward eligible coupon
            await rewardEligibleCoupon(userId, order.finalAmount);

            // Clear cart if not Buy Now or failed payment
            if (!isBuyNowBoolean && !isFailedPayment) {
                await Cart.findOneAndUpdate({ userId }, { $set: { items: [], totalPrice: 0 } }, { new: true });
            }

            if (!isFailedPayment) {
                await User.findByIdAndUpdate(userId, { $push: { orderHistory: order._id } });
            }

            // Clear session data
            req.session.buyNow = null;
            req.session.retryOrder = null;
            req.session.couponDiscount = null;
            req.session.appliedCoupon = null;
            req.session.razorpayOrderDetails = null;

            const redirectUrl = `/order/success?orderId=${order._id}`;
            res.status(200).json({
                success: true,
                message: 'Payment verified and order processed successfully',
                redirectUrl
            });
        } else {
            const failureRedirectUrl = `/order/failure?razorpayOrderId=${razorpay_order_id}&isBuyNow=${isBuyNowBoolean || isFailedPayment}`;
            return res.status(400).json({
                success: false,
                message: 'Invalid payment signature',
                redirectUrl: failureRedirectUrl
            });
        }
    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment'
        });
    }
};

const handlePaymentFailure = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized user' });
        }

        const { razorpayOrderId, isBuyNow, addressId, paymentMethod, orderId } = req.body;
        const isBuyNowBoolean = isBuyNow === 'true' || isBuyNow === true;
        const isFailedPayment = !!orderId;

        if (!req.session.razorpayOrderDetails || req.session.razorpayOrderDetails.razorpayOrderId !== razorpayOrderId) {
            return res.status(400).json({ success: false, message: 'Invalid order details' });
        }

        const { items, totalPrice, deliveryCharges } = req.session.razorpayOrderDetails;

        const userAddressDoc = await Address.findOne({ userId });
        const selectedAddress = userAddressDoc.address.id(addressId);
        if (!selectedAddress) {
            return res.status(400).json({ success: false, message: 'Invalid address' });
        }
        const clonedAddress = structuredClone(selectedAddress.toObject());

        let order;
        if (isFailedPayment) {
            order = await Order.findOne({ orderId, user: userId });
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.status(400).json({ success: false, message: 'Invalid or non-failed order' });
            }

            order.address = clonedAddress;
            order.paymentMethod = paymentMethod;
            order.razorpayOrderId = razorpayOrderId;
            order.paymentStatus = 'Failed';
            order.status = 'Payment-Failed';
            order.discount = 0;
            order.couponApplied = false;
            order.couponCode = null;
        } else {
            order = new Order({
                orderId: generateOrderId('SOLEUS'),
                user: userId,
                orderedItems: items,
                totalPrice,
                discount: 0,
                finalAmount: totalPrice + deliveryCharges,
                address: clonedAddress,
                invoiceDate: new Date(),
                paymentMethod: paymentMethod,
                paymentStatus: 'Failed',
                status: 'Payment-Failed',
                createdOn: new Date(),
                couponApplied: false,
                couponCode: null,
                razorpayOrderId: razorpayOrderId
            });
        }

        await order.save();
        if (!isFailedPayment) {
            await User.findByIdAndUpdate(userId, { $push: { orderHistory: order._id } });
        }

        // Clear all relevant session data
        req.session.razorpayOrderDetails = null;
        req.session.couponDiscount = null;
        req.session.appliedCoupon = null;

        return res.status(200).json({
            success: true,
            message: 'Failed order saved successfully',
            redirectUrl: `/order/failure?razorpayOrderId=${razorpayOrderId}&isBuyNow=${isBuyNowBoolean || isFailedPayment}`
        });
    } catch (error) {
        console.error('Error in handlePaymentFailure:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to handle payment failure'
        });
    }
};


const successPage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if(!userId){
            return res.redirect('/login');
        }

        const {orderId} = req.query;
        if(!orderId) {
            return res.status(400).json({success: false, message: "Order ID is missing"});
        }

        const order = await Order.findById(orderId).populate('orderedItems.product').lean();
        if(!order) {
            return res.status(400).json({success: false, message: 'Order not found'});
        }

        const addressId = order.address;
        const deliveryAddress = order.address;
        if (!deliveryAddress) {
            return res.status(404).json({ success: false, message: 'Delivery address not found' });
        }

        //format order item
        const orderItems = order.orderedItems.map(item => ({
            name: item.product.productName,
            size: item.size,
            quantity: item.quantity,
            price: item.price,
            total: item.price * item.quantity,
            image: item.product.productImage[0] || ''
        }));

        const priceDetails = {
            subtotal: order.totalPrice,
            deliveryCharges: order.totalPrice >= 2500 ? 0 : 99,
            discount: order.discount || 0,
            total: order.finalAmount
        }

        return res.render('user/successOrder', {
            success: true,
            title: 'Success',
            orderNumber: order.orderId,
            orderDate: order.createdOn.toLocaleDateString('en-IN'),
            paymentMethod: order.paymentMethod,
            orderItems,
            priceDetails,
            deliveryAddress,
            status: order.status
        });
    } catch (error) {
        next(error);
    }
};

const failurePage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const { razorpayOrderId, isBuyNow } = req.query;
        const isBuyNowBoolean = isBuyNow === 'true' || isBuyNow === true || !!req.session.buyNow || !!req.session.retryOrder;

        return res.render('user/failureOrder', {
            title: 'Order Failed',
            razorpayOrderId,
            isBuyNow: isBuyNowBoolean
        });
    } catch (error) {
        console.error('Error in failurePage:', error);
        next(error);
    }
};

const retryBuyNowCheckout = async (req, res, next) => {
    try {
        if (!req.session.buyNow) {
            return res.redirect('/cart?error=Buy Now session expired');
        }
        res.redirect('/check-out?buyNow=true');
    } catch (error) {
        console.error('Error in retryBuyNowCheckout:', error);
        next(error);
    }
};

const retryCartCheckout = async (req, res, next) => {
    try {
        const userId = req.session.user;
        const { orderId } = req.query;

        if (orderId) {
            // Handle retry payment for failed order
            const order = await Order.findOne({ orderId, user: userId });
            if (!order || order.paymentStatus !== 'Failed' || order.status !== 'Payment-Failed') {
                return res.redirect('/cart?error=Invalid or non-failed order');
            }
            return res.redirect(`/check-out?orderId=${orderId}`);
        }

        const cart = await Cart.findOne({ userId }).populate('items.productId');
        if (!cart || !cart.items.length) {
            return res.redirect('/cart?error=Your cart is empty.');
        }

        req.session.razorpayOrderDetails = req.session.razorpayOrderDetails || { isBuyNow: false };
        return res.redirect('/check-out');
    } catch (error) {
        console.error('Error in retryCartCheckout:', error);
        next(error);
    }
};

module.exports = {
    loadCheckOut,
    applyCoupon,
    removeCoupon,
    proceedToPayment,
    createRazorpayOrder,
    verifyRazorpayPayment,
    handlePaymentFailure,
    successPage,
    failurePage,
    retryBuyNowCheckout,
    retryCartCheckout
};