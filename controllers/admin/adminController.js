const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const bcrypt = require("bcrypt");


//load-Login
const loadLogin = async (req, res, next) => {
    try {
        if(req.session.admin){
            return res.redirect('/admin')
        }else{
         res.render('admin/admin-login', {message: null})
        }
    } catch (error) {
        next(error)
    }
}

// submit-login
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });
        console.log(admin);

        if (!admin) {
            return res.render('admin/admin-login', { message: "Enter the proper email" });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            return res.render('admin/admin-login', { message: "Wrong password" });
        }

        req.session.admin = admin._id;
        return res.redirect('/admin');
    } catch (error) {
        next(error);
    }
}

//loadDashboard

const loadDashboard = async (req, res, next) =>{
    try {
        if(req.session.admin){
            return res.render('admin/dashboard')
        } else{
            return res.redirect('/admin/login')
        }
    } catch (error) {
        next(error)
    }
}

//logOut
const logout = async (req, res, next) => {
    try {
        delete req.session.admin;
        res.clearCookie(req.sessionID)
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        return  res.redirect('/admin/login');
    } catch (error) {
        next(error)
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