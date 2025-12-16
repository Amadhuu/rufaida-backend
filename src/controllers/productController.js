const pool = require("../config/db");

// CREATE PRODUCT
exports.createProduct = async (req, res) => {
  try {
    const { name, description, price, image_url, category } = req.body;

    const result = await pool.query(
      `INSERT INTO products (name, description, price, image_url, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name, description, price, image_url, category]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET ALL PRODUCTS
exports.getAllProducts = async (req, res) => {
  try {
    const products = await pool.query(`SELECT * FROM products ORDER BY id DESC`);
    res.json(products.rows);
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET SINGLE PRODUCT
exports.getProductById = async (req, res) => {
  try {
    const product = await pool.query(
      `SELECT * FROM products WHERE id=$1`,
      [req.params.id]
    );

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product.rows[0]);
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({ error: err.message });
  }
};

// UPDATE PRODUCT
exports.updateProduct = async (req, res) => {
  try {
    const { name, description, price, image_url, category } = req.body;

    const result = await pool.query(
      `UPDATE products 
       SET name=$1, description=$2, price=$3, image_url=$4, category=$5
       WHERE id=$6
       RETURNING *`,
      [name, description, price, image_url, category, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: err.message });
  }
};

// DELETE PRODUCT
exports.deleteProduct = async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM products WHERE id=$1 RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: "Product deleted successfully" });
  } catch (err) {
    console.error("Delete product error:", err);
    res.status(500).json({ error: err.message });
  }
};