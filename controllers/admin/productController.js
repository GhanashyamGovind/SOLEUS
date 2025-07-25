const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;
const Product = require('../../models/productSchema');
const Category = require('../../models/categorySchema');
const Brand = require('../../models/brandSchema');
const User = require('../../models/userSchema');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp'); // this is for crop and resize the images 



const getProductPage = async (req, res, next) => {
  try {
    const brands = await Brand.find({ isBlocked: false });
    const categories = await Category.find({ isListed: true });

    res.render('admin/add-product', {
      success: null, // Explicitly set to null if there's no success message
      error: null,   // Explicitly set to null if there's no error
      brands,
      categories,
      formData: {}   // Empty object for initial form load
    });
  } catch (error) {
    next(error)
  }
};


const addProducts = async (req, res, next) => {
  try {
    const {
      productName,
      description,
      brand,
      category,
      color,
      sizes
    } = req.body;

    // Validate brand
    if (!mongoose.Types.ObjectId.isValid(brand)) {
      return res.render('admin/add-product', {
        error: 'Invalid brand ID',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }
    const brandDoc = await Brand.findOne({ _id: brand, isBlocked: false });
    if (!brandDoc) {
      return res.render('admin/add-product', {
        error: 'Brand is invalid or blocked',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }

    // Validate category
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.render('admin/add-product', {
        error: 'Invalid category ID',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }
    const categoryDoc = await Category.findOne({ _id: category, isListed: true });
    if (!categoryDoc) {
      return res.render('admin/add-product', {
        error: 'Category is invalid or unlisted',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }

    // Check if product exists
    const productExists = await Product.findOne({ productName });
    if (productExists) {
      return res.render('admin/add-product', {
        error: 'Product already exists, please try with another name',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }

    // Process variants
    const variants = [];
    const validSizes = ['6', '7', '8', '9', '10', '11', '12'];
    const sizesArray = Array.isArray(sizes) ? sizes : [sizes].filter(Boolean);
    if (sizesArray.length === 0) {
      return res.render('admin/add-product', {
        error: 'At least one size is required',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }

    // Check for duplicate sizes in the request
    const sizeSet = new Set(sizesArray);
    if (sizeSet.size !== sizesArray.length) {
      return res.render('admin/add-product', {
        error: 'Duplicate sizes are not allowed',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }

    for (const size of sizesArray) {
      if (!validSizes.includes(size)) {
        return res.render('admin/add-product', {
          error: `Invalid size: ${size}`,
          brands: await Brand.find({ isBlocked: false }),
          categories: await Category.find({ isListed: true }),
          formData: req.body
        });
      }
      const regularPrice = parseFloat(req.body[`regularPrice-${size}`]);
      const salePrice = parseFloat(req.body[`salePrice-${size}`]) || 0;
      const stock = parseInt(req.body[`stock-${size}`]);

      if (isNaN(regularPrice) || regularPrice <= 0) {
        return res.render('admin/add-product', {
          error: `Invalid regular price for size ${size}`,
          brands: await Brand.find({ isBlocked: false }),
          categories: await Category.find({ isListed: true }),
          formData: req.body
        });
      }
      if (isNaN(salePrice) || salePrice < 0) {
        return res.render('admin/add-product', {
          error: `Invalid sale price for size ${size}`,
          brands: await Brand.find({ isBlocked: false }),
          categories: await Category.find({ isListed: true }),
          formData: req.body
        });
      }
      if (regularPrice < salePrice) {
        return res.render('admin/add-product', {
          error: `Regular price must be greater than sale price for size ${size}`,
          brands: await Brand.find({ isBlocked: false }),
          categories: await Category.find({ isListed: true }),
          formData: req.body
        });
      }
      if (isNaN(stock) || stock < 0) {
        return res.render('admin/add-product', {
          error: `Invalid stock quantity for size ${size}`,
          brands: await Brand.find({ isBlocked: false }),
          categories: await Category.find({ isListed: true }),
          formData: req.body
        });
      }

      // Add variant with a temporary SKU
      variants.push({
        size,
        sku: `SKU-TEMP-${size}`, // Temporary SKU, will be updated after saving
        regularPrice,
        salePrice,
        stock
      });

    }

    // Validate color
    if (!color || !color.trim()) {
      return res.render('admin/add-product', {
        error: 'Color is required',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }

    // Process images
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
    } else {
      return res.render('admin/add-product', {
        error: 'At least one image is required',
        brands: await Brand.find({ isBlocked: false }),
        categories: await Category.find({ isListed: true }),
        formData: req.body
      });
    }

    // Create new product
    const newProduct = new Product({
      productName,
      description,
      brand,
      category,
      color,
      productImage: images,
      quantity: 0, // will be computed by middleware
      regularPrice: 0, // will be computed by middleware
      salePrice: 0, // will be computed by middleware
      variants,
      status: 'Out of stock' // Will be updated by middleware
    });

    // Save the product to generate the _id
    await newProduct.save();

    // Update SKUs with the actual product._id
    newProduct.variants.forEach(variant => {
      variant.sku = `SKU-${newProduct._id}-${variant.size}`;
    });

    // Save again to update SKUs and trigger middleware
    await newProduct.save();

    return res.render('admin/add-product', {
      success: 'Product added successfully',
      brands: await Brand.find({ isBlocked: false }),
      categories: await Category.find({ isListed: true }),
      formData: {}
    });
  } catch (error) {
    return res.render('admin/add-product', {
      error: error.message || 'Internal server error',
      brands: await Brand.find({ isBlocked: false }),
      categories: await Category.find({ isListed: true }),
      formData: req.body
    });
  }
};

const productList = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Number of products per page
    const skip = (page - 1) * limit;

    // Fetch all products, including blocked ones
    const products = await Product.find()
      .populate('brand')
      .populate('category')
      .skip(skip)
      .limit(limit)
      .lean();

    const totalProducts = await Product.countDocuments();
    const totalPages = Math.ceil(totalProducts / limit);

    res.render('admin/products', {
      data: products,
      currentPage: page,
      totalPages,
      title: 'Product-List',
    });
  } catch (error) {
    next(error)
  }
};


const productBlock = async (req, res, next) => {
  try {
    const id = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect('/admin/pageerror');
    }
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
    return res.redirect('/admin/productlist');
  } catch (error) {
    next(error)
  }
};

const productUnBlock = async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error('Invalid product ID');
      error.statusCode = 400;
      throw error;
    }
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    return res.redirect('/admin/productlist');
  } catch (error) {
    next(error)
  }
};

const getEditProduct = async (req, res, next) => {
  try {
    const id = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error('Page not found');
      error.statusCode = 404;
      throw error;
    }

    const product = await Product.findOne({ _id: id })
      .populate('brand', 'brandName')
      .populate('category', 'name')
      .lean();
    if (!product) {
      return res.render('admin/edit-product', {
        product: null,
        cat: [],
        brand: [],
        error: ['Product not found.'],
        success: [],
        formData: null,
      });
    }

    if (!product.brand || !product.category) {
      return res.render('admin/edit-product', {
        product: null,
        cat: [],
        brand: [],
        error: ['Product data is incomplete (missing brand or category).'],
        success: [],
        formData: null,
      });
    }

    const category = await Category.find({ isListed: true }).lean();
    const brand = await Brand.find({ isBlocked: false }).lean();

    if (!category.length || !brand.length) {
      return res.render('admin/edit-product', {
        product: null,
        cat: [],
        brand: [],
        error: ['No categories or brands available to edit the product.'],
        success: [],
        formData: null,
      });
    }

    return res.render('admin/edit-product', {
      product,
      cat: category,
      brand,
      error: [],
      success: [],
      formData: null, // Removed session-based formData
    });
  } catch (error) {
    next(error)
  }
};

const editProduct = async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const {
      productName,
      description,
      brand,
      category,
      color,
      sizes
    } = req.body;

    // Validate brand
    if (!mongoose.Types.ObjectId.isValid(brand)) {
      return res.status(400).json({ error: 'Invalid brand ID' });
    }
    const brandDoc = await Brand.findOne({ _id: brand, isBlocked: false });
    if (!brandDoc) {
      return res.status(400).json({ error: 'Brand is invalid or blocked' });
    }

    // Validate category
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ error: 'Invalid category ID' });
    }
    const categoryDoc = await Category.findOne({ _id: category, isListed: true });
    if (!categoryDoc) {
      return res.status(400).json({ error: 'Category is invalid or unlisted' });
    }

    // Check if product exists and not updating to a duplicate name
    const existingProduct = await Product.findById(id);
    if (!existingProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const duplicateProduct = await Product.findOne({ productName, _id: { $ne: id } });
    if (duplicateProduct) {
      return res.status(400).json({ error: 'Product name already exists' });
    }

    // Validate color
    if (!color || !color.trim()) {
      return res.status(400).json({ error: 'Color is required' });
    }

    // Process variants
    const variants = [];
    const validSizes = ['6', '7', '8', '9', '10', '11', '12'];
    const sizesArray = Array.isArray(sizes) ? sizes : [sizes].filter(Boolean);
    if (sizesArray.length === 0) {
      return res.status(400).json({ error: 'At least one size is required' });
    }

    // let zeroStockWarning = false;
    for (const size of sizesArray) {
      if (!validSizes.includes(size)) {
        return res.status(400).json({ error: `Invalid size: ${size}` });
      }
      const regularPrice = parseFloat(req.body[`regularPrice-${size}`]);
      const salePrice = parseFloat(req.body[`salePrice-${size}`]) || 0;
      const stock = parseInt(req.body[`stock-${size}`]);
      
      if (isNaN(regularPrice) || regularPrice <= 0) {
        return res.status(400).json({ error: `Invalid regular price for size ${size}` });
      }
      if (isNaN(salePrice) || salePrice < 0) {
        return res.status(400).json({ error: `Invalid sale price for size ${size}` });
      }
      if (regularPrice < salePrice) {
        return res.status(400).json({ error: `Regular price must be greater than sale price for size ${size}` });
      }
      if (isNaN(stock) || stock <= 0) {
        return res.status(400).json({ error: `Invalid stock quantity for size ${size}` });
      }
      if (stock === 0) {
        return res.status(400).json({ error: `Invalid stock quantity for size ${size}` });
      }
      
    variants.push({ size,
        sku: existingProduct.variants.find(v => v.size === size)?.sku || `SKU-${id}-${size}`,
        regularPrice, 
        salePrice, 
        stock });    }

    // Calculate quantity
    const quantity = variants.reduce((sum, variant) => sum + variant.stock, 0);
    if (quantity === 0) {
      return res.status(400).json({ error: 'Quantity must be greater than zero' });
    }

    // Compute product-level prices
    const regularPrice = variants.length > 0 ? Math.min(...variants.map(v => v.regularPrice)) : 0;
    const salePrice = variants.length > 0 ? Math.min(...variants.map(v => v.salePrice)) : 0;

    // Handle images
    let images = existingProduct.productImage || [];
    const deleteImages = Array.isArray(req.body.deleteImages) ? req.body.deleteImages : [req.body.deleteImages].filter(Boolean);
    
    // Remove deleted images
    if (deleteImages.length > 0) {
      images = images.filter(img => !deleteImages.includes(img));
      for (const img of deleteImages) {
        const imgPath = path.join('public', 'uploads', 'product-images', img); //check
        try {
          await fs.unlink(imgPath);
        } catch (err) {
        }
      }
    }

    // Process new images
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

    // Validate images
    if (images.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    // Update product
    const updatedProduct = {
      productName,
      description,
      brand,
      category,
      color,
      regularPrice,
      salePrice,
      quantity,
      variants,
      productImage: images,
      status: quantity > 0 ? 'Available' : 'Out of stock'
    };

    const productToUpdate = await Product.findById(id);
    if (!productToUpdate) {
      return res.status(404).json({ error: 'Product not found for update' });
    }

    Object.assign(productToUpdate, updatedProduct);
    await productToUpdate.save()
    const response = { message: 'Product updated successfully' };
    return res.status(200).json({ response });
  } catch (error) {
    next(error)
  }
};


const addProductOffer = async (req, res, next) => {
  try {
    const { productId, percentage } = req.body;
    if (!productId || !percentage) {
      return res.status(400).json({ success: false, message: "Product ID and percentage are required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const category = await Category.findById(product.category);
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const productOffer = parseInt(percentage);
    const categoryOffer = category.categoryOffer || 0;

    // Decide which offer to apply
    const finalOffer = Math.max(productOffer, categoryOffer);
    const offerType = finalOffer === productOffer ? 'product' : 'category';

    // Update variants with the applied offer
    product.variants.forEach(variant => {
      variant.salePrice = Math.floor(variant.regularPrice * (1 - finalOffer / 100));
    });

    // Update product-level fields
    product.productOffer = productOffer;
    product.salePrice = Math.min(...product.variants.map(v => v.salePrice));
    product.regularPrice = Math.max(...product.variants.map(v => v.regularPrice));
    product.appliedOffer = finalOffer;
    product.offerType = offerType;

    await product.save();

    return res.json({ success: true });
  } catch (error) {
    next(error);
  }
};

const removeProductOffer = async (req, res, next) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const category = await Category.findById(product.category);
    const categoryOffer = category?.categoryOffer || 0;

    // Apply category offer if present
    const offerToApply = categoryOffer;
    const offerType = offerToApply > 0 ? 'category' : 'none';

    product.variants.forEach(variant => {
      variant.salePrice = offerToApply > 0
        ? Math.floor(variant.regularPrice * (1 - offerToApply / 100))
        : variant.regularPrice;
    });

    product.productOffer = 0;
    product.salePrice = Math.min(...product.variants.map(v => v.salePrice));
    product.regularPrice = Math.max(...product.variants.map(v => v.regularPrice));
    product.quantity = product.variants.reduce((sum, v) => sum + v.stock, 0);
    product.appliedOffer = offerToApply;
    product.offerType = offerType;

    await product.save();

    return res.status(200).json({ success: true, message: "Product offer removed" });
  } catch (error) {
    next(error);
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
    addProductOffer,
    removeProductOffer,
}