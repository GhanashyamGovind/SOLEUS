const Wallet = require('../../models/walletSchema');


const loadWallet = async (req, res, next) => {
    try {
        const userId = req.session.user;
        if(!userId){
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }

        const wallet = await Wallet.findOne({userId})
        console.log("wallet", wallet)
        
        const balance = wallet.balance;
        const transactions = wallet.transactions
        console.log(transactions)

        return res.render('user/wallet', {
            balance,
            transactions
        })
    } catch (error) {
        next(error)
    }
}


module.exports = {
    loadWallet,
}