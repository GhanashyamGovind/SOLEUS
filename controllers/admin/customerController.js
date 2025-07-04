const User = require('../../models/userSchema');


const customerInfo = async (req, res, next) => {
    try {
 
        const search = req.query.search || ''

        const page = parseInt(req.query.page) || 1;
        const limit = 4
        const skip = (page -1) * limit;

        const searchQuery = {
            isAdmin: false,
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ]
        }

        const userData = await User.find(searchQuery)
            .limit(limit)
            .skip(skip)
            .exec()

        const count = await User.countDocuments(searchQuery);
        const totalPage = Math.ceil(count / limit);
        
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({
                users: userData,
                currentPage: page,
                totalPage: totalPage,
                searchQuery: search
            });
        }

        res.render('admin/customers', {data: userData, totalPage: Array.from({ length: totalPage }, (_, i) => i), currentPage: page-1, searchQuery: search})
        
    } catch (error) {
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(500).json({ error: 'Server error' });
        }
        next(error)
    }
}

const blockAndUnblock = async (req, res, next) => {
    try {
        let id = req.body.id;
        const user =await  User.findById(id)
        if (!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }
        
        await User.updateOne({ _id: id }, { $set: { isBlocked: !user.isBlocked } });
        return res.status(200).json({ 
            status: true, 
            message: `User ${user.isBlocked ? 'unblocked' : 'blocked'} successfully` 
        });
    } catch (error) {
       next(error)
    }
}

const customerDeleted = async (req, res, next) => {
    try {
        let id = req.body.id;
        const user = await User.findById(id);
        if(!user) {
            return res.status(404).json({ status: false, message: 'User not found' });
        }

        await User.deleteOne({ _id: id })
        return res.status(200).json({ status: true, message: 'User deleted successfully' });
    } catch (error) {
        next(error)
    }
}


module.exports = {
    customerInfo,
    customerDeleted,
    blockAndUnblock,
}