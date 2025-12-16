const db = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// REGISTER RIDER
// REGISTER RIDER
exports.registerRider = async (req, res) => {
    try {
        const { full_name, phone, email, password } = req.body;

        // Check if phone already exists
        const existing = await db.query(
            "SELECT id FROM users WHERE phone = $1",
            [phone]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: "Phone number already registered" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user account with role rider
        const userInsert = await db.query(
            `INSERT INTO users(full_name, phone, email, password, role)
             VALUES($1, $2, $3, $4, 'rider')
             RETURNING id`,
            [full_name, phone, email, hashedPassword]
        );

        const userId = userInsert.rows[0].id;

        // Create rider profile
        await db.query(
            `INSERT INTO riders(user_id, is_available, current_lat, current_lng)
             VALUES($1, TRUE, 0, 0)`,
            [userId]
        );

        return res.json({
            message: "Rider registered successfully",
            rider: {
                id: userId,
                full_name,
                phone,
                email,
                is_available: true
            }
        });

    } catch (err) {
        console.error("Register rider error:", err);
        return res.status(500).json({ error: "Server error" });
    }
};

// LOGIN RIDER
exports.loginRider = async (req, res) => {
    try {
        const { phone, password } = req.body;

        // Check if rider exists in users table
        const userResult = await db.query(
            `SELECT id, full_name, phone, email, password
             FROM users
             WHERE phone = $1 AND role = 'rider'`,
            [phone]
        );

        if (userResult.rows.length === 0) {
            return res.status(400).json({ error: "Rider not found" });
        }

        const riderUser = userResult.rows[0];

        // Compare password
        const valid = await bcrypt.compare(password, riderUser.password);
        if (!valid) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        // Generate token using users.id
        const token = jwt.sign(
            { id: riderUser.id, role: "rider" },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        return res.json({
            message: "Login successful",
            token,
            rider: {
                id: riderUser.id,    // <-- the correct and only identity
                full_name: riderUser.full_name,
                phone: riderUser.phone,
                email: riderUser.email
            }
        });

    } catch (err) {
        console.error("Login rider error:", err);
        return res.status(500).json({ error: "Server error" });
    }
};

const pool = require("../config/db");

// Update rider location (Protected)
exports.updateLocation = async (req, res) => {
    try {
        const riderId = req.user.id;  // users.id from JWT
        const { lat, lng } = req.body;

        if (!lat || !lng) {
            return res.status(400).json({ error: "lat and lng are required" });
        }

        await pool.query(
            `UPDATE riders
             SET current_lat = $1,
                 current_lng = $2,
                 updated_at = NOW()
             WHERE user_id = $3`,
            [lat, lng, riderId]
        );

        return res.json({ message: "Location updated" });

    } catch (error) {
        console.error("Update location error:", error);
        return res.status(500).json({ error: error.message });
    }
};

// Get rider live location (Protected)
exports.getLocation = async (req, res) => {
    try {
        const userId = req.params.id;  // this is users.id

        const result = await pool.query(
            `SELECT current_lat, current_lng, updated_at
             FROM riders
             WHERE user_id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Rider not found" });
        }

        return res.json(result.rows[0]);

    } catch (error) {
        console.error("Get location error:", error);
        return res.status(500).json({ error: error.message });
    }
};

// ==========================
// UPDATE AVAILABILITY (PROTECTED)
// ==========================
exports.updateAvailability = async (req, res) => {
    try {
        const riderId = req.user.id;  // users.id from JWT
        const { is_available } = req.body;

        if (is_available === undefined) {
            return res.status(400).json({ error: "is_available is required" });
        }

        await pool.query(
            `UPDATE riders 
             SET is_available = $1, updated_at = NOW()
             WHERE user_id = $2`,
            [is_available, riderId]
        );

        return res.json({
            message: "Availability updated",
            rider_id: riderId,
            is_available
        });

    } catch (error) {
        console.error("Update availability error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

// ==========================
// GET ALL AVAILABLE RIDERS
// ==========================
exports.getAvailableRiders = async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, user_id, is_available, current_lat, current_lng 
             FROM riders 
             WHERE is_available = true`
        );

        return res.json(result.rows);
    } catch (error) {
        console.error("Get available riders error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};
