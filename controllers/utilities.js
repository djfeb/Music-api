const fs = require('fs').promises;
const path = require('path');
const jsonfs = require('fs');
const mysql = require('mysql2/promise');

const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const sanitize = require('sanitize-filename');
require('dotenv').config();


const {YtdlDownload} = require('./ytdl-Helper.js');
// Global variables to track downloads
const activeDownloads = new Set();
let isShuttingDown = false;

// Function to log messages to a file
function logToFile(message) {
    const logFilePath = path.join(__dirname, '../logs.txt'); // Specify your log file path
    const formattedMessage = `${new Date().toISOString()} - ${message}\n`;

    fs.appendFile(logFilePath, formattedMessage, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

// Function to log to a Json file for tracks  that require manual download because, it needed a sign in
async function writeToJson(name, command, outputpath, artistName, trackId, reason) {
    const filePath = path.join(__dirname, 'FailedTracks.json');

    // Read existing data
    let data = {};
    if (jsonfs.existsSync(filePath)) {
        const rawData = jsonfs.readFileSync(filePath);
        data = JSON.parse(rawData);
    }

    // Ensure 'data' has a structure to hold multiple track entries
    if (!data.tracks) {
        data.tracks = [];
    }

    // Check for duplicate track_id
    const existingTrack = data.tracks.find(track => track.track_id === trackId);
    if (!existingTrack) {
    // Create a new track entry
    const newTrack = {
        track_id: trackId,
        artist: artistName,
        search_name: name,
        path: outputpath,
        command: command || '',
        reason: reason
    };

    // Add new track to the data object
    data.tracks.push(newTrack);

    // Write updated data back to the JSON file
    jsonfs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    } else {
    console.log(`Track with ID ${trackId} already exists.`);
  }
}



async function FailedTracks(artistName, album_name, trackID, trackName, searchQuery, message, command) {

    const artistDir = sanitize(artistName);  // Use this for getting name for all functions
    const albumDir = sanitize(album_name || 'Unknown Album'); // Use this for getting name for all functions 
    const trackDir = sanitize(trackID);  // Use this for getting name for all functions
    const fileName = sanitize(`${trackName}.mp3`);  // Use this for getting name for all functions
    
    const downloadPath = path.join('\\Musics', artistDir, albumDir, trackDir);

    const outputPath = path.join(downloadPath, fileName);
   
    writeToJson(searchQuery, command, outputPath, artistName, trackID, message);

        
}








// Handle graceful shutdown
// async function handleShutdown() {
//     if (isShuttingDown) return;
//     isShuttingDown = true;
    
//     console.log('\nReceived shutdown signal. Cleaning up...');
    
//     // Stop all active downloads
//     for (const download of activeDownloads) {
//         try {
//             process.kill(download.pid);
//             console.log('Stopped download process');
//         } catch (err) {
//             // Process might have already ended
//             console.log('Process might have already ended');
//         }
//     }
//     activeDownloads.clear();
    
//     // Allow some time for cleanup
//     setTimeout(() => {
//         console.log('Shutdown complete');
//         process.exit(0);
//     }, 1000);
// }

// Register shutdown handlers
// process.on('SIGINT', handleShutdown);  // Ctrl+C
//process.on('SIGTERM', handleShutdown); // Kill/Term signal
// process.on('uncaughtException', (err) => {
//     console.error('Uncaught Exception:', err);
//     handleShutdown();
// });

//Database connection configuration
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function connectToDatabase() {
    try {
        return await mysql.createConnection(dbConfig);
    } catch (error) {
        console.error('Failed to connect to database:', error);
        throw error;
    }
}


// class Database {
//     constructor() {
//         this.pool = null;
//     }

//     async connect() {
//         try {
//             this.pool = mysql.createPool({
//                 host: process.env.DB_HOST,
//                 user: process.env.DB_USER,
//                 password: process.env.DB_PASSWORD,
//                 database: process.env.DB_NAME,
//                 charset: 'utf8mb4',
//                 connectionLimit: 20 // Adjust the limit as needed
//             });
//             console.log('Database connected successfully');
//         } catch (error) {
//             console.error('Database connection failed:', error.message);
//             throw error;
//         }
//     }

//     async query(sql, params = []) {
//         if (!this.pool) {
//             await this.connect();
//         }
//         try {
//             const results = await this.pool.execute(sql, params);
//             return results;
//         } catch (error) {
//             console.error('Query error:', error);
//             // Handle connection errors
//             if (error.code === 'PROTOCOL_CONNECTION_LOST') {
//                 console.log('Reconnecting to the database...');
//                 await this.connect(); // Reconnect
//                 return this.query(sql, params); // Retry the query
//             }
//             throw error;
//         }
//     }


//     async close() {
//         if (this.pool) {
//             try {
//                 await this.pool.end();
//                 console.log('Database connection pool closed');
//             } catch (error) {
//                 console.error('Error closing the database connection pool:', error);
//                 throw error;
//             }
//         }
//     }
// }



async function readArtistsFile() {
    try {
        const content = await fs.readFile('artists.txt', 'utf8');
        return content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    } catch (error) {
        console.error('Error reading artists.txt:', error);
        return [];
    }
}






async function getArtistData(connection, artistIdOrName) {
    try {
    // Try to fetch by ID first
    let [rows] = await connection.execute(
        'SELECT * FROM artists WHERE id = ?',
        [artistIdOrName]
    );

    // If not found by ID, try searching by name
    if (rows.length === 0) {
        [rows] = await connection.execute(
            'SELECT * FROM artists WHERE name LIKE ?',
            [`%${artistIdOrName}%`]
        );
    }

    return rows[0];
    } catch (error) {
    console.error('Error fetching artist data:', error);
    return null;
    }
}



async function getArtistTracks(connection, artistId) {
    try {
        const [tracks] = await connection.execute(`
            SELECT t.*, a.name as album_name 
            FROM tracks t
            JOIN artist_tracks at ON t.id = at.track_id
            LEFT JOIN albums a ON t.album_id = a.id
            WHERE at.artist_id = ?
        `, [artistId]);
        return tracks;
    } catch (error) {
        console.error('Error fetching artist tracks:', error);
        return [];
    }
}



async function checkIfTrackExists(trackId, trackName, connection) {
    const downloadDir = path.join(__dirname, '../../Musics');
    
    try {
        const findTrackDir = async (dir) => {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name.includes(trackId)) {
                        // Found the track directory, now check if MP3 exists and is complete
                        try {
                            console.log(`Checking directory: ${fullPath}`);
                            const dirContents = await fs.readdir(fullPath);
                            console.log(`Checking track ${trackId} - ${trackName}`);
                            console.log(`Directory contents:`, dirContents);
                            const mp3File = dirContents.find(file => file.endsWith('.mp3'));
                            const hasPartialFiles = dirContents.some(file => 
                                file.endsWith('.part') || 
                                file.endsWith('.temp') || 
                                file.endsWith('.webm') ||
                                file.endsWith('.webp')
                            );
                            console.log(`Has MP3: ${!!mp3File}, Has partial files: ${hasPartialFiles}, Location: ${fullPath}`);
                            
                            // If we have a complete MP3 file
                            if (mp3File) {
                                const mp3Path = path.join(fullPath, mp3File);
                                const stats = await fs.stat(mp3Path);
                                
                                // Check if file is larger than 1KB (to ensure it's not empty/corrupted)
                                if (stats.size > 1024) {
                                    await updateTrackStatus(connection, trackId, 'available');
                                    // Clean up any leftover temporary files if they exist
                                    if (hasPartialFiles) {
                                        console.log(`Cleaning up leftover temporary files for ${trackName}...`);
                                        for (const file of dirContents) {
                                            if (file !== mp3File) {
                                                await fs.unlink(path.join(fullPath, file)).catch(() => {});
                                            }
                                        }
                                    }
                                    console.log(`Found complete track: ${trackName} at ${fullPath}`);
                                    return { exists: true, path: fullPath };
                                }
                            }
                            
                            // If we get here, either no MP3 found or it's incomplete
                            if (dirContents.length > 0) {
                                logToFile(`Found incomplete download for ${trackName}, cleaning up...`);
                                console.log(`Found incomplete download for ${trackName}, cleaning up...`);
                                for (const file of dirContents) {
                                    await fs.unlink(path.join(fullPath, file)).catch(() => {});
                                }
                            }
                            // Try to remove the directory itself if it exists
                            try {
                                const checkExistence = await fs.access(fullPath);
                                //logToFile(`existence ${checkExistence}`);
                                if (checkExistence) {
                                     logToFile(`Directory Existed, so removing: ${checkExistence}`);
                                     await fs.rmdir(fullPath);
                                }
                                
                            } catch (error) {
                                // Ignore errors if directory doesn't exist or isn't empty
                                if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') {
                                    console.error(`Error removing directory: Because it will ignore errors.`);
                                }
                                
                            }
                            return { exists: false, needsStatusUpdate: true };
                        } catch (err) {
                            // If the directory doesn't exist, that's fine - treat as not found
                            if (err.code === 'ENOENT') {
                                return { exists: false, needsStatusUpdate: true };
                            }
                            console.error(`Error checking MP3 file: ${err.message}`);
                        }
                    }
                    // Only search subdirectories if we haven't found the track in this directory
                    const found = await findTrackDir(fullPath);
                    if (found && found.exists) return found;
                }
            }
            return { exists: false };
        };

        return await findTrackDir(downloadDir);
    } catch (error) {
        console.error('Error checking if track exists:', error);
        return { exists: false };
    }
}




