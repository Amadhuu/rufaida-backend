require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const addressRoutes = require("./src/routes/addressRoutes");
app.use("/api/user/addresses", addressRoutes);

const userRoutes = require("./src/routes/userRoutes");
app.use("/api/user", userRoutes);

const productRoutes = require("./src/routes/productRoutes");
app.use("/api/products", productRoutes);

const cartRoutes = require("./src/routes/cartRoutes");
app.use("/api/cart", cartRoutes);

const orderRoutes = require("./src/routes/orderRoutes");
app.use("/api/orders", orderRoutes);

// Basic Route (Test)
app.get("/", (req, res) => {
  res.send("Rufaida Delivery Backend is running...");
});

const authRoutes = require("./src/routes/authRoutes");

app.use("/api/auth", authRoutes);

app.use("/api/riders", require("./src/routes/riderRoutes"));

// Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});