const User = require('../../models/userSchema');


const customerInfo = async (req, res, next) => {
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
        next(error)
    }
}


const blockAndUnblock = async (req, res, next) => {
    try {
        let id = req.query.id;
        const user =await  User.findById(id)

        if(user.isBlocked){
            await User.updateOne({ _id: id}, {$set: { isBlocked: false } });
        } else {
            await User.updateOne({ _id: id}, {$set: { isBlocked: true } });
        }
        
        return res.redirect('/admin/users');
    } catch (error) {
       next(error)
    }
}


// const customerunBlocked = async (req, res, next) => {
//     try {
//         let id = req.query.id;
//         await User.updateOne({ _id: id }, {$set: { isBlocked: false } });
//         // console.log(id)
//         return res.redirect('/admin/users');
//     } catch (error) {
//         next(error)
//     }
// }



const customerDeleted = async (req, res, next) => {
    try {
        let id = req.query.id;
        await User.deleteOne({_id: id});
        return res.redirect('/admin/users');
    } catch (error) {
        next(error)
    }
}


module.exports = {
    customerInfo,
    // customerBlocked,
    // customerunBlocked,
    customerDeleted,
    blockAndUnblock,
}