const express = require("express");
const router = express.Router();

const orderController = require("../controllers/orderController");
const { verifyCustomer, verifyAdmin, verifyRider } = require("../middleware/auth");

// =======================
// CUSTOMER ROUTES
// =======================

// Customer creates order
router.post("/", verifyCustomer, orderController.createOrder);

// Customer gets their orders
router.get("/my", verifyCustomer, orderController.getMyOrders);

// Customer gets single order
router.get("/:id", verifyCustomer, orderController.getOrderById);

// =======================
// ADMIN ROUTES
// =======================

// Admin: get all orders
router.get("/admin/all", verifyAdmin, orderController.getAllOrders);

// Admin assigns rider
router.put("/assign/:id", verifyAdmin, orderController.assignRider);

// =======================
// RIDER ROUTES
// =======================

// Rider sees their assigned orders
router.get("/rider/my", verifyRider, orderController.getRiderAssignedOrders);

// Rider updates order status
router.put("/status/:id", verifyRider, orderController.updateStatus);

router.put("/rider/start/:id", verifyRider, orderController.startOrder);
router.put("/rider/picked/:id", verifyRider, orderController.pickupOrder);
router.put("/rider/delivered/:id", verifyRider, orderController.deliverOrder);

// ADMIN CONTROLS
router.get("/admin/filter", verifyAdmin, orderController.filterOrders);
router.get("/admin/stats", verifyAdmin, orderController.getAdminStats);
router.put("/admin/cancel/:id", verifyAdmin, orderController.cancelOrder);
router.put("/admin/refund/:id", verifyAdmin, orderController.refundOrder);
router.put("/admin/status/:id", verifyAdmin, orderController.overrideStatus);

module.exports = router;