const { name } = require('ejs');
const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');


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

        const brand = req.body.name;
        const findBrand = await Brand.findOne({brand});

        if(!findBrand){
            const image = req.file.filename;
            const newBrand = new Brand({
                brandName: brand,
                brandImage: image,
            });
            await newBrand.save();
            res.redirect('/admin/brands')
        } else {
            res.render('/admin/brands', {error: 'Brand already exists'})
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