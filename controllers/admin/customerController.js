const User = require('../../models/userSchema');


const customerInfo = async (req, res) => {
    try {
        console.log("Accessing customerrInfo rout")

        let search ="";
        if(req.query.search) {
            search = req.query.search;
        }

        let page = 1;
        if(req.query.page) {
            page = parseInt(req.query.page);
        }

        const limit = 4;
        const userData = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex : ".*" + search + ".*" } },
                { email: { $regex: ".*" + search + ".*" } }
            ],
        })
        .limit(limit*1)
        .skip((page-1)*limit)
        .exec();

        const count = await User.find({
            isAdmin: false,
            $or: [
                { name: { $regex : ".*" + search + ".*" } },
                { email: { $regex: ".*" + search + ".*" } }
            ],
        }).countDocuments();

        const totalPage = Math.ceil(count / limit); // total page calculate cheythu
        const totalPageArray = Array.from({ length: totalPage}, (_, i) => i) // array undakkunu

        // console.log("rendering user data => ", userData)
        res.render('admin/customers', {data: userData, totalPage: totalPageArray, currentPage: page-1})
        
    } catch (error) {
        
    }
}


const customerBlocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id}, {$set: { isBlocked: true } });
        return res.redirect('/admin/users');
    } catch (error) {
        return res.redirect('/admin/pageerror');
    }
}


const customerunBlocked = async (req, res) => {
    try {
        let id = req.query.id;
        await User.updateOne({ _id: id }, {$set: { isBlocked: false } });
        // console.log(id)
        return res.redirect('/admin/users');
    } catch (error) {
        return res.redirect('/admin/pageerror');
    }
}

const customerDeleted = async (req, res) => {
    try {
        let id = req.query.id;
        await User.deleteOne({_id: id});
        return res.redirect('/admin/users');
    } catch (error) {
        console.error("error while deleting the user => ", error)
        return res.redirect('/admin/pageerror');
    }
}


module.exports = {
    customerInfo,
    customerBlocked,
    customerunBlocked,
    customerDeleted,
}