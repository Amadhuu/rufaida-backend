const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// OTP routes
router.post("/otp/send", authController.sendOtp);
router.post("/otp/verify", authController.verifyOtp);

module.exports = router;