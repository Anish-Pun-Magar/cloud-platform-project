const express = require("express");
const cors = require("cors");

const workerRoutes = require("./routes/worker.routes");
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/api/v1/workers", workerRoutes);

// Health check API
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "Cloud Platform API is running",
        timestamp: new Date().toISOString()
    });
});


// Unknown route handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found,buddy!"
    });
});

module.exports = app;