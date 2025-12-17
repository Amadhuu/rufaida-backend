const pool = require("../config/db");

// ========================================
// SAVE FCM TOKEN (Customer/Rider app startup)
// ========================================
exports.saveFCMToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token, device_type } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    // Check if token already exists for this user
    const existing = await pool.query(
      `SELECT id FROM fcm_tokens WHERE user_id = $1 AND token = $2`,
      [userId, token]
    );

    if (existing.rows.length > 0) {
      // Update existing token
      await pool.query(
        `UPDATE fcm_tokens 
         SET device_type = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND token = $3`,
        [device_type || 'android', userId, token]
      );
    } else {
      // Insert new token
      await pool.query(
        `INSERT INTO fcm_tokens (user_id, token, device_type)
         VALUES ($1, $2, $3)`,
        [userId, token, device_type || 'android']
      );
    }

    res.json({ message: "FCM token saved successfully" });

  } catch (err) {
    console.error("Save FCM token error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// DELETE FCM TOKEN (User logs out)
// ========================================
exports.deleteFCMToken = async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: "Token is required" });
    }

    await pool.query(
      `DELETE FROM fcm_tokens WHERE user_id = $1 AND token = $2`,
      [userId, token]
    );

    res.json({ message: "FCM token removed successfully" });

  } catch (err) {
    console.error("Delete FCM token error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// CREATE NOTIFICATION (Internal function)
// ========================================
async function createNotification(userId, title, body, type, relatedId) {
  try {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, title, body, type, related_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, title, body, type || 'general', relatedId || null]
    );
    return result.rows[0];
  } catch (err) {
    console.error("Create notification error:", err);
    throw err;
  }
}

// Export for use in other controllers (like orderController)
exports.createNotification = createNotification;

// ========================================
// GET USER NOTIFICATIONS
// ========================================
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    const notifications = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    // Get unread count
    const unreadCount = await pool.query(
      `SELECT COUNT(*) as count FROM notifications 
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    res.json({
      notifications: notifications.rows,
      unread_count: parseInt(unreadCount.rows[0].count)
    });

  } catch (err) {
    console.error("Get notifications error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// MARK NOTIFICATION AS READ
// ========================================
exports.markAsRead = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE notifications 
       SET is_read = true
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification marked as read" });

  } catch (err) {
    console.error("Mark as read error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// MARK ALL NOTIFICATIONS AS READ
// ========================================
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      `UPDATE notifications 
       SET is_read = true
       WHERE user_id = $1 AND is_read = false`,
      [userId]
    );

    res.json({ message: "All notifications marked as read" });

  } catch (err) {
    console.error("Mark all as read error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// DELETE NOTIFICATION
// ========================================
exports.deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM notifications 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    res.json({ message: "Notification deleted" });

  } catch (err) {
    console.error("Delete notification error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// CLEAR ALL NOTIFICATIONS
// ========================================
exports.clearAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      `DELETE FROM notifications WHERE user_id = $1`,
      [userId]
    );

    res.json({ message: "All notifications cleared" });

  } catch (err) {
    console.error("Clear all notifications error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: SEND NOTIFICATION TO USER
// ========================================
exports.sendNotificationToUser = async (req, res) => {
  try {
    const { user_id, title, body, type, related_id } = req.body;

    if (!user_id || !title || !body) {
      return res.status(400).json({ 
        error: "user_id, title, and body are required" 
      });
    }

    // Check if user exists
    const userCheck = await pool.query(
      `SELECT id FROM users WHERE id = $1`,
      [user_id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Create notification
    const notification = await createNotification(
      user_id, 
      title, 
      body, 
      type || 'general', 
      related_id || null
    );

    // TODO: Send push notification via Firebase Cloud Messaging
    // Get user's FCM tokens and send push notification
    const tokens = await pool.query(
      `SELECT token FROM fcm_tokens WHERE user_id = $1`,
      [user_id]
    );

    res.json({
      message: "Notification sent successfully",
      notification: notification,
      fcm_tokens_count: tokens.rows.length
    });

  } catch (err) {
    console.error("Send notification to user error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: SEND NOTIFICATION TO ALL USERS
// ========================================
exports.sendNotificationToAll = async (req, res) => {
  try {
    const { title, body, type, role } = req.body;

    if (!title || !body) {
      return res.status(400).json({ error: "title and body are required" });
    }

    // Get all users (optionally filter by role)
    let userQuery = `SELECT id FROM users`;
    let params = [];

    if (role) {
      userQuery += ` WHERE role = $1`;
      params.push(role);
    }

    const users = await pool.query(userQuery, params);

    // Create notification for each user
    const promises = users.rows.map(user => 
      createNotification(user.id, title, body, type || 'general', null)
    );

    await Promise.all(promises);

    res.json({
      message: "Notifications sent to all users",
      users_notified: users.rows.length
    });

  } catch (err) {
    console.error("Send notification to all error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: GET ALL NOTIFICATIONS
// ========================================
exports.getAllNotifications = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;

    const notifications = await pool.query(
      `SELECT 
        n.*,
        u.full_name,
        u.phone
       FROM notifications n
       JOIN users u ON n.user_id = u.id
       ORDER BY n.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json(notifications.rows);

  } catch (err) {
    console.error("Get all notifications (admin) error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// HELPER: Send Order Status Notification
// ========================================
exports.sendOrderStatusNotification = async (orderId, userId, status) => {
  try {
    const statusMessages = {
      'pending': {
        title: 'Order Placed',
        body: `Your order #${orderId} has been placed successfully!`
      },
      'assigned': {
        title: 'Rider Assigned',
        body: `A rider has been assigned to your order #${orderId}`
      },
      'rider_started': {
        title: 'Rider on the Way',
        body: `The rider is on the way to pick up your order #${orderId}`
      },
      'picked_up': {
        title: 'Order Picked Up',
        body: `Your order #${orderId} has been picked up and is on the way!`
      },
      'delivered': {
        title: 'Order Delivered',
        body: `Your order #${orderId} has been delivered. Enjoy!`
      },
      'cancelled': {
        title: 'Order Cancelled',
        body: `Your order #${orderId} has been cancelled`
      }
    };

    const message = statusMessages[status];
    if (message) {
      await createNotification(
        userId,
        message.title,
        message.body,
        'order_status',
        orderId
      );
    }
  } catch (err) {
    console.error("Send order status notification error:", err);
  }
};