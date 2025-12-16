const pool = require("../config/db");

// ========================================
// CUSTOMER: ADD REVIEW FOR PRODUCT
// ========================================
exports.addReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, rating, comment, order_id } = req.body;

    if (!product_id || !rating) {
      return res.status(400).json({ error: "Product ID and rating are required" });
    }

    // Validate rating (1-5)
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Check if product exists
    const productCheck = await pool.query(
      `SELECT id FROM products WHERE id = $1`,
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Optional: Check if user has ordered this product
    if (order_id) {
      const orderCheck = await pool.query(
        `SELECT o.id FROM orders o
         JOIN order_items oi ON o.id = oi.order_id
         WHERE o.id = $1 AND o.user_id = $2 AND oi.product_id = $3`,
        [order_id, userId, product_id]
      );

      if (orderCheck.rows.length === 0) {
        return res.status(400).json({ 
          error: "You can only review products you have ordered" 
        });
      }
    }

    // Check if user already reviewed this product
    const existingReview = await pool.query(
      `SELECT id FROM product_reviews 
       WHERE user_id = $1 AND product_id = $2`,
      [userId, product_id]
    );

    if (existingReview.rows.length > 0) {
      return res.status(400).json({ 
        error: "You have already reviewed this product. Use update instead." 
      });
    }

    // Insert review
    const result = await pool.query(
      `INSERT INTO product_reviews 
       (product_id, user_id, order_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [product_id, userId, order_id || null, rating, comment || null]
    );

    res.json({
      message: "Review added successfully",
      review: result.rows[0]
    });

  } catch (err) {
    console.error("Add review error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// GET REVIEWS FOR A PRODUCT (Public)
// ========================================
exports.getProductReviews = async (req, res) => {
  try {
    const { product_id } = req.params;

    // Get reviews with user details
    const reviews = await pool.query(
      `SELECT 
        pr.id,
        pr.product_id,
        pr.rating,
        pr.comment,
        pr.created_at,
        u.full_name,
        u.phone
       FROM product_reviews pr
       JOIN users u ON pr.user_id = u.id
       WHERE pr.product_id = $1
       ORDER BY pr.created_at DESC`,
      [product_id]
    );

    // Calculate average rating
    const avgResult = await pool.query(
      `SELECT 
        COALESCE(AVG(rating), 0) as avg_rating,
        COUNT(*) as total_reviews
       FROM product_reviews
       WHERE product_id = $1`,
      [product_id]
    );

    res.json({
      product_id: parseInt(product_id),
      average_rating: parseFloat(avgResult.rows[0].avg_rating).toFixed(1),
      total_reviews: parseInt(avgResult.rows[0].total_reviews),
      reviews: reviews.rows
    });

  } catch (err) {
    console.error("Get product reviews error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// CUSTOMER: UPDATE THEIR REVIEW
// ========================================
exports.updateReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!rating) {
      return res.status(400).json({ error: "Rating is required" });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    // Check if review exists and belongs to user
    const reviewCheck = await pool.query(
      `SELECT * FROM product_reviews WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ 
        error: "Review not found or you don't have permission to update it" 
      });
    }

    // Update review
    const result = await pool.query(
      `UPDATE product_reviews 
       SET rating = $1, comment = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [rating, comment || null, id, userId]
    );

    res.json({
      message: "Review updated successfully",
      review: result.rows[0]
    });

  } catch (err) {
    console.error("Update review error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// CUSTOMER: DELETE THEIR REVIEW
// ========================================
exports.deleteReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM product_reviews 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: "Review not found or you don't have permission to delete it" 
      });
    }

    res.json({ message: "Review deleted successfully" });

  } catch (err) {
    console.error("Delete review error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// GET CUSTOMER'S OWN REVIEWS
// ========================================
exports.getMyReviews = async (req, res) => {
  try {
    const userId = req.user.id;

    const reviews = await pool.query(
      `SELECT 
        pr.*,
        p.name as product_name,
        p.image_url as product_image
       FROM product_reviews pr
       JOIN products p ON pr.product_id = p.id
       WHERE pr.user_id = $1
       ORDER BY pr.created_at DESC`,
      [userId]
    );

    res.json(reviews.rows);

  } catch (err) {
    console.error("Get my reviews error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: GET ALL REVIEWS
// ========================================
exports.getAllReviews = async (req, res) => {
  try {
    const reviews = await pool.query(
      `SELECT 
        pr.*,
        u.full_name,
        u.phone,
        p.name as product_name
       FROM product_reviews pr
       JOIN users u ON pr.user_id = u.id
       JOIN products p ON pr.product_id = p.id
       ORDER BY pr.created_at DESC`
    );

    res.json(reviews.rows);

  } catch (err) {
    console.error("Get all reviews error (admin):", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// ADMIN: DELETE ANY REVIEW (Moderation)
// ========================================
exports.adminDeleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM product_reviews WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Review not found" });
    }

    res.json({ message: "Review deleted successfully (admin)" });

  } catch (err) {
    console.error("Admin delete review error:", err);
    res.status(500).json({ error: err.message });
  }
};

// ========================================
// GET PRODUCT RATING SUMMARY
// ========================================
exports.getProductRatingSummary = async (req, res) => {
  try {
    const { product_id } = req.params;

    // Get rating distribution
    const distribution = await pool.query(
      `SELECT 
        rating,
        COUNT(*) as count
       FROM product_reviews
       WHERE product_id = $1
       GROUP BY rating
       ORDER BY rating DESC`,
      [product_id]
    );

    // Get average and total
    const summary = await pool.query(
      `SELECT 
        COALESCE(AVG(rating), 0) as avg_rating,
        COUNT(*) as total_reviews
       FROM product_reviews
       WHERE product_id = $1`,
      [product_id]
    );

    res.json({
      product_id: parseInt(product_id),
      average_rating: parseFloat(summary.rows[0].avg_rating).toFixed(1),
      total_reviews: parseInt(summary.rows[0].total_reviews),
      rating_distribution: {
        5: parseInt(distribution.rows.find(r => r.rating === 5)?.count || 0),
        4: parseInt(distribution.rows.find(r => r.rating === 4)?.count || 0),
        3: parseInt(distribution.rows.find(r => r.rating === 3)?.count || 0),
        2: parseInt(distribution.rows.find(r => r.rating === 2)?.count || 0),
        1: parseInt(distribution.rows.find(r => r.rating === 1)?.count || 0)
      }
    });

  } catch (err) {
    console.error("Get rating summary error:", err);
    res.status(500).json({ error: err.message });
  }
};