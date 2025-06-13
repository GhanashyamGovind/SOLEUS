const mongoose = require('mongoose');
const {Schema} = mongoose;


const couponSchema = new Schema({
    code:{
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
    },
    name: {
        type: String,
        required: true,
        unique: true
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    expireOn: {
        type: Date,
        required: true
    },
    offerPrice: { // coupn discount
        type: Number,
        required: true
    },
    discountType: {
        type: String,
        required: true,
        enum: ['fixed', 'percentage'],
        default: 'fixed'
    },
    minimumPrice: { // apply cheyyan minimum venda amount
        type: Number,
        required: true
    },
    isPublic: {
    type: Boolean,
    default: false  // if true, show to all users
    },
    rewardThreshold: {  //Does user need to shop above X to get it
    type: Number,
    default: 0  // 0 means no condition
    },
    usedBy: [{
        type: Schema.Types.ObjectId,
        ref: 'User'
    }],
    givenTo: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
    }],
    isListed: {
        type: Boolean,
        default: true
    }
});


const Coupon = mongoose.model('Coupon', couponSchema)

module.exports = Coupon;