const { v4: uuidv4 } = require('uuid');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const Wallet = require('../../models/walletSchema');
const Cart = require('../../models/cartSchema');
const mongoose = require('mongoose')
const { render } = require('ejs');

const loadOrder = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            const error = new Error('User not authenticated');
            error.statusCode = 401;
            throw error;
        }

        if (req.session.failedOrder) {
            delete req.session.failedOrder;
        }

        const { cart, page = 1, limit = 5 } = req.query;
        const pageNum = parseInt(page);
        const limitNum = parseInt(limit);

        if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
            const error = new Error('Invalid page or limit parameters');
            error.statusCode = 400;
            throw error;
        }

        if (cart && cart === 'fromProductFailure') {
            await Cart.findOneAndUpdate(
                { userId },
                { $set: { items: [], totalPrice: 0 } },
                { new: true }
            );
        }

        // Get user
        const user = await User.findById(userId).lean();
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        const orderHistory = user.orderHistory || [];
        if (!orderHistory.length) {
            const response = {
                orders: [],
                totalOrders: 0,
                totalPages: 0,
                currentPage: pageNum
            };
            return req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest'
                ? res.json(response)
                : res.render('user/order', response);
        }

        // Calculate pagination
        const totalOrders = orderHistory.length;
        const totalPages = Math.ceil(totalOrders / limitNum);
        if (pageNum > totalPages && totalPages > 0) {
            const error = new Error('Page not found');
            error.statusCode = 404;
            throw error;
        }

        const reversedOrderHistory = [...orderHistory].reverse()
        const skip = (pageNum - 1) * limitNum;
        const paginatedOrderIds = reversedOrderHistory.slice(skip, skip + limitNum);

        // Fetch paginated orders
        const orders = await Order.find({ _id: { $in: paginatedOrderIds } })
            .populate('orderedItems.product')
            .lean();

        const formattedOrders = orders.map(order => {
            const savedAddress = order.address || {};

            // Images
            const productImages = order.orderedItems.map(item => {
                const product = item.product;
                return product?.productImage?.[0]
                    ? `/uploads/re-image/${product.productImage[0]}`
                    : 'https://via.placeholder.com/80x80?text=Product';
            });

            // Calculate total quantity of items in this order
            const totalItems = order.orderedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

            return {
                orderId: order.orderId || order._id.toString(),
                userName: savedAddress ? `${savedAddress.name || ''}` : 'N/A',
                address: savedAddress
                    ? `${savedAddress.buildingName || ''}, ${savedAddress.landMark || ''}, ${savedAddress.city || ''}, ${savedAddress.state || ''} - ${savedAddress.pincode || ''}`
                    : 'Address not available',
                productImages,
                totalItems,
                totalAmount: order.finalAmount || 0,
                status: order.status || 'Processing',
                trackingAvailable: ['Shipped', 'Delivered'].includes(order.status)
            };
        });

        // Sort orders by creation date (newest first)
        formattedOrders.sort((a, b) => {
            const orderA = orders.find(o => o.orderId === a.orderId);
            const orderB = orders.find(o => o.orderId === b.orderId);
            return new Date(orderB.createdOn || orderB.createdAt) - new Date(orderA.createdOn || orderA.createdAt);
        });

        const response = {
            orders: formattedOrders,
            totalOrders,
            totalPages,
            currentPage: pageNum
        };

        // If request is from AJAX (fetch), return JSON
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json(response);
        }

        // Otherwise, render the page
        return res.render('user/order', response);
    } catch (error) {
        console.error('Error in loadOrder:', error);
        const statusCode = error.statusCode || 500;
        const message = error.message || 'Internal server error';
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(statusCode).json({ success: false, message });
        }
        next(error);
    }
};


