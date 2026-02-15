require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

// Function to normalize strings for comparison
function normalize(str) {
    return str.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove special characters
        .replace(/\s+/g, ' ')    // Normalize spaces
        .trim();
}

// Function to calculate similarity between two strings
function stringSimilarity(str1, str2) {
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    return norm1 === norm2;
}

async function getArtistAlbums(connection, artistName) {
    try {
        // Get albums with their tracks
        const [albums] = await connection.execute(`
            SELECT DISTINCT 
                a.id as album_id, 
                a.name as album_name,
                t.id as track_id,
                t.name as track_name,
                t.download_status,
                t.album_id
            FROM albums a
            JOIN tracks t ON t.album_id = a.id
            JOIN artist_tracks at ON at.track_id = t.id
            JOIN artists art ON art.id = at.artist_id
            WHERE art.name LIKE ?
            ORDER BY a.name, t.name
        `, [`%${artistName}%`]);

        // Group tracks by album
        const albumMap = new Map();
        for (const row of albums) {
            if (!albumMap.has(row.album_id)) {
                albumMap.set(row.album_id, {
                    id: row.album_id,
                    name: row.album_name,
                    tracks: []
                });
            }
            albumMap.get(row.album_id).tracks.push({
                id: row.track_id,
                name: row.track_name,
                status: row.download_status
            });
        }

        return Array.from(albumMap.values());
    } catch (error) {
        console.error('Error fetching albums from database:', error);
        return [];
    }
}

async function getDownloadedAlbums(artistName) {
    const downloadPath = path.join(__dirname, '../../Musics', artistName);
    try {
        const albums = new Map();
        
        try {
            await fs.access(downloadPath);
        } catch {
            console.log(`No downloads found for ${artistName}`);
            return albums;
        }

        const entries = await fs.readdir(downloadPath, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const albumPath = path.join(downloadPath, entry.name);
                const tracks = [];
                
                const trackDirs = await fs.readdir(albumPath, { withFileTypes: true });
                for (const trackDir of trackDirs) {
                    if (trackDir.isDirectory()) {
                        const trackPath = path.join(albumPath, trackDir.name);
                        const trackFiles = await fs.readdir(trackPath);
                        const mp3Files = trackFiles.filter(file => file.endsWith('.mp3'));
                        
                        if (mp3Files.length > 0) {
                            tracks.push({
                                id: trackDir.name,
                                name: mp3Files[0].replace('.mp3', ''),
                                path: path.join(trackPath, mp3Files[0])
                            });
                        }
                    }
                }
                
                if (tracks.length > 0) {
                    albums.set(entry.name, {
                        name: entry.name,
                        tracks: tracks
                    });
                }
            }
        }
        
        return albums;
    } catch (error) {
        console.error('Error reading downloaded albums:', error);
        return new Map();
    }
}

async function fixMissingTracks(connection, missingTracks) {
    if (missingTracks.length === 0) {
        console.log('\nNo tracks to fix!');
        return;
    }

    console.log('\n=== Starting to fix missing tracks ===');
    console.log(`Found ${missingTracks.length} tracks to fix:\n`);

    const results = {
        success: [],
        failed: []
    };

    for (const track of missingTracks) {
        console.log(`\nProcessing: ${track.name} (Album: ${track.albumName})`);
        
        try {
            // Reset the track status to trigger a new download
            await connection.execute(
                'UPDATE tracks SET download_status = ? WHERE id = ?',
                ['not_downloaded', track.id]
            );
            console.log(`✓ Reset status for: ${track.name}`);
            
            // If there's a partial download directory, clean it up
            const downloadPath = path.join(
                __dirname, 
                '../../Musics', 
                'Taylor Swift',
                track.albumName,
                track.id
            );

            try {
                const dirContents = await fs.readdir(downloadPath);
                if (dirContents.length > 0) {
                    console.log(`Found existing directory for ${track.name}, cleaning up...`);
                    
                    // Delete all files in the directory
                    await Promise.all(dirContents.map(async (file) => {
                        const filePath = path.join(downloadPath, file);
                        try {
                            await fs.unlink(filePath);
                            console.log(`  ✓ Deleted: ${file}`);
                        } catch (err) {
                            console.error(`  × Failed to delete ${file}:`, err.message);
                            throw err;
                        }
                    }));
                    
                    // Remove the directory
                    await fs.rmdir(downloadPath);
                    console.log(`✓ Removed directory for: ${track.name}`);
                }
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.error(`× Error cleaning up directory for ${track.name}:`, err.message);
                    throw err;
                }
            }

            results.success.push(track);
            console.log(`✓ Successfully processed: ${track.name}`);

        } catch (err) {
            console.error(`× Failed to process ${track.name}:`, err.message);
            results.failed.push({
                track,
                error: err.message
            });
        }
    }

    // Summary
    console.log('\n=== Fix Process Summary ===');
    if (results.success.length > 0) {
        console.log('\nSuccessfully fixed:');
        results.success.forEach(track => {
            console.log(`✓ ${track.name} (${track.id})`);
        });
    }

    if (results.failed.length > 0) {
        console.log('\nFailed to fix:');
        results.failed.forEach(({track, error}) => {
            console.log(`× ${track.name} (${track.id})`);
            console.log(`  Error: ${error}`);
        });
    }

    return results;
}

