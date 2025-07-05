const User = require('../models/userSchema');

const userAuth = (req, res, next) => {
    if(req.session.user){
        User.findById(req.session.user)
        .then(data => {
            if(data && !data.isBlocked){
                next();
            }else{
                delete req.session.user
                if(data.isBlocked) {
                    return res.redirect('/login?authError=blocked');
                }
                return res.redirect('/login');
            }
        })
        .catch(error => {
            res.status(500).send("Internal Server error")
        })
    } else {
        res.redirect('/login')
    }
}


const adminAuth = (req, res, next) => {
    if(req.session.admin) {
        User.findOne({_id: req.session.admin, isAdmin: true})
        .then(data => {
            if(data){
                next();
            }else{
                res.redirect('/admin/login')
            }
        })
        .catch(error => {
            res.status(500).send("Internal Server Error")
        })
    } else {
        res.redirect('/admin/login')
    }

} 

module.exports = {
    userAuth,
    adminAuth
}