const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require("bcrypt");


//load-Login
const loadLogin = async (req, res) => {
    try {
        if(req.session.admin){
            return res.redirect('/admin')
        }else{
         res.render('admin/admin-login', {message: null})
        }
    } catch (error) {
        
    }
}

// submit-login
const login = async (req, res) => {
    try{
        const {email, password} = req.body;
        const admin = await User.findOne({email, isAdmin: true});
        console.log(admin)

        if(admin){
            const passwordMatch = await bcrypt.compare(password, admin.password);

            if(passwordMatch){
                // console.log("password is  matching")
                req.session.admin = admin._id;
                return res.redirect('/admin');
            }else {
                return res.redirect('/admin/login');
                console.log("password is not matching")
            }

        }

    }catch (error){
        console.error('Login error => ', error);
        return res.redirect('/admin/pageerror')
    }
}

//loadDashboard

const loadDashboard = async (req, res) =>{
    try {
        if(req.session.admin){
            return res.render('admin/dashboard')
        } else{
            return res.redirect('/admin/login')
        }
    } catch (error) {
        console.error("error in loading the admin dashboard", error)
        return res.redirect('/admin/pageerror')
    }
}

//logOut
const logout = async (req, res) => {
    try {
        req.session.destroy(err => {
            if(err){
                console.error("Error while deleting the session in the admin side =====> ", err)
                return res.redirect('/admin/pageeror')
            }
                console.log("session is deleted")
             return  res.redirect('/admin/login');
        })
    } catch (error) {
        console.error("error in logout", error);
        return res.redirect('/admin/pageeror');
    }
}


//pageerror
const pageerror = async (req, res) =>{
    res.render('admin/page-404')
}



module.exports = {
    loadLogin,
    login,
    loadDashboard,
    pageerror,
    logout,
}