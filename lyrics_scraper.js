const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Enable stealth mode
puppeteer.use(StealthPlugin());

// Database configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'music_database'
};

// Create database connection
const createConnection = async () => {
    return await mysql.createConnection(dbConfig);
};

let timeoutForelem = 90000;

const userAgents = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.70 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; rv:118.0) Gecko/20100101 Firefox/118.0",
];

// simple sleep
const delay = (ms) => new Promise(res => setTimeout(res, ms));


// Create lyrics table if it doesn't exist
const createLyricsTable = async (connection) => {
    const createTableSQL = `
        CREATE TABLE IF NOT EXISTS lyrics (
            id INT AUTO_INCREMENT PRIMARY KEY,
            track_id VARCHAR(255) NOT NULL,
            track_name VARCHAR(500) NOT NULL,
            artist_name VARCHAR(500) NOT NULL,
            lyrics_text LONGTEXT,
            lyrics_synced JSON,
            source_url VARCHAR(1000),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_track (track_id),
            INDEX idx_track_name (track_name),
            INDEX idx_artist_name (artist_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    try {
        await connection.execute(createTableSQL);
        console.log('✅ Lyrics table created/verified successfully');
    } catch (error) {
        console.error('❌ Error creating lyrics table:', error);
        throw error;
    }
};

// Fetch tracks from your music API
const axios = require('axios');
const fetchTracks = async (page = 1, limit = 50) => {
    try {
        const response = await axios.get(`http://localhost:3000/tracks?sort=popularity&order=desc&page=${page}&limit=${limit}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error fetching tracks page ${page}:`, error.message);
        return { data: [], pagination: { pages: 0 } };
    }
};

function logToFile(message) {
    const logFilePath = path.join(__dirname, 'google.html');
    return fs.writeFile(logFilePath, message, { flag: 'w' });
}

// Search Google for lyrics using Puppeteer Extra (reuse page)
const searchGoogleLyrics = async (page, trackName, artistName) => {
    const searchQuery = `${trackName} lyrics by ${artistName}`;
    const encodedQuery = encodeURIComponent(searchQuery);
    const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;

    console.log(`🔍 Searching: ${searchQuery}`);



    try {
        // Rotate User-Agent + viewport
        const ua = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(ua);
        await page.setViewport({
            width: 1200 + Math.floor(Math.random() * 200),
            height: 700 + Math.floor(Math.random() * 200),
        });

        // Navigate
        await page.goto(googleUrl, { waitUntil: 'domcontentloaded', timeout: 90000 }); // 20000

        // Simulate human: move mouse + scroll
        await page.mouse.move(
            100 + Math.random() * 400,
            200 + Math.random() * 200
        );
        await page.mouse.wheel({ deltaY: 200 + Math.random() * 400 });
        console.log('timeoutForelem Now:', timeoutForelem);
        // Wait for lyrics selectors or fallback
        try {
    // ✅ Wait specifically for lyrics container
        await page.waitForSelector('div[jsname="WbKHeb"] span[jsname="YS01Ge"]', { timeout: timeoutForelem }); //15000
        } catch {
            console.log('⚠️ Lyrics container not found immediately, checking full page...');
        }

        // Human-like delay
        await delay(2000 + Math.random() * 3000);

        // ✅ Extract with paragraph & line breaks preserved
        const lyrics = await page.$$eval('div[jsname="WbKHeb"] div[jsname="U8S5sf"]', blocks => {
            return blocks.map(block => {
                const lines = Array.from(block.querySelectorAll('span[jsname="YS01Ge"]'))
                    .map(span => span.innerText.trim())
                    .filter(Boolean);
                return lines.join('\n'); // lines inside a block
            }).join('\n\n'); // blank line between paragraphs
        });

        return lyrics.trim();

    } catch (err) {
        console.error(`❌ Error for ${trackName}:`, err.message);
        return '';
    }
};

// Parse lyrics into synced format (basic implementation)
const parseSyncedLyrics = (lyricsText) => {
    if (!lyricsText) return [];

    const lines = lyricsText.split('\n').filter(line => line.trim());
    const syncedLyrics = [];

    lines.forEach((line, index) => {
        // Basic timing - 3 seconds per line (placeholder)
        const timeMs = index * 3000;

        syncedLyrics.push({
            time: timeMs,
            text: line.trim()
        });
    });

    return syncedLyrics;
};


// Save lyrics to database
const saveLyrics = async (connection, trackId, trackName, artistName, lyricsText, sourceUrl = '') => {
    try {
        const syncedLyrics = parseSyncedLyrics(lyricsText);
        const insertSQL = `
            INSERT INTO lyrics (track_id, track_name, artist_name, lyrics_text, lyrics_synced, source_url)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            lyrics_text = VALUES(lyrics_text),
            lyrics_synced = VALUES(lyrics_synced),
            source_url = VALUES(source_url),
            updated_at = CURRENT_TIMESTAMP
        `;
        
        await connection.execute(insertSQL, [
            trackId,
            trackName,
            artistName,
            lyricsText,
            JSON.stringify(syncedLyrics),
            sourceUrl
        ]);
        
        console.log(`✅ Saved lyrics for: ${trackName} - ${artistName}`);
        return true;
    } catch (error) {
        console.error(`❌ Error saving lyrics for ${trackName}:`, error.message);
        return false;
    }
};

// Main scraping function
const scrapeLyrics = async () => {
    let connection;
    let browser;
    try {
        connection = await createConnection();
        console.log('✅ Database connected successfully');
        await createLyricsTable(connection);

        // 🔥 Launch browser ONCE
        browser = await puppeteer.launch({
            headless: false, 
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );

        let pageNum = 1;
        let totalProcessed = 0;
        let totalSaved = 0;

        while (true) {
            console.log(`\n📄 Processing page ${pageNum}...`);
            const tracksData = await fetchTracks(pageNum, 50);
            if (!tracksData.data || tracksData.data.length === 0) break;

            for (const track of tracksData.data) {
                totalProcessed++;

                const [existingLyrics] = await connection.execute(
                    'SELECT id FROM lyrics WHERE track_id = ?',
                    [track.id]
                );
                if (existingLyrics.length > 0) {
                    console.log(`⏭️  Skipping ${track.name} - already exists`);
                    continue;
                }

                const artistName = track.artists?.[0] || 'Unknown Artist';
                const lyrics = await searchGoogleLyrics(page, track.name, artistName);

                if (lyrics) {
                    const saved = await saveLyrics(
                        connection, 
                        track.id, 
                        track.name, 
                        artistName, 
                        lyrics
                    );
                    if (saved) totalSaved++;
                    timeoutForelem = 9000;
                    console.log('timeoutForelem changed to:', timeoutForelem)
                  await delay(4000 + Math.random() * 3000); // human delay
                } else {
                    timeoutForelem = 9000;
                    console.log(`❌ No lyrics found for: ${track.name} - ${artistName}`);
                }
            }

            if (pageNum >= tracksData.pagination.pages) break;
            pageNum++;
            await delay(4000 + Math.random() * 3000);
          //  await page.waitForTimeout(4000 + Math.random() * 3000);
        }

        console.log(`\n🎉 Done! Processed: ${totalProcessed}, Saved: ${totalSaved}`);

    } catch (err) {
        console.error('❌ Error during scraping:', err);
    } finally {
        if (browser) await browser.close();
        if (connection) await connection.end();
    }
};

// Run the scraper
if (require.main === module) {
    console.log('🚀 Starting lyrics scraper with Puppeteer Extra...');
    scrapeLyrics();
}

module.exports = { scrapeLyrics, searchGoogleLyrics, createLyricsTable };
