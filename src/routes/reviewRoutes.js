const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { verifyCustomer, verifyAdmin } = require("../middleware/auth");

// =======================
// PUBLIC ROUTES
// =======================

// Get reviews for a product (anyone can view)
router.get("/product/:product_id", reviewController.getProductReviews);

// Get product rating summary
router.get("/product/:product_id/summary", reviewController.getProductRatingSummary);

// =======================
// CUSTOMER ROUTES
// =======================

// Add review
router.post("/", verifyCustomer, reviewController.addReview);

// Get my reviews
router.get("/my", verifyCustomer, reviewController.getMyReviews);

// Update my review
router.put("/:id", verifyCustomer, reviewController.updateReview);

// Delete my review
router.delete("/:id", verifyCustomer, reviewController.deleteReview);

// =======================
// ADMIN ROUTES
// =======================

// Get all reviews (admin moderation)
router.get("/admin/all", verifyAdmin, reviewController.getAllReviews);

// Delete any review (admin moderation)
router.delete("/admin/:id", verifyAdmin, reviewController.adminDeleteReview);

module.exports = router;