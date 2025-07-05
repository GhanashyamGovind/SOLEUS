const mongoose = require('mongoose');
const {Schema} = mongoose;

const referralSchema = new Schema ({
    isActive: {
         type: Boolean,
         default: false 
    },
    referrerAmount: {
         type: Number, 
         default: 50 
    },
    refereeAmount: {
        type: Number, 
        default: 100 
    }
})

const Referral = mongoose.model('Referral', referralSchema);

module.exports = Referral;