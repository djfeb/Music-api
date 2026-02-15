// const fs = require('fs').promises;
// const path = require('path');
// const mysql = require('mysql2/promise');
// const { exec } = require('child_process');
// const util = require('util');
// const execAsync = util.promisify(exec);
// const sanitize = require('sanitize-filename');
// require('dotenv').config();


// // Global variables to track downloads
// const activeDownloads = new Set();
// let isShuttingDown = false;

// // Function to log messages to a file
// function logToFile(message) {
//     const logFilePath = path.join(__dirname, 'logs.txt'); // Specify your log file path
//     const formattedMessage = `${new Date().toISOString()} - ${message}\n`;

//     fs.appendFile(logFilePath, formattedMessage, (err) => {
//         if (err) {
//             console.error('Error writing to log file:', err);
//         }
//     });
// }


// async function ensureFileIsComplete(path) {
//     const fullPath = path;

//     try {
//         console.log(`Checking directory: ${fullPath}`);
//         const dirContents = await fs.readdir(fullPath);
        
//         const mp3File = dirContents.find(file => file.endsWith('.mp3'));

//         const hasPartialFiles = dirContents.some(file => 
//             file.endsWith('.part') || 
//             file.endsWith('.temp') || 
//             file.endsWith('.webm') ||
//             file.endsWith('.webp')
//         );

//         if (mp3File && !hasPartialFiles) {
//             logToFile('Music has full Fully downloaded', fullPath )
//             return true; // There is an mp3 file and no partial files
//         }
//         logToFile('Music Was not Fully downloaded', fullPath )
//         return false; // Either no mp3 file or there are partial files
//     } catch (error) {
//         console.error(`Error reading directory: ${error.message}`);
//         return false; // Handle the error appropriately (return false or rethrow)
//     }
// }


// // Handle graceful shutdown
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
//         }
//     }
//     activeDownloads.clear();
    
//     // Allow some time for cleanup
//     setTimeout(() => {
//         console.log('Shutdown complete');
//         process.exit(0);
//     }, 1000);
// }

// // Register shutdown handlers
// process.on('SIGINT', handleShutdown);  // Ctrl+C
// //process.on('SIGTERM', handleShutdown); // Kill/Term signal
// // process.on('uncaughtException', (err) => {
// //     console.error('Uncaught Exception:', err);
// //     handleShutdown();
// // });

// // Database connection configuration
// const dbConfig = {
//     host: process.env.DB_HOST,
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_NAME
// };

// async function connectToDatabase() {
//     try {
//         return await mysql.createConnection(dbConfig);
//     } catch (error) {
//         console.error('Failed to connect to database:', error);
//         throw error;
//     }
// }

// async function readArtistsFile() {
//     try {
//         const content = await fs.readFile('artists.txt', 'utf8');
//         return content.split('\n')
//             .map(line => line.trim())
//             .filter(line => line.length > 0);
//     } catch (error) {
//         console.error('Error reading artists.txt:', error);
//         return [];
//     }
// }

// async function getArtistData(connection, artistIdOrName) {
//     try {
//         // Try to fetch by ID first
//         let [rows] = await connection.execute(
//             'SELECT * FROM artists WHERE id = ?',
//             [artistIdOrName]
//         );

//         // If not found by ID, try searching by name
//         if (rows.length === 0) {
//             [rows] = await connection.execute(
//                 'SELECT * FROM artists WHERE name LIKE ?',
//                 [`%${artistIdOrName}%`]
//             );
//         }

//         return rows[0];
//     } catch (error) {
//         console.error('Error fetching artist data:', error);
//         return null;
//     }
// }

// async function getArtistTracks(connection, artistId) {
//     try {
//         const [tracks] = await connection.execute(`
//             SELECT t.*, a.name as album_name 
//             FROM tracks t
//             JOIN artist_tracks at ON t.id = at.track_id
//             LEFT JOIN albums a ON t.album_id = a.id
//             WHERE at.artist_id = ?
//         `, [artistId]);
//         return tracks;
//     } catch (error) {
//         console.error('Error fetching artist tracks:', error);
//         return [];
//     }
// }

