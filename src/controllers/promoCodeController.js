const pool = require("../config/db");

// ========================================
// CUSTOMER: VALIDATE & APPLY PROMO CODE
// ========================================
exports.validatePromoCode = async (req, res) => {
  try {
    const userId = req.user.id;
    const { code, cart_total } = req.body;

    if (!code || cart_total === undefined) {
      return res.status(400).json({ error: "Code and cart_total are required" });
    }

    // Find promo code
    const promoResult = await pool.query(
      `SELECT * FROM promo_codes 
       WHERE UPPER(code) = UPPER($1) AND is_active = true`,
      [code]
    );

    if (promoResult.rows.length === 0) {
      return res.status(404).json({ error: "Invalid or expired promo code" });
    }

    const promo = promoResult.rows[0];

    // Check if expired
    if (promo.valid_until && new Date(promo.valid_until) < new Date()) {
      return res.status(400).json({ error: "Promo code has expired" });
    }

    // Check if not yet valid
    if (promo.valid_from && new Date(promo.valid_from) > new Date()) {
      return res.status(400).json({ error: "Promo code is not yet active" });
    }

    // Check minimum order amount
    if (cart_total < promo.min_order_amount) {
      return res.status(400).json({ 
        error: `Minimum order amount is ${promo.min_order_amount}` 
      });
    }

    // Check usage limit
    if (promo.usage_limit && promo.used_count >= promo.usage_limit) {
      return res.status(400).json({ error: "Promo code usage limit reached" });
    }

    // Check if user already used this code
    const usageCheck = await pool.query(
      `SELECT * FROM promo_code_usage 
       WHERE user_id = $1 AND promo_code_id = $2`,
      [userId, promo.id]
    );

    if (usageCheck.rows.length > 0) {
      return res.status(400).json({ error: "You have already used this promo code" });
    }

    // Calculate discount
    let discount_amount = 0;
    
    if (promo.discount_type === "percentage") {
      discount_amount = (cart_total * promo.discount_value) / 100;
      
      // Apply max discount cap if exists
      if (promo.max_discount && discount_amount > promo.max_discount) {
        discount_amount = promo.max_discount;
      }
    } else if (promo.discount_type === "fixed") {
      discount_amount = promo.discount_value;
    }

    // Ensure discount doesn't exceed cart total
    if (discount_amount > cart_total) {
      discount_amount = cart_total;
    }

    const final_amount = cart_total - discount_amount;

    return res.json({
      valid: true,
      promo_code_id: promo.id,
      code: promo.code,
      discount_type: promo.discount_type,
      discount_value: promo.discount_value,
      discount_amount: parseFloat(discount_amount.toFixed(2)),
      original_amount: parseFloat(cart_total),
      final_amount: parseFloat(final_amount.toFixed(2))
    });

  } catch (err) {
    console.error("Validate promo code error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: CREATE PROMO CODE
// ========================================
exports.createPromoCode = async (req, res) => {
  try {
    const { 
      code, 
      discount_type, 
      discount_value, 
      min_order_amount,
      max_discount,
      usage_limit,
      valid_from,
      valid_until 
    } = req.body;

    if (!code || !discount_type || !discount_value) {
      return res.status(400).json({ 
        error: "Code, discount_type, and discount_value are required" 
      });
    }

    // Validate discount type
    if (!["percentage", "fixed"].includes(discount_type)) {
      return res.status(400).json({ 
        error: "discount_type must be 'percentage' or 'fixed'" 
      });
    }

    // Check if code already exists
    const existing = await pool.query(
      `SELECT id FROM promo_codes WHERE UPPER(code) = UPPER($1)`,
      [code]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Promo code already exists" });
    }

    const result = await pool.query(
      `INSERT INTO promo_codes 
       (code, discount_type, discount_value, min_order_amount, max_discount, 
        usage_limit, valid_from, valid_until)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        code.toUpperCase(),
        discount_type,
        discount_value,
        min_order_amount || 0,
        max_discount || null,
        usage_limit || null,
        valid_from || null,
        valid_until || null
      ]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Create promo code error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: GET ALL PROMO CODES
// ========================================
exports.getAllPromoCodes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM promo_codes ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Get promo codes error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: UPDATE PROMO CODE
// ========================================
exports.updatePromoCode = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      code,
      discount_type, 
      discount_value, 
      min_order_amount,
      max_discount,
      usage_limit,
      is_active,
      valid_from,
      valid_until 
    } = req.body;

    const result = await pool.query(
      `UPDATE promo_codes 
       SET code = $1,
           discount_type = $2,
           discount_value = $3,
           min_order_amount = $4,
           max_discount = $5,
           usage_limit = $6,
           is_active = $7,
           valid_from = $8,
           valid_until = $9
       WHERE id = $10
       RETURNING *`,
      [
        code?.toUpperCase(),
        discount_type,
        discount_value,
        min_order_amount,
        max_discount,
        usage_limit,
        is_active,
        valid_from,
        valid_until,
        id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Promo code not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update promo code error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: DELETE PROMO CODE
// ========================================
exports.deletePromoCode = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM promo_codes WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Promo code not found" });
    }

    res.json({ message: "Promo code deleted successfully" });
  } catch (err) {
    console.error("Delete promo code error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: DEACTIVATE PROMO CODE
// ========================================
exports.deactivatePromoCode = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE promo_codes SET is_active = false WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Promo code not found" });
    }

    res.json({ message: "Promo code deactivated", promo: result.rows[0] });
  } catch (err) {
    console.error("Deactivate promo code error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: GET PROMO CODE USAGE STATS
// ========================================
exports.getPromoStats = async (req, res) => {
  try {
    const { id } = req.params;

    // Get promo code details
    const promoResult = await pool.query(
      `SELECT * FROM promo_codes WHERE id = $1`,
      [id]
    );

    if (promoResult.rows.length === 0) {
      return res.status(404).json({ error: "Promo code not found" });
    }

    // Get usage details
    const usageResult = await pool.query(
      `SELECT 
        pcu.*,
        u.full_name,
        u.phone,
        o.created_at as order_date
       FROM promo_code_usage pcu
       JOIN users u ON pcu.user_id = u.id
       JOIN orders o ON pcu.order_id = o.id
       WHERE pcu.promo_code_id = $1
       ORDER BY pcu.used_at DESC`,
      [id]
    );

    // Calculate total discount given
    const totalDiscountResult = await pool.query(
      `SELECT COALESCE(SUM(discount_amount), 0) as total_discount
       FROM promo_code_usage
       WHERE promo_code_id = $1`,
      [id]
    );

    res.json({
      promo: promoResult.rows[0],
      usage_count: usageResult.rows.length,
      total_discount_given: parseFloat(totalDiscountResult.rows[0].total_discount),
      usage_history: usageResult.rows
    });

  } catch (err) {
    console.error("Get promo stats error:", err);
    res.status(500).json({ error: err.message });
  }
};