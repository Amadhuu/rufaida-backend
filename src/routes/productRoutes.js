const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

// Search products
router.get("/search", productController.searchProducts);

// Get products by category
router.get("/category/:category", productController.getProductsByCategory);

// Create product
router.post("/", productController.createProduct);

// Get all products
router.get("/", productController.getAllProducts);

// Get single product
router.get("/:id", productController.getProductById);

// Update product
router.put("/:id", productController.updateProduct);

// Update stock
router.put("/:id/stock", productController.updateStock);

// Delete product
router.delete("/:id", productController.deleteProduct);

module.exports = router;