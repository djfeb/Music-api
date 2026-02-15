const db = require('./database');
require('dotenv').config();

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'music_database'
};

// Create database connection
// const createConnection = async () => {
//     return await mysql.createConnection(dbConfig);
// };

// Parse LRC format lyrics (if available)
const parseLRC = (lrcText) => {
    if (!lrcText) return [];
    
    const lines = lrcText.split('\n');
    const syncedLyrics = [];
    
    lines.forEach(line => {
        const timeMatch = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\]/);
        if (timeMatch) {
            const minutes = parseInt(timeMatch[1]);
            const seconds = parseInt(timeMatch[2]);
            const milliseconds = parseInt(timeMatch[3].padEnd(3, '0'));
            const timeMs = (minutes * 60 + seconds) * 1000 + milliseconds;
            
            const text = line.replace(/\[\d{2}:\d{2}\.\d{2,3}\]/, '').trim();
            if (text) {
                syncedLyrics.push({ time: timeMs, text });
            }
        }
    });
    
    return syncedLyrics.sort((a, b) => a.time - b.time);
};

// Get lyrics by track ID
const getLyricsByTrackId = async (trackId) => {
    // let connection;
    try {
        // connection = await createConnection();
        
        const [rows] = await db.query(
            'SELECT * FROM lyrics WHERE track_id = ?',
            [trackId]
        );

        
        
        if (rows.length === 0) {
            return null;
        }
        
        const lyrics = rows;
       // console.log('rows', lyrics)
        
        // Parse synced lyrics if available
        // let syncedLyrics = [];
        // if (lyrics.lyrics_synced) {
        //     try {
        //         syncedLyrics = JSON.parse(lyrics.lyrics_synced);
        //     } catch (e) {
        //         // If JSON parsing fails, create basic synced lyrics from text
        //         syncedLyrics = parseSyncedLyrics(lyrics.lyrics_text);
        //     }
        // }
        
        return {
            lyrics: lyrics.lyrics_text,
            // synced: syncedLyrics.length > 0,
            // syncedLyrics: syncedLyrics,
            source: lyrics.source_url,
            trackName: lyrics.track_name,
            artistName: lyrics.artist_name
        };
        
    } catch (error) {
        console.error('Error fetching lyrics:', error);
        return null;
    } finally {
       // if (db) await db.close();
    }
};

// Get lyrics by track name and artist
const getLyricsByTrackAndArtist = async (trackName, artistName) => {
    // let connection;
    try {
        // connection = await createConnection();
        
        const [rows] = await db.query(
            `SELECT * FROM lyrics WHERE track_name = ${trackName} AND artist_name = ${artistName}`
            
        );
        
        if (rows.length === 0) {
            return null;
        }
        
        const lyrics = rows[0];
        
        // Parse synced lyrics if available
        let syncedLyrics = [];
        if (lyrics.lyrics_synced) {
            try {
                syncedLyrics = JSON.parse(lyrics.lyrics_synced);
            } catch (e) {
                syncedLyrics = parseSyncedLyrics(lyrics.lyrics_text);
            }
        }
        
        return {
            lyrics: lyrics.lyrics_text,
            synced: syncedLyrics.length > 0,
            syncedLyrics: syncedLyrics,
            source: lyrics.source_url,
            trackName: lyrics.track_name,
            artistName: lyrics.artist_name
        };
        
    } catch (error) {
        console.error('Error fetching lyrics:', error);
        return null;
    } finally {
        //if (db) await db.close();
    }
};

// Search lyrics by keyword
const searchLyrics = async (keyword, limit = 20) => {
    // let connection;
    try {
        // connection = await createConnection();
        console.log('key', `'%${keyword}%'`);
        
        const [rows] = await db.query(
            `SELECT track_name, artist_name, track_id, 
                    SUBSTRING(lyrics_text, 1, 200) as preview
             FROM lyrics 
             WHERE lyrics_text LIKE '%${keyword}%' OR track_name LIKE '%${keyword}%' OR artist_name LIKE '%${keyword}%'
             ORDER BY updated_at DESC
             LIMIT ${limit}`
        );
        
        return rows;
        
    } catch (error) {
        console.error('Error searching lyrics:', error);
        return [];
    } finally {
        // if (db) await db.close();
    }
};

// Create basic synced lyrics from text
const parseSyncedLyrics = (lyricsText) => {
    if (!lyricsText) return [];
    
    const lines = lyricsText.split('\n').filter(line => line.trim());
    const syncedLyrics = [];
    
    lines.forEach((line, index) => {
        // Estimate timing - 3 seconds per line
        const timeMs = index * 3000;
        
        syncedLyrics.push({
            time: timeMs,
            text: line.trim()
        });
    });
    
    return syncedLyrics;
};

// Get lyrics statistics
const getLyricsStats = async () => {
    // let connection;
    try {
        // connection = await db;
        
        const [totalRows] = await db.query('SELECT COUNT(*) as total FROM lyrics');
        const [syncedRows] = await db.query('SELECT COUNT(*) as synced FROM lyrics WHERE lyrics_synced IS NOT NULL AND lyrics_synced != "[]"');
        const [recentRows] = await db.query('SELECT COUNT(*) as recent FROM lyrics WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)');
        
        return {
            total: totalRows[0].total,
            synced: syncedRows[0].synced,
            recent: recentRows[0].recent
        };
        
    } catch (error) {
        console.error('Error fetching lyrics stats:', error);
        return { total: 0, synced: 0, recent: 0 };
    } finally {
       // if (db) await db.close();
    }
};

module.exports = {
    getLyricsByTrackId,
    getLyricsByTrackAndArtist,
    searchLyrics,
    getLyricsStats,
    parseSyncedLyrics
};
