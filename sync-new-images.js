const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

const IMAGES_BASE_DIR = path.join(__dirname, 'public', 'images');

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

function getExtension(url) {
    const match = url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i);
    return match ? match[1] : 'jpg';
}

async function syncNewImages() {
    let connection;
    
    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Find artists without local images
        const [artists] = await connection.execute(
            'SELECT id, name, images FROM artists WHERE images IS NOT NULL AND (local_images IS NULL OR local_images = "null")'
        );
        
        // Find albums without local images
        const [albums] = await connection.execute(
            'SELECT id, name, images FROM albums WHERE images IS NOT NULL AND (local_images IS NULL OR local_images = "null")'
        );
        
        console.log(`Found ${artists.length} artists and ${albums.length} albums without local images`);
        
        if (artists.length === 0 && albums.length === 0) {
            console.log('All images are already synced!');
            return;
        }
        
        // Process artists
        for (const artist of artists) {
            try {
                // Handle both string and object types for images
                let images;
                if (typeof artist.images === 'string') {
                    try {
                        images = JSON.parse(artist.images);
                    } catch (e) {
                        console.error(`Invalid JSON for artist ${artist.name}: ${e.message}`);
                        continue;
                    }
                } else if (typeof artist.images === 'object') {
                    images = artist.images;
                } else {
                    continue;
                }
                
                if (!images || !Array.isArray(images) || images.length === 0) continue;
                
                const localImages = [];
                
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
                        console.error(`Failed to download image for artist ${artist.name}:`, err.message);
                    }
                }
                
                if (localImages.length > 0) {
                    await connection.execute(
                        'UPDATE artists SET local_images = ? WHERE id = ?',
                        [JSON.stringify(localImages), artist.id]
                    );
                    console.log(`✓ Synced artist: ${artist.name}`);
                }
            } catch (err) {
                console.error(`Error processing artist ${artist.name}:`, err.message);
            }
        }
        
        // Process albums
        for (const album of albums) {
            try {
                // Handle both string and object types for images
                let images;
                if (typeof album.images === 'string') {
                    try {
                        images = JSON.parse(album.images);
                    } catch (e) {
                        console.error(`Invalid JSON for album ${album.name}: ${e.message}`);
                        continue;
                    }
                } else if (typeof album.images === 'object') {
                    images = album.images;
                } else {
                    continue;
                }
                
                if (!images || !Array.isArray(images) || images.length === 0) continue;
                
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
                        console.error(`Failed to download image for album ${album.name}:`, err.message);
                    }
                }
                
                if (localImages.length > 0) {
                    await connection.execute(
                        'UPDATE albums SET local_images = ? WHERE id = ?',
                        [JSON.stringify(localImages), album.id]
                    );
                    console.log(`✓ Synced album: ${album.name}`);
                }
            } catch (err) {
                console.error(`Error processing album ${album.name}:`, err.message);
            }
        }
        
        console.log('\n✓ Sync complete!');
        
    } catch (error) {
        console.error('Sync failed:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

if (require.main === module) {
    syncNewImages().catch(console.error);
}

module.exports = { syncNewImages };
