const mysql = require('mysql2/promise');
const sqlite3 = require('sqlite3').verbose();
const { promisify } = require('util');
require('dotenv').config();

class Database {
    constructor() {
        this.pool = null;
        this.sqliteDb = null;
        this.dbType = null; // 'mysql' or 'sqlite'
        this.isConnecting = false;
    }

    async connect() {
        if (this.isConnecting) {
            // Wait for existing connection attempt
            while (this.isConnecting) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return;
        }

        this.isConnecting = true;

        try {
            // First, try to connect to MySQL
            console.log('Attempting to connect to MySQL...');
            await this.connectMySQL();
            this.dbType = 'mysql';
            console.log('✓ Database connected successfully (MySQL)');
        } catch (mysqlError) {
            console.warn('MySQL connection failed:', mysqlError.message);
            console.log('Falling back to SQLite...');
            
            try {
                // Fallback to SQLite
                await this.connectSQLite();
                this.dbType = 'sqlite';
                console.log('✓ Database connected successfully (SQLite fallback)');
            } catch (sqliteError) {
                console.error('SQLite connection also failed:', sqliteError.message);
                this.isConnecting = false;
                throw new Error('Both MySQL and SQLite connections failed');
            }
        } finally {
            this.isConnecting = false;
        }
    }

    async connectMySQL() {
        // Test connection first with a timeout
        const testConnection = await Promise.race([
            mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                charset: 'utf8mb4'
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('MySQL connection timeout')), 5000)
            )
        ]);

        // If test connection succeeds, close it and create pool
        await testConnection.end();

        this.pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            charset: 'utf8mb4',
            connectionLimit: 20,
            waitForConnections: true,
            queueLimit: 0
        });
    }

    async connectSQLite() {
        const dbPath = process.env.SQLITE_DB_PATH || './music_database.sqlite';
        
        return new Promise((resolve, reject) => {
            this.sqliteDb = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    // Promisify SQLite methods
                    this.sqliteDb.all = promisify(this.sqliteDb.all.bind(this.sqliteDb));
                    this.sqliteDb.run = promisify(this.sqliteDb.run.bind(this.sqliteDb));
                    this.sqliteDb.get = promisify(this.sqliteDb.get.bind(this.sqliteDb));
                    resolve();
                }
            });
        });
    }

    async query(sql, params = []) {
        if (!this.dbType) {
            await this.connect();
        }

        try {
            if (this.dbType === 'mysql') {
                return await this.queryMySQL(sql, params);
            } else {
                return await this.querySQLite(sql, params);
            }
        } catch (error) {
            console.error('Query error:', error.message);
            
            // If MySQL fails, try to reconnect or fallback to SQLite
            if (this.dbType === 'mysql') {
                console.log('MySQL query failed, attempting to reconnect or fallback...');
                this.pool = null;
                this.dbType = null;
                await this.connect();
                
                // Retry query with new connection
                if (this.dbType === 'mysql') {
                    return await this.queryMySQL(sql, params);
                } else {
                    return await this.querySQLite(sql, params);
                }
            }
            
            throw error;
        }
    }

    async queryMySQL(sql, params = []) {
        const [results] = await this.pool.execute(sql, params);
        return results;
    }

    async querySQLite(sql, params = []) {
        // Convert MySQL-style ? placeholders to SQLite (they're the same, but handle named params)
        // SQLite uses ? for positional parameters, same as MySQL
        
        // Handle different query types
        if (sql.trim().toUpperCase().startsWith('SELECT') || 
            sql.trim().toUpperCase().startsWith('SHOW') ||
            sql.trim().toUpperCase().startsWith('DESCRIBE')) {
            return await this.sqliteDb.all(sql, params);
        } else {
            // INSERT, UPDATE, DELETE
            const result = await this.sqliteDb.run(sql, params);
            return {
                affectedRows: result.changes,
                insertId: result.lastID
            };
        }
    }

    getDbType() {
        return this.dbType;
    }

    async close() {
        if (this.pool) {
            try {
                await this.pool.end();
                console.log('MySQL connection pool closed');
            } catch (error) {
                console.error('Error closing MySQL connection pool:', error);
            }
        }
        
        if (this.sqliteDb) {
            return new Promise((resolve, reject) => {
                this.sqliteDb.close((err) => {
                    if (err) {
                        console.error('Error closing SQLite connection:', err);
                        reject(err);
                    } else {
                        console.log('SQLite connection closed');
                        resolve();
                    }
                });
            });
        }
    }
}

module.exports = new Database();
