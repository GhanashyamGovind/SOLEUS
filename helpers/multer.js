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
});

// admin banner
const bannerStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../public/uploads/banner"))
    },
    filename: (req, file, cb) => {
        const cleanFileName = file.originalname.replace(/\s+/g, "_");
        const finalName = `${Date.now()}-${cleanFileName}`;
        cb(null, finalName)
    }
})

//user

const userStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../public/uploads/userImage');
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const cleanFileName = file.originalname.replace(/\s+/g, '_');
        const finalName = `${Date.now()}-${cleanFileName}`;
        cb(null, finalName);
    }
});

module.exports = {storage, userStorage, bannerStorage};