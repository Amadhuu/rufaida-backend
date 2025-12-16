const pool = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Helper: create token
function createToken(user) {
  const secret = process.env.JWT_SECRET || "verysecret";
  return jwt.sign(
    { id: user.id, role: user.role || "customer" },
    secret,
    { expiresIn: "7d" }
  );
}

// Helper: sanitize user row (remove password field)
function cleanUser(row) {
  const { password, ...rest } = row;
  return rest;
}

// -----------------------------------------------------------------------------
// GET LOGGED-IN USER / ME
exports.getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, phone, email, role, created_at, location, lat, lng FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Convert lat/lng to numbers if they exist
    const user = result.rows[0];
    if (user.lat) user.lat = parseFloat(user.lat);
    if (user.lng) user.lng = parseFloat(user.lng);
    
    res.json(cleanUser(user));
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// UPDATE USER (name, email, location, etc.)
exports.updateUser = async (req, res) => {
  try {
    const { full_name, email, location, lat, lng } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           email = COALESCE($2, email),
           location = COALESCE($3, location),
           lat = COALESCE($4, lat),
           lng = COALESCE($5, lng)
       WHERE id = $6
       RETURNING *`,
      [full_name, email, location, lat, lng, req.user.id]
    );

    res.json(cleanUser(result.rows[0]));
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// EXISTING: REGISTER USER
exports.register = async (req, res) => {
  try {
    const { full_name, phone, email, password } = req.body;

    const hash = password ? await bcrypt.hash(password, 10) : null;

    const result = await pool.query(
      `INSERT INTO users (full_name, phone, email, password, role, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
      [full_name, phone, email, hash, "customer"]
    );

    const user = cleanUser(result.rows[0]);

    res.json(user);
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// EXISTING: LOGIN WITH PASSWORD (admin/rider)
exports.login = async (req, res) => {
  try {
    const { phone, password } = req.body;

    const userQuery = await pool.query(
      `SELECT * FROM users WHERE phone = $1`,
      [phone]
    );

    if (userQuery.rows.length === 0)
      return res.status(400).json({ error: "User not found" });

    const userRow = userQuery.rows[0];

    if (!userRow.password)
      return res.status(400).json({ error: "Password login unavailable" });

    const isMatch = await bcrypt.compare(password, userRow.password);

    if (!isMatch)
      return res.status(400).json({ error: "Incorrect password" });

    const token = createToken(userRow);

    res.json({
      token,
      user: cleanUser(userRow),
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: err.message });
  }
};

// -----------------------------------------------------------------------------
// EXISTING: Get single user by ID (not needed for app but okay)
exports.getUserById = async (req, res) => {
  try {
    const user = await pool.query(
      `SELECT * FROM users WHERE id = $1`,
      [req.params.id]
    );

    if (user.rows.length === 0)
      return res.status(404).json({ error: "User not found" });

    res.json(cleanUser(user.rows[0]));
  } catch (err) {
    console.error("User fetch error:", err);
    res.status(500).json({ error: err.message });
  }
};
