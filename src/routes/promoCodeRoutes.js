const express = require("express");
const router = express.Router();
const promoCodeController = require("../controllers/promoCodeController");
const { verifyCustomer, verifyAdmin } = require("../middleware/auth");

// =======================
// CUSTOMER ROUTES
// =======================

// Validate promo code (customer applies code in checkout)
router.post("/validate", verifyCustomer, promoCodeController.validatePromoCode);

// =======================
// ADMIN ROUTES
// =======================

// Create promo code
router.post("/", verifyAdmin, promoCodeController.createPromoCode);

// Get all promo codes
router.get("/", verifyAdmin, promoCodeController.getAllPromoCodes);

// Update promo code
router.put("/:id", verifyAdmin, promoCodeController.updatePromoCode);

// Delete promo code
router.delete("/:id", verifyAdmin, promoCodeController.deletePromoCode);

// Deactivate promo code
router.put("/:id/deactivate", verifyAdmin, promoCodeController.deactivatePromoCode);

// Get promo code usage stats
router.get("/:id/stats", verifyAdmin, promoCodeController.getPromoStats);

module.exports = router;