const env = require('dotenv').config()
const express = require('express');
const session = require('express-session');
const path = require('path');
const passport = require('./config/passport')
const connectDB = require('./config/db');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const errorHandler = require('./middlewares/errorHandlers')

const app = express();

//view engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({extended: true}));

//Session
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24*60*60*1000
    }
}));

// for google
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
    res.set('cache-control', 'no-store');
    next();
})


//connect mongoDB
connectDB();


app.use('/',userRoutes);
app.use('/admin',adminRoutes)


//error
app.use((req, res, next) => {
    const err = new Error('Page Not Found');
    err.statusCode = 404;
    next(err);
});

app.use(errorHandler);

app.listen(process.env.PORT, () => {
    console.log(`=====Server is running in ${process.env.PORT} port=====`)
})


module.exports = app;