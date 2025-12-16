const express = require("express");
const router = express.Router();
const addressController = require("../controllers/addressController");
const { verifyCustomer } = require("../middleware/auth");

// GET all addresses for user
router.get("/", verifyCustomer, addressController.getAddresses);

// CREATE new address
router.post("/", verifyCustomer, addressController.createAddress);

// UPDATE address
router.put("/:id", verifyCustomer, addressController.updateAddress);

// DELETE address
router.delete("/:id", verifyCustomer, addressController.deleteAddress);

// SET default address
router.post("/:id/set-default", verifyCustomer, addressController.setDefaultAddress);

module.exports = router;