// async function checkIfTrackExists(trackId, trackName) {
//     const downloadDir = path.join(__dirname, 'downloads');
    
//     try {
//         const findTrackDir = async (dir) => {
//             const entries = await fs.readdir(dir, { withFileTypes: true });
            
//             for (const entry of entries) {
//                 const fullPath = path.join(dir, entry.name);
//                 if (entry.isDirectory()) {
//                     if (entry.name.includes(trackId)) {
//                         // Found the track directory, now check if MP3 exists and is complete
//                         try {
//                             console.log(`Checking directory: ${fullPath}`);
//                             const dirContents = await fs.readdir(fullPath);
//                             console.log(`Checking track ${trackId} - ${trackName}`);
//                             console.log(`Directory contents:`, dirContents);
//                             const mp3File = dirContents.find(file => file.endsWith('.mp3'));
//                             const hasPartialFiles = dirContents.some(file => 
//                                 file.endsWith('.part') || 
//                                 file.endsWith('.temp') || 
//                                 file.endsWith('.webm') ||
//                                 file.endsWith('.webp')
//                             );
//                             console.log(`Has MP3: ${!!mp3File}, Has partial files: ${hasPartialFiles}, Location: ${fullPath}`);
                            
//                             // If we have a complete MP3 file
//                             if (mp3File) {
//                                 const mp3Path = path.join(fullPath, mp3File);
//                                 const stats = await fs.stat(mp3Path);
                                
//                                 // Check if file is larger than 1KB (to ensure it's not empty/corrupted)
//                                 if (stats.size > 1024) {
//                                     // Clean up any leftover temporary files if they exist
//                                     if (hasPartialFiles) {
//                                         console.log(`Cleaning up leftover temporary files for ${trackName}...`);
//                                         for (const file of dirContents) {
//                                             if (file !== mp3File) {
//                                                 await fs.unlink(path.join(fullPath, file)).catch(() => {});
//                                             }
//                                         }
//                                     }
//                                     console.log(`Found complete track: ${trackName} at ${fullPath}`);
//                                     return { exists: true, path: fullPath };
//                                 }
//                             }
                            
//                             // If we get here, either no MP3 found or it's incomplete
//                             if (dirContents.length > 0) {
//                                 console.log(`Found incomplete download for ${trackName}, cleaning up...`);
//                                 for (const file of dirContents) {
//                                     await fs.unlink(path.join(fullPath, file)).catch(() => {});
//                                 }
//                             }
//                             // Try to remove the directory itself if it exists
//                             try {
//                                 await fs.rmdir(fullPath);
//                             } catch (error) {
//                                 // Ignore errors if directory doesn't exist or isn't empty
//                                 if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') {
//                                     console.error(`Error removing directory: Because it will ignore errors.`);
//                                 }
                                
//                             }
//                             return { exists: false, needsStatusUpdate: true };
//                         } catch (err) {
//                             // If the directory doesn't exist, that's fine - treat as not found
//                             if (err.code === 'ENOENT') {
//                                 return { exists: false, needsStatusUpdate: true };
//                             }
//                             console.error(`Error checking MP3 file: ${err.message}`);
//                         }
//                     }
//                     // Only search subdirectories if we haven't found the track in this directory
//                     const found = await findTrackDir(fullPath);
//                     if (found && found.exists) return found;
//                 }
//             }
//             return { exists: false };
//         };

//         return await findTrackDir(downloadDir);
//     } catch (error) {
//         console.error('Error checking if track exists:', error);
//         return { exists: false };
//     }
// }

// async function searchYouTubeMusic(trackName, artistName, retries = 3, trycommand = null) {
//     try {
//         const searchQuery = `${artistName} - ${trackName} official audio`;
        
