require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

// Verify environment variables at startup
console.log("=== ENVIRONMENT VERIFICATION ===");
console.log("NODE_ENV:", process.env.NODE_ENV || "NOT SET (defaulting to undefined)");
console.log("PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:", process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || "NOT SET");
console.log("PORT:", process.env.PORT || 5000);
console.log("MONGODB_URI:", process.env.MONGODB_URI ? "SET" : "NOT SET");
console.log("================================");

// Warn if NODE_ENV is not set to production in deployed environment
if (process.env.NODE_ENV !== "production" && process.env.HOME === "/home/render") {
  console.warn("⚠️ WARNING: NODE_ENV is not set to 'production' on Render!");
  console.warn("⚠️ This will cause PDF generation to fail. Please set NODE_ENV=production in Render environment variables.");
}

const billRoutes = require("./routes/billRoutes");
const bankRoutes = require("./routes/bank.routes");
const companyRoutes = require("./routes/company.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

// Security middleware

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later.",
});
app.use("/api/", limiter);

// CORS configuration
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Enhanced debugging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  console.log("Content-Type:", req.headers["content-type"]);
  console.log("Content-Length:", req.headers["content-length"]);
  next();
});

// Body parsing middleware with enhanced options
app.use(
  express.json({
    limit: "50mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "50mb",
    verify: (req, res, buf) => {
      if (!req.rawBody) req.rawBody = buf;
    },
  })
);

// Additional middleware to handle raw text/plain requests
app.use(
  express.text({
    limit: "50mb",
    type: "text/plain",
  })
);

// Custom middleware to debug request body
app.use((req, res, next) => {
  if (req.path.includes("/bills") && req.method === "POST") {
    console.log("=== MIDDLEWARE DEBUG ===");
    console.log("Body:", req.body);
    console.log("Body type:", typeof req.body);
    console.log("Has rawBody:", !!req.rawBody);

    // Handle case where body might be a JSON string
    if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
      try {
        req.body = JSON.parse(req.body);
        console.log("Parsed string body to JSON:", req.body);
      } catch (e) {
        console.log("Failed to parse string body as JSON:", e.message);
      }
    }
  }
  next();
});

// Routes
app.use("/api/bills", billRoutes);
app.use("/api/bank-details", bankRoutes);
app.use("/api/companies", companyRoutes);

// Root route
app.get("/", (req, res) => {
  res.send("✅ Billing Software Backend is live!");
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use(errorHandler);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully");
  await mongoose.connection.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully");
  await mongoose.connection.close();
  process.exit(0);
});
