require("dotenv").config({
    path: "../.env"
});

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");

const { validateTelegramData } = require("./telegramAuth");

const app = express();

const PORT = process.env.PORT || 3000;

// ========================================
// PostgreSQL
// ========================================

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

pool.on("error", (error) => {
    console.error("Unexpected PostgreSQL pool error:", error.message);
});

// ========================================
// Middleware
// ========================================

app.use(cors());

app.use(express.json());

// ========================================
// Health check
// ========================================

app.get("/", (req, res) => {
    res.json({
        status: "ClientFlow backend is running",
        version: "1.0.0"
    });
});

// ========================================
// PostgreSQL connection test
// ========================================

app.get("/api/db-test", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW() AS current_time");

        res.json({
            success: true,
            database: "PostgreSQL",
            connected: true,
            serverTime: result.rows[0].current_time
        });
    } catch (error) {
        console.error("PostgreSQL connection error:", error.message);

        res.status(500).json({
            success: false,
            database: "PostgreSQL",
            connected: false,
            message: "Database connection failed"
        });
    }
});

// ========================================
// Telegram auth
// ========================================

app.post("/api/auth", (req, res) => {
    const { initData } = req.body;

    if (!initData) {
        return res.status(400).json({
            success: false,
            message: "Missing Telegram initData"
        });
    }

    const user = validateTelegramData(initData);

    if (!user) {
        return res.status(401).json({
            success: false,
            message: "Invalid Telegram data"
        });
    }

    res.json({
        success: true,
        user
    });
});

// ========================================
// Start server
// ========================================

app.listen(PORT, () => {
    console.log(
        `ClientFlow backend running on port ${PORT}`
    );
});