//         // Use yt-dlp to search YouTube Music directly
//         const command = trycommand || `yt-dlp ytsearch1:"${searchQuery}" --format bestaudio --extract-audio --audio-format mp3 --no-download --dump-json`;
//         console.log('Using Command:', command);
//         if (retries === 0) {
//             console.log('Failed on all Retry attempts.');
//             return null;
//         }
       
        
//         const { stdout } = await execAsync(command);
//         if (!stdout) {
//             console.log(`No results found for: ${searchQuery}`);
//             return null;
//         }

//         const result = JSON.parse(stdout);
//         console.log(`Found match: "${result.title}" by ${result.uploader}`);

//         return {
//             videoId: result.id,
//             title: result.title,
//             artist: artistName,
//             duration: result.duration
//         };
//     } catch (error) {
//         retries--
//         console.error('Error searching YouTube Music, Retrying...');
//         const searchQuery = `${artistName} - ${trackName} official audio`;
//         const newcommand = `yt-dlp ytsearch1:"${searchQuery}" --extractor-args "youtube:formats=missing_pot" --format bestaudio --extract-audio --audio-format mp3 --no-download --dump-json`;
//         trycommand = newcommand;
//         searchYouTubeMusic(trackName, artistName, retries, trycommand)
        
//         // return null;
//     }
// }

// async function downloadAndConvertTrack(videoId, outputPath) {
//     try {
//         const musicUrl = `https://music.youtube.com/watch?v=${videoId}`;
//         console.log(`Downloading from: ${musicUrl}`);
        
//         // Use yt-dlp with best audio quality settings and no timestamp modification
//         const command = `yt-dlp -f "bestaudio" --extract-audio --audio-format mp3 --audio-quality 0 --add-metadata --embed-thumbnail -o "${outputPath}" "${musicUrl}"`;
        
//         // Execute command and store child process reference
//         const downloadProcess = exec(command);
//         logToFile(`The Return value for "DownloadProcces: ${downloadProcess}`)
//         activeDownloads.add(downloadProcess);
        
//         await new Promise((resolve, reject) => {  // This logic was causing the download to exit
//             downloadProcess.on('exit', (code) => {
//                 activeDownloads.delete(downloadProcess);
//                 if (code === 0) resolve();
//                 else reject(new Error(`Process exited with code ${code}`));
//             });
//             downloadProcess.on('error', (err) => {
//                 activeDownloads.delete(downloadProcess);
//                 reject(err);
//             });
//         });
//         const isFileComplete = await ensureFileIsComplete(outputPath);
//         if (isFileComplete) {
//              console.log('Music has full Fully downloaded', outputPath)
//              return true;  // Return this if the downloadProcess value is true;
//         }
//        // return false;   // If any error then check this well.
//     } catch (error) {
//         console.error('Error downloading track:', error);
//         logToFile(`Error downloading track: ${error}`)
//         throw error;
//     }
// }

// async function updateTrackStatus(connection, trackId, status) {
//     try {
//         await connection.execute(
//             'UPDATE tracks SET download_status = ? WHERE id = ?',
//             [status, trackId]
//         );
//     } catch (error) {
//         console.error('Error updating track status:', error);
//     }
// }

// async function main(customArtists = null, customTrackIds = []) {
//     let connection;
    
//     try {
//         // Connect to database
//         connection = await connectToDatabase();
        
//         // Read artists from file
//         const artists = customArtists ? customArtists : await readArtistsFile();
        
//         if (artists.length === 0) {
//             console.log('No artists found in artists.txt / customArtists');
//             return;
//         }

//         // Process each artist
//         for (const artistIdOrName of artists) {
//             console.log(`Processing artist: ${artistIdOrName}`);
            
//             const artist = await getArtistData(connection, artistIdOrName); // artists here

//             if (parseInt(artist.download_percentage) === 100) {
//                 console.log(`Skipping ${artistIdOrName} Because it has fully downloaded:`, artist.download_percentage);
//                 logToFile(`Skipping ${artistIdOrName} Because it has fully downloaded:`, artist.download_percentage);
//                 continue;
//             }

//             if (!artist) {
//                 console.log(`Artist not found: ${artistIdOrName}`);
//                 continue;
//             }
//             const filterAtistsTracks = await getArtistTracks(connection, artist.id);
//             let tracks =  null;// Filter it here

