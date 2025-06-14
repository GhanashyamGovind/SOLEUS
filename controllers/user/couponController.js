const User = require('../../models/userSchema');
const Coupon = require('../../models/couponSchema');


const loadCoupon = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if(!userId){
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const today = new Date();

        const coupons = await Coupon.find({
            isListed: true,
            expireOn: { $gt: today },
            $or: [
                {isPublic: true},
                {givenTo: userId}
            ],
            usedBy: { $ne: userId } // user offer use cheythittila
        })

        return res.render('user/coupon', {coupons});
    } catch (error) {
        next(error)
    }
}


module.exports = {
    loadCoupon,
}