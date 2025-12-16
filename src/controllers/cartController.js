const pool = require("../config/db");

// GET user's cart with product details
exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;

    const cartItems = await pool.query(`
      SELECT 
        c.id,
        c.product_id,
        c.quantity,
        p.name as product_name,
        p.price,
        p.image_url,
        p.category
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);

    res.json(cartItems.rows);
  } catch (err) {
    console.error("Get cart error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ADD or UPDATE item in cart
exports.addToCart = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.user.id;
    const { product_id, quantity = 1 } = req.body;

    await client.query("BEGIN");

    // Check if product exists
    const productCheck = await client.query(
      "SELECT id FROM products WHERE id = $1",
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if already in cart
    const existing = await client.query(
      `SELECT id, quantity FROM cart 
       WHERE user_id = $1 AND product_id = $2`,
      [userId, product_id]
    );

    if (existing.rows.length > 0) {
      // Update quantity
      await client.query(
        `UPDATE cart SET quantity = quantity + $1,
                        updated_at = NOW()
         WHERE user_id = $2 AND product_id = $3`,
        [quantity, userId, product_id]
      );
    } else {
      // Insert new item
      await client.query(
        `INSERT INTO cart (user_id, product_id, quantity)
         VALUES ($1, $2, $3)`,
        [userId, product_id, quantity]
      );
    }

    await client.query("COMMIT");

    // Return the ENTIRE updated cart (not just the added item)
    const fullCart = await client.query(`
      SELECT 
        c.id,
        c.product_id,
        c.quantity,
        p.name as product_name,
        p.price,
        p.image_url,
        p.category
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);

    res.json(fullCart.rows); // Return array of all cart items

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Add to cart error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
};

// REMOVE item from cart
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.params;

    const result = await pool.query(
      `DELETE FROM cart 
       WHERE user_id = $1 AND product_id = $2 
       RETURNING *`,
      [userId, product_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Item not found in cart" });
    }

    res.json({ message: "Item removed from cart" });
  } catch (err) {
    console.error("Remove from cart error:", err);
    res.status(500).json({ error: err.message });
  }
};

// UPDATE item quantity
exports.updateQuantity = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.params;
    const { quantity } = req.body;

    if (quantity <= 0) {
      await pool.query(
        `DELETE FROM cart WHERE user_id = $1 AND product_id = $2`,
        [userId, product_id]
      );
    } else {
      await pool.query(
        `UPDATE cart 
         SET quantity = $1, updated_at = NOW()
         WHERE user_id = $2 AND product_id = $3`,
        [quantity, userId, product_id]
      );
    }

    // Return full cart after update
    const fullCart = await pool.query(`
      SELECT 
        c.id,
        c.product_id,
        c.quantity,
        p.name as product_name,
        p.price,
        p.image_url,
        p.category
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);

    res.json(fullCart.rows);
    
  } catch (err) {
    console.error("Update quantity error:", err);
    res.status(500).json({ error: err.message });
  }
};

// In removeFromCart function:
exports.removeFromCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id } = req.params;

    await pool.query(
      `DELETE FROM cart 
       WHERE user_id = $1 AND product_id = $2`,
      [userId, product_id]
    );

    // Return full cart after removal
    const fullCart = await pool.query(`
      SELECT 
        c.id,
        c.product_id,
        c.quantity,
        p.name as product_name,
        p.price,
        p.image_url,
        p.category
      FROM cart c
      JOIN products p ON c.product_id = p.id
      WHERE c.user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);

    res.json(fullCart.rows);
    
  } catch (err) {
    console.error("Remove from cart error:", err);
    res.status(500).json({ error: err.message });
  }
};


// CLEAR entire cart
exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;

    await pool.query(
      `DELETE FROM cart WHERE user_id = $1`,
      [userId]
    );

    res.json({ message: "Cart cleared successfully" });
  } catch (err) {
    console.error("Clear cart error:", err);
    res.status(500).json({ error: err.message });
  }
};