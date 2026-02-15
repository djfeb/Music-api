const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function columnExists(connection, table, column) {
    const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [dbConfig.database, table, column]
    );
    return rows[0].count > 0;
}

async function indexExists(connection, table, indexName) {
    const [rows] = await connection.execute(
        `SELECT COUNT(*) as count FROM information_schema.STATISTICS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [dbConfig.database, table, indexName]
    );
    return rows[0].count > 0;
}

async function runMigration() {
    let connection;
    
    try {
        console.log('Connecting to database...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✓ Connected\n');
        
        // Add local_images column to artists table
        if (await columnExists(connection, 'artists', 'local_images')) {
            console.log('⊘ Column artists.local_images already exists, skipping...');
        } else {
            await connection.execute(
                `ALTER TABLE artists 
                 ADD COLUMN local_images JSON DEFAULT NULL COMMENT 'Locally stored images' AFTER images`
            );
            console.log('✓ Added column artists.local_images');
        }
        
        // Add local_images column to albums table
        if (await columnExists(connection, 'albums', 'local_images')) {
            console.log('⊘ Column albums.local_images already exists, skipping...');
        } else {
            await connection.execute(
                `ALTER TABLE albums 
                 ADD COLUMN local_images JSON DEFAULT NULL COMMENT 'Locally stored images' AFTER images`
            );
            console.log('✓ Added column albums.local_images');
        }
        
        console.log('\n✓ Migration completed successfully!');
        console.log('\nNote: No indexes needed for local_images columns.');
        console.log('These columns are only used for serving images, not for searching.\n');
        
    } catch (error) {
        console.error('\nMigration failed:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

runMigration();
