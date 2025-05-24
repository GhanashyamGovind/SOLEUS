const multer = require('multer');
const path = require('path');

//admin
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../public/uploads/re-image"));
    },
    filename:(req, file, cb) => {
        cb(null, Date.now()+"-"+file.originalname);
    }
})

//user

const userStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../public/uploads/userImage');
        console.log('Saving file to:', uploadPath);
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const cleanFileName = file.originalname.replace(/\s+/g, '_');
        const finalName = `${Date.now()}-${cleanFileName}`;
        console.log('Generated filename:', finalName);
        cb(null, finalName);
    }
});

module.exports = {storage, userStorage};