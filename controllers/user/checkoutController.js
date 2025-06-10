const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const {v4: uuidv4} = require('uuid');
const crypto = require('crypto');
const Razorpay = require('razorpay');


function generateOrderId(shopName) {
  const digits = () => Math.floor(1000 + Math.random() * 9000);         // 4 random digits
  const letters = () => Math.random().toString(36).substring(2, 5);     // 3 random lowercase letters
  const moreDigits = () => Math.floor(100 + Math.random() * 900);       // 3 random digits

  return `${digits()}${letters()}${moreDigits()}${shopName}`;
}

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
})


const loadCheckOut = async (req, res, next) => {
    try {
        const userId = req.session.user;
        console.log('User ID:', userId);

        if (!userId) {
            return res.redirect('/login');
        }

        const user = await User.findById(userId).select('name email phone');
        if (!user) {
            req.session.user = null; // Clear invalid session
            return res.redirect('/login');
        }

        const { buyNow } = req.query;
        const isBuyNow = buyNow === 'true' && req.session.buyNow;
        const addressDoc = await Address.findOne({ userId });
        const address = addressDoc && addressDoc.address.length > 0 ? addressDoc.address : null;
        console.log('Addresses:', address);

        let cartItems = [];
        let priceDetails = {
            subtotal: 0,
            deliveryCharges: 0,
            discount: 0,
            totalAmount: 0,
            itemCount: 0
        };

        if (isBuyNow) {
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
            if (!variant) {
                req.session.buyNow = null;
                return res.redirect('/cart?error=Invalid size or SKU');
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
            priceDetails.discount = 0;
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
                if (!variant) {
                    console.warn(`Variant not found for product ${product.productName}, size: ${item.size}, sku: ${item.sku}`);
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
                console.log('No valid items in cart after filtering blocked products');
                return res.redirect('/cart?error=All items in your cart are unavailable or blocked');
            }

            priceDetails.subtotal = cartItems.reduce((sum, item) => sum + item.total, 0);
            priceDetails.deliveryCharges = priceDetails.subtotal >= 2500 ? 0 : 99;
            priceDetails.discount = 0;
            priceDetails.totalAmount = priceDetails.subtotal + priceDetails.deliveryCharges - priceDetails.discount;
            priceDetails.itemCount = cartItems.length;
        }

        return res.render('user/checkout', {
            title: 'Check Out',
            address,
            cartItems,
            priceDetails,
            isBuyNow,
            user
        });
    } catch (error) {
        console.error('Error in loadCheckOut:', error);
        next(error);
    }
};


const proceedToPayment = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized user' });
        }

        const { isBuyNow, addressId, paymentMethod } = req.body;
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

        // Handle Wallet (not implemented)
        if (paymentMethod === 'Wallet') {
            return res.status(501).json({
                success: false,
                message: 'Payment method Wallet is not implemented yet'
            });
        }

        const userAddressDoc = await Address.findOne({ userId });
        const selectedAddress = userAddressDoc.address.id(addressId);
        const clonedAddress = structuredClone(selectedAddress.toObject());

        let order;
        if (isBuyNow && req.session.buyNow) {
            // Handle Buy Now for COD
            const { productId, size, sku, quantity, price } = req.session.buyNow;
            const product = await Product.findById(productId);
            if (!product || product.isBlocked) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Product not found or blocked' });
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Invalid size or SKU' });
            }

            if (variant.stock < quantity) {
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }

            const color = product.color;

            const totalPrice = price * quantity;
            const deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            const discount = req.session.couponDiscount || 0;
            const finalAmount = totalPrice + deliveryCharges - discount;

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
                couponApplied: !!discount
            });

            await order.save();

            // Add order to user's orderHistory
            await User.findByIdAndUpdate(userId, { $push: { orderHistory: order._id } });

            req.session.buyNow = null;
            req.session.couponDiscount = null;
        } else {
            // Handle cart-based payment for COD
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
                    message: 'All items in your cart are unavailable or blocked'
                });
            }

            // Optionally, remove invalid items from the cart
            if (invalidItems.length > 0) {
                await Cart.findOneAndUpdate(
                    { userId },
                    { $pull: { items: { _id: { $in: invalidItems.map(item => item._id) } } } }
                );
            }

            const totalPrice = validItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            const discount = req.session.couponDiscount || 0;
            const finalAmount = totalPrice + deliveryCharges - discount;

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
                couponApplied: !!discount
            });
            await order.save();
            
            // user ne order to user's orderHistory (ith njn first cheyyan marann poy so histroy first kittiyila)
            await User.findByIdAndUpdate(userId, { $push: { orderHistory: order._id } });

            await Cart.findOneAndUpdate({ userId }, { items: [], totalPrice: 0 });
            req.session.couponDiscount = null;
        }

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

        const redirectUrl = `/order/success?orderId=${order._id}`;
        console.log(`Order created: ${order._id}, Payment Method: COD, Redirecting to: ${redirectUrl}`);

        res.status(200).json({
            success: true,
            message: 'Order placed successfully',
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

        const { isBuyNow, addressId } = req.body;
        if (!addressId) {
            return res.status(400).json({ success: false, message: 'Please select a shipping address' });
        }

        let totalPrice, deliveryCharges, discount, finalAmount, items;

        if (isBuyNow && req.session.buyNow) {
            const { productId, size, sku, quantity, price } = req.session.buyNow;
            const product = await Product.findById(productId);
            if (!product || product.isBlocked) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Product not found or blocked' });
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Invalid size or SKU' });
            }

            if (variant.stock < quantity) {
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }

            totalPrice = price * quantity;
            deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            discount = req.session.couponDiscount || 0;
            finalAmount = totalPrice + deliveryCharges - discount;

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
                    message: 'All items in your cart are unavailable or blocked'
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
            finalAmount = totalPrice + deliveryCharges - discount;
        }

        const options = {
            amount: Math.round(finalAmount * 100), // Convert to paise
            currency: 'INR',
            receipt: `order_${generateOrderId('SOLEUS')}`
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Store order details in session
        req.session.razorpayOrderDetails = {
            isBuyNow,
            addressId,
            items,
            totalPrice,
            deliveryCharges,
            discount,
            finalAmount,
            razorpayOrderId: razorpayOrder.id
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
            paymentMethod
        } = req.body;

        if (!req.session.razorpayOrderDetails || req.session.razorpayOrderDetails.razorpayOrderId !== razorpay_order_id) {
            return res.status(400).json({ success: false, message: 'Invalid order details' });
        }

        // Verify payment signature
        const generatedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(razorpay_order_id + '|' + razorpay_payment_id)
            .digest('hex');

        if (generatedSignature !== razorpay_signature) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        const { items, totalPrice, deliveryCharges, discount, finalAmount } = req.session.razorpayOrderDetails;

        const userAddressDoc = await Address.findOne({ userId });
        const selectedAddress = userAddressDoc.address.id(addressId);
        const clonedAddress = structuredClone(selectedAddress.toObject());

        // Create order
        const order = new Order({
            orderId: generateOrderId('SOLEUS'),
            user: userId,
            orderedItems: items,
            totalPrice,
            discount,
            finalAmount,
            address: clonedAddress,
            invoiceDate: new Date(),
            paymentMethod: 'Razorpay',
            paymentStatus: 'Completed',
            status: 'Pending',
            createdOn: new Date(),
            couponApplied: !!discount,
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id
        });

        await order.save();
        await User.findByIdAndUpdate(userId, { $push: { orderHistory: order._id } });

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

        // Clear cart if not Buy Now
        if (!isBuyNow) {
            await Cart.findOneAndUpdate({ userId }, { items: [], totalPrice: 0 });
        }

        // Clear session data
        req.session.buyNow = null;
        req.session.couponDiscount = null;
        req.session.razorpayOrderDetails = null;

        const redirectUrl = `/order/success?orderId=${order._id}`;
        res.status(200).json({
            success: true,
            message: 'Payment verified and order placed successfully',
            redirectUrl
        });
    } catch (error) {
        console.error('Error verifying Razorpay payment:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to verify payment'
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

        //order
        const order = await Order.findById(orderId).populate('orderedItems.product').lean();

        if(!order) {
            return res.status(400).json({success: false, message: 'Order not found'});
        }

        const addressId = order.address;
        console.log("first", order.address)

        //delivery address
        const findAddress = order.address
        const deliveryAddress = findAddress;
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

        //format price detials
        const priceDetails = {
            subtotal: order.totalPrice,
            deliveryCharges: order.totalPrice >= 2500 ? 0 : 99,
            dicount: order.discount || 0,
            total: order.finalAmount
        }

        return res.render('user/successOrder', {
            success: true,
            title: 'success',
            orderNumber: order.orderId,
            orderDate: order.createdOn.toLocaleDateString('en-IN'),
            paymentMethod: order.paymentMethod,
            orderItems,
            priceDetails,
            deliveryAddress,
            status: order.status
        })

    } catch (error) {
        next(error)
    }
}

const failurePage = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            return res.redirect('/login');
        }

        const { razorpayOrderId } = req.query;

        return res.render('user/failureOrder', {
            title: 'Order Failed',
            razorpayOrderId
        });
    } catch (error) {
        console.error('Error in failurePage:', error);
        next(error);
    }
};



module.exports = {
    loadCheckOut,
    proceedToPayment,
    createRazorpayOrder,
    verifyRazorpayPayment,
    successPage,
    failurePage,
}