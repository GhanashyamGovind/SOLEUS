const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');
const env = require('dotenv').config();


const generateUniqueReferralCode = async () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const digits = '0123456789';

    let baseCode = '';
    for(let i = 0; i < 3; i++){
        baseCode += letters.charAt(Math.floor(Math.random() * letters.length));
    }

    for(let i = 0; i < 3; i++){
        baseCode += digits.charAt(Math.floor(Math.random() * digits.length));
    }

    //check the code exists
    let referralCode = baseCode;
    let count = 1;
    while(await User.findOne({referralCode})){
        referralCode = baseCode + count;
        count++
    }

    return referralCode
}

passport.use(new GoogleStrategy({

    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL

},

async (accessToken, refreshToken, profile, done) => {
    try {

        const email = profile.emails[0].value;

        let user = await User.findOne({googleId: profile.id, email: email});
        if(user){
            if (user.isBlocked) {
                return done(null, false, { message: 'Yor this account has been blocked. Please contact the support' })
            } else {
                return done(null, user);
            }
        }else {
            const referralCode = await generateUniqueReferralCode();

            user = new User({
                name: profile.displayName,
                email: profile.emails[0].value,
                googleId: profile.id,
                referralCode: referralCode
            });
            await user.save(); // save new user who created account wiht GOOGLE
            return done(null, user)

        }
        
    } catch (error) {
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