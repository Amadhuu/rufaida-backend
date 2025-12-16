const pool = require("../config/db");
const jwt = require("jsonwebtoken");

// SINGLE GLOBAL OTP STORE (DEV mode only)
if (!global.otpStore) {
  global.otpStore = {};
}

const OTP_TTL_MS = 2 * 60 * 1000; // 2 minutes

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create JWT
function createToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });
}

// ---------------------------------------------------------
// SEND OTP
// ---------------------------------------------------------
exports.sendOtp = async (req, res) => {
  try {
    let { phone } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    // Normalize phone: remove leading 0
    phone = phone.trim();
    if (phone.startsWith("0")) phone = phone.substring(1);

    console.log("📩 SEND OTP REQUEST FOR PHONE:", phone);

    const otp = generateOtp();
    const expiresAt = Date.now() + OTP_TTL_MS;

    // Store OTP in memory
    global.otpStore[phone] = { otp, expiresAt };

    // DEV MODE LOG
    console.log(`🔐 DEV OTP for ${phone}: ${otp} (valid 2 mins)`);
    console.log(`📝 OTP Store Keys: ${Object.keys(global.otpStore).join(', ')}`);

    return res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("sendOtp error:", err);
    res.status(500).json({ error: "Failed to send OTP" });
  }
};

// ---------------------------------------------------------
// VERIFY OTP (Fixed with debug logs and safe response)
// ---------------------------------------------------------
exports.verifyOtp = async (req, res) => {
  try {
    let { phone, otp } = req.body;

    if (!phone || !otp) {
      return res.status(400).json({ error: "Phone and OTP are required" });
    }

    // Normalize phone
    phone = phone.trim();
    if (phone.startsWith("0")) phone = phone.substring(1);

    console.log("🔍 VERIFY OTP REQUEST — PHONE:", phone, "OTP:", otp);
    console.log(`🔍 Current OTP Store Keys: ${Object.keys(global.otpStore).join(', ')}`);

    const record = global.otpStore[phone];

    // No OTP found?
    if (!record) {
      console.log("❌ No OTP found for phone:", phone);
      console.log("❌ Available phones:", Object.keys(global.otpStore));
      return res.status(400).json({ error: "No OTP sent for this phone or OTP expired" });
    }

    console.log(`🔍 Found OTP record: ${record.otp}, Expires: ${new Date(record.expiresAt).toISOString()}`);
    console.log(`🔍 Current time: ${new Date().toISOString()}`);
    console.log(`🔍 Time left: ${record.expiresAt - Date.now()}ms`);

    // Expired?
    if (Date.now() > record.expiresAt) {
      delete global.otpStore[phone];
      console.log("⏳ OTP expired for phone:", phone);
      return res.status(400).json({ error: "OTP expired" });
    }

    // Mismatch?
    if (record.otp !== otp.trim()) {
      console.log("❌ OTP MISMATCH!");
      console.log("❌ Expected:", record.otp, "Received:", otp.trim());
      console.log("❌ Type check - Expected type:", typeof record.otp, "Received type:", typeof otp);
      return res.status(400).json({ error: "Invalid OTP" });
    }

    // OTP is valid — remove it
    delete global.otpStore[phone];
    console.log("✅ OTP verified for phone:", phone);

    // Check if user exists
    const userQuery = await pool.query(
      `SELECT * FROM users WHERE phone = $1`,
      [phone]
    );

    let userRow;

    if (userQuery.rows.length === 0) {
      // Auto-create customer account
      const insert = await pool.query(
        `INSERT INTO users (full_name, phone, email, password, role, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
        [null, phone, null, null, "customer"]
      );

      userRow = insert.rows[0];
      console.log("🆕 Created new user:", phone);
    } else {
      userRow = userQuery.rows[0];
      console.log("👤 Existing user logged in:", phone);
    }

    // Create safe user object (only fields that Flutter expects)
    const safeUser = {
      id: userRow.id,
      phone: userRow.phone,
      full_name: userRow.full_name || "",
      email: userRow.email || "",
      role: userRow.role || "customer",
      created_at: userRow.created_at
    };

    // Create token
    const token = createToken({
      id: userRow.id,
      role: userRow.role || "customer",
    });

    console.log("✅ Returning token and safe user");
    console.log("✅ Token length:", token.length);
    console.log("✅ Safe user:", JSON.stringify(safeUser));

    return res.json({ 
      success: true,
      token, 
      user: safeUser 
    });
  } catch (err) {
    console.error("💥 verifyOtp error:", err);
    console.error("💥 Stack trace:", err.stack);
    res.status(500).json({ error: "OTP verification failed", details: err.message });
  }
};