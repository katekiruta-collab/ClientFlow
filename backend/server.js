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
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on("error", (error) => {
    console.error(
        "Unexpected PostgreSQL pool error:",
        error.message
    );
});

// ========================================
// Middleware
// ========================================

app.use(cors());

app.use(express.json());

// ========================================
// Database initialization
// ========================================

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            telegram_id BIGINT UNIQUE NOT NULL,
            first_name TEXT,
            last_name TEXT,
            username TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS clients (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS appointments (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
            date DATE NOT NULL,
            time TIME,
            status TEXT DEFAULT 'planned',
            price NUMERIC(10, 2) DEFAULT 0,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS invoices (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
            appointment_id INTEGER REFERENCES appointments(id) ON DELETE SET NULL,
            amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
            status TEXT DEFAULT 'unpaid',
            due_date DATE,
            paid_at TIMESTAMP,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `);

    console.log("PostgreSQL database initialized successfully");
}

// ========================================
// Telegram user
// ========================================

async function getOrCreateUser(telegramUser) {
    const telegramId = telegramUser.id;

    const firstName = telegramUser.first_name || null;
    const lastName = telegramUser.last_name || null;
    const username = telegramUser.username || null;

    const result = await pool.query(
        `
        INSERT INTO users (
            telegram_id,
            first_name,
            last_name,
            username
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (telegram_id)
        DO UPDATE SET
            first_name = EXCLUDED.first_name,
            last_name = EXCLUDED.last_name,
            username = EXCLUDED.username,
            updated_at = CURRENT_TIMESTAMP
        RETURNING *;
        `,
        [
            telegramId,
            firstName,
            lastName,
            username
        ]
    );

    return result.rows[0];
}

// ========================================
// Authentication middleware
// ========================================

async function authenticateRequest(req, res, next) {
    try {
        const initData =
            req.headers["x-telegram-init-data"];

        if (!initData) {
            return res.status(401).json({
                success: false,
                message: "Missing Telegram initData"
            });
        }

        const telegramUser =
            validateTelegramData(initData);

        if (!telegramUser) {
            return res.status(401).json({
                success: false,
                message: "Invalid Telegram data"
            });
        }

        const user =
            await getOrCreateUser(telegramUser);

        req.telegramUser = telegramUser;
        req.user = user;

        next();
    } catch (error) {
        console.error(
            "Authentication error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Authentication failed"
        });
    }
}

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
        const result = await pool.query(
            "SELECT NOW() AS current_time"
        );

        res.json({
            success: true,
            database: "PostgreSQL",
            connected: true,
            serverTime: result.rows[0].current_time
        });
    } catch (error) {
        console.error(
            "PostgreSQL connection error:",
            error.message
        );

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

app.post("/api/auth", async (req, res) => {
    try {
        const { initData } = req.body;

        if (!initData) {
            return res.status(400).json({
                success: false,
                message: "Missing Telegram initData"
            });
        }

        const telegramUser =
            validateTelegramData(initData);

        if (!telegramUser) {
            return res.status(401).json({
                success: false,
                message: "Invalid Telegram data"
            });
        }

        const user =
            await getOrCreateUser(telegramUser);

        res.json({
            success: true,
            user: telegramUser,
            databaseUser: user
        });
    } catch (error) {
        console.error(
            "Telegram auth error:",
            error.message
        );

        res.status(500).json({
            success: false,
            message: "Authentication failed"
        });
    }
});

// ========================================
// CLIENTS
// ========================================

// Get all clients
app.get(
    "/api/clients",
    authenticateRequest,
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                SELECT *
                FROM clients
                WHERE user_id = $1
                ORDER BY name ASC;
                `,
                [req.user.id]
            );

            res.json({
                success: true,
                clients: result.rows
            });
        } catch (error) {
            console.error(
                "Get clients error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to get clients"
            });
        }
    }
);

