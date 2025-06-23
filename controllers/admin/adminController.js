const User = require('../../models/userSchema');
const mongoose = require('mongoose');
const Product = require('../../models/productSchema');
const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const bcrypt = require("bcrypt");
const PDFDocument = require('pdfkit');
const moment = require('moment');
const ExcelJS = require('exceljs');

// Load Login
const loadLogin = async (req, res, next) => {
    try {
        if (req.session.admin) {
            return res.redirect('/admin');
        }
        res.render('admin/admin-login', { message: null });
    } catch (error) {
        next(error);
    }
};

// Submit Login
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const admin = await User.findOne({ email, isAdmin: true });

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
};

// Load Dashboard
const loadDashboard = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const filter = {
            period: req.session.filter?.period || req.query.period || 'monthly',
            startDate: req.session.filter?.startDate || req.query.startDate || null,
            endDate: req.session.filter?.endDate || req.query.endDate || null,
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 5
        };
        console.log('Dashboard Filter:', filter);

        const data = await getSalesData(filter);

        res.render('admin/dashboard', {
            ...data,
            message: req.session.message || null,
            selectedPeriod: filter.period,
            filter
        });
        delete req.session.message;
    } catch (error) {
        console.error('Dashboard Error:', error);
        next(error);
    }
};

// Sales Report
const saleReport = async (req, res, next) => { 
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const { period, startDate, endDate } = req.body;
        const filter = { period, startDate, endDate, page: 1, limit: 5 };
        req.session.filter = { period, startDate, endDate };
        console.log('Sale Report Filter Saved:', filter);

        const data = await getSalesData(filter);

        req.session.message = 'Report generated successfully!';
        res.render('admin/dashboard', {
            ...data,
            message: req.session.message,
            selectedPeriod: period,
            filter
        });
    } catch (error) {
        console.error('Sale Report Error:', error);
        req.session.message = `Failed to generate report: ${error.message}`;
        res.redirect('/admin');
    }
};

