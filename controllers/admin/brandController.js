const { name } = require('ejs');
const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');
const path = require('path');
const fs = require('fs/promises')


const getBrandPage = async (req, res, next) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page-1)*limit;
        const brandData = await Brand.find({}).sort({createdAt: -1}).skip(skip).limit(limit);
        const totalBrands = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrands/limit);
        const reverseBrand = brandData.reverse();
        res.render('admin/brands', {
            data: reverseBrand,
            currentPage: page,
            totalPages: totalPages,
            totalBrands: totalBrands,
        })
        
    } catch (error) {
        next(error)
    }
}


const addBrand = async (req, res, next) => {
    try {

        const {name} = req.body
        const brand = name.trim()

        const findBrand = await Brand.findOne({
            brandName: { $regex: `^${brand}$`, $options: 'i'}
        });

        if(!findBrand){
            const image = req.file.filename;
            const newBrand = new Brand({
                brandName: brand,
                brandImage: image,
            });
            await newBrand.save();
            return res.redirect('/admin/brands?success=' + encodeURIComponent('Brand added'))
        } else {
            return res.redirect('/admin/brands?error=' + encodeURIComponent('Brand is already exists'))
        }

    } catch (error) {
        next(error)
    }
}

const blockAndUnblockBrand = async (req, res, next) => {
    try {
        let id = req.query.id;
        const brand = await Brand.findOne({_id: id})
        brand.isBlocked === false ? brand.isBlocked = true : brand.isBlocked = false;
        await brand.save()

        return res.redirect(`/admin/brands?page=${req.query.page || 1}`)
    } catch (error) {
        next(error)
    }
}


const deleteBrand = async (req, res, next) => {
    try {

        let id = req.query.id;
        const brand = await Brand.findById(id);

        if (brand && brand.brandImage && Array.isArray(brand.brandImage) && brand.brandImage.length > 0) {
            const imageFile = brand.brandImage[0];
            const imagePath = path.join(__dirname, '../../public/uploads/re-image/', imageFile);
            await fs.unlink(imagePath);
        }

        await Brand.deleteOne({_id: id});
        return res.redirect(`/admin/brands?page=${req.query.page || 1}`);
    } catch (error) {
        next(error)
    }
}


module.exports = {
    getBrandPage,
    addBrand,
    deleteBrand,
    blockAndUnblockBrand
}