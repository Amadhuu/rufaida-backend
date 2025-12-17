const pool = require("../config/db");
const { sendOrderStatusNotification } = require("./notificationController");

// CREATE ORDER (customer) - UPDATED WITH PROMO CODE SUPPORT
exports.createOrder = async (req, res) => {
  const client = await pool.connect();

  try {
    const userId = req.user.id;
    const { items, total_price, delivery_address, promo_code_id, discount_amount } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Order must contain items" });
    }

    await client.query("BEGIN");

    // If promo code is used, validate and record usage
    let finalTotal = total_price;
    let appliedDiscount = 0;

    if (promo_code_id && discount_amount) {
      // Verify promo code exists and is valid
      const promoCheck = await client.query(
        `SELECT * FROM promo_codes WHERE id = $1 AND is_active = true`,
        [promo_code_id]
      );

      if (promoCheck.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Invalid promo code" });
      }

      const promo = promoCheck.rows[0];

      // Check if user already used this promo
      const usageCheck = await client.query(
        `SELECT * FROM promo_code_usage WHERE user_id = $1 AND promo_code_id = $2`,
        [userId, promo_code_id]
      );

      if (usageCheck.rows.length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "You have already used this promo code" });
      }

      // Check usage limit
      if (promo.usage_limit && promo.used_count >= promo.usage_limit) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Promo code usage limit reached" });
      }

      appliedDiscount = parseFloat(discount_amount);
      finalTotal = total_price - appliedDiscount;

      // Update promo code used count
      await client.query(
        `UPDATE promo_codes SET used_count = used_count + 1 WHERE id = $1`,
        [promo_code_id]
      );
    }

    // Insert order
    const orderResult = await client.query(
      `INSERT INTO orders (user_id, total_price, delivery_address, status, payment_method, promo_code_id, discount_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, finalTotal, delivery_address, 'pending', 'cash_on_delivery', promo_code_id || null, appliedDiscount]
    );

    const orderId = orderResult.rows[0].id;

    // Insert order items
    for (let item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.product_id, item.quantity, item.price]
      );

      // Optional: Reduce product stock
      await client.query(
        `UPDATE products 
         SET stock = stock - $1,
             is_available = CASE WHEN stock - $1 > 0 THEN true ELSE false END
         WHERE id = $2`,
        [item.quantity, item.product_id]
      );
    }

    // Record promo code usage if used
    if (promo_code_id && appliedDiscount > 0) {
      await client.query(
        `INSERT INTO promo_code_usage (promo_code_id, user_id, order_id, discount_amount)
         VALUES ($1, $2, $3, $4)`,
        [promo_code_id, userId, orderId, appliedDiscount]
      );
    }

    // Clear user's cart after successful order
    await client.query(
      `DELETE FROM cart WHERE user_id = $1`,
      [userId]
    );

    await client.query("COMMIT");

    // Send notification
    await sendOrderStatusNotification(orderId, userId, 'pending');

    return res.json({
      message: "Order created successfully",
      order_id: orderId,
      order: orderResult.rows[0],
      discount_applied: appliedDiscount
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Create order error:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};


// GET CUSTOMER ORDERS
exports.getMyOrders = async (req, res) => {
  try {
    const userId = req.user.id; // from token

    const orders = await pool.query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    return res.json(orders.rows);

  } catch (err) {
    console.error("Get my orders error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// SECURE GET SINGLE ORDER
exports.getOrderById = async (req, res) => {
  try {
    const orderId = req.params.id;
    const userId = req.user.id;
    const role = req.user.role;

    // Get the order first
    const orderResult = await pool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderResult.rows[0];

    // --- ACCESS CONTROL ---
    if (role === "customer" && order.user_id !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (role === "rider" && order.rider_id !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Admin has full access — no checks

    // Fetch items WITH PRODUCT DETAILS
    const items = await pool.query(
      `SELECT 
        oi.id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.price,
        p.name as product_name,
        p.image_url,
        p.category
       FROM order_items oi
       JOIN products p ON oi.product_id = p.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    console.log("📦 Backend: Returning order with", items.rows.length, "items");

    return res.json({
      order,
      items: items.rows,
    });

  } catch (err) {
    console.error("Single order error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ADMIN: ALL ORDERS
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await pool.query(`SELECT * FROM orders ORDER BY created_at DESC`);
    res.json(orders.rows);
  } catch (err) {
    console.error("Admin orders error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ASSIGN RIDER
exports.assignRider = async (req, res) => {
  try {
    const order_id = req.params.id;
    const { rider_id } = req.body; // this is users.id

    // Check if order exists
    const order = await pool.query("SELECT * FROM orders WHERE id = $1", [order_id]);
    if (order.rows.length === 0)
      return res.status(404).json({ error: "Order not found" });

    // Check if rider exists in riders table using user_id
    const riderCheck = await pool.query(
      "SELECT * FROM riders WHERE user_id = $1",
      [rider_id]
    );

    if (riderCheck.rows.length === 0)
      return res.status(404).json({ error: "Rider not found" });

    // Assign rider (rider_id is the users.id)
    await pool.query(
      `UPDATE orders
       SET rider_id = $1, status = 'assigned'
       WHERE id = $2`,
      [rider_id, order_id]
    );

    res.json({ message: "Rider assigned successfully" });

  } catch (error) {
    console.error("Error assigning rider:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// UPDATE STATUS
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const result = await pool.query(
      `UPDATE orders SET status=$1 WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ error: "Order not found" });

    await sendOrderStatusNotification(req.params.id, result.rows[0].user_id, status);

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update status error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET ORDERS ASSIGNED TO LOGGED-IN RIDER
exports.getRiderAssignedOrders = async (req, res) => {
  try {
    const riderId = req.user.id; // always users.id

    const orders = await pool.query(
      `SELECT * FROM orders
       WHERE rider_id = $1
       ORDER BY created_at DESC`,
      [riderId]
    );

    return res.json(orders.rows);

  } catch (error) {
    console.error("Rider assigned orders error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// RIDER STARTS ORDER
exports.startOrder = async (req, res) => {
  try {
    const riderId = req.user.id; 
    const orderId = req.params.id;

    const order = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND rider_id = $2`,
      [orderId, riderId]
    );

    if (order.rows.length === 0) {
      return res.status(400).json({ error: "Order not assigned to this rider" });
    }

    await pool.query(
      `UPDATE orders
       SET status = 'rider_started'
       WHERE id = $1`,
      [orderId]
    );

    await sendOrderStatusNotification(orderId, order.rows[0].user_id, 'rider_started');

    return res.json({ message: "Order started" });

  } catch (error) {
    console.error("Start order error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// RIDER CONFIRMS PICKUP
exports.pickupOrder = async (req, res) => {
  try {
    const riderId = req.user.id;
    const orderId = req.params.id;

    const order = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND rider_id = $2`,
      [orderId, riderId]
    );

    if (order.rows.length === 0) {
      return res.status(400).json({ error: "Order not assigned to this rider" });
    }

    await pool.query(
      `UPDATE orders
       SET status = 'picked_up'
       WHERE id = $1`,
      [orderId]
    );

    await sendOrderStatusNotification(orderId, order.rows[0].user_id, 'picked_up');

    return res.json({ message: "Order picked up" });

  } catch (error) {
    console.error("Pickup order error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// RIDER MARKS ORDER AS DELIVERED
exports.deliverOrder = async (req, res) => {
  try {
    const riderId = req.user.id;
    const orderId = req.params.id;

    const order = await pool.query(
      `SELECT * FROM orders WHERE id = $1 AND rider_id = $2`,
      [orderId, riderId]
    );

    if (order.rows.length === 0) {
      return res.status(400).json({ error: "Order not assigned to this rider" });
    }
    
    await pool.query(
      `UPDATE orders
       SET status = 'delivered'
       WHERE id = $1`,
      [orderId]
    );
    
    await sendOrderStatusNotification(orderId, order.rows[0].user_id, 'delivered');

    return res.json({ message: "Order delivered" });

  } catch (error) {
    console.error("Deliver order error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// ADMIN: CANCEL ORDER
exports.cancelOrder = async (req, res) => {
  try {
    const role = req.user.role;
    const orderId = req.params.id;

    if (role !== "admin") {
      return res.status(403).json({ error: "Only admin can cancel orders" });
    }

    const order = await pool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    await pool.query(
      `UPDATE orders
       SET status = 'cancelled',
           rider_id = NULL
       WHERE id = $1`,
      [orderId]
    );

    return res.json({
      message: "Order cancelled successfully",
      order_id: orderId
    });

  } catch (error) {
    console.error("Cancel order error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// ADMIN: REFUND ORDER
exports.refundOrder = async (req, res) => {
  try {
    const role = req.user.role;
    const orderId = req.params.id;

    if (role !== "admin") {
      return res.status(403).json({ error: "Only admin can refund orders" });
    }

    const order = await pool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    await pool.query(
      `UPDATE orders
       SET status = 'refunded'
       WHERE id = $1`,
      [orderId]
    );

    return res.json({
      message: "Order refunded successfully",
      order_id: orderId
    });

  } catch (error) {
    console.error("Refund order error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// ADMIN: OVERRIDE ORDER STATUS
exports.overrideStatus = async (req, res) => {
  try {
    const role = req.user.role;
    const orderId = req.params.id;
    const { status } = req.body;

    if (role !== "admin") {
      return res.status(403).json({ error: "Only admin can update order status" });
    }

    if (!status) {
      return res.status(400).json({ error: "Status is required" });
    }

    const order = await pool.query(
      `SELECT * FROM orders WHERE id = $1`,
      [orderId]
    );

    if (order.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2`,
      [status, orderId]
    );

    return res.json({
      message: "Order status updated",
      order_id: orderId,
      new_status: status
    });

  } catch (error) {
    console.error("Override order status error:", error);
    return res.status(500).json({ error: error.message });
  }
}; 

// ADMIN: FILTER ORDERS
exports.filterOrders = async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== "admin") {
      return res.status(403).json({ error: "Only admin can filter orders" });
    }

    const { status, customer_id, rider_id, date, from, to } = req.query;

    let conditions = [];
    let values = [];
    let index = 1;

    // STATUS
    if (status) {
      conditions.push(`status = $${index++}`);
      values.push(status);
    }

    // FILTER BY CUSTOMER
    if (customer_id) {
      conditions.push(`user_id = $${index++}`);
      values.push(customer_id);
    }

    // FILTER BY RIDER
    if (rider_id) {
      conditions.push(`rider_id = $${index++}`);
      values.push(rider_id);
    }

    // DATE FILTER
    if (date === "today") {
      conditions.push(`DATE(created_at) = CURRENT_DATE`);
    } else if (date === "yesterday") {
      conditions.push(`DATE(created_at) = CURRENT_DATE - INTERVAL '1 day'`);
    } else if (date === "week") {
      conditions.push(`created_at >= CURRENT_DATE - INTERVAL '7 days'`);
    } else if (date === "month") {
      conditions.push(`DATE_PART('month', created_at) = DATE_PART('month', CURRENT_DATE)
                       AND DATE_PART('year', created_at) = DATE_PART('year', CURRENT_DATE)`);
    }

    // CUSTOM RANGE
    if (from && to) {
      conditions.push(`DATE(created_at) BETWEEN $${index++} AND $${index++}`);
      values.push(from, to);
    }

    // BUILD QUERY
    let query = `SELECT * FROM orders`;
    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(" AND ");
    }
    query += ` ORDER BY created_at DESC`;

    const results = await pool.query(query, values);

    return res.json(results.rows);

  } catch (error) {
    console.error("Filter orders error:", error);
    return res.status(500).json({ error: error.message });
  }
};

// ADMIN: STATISTICS
exports.getAdminStats = async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== "admin") {
      return res.status(403).json({ error: "Only admin can view statistics" });
    }

    const stats = {};

    // TODAY ORDERS
    const todayOrders = await pool.query(
      `SELECT COUNT(*) FROM orders 
       WHERE DATE(created_at) = CURRENT_DATE`
    );
    stats.today_orders = Number(todayOrders.rows[0].count);

    // TODAY DELIVERED
    const todayDelivered = await pool.query(
      `SELECT COUNT(*) FROM orders 
       WHERE status = 'delivered' AND DATE(created_at) = CURRENT_DATE`
    );
    stats.today_delivered = Number(todayDelivered.rows[0].count);

    // TODAY CANCELLED
    const todayCancelled = await pool.query(
      `SELECT COUNT(*) FROM orders 
       WHERE status = 'cancelled' AND DATE(created_at) = CURRENT_DATE`
    );
    stats.today_cancelled = Number(todayCancelled.rows[0].count);

    // TODAY PENDING
    const todayPending = await pool.query(
      `SELECT COUNT(*) FROM orders 
       WHERE status NOT IN ('delivered', 'cancelled') 
       AND DATE(created_at) = CURRENT_DATE`
    );
    stats.today_pending = Number(todayPending.rows[0].count);

    // TODAY REVENUE
    const todayRevenue = await pool.query(
      `SELECT COALESCE(SUM(total_price), 0) AS revenue 
       FROM orders 
       WHERE status = 'delivered' 
       AND DATE(created_at) = CURRENT_DATE`
    );
    stats.today_revenue = Number(todayRevenue.rows[0].revenue);

    // MONTH REVENUE
    const monthRevenue = await pool.query(
      `SELECT COALESCE(SUM(total_price), 0) AS revenue 
       FROM orders 
       WHERE status = 'delivered'
       AND DATE_PART('month', created_at) = DATE_PART('month', CURRENT_DATE)
       AND DATE_PART('year', created_at) = DATE_PART('year', CURRENT_DATE)`
    );
    stats.month_revenue = Number(monthRevenue.rows[0].revenue);

    // WEEK ORDERS
    const weekOrders = await pool.query(
      `SELECT COUNT(*) FROM orders
       WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
    );
    stats.week_orders = Number(weekOrders.rows[0].count);

    // ACTIVE RIDERS (available = TRUE)
    const activeRiders = await pool.query(
      `SELECT COUNT(*) FROM riders 
       WHERE is_available = TRUE`
    );
    stats.active_riders = Number(activeRiders.rows[0].count);

    // ACTIVE CUSTOMERS (placed order in last 30 days)
    const activeCustomers = await pool.query(
      `SELECT COUNT(DISTINCT user_id) 
       FROM orders 
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
    );
    stats.active_customers = Number(activeCustomers.rows[0].count);

    // SALES CHART: LAST 7 DAYS
    const chart7 = await pool.query(
      `SELECT DATE(created_at) AS day, 
              COALESCE(SUM(total_price), 0) AS revenue
       FROM orders
       WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY day
       ORDER BY day ASC`
    );
    stats.chart_7_days = chart7.rows;

    // SALES CHART: LAST 30 DAYS
    const chart30 = await pool.query(
      `SELECT DATE(created_at) AS day, 
              COALESCE(SUM(total_price), 0) AS revenue
       FROM orders
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY day
       ORDER BY day ASC`
    );
    stats.chart_30_days = chart30.rows;

    return res.json(stats);

  } catch (error) {
    console.error("Admin stats error:", error);
    return res.status(500).json({ error: error.message });
  }
};
