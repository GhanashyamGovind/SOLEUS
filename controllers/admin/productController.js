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
    console.error('Error rendering add products page:', error);
    res.render('admin/add-product', {
      success: null,
      error: 'Failed to load the add products page',
      brands: [],
      categories: [],
      formData: {}
    });
  }
};


const addProducts = async (req, res) => {
  try {
    // console.log('Request body:', req.body);
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
      if (regularPrice <= salePrice) {
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
        const resizedImagePath = path.join('public', 'Uploads', 'product-images', req.files[i].filename);
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
    console.error('Error in the product adding page:', error);
    return res.render('admin/add-product', {
      error: error.message || 'Internal server error',
      brands: await Brand.find({ isBlocked: false }),
      categories: await Category.find({ isListed: true }),
      formData: req.body
    });
  }
};

const productList = async (req, res) => {
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
    console.error('Error fetching product list:', error);
    res.redirect('/admin/pageerror');
  }
};


const productBlock = async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect('/admin/pageerror');
    }
    await Product.updateOne({ _id: id }, { $set: { isBlocked: true } });
    return res.redirect('/admin/productlist');
  } catch (error) {
    console.error('Error while blocking the product:', error);
    return res.redirect('/admin/pageerror');
  }
};

const productUnBlock = async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.redirect('/admin/pageerror');
    }
    await Product.updateOne({ _id: id }, { $set: { isBlocked: false } });
    return res.redirect('/admin/productlist');
  } catch (error) {
    console.error('Error while unblocking the product:', error);
    return res.redirect('/admin/pageerror');
  }
};

const getEditProduct = async (req, res) => {
  try {
    const id = req.query.id;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.render('admin/edit-product', {
        product: null,
        cat: [],
        brand: [],
        error: ['Invalid product ID.'],
        success: [],
        formData: null,
      });
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
    console.error('Error while loading edit page:', error.message);
    return res.render('admin/edit-product', {
      product: null,
      cat: [],
      brand: [],
      error: ['An error occurred while loading the edit page. Please try again.'],
      success: [],
      formData: null,
    });
  }
};

const editProduct = async (req, res) => {
  try {
    console.log('Edit product request body:', req.body);
    console.log('Files:', req.files);
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
      if (regularPrice <= salePrice) {
        return res.status(400).json({ error: `Regular price must be greater than sale price for size ${size}` });
      }
      if (isNaN(stock) || stock < 0) {
        return res.status(400).json({ error: `Invalid stock quantity for size ${size}` });
      }
      
      variants.push({ size, regularPrice, salePrice, stock });
    }

    // Calculate quantity
    const quantity = variants.reduce((sum, variant) => sum + variant.stock, 0);
    console.log('Variants:', variants, 'Quantity:', quantity);
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
        const imgPath = path.join('public', 'Uploads', 'product-images', img);
        try {
          await fs.unlink(imgPath);
          console.log(`Deleted image: ${imgPath}`);
        } catch (err) {
          console.warn(`Failed to delete image ${imgPath}:`, err.message);
        }
      }
    }

    // Process new images
    if (req.files && req.files.length > 0) {
      for (let i = 0; i < req.files.length; i++) {
        const originalImagePath = req.files[i].path;
        const resizedImagePath = path.join('public', 'Uploads', 'product-images', req.files[i].filename);
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

    await Product.findByIdAndUpdate(id, updatedProduct, { new: true });
    return res.status(200).json({ message: 'Product updated successfully' });
  } catch (error) {
    console.error('Error in edit product:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    return res.status(500).json({ error: 'Internal server error' });
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