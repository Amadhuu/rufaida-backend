const pool = require("../config/db");

// Helper: clean address row
function cleanAddress(row) {
  const { user_id, ...rest } = row;
  return rest;
}

// -----------------------------------------------------------------------------
// GET ALL ADDRESSES FOR USER
exports.getAddresses = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC`,
      [req.user.id]
    );

    res.json(result.rows.map(cleanAddress));
  } catch (err) {
    console.error("getAddresses error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// CREATE NEW ADDRESS
exports.createAddress = async (req, res) => {
  try {
    const { label, address, phone, lat, lng, is_default } = req.body;
    
    // If setting as default, unset other defaults first
    if (is_default) {
      await pool.query(
        `UPDATE addresses SET is_default = false WHERE user_id = $1`,
        [req.user.id]
      );
    }

    const result = await pool.query(
      `INSERT INTO addresses 
       (user_id, label, address, phone, lat, lng, is_default, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [req.user.id, label, address, phone, lat, lng, is_default || false]
    );

    res.status(201).json(cleanAddress(result.rows[0]));
  } catch (err) {
    console.error("createAddress error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// UPDATE ADDRESS
exports.updateAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const { label, address, phone, lat, lng, is_default } = req.body;

    // Check if address belongs to user
    const check = await pool.query(
      `SELECT * FROM addresses WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );

    if (check.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    // If setting as default, unset other defaults first
    if (is_default) {
      await pool.query(
        `UPDATE addresses SET is_default = false WHERE user_id = $1 AND id != $2`,
        [req.user.id, id]
      );
    }

    const result = await pool.query(
      `UPDATE addresses 
       SET label = COALESCE($1, label),
           address = COALESCE($2, address),
           phone = COALESCE($3, phone),
           lat = COALESCE($4, lat),
           lng = COALESCE($5, lng),
           is_default = COALESCE($6, is_default)
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [label, address, phone, lat, lng, is_default, id, req.user.id]
    );

    res.json(cleanAddress(result.rows[0]));
  } catch (err) {
    console.error("updateAddress error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// DELETE ADDRESS
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Address not found" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("deleteAddress error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// SET DEFAULT ADDRESS
exports.setDefaultAddress = async (req, res) => {
  try {
    const { id } = req.params;

    // Start transaction
    await pool.query('BEGIN');

    // Unset all defaults
    await pool.query(
      `UPDATE addresses SET is_default = false WHERE user_id = $1`,
      [req.user.id]
    );

    // Set new default
    const result = await pool.query(
      `UPDATE addresses SET is_default = true WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: "Address not found" });
    }

    await pool.query('COMMIT');
    res.json(cleanAddress(result.rows[0]));
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error("setDefaultAddress error:", err);
    res.status(500).json({ error: err.message });
  }
};