async function searchYouTubeMusic(trackName, artistName, album_name, trackID, trycommand = null , retries = 1) {
    try {

        if (!trackName && !artistName) {
            return null;
        }

        const searchQuery = `${artistName} - ${trackName} official audio`;
        
        // Use yt-dlp to search YouTube Music directly
        const command = trycommand || `yt-dlp ytsearch1:"${searchQuery}" --format bestaudio --extract-audio --audio-format mp3 --no-download --dump-json`;
        
        if (trycommand) {
            console.log('Using New Command for YT-Seach:', command);
        }else {
           console.log('Using OLD Command for YT-Seach:', command);
        }



        // stdout should always be under retries
        const { stdout, stderr } = await execAsync(command, { maxBuffer: 5 * 1024 * 1024 });



        

        if (!stdout) {
            const noNetwork = stderr.includes('getaddrinfo failed');
            if (!noNetwork) {
                console.log('Value of stdot:', stdout);
                console.log(`No results found for: ${searchQuery}`);
                await FailedTracks(artistName, album_name, trackID, trackName, searchQuery, 'content is not available', command)
            }
            return null;
        }


        const result = JSON.parse(stdout);
        console.log(`Found match: "${result.title}" by ${result.uploader}`);

        return {
            videoId: result.id,
            title: result.title,
            artist: artistName,
            duration: result.duration
        };
    } catch (error) {
        console.error(`Error searching YouTube Music, ${retries} Retrying... `, error);
        const searchQuery = `${artistName} - ${trackName} official audio`;
        const newcommand = `yt-dlp ytsearch1:"${searchQuery}" --extractor-args "youtube:formats=missing_pot" --format bestaudio --extract-audio --audio-format mp3 --no-download --dump-json`;
        
        const noNetwork = error.stderr.includes('getaddrinfo failed');

        if(error.stderr.includes('Some tv client https formats') && !noNetwork) {
            console.log('Some tv client https formats');
             const msg ='Some tv client https formats have been skipped as they are DRM protected';
             await FailedTracks(artistName, album_name, trackID, trackName, searchQuery, msg, error.cmd);
        }
                
        if (error.stderr.includes('Sign in to confirm your age') && !noNetwork) {
            console.log('Sign in required');
            logToFile('Sign in required');
            await FailedTracks(artistName, album_name, trackID, trackName, searchQuery, 'Sign in required', error.cmd);
        } 

        else if (error.stderr && !noNetwork) {
            console.log('Other Error');
            logToFile('Other Error');
            await FailedTracks(artistName, album_name, trackID, trackName, searchQuery, 'Other Error', error.cmd);
        }

        retries--;
        if (retries < 0) {
            // 
            console.log('Failed on all Retry attempts for YT-Search.');
            return null;
        }

        return await searchYouTubeMusic(trackName, artistName, album_name, trackID, newcommand, retries)
  
        // return null;
    }
}



