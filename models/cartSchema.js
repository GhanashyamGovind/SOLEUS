const mongoose = require('mongoose');
const { Schema } = mongoose;

const cartSchema = new Schema({
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,

    },
    items: [{
        productId: {
            type: Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true,
            min: 0 
        },
        size: {
            type: String,
            required: true // Store the selected size, which should match the Product schema's size enum
        },
        sku: {
            type: String,
            required: true
        }
    }],
    totalPrice: {
        type: Number,
        default: 0 
    }
}, { timestamps: true }); 

// Pre-save hook to calculate totalPrice
cartSchema.pre('save', function(next) {
    this.totalPrice = this.items.reduce((total, item) => total + (item.price * item.quantity), 0);
    next();
});

const Cart = mongoose.model('Cart', cartSchema);

module.exports = Cart;