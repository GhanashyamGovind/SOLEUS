const { v4: uuidv4 } = require('uuid');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');

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
        console.log('Fetched orders:', orders);

        // // Fetch all relevant addresses
        // const addressIds = orders
        //     .map(order => order.address)
        //     .filter(id => id); // Ensure valid ObjectIds
        // let addressDocs = [];
        // if (addressIds.length > 0) {
        //     addressDocs = await Address.aggregate([
        //         { $unwind: '$address' }, // Unwind the address array
        //         { $match: { 'address._id': { $in: addressIds } } }, // Match address subdocuments
        //         { $project: { address: 1, _id: 0 } } // Project only the address subdocument
        //     ]).exec();
        // }
        // console.log('Address IDs:', addressIds);
        // console.log('Address Docs:', addressDocs);

        // // Map addressId to address details for quick lookup
        // const addressMap = new Map();
        // addressDocs.forEach(doc => {
        //     if (doc.address) {
        //         addressMap.set(doc.address._id.toString(), doc.address);
        //     }
        // });
        // console.log('Address Map:', addressMap);

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

module.exports = { loadOrder };