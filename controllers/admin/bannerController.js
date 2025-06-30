const Banner = require('../../models/bannerSchema');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs/promises')

const getBanner = async (req, res, next) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const skip = (page - 1) * 10;

        const totalBanner = await Banner.countDocuments();
        const banners = await Banner.find().lean().sort({ creatdAt: -1 }).skip(skip).limit(10);
        const totalPages = Math.ceil( totalBanner / limit)
        return res.render('admin/banner', {
            banners,
            totalPages,
            currentPage: page
        });
        
    } catch (error) {
        
    }
}

const creatBanner = async (req, res, next) => {
    try {
        const { title, description, link, buttonText} = req.body;

        if (!title || title.trim().length < 1) {
            return res.status(400).json({ success: false, message: 'Title is required and must be at least 1 character long' });
        }
        if (!description || description.trim().length < 1) {
            return res.status(400).json({ success: false, message: 'Description is required and must be at least 1 character long' });
        }
        if (!buttonText || buttonText.trim().length < 1) {
            return res.status(400).json({ success: false, message: 'Button text is required and must be at least 1 character long' });
        }
        if (!/^[a-zA-Z]+$/.test(buttonText.trim())) {
            return res.status(400).json({ success: false, message: 'Button text must contain only letters (a-z, A-Z)' });
        }
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Image is required' });
        }

        const uploadDir = path.join(__dirname, '../../public/uploads/banner');
        const originalPath = path.join(uploadDir, req.file.filename);
        const outputFileName = `resized-~${Date.now()}.webp`;
        const outputPath = path.join(uploadDir, outputFileName);

        await sharp(req.file.path)
            .resize(1600, 600)
            .toFormat('webp')
            .webp({quality: 80})
            .toFile(outputPath);

        const deleted = await fs.unlink(originalPath);
        console.log("orignal delete:==> ", deleted)

        const banner = new Banner({
            title: title.toUpperCase(),
            description,
            link: link ? link.trim() : '',
            buttonText: buttonText.trim(),
            image: `/uploads/banner/${outputFileName}`,
            isActive: true,
            createdAt: new Date()
        })

        const newBanner = await banner.save();
        console.log("banner", newBanner)
        if(!newBanner) {
            return res.status(400).json({success: false, message: "Failed to creat banner"});
        }
        return res.status(201).json({ success: true, message: 'Banner created successfully' });
    } catch (error) {
        next(error)
    }
}

const editBanner = async (req, res, next) => {
    try {
        const {id} = req.query;
        const {title, description, link, buttonText} = req.body;

    if (!title || title.trim().length < 1) {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }
    if (!description || description.trim().length < 1) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }
    if (!buttonText || !/^[a-zA-Z]+$/.test(buttonText.trim())) {
      return res.status(400).json({ success: false, message: 'Button text must contain only letters' });
    }
    const banner = await Banner.findById(id);
    if(!banner) {
        return res.status(404).json({success: false, message: "Banner not found"});
    }

    let imagePath = banner.image;

    if(req.file) {
        const uploadDir = path.join(__dirname, '../../public/uploads/banner');
        const originalPath = path.join(uploadDir, req.file.filename);
        const outputFileName = `edited-${Date.now()}.webp`
        const outputPath = path.join(uploadDir, outputFileName);

        await sharp(req.file.path)
            .resize(1600, 600)
            .toFormat('webp')
            .webp({quality: 80})
            .toFile(outputPath);

        await fs.unlink(originalPath);

        //delete old image
        const oldImagePath = path.join(__dirname, '../../public', banner.image);
        try {
            await fs.unlink(oldImagePath);
        } catch (error) {
            console.warn("old image is not found or alredy deleted")
        }

        imagePath = `/uploads/banner/${outputFileName}`
    }

    //update
    updated = await Banner.findByIdAndUpdate(
        id,
        {
            title: title.toUpperCase(),
            description: description,
            link: link ? link.trim() : '',
            image: imagePath
        },
        {new: true}
    );

    if(!updated) {
        return res.status(400).json({success: false, message: "Failed to updat banner"});
    }

    return res.status(200).json({success: true, message: "Banner updated successfully"});
    } catch (error) {
        next(error)
    }
}

const listAndUnlist = async (req, res, next) => {
    try {
        const {id} = req.body;
        const banner = await Banner.findById(id);

        if(!banner) {
            return res.status(404).json({success: false, message: "Banner is not found"});
        }

        banner.isActive = !banner.isActive;
        await banner.save();

        const message = banner.isActive === true ? "Banner is listed" : "Banner is unlisted";
        return res.status(200).json({success: true, message})
    } catch (error) {
        next(error)
    }
}

const deleteBanner = async (req, res, next) => {
    try {
        const {id} = req.body;
        const banner = await Banner.findById(id);
        if(!banner) { 
            return res.status(404).json({success: false, message: "Banner not found"});
        }

        if(banner.image) {
            const imagePath = path.join(__dirname, '../../public/', banner.image);
            await fs.unlink(imagePath);
            console.log("image is deleted", imagePath)
        }

        await Banner.findByIdAndDelete(id);
        return res.status(200).json({success: true, message: "Banner is deleted"})
    } catch (error) {
        next(error)
    }
}

module.exports = {
    getBanner,
    creatBanner,
    editBanner,
    listAndUnlist,
    deleteBanner,
}