const getTrackPage = async (req, res, next) => {
    try {

        const userId = req.session.user;
        if(!userId){
            const error = new Error('Unautherized user');
            error.statusCode = 401;
            throw error;
        }

        if (req.session.recentOrderSuccess) {
            delete req.session.recentOrderSuccess;
            delete req.session.lastOrderId;
        }

        if (req.session.buyNow){
            delete req.session.buyNow
        }

        const {orderId} = req.params;

        const order = await Order.findOne({orderId}).populate('orderedItems.product').lean();
        if(!order) {
            const error = new Error('Page not found');
            error.statusCode = 404;
            throw error;
        }
       
        const getProducts = order.orderedItems.map((item) => {
            return{
                name: item.product.productName,
                image: item.product.productImage,
                sku: item.sku,
                size: item.size,
                quantity: item.quantity,
                price: item.price,
                color: item.color,
                return: item.returnStatus,
                reason: item.returnReason
            }
        });
        
        const address = order.address;

        return res.render('user/track', {
            products: getProducts,
            address,
            order,
        });
    } catch (error) {
        next(error)
    }
}

const cancelOrder = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if (!userId) {
            const error = new Error('Unauthorized user');
            error.statusCode = 401;
            throw error;
        }

        const { orderId } = req.params;

        const order = await Order.findOne({ orderId }).populate('orderedItems.product');
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // Update product stock and status for each ordered item
        for (const item of order.orderedItems) {
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(404).json({ success: false, message: `Product with ID ${item.product} not found` });
            }

            // Find the specific variant
            const variant = product.variants.find(v => v.sku === item.sku);
            if (!variant) {
                return res.status(404).json({ success: false, message: `Variant with SKU ${item.sku} not found in product ${item.product}` });
            }

            // Restore stock
            variant.stock += item.quantity;

            // Update total stock and product status
            product.quantity = product.variants.reduce((total, v) => total + v.stock, 0);
            product.status = product.quantity > 0 ? 'Available' : 'Out of stock';

            await product.save();
        }

        //return money if razor or wallet
        if(order.paymentMethod === 'Razorpay'){
            const wallet = await Wallet.findOne({userId});
            wallet.balance += order.finalAmount;
            wallet.transactions.push({
                type: 'credit',
                amount: order.finalAmount,
                reason: "Razorpay: Order Cancellation",
                orderId: order.orderId,
                createdAt: new Date()
            });
            await wallet.save();
        } else if (order.paymentMethod === 'Wallet'){
            const wallet = await Wallet.findOne({userId});
            wallet.balance += order.finalAmount;
            wallet.transactions.push({
                type: 'credit',
                amount: order.finalAmount,
                reason: "Wallet: Order Cancellation",
                orderId: order.orderId,
                createdAt: new Date()
            })
            await wallet.save()
        }

        // Update order status
        order.status = 'Cancelled';
        await order.save();

        return res.status(200).json({ success: true, message: 'Order cancelled and stock updated' });
    } catch (error) {
        next(error);
    }
};


const returnOrderRequest = async (req, res, next) => {
    try {
        
        const userId = req.session.user;
        if(!userId){
            const error = new Error('Unautherized user');
            error.statusCode(401);
            throw error;
        }

        const {orderId} = req.params;
        const {sku, returnReason} = req.body;

        if(!orderId || !sku || !returnReason){
            return res.status(400).json({success: false, message: "Required fileds are missing"})
        }

        const returnProduct = await Order.findOneAndUpdate(
            {orderId, 'orderedItems.sku': sku },
            {
                $set:{
                    'orderedItems.$.returnStatus': 'Requested',
                    'orderedItems.$.returnReason': returnReason
                }
            },
            {new: true}
        )

        if(!returnProduct){
            return res.status(404).json({success: false, message:'Order or product not found'});
        }

        
        return res.status(200).json({success: true, message: 'Product Return request success'})
    } catch (error) {
        next(error)
    }
}

module.exports = { 
    loadOrder,
    getTrackPage,
    cancelOrder,
    returnOrderRequest,
};