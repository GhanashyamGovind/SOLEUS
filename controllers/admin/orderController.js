const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletSchema');


const getAdminOrder = async (req, res, next) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page-1) * limit;
        const totalOrders = await Order.countDocuments();
        const totalPage = Math.ceil(totalOrders / limit);

        const orders = await Order.find({status: {$ne: 'Payment-Failed'}}).populate('user','name').sort({ createdOn: -1 }).skip(skip).limit(limit);
        const options = { day: 'numeric', month: 'short', year: 'numeric' }
        const formattedOrders = orders.map(order => ({
            orderId: order.orderId,
            userName: order.user?.name || "User deleted",
            orderedDate: order.createdOn.toLocaleDateString('en-IN', options),
            paymentMethod: order.paymentMethod,
            totalAmount: order.finalAmount,
            orderStatus: order.status,
            totalItems: order.orderedItems.reduce((acc, item) => acc + item.quantity, 0 ),
            viewLink: `/admin/orders/products/${order.orderId}`, // viewbutton
            returnAlert: order.orderedItems.some((val) => val.returnStatus === 'Requested')
        }));

        return res.render('admin/admin-order', {
            orders: formattedOrders,
            currentPage: page,
            totalPages: totalPage
        });
    } catch (error) {
        next(error)
    }
}

const updateStatus = async (req, res, next) => {
    try {

        const {orderId} = req.params;
        const {status} = req.body;

        const validStatuses = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
        if(!validStatuses.includes(status)) {
            return res.status(400).json({error: 'Invalid status'});
        }

        // Fetch the order first to check its current values
        const order = await Order.findOne({ orderId });

        if (!order) {
            return res.status(404).json({ error: "Order not found" });
        }

        if (status === 'Delivered' && order.paymentStatus === 'Pending' && order.paymentMethod === 'COD') {
            order.status = status;
            order.paymentStatus = 'Completed';
            await order.save();
        } else {
            order.status = status;
            await order.save();
        }

        return res.json({
            orderId: order.orderId,
            orderStatus: order.status,
            paymentStatus: order.paymentStatus
        });

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

const approveReturn = async (req, res, next) => {
    try{

        const {orderId} = req.params;
        const {sku} = req.body;
        if(!sku || !orderId) {
            return res.status(400).json({success: false, message: "Require fields are missing"});
        }

        const orders = await Order.findOne({orderId}).populate('orderedItems.product').exec()
        const userId = orders.user;

        //find the item of the sku
        const item = orders.orderedItems.find(v => v.sku === sku);
        if(!item) {
            return res.status(404).json({success: false, message: `${sku} SKU \n Item not found`})
        }

        //findg the product
        const product = item.product;

        //finding the prodct with sku
        const variant = product.variants.find(v => v.sku === sku);
        if(!variant) {
            return res.status(404).json({success: false, message: `variant of this prodct is missing`})
        }

        //restore stock
        variant.stock += item.quantity;

        //update product stock and status and save
        product.quantity = product.variants.reduce((total, v) => total + v.stock, 0);
        product.status = product.quantity > 0 ? 'Available' : 'Out of stock';
        await product.save();

        //change the status
        item.returnStatus = 'Returned';
        await orders.save();

        //refund
        const totalItemAmount = orders.orderedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
        const shippingCharge = orders.finalAmount - totalItemAmount;
        
        const itemTotal = item.price * item.quantity;
        const proportionalShipping = (itemTotal/totalItemAmount) * shippingCharge;
        let refundAmount = itemTotal + proportionalShipping;

        // coupon apply cheythal ulla return logic
        if (orders.couponApplied && orders.discount > 0) {
            // propotion discount for return item
            console.log("the proprotinadiscount is done");
            const proportionalDiscount = (itemTotal / totalItemAmount) * orders.discount;
            refundAmount = Math.max(0, refundAmount - proportionalDiscount);
        }

        refundAmount = parseFloat(refundAmount.toFixed(2));

        if(orders.paymentMethod === 'Razorpay' || orders.paymentMethod === 'Wallet') {
            const wallet = await Wallet.findOne({userId});
            if (!wallet) {
                return res.status(404).json({ success: false, message: "Wallet not found" });
            }

            wallet.balance += refundAmount;
            wallet.transactions.push({
                type: 'credit',
                amount: refundAmount,
                reason: orders.couponApplied && orders.discount > 0 ? `Refund for returned product SKU: ${sku} (incl. shipping share + coupon share)` : `Refund for returned product SKU: ${sku} (incl. shipping share)`,
                orderId: orders.orderId,
                productId: product._id,
                quantity: item.quantity,
                createdAt: new Date()
            });
            await wallet.save();
        }

        return res.status(200).json({success: true, message: "Return approved product stock updated"})

    } catch (error){
        next(error)
    }
}

const rejectReturn = async (req, res,  next) => {
    try{

        const {orderId} = req.params;
        const {sku} = req.body;
        if(!sku || !orderId) {
            return res.status(400).json({success: false, message: "Require fields are missing"});
        }

        const update = await Order.updateOne(
            {orderId, 'orderedItems.sku': sku},
            {$set: {'orderedItems.$.returnStatus': 'Rejected'}}
        );

        if (update.matchedCount === 0) {
        // No document matched: probably wrong orderId or sku
        return res.status(404).json({ success: false, message: "Order or item not found" });
        }

        if (update.modifiedCount === 0) {
        // Document matched but no changes applied (maybe already rejected)
        return res.status(200).json({ success: true, message: "Return status was already 'Rejected'" });
        }

        return res.status(200).json({ success: true, message: "Return request 'Rejected'" });
        
    } catch (error) {
        next(error)
    }
}


module.exports = {
    getAdminOrder,
    updateStatus,
    getOrderProducts,
    cancellOrder,
    approveReturn,
    rejectReturn,
}