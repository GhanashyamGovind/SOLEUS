const Coupon = require('../../models/couponSchema');
const Referral = require('../../models/referralSchema')

const getAdminCoupon = async (req, res, next) => {
    try {
        const coupons = await Coupon.find().sort({createdOn: -1})
        res.render('admin/add-coupon.ejs', {coupons});
    } catch (error) {
        next(error)
    }
}

const addCoupon = async (req, res, next) => {
    try {
        const {
            code,
            name,
            offerPrice,
            discountType,
            minPurchase,
            expireOn,
            isPublic,
            rewardThreshold,
            isListed
        } = req.body;

        if (!code || !name || offerPrice === undefined || !discountType || !minPurchase || !expireOn) {
            return res.status(400).json({ success: false, message: 'All required fields must be provided' });
        }

        if (!['fixed', 'percentage'].includes(discountType)) {
            return res.status(400).json({ success: false, message: 'Invalid discount type. Must be "fixed" or "percentage"' });
        }

        // Validate offerPrice
        if (offerPrice < 0) {
            return res.status(400).json({ success: false, message: 'Offer price cannot be negative' });
        }
        if (discountType === 'percentage' && (offerPrice <= 0 || offerPrice > 100)) {
            return res.status(400).json({ success: false, message: 'Percentage discount must be between 0 and 100' });
        }

        const existCoupn = await Coupon.findOne({code: code.trim().toUpperCase()});
        if(existCoupn){
            return res.status(409).json({success: false, message: "This offer already exist"})
        }

        const coupon = new Coupon({
            code: code.trim().toUpperCase(),
            name: name.trim(),
            expireOn,
            offerPrice,
            discountType,
            minimumPrice: minPurchase,
            isPublic: isPublic || false,
            rewardThreshold: rewardThreshold || 0,
            isListed: isListed !== undefined ? isListed : true
        })

        await coupon.save();
        return res.status(200).json({success: true, message: "Coupon created"})
    } catch (error) {
        next(error)
    }
}

const getEditCoupon = async (req, res, next) => {
    try {
        const { code } = req.params;
        const coupon = await Coupon.findOne({ code: code.trim().toUpperCase() });
        if (!coupon) {
            return res.status(404).json({ message: 'Coupon not found' });
        }
        res.json(coupon);
    } catch (error) {
        next(error)
    }
};

const editCoupon = async (req, res, next) => {
    try {
        const { code: originalCode } = req.params;
        const {
            code: newCode,
            name,
            offerPrice,
            discountType,
            minPurchase,
            expireOn,
            isPublic,
            rewardThreshold,
            isListed
        } = req.body;

        if (!newCode || !name || offerPrice === undefined || !discountType || minPurchase === undefined || !expireOn) {
            return res.status(400).json({ success: false, message: 'All required fields must be provided' });
        }

        if (!['fixed', 'percentage'].includes(discountType)) {
            return res.status(400).json({ success: false, message: 'Invalid discount type' });
        }

        if (offerPrice < 0) {
            return res.status(400).json({ success: false, message: 'Offer price cannot be negative' });
        }
        if (discountType === 'percentage' && (offerPrice <= 0 || offerPrice > 100)) {
            return res.status(400).json({ success: false, message: 'Percentage discount must be between 0 and 100' });
        }

        if (minPurchase < 0) {
            return res.status(400).json({ success: false, message: 'Minimum purchase amount cannot be negative' });
        }

        // Find the existing coupon
        const existingCoupon = await Coupon.findOne({ code: originalCode.toUpperCase() });
        if (!existingCoupon) {
            return res.status(404).json({ success: false, message: 'Coupon not found' });
        }

        // Check if newCode is unique only if it has changed
        if (newCode.toUpperCase() !== existingCoupon.code.toUpperCase()) {
            const codeExists = await Coupon.findOne({ code: newCode.toUpperCase() });
            if (codeExists) {
                return res.status(409).json({ success: false, message: 'This coupon code already exists' });
            }
        }

        // Check for name uniqueness
        if (name.trim() !== existingCoupon.name.trim()) {
            const nameExists = await Coupon.findOne({ name: name.trim() });
            if (nameExists) {
                return res.status(409).json({ success: false, message: 'Coupon name already exists' });
            }
        }

        // Update coupon
        const updatedCoupon = await Coupon.findOneAndUpdate(
            { code: originalCode.toUpperCase() },
            {
                code: newCode.toUpperCase(),
                name: name.trim(),
                offerPrice,
                discountType,
                minimumPrice: minPurchase,
                expireOn,
                isPublic,
                rewardThreshold: rewardThreshold || 0,
                isListed: isListed !== undefined ? isListed : existingCoupon.isListed
            },
            { new: true, runValidators: true }
        );

        res.status(200).json({
            success: true,
            message: 'Coupon updated successfully',
            coupon: updatedCoupon
        });
    } catch (error) {
        next(error)
    }
}

const listAndUnlit = async (req, res, next) => {
    try {
        const {code} = req.params;
        
        const coupon = await Coupon.findOne({code: code.trim().toUpperCase()});
        if(!coupon){
            return res.status(404).json({success: false, message: "Coupon is not found"})
        }

        coupon.isListed === true ? coupon.isListed = false :  coupon.isListed = true;

        await coupon.save();
        return res.status(200).json({success: true, message: `Coupon is ${coupon.isListed === true ? 'listed' : 'unlisted'}`})
    } catch (error) {
        next(error)
    }
}

const deleteCoupon = async (req, res, next) => {
    try {
        const {code} = req.params;

        const deleted = await Coupon.deleteOne({code: code.trim().toUpperCase()});
        if(!deleted) {
            return res.status(404).json({success: false, message: "Unable to delete this order"})
        }

        return res.status(200).json({success: true, message: "Coupen deleted"});
    } catch (error) {
        
    }
}

const getReferral = async (req, res, next) => {
    try {

        let settings = await Referral.findOne();
        if(!settings) settings = await Referral.create({});
        
        return res.render('admin/referral', {settings})
    } catch (error) {
        next(error)
    }
}

const editReferral = async (req, res, next) => {
    try {
        const { referrerAmount, refereeAmount } = req.body;
        let settings = await Referral.findOne();
        if (!settings) settings = new Referral();
        settings.referrerAmount = parseInt(referrerAmount) || 50;
        settings.refereeAmount = parseInt(refereeAmount) || 100;
        const saveReferralAmounts = await settings.save(); 
        if(!saveReferralAmounts) {
            return res.status(400).json({success: false, message: "Unable to change the save"})
        }

        return res.status(200).json({success: true, message: "Referal Updated"})
    } catch (error) {
        next(error)
    }
}

const onAndOff = async (req, res, next) => {
    try {
        const  { isActive } = req.body;
        let settings = await Referral.findOne();
        if (!settings) settings = new Referral();
        settings.isActive = isActive;
        const savedReferral = await settings.save();
        if (!savedReferral) {
        return res.status(400).json({ success: false, message: "Unable to toggle referral program" });
        }
        return res.status(200).json({ success: true, message: "Referral program toggled" });
    } catch (error) {
        next(error)
    }
}



module.exports = {
    getAdminCoupon,
    addCoupon,
    getEditCoupon,
    editCoupon,
    listAndUnlit,
    deleteCoupon,
    getReferral,
    editReferral,
    onAndOff,
}