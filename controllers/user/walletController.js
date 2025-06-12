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
        // console.log(transactions)
        let totalDebit = transactions.filter((val) => val.type === 'debit').reduce((acc, val) => acc + val.amount, 0);
        let totalCredit = transactions.filter((val) => val.type === 'credit').reduce((acc, val) => acc + val.amount, 0);

        return res.render('user/wallet', {
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