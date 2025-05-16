const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const env = require('dotenv').config();


passport.use(new GoogleStrategy({

    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL

},

async (accessToken, refreshToken, profile, done) => {
    try {

        let user = await User.findOne({googleId: profile.id});
        if(user){
            return done(null, user);
        }else {
            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id
            });
            await user.save(); // save new user who created account wiht GOOGLE
            return done(null, user)

        }
        
    } catch (error) {
        console.error('Error in Google Strategy:', error);
        return done(error, null);
    }
}

));


// user deatils sesssion lekk assign cheyyunu

passport.serializeUser((user, done) => { // store only user id in session (login cheytha shesam)
    done(null, user.id);
});

passport.deserializeUser((id, done) => { // use id to load full user from db

    User.findById(id)
    .then(user => {
        done(null, user)
    })
    .catch(err => {
        done(err, null)
    })

})

module.exports = passport;