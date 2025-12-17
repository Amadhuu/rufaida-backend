const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notificationController");
const { verifyCustomer, verifyRider, verifyAdmin } = require("../middleware/auth");

// ========================================
// CUSTOMER/RIDER ROUTES
// ========================================

// Save FCM token (on app startup)
router.post("/fcm-token", verifyCustomer, notificationController.saveFCMToken);

// Delete FCM token (on logout)
router.delete("/fcm-token", verifyCustomer, notificationController.deleteFCMToken);

// Get my notifications
router.get("/my", verifyCustomer, notificationController.getMyNotifications);

// Mark notification as read
router.put("/:id/read", verifyCustomer, notificationController.markAsRead);

// Mark all as read
router.put("/read-all", verifyCustomer, notificationController.markAllAsRead);

// Delete notification
router.delete("/:id", verifyCustomer, notificationController.deleteNotification);

// Clear all notifications
router.delete("/clear-all", verifyCustomer, notificationController.clearAllNotifications);

// ========================================
// ADMIN ROUTES
// ========================================

// Send notification to specific user
router.post("/send-to-user", verifyAdmin, notificationController.sendNotificationToUser);

// Send notification to all users
router.post("/send-to-all", verifyAdmin, notificationController.sendNotificationToAll);

// Get all notifications (admin view)
router.get("/admin/all", verifyAdmin, notificationController.getAllNotifications);

module.exports = router;