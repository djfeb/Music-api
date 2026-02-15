const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function runMigration() {
    let connection;
    
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✓ Connected');
        
        // Read migration file
        const migrationPath = path.join(__dirname, 'migrations', 'add_local_images.sql');
        const sql = await fs.readFile(migrationPath, 'utf8');
        
        // Split by semicolon and execute each statement
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));
        
        console.log(`\nExecuting ${statements.length} SQL statements...\n`);
        
        for (const statement of statements) {
            try {
                await connection.execute(statement);
                console.log('✓', statement.substring(0, 60) + '...');
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log('⊘ Column already exists, skipping...');
                } else if (err.code === 'ER_DUP_KEYNAME') {
                    console.log('⊘ Index already exists, skipping...');
                } else {
                    throw err;
                }
            }
        }
        
        console.log('\n✓ Migration completed successfully!');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

runMigration();
