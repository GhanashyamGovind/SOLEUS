const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Order = require('../../models/orderSchema');

const downloadPDF = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findOne({ orderId })
      .populate('user', 'name email')
      .populate('orderedItems.product', 'productName productImage');

    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${order.orderId}_Soleus.pdf`);

    doc.pipe(res);

    // Register proper font
    const fontPath = path.resolve(__dirname, '../../public/fonts/NotoSans-Regular.ttf');
    if (fs.existsSync(fontPath)) {
      doc.registerFont('NotoSans', fontPath);
      doc.font('NotoSans');
    }

    // Header and Logo
    const shopLogoPath = path.resolve(__dirname, '../../public/images/soleus_log.png');
    if (fs.existsSync(shopLogoPath)) {
      doc.image(shopLogoPath, 50, 45, { width: 40, height: 40 }); // smaller size
    }

    doc
      .fontSize(20)
      .text('SOLEUS', 100, 57) // Adjusted to avoid overlapping logo
      .fontSize(10)
      .text('Shop Address: BUILDING NAME, KERALA, INDIA', 50, 80)
      .text('Email: 2003soleus@gmail.com', 50, 95)
      .moveDown();

    // Invoice Header
    doc
      .fontSize(16)
      .text(`Invoice #${order.orderId}`, 50, 130)
      .text(`Invoice Date: ${order.invoiceDate
        ? new Date(order.invoiceDate).toLocaleDateString('en-IN')
        : new Date(order.createdOn).toLocaleDateString('en-IN')}`, 50, 150)
      .moveDown();

    // Customer Details
    doc
      .fontSize(12)
      .text('Bill To:', 50, 190)
      .fontSize(10)
      .text(`Name: ${order.user.name}`, 50, 210)
      .text(`Email: ${order.user.email}`, 50, 225)
      .text('Shipping Address:', 50, 240)
      .text(`${order.address.name}`, 50, 255)
      .text(`${order.address.buildingName}`, 50, 270)
      .text(`${order.address.landMark}, ${order.address.city}, ${order.address.state} ${order.address.pincode}`, 50, 285)
      .text(`Landmark: ${order.address.landMark}`, 50, 300)
      .text(`Phone: +91 ${order.address.phone}`, 50, 315)
      .moveDown();

    // Ordered Items Header
    doc
      .fontSize(12)
      .text('Ordered Items:', 50, 350)
      .moveDown();

    // Table Header
    const tableTop = 370;
    doc
      .fontSize(10)
      .text('Image', 50, tableTop)
      .text('Product', 100, tableTop)
      .text('Size', 200, tableTop)
      .text('Color', 230, tableTop)
      .text('SKU', 270, tableTop)
      .text('Quantity', 400, tableTop)
      .text('Price', 450, tableTop)
      .text('Total', 500, tableTop);

    // Table Body
    let y = tableTop + 25;

    for (const item of order.orderedItems) {
      const total = item.quantity * item.price;

      // Product image handling
      if (item.product.productImage && item.product.productImage[0]) {
        const imagePath = path.resolve(__dirname, `../../public/Uploads/re-image/${item.product.productImage[0]}`);
        if (fs.existsSync(imagePath)) {
          doc.image(imagePath, 50, y - 5, {
            fit: [30, 30],
            align: 'center',
            valign: 'center'
          });
        }
      }

      doc
        .fontSize(10)
        .text(item.product.productName || 'N/A', 100, y, { width: 90 })
        .text(item.size, 200, y)
        .text(item.color, 230, y)
        .text(item.sku, 270, y, { width: 120 })
        .text(item.quantity.toString(), 400, y)
        .text(`${item.price.toFixed(2)}`, 450, y)
        .text(`${total.toFixed(2)}`, 500, y);

      y += 40;
    }

    // Totals
    const deliveryCharge = order.totalPrice >= 2500 ? 0 : 99;
    y += 20;
    doc
      .fontSize(10)
      .text(`Subtotal: ${order.totalPrice.toFixed(2)}`, 400, y)
      .text(`Delivery: ${deliveryCharge === 0 ? 'Free' : `${deliveryCharge.toFixed(2)}`}`, 400, y + 15)
      .text(`Discount: ${order.discount.toFixed(2)}`, 400, y + 30)
      .text(`Final Amount: ${order.finalAmount.toFixed(2)}`, 400, y + 45);

    // Payment Info
    y += 70;
    doc
      .fontSize(12)
      .text('PAYMENT DETAILS:', 50, y)
      .fontSize(10)
      .text(`Payment Method: ${order.paymentMethod}`, 50, y + 15)
      .text(`Status: ${order.status}`, 50, y + 30)
      .text(`Coupon Applied: ${order.couponApplied ? 'Yes' : 'No'}`, 50, y + 45);

    // Footer
    const pageHeight = doc.page.height;
    const footerY = pageHeight - 100;
    doc
      .fontSize(10)
      .text('Thank you for your purchase!', 50, footerY, { align: 'center' })
      .text('Contact us at 2003soleus@gmail.com for any queries.', 50, footerY + 15, { align: 'center' });

    doc.end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  downloadPDF,
};
