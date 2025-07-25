const Wallet = require('../../models/walletSchema');
const User = require('../../models/userSchema');
const Referral = require('../../models/referralSchema');

const loadWallet = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if(!userId){
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const user = await User.findOne({_id: userId});
        const referalOn = await Referral.findOne({isActive: true});
        let wallet = await Wallet.findOne({userId});
        if(!wallet){
           wallet = await Wallet.create({userId: user._id});
           user.walletId = wallet._id;
           await user.save();
        }
        
        const balance = wallet.balance;
        const transactions = wallet.transactions.sort((a, b) => b.createdAt - a.createdAt);
        let totalDebit = transactions.filter((val) => val.type === 'debit').reduce((acc, val) => acc + val.amount, 0);
        let totalCredit = transactions.filter((val) => val.type === 'credit').reduce((acc, val) => acc + val.amount, 0);

        return res.render('user/wallet', {
            on: referalOn,
            referal: user.referralCode,
            balance,
            transactions,
            credit: totalCredit || 0,
            debit: totalDebit || 0
        })
    } catch (error) {
        next(error)
    }
}


module.exports = {
    loadWallet,
}