const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');

const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // this is for crop and resize the images 



const getProductPage = async (req, res) => {
    try {

        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isBlocked: false });
        return res.render('admin/add-product', {
            cat: category,
            brand: brand,
        })

    } catch (error) {
        console.error("error while loading the add product page => ", error);
        return res.redirect('/admin/pageerror')
    }
}

const addProducts = async (req, res) => {
    try {
        const products = req.body;
        const productExists = await Product.findOne({
            productName: products.productName,
        });

        if (!productExists) {
            const images = [];

            if (req.files && req.files.length > 0) {
                for (let i = 0; i < req.files.length; i++) {
                    const originalImagePath = req.files[i].path;
                    const resizedImagePath = path.join('public', 'uploads', 'product-images', req.files[i].filename);
                    await sharp(originalImagePath)
                        .resize({ width: 440, height: 440, fit: 'cover' })
                        .toFile(resizedImagePath);
                    images.push(req.files[i].filename);
                }
            }

            const categoryId = await Category.findOne({ name: products.category });

            if (!categoryId) {
                return res.status(400).json({ error: "Invalid category name" });
            }

            // Handle sizes as an array
            const sizes = Array.isArray(products.sizes) ? products.sizes : [products.sizes];

            const newProduct = new Product({
                productName: products.productName,
                description: products.description,
                brand: products.brand,
                category: categoryId._id,
                regularPrice: products.regularPrice,
                salePrice: products.salePrice,
                createdAt: new Date(),
                quantity: products.quantity,
                size: sizes,
                color: products.color,
                productImage: images,
                status: "Available",
            });

            await newProduct.save();
            return res.redirect('/admin/addProducts');
        } else {
            return res.status(400).json({ error: "Product already exists, please try with another name" });
        }
    } catch (error) {
        console.error("Error in the product adding page => ", error);
        return res.redirect('/admin/pageerror');
    }
};

const productList = async (req, res) => {
    try {

        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 10;

        let total = await Product.find()
        console.log(total)
        // console.log(total.countDocuments())

        const productData = await Product.find({
            $or: [
                { productName: { $regex: ".*" + search + ".*", $options: "i" } },
                { brand: { $regex: ".*" + search + ".*", $options: "i" } }
            ]
        })
            .limit(limit)
            .skip((page - 1) * limit)
            .populate('category')
            .exec();

        // console.log(`prousct data => ${JSON.stringify(productData)}`)

        const count = await Product.find({
            $or: [
                { productName: { $regex: ".*" + search + ".*", $options: "i" } },
                { brand: { $regex: ".*" + search + ".*", $options: "i" } }
            ]
        }).countDocuments();
        // console.log("count", count)

        const category = await Category.find({ isListed: true });
        const brand = await Brand.find({ isBlocked: false });

        if (category && brand) {
            res.render('admin/products', {
                data: productData,
                currentPage: page,
                totalPages: Math.ceil(count / limit),
                cat: category,
                brand: brand
            });
        } else {
            res.render('admin/page-404');
        }

    } catch (error) {
        console.error("error while loading the product list page => ", error);
        res.redirect('/admin/pageerror')
    }
}

const productBlock = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id: id}, {$set: {isBlocked: true}});
        return res.redirect('/admin/productlist')
    } catch (error) {
        console.error("error while blocking the product", error);
        return redirect('/admin/pageerror');
    }
}

const productUnBlock = async (req, res) => {
    try {
        let id = req.query.id;
        await Product.updateOne({_id: id}, {$set: {isBlocked: false}});
        return res.redirect('/admin/productlist')
    } catch (error) {
        console.error("error while unblocking the product", error);
        return redirect('/admin/pageerror');
    }
}

const getEditProduct = async (req, res) => {
    try {
        let id = req.query.id;
        const product = await Product.findOne({_id: id});
        const category = await Category.find({});
        const brand = await Brand.find({});
        return res.render('admin/edit-product', {
            product: product,
            cat: category,
            brand: brand
        })
    } catch (error) {
        console.error("error while loading edit page => ", error);
        redirect('/admin/pageerror')
    }
}

const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const product = await Product.findOne({ _id: id });
        if (!product) {
            return res.status(404).json({ error: "Product not found" });
        }
        const data = req.body;

        if (!ObjectId.isValid(data.category)) {
            return res.status(400).json({ error: "Invalid category ID" });
        }
        const categoryExists = await Category.findById(data.category);
        if (!categoryExists) {
            return res.status(400).json({ error: "Category does not exist" });
        }

        const existingProduct = await Product.findOne({
            productName: data.productName,
            _id: { $ne: id }
        });
        if (existingProduct) {
            return res.status(400).json({ error: "Product with this name already exists, Please try again" });
        }

        const updateFields = {
            productName: data.productName,
            description: data.description,
            brand: data.brand,
            category: data.category,
            regularPrice: data.regularPrice,
            salePrice: data.salePrice,
            quantity: data.quantity,
            size: Array.isArray(data.sizes) ? data.sizes : [data.sizes].filter(Boolean),
            color: data.color
        };

        const deleteImages = req.body.deleteImages || [];
        const deleteArray = Array.isArray(deleteImages) ? deleteImages : [deleteImages].filter(Boolean);
        if (deleteArray.length > 0) {
            await Product.findByIdAndUpdate(id, {
                $pull: { productImage: { $in: deleteArray } }
            }, { new: true });
        }

        const images = [];
        if (req.files && req.files.length > 0) {
            for (let i = 0; i < req.files.length; i++) {
                images.push(req.files[i].filename);
            }
            await Product.findByIdAndUpdate(id, {
                $push: { productImage: { $each: images } }
            }, { new: true });
        }

        await Product.findByIdAndUpdate(id, {
            $set: updateFields
        }, { new: true });

        return res.status(200).json({ message: "Product updated successfully" });
    } catch (error) {
        console.error("Error while updating product:", error);
        if (error.name === 'CastError') {
            return res.status(400).json({ error: "Invalid data format for category" });
        }
        if (error.code === 40 && error.codeName === 'ConflictingUpdateOperators') {
            return res.status(400).json({ error: "Conflicting image update operations" });
        }
        return res.status(500).json({ error: "Internal server error" });
    }
};

module.exports = {
    getProductPage,
    addProducts,
    productList,
    productBlock,
    productUnBlock,
    getEditProduct,
    editProduct,
}