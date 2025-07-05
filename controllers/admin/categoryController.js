const { options } = require('pdfkit');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const mongoose = require('mongoose');


const categoryInfo = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';

        const searchQuery = {
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ]
        };

        const categoryData = await Category.find(searchQuery)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const totalCategory = await Category.countDocuments(searchQuery);
        const totalPage = Math.ceil(totalCategory / limit);

        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.json({
                cat: categoryData,
                currentPage: page,
                totalPage: totalPage,
                searchQuery: search
            });
        }

        return res.render('admin/category', {
            cat: categoryData,
            currentPage: page,
            totalPage: totalPage,
            searchQuery: search
        });
    } catch (error) {
        if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
            return res.status(500).json({ error: 'Server error' });
        }
        next(error)
    }
};

const addCategory = async (req, res, next) => {
    try {
        const { name, description } = req.body;

        const existingCategory = await Category.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        
        if (existingCategory) {
            return res.status(409).json({ message: 'Category already exist !' });
        }

        const newCategory = new Category({
            name,
            description,
        });

        await newCategory.save();
        return res.status(201).json({ message: 'Category added successfully' });
    } catch (error) {
        next(error);
    }
};

const getListCategory = async (req, res, next) => {
    try {
        const id = req.body.id; // Changed to req.body to match fetch request
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ status: false, message: 'Category not found' });
        }
        await Category.updateOne({ _id: id }, { $set: { isListed: false } });
        return res.status(200).json({ status: true, message: 'Category unlisted successfully' });
    } catch (error) {
        next(error)
    }
};

const getUnlistCategory = async (req, res, next) => {
    try {
        const id = req.body.id; // Changed to req.body to match fetch request
        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({ status: false, message: 'Category not found' });
        }
        await Category.updateOne({ _id: id }, { $set: { isListed: true } });
        return res.status(200).json({ status: true, message: 'Category listed successfully' });
    } catch (error) {
        next(error)
    }
};

const getEditCategory = async (req, res, next) => {
    try {
        const id = req.query.id;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            const error = new Error('Page not found');
            error.statusCode = 404;
            throw error;
        }
        const category = await Category.findOne({ _id: id });
        if (!category) {
            const error = new Error('Page not found');
            error.statusCode = 404;
            throw error;
        }
        return res.render('admin/edit-category', { category });
    } catch (error) {
        next(error)
    }
};

const editCategory = async (req, res, next) => {
    try {
        const id = req.params.id;
        const { categoryName, description } = req.body;
        const existingCategory = await Category.findOne({ name: { $regex: `^${categoryName}$`, $options: 'i' }, _id: { $ne: id } });

        if (existingCategory) {
            return res.status(409).json({ message: 'Category exists, please choose another name' });
        }

        const updatedCategory = await Category.findByIdAndUpdate(
            id,
            {
                name: categoryName,
                description: description
            },
            { new: true }
        );

        if (updatedCategory) {
            return res.status(200).json({ message: 'Category updated successfully' });
        } else {
            return res.status(404).json({ message: 'Category not found' });
        }
    } catch (error) {
        next(error)
    }
};

const addCategoryOffer = async (req, res, next) => {
    try {
        const { categoryId, percentage } = req.body;
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: 'Category not found' });
        }

        const parsedPercentage = parseInt(percentage);
        if (isNaN(parsedPercentage) || parsedPercentage < 0 || parsedPercentage > 100) {
            return res.status(400).json({ status: false, message: 'Invalid percentage value' });
        }

        category.categoryOffer = parsedPercentage;
        await category.save();

        const products = await Product.find({ category: categoryId });
        for (const product of products) {
            let offerToApply = parsedPercentage;
            let offerType = 'category';

            if (product.productOffer > parsedPercentage) {
                offerToApply = product.productOffer;
                offerType = 'product';
            }

            product.variants.forEach(variant => {
                variant.salePrice = Math.floor(variant.regularPrice * (1 - offerToApply / 100));
            });

            product.salePrice = Math.min(...product.variants.map(v => v.salePrice));
            product.regularPrice = Math.max(...product.variants.map(v => v.regularPrice));
            product.appliedOffer = offerToApply;
            product.offerType = offerType;

            await product.save();
        }

        return res.json({ status: true, message: 'Offer added successfully' });
    } catch (error) {
        next(error)
    }
};

const removeCategoryOffer = async (req, res, next) => {
    try {
        const { categoryId } = req.body;
        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ status: false, message: 'Category not found' });
        }

        const products = await Product.find({ category: categoryId });
        for (const product of products) {
            const offerToApply = product.productOffer || 0;
            const offerType = offerToApply > 0 ? 'product' : 'none';

            product.variants.forEach(variant => {
                variant.salePrice = offerToApply > 0
                    ? Math.floor(variant.regularPrice * (1 - offerToApply / 100))
                    : variant.regularPrice;
            });

            product.salePrice = Math.min(...product.variants.map(v => v.salePrice));
            product.regularPrice = Math.max(...product.variants.map(v => v.regularPrice));
            product.appliedOffer = offerToApply;
            product.offerType = offerType;

            await product.save();
        }

        category.categoryOffer = 0;
        await category.save();

        return res.status(200).json({ status: true, message: 'Offer removed successfully' });
    } catch (error) {
        next(error)
    }
};


module.exports = {
    categoryInfo,
    addCategory,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
    addCategoryOffer,
    removeCategoryOffer,
};