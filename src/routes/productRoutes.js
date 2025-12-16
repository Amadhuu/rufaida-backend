const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

// Create product
router.post("/", productController.createProduct);

// Get all products
router.get("/", productController.getAllProducts);

// Get single product
router.get("/:id", productController.getProductById);

// Update product
router.put("/:id", productController.updateProduct);

// Delete product
router.delete("/:id", productController.deleteProduct);

module.exports = router;
