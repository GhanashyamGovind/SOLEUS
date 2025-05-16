const mongoose = require('mongoose');
const {Schema} = mongoose;

const productSchema = new Schema({
    productName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    brand: {
        type: String,
        required: true
    },
    category: {
        type: Schema.Types.ObjectId,
        ref: "Category",
        required: true
    },
    regularPrice: {
        type: Number,
        required: true
    },
    salePrice: {
        type: Number,
        required: true
    },
    productOffer: {
        type: Number,
        default: 0
    },
    quantity:{
        type:  Number,
        required: true
    },
    color: {
        type: String,
        required: true
    },
    productImage: {
        type: [String],
        required: true
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    status: {
        type: String,
        enum: ['Available', 'Out of stock', 'Discontinued'],//only these vallues are valid
        required: true,
        default: "Available"
    },
    size: {
        type: [String],
        required: true,
        enum: ['5', '6', '7', '8', '9', '10', '11', '12']
    }
}, {timestamps: true});


const Product = mongoose.model('Product', productSchema);

module.exports = Product;