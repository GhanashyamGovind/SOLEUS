const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema')



const categoryInfo = async (req, res) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;

        const categoryData = await Category.find({})
        .sort({createdAt: -1})
        .skip(skip)
        .limit(limit);

        const totalCategeory = await Category.countDocuments();
        const totalPage = Math.ceil(totalCategeory/limit);

        return res.render('admin/category', {
            cat:  categoryData,
            currentPage: page,
            totalPage: totalPage
        });
        
    } catch (error) {

        console.error("error in category loading.. => ", error);
        return res.redirect('/admin/pageerror');
        
    }
}


const addCategory = async (req, res, next) => {
    try {

        const {name, description} = req.body;

        const existingCategory = await Category.findOne({name : {$regex: `^${name}`, $options: 'i'}});
        
        if(existingCategory){
            return res.status(409).json({error: "Category already exist !"})
        }

        const newCategory = new Category({
            name,
            description,
        })

        await newCategory.save();
        return res.status(201).json({messge: "Category added succesfully"});
        
    } catch (error) {
        
        next(error)
    }
}

const getListCategory = async (req, res, next) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id: id}, {$set: {isListed: false}});
        return res.redirect('/admin/category');
    } catch (error) {
        next(error)
    }
}

const getUnlistCategory = async (req, res, next) => {
    try {
        let id = req.query.id;
        await Category.updateOne({_id: id}, {$set: {isListed: true}});
        return res.redirect('/admin/category');
    } catch (error) {
        next(error)
    }
}


const getEditCategory = async (req, res, next) => {
    try {

        let id = req.query.id;

        const category = await Category.findOne({_id: id});
        res.render('admin/edit-category', {category: category})
        
    } catch (error) {
        next(error)
    }
}

const editCategory = async (req, res, next) => {

try {

    let id = req.params.id;
    const {categoryName, description} = req.body;
    const existsingCategory = await Category.findOne({name: categoryName, _id: { $ne: id }});

    if(existsingCategory){
        return res.status(409).json({message: "Category exists, please choose another name"})
    }

    const updateCategory = await Category.findByIdAndUpdate(id, 
     {
        name: categoryName,
        description: description
    },
    {new: true});

    if(updateCategory){
        return res.status(200).json({message: 'Category updated successfully'});
    } else {
        return res.status(404).json({message: 'Category not found'});
    }
    
} catch (error) {
    next(error)
}

}

const addCategoryOffer = async (req, res, next) => {
  try {
    const { categoryId, percentage } = req.body;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const parsedPercentage = parseInt(percentage);
    category.categoryOffer = parsedPercentage;
    await category.save();

    const products = await Product.find({ category: categoryId });
    for (const product of products) {
      // Determine which offer to apply (category vs product)
      let offerToApply = parsedPercentage;
      let offerType = 'category';

      if (product.productOffer > parsedPercentage) {
        offerToApply = product.productOffer;
        offerType = 'product';
      }

      // Update each variant's sale price
      product.variants.forEach(variant => {
        variant.salePrice = Math.floor(variant.regularPrice * (1 - offerToApply / 100));
      });

      // Update main product fields
      product.salePrice = Math.min(...product.variants.map(v => v.salePrice));
      product.regularPrice = Math.max(...product.variants.map(v => v.regularPrice));
      product.appliedOffer = offerToApply;
      product.offerType = offerType;

      await product.save();
    }

    res.json({ status: true });
  } catch (error) {
    next(error);
  }
};

const removeCategoryOffer = async (req, res, next) => {
  try {
    const { categoryId } = req.body;
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ status: false, message: "Category not found" });
    }

    const products = await Product.find({ category: category._id });
    for (const product of products) {
      const offerToApply = product.productOffer || 0;
      const offerType = offerToApply > 0 ? 'product' : 'none';

      // Recalculate variant sale prices
      product.variants.forEach(variant => {
        variant.salePrice = offerToApply > 0
          ? Math.floor(variant.regularPrice * (1 - offerToApply / 100))
          : variant.regularPrice;
      });

      // Update main product fields
      product.salePrice = Math.min(...product.variants.map(v => v.salePrice));
      product.regularPrice = Math.max(...product.variants.map(v => v.regularPrice));
      product.appliedOffer = offerToApply;
      product.offerType = offerType;

      await product.save();
    }

    category.categoryOffer = 0;
    await category.save();

    return res.status(200).json({ status: true });
  } catch (error) {
    next(error);
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
}