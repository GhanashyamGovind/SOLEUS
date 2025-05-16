const mongoose = require('mongoose');
const dotenv = require('dotenv');

// mongoDB connection
const connectDB = async () =>{
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log(`=====Mongodb connected : ${conn.connection.host}=====`);
    } catch (error) {
        console.error(`THERE IS AN ERROR WITH MONGODB CONNECTION in => ${error}`);
        process.exit(1);
    }
};

module.exports = connectDB;