async function main() {
    const artistName = 'Taylor Swift';
    let connection;
    const missingTracks = [];

    try {
        connection = await mysql.createConnection(dbConfig);
        
        console.log(`\nFetching albums for ${artistName} from database...`);
        const dbAlbums = await getArtistAlbums(connection, artistName);
        console.log(`Found ${dbAlbums.length} albums in database\n`);

        console.log(`Checking downloaded albums for ${artistName}...`);
        const downloadedAlbums = await getDownloadedAlbums(artistName);
        console.log(`Found ${downloadedAlbums.size} downloaded albums\n`);

        console.log('Detailed Comparison:\n');
        console.log('1. Albums Present in Both:');
        console.log('-------------------------');

        // Compare each database album
        for (const dbAlbum of dbAlbums) {
            let downloadedAlbum = null;
            
            // Try to find matching downloaded album
            for (const [name, album] of downloadedAlbums) {
                if (stringSimilarity(dbAlbum.name, name)) {
                    downloadedAlbum = album;
                    break;
                }
            }

            if (downloadedAlbum) {
                console.log(`\nAlbum: ${dbAlbum.name}`);
                console.log(`Database tracks: ${dbAlbum.tracks.length}`);
                console.log(`Downloaded tracks: ${downloadedAlbum.tracks.length}`);

                // Compare tracks
                const missingTracksInAlbum = dbAlbum.tracks.filter(dbTrack => 
                    !downloadedAlbum.tracks.some(dlTrack => dlTrack.id === dbTrack.id)
                );

                if (missingTracksInAlbum.length > 0) {
                    console.log('\n  Missing tracks:');
                    missingTracksInAlbum.forEach(track => {
                        console.log(`  - ${track.name} (ID: ${track.id}, Status: ${track.status})`);
                        missingTracks.push({
                            ...track,
                            albumName: dbAlbum.name
                        });
                    });
                } else {
                    console.log('  ✓ All tracks match');
                }
            }
        }

        console.log('\n2. Albums Only in Database:');
        console.log('-------------------------');
        for (const dbAlbum of dbAlbums) {
            if (![...downloadedAlbums.keys()].some(name => stringSimilarity(name, dbAlbum.name))) {
                console.log(`\n${dbAlbum.name}`);
                console.log('Missing tracks:');
                dbAlbum.tracks.forEach(track => {
                    console.log(`- ${track.name} (Status: ${track.status})`);
                    missingTracks.push({
                        ...track,
                        albumName: dbAlbum.name
                    });
                });
            }
        }

        // Automatically fix missing tracks and start download
        if (missingTracks.length > 0) {
            console.log('\n=== Missing Tracks Summary ===');
            console.log('Fixing the following tracks:');
            missingTracks.forEach(track => {
                console.log(`- ${track.name} (Album: ${track.albumName})`);
                console.log(`  Status: ${track.status}, ID: ${track.id}`);
            });

            const results = await fixMissingTracks(connection, missingTracks);
            
            if (results.success.length > 0) {
                console.log('\nStarting download-music.js to process fixed tracks...');
                try {
                    const { stdout, stderr } = await execAsync('node download-music.js');
                    console.log(stdout);
                    if (stderr) console.error(stderr);
                } catch (error) {
                    console.error('Error running download script:', error);
                }
            }
        } else {
            console.log('\nNo missing tracks to fix!');
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
