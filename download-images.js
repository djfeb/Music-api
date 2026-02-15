const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

// Base directory for storing images
const IMAGES_BASE_DIR = path.join(__dirname, 'public', 'images');

// Create directories if they don't exist
async function ensureDirectories() {
    const dirs = [
        IMAGES_BASE_DIR,
        path.join(IMAGES_BASE_DIR, 'artists'),
        path.join(IMAGES_BASE_DIR, 'albums'),
        path.join(IMAGES_BASE_DIR, 'tracks')
    ];
    
    for (const dir of dirs) {
        await fs.mkdir(dir, { recursive: true });
    }
}

// Download image from URL
async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        const file = require('fs').createWriteStream(filepath);
        
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath).catch(() => {});
            reject(err);
        });
    });
}

// Get file extension from URL
function getExtension(url) {
    const match = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
    return match ? match[1] : 'jpg';
}

// Process artists
async function processArtists(connection) {
    console.log('\n=== Processing Artists ===');
    
    const [artists] = await connection.execute(
        'SELECT id, name, images, local_images FROM artists WHERE images IS NOT NULL'
    );
    
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const total = artists.length;
    
    console.log(`Found ${total} artists to process\n`);
    
    // Process in batches for parallel downloads
    const BATCH_SIZE = 10; // Download 10 artists at a time
    
    for (let i = 0; i < artists.length; i += BATCH_SIZE) {
        const batch = artists.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (artist) => {
            try {
                // Check if already processed
                if (artist.local_images) {
                    const localImages = typeof artist.local_images === 'string' 
                        ? JSON.parse(artist.local_images) 
                        : artist.local_images;
                    if (localImages && localImages.length > 0) {
                        // Verify file exists
                        const firstImagePath = path.join(__dirname, 'public', localImages[0].url);
                        try {
                            await fs.access(firstImagePath);
                            skipped++;
                            return;
                        } catch {
                            // File doesn't exist, reprocess
                        }
                    }
                }
                
                // Handle both string and object types for images
                let images;
                if (typeof artist.images === 'string') {
                    try {
                        images = JSON.parse(artist.images);
                    } catch (e) {
                        console.error(`\nInvalid JSON for artist ${artist.name}: ${e.message}`);
                        skipped++;
                        return;
                    }
                } else if (typeof artist.images === 'object') {
                    images = artist.images;
                } else {
                    skipped++;
                    return;
                }
                
                if (!images || !Array.isArray(images) || images.length === 0) {
                    skipped++;
                    return;
                }
                
                const localImages = [];
                
                // Download all image sizes (usually 3: large, medium, small)
                for (let i = 0; i < Math.min(images.length, 3); i++) {
                    const img = images[i];
                    if (!img.url) continue;
                    
                    const ext = getExtension(img.url);
                    const filename = `${artist.id}_${i}.${ext}`;
                    const filepath = path.join(IMAGES_BASE_DIR, 'artists', filename);
                    const relativeUrl = `/images/artists/${filename}`;
                    
                    try {
                        await downloadImage(img.url, filepath);
                        localImages.push({
                            url: relativeUrl,
                            width: img.width || 640,
                            height: img.height || 640
                        });
                    } catch (err) {
                        console.error(`\nFailed to download image for artist ${artist.name}:`, err.message);
                    }
                }
                
                if (localImages.length > 0) {
                    await connection.execute(
                        'UPDATE artists SET local_images = ? WHERE id = ?',
                        [JSON.stringify(localImages), artist.id]
                    );
                    processed++;
                } else {
                    failed++;
                }
                
            } catch (err) {
                console.error(`\nError processing artist ${artist.name}:`, err.message);
                failed++;
            }
        }));
        
        // Progress indicator
        const progress = Math.round(((processed + skipped + failed) / total) * 100);
        const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
        process.stdout.write(`\r[${bar}] ${progress}% | ${processed} processed, ${skipped} skipped, ${failed} failed`);
    }
    
    console.log(`\n\nArtists: ${processed} processed, ${skipped} skipped, ${failed} failed`);
}

// Process albums
async function processAlbums(connection) {
    console.log('\n=== Processing Albums ===');
    
    const [albums] = await connection.execute(
        'SELECT id, name, images, local_images FROM albums WHERE images IS NOT NULL'
    );
    
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const total = albums.length;
    
    console.log(`Found ${total} albums to process\n`);
    
    // Process in batches for parallel downloads
    const BATCH_SIZE = 50; // Download 10 albums at a time
    
    for (let i = 0; i < albums.length; i += BATCH_SIZE) {
        const batch = albums.slice(i, i + BATCH_SIZE);
        
        await Promise.all(batch.map(async (album) => {
            try {
                // Check if already processed
                if (album.local_images) {
                    const localImages = typeof album.local_images === 'string' 
                        ? JSON.parse(album.local_images) 
                        : album.local_images;
                    if (localImages && localImages.length > 0) {
                        const firstImagePath = path.join(__dirname, 'public', localImages[0].url);
                        try {
                            await fs.access(firstImagePath);
                            skipped++;
                            return;
                        } catch {
                            // File doesn't exist, reprocess
                        }
                    }
                }
                
                // Handle both string and object types for images
                let images;
                if (typeof album.images === 'string') {
                    try {
                        images = JSON.parse(album.images);
                    } catch (e) {
                        console.error(`\nInvalid JSON for album ${album.name}: ${e.message}`);
                        skipped++;
                        return;
                    }
                } else if (typeof album.images === 'object') {
                    images = album.images;
                } else {
                    skipped++;
                    return;
                }
                
                if (!images || !Array.isArray(images) || images.length === 0) {
                    skipped++;
                    return;
                }
                
                const localImages = [];
                
                for (let i = 0; i < Math.min(images.length, 3); i++) {
                    const img = images[i];
                    if (!img.url) continue;
                    
                    const ext = getExtension(img.url);
                    const filename = `${album.id}_${i}.${ext}`;
                    const filepath = path.join(IMAGES_BASE_DIR, 'albums', filename);
                    const relativeUrl = `/images/albums/${filename}`;
                    
                    try {
                        await downloadImage(img.url, filepath);
                        localImages.push({
                            url: relativeUrl,
                            width: img.width || 640,
                            height: img.height || 640
                        });
                    } catch (err) {
                        console.error(`\nFailed to download image for album ${album.name}:`, err.message);
                    }
                }
                
                if (localImages.length > 0) {
                    await connection.execute(
                        'UPDATE albums SET local_images = ? WHERE id = ?',
                        [JSON.stringify(localImages), album.id]
                    );
                    processed++;
                } else {
                    failed++;
                }
                
            } catch (err) {
                console.error(`\nError processing album ${album.name}:`, err.message);
                failed++;
            }
        }));
        
        // Progress indicator
        const progress = Math.round(((processed + skipped + failed) / total) * 100);
        const bar = '█'.repeat(Math.floor(progress / 2)) + '░'.repeat(50 - Math.floor(progress / 2));
        process.stdout.write(`\r[${bar}] ${progress}% | ${processed} processed, ${skipped} skipped, ${failed} failed`);
    }
    
    console.log(`\n\nAlbums: ${processed} processed, ${skipped} skipped, ${failed} failed`);
}

// Main function
async function main() {
    let connection;
    
    try {
        console.log('Starting image download process...');
        
        // Ensure directories exist
        await ensureDirectories();
        console.log('✓ Directories created');
        
        // Connect to database
        connection = await mysql.createConnection(dbConfig);
        console.log('✓ Connected to database');
        
        // Process artists
        await processArtists(connection);
        
        // Process albums
        await processAlbums(connection);
        
        console.log('\n✓ Image download complete!');
        
    } catch (error) {
        console.error('Fatal error:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main, processArtists, processAlbums };