// Download PDF
const downloadPDF = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const { period, startDate, endDate } = req.body;
        const filter = { period, startDate, endDate, page: 1, limit: Infinity };

        const data = await getSalesData(filter);

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.pdf');

        doc.pipe(res);

        doc
            .fontSize(26)
            .fillColor('#333333')
            .text('SOLEUS', { align: 'center' })
            .moveDown(0.5)
            .fontSize(20)
            .fillColor('#000000')
            .text('Sales Report', { align: 'center' })
            .moveDown(0.5)
            .fontSize(12)
            .fillColor('black')
            .text(`Report Generated: ${moment().format('DD/MM/YYYY')}`, { align: 'right' });

        doc
            .moveDown(1)
            .fontSize(12)
            .text(`Period: ${period}${period === 'custom' ? ` (${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')})` : ''}`);

        doc
            .moveDown(1)
            .fontSize(14)
            .fillColor('#000080')
            .text('Sales Summary:', { underline: true })
            .moveDown(0.5)
            .fontSize(12)
            .fillColor('black')
            .text(`Overall Sales Count: ${data.summary.salesCount}`)
            .text(`Overall Order Amount: ${data.summary.orderAmount.toLocaleString()}`)
            .text(`Overall Discount: ${data.summary.discount.toLocaleString()}`);

        doc
            .moveDown(1)
            .fontSize(14)
            .fillColor('#000080')
            .text('Sales Details:', { underline: true });

        const tableTop = doc.y + 15;
        const colWidths = [80, 80, 100, 80, 80, 80];
        const headers = ['Order ID', 'Date', 'Customer', 'Total', 'Discount', 'Coupon'];

        doc
            .fontSize(10)
            .fillColor('black')
            .font('Helvetica-Bold');

        headers.forEach((header, i) => {
            doc.text(header, 50 + colWidths.slice(0, i).reduce((a, b) => a + b, 0), tableTop, { width: colWidths[i], align: 'left' });
        });

        doc
            .moveTo(50, tableTop + 15)
            .lineTo(50 + colWidths.reduce((a, b) => a + b, 0), tableTop + 15)
            .stroke();

        doc.font('Helvetica').fontSize(9);
        let y = tableTop + 25;

        for (const order of data.salesReport) {
            doc
                .text(order.orderId.slice(0, 8), 50, y, { width: colWidths[0] })
                .text(order.orderDate, 50 + colWidths[0], y, { width: colWidths[1] })
                .text(order.userName || 'Unknown', 50 + colWidths.slice(0, 2).reduce((a, b) => a + b, 0), y, { width: colWidths[2] })
                .text(`${(order.finalAmount || 0).toLocaleString()}`, 50 + colWidths.slice(0, 3).reduce((a, b) => a + b, 0), y, { width: colWidths[3] })
                .text(`${(order.discount || 0).toLocaleString()}`, 50 + colWidths.slice(0, 4).reduce((a, b) => a + b, 0), y, { width: colWidths[4] })
                .text(order.couponCode || 'None', 50 + colWidths.slice(0, 5).reduce((a, b) => a + b, 0), y, { width: colWidths[5] });

            y += 20;
            if (y > doc.page.height - 50) {
                doc.addPage();
                y = 50;
            }
        }

        doc.end();
    } catch (error) {
        console.error('PDF Download Error:', error);
        req.session.message = `Failed to download PDF: ${error.message}`;
        res.redirect('/admin');
    }
};

// Download Excel
const downloadExcel = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect('/admin/login');
        }

        const { period, startDate, endDate } = req.body;
        const filter = { period, startDate, endDate, page: 1, limit: Infinity };

        const data = await getSalesData(filter);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.addRow(['SOLEUS Sales Report']).getCell(1).font = { size: 20, bold: true };
        worksheet.addRow([`Generated: ${moment().format('DD/MM/YYYY')}`]).getCell(1).font = { size: 12 };
        worksheet.addRow([`Period: ${period}${period === 'custom' ? ` (${moment(startDate).format('DD/MM/YYYY')} - ${moment(endDate).format('DD/MM/YYYY')})` : ''}`]).getCell(1).font = { size: 12 };
        worksheet.addRow([]);

        worksheet.addRow(['Sales Summary']).getCell(1).font = { size: 14, bold: true, color: { argb: '000080' } };
        worksheet.addRow(['Overall Sales Count', data.summary.salesCount]);
        worksheet.addRow(['Overall Order Amount', `₹${data.summary.orderAmount.toLocaleString()}`]);
        worksheet.addRow(['Overall Discount', `₹${data.summary.discount.toLocaleString()}`]);
        worksheet.addRow([]);

        worksheet.addRow(['Sales Details']).getCell(1).font = { size: 14, bold: true, color: { argb: '000080' } };
        const headers = ['Order ID', 'Date', 'Customer', 'Total Amount', 'Discount', 'Coupon Code'];
        worksheet.addRow(headers);
        headers.forEach((header, i) => {
            worksheet.getCell(`${String.fromCharCode(65 + i)}6`).font = { bold: true };
            worksheet.getColumn(i + 1).width = header.length + 10;
        });

        data.salesReport.forEach(order => {
            worksheet.addRow([
                order.orderId,
                order.orderDate,
                order.userName || 'Unknown',
                `₹${(order.finalAmount || 0).toLocaleString()}`,
                `₹${(order.discount || 0).toLocaleString()}`,
                order.couponCode || 'None'
            ]);
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Excel Download Error:', error);
        req.session.message = `Failed to download Excel: ${error.message}`;
        res.redirect('/admin');
    }
};