// Create client
app.post(
    "/api/clients",
    authenticateRequest,
    async (req, res) => {
        try {
            const {
                name,
                phone,
                email,
                notes
            } = req.body;

            if (!name || !String(name).trim()) {
                return res.status(400).json({
                    success: false,
                    message: "Client name is required"
                });
            }

            const result = await pool.query(
                `
                INSERT INTO clients (
                    user_id,
                    name,
                    phone,
                    email,
                    notes
                )
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *;
                `,
                [
                    req.user.id,
                    String(name).trim(),
                    phone || null,
                    email || null,
                    notes || null
                ]
            );

            res.status(201).json({
                success: true,
                client: result.rows[0]
            });
        } catch (error) {
            console.error(
                "Create client error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to create client"
            });
        }
    }
);

// Update client
app.put(
    "/api/clients/:id",
    authenticateRequest,
    async (req, res) => {
        try {
            const {
                name,
                phone,
                email,
                notes
            } = req.body;

            const result = await pool.query(
                `
                UPDATE clients
                SET
                    name = $1,
                    phone = $2,
                    email = $3,
                    notes = $4,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $5
                  AND user_id = $6
                RETURNING *;
                `,
                [
                    name,
                    phone || null,
                    email || null,
                    notes || null,
                    req.params.id,
                    req.user.id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Client not found"
                });
            }

            res.json({
                success: true,
                client: result.rows[0]
            });
        } catch (error) {
            console.error(
                "Update client error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to update client"
            });
        }
    }
);

// Delete client
app.delete(
    "/api/clients/:id",
    authenticateRequest,
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                DELETE FROM clients
                WHERE id = $1
                  AND user_id = $2
                RETURNING id;
                `,
                [
                    req.params.id,
                    req.user.id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Client not found"
                });
            }

            res.json({
                success: true
            });
        } catch (error) {
            console.error(
                "Delete client error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to delete client"
            });
        }
    }
);

// ========================================
// APPOINTMENTS
// ========================================

// Get appointments
app.get(
    "/api/appointments",
    authenticateRequest,
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                SELECT
                    appointments.*,
                    clients.name AS client_name
                FROM appointments
                LEFT JOIN clients
                    ON clients.id = appointments.client_id
                WHERE appointments.user_id = $1
                ORDER BY
                    appointments.date ASC,
                    appointments.time ASC;
                `,
                [req.user.id]
            );

            res.json({
                success: true,
                appointments: result.rows
            });
        } catch (error) {
            console.error(
                "Get appointments error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to get appointments"
            });
        }
    }
);

// Create appointment
app.post(
    "/api/appointments",
    authenticateRequest,
    async (req, res) => {
        try {
            const {
                client_id,
                date,
                time,
                status,
                price,
                notes
            } = req.body;

            if (!date) {
                return res.status(400).json({
                    success: false,
                    message: "Appointment date is required"
                });
            }

            const result = await pool.query(
                `
                INSERT INTO appointments (
                    user_id,
                    client_id,
                    date,
                    time,
                    status,
                    price,
                    notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *;
                `,
                [
                    req.user.id,
                    client_id || null,
                    date,
                    time || null,
                    status || "planned",
                    price || 0,
                    notes || null
                ]
            );

            res.status(201).json({
                success: true,
                appointment: result.rows[0]
            });
        } catch (error) {
            console.error(
                "Create appointment error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to create appointment"
            });
        }
    }
);

// Update appointment
app.put(
    "/api/appointments/:id",
    authenticateRequest,
    async (req, res) => {
        try {
            const {
                client_id,
                date,
                time,
                status,
                price,
                notes
            } = req.body;

            const result = await pool.query(
                `
                UPDATE appointments
                SET
                    client_id = $1,
                    date = $2,
                    time = $3,
                    status = $4,
                    price = $5,
                    notes = $6,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $7
                  AND user_id = $8
                RETURNING *;
                `,
                [
                    client_id || null,
                    date,
                    time || null,
                    status || "planned",
                    price || 0,
                    notes || null,
                    req.params.id,
                    req.user.id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Appointment not found"
                });
            }

            res.json({
                success: true,
                appointment: result.rows[0]
            });
        } catch (error) {
            console.error(
                "Update appointment error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to update appointment"
            });
        }
    }
);

