const mongoose = require('mongoose');
const {Schema} = mongoose;
const {v4: uiidv4} = require('uuid')// to genreate unq  id - this is an order so ceach one have unq id that why we use this

const orderSchema = new Schema({
    orderId: {
        type: String,
        default: () => uiidv4(),
        unique: true
    },
    orderedItems: [{
        product: {
            type: Schema.Types.ObjectId,
            ref:'Product',
            require: true
        },
        quantity: {
            type: Number,
            required: true
        },
        price: {
            type: Number,
            default: 0
        }
    }],
    totalPrice: {
        type: Number,
        required: true
    },
    discount: {
        type: Number,
        default: 0,
    },
    finalAmount: {
        type: Number,
        required: true
    },
    address: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }, 
    invoiceDate: {
        type: Date,
    },
    status: {
        type: String,
        required: true,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Return Request', 'Returned'] // enum only allow specific roles
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    couponApplied: {
        type: Boolean, 
        default: false
    }

})


const Order = mongoose.model('Order', orderSchema);

module.exports = Order;