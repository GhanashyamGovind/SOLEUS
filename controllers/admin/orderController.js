const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');


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
            viewLink: `/admin/orders/products/${order.orderId}` // viewbutton
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

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Returned', 'Cancelled'];
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

const getOrderProducts = async (req, res, next) => {
    try {
        const {orderId} = req.params;
        console.log(orderId);

        const order = await Order.findOne({orderId}).populate('orderedItems.product').lean();

        const getProducts = order.orderedItems.map(item => {
            return{
                name: item.product.productName,
                image: item.product.productImage,
                size: item.size,
                sku: item.sku,
                quantity: item.quantity,
                price: item.price,
                color: item.color,
                return: item.returnStatus,
                reason: item.returnReason
            }
        })

        console.log("admin side ", getProducts);

        const address = order.address; 
        console.log(address)

        return res.render('admin/order-info', {
            products: getProducts,
            address,
            order
        });
    } catch (error) {
        next(error)
    }
}

const cancellOrder = async (req, res, next) => {
    try {
        const {status} = req.body;
        const {orderId} = req.params;

        const order = await Order.findOne({orderId}).populate('orderedItems.product');
        if(!order){
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        //update product stock and status
        for(const item of order.orderedItems){
            const product = await Product.findById(item.product);
            if (!product) {
                return res.status(404).json({ success: false, message: `Product with ID ${item.product} not found` });
            }

            //find the variants
            const variant = product.variants.find(v => v.sku === item.sku);
            if (!variant) {
                return res.status(404).json({ success: false, message: `Variant with SKU ${item.sku} not found in product ${item.product}` });
            }

            //resoter stock
            variant.stock += item.quantity;

            //update product status and total stock
            product.quantity = product.variants.reduce((total, v) => total + v.stock, 0);
            product.status = product.quantity > 0 ? 'Available' : 'Out of stock';

            await product.save();
        }

        //update status
        order.status = status;
        await order.save();

        return res.status(200).json({ success: true, message: 'Order cancelled and stock updated' });
    } catch (error) {
        next(error)
    }
}


module.exports = {
    getAdminOrder,
    updateStatus,
    getOrderProducts,
    cancellOrder,
}