const mongoose = require('mongoose');
const { Schema } = mongoose;
const applyProductMiddleware = require('../middlewares/producMiddleware');

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
    type: Schema.Types.ObjectId,
    ref: 'Brand',
    required: true
  },
  category: {
    type: Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  regularPrice: {
    type: Number,
    required: false // Computed from variants
  },
  salePrice: {
    type: Number,
    required: false // Computed from variants
  },
  quantity: {
    type: Number,
    required: true,
    min: 0 // Sum of stock from variants
  },
  productOffer: {
    type: Number,
    default: 0
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
    enum: ['Available', 'Out of stock', 'Discontinued'],
    required: true,
    default: 'Available'
  },
  variants: [{
    size: {
      type: String,
      required: true,
      enum: ['6', '7', '8', '9', '10', '11', '12']
    },
    sku: {
      type: String,
      required: true // Unique within the product
    },
    regularPrice: {
      type: Number,
      required: true
    },
    salePrice: {
      type: Number,
      required: true
    },
    stock: {
      type: Number,
      required: true,
      min: 0
    }
  }]
}, { timestamps: true });


applyProductMiddleware(productSchema);

const Product = mongoose.model('Product', productSchema);

module.exports = Product;