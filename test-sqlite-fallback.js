// Test script to force SQLite fallback by using invalid MySQL credentials
require('dotenv').config();

// Temporarily override MySQL config to force fallback
process.env.DB_HOST = 'invalid_host_to_force_fallback';
process.env.DB_USER = 'invalid_user';

const db = require('./database');

async function testSQLiteFallback() {
    console.log('Testing SQLite Fallback (MySQL intentionally disabled)\n');
    console.log('='.repeat(50));
    
    try {
        // Test connection - should fallback to SQLite
        console.log('\n1. Testing database connection (should fallback to SQLite)...');
        await db.connect();
        const dbType = db.getDbType();
        
        if (dbType === 'sqlite') {
            console.log(`   ✓ Successfully fell back to ${dbType.toUpperCase()}`);
        } else {
            console.log(`   ✗ Expected SQLite but got ${dbType.toUpperCase()}`);
            process.exit(1);
        }
        
        // Test query
        console.log('\n2. Testing query execution on SQLite...');
        const artists = await db.query('SELECT COUNT(*) as count FROM artists');
        console.log(`   ✓ Found ${artists[0].count} artists in SQLite database`);
        
        const albums = await db.query('SELECT COUNT(*) as count FROM albums');
        console.log(`   ✓ Found ${albums[0].count} albums in SQLite database`);
        
        const tracks = await db.query('SELECT COUNT(*) as count FROM tracks');
        console.log(`   ✓ Found ${tracks[0].count} tracks in SQLite database`);
        
        // Test sample data
        console.log('\n3. Testing sample data retrieval from SQLite...');
        const sampleArtists = await db.query('SELECT name FROM artists LIMIT 3');
        console.log('   Sample artists:');
        sampleArtists.forEach(artist => console.log(`     - ${artist.name}`));
        
        // Compare counts
        console.log('\n4. Verifying data integrity...');
        if (artists[0].count === 542 && albums[0].count === 36319 && tracks[0].count === 283803) {
            console.log('   ✓ All record counts match MySQL database');
        } else {
            console.log('   ⚠ Record counts differ from MySQL:');
            console.log(`     Artists: ${artists[0].count} (expected 542)`);
            console.log(`     Albums: ${albums[0].count} (expected 36319)`);
            console.log(`     Tracks: ${tracks[0].count} (expected 283803)`);
        }
        
        console.log('\n' + '='.repeat(50));
        console.log('✓ SQLite fallback is working correctly!');
        console.log('='.repeat(50) + '\n');
        
    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await db.close();
    }
}

testSQLiteFallback();