//             if (customArtists && customTrackIds.length > 0) {
//                 tracks = filterAtistsTracks.filter(results => 
//                     customTrackIds.some(id => results.id === id)
//                 );
//                // logToFile('Filtered Artist\'s Tracks for custom Process.')
//                 return;
//             }

//             tracks = filterAtistsTracks.filter(results => {
//                    logToFile('Filtering Artist\'s Track for main Process.')
//                    results.download_status !== 'available'
//                 }      
//             );

//             console.log(`Found ${tracks.length} tracks to download for ${artist.name}`);

//             // Process tracks concurrently with a limit of 3 simultaneous downloads
//             const concurrencyLimit = 10;
//             const chunks = [];
//             for (let i = 0; i < tracks.length; i += concurrencyLimit) {
//                 chunks.push(tracks.slice(i, i + concurrencyLimit));
//             }

//             for (const chunk of chunks) {
//                 await Promise.all(chunk.map(async (track) => {
//                     try {
//                         // Check if track already exists and is complete
//                         const { exists: trackExists, needsStatusUpdate } = await checkIfTrackExists(track.id, track.name);
//                         if (trackExists) {
//                             console.log(`Track ${track.name} (${track.id}) exists and is complete, updating status...`);
//                             await updateTrackStatus(connection, track.id, 'available');
//                             return;
//                         } else if (needsStatusUpdate) {
//                             console.log(`Resetting download status for incomplete track: ${track.name}`);
//                             await updateTrackStatus(connection, track.id, 'not_downloaded');
//                         }

//                         console.log(`Processing track: ${track.name}`);

//                         // Search on YouTube Music
//                         const ytResult = await searchYouTubeMusic(track.name, artist.name);
//                         if (!ytResult) {
//                             console.log(`No YouTube Music result found for: ${track.name}`);
//                             return;
//                         }

//                         // Create directory structure
//                         const artistDir = sanitize(artist.name);  // Use this for getting name for all functions
//                         const albumDir = sanitize(track.album_name || 'Unknown Album'); // Use this for getting name for all functions 
//                         const trackDir = sanitize(`${track.id}`);  // Use this for getting name for all functions
//                         const fileName = sanitize(`${track.name}.mp3`);  // Use this for getting name for all functions
                        
//                         const downloadPath = path.join(
//                             __dirname,
//                             'downloads',
//                             artistDir,
//                             albumDir,
//                             trackDir
//                         );

//                         await fs.mkdir(downloadPath, { recursive: true });
//                         const outputPath = path.join(downloadPath, fileName);

//                         console.log(`Downloading: ${track.name}`);
//                         await updateTrackStatus(connection, track.id, 'downloading');
//                         const downloadStatus = await downloadAndConvertTrack(ytResult.videoId, outputPath);  // you need to check if its fully satisfied before make track as available
//                         if (downloadStatus) {
//                             console.log(`Successfully downloaded: ${track.name},  Updating it to 'available'.`);
//                             await updateTrackStatus(connection, track.id, 'available'); 
//                         }
                        
//                     } catch (error) {
//                         console.error(`Failed to download track: ${track.name}`, error);
//                         await updateTrackStatus(connection, track.id, 'failed');
//                     }
//                 }));
//             }
//             logToFile(`✔️ All Artists haven fully processed. Completed.`)
//             console.log("✔️ All Artists haven fully processed. Completed.")
//         }
        
//     } catch (error) {
//         console.error('An error occurred:', error);
//     } finally {
//         if (connection) {
//             await connection.end();
//         }
//     }
// }

// Run the main function

// main().catch(console.error);










const {
    updateTrackStatus,
    downloadAndConvertTrack,
    searchYouTubeMusic,
    checkIfTrackExists,
    getArtistTracks,
    getArtistData,
    readArtistsFile,
   // connectToDatabase,
    //ensureFileIsComplete,
    logToFile
} = require('./controllers/utilities.js'); 

const {main} = require('./process.test.js');





main().catch(console.error);
