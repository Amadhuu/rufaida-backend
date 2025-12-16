const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { verifyCustomer } = require("../middleware/auth");

router.get("/me", verifyCustomer, userController.getMe);
router.post("/update", verifyCustomer, userController.updateUser);
router.get("/:id", userController.getUserById);

// Existing routes
router.post("/register", userController.register);
router.post("/login", userController.login);

module.exports = router;
