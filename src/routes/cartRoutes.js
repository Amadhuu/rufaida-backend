const express = require("express");
const router = express.Router();
const cartController = require("../controllers/cartController");
const { verifyCustomer } = require("../middleware/auth");

router.get("/", verifyCustomer, cartController.getCart);
router.post("/", verifyCustomer, cartController.addToCart);
router.delete("/:product_id", verifyCustomer, cartController.removeFromCart);
router.put("/:product_id", verifyCustomer, cartController.updateQuantity);
router.delete("/", verifyCustomer, cartController.clearCart);

module.exports = router;