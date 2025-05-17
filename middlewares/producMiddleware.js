module.exports = function(schema) {
  schema.pre('save', function(next) {
    // Enforce SKU uniqueness within the product
    const skuSet = new Set();
    for (const variant of this.variants) {
      if (skuSet.has(variant.sku)) {
        return next(new Error(`Duplicate SKU ${variant.sku} found within product variants`));
      }
      skuSet.add(variant.sku);
    }

    // Compute quantity
    this.quantity = this.variants.reduce((total, variant) => total + variant.stock, 0);

    // Compute min prices
    if (this.variants.length > 0) {
      this.regularPrice = Math.min(...this.variants.map(v => v.regularPrice));
      this.salePrice = Math.min(...this.variants.map(v => v.salePrice));
    } else {
      this.regularPrice = 0;
      this.salePrice = 0;
    }

    // Update status
    if (this.quantity > 0) {
      this.status = 'Available';
    } else {
      this.status = 'Out of stock';
    }

    next();
  });
};