async function downloadAndConvertTrack(videoId, outputPath, con, trID, msg, newcommand = null, retries = 3) {
    try {

        if (!videoId) {
            return null;
        }
        const musicUrl = `https://music.youtube.com/watch?v=${videoId}`;
        // console.log(`Downloading from: ${musicUrl}`);
        
        // Use yt-dlp with best audio quality settings and no timestamp modification
        const command = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 0 --add-metadata --embed-thumbnail -o "${outputPath}" "${musicUrl}"`;
        
        // if (newcommand) {
        //     console.log('Using New Command for YT-Download:', command);
        // }else {
        //    console.log('Using OLD Command for YT-YT-Download:', command);
        // }
        
        // retries--

        // if (retries === 0) {
        //     console.log('Failed on all Retry attempts for YT-Download.');
        //     return null;
        // }
        
        logToFile(`Download Command: ${command}`)
        // Execute command and store child process reference
        const downloadProcess = exec(command);
        
        

        // Handle errors
        // downloadProcess.stderr.on('data', (error) => {
        //     console.error(`Error: ${error}`);
        // });

        // Handle process exit
        // downloadProcess.on('exit', (code) => {
        //     console.log(`Process exited with code: ${code}`);
        // });
        // activeDownloads.add(downloadProcess);
        
        // await new Promise((resolve, reject) => {  // This logic was causing the download to exit
        //     downloadProcess.on('exit', (code) => {
        //         activeDownloads.delete(downloadProcess);
        //         if (code === 0) resolve();
        //         else reject(new Error(`Process exited with code ${code}`));
        //     });
        //     downloadProcess.on('error', (err) => {
        //         activeDownloads.delete(downloadProcess);
        //         reject(err);
        //     });
        // });

        // Listen to the stdout stream
        downloadProcess.stdout.on('data', (data) => {
            // Check if the output includes the specified string
            if (data.includes('Deleting original file')) {
                console.log('Finalizing Music file into .mp3');
                console.log('Music has full Fully downloaded', outputPath)
                updateTrackStatus(con, trID, msg);
                console.log(`Successfully downloaded: ${videoId},  Updating it to 'available'.`);
                //return true;  // Return this if the downloadProcess value is true;
            }
        });

       // const isFileComplete = await ensureFileIsComplete(outputPath);

       // return false;   // If any error then check this well.
    } catch (error) {
        console.log('Error downloading Will try the Foramt Switching  Strategy', error);
        logToFile(`Error downloading Will try the Foramt Switching  Strategy: ${error}`)

        //const newcommand = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 0 --add-metadata --embed-thumbnail --extractor-args "youtube:formats=missing_pot" -o "${outputPath}" "${musicUrl}"`;
        //downloadAndConvertTrack(videoId, outputPath, con, trID, msg, newcommand, retries)
        // throw error;
        const musicUrl = `https://music.youtube.com/watch?v=${videoId}`;
        return await YtdlDownload(musicUrl, outputPath, con, trID)

    }
}

async function updateTrackStatus(connection, trackId, status) {
    try {

        if (status === 'available') {
            logToFile(`Updated status to ${status}`)
        }
        await connection.execute(
            'UPDATE tracks SET download_status = ? WHERE id = ?',
            [status, trackId]
        );
    } catch (error) {
        console.error('Error updating track status:', error);
    }
}




// Export multiple functions in one line
module.exports = {
     updateTrackStatus, downloadAndConvertTrack, 
     searchYouTubeMusic, checkIfTrackExists,
     checkIfTrackExists, getArtistTracks, getArtistData,
     readArtistsFile, connectToDatabase,
     logToFile, YtdlDownload
     };