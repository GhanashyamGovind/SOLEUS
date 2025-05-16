const { name } = require('ejs');
const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');


const getBrandPage = async (req, res) => {
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
        console.error(error);
        res.redirect('/admin/pageerror')
    }
}


const addBrand = async (req, res) => {
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
        
    }
}

const blockBrand = async (req, res) => {
    try {

        let id = req.query.id;
        await Brand.updateOne({_id: id}, {$set: {isBlocked: true}});
        
        return res.redirect('/admin/brands');
        
    } catch (error) {
        console.error("error while blocking", error)
        return res.redirect('/admin/pageerror');
    }
}


const unBlockBrand = async (req, res) => {
    try {

        let id = req.query.id;
        await Brand.updateOne({_id: id}, {$set: {isBlocked: false}});
        return res.redirect('/admin/brands');

    } catch (error) {
        console.error("error while unblocking => ", error);
        return res.redirect('/admin/pageerror');
    }
}

const deleteBrand = async (req, res) => {
    try {

        let id = req.query.id;
        await Brand.deleteOne({_id: id});
        return res.redirect('/admin/brands');
        
    } catch (error) {
        console.error('error while deleting the brand => ', error);
        return res.redirect('/admin/pageerror');
    }
}


module.exports = {
    getBrandPage,
    addBrand,
    blockBrand,
    unBlockBrand,
    deleteBrand
}