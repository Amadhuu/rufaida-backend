const express = require("express");
const router = express.Router();
const riderController = require("../controllers/riderController");
const { verifyRider } = require("../middleware/auth");

// ==============================
// AUTH (public)
// ==============================
router.post("/register", riderController.registerRider);
router.post("/login", riderController.loginRider);

// ==============================
// LOCATION (protected)
// ==============================
router.put("/location", verifyRider, riderController.updateLocation);
router.get("/location/:id", verifyRider, riderController.getLocation);

// ==============================
// AVAILABILITY (protected)
// ==============================
router.put("/availability", verifyRider, riderController.updateAvailability);

// ==============================
// ADMIN/PUBLIC: list all available riders
// ==============================
router.get("/available", riderController.getAvailableRiders);

module.exports = router;
