const mysql = require('mysql2/promise');
require('dotenv').config();

class Database {
    constructor() {
        this.pool = null;
    }

    async connect() {
        try {
            this.pool = mysql.createPool({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                charset: 'utf8mb4',
                connectionLimit: 20 // Adjust the limit as needed
            });
            console.log('Database connected successfully');
        } catch (error) {
            console.error('Database connection failed:', error.message);
            throw error;
        }
    }

    async query(sql, params = []) {
        if (!this.pool) {
            await this.connect();
        }
        try {
            const [results] = await this.pool.execute(sql, params);
            return results;
        } catch (error) {
            console.error('Query error:', error);
            // Handle connection errors
            if (error) {
                console.log('Reconnecting to the database...');
                await this.connect(); // Reconnect
                //return this.query(sql, params); // Retry the query
            }
            throw error;
        }
    }


    async close() {
        if (this.pool) {
            try {
                await this.pool.end();
                console.log('Database connection pool closed');
            } catch (error) {
                console.error('Error closing the database connection pool:', error);
                throw error;
            }
        }
    }
}

module.exports = new Database();