// Delete appointment
app.delete(
    "/api/appointments/:id",
    authenticateRequest,
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                DELETE FROM appointments
                WHERE id = $1
                  AND user_id = $2
                RETURNING id;
                `,
                [
                    req.params.id,
                    req.user.id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Appointment not found"
                });
            }

            res.json({
                success: true
            });
        } catch (error) {
            console.error(
                "Delete appointment error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to delete appointment"
            });
        }
    }
);

// ========================================
// INVOICES
// ========================================

// Get invoices
app.get(
    "/api/invoices",
    authenticateRequest,
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                SELECT
                    invoices.*,
                    clients.name AS client_name
                FROM invoices
                LEFT JOIN clients
                    ON clients.id = invoices.client_id
                WHERE invoices.user_id = $1
                ORDER BY
                    invoices.created_at DESC;
                `,
                [req.user.id]
            );

            res.json({
                success: true,
                invoices: result.rows
            });
        } catch (error) {
            console.error(
                "Get invoices error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to get invoices"
            });
        }
    }
);

// Create invoice
app.post(
    "/api/invoices",
    authenticateRequest,
    async (req, res) => {
        try {
            const {
                client_id,
                appointment_id,
                amount,
                status,
                due_date,
                notes
            } = req.body;

            const result = await pool.query(
                `
                INSERT INTO invoices (
                    user_id,
                    client_id,
                    appointment_id,
                    amount,
                    status,
                    due_date,
                    notes
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *;
                `,
                [
                    req.user.id,
                    client_id || null,
                    appointment_id || null,
                    amount || 0,
                    status || "unpaid",
                    due_date || null,
                    notes || null
                ]
            );

            res.status(201).json({
                success: true,
                invoice: result.rows[0]
            });
        } catch (error) {
            console.error(
                "Create invoice error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to create invoice"
            });
        }
    }
);

// Update invoice
app.put(
    "/api/invoices/:id",
    authenticateRequest,
    async (req, res) => {
        try {
            const {
                client_id,
                appointment_id,
                amount,
                status,
                due_date,
                paid_at,
                notes
            } = req.body;

            const result = await pool.query(
                `
                UPDATE invoices
                SET
                    client_id = $1,
                    appointment_id = $2,
                    amount = $3,
                    status = $4,
                    due_date = $5,
                    paid_at = $6,
                    notes = $7,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $8
                  AND user_id = $9
                RETURNING *;
                `,
                [
                    client_id || null,
                    appointment_id || null,
                    amount || 0,
                    status || "unpaid",
                    due_date || null,
                    paid_at || null,
                    notes || null,
                    req.params.id,
                    req.user.id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Invoice not found"
                });
            }

            res.json({
                success: true,
                invoice: result.rows[0]
            });
        } catch (error) {
            console.error(
                "Update invoice error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to update invoice"
            });
        }
    }
);

// Delete invoice
app.delete(
    "/api/invoices/:id",
    authenticateRequest,
    async (req, res) => {
        try {
            const result = await pool.query(
                `
                DELETE FROM invoices
                WHERE id = $1
                  AND user_id = $2
                RETURNING id;
                `,
                [
                    req.params.id,
                    req.user.id
                ]
            );

            if (result.rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "Invoice not found"
                });
            }

            res.json({
                success: true
            });
        } catch (error) {
            console.error(
                "Delete invoice error:",
                error.message
            );

            res.status(500).json({
                success: false,
                message: "Failed to delete invoice"
            });
        }
    }
);

// ========================================
// Start server
// ========================================

async function startServer() {
    try {
        await initializeDatabase();

        app.listen(PORT, () => {
            console.log(
                `ClientFlow backend running on port ${PORT}`
            );
        });
    } catch (error) {
        console.error(
            "Failed to initialize database:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