// Enhanced Get Sales Data
const getSalesData = async (filter) => {
    const { period, startDate, endDate, page, limit } = filter;
    let match = {};

    try {
        if (period === 'custom' && startDate && endDate) {
            const start = moment(startDate).startOf('day').toDate();
            const end = moment(endDate).endOf('day').toDate();
            match.createdOn = { $gte: start, $lte: end };
        } else {
            const now = moment();
            if (period === 'daily') {
                match.createdOn = { $gte: now.startOf('day').toDate() };
            } else if (period === 'weekly') {
                match.createdOn = { $gte: now.startOf('week').toDate() };
            } else if (period === 'yearly') {
                match.createdOn = { $gte: now.startOf('year').toDate() };
            } else if (period === 'monthly') {
                match.createdOn = { $gte: now.startOf('month').toDate() };
            }
        }
    } catch (error) {
        console.error('Date Filter Error:', error);
    }
    console.log('Match Query:', match);

    // Fetch paginated sales report
    const skip = (page - 1) * limit;
    const totalSalesRecords = await Order.countDocuments(match);
    const totalPages = Math.ceil(totalSalesRecords / limit);

    const salesReport = await Order.find(match)
        .populate('user', 'name')
        .sort({ createdOn: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .catch(err => {
            console.error('salesReport Error:', err);
            return [];
        });

    console.log('Raw Orders (Paginated):', salesReport);

    const formattedSalesReport = salesReport.map(order => ({
        orderId: order.orderId || 'N/A',
        orderDate: order.createdOn ? moment(order.createdOn).format('DD/MM/YYYY') : moment().format('DD/MM/YYYY'),
        userName: order.user?.name || 'Unknown',
        finalAmount: order.finalAmount || 0,
        discount: order.discount || 0,
        couponCode: order.couponCode || 'None',
        orderedItems: order.orderedItems || []
    }));
    console.log('Formatted Sales Report Length:', formattedSalesReport.length);
    console.log('Formatted Sales Report:', formattedSalesReport);

    // Fetch all orders for charts (no pagination)
    const allOrdersForCharts = await Order.find(match)
        .populate({
            path: 'orderedItems.product',
            populate: {
                path: 'category',
                select: 'name'
            }
        })
        .sort({ createdOn: 1 })
        .lean()
        .catch(err => {
            console.error('allOrdersForCharts Error:', err);
            return [];
        });

    // Category-wise sales for pie chart
    const categorySales = {};
    allOrdersForCharts.forEach(order => {
        order.orderedItems.forEach(item => {
            const categoryName = item.product?.category?.name || 'Unknown';
            const amount = (order.finalAmount / order.orderedItems.length) || 0;
            categorySales[categoryName] = (categorySales[categoryName] || 0) + amount;
        });
    });

    const categorySalesData = Object.keys(categorySales).map(category => ({
        category,
        amount: categorySales[category]
    }));
    console.log('Category Sales Data:', categorySalesData);

    // Daily income for line graph
    const dailyIncome = {};
    allOrdersForCharts.forEach(order => {
        const date = moment(order.createdOn).format('DD/MM/YYYY');
        const income = (order.finalAmount || 0) - (order.discount || 0);
        dailyIncome[date] = (dailyIncome[date] || 0) + income;
    });

    const incomeData = Object.keys(dailyIncome).map(date => ({
        date,
        income: dailyIncome[date]
    }));
    console.log('Income Data:', incomeData);

    // Top 5 best-selling products (across all orders, not filtered by period)
    const allOrders = await Order.find()
        .populate('orderedItems.product', 'productName productImage')
        .lean()
        .catch(err => {
            console.error('allOrders Error:', err);
            return [];
        });

    const productSales = {};
    allOrders.forEach(order => {
        order.orderedItems.forEach(item => {
            const productId = item.product?._id?.toString();
            const quantity = item.quantity || 0;
            if (productId) {
                if (!productSales[productId]) {
                    productSales[productId] = {
                        name: item.product?.productName || 'Unknown Product',
                        image: item.product?.productImage?.[0] || '/images/placeholder.jpg',
                        totalSold: 0
                    };
                }
                productSales[productId].totalSold += quantity;
            }
        });
    });

    const topProducts = Object.entries(productSales)
        .map(([productId, data]) => ({
            productId,
            name: data.name,
            image: data.image,
            totalSold: data.totalSold
        }))
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, 5);
    console.log('Top Products:', topProducts);

    const totalOrders = await Order.countDocuments().catch(err => {
        console.error('totalOrders Error:', err);
        return 0;
    });

    const totalCustomers = await User.countDocuments({ isAdmin: false }).catch(err => {
        console.error('totalCustomers Error:', err);
        return 0;
    });

    const summary = {
        salesCount: totalSalesRecords,
        orderAmount: allOrdersForCharts.reduce((sum, order) => sum + (order.finalAmount || 0), 0),
        discount: allOrdersForCharts.reduce((sum, order) => sum + (order.discount || 0), 0)
    };
    console.log('Summary:', summary);

    const totalSale = summary.orderAmount;
    const totalIncome = summary.orderAmount - summary.discount;

    return {
        totalSale,
        totalOrders,
        totalCustomers,
        totalIncome,
        summary,
        salesReport: formattedSalesReport,
        pagination: {
            currentPage: page,
            totalPages,
            limit,
            totalRecords: totalSalesRecords
        },
        categorySalesData,
        incomeData,
        topProducts
    };
};

// Logout
const logout = async (req, res, next) => {
    try {
        delete req.session.admin;
        res.clearCookie(req.sessionID);
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        return res.redirect('/admin/login');
    } catch (error) {
        next(error);
    }
};

// Page Error
const pageerror = async (req, res) => {
    res.render('admin/page-404');
};

module.exports = {
    loadLogin,
    login,
    loadDashboard,
    saleReport,
    downloadPDF,
    downloadExcel,
    pageerror,
    logout
};