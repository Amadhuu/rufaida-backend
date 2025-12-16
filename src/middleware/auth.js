const jwt = require("jsonwebtoken");

// GENERAL TOKEN VERIFIER
function verifyToken(req, res, next) {
    const token = req.headers["authorization"];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token.replace("Bearer ", ""), process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(400).json({ error: "Invalid or expired token" });
    }
}

// CUSTOMER ONLY
function verifyCustomer(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role !== "customer") {
            return res.status(403).json({ error: "Access denied. Customer only." });
        }
        next();
    });
}

// RIDER ONLY
function verifyRider(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role !== "rider") {
            return res.status(403).json({ error: "Access denied. Rider only." });
        }
        next();
    });
}

// ADMIN ONLY
function verifyAdmin(req, res, next) {
    verifyToken(req, res, () => {
        if (req.user.role !== "admin") {
            return res.status(403).json({ error: "Access denied. Admin only." });
        }
        next();
    });
}

module.exports = {
    verifyToken,
    verifyCustomer,
    verifyRider,
    verifyAdmin
};
