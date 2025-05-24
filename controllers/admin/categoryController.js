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
    const existsingCategory = await Category.findOne({name: categoryName});

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


module.exports = {
    categoryInfo,
    addCategory,
    getListCategory,
    getUnlistCategory,
    getEditCategory,
    editCategory,
}