const { v4: uuidv4 } = require('uuid');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
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

        // Get user
        const user = await User.findById(userId).lean();
        if (!user) {
            const error = new Error('User not found');
            error.statusCode = 404;
            throw error;
        }

        const orderHistory = user.orderHistory || [];
        if (!orderHistory.length) {
            return res.render('user/order', {
                orders: [],
                totalOrders: 0
            });
        }

        // Fetch all orders in orderHistory
        const orders = await Order.find({ _id: { $in: orderHistory } })
            .populate('orderedItems.product')
            .lean();

        const totalOrders = orders.length;

        const formattedOrders = orders.map(order => {
            const savedAddress = order.address || {};

            // Get the first product's image (if available)
            const firstProduct = order.orderedItems[0]?.product || {};
            const productImage = firstProduct.productImage?.[0]
                ? `/Uploads/re-image/${firstProduct.productImage[0]}`
                : 'https://via.placeholder.com/80x80?text=Product';

            // Calculate total quantity of items in this order
            const totalItems = order.orderedItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

            return {
                orderId: order.orderId || order._id.toString(),
                userName: savedAddress ? `${savedAddress.name || ''}` : 'N/A',
                address: savedAddress
                    ? `${savedAddress.buildingName || ''}, ${savedAddress.landMark || ''}, ${savedAddress.city || ''}, ${savedAddress.state || ''} - ${savedAddress.pincode || ''}`
                    : 'Address not available',
                productImage,
                totalItems,
                totalAmount: order.finalAmount || order.totalPrice || 0,
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

        return res.render('user/order', {
            orders: formattedOrders,
            totalOrders
        });
    } catch (error) {
        console.error('Error in loadOrder:', error);
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

        const {orderId} = req.params;

        const order = await Order.findOne({orderId}).populate('orderedItems.product').lean();
        // console.log("specific producd ::::::=====> \n", order)
       

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

        // console.log("get products:::======> \n",getProducts)
        


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