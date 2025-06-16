const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const bcrypt = require("bcrypt");
const PDFDocument = require('pdfkit');
const moment = require('moment')


//load-Login
const loadLogin = async (req, res, next) => {
    try {
        if(req.session.admin){
            return res.redirect('/admin')
        }else{
         res.render('admin/admin-login', {message: null})
        }
    } catch (error) {
        next(error)
    }
}

// submit-login
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });
        console.log(admin);

        if (!admin) {
            return res.render('admin/admin-login', { message: "Enter the proper email" });
        }

        const passwordMatch = await bcrypt.compare(password, admin.password);
        if (!passwordMatch) {
            return res.render('admin/admin-login', { message: "Wrong password" });
        }

        req.session.admin = admin._id;
        return res.redirect('/admin');
    } catch (error) {
        next(error);
    }
}

//loadDashboard

const loadDashboard = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }

    // Default filter values if none provided
    const filter = {
      period: 'monthly',
      startDate: null,
      endDate: null
    };

    const data = await getSalesData(filter);

    res.render('admin/dashboard', {
      ...data,
      message: req.session.message || null
    });
    delete req.session.message;
  } catch (error) {
    next(error);
  }
};

//salereport
const saleReport = async (req, res, next) => { 
  try {
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }

    const { period, startDate, endDate } = req.body;
    const filter = { period, startDate, endDate };

    const data = await getSalesData(filter);

    req.session.message = 'Report generated successfully!';
    res.render('admin/dashboard', {
      ...data,
      message: req.session.message
    });
  } catch (error) {
    req.session.message = `Failed to generate report: ${error.message}`;
    res.redirect('/admin');
  }
};

const downloadPDF = async (req, res, next) => {
  try {
    if (!req.session.admin) {
      return res.redirect('/admin/login');
    }

    const { period, startDate, endDate } = req.body;
    const filter = { period, startDate, endDate };

    const data = await getSalesData(filter);

    // Create PDF
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

    doc.pipe(res);

    doc.fontSize(20).text('Sales Report', 50, 50);
    doc.fontSize(12).text(`Report Generated: ${moment().format('DD/MM/YYYY')}`, 50, 80);
    doc.text(`Overall Sales Count: ${data.summary.salesCount}`, 50, 100);
    doc.text(`Overall Order Amount: ₹${data.summary.orderAmount.toLocaleString()}`, 50, 120);
    doc.text(`Overall Discount: ₹${data.summary.discount.toLocaleString()}`, 50, 140);
    doc.text(`Total Sale: ₹${data.totalSale.toLocaleString()}`, 50, 160);
    doc.text(`Total Orders: ${data.totalOrders}`, 50, 180);
    doc.text(`Total Customers: ${data.totalCustomers}`, 50, 200);
    doc.text(`Total Income: ₹${data.totalIncome.toLocaleString()}`, 50, 220);

    doc.end();
  } catch (error) {
    req.session.message = `Failed to download PDF: ${error.message}`;
    res.redirect('/admin');
  }
};

const getSalesData = async (filter) => {
  const { period, startDate, endDate } = filter;
  let match = { status: 'Delivered' };

  // Apply date filters only for custom period
  if (period === 'custom' && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Include end of day
    match.createdAt = { $gte: start, $lte: end };
  }

  // Overview Cards
  const totalSale = await Order.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$finalAmount' } } }
  ]).catch(err => {
    console.error('totalSale error:', err);
    return [{ total: 0 }];
  });

  const totalOrders = await Order.countDocuments().catch(err => {
    console.error('totalOrders error:', err);
    return 0;
  });

  const totalCustomers = await User.countDocuments({ isAdmin: false }).catch(err => {
    console.error('totalCustomers error:', err);
    return 0;
  });

  const totalIncome = await Order.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: { $subtract: ['$finalAmount', '$discount'] } } } }
  ]).catch(err => {
    console.error('totalIncome error:', err);
    return [{ total: 0 }];
  });

  // Sales Summary
  const summary = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        salesCount: { $sum: 1 },
        orderAmount: { $sum: '$finalAmount' },
        discount: { $sum: '$discount' }
      }
    }
  ]).catch(err => {
    console.error('summary error:', err);
    return [{ salesCount: 0, orderAmount: 0, discount: 0 }];
  });

  // Top Selling Products
  const topProducts = await Order.aggregate([
    { $match: match },
    { $unwind: '$orderedItems' },
    {
      $group: {
        _id: '$orderedItems.product',
        salesCount: { $sum: '$orderedItems.quantity' },
        totalRevenue: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.price'] } },
        discountsApplied: { $sum: '$discount' }
      }
    },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $project: {
        name: '$product.productName',
        salesCount: 1,
        totalRevenue: 1,
        discountsApplied: 1
      }
    },
    { $sort: { salesCount: -1 } },
    { $limit: 5 }
  ]).catch(err => {
    console.error('topProducts error:', err);
    return [];
  });

  // Sales Trend
  const groupFormat = period === 'daily' ? '%Y-%m-%d' : period === 'weekly' ? '%Y-%U' : period === 'yearly' ? '%Y' : '%Y-%m';
  const salesTrend = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: groupFormat, date: '$createdAt' } },
        total: { $sum: '$finalAmount' }
      }
    },
    { $sort: { '_id': 1 } }
  ]).catch(err => {
    console.error('salesTrend error:', err);
    return [];
  });
  const salesTrendLabels = salesTrend.length ? salesTrend.map(item => item._id || 'N/A') : ['No Data'];
  const salesTrendData = salesTrend.length ? salesTrend.map(item => item.total || 0) : [0];

  // Sales Distribution
  const salesDistribution = await Order.aggregate([
    { $match: match },
    { $unwind: '$orderedItems' },
    {
      $lookup: {
        from: 'products',
        localField: 'orderedItems.product',
        foreignField: '_id',
        as: 'product'
      }
    },
    { $unwind: '$product' },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.category',
        foreignField: '_id',
        as: 'category'
      }
    },
    { $unwind: '$category' },
    {
      $group: {
        _id: '$category.name',
        total: { $sum: { $multiply: ['$orderedItems.quantity', '$orderedItems.price'] } }
      }
    }
  ]).catch(err => {
    console.error('salesDistribution error:', err);
    return [];
  });
  const salesDistributionLabels = salesDistribution.length ? salesDistribution.map(item => item._id || 'Unknown') : ['No Data'];
  const salesDistributionData = salesDistribution.length ? salesDistribution.map(item => item.total || 0) : [0];

  // Coupon Performance
  const couponPerformance = await Coupon.aggregate([
    { $match: { usedBy: { $ne: [] } } },
    {
      $project: {
        code: 1,
        usageCount: { $size: '$usedBy' }
      }
    },
    { $limit: 5 }
  ]).catch(err => {
    console.error('couponPerformance error:', err);
    return [];
  });

  // Discount Breakdown
  const discountBreakdown = await Order.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$couponCode',
        amount: { $sum: '$discount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        type: { $ifNull: ['$couponCode', 'Manual Discount'] },
        amount: 1,
        count: 1
      }
    }
  ]).catch(err => {
    console.error('discountBreakdown error:', err);
    return [];
  });

  return {
    totalSale: totalSale[0]?.total || 0,
    totalOrders,
    totalCustomers,
    totalIncome: totalIncome[0]?.total || 0,
    summary: summary[0] || { salesCount: 0, orderAmount: 0, discount: 0 },
    topProducts,
    salesTrend: { labels: salesTrendLabels, data: salesTrendData },
    salesDistribution: { labels: salesDistributionLabels, data: salesDistributionData },
    couponPerformance,
    discountBreakdown
  };
};

//logOut
const logout = async (req, res, next) => {
    try {
        delete req.session.admin;
        res.clearCookie(req.sessionID)
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        return  res.redirect('/admin/login');
    } catch (error) {
        next(error)
    }
}


//pageerror
const pageerror = async (req, res) =>{
    res.render('admin/page-404')
}



module.exports = {
    loadLogin,
    login,
    loadDashboard,
    saleReport,
    downloadPDF,
    pageerror,
    logout,
}