// Test script to verify database fallback functionality
require('dotenv').config();
const db = require('./database');

async function testDatabaseFallback() {
    console.log('Testing Database Fallback Feature\n');
    console.log('='.repeat(50));
    
    try {
        // Test connection
        console.log('\n1. Testing database connection...');
        await db.connect();
        const dbType = db.getDbType();
        console.log(`   ✓ Connected to ${dbType.toUpperCase()}`);
        
        // Test query
        console.log('\n2. Testing query execution...');
        const artists = await db.query('SELECT COUNT(*) as count FROM artists');
        console.log(`   ✓ Found ${artists[0].count} artists in database`);
        
        const albums = await db.query('SELECT COUNT(*) as count FROM albums');
        console.log(`   ✓ Found ${albums[0].count} albums in database`);
        
        const tracks = await db.query('SELECT COUNT(*) as count FROM tracks');
        console.log(`   ✓ Found ${tracks[0].count} tracks in database`);
        
        // Test sample data
        console.log('\n3. Testing sample data retrieval...');
        const sampleArtists = await db.query('SELECT name FROM artists LIMIT 3');
        console.log('   Sample artists:');
        sampleArtists.forEach(artist => console.log(`     - ${artist.name}`));
        
        console.log('\n' + '='.repeat(50));
        console.log(`✓ All tests passed using ${dbType.toUpperCase()}`);
        console.log('='.repeat(50) + '\n');
        
    } catch (error) {
        console.error('\n✗ Test failed:', error.message);
        process.exit(1);
    } finally {
        await db.close();
    }
}

testDatabaseFallback();
