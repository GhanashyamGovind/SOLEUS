const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema')


const getAdminOrder = async (req, res, next) => {
    try {

        const orders = await Order.find().populate('user','name').sort({ createdOn: -1 });
        const options = { day: 'numeric', month: 'short', year: 'numeric' }
        const formattedOrders = orders.map(order => ({
            orderId: order.orderId,
            userName: order.user.name,
            orderedDate: order.createdOn.toLocaleDateString('en-IN', options),
            paymentMethod: order.paymentMethod,
            totalAmount: order.finalAmount,
            orderStatus: order.status,
            totalItems: order.orderedItems.reduce((acc, item) => acc + item.quantity, 0 ),
            viewLink: `/admin/orders/${order._id}` // viewbutton
        }))

        return res.render('admin/admin-order', {orders: formattedOrders});
    } catch (error) {
        next(error)
    }
}

const updateStatus = async (req, res, next) => {
    try {

        const {orderId} = req.params;
        const {status} = req.body;

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Returned', 'Canceled'];
        if(!validStatuses.includes(status)) {
            return res.status(400).json({error: 'Invalid status'});
        }

        const order = await Order.findOneAndUpdate(
            {orderId},
            {status},
            {new: true}
        ).select('orderId status');

        if(!order) {
            return res.status(404).json({error: "Order not found"});
        }

        return res.json({ orderId: order.orderId, orderStatus: order.orderStatus });
        
    } catch (error) {
        next(error)
    }
}


module.exports = {
    getAdminOrder,
    updateStatus,
}