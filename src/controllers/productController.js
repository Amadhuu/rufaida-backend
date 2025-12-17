const pool = require("../config/db");

// CREATE PRODUCT
exports.createProduct = async (req, res) => {
  try {
    const { name, description, price, image_url, category, stock } = req.body;

    const result = await pool.query(
      `INSERT INTO products (name, description, price, image_url, category, stock, is_available)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, description, price, image_url, category, stock || 0, true]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET ALL PRODUCTS (with ratings)
exports.getAllProducts = async (req, res) => {
  try {
    const products = await pool.query(`
      SELECT 
        p.*,
        COALESCE(AVG(pr.rating), 0) as average_rating,
        COUNT(pr.id) as review_count
      FROM products p
      LEFT JOIN product_reviews pr ON p.id = pr.product_id
      GROUP BY p.id
      ORDER BY p.id DESC
    `);
    
    // Format the response
    const formattedProducts = products.rows.map(product => ({
      ...product,
      average_rating: parseFloat(product.average_rating).toFixed(1),
      review_count: parseInt(product.review_count)
    }));
    
    res.json(formattedProducts);
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET SINGLE PRODUCT (with ratings and reviews)
exports.getProductById = async (req, res) => {
  try {
    // Get product with rating
    const product = await pool.query(`
      SELECT 
        p.*,
        COALESCE(AVG(pr.rating), 0) as average_rating,
        COUNT(pr.id) as review_count
      FROM products p
      LEFT JOIN product_reviews pr ON p.id = pr.product_id
      WHERE p.id = $1
      GROUP BY p.id
    `, [req.params.id]);

    if (product.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const productData = {
      ...product.rows[0],
      average_rating: parseFloat(product.rows[0].average_rating).toFixed(1),
      review_count: parseInt(product.rows[0].review_count)
    };

    res.json(productData);
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({ error: err.message });
  }
};

// UPDATE PRODUCT
exports.updateProduct = async (req, res) => {
  try {
    const { name, description, price, image_url, category, stock, is_available } = req.body;

    const result = await pool.query(
      `UPDATE products 
       SET name=$1, description=$2, price=$3, image_url=$4, category=$5, 
           stock=$6, is_available=$7, updated_at=CURRENT_TIMESTAMP
       WHERE id=$8
       RETURNING *`,
      [name, description, price, image_url, category, stock, is_available, req.params.id]
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

// UPDATE STOCK (for admin or when order is placed)
exports.updateStock = async (req, res) => {
  try {
    const { stock } = req.body;
    
    if (stock === undefined) {
      return res.status(400).json({ error: "Stock value is required" });
    }

    const result = await pool.query(
      `UPDATE products 
       SET stock = $1, 
           is_available = CASE WHEN $1 > 0 THEN true ELSE false END,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [stock, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Update stock error:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET PRODUCTS BY CATEGORY
exports.getProductsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    
    const products = await pool.query(`
      SELECT 
        p.*,
        COALESCE(AVG(pr.rating), 0) as average_rating,
        COUNT(pr.id) as review_count
      FROM products p
      LEFT JOIN product_reviews pr ON p.id = pr.product_id
      WHERE p.category = $1
      GROUP BY p.id
      ORDER BY p.id DESC
    `, [category]);
    
    const formattedProducts = products.rows.map(product => ({
      ...product,
      average_rating: parseFloat(product.average_rating).toFixed(1),
      review_count: parseInt(product.review_count)
    }));
    
    res.json(formattedProducts);
  } catch (err) {
    console.error("Get products by category error:", err);
    res.status(500).json({ error: err.message });
  }
};

// SEARCH PRODUCTS
exports.searchProducts = async (req, res) => {
  try {
    const { q } = req.query; // search query
    
    if (!q) {
      return res.status(400).json({ error: "Search query is required" });
    }
    
    const products = await pool.query(`
      SELECT 
        p.*,
        COALESCE(AVG(pr.rating), 0) as average_rating,
        COUNT(pr.id) as review_count
      FROM products p
      LEFT JOIN product_reviews pr ON p.id = pr.product_id
      WHERE p.name ILIKE $1 OR p.description ILIKE $1 OR p.category ILIKE $1
      GROUP BY p.id
      ORDER BY p.id DESC
    `, [`%${q}%`]);
    
    const formattedProducts = products.rows.map(product => ({
      ...product,
      average_rating: parseFloat(product.average_rating).toFixed(1),
      review_count: parseInt(product.review_count)
    }));
    
    res.json(formattedProducts);
  } catch (err) {
    console.error("Search products error:", err);
    res.status(500).json({ error: err.message });
  }
};