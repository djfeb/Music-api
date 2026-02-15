require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function getArtistAlbums(connection, artistName) {
    try {
        const [rows] = await connection.execute(`
            SELECT DISTINCT a.id, a.name, COUNT(t.id) as track_count
            FROM albums a
            JOIN tracks t ON t.album_id = a.id
            JOIN artist_tracks at ON at.track_id = t.id
            JOIN artists art ON art.id = at.artist_id
            WHERE art.name LIKE ?
            GROUP BY a.id, a.name
            ORDER BY a.name
        `, [`%${artistName}%`]);
        
        return rows;
    } catch (error) {
        console.error('Error fetching albums from database:', error);
        return [];
    }
}

async function getDownloadedAlbums(artistName) {
    const downloadPath = path.join(__dirname, '../../Musics', artistName);
    try {
        const albums = new Map();
        
        // Check if artist directory exists
        try {
            await fs.access(downloadPath);
        } catch {
            console.log(`No downloads found for ${artistName}`);
            return albums;
        }

        // Read all album directories
        const entries = await fs.readdir(downloadPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const albumPath = path.join(downloadPath, entry.name);
                let trackCount = 0;
                
                // Count MP3 files in all subdirectories of the album
                const tracks = await fs.readdir(albumPath, { withFileTypes: true });
                for (const track of tracks) {
                    if (track.isDirectory()) {
                        const trackPath = path.join(albumPath, track.name);
                        const trackFiles = await fs.readdir(trackPath);
                        if (trackFiles.some(file => file.endsWith('.mp3'))) {
                            trackCount++;
                        }
                    }
                }
                
                albums.set(entry.name, trackCount);
            }
        }
        
        return albums;
    } catch (error) {
        console.error('Error reading downloaded albums:', error);
        return new Map();
    }
}

async function main() {
    const artistName = 'Taylor Swift'; // Change this to test different artists
    let connection;

    try {
        connection = await mysql.createConnection(dbConfig);
        
        // Get albums from database
        console.log(`\nFetching albums for ${artistName} from database...`);
        const dbAlbums = await getArtistAlbums(connection, artistName);
        console.log(`Found ${dbAlbums.length} albums in database:`);
        dbAlbums.forEach(album => {
            console.log(`- ${album.name} (${album.track_count} tracks)`);
        });

        // Get downloaded albums
        console.log(`\nChecking downloaded albums for ${artistName}...`);
        const downloadedAlbums = await getDownloadedAlbums(artistName);
        console.log(`Found ${downloadedAlbums.size} downloaded albums:`);
        for (const [albumName, trackCount] of downloadedAlbums) {
            console.log(`- ${albumName} (${trackCount} tracks)`);
        }

        // Compare and find differences
        console.log('\nComparing albums...');
        
        // Find albums in database but not downloaded
        const missingDownloads = dbAlbums.filter(dbAlbum => 
            ![...downloadedAlbums.keys()].some(downloadedAlbum => 
                downloadedAlbum.includes(dbAlbum.name) || dbAlbum.name.includes(downloadedAlbum)
            )
        );

        // Find downloaded albums not in database
        const extraDownloads = [...downloadedAlbums.keys()].filter(downloadedAlbum =>
            !dbAlbums.some(dbAlbum => 
                downloadedAlbum.includes(dbAlbum.name) || dbAlbum.name.includes(downloadedAlbum)
            )
        );

        if (missingDownloads.length > 0) {
            console.log('\nAlbums in database but not downloaded:');
            missingDownloads.forEach(album => {
                console.log(`- ${album.name} (${album.track_count} tracks)`);
            });
        }

        if (extraDownloads.length > 0) {
            console.log('\nDownloaded albums not in database:');
            extraDownloads.forEach(albumName => {
                console.log(`- ${albumName} (${downloadedAlbums.get(albumName)} tracks)`);
            });
        }

        if (missingDownloads.length === 0 && extraDownloads.length === 0) {
            console.log('\nAll albums match between database and downloads!');
        }

    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

main().catch(console.error);
