const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const {v4: uuidv4} = require('uuid')


const loadCheckOut = async (req, res, next) => {
    try {
        const userId = req.session.user;
        console.log('User ID:', userId);

        if (!userId) {
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
            if (!product) {
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
                if (!product || !product.variants || !product.variants.length) {
                    console.warn(`Product not found or has no variants: ${item.productId}`);
                    return null;
                }

                const variant = product.variants.find(v => v.size === item.size && v.color === item.color);
                if (!variant) {
                    console.warn(`Variant not found for product ${product.productName}, size: ${item.size}, color: ${item.color}`);
                    return null;
                }

                return {
                    name: product.productName,
                    size: item.size,
                    color: variant.color || product.color || 'N/A',
                    quantity: item.quantity,
                    price: variant.salePrice,
                    total: variant.salePrice * item.quantity,
                    image: product.productImage && product.productImage.length > 0 ? product.productImage[0] : null
                };
            }).filter(item => item !== null);

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
            isBuyNow
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
        if (!['razorpay', 'cod', 'wallet'].includes(paymentMethod)) {
            return res.status(400).json({ success: false, message: 'Invalid payment method' });
        }

        // Handle Razorpay and Wallet (not implemented)
        if (paymentMethod === 'razorpay' || paymentMethod === 'wallet') {
            return res.status(501).json({
                success: false,
                message: `Payment method ${paymentMethod} is not implemented yet. Order will be created after payment confirmation.`
            });
        }

        // Handle COD
        let order;
        if (isBuyNow && req.session.buyNow) {
            // Handle Buy Now for COD
            const { productId, size, sku, quantity, price } = req.session.buyNow;
            const product = await Product.findById(productId);
            if (!product) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            const variant = product.variants.find(v => v.sku === sku && v.size === size);
            if (!variant) {
                req.session.buyNow = null;
                return res.status(404).json({ success: false, message: 'Invalid size or SKU' });
            }

            if (variant.stock < quantity) {
                return res.status(400).json({ success: false, message: 'Insufficient stock' });
            }

            const totalPrice = price * quantity;
            const deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            const discount = req.session.couponDiscount || 0;
            const finalAmount = totalPrice + deliveryCharges - discount;

            order = new Order({
                orderId: uuidv4(),
                userId,
                orderedItems: [{
                    product: productId,
                    size,
                    sku,
                    quantity,
                    price
                }],
                totalPrice,
                discount,
                finalAmount,
                address: addressId,
                invoiceDate: new Date(),
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

            const items = cart.items.map(item => {
                const variant = item.productId.variants.find(v => v.size === item.size && v.sku === item.sku);
                if (!variant) {
                    throw new Error(`Invalid variant for product ${item.productId.productName}`);
                }
                if (variant.stock < item.quantity) {
                    throw new Error(`Insufficient stock for ${item.productId.productName} (Size: ${item.size})`);
                }

                return {
                    product: item.productId._id,
                    size: item.size,
                    sku: variant.sku,
                    quantity: item.quantity,
                    price: variant.salePrice
                };
            });

            const totalPrice = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const deliveryCharges = totalPrice >= 2500 ? 0 : 99;
            const discount = req.session.couponDiscount || 0;
            const finalAmount = totalPrice + deliveryCharges - discount;

            order = new Order({
                orderId: uuidv4(),
                userId,
                orderedItems: items,
                totalPrice,
                discount,
                finalAmount,
                address: addressId,
                invoiceDate: new Date(),
                status: 'Pending',
                createdOn: new Date(),
                couponApplied: !!discount
            });
            await order.save();

            // Add order to user's orderHistory
            await User.findByIdAndUpdate(userId, { $push: { orderHistory: order._id } });

            await Cart.findOneAndUpdate({ userId }, { items: [], totalAmount: 0 });
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

        // Redirect to success page for COD
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
        const findAddress = await Address.findOne(
            {"address._id": addressId},
            {"address.$": 1 }
        ).lean();
        const deliveryAddress = findAddress?.address?.[0];
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
            orderData: order.createdOn.toLocaleDateString('en-IN'),
            paymentMethod: order.paymentMethod || 'COD',
            orderItems,
            priceDetails,
            deliveryAddress,
            status: order.status
        })

    } catch (error) {
        next(error)
    }
}



module.exports = {
    loadCheckOut,
    proceedToPayment,
    successPage,
}