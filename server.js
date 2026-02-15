const express = require('express');
const cors = require('cors');
const db = require('./database');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE_URL = process.env.API_BASE_URL || `http://localhost:${PORT}`;
const MUSIC_FOLDER = process.env.MUSIC_FOLDER 

console.log(`API Base URL: ${API_BASE_URL}`);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Serve images from public/images directory
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// Helper function to parse JSON fields
const parseJsonFields = (item) => {
    if (item.genres && typeof item.genres === 'string') {
        try { item.genres = JSON.parse(item.genres); } catch (e) { item.genres = []; }
    }
    if (item.external_urls && typeof item.external_urls === 'string') {
        try { item.external_urls = JSON.parse(item.external_urls); } catch (e) { item.external_urls = {}; }
    }
    
    // Parse images (Spotify URLs)
    let spotifyImages = [];
    if (item.images && typeof item.images === 'string') {
        try { spotifyImages = JSON.parse(item.images); } catch (e) { spotifyImages = []; }
    } else if (Array.isArray(item.images)) {
        spotifyImages = item.images;
    }
    
    // Parse local_images
    let localImages = [];
    if (item.local_images && typeof item.local_images === 'string') {
        try { localImages = JSON.parse(item.local_images); } catch (e) { localImages = []; }
    } else if (Array.isArray(item.local_images)) {
        localImages = item.local_images;
    }
    
    // Convert relative URLs to absolute URLs for local images
    if (localImages && localImages.length > 0) {
        localImages = localImages.map(img => ({
            ...img,
            url: img.url.startsWith('http') ? img.url : `${API_BASE_URL}${img.url}`
        }));
    }
    
    // Prioritize local images, fallback to Spotify images
    if (localImages && localImages.length > 0) {
        item.images = localImages;
        item.spotify_images = spotifyImages; // Keep Spotify images as backup
    } else {
        item.images = spotifyImages;
        item.spotify_images = spotifyImages;
    }
    
    // Clean up - remove local_images from response (already in images)
    delete item.local_images;
    
    return item;
};


// Function to recursively search for a file
const findFile = async (dir, fileName) => {
   
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    // console.log('This dir', entries)
    
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        console.log('Full path:', fullPath)
        // console.log('Is Directory:', entry.isDirectory());
        // console.log('TrackId is in entry name', entry.parentPath )

        if (entry.isDirectory()) {
            console.log('Using File name', fileName)
            const foundPath = await findFile(fullPath, fileName);
            console.log('file status',foundPath)
          
            if (foundPath) {
                 console.log('File path found:', foundPath)
                return foundPath;
            }
        } else if (fs.existsSync(fullPath) && fullPath.includes(fileName)) {  // resol it here
            console.log('else if')
            return fullPath; // Return the full path of the found file
        }
    }

    return null; // Return null if the file is not found
};


// Main function to start the search
const searchFile = async (startDir, fileName) => {
    
    try {
        const filePath = await findFile(startDir, fileName);
        console.log('gfff:', filePath)
        if (filePath) {
            console.log(`File found: ${filePath}`);
            return filePath;
        } else {
            console.log('start dir:', startDir)
            console.log('File not found');
            return null;     
        }
    } catch (error) {
        console.error('Error searching for file:', error);
        return null;
        
    }
};


// Root endpoint with API documentation
app.get('/', (req, res) => {
    res.json({
        message: 'Music API - Simple access to music database',
        version: '1.0.0',
        endpoints: {
            artists: {
                'GET /artists': 'Get all artists (with pagination)',
                'GET /artists/:id': 'Get specific artist by ID',
                'GET /artists/search/:query': 'Search artists by name',
                'GET /artists/:id/albums': 'Get albums by artist',
                'GET /artists/:id/tracks': 'Get tracks by artist'
            },
            albums: {
                'GET /albums': 'Get all albums (with pagination)',
                'GET /albums/:id': 'Get specific album by ID',
                'GET /albums/search/:query': 'Search albums by name',
                'GET /albums/:id/tracks': 'Get tracks in album'
            },
            tracks: {
                'GET /tracks': 'Get all tracks (with pagination)',
                'GET /tracks/:id': 'Get specific track by ID',
                'GET /tracks/search/:query': 'Search tracks by name'
            },
            stats: {
                'GET /stats': 'Get database statistics'
            },
            genres: {
                'GET /genres': 'Get all unique genres from the database',
                'GET /genres/counts': 'Get genres with artist counts'
            }
        },
        parameters: {
            pagination: 'Use ?page=1&limit=20 (default: page=1, limit=50, max=100)',
            sorting: 'Use ?sort=popularity&order=desc (default: name asc)'
        }
    });
});

// Artists endpoints uses query /artists?page=1&limit=50
app.get('/artists', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        const sort = req.query.sort || 'name';
        const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
        const genreQuery = req.query.genre ? req.query.genre.toLowerCase() : null;
        const validSorts = ['name', 'popularity', 'followers_total', 'created_at'];
        const sortField = validSorts.includes(sort) ? sort : 'name';
 
    
        let sql = 'SELECT * FROM artists';
        const params = [];

        if (genreQuery) {
            // If a specific genre is provided, put artists with that genre first.
            // Example: /artists?sort=genre&genre=afrobeats
            console.log(`Used genre  = ${genreQuery}`);
            
            sql += ` WHERE (LOWER(JSON_CONTAINS(genres, ?))) ORDER BY ${sortField} ${order} `;
            params.push(`"${genreQuery}"`.toLowerCase());
            
        } else {
            console.log(` Did not Use genre  = ${genreQuery}`);
            sql += ` ORDER BY ${sortField} ${order}`;
        }

        sql += ` LIMIT ${limit} OFFSET ${offset}`;

        console.log('Final SQL:', sql , params);

        const artists = await db.query(sql, params);
        
        const [{ total }] = await db.query('SELECT COUNT(*) as total FROM artists');
        // console.log('greatewe', page,total )
        if (page > Math.ceil(total / limit)) {
            // console.log('greatewe')
            res.json({message: `Invalid page number, total pages are ${Math.ceil(total / limit)}`});
            
        }else {
        
            res.json({
                data: artists.map(parseJsonFields),
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                }
            });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/artists/:id', async (req, res) => {
    try {
        const [artist] = await db.query('SELECT * FROM artists WHERE id = ?', [req.params.id]);
        if (!artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        res.json(parseJsonFields(artist));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/artists/search/:query', async (req, res) => {
    try {
        const searchQuery = req.params.query.toLowerCase();
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        
        // Create different search patterns
        const exactQuery = `%${searchQuery}%`;
        const noSpaceQuery = `%${searchQuery.replace(/\s+/g, '')}%`;
        
        const artists = await db.query(
            `SELECT * FROM artists 
             WHERE LOWER(name) LIKE ? 
             OR LOWER(REPLACE(name, ' ', '')) LIKE ? 
             ORDER BY popularity DESC 
             LIMIT ${limit} OFFSET ${offset}`,
            [exactQuery, noSpaceQuery]
        );
        
        const [{ total }] = await db.query(
            `SELECT COUNT(*) as total 
             FROM artists 
             WHERE LOWER(name) LIKE ? 
             OR LOWER(REPLACE(name, ' ', '')) LIKE ?`,
            [exactQuery, noSpaceQuery]
        );
        
        res.json({
            data: artists.map(parseJsonFields),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/artists/:id/albums', async (req, res) => {
    try {
        const albums = await db.query(`
            SELECT a.* FROM albums a
            JOIN artist_albums aa ON a.id = aa.album_id
            WHERE aa.artist_id = ?
            ORDER BY a.release_date DESC
        `, [req.params.id]);
        
        res.json(albums.map(parseJsonFields));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/artists/:id/tracks', async (req, res) => {
    try {
        const tracks = await db.query(`
            SELECT t.* FROM tracks t
            JOIN artist_tracks at ON t.id = at.track_id
            WHERE at.artist_id = ?
            ORDER BY t.popularity DESC
        `, [req.params.id]);
        
        // Enhance tracks with artist information
        const tracksWithArtists = await Promise.all(tracks.map(async (track) => {
            try {
                const artists = await db.query(`
                    SELECT a.* FROM artists a
                    JOIN artist_tracks at ON a.id = at.artist_id
                    WHERE at.track_id = ?
                `, [track.id]);
                
                const artistNames = artists.map(a => parseJsonFields(a).name);
                const artistIds = artists.map(a => parseJsonFields(a).id);
                
                return {
                    ...parseJsonFields(track),
                    artists: artistNames,
                    artist_ids: artistIds
                };
            } catch (error) {
                console.warn(`Failed to get artists for track ${track.id}:`, error);
                return {
                    ...parseJsonFields(track),
                    artists: [],
                    artist_ids: []
                };
            }
        }));
        
        res.json(tracksWithArtists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Albums endpoints
app.get('/albums', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        const sort = req.query.sort || 'name';
        const order = req.query.order === 'desc' ? 'DESC' : 'ASC';

        
        const validSorts = ['name', 'popularity', 'release_date', 'total_tracks'];
        const sortField = validSorts.includes(sort) ? sort : 'name';
        
        const albums = await db.query(
            `SELECT * FROM albums ORDER BY ${sortField} ${order} LIMIT ${limit} OFFSET ${offset}`
        );
        
        // Enhance albums with artist genre information
        const albumsWithArtistGenres = await Promise.all(albums.map(async (album) => {
            try {
                // ${genreQuery ? AND LOWER(JSON_CONTAINS(a.genres, genreQuery.toLowerCase() )) || '' }
                // Get artists for this album
                const artists = await db.query(`
                    SELECT a.* FROM artists a
                    JOIN artist_albums aa ON a.id = aa.artist_id
                    WHERE aa.album_id = ? 
                `, [album.id]);
                
                // Collect all genres from all artists
                const allGenres = new Set();
                artists.forEach(artist => {
                    const parsedArtist = parseJsonFields(artist);
                    if (parsedArtist.genres && Array.isArray(parsedArtist.genres)) {
                        parsedArtist.genres.forEach(genre => allGenres.add(genre));
                    }
                });
                
                return {
                    ...parseJsonFields(album),
                    artist_genres: Array.from(allGenres),
                    artists: artists.map(a => parseJsonFields(a))
                };
            } catch (error) {
                console.warn(`Failed to get artists for album ${album.id}:`, error);
                return {
                    ...parseJsonFields(album),
                    artist_genres: [],
                    artists: []
                };
            }
        }));
        
        const [{ total }] = await db.query('SELECT COUNT(*) as total FROM albums');
        
        res.json({
            data: albumsWithArtistGenres,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/albums/:id', async (req, res) => {
    try {
        const [album] = await db.query('SELECT * FROM albums WHERE id = ?', [req.params.id]);
        if (!album) {
            return res.status(404).json({ error: 'Album not found' });
        }
        res.json(parseJsonFields(album));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/albums/search/:query', async (req, res) => {
    try {
        const query = `%${req.params.query}%`;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        
        const albums = await db.query(
            `SELECT * FROM albums WHERE name LIKE ? ORDER BY popularity DESC LIMIT ${limit} OFFSET ${offset}`,
            [query]
        );
        
        const [{ total }] = await db.query(
            'SELECT COUNT(*) as total FROM albums WHERE name LIKE ?',
            [query]
        );
        
        res.json({
            data: albums.map(parseJsonFields),
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/albums/:id/tracks', async (req, res) => {
    try {
        const tracks = await db.query(
            'SELECT * FROM tracks WHERE album_id = ? ORDER BY disc_number, track_number',
            [req.params.id]
        );
        
        // Enhance tracks with artist information
        const tracksWithArtists = await Promise.all(tracks.map(async (track) => {
            try {
                const artists = await db.query(`
                    SELECT a.* FROM artists a
                    JOIN artist_tracks at ON a.id = at.artist_id
                    WHERE at.track_id = ?
                `, [track.id]);
                
                const artistNames = artists.map(a => parseJsonFields(a).name);
                const artistIds = artists.map(a => parseJsonFields(a).id);
                
                return {
                    ...parseJsonFields(track),
                    artists: artistNames,
                    artist_ids: artistIds
                };
            } catch (error) {
                console.warn(`Failed to get artists for track ${track.id}:`, error);
                return {
                    ...parseJsonFields(track),
                    artists: [],
                    artist_ids: []
                };
            }
        }));
        
        res.json(tracksWithArtists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Tracks endpoints
app.get('/tracks', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        const sort = req.query.sort || 'name';
        const order = req.query.order === 'desc' ? 'DESC' : 'ASC';
        
        const validSorts = ['name', 'popularity', 'duration_ms', 'created_at'];
        const sortField = validSorts.includes(sort) ? sort : 'name';
        
        const tracks = await db.query(
            `SELECT * FROM tracks ORDER BY ${sortField} ${order} LIMIT ${limit} OFFSET ${offset}`
        );
        
        // Enhance tracks with artist genre information
        const tracksWithArtistGenres = await Promise.all(tracks.map(async (track) => {
            try {
                // Get artists for this track
                const artists = await db.query(`
                    SELECT a.* FROM artists a
                    JOIN artist_tracks at ON a.id = at.artist_id
                    WHERE at.track_id = ?
                `, [track.id]);
                
                // Collect all genres from all artists
                const allGenres = new Set();
                const artistNames = [];
                const artistIds = [];
                
                artists.forEach(artist => {
                    const parsedArtist = parseJsonFields(artist);
                    artistNames.push(parsedArtist.name);
                    artistIds.push(parsedArtist.id);
                    if (parsedArtist.genres && Array.isArray(parsedArtist.genres)) {
                        parsedArtist.genres.forEach(genre => allGenres.add(genre));
                    }
                });
                
                return {
                    ...parseJsonFields(track),
                    artist_genres: Array.from(allGenres),
                    artists: artistNames,
                    artist_ids: artistIds
                };
            } catch (error) {
                console.warn(`Failed to get artists for track ${track.id}:`, error);
                return {
                    ...parseJsonFields(track),
                    artist_genres: [],
                    artists: [],
                    artist_ids: []
                };
            }
        }));
        
        const [{ total }] = await db.query('SELECT COUNT(*) as total FROM tracks');
        
        res.json({
            data: tracksWithArtistGenres,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/tracks/:id', async (req, res) => {
    try {
        const [track] = await db.query('SELECT * FROM tracks WHERE id = ?', [req.params.id]);
        console.log(track)
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }
        // Get all contributing artists for this track
        const artists = await db.query(
            `SELECT a.* FROM artists a
             JOIN artist_tracks at ON a.id = at.artist_id
             WHERE at.track_id = ?`,
            [req.params.id]
        );
        console.log('in pased json:', parseJsonFields)
        const artistNames = artists.map(result => result.name);
        const artistIds = artists.map(result => result.id);
        const stringArtists = artistNames.join(", ");
        const fname = `${stringArtists} - ${track.name}`;

        const trackWithArtists = {
            ...parseJsonFields(track),
            artists: artistNames,
            artist_ids: artistIds,
            filename: fname
            
        };
        res.json(trackWithArtists);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// sort out the filename part so it will use the database own
app.get('/tracks/search/:query', async (req, res) => {
    try {
        const query = `%${req.params.query}%`;
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = (page - 1) * limit;
        
        const tracks = await db.query(
            `SELECT * FROM tracks WHERE name LIKE ? ORDER BY popularity DESC LIMIT ${limit} OFFSET ${offset}`,
            [query]
        );
        
        const [{ total }] = await db.query(
            'SELECT COUNT(*) as total FROM tracks WHERE name LIKE ?',
            [query]
        );
        
        // For each track, fetch contributing artists
        const tracksWithArtists = await Promise.all(tracks.map(async (track) => {
            const artists = await db.query( 
                `SELECT a.* FROM artists a
                 JOIN artist_tracks at ON a.id = at.artist_id
                 WHERE at.track_id = ?`,
                [track.id]
            );
            const artistNames = artists.map(parseJsonFields).map(result => result.name);
            const artistIds = artists.map(parseJsonFields).map(result => result.id);
            const stringArtists = artistNames.join(", ");
            const fname = `${stringArtists} - ${track.name}`;
            
   
            return {
                ...parseJsonFields(track),
                artists: artistNames,
                artist_ids: artistIds,
                filename: fname
            };
        }));
        
        res.json({
            data: tracksWithArtists,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// Endpoint to serve downloaded music by track ID and name
app.get('/download/:trackid', async (req, res) => {
    const trackId = req.params.trackid;
    
    try {
        // First, get the track details and artists
        const [track] = await db.query('SELECT * FROM tracks WHERE id = ?', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const artists = await db.query(
            `SELECT a.name FROM artists a
             JOIN artist_tracks at ON a.id = at.artist_id
             WHERE at.track_id = ?`,
            [trackId]
        );

        if (artists.length === 0) {
            return res.status(404).json({ error: 'No artists found for this track' });
        }

        // Try each artist's folder until we find the track
        for (const artist of artists) {
            const artistFolder = path.join(MUSIC_FOLDER, artist.name);
            // Look for the trackId folder recursively
            const trackFolderPath = await searchFile(artistFolder, trackId);
            
            if (trackFolderPath && fs.existsSync(trackFolderPath)) {
                // Get all files in the directory that contains the found file
                const parentDir = path.dirname(trackFolderPath);
                const files = await fs.promises.readdir(parentDir);
                const musicFile = files.find(file => file.endsWith('.mp3'));
                
                if (musicFile) {
                    // Get the proper filename from the track and artists
                    const artistNames = artists.map(a => a.name);
                    const stringArtists = artistNames.join(", ");
                    const filename = `${stringArtists} - ${track.name}.mp3`;
                    
                    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
                    return res.sendFile(path.join(parentDir, musicFile));
                }
            }
        }

        res.status(404).json({ error: 'Track file not found in any artist folder' });
    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).json({ error: 'Error serving file' });
    }
});


// Endpoint to stream music by track ID with seeking support
app.get('/play/:trackid', async (req, res) => {
    const trackId = req.params.trackid;

    try {
        // First, get the track details and artists
        const [track] = await db.query('SELECT * FROM tracks WHERE id = ?', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }

        const artists = await db.query(
            `SELECT a.name FROM artists a
             JOIN artist_tracks at ON a.id = at.artist_id
             WHERE at.track_id = ?`,
            [trackId]
        );

        if (artists.length === 0) {
            return res.status(404).json({ error: 'No artists found for this track' });
        }

        // Try each artist's folder until we find the track
        let filePath = null;
        for (const artist of artists) {
            console.log('Checking Artist: ', artist)
            const artistFolder = path.join(MUSIC_FOLDER, artist.name);
            console.log('Artist Folder: ', artistFolder)
            // Look for the trackId folder recursively
            const trackFolderPath = await searchFile(artistFolder, trackId);
            console.log('Track Id Folder: ', trackFolderPath)
            
            if (trackFolderPath && fs.existsSync(trackFolderPath)) {
                // Get all files in the directory that contains the found file
                const parentDir = path.dirname(trackFolderPath);
                const files = await fs.promises.readdir(parentDir);
                const musicFile = files.find(file => file.endsWith('.mp3'));
                
                if (musicFile) {
                    console.log('Found Music File: ', musicFile)
                    filePath = path.join(parentDir, musicFile);
                    console.log('Music Filepath: ', filePath)
                    break;
                }
            }
        }

        if (!filePath) {
            console.log('File path does not exist', filePath)
            return res.status(404).json({ error: 'Track file not found in any artist folder' });
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
            // Parse Range header
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            // Get the proper filename from the track and artists
            const artistNames = artists.map(a => a.name);
            const stringArtists = artistNames.join(", ");
            const filename = `${stringArtists} - ${track.name}.mp3`;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': `attachment; filename="${filename}"`
            });
            file.pipe(res);
        } else {
            // Get the proper filename from the track and artists
            const artistNames = artists.map(a => a.name);
            const stringArtists = artistNames.join(", ");
            const filename = `${stringArtists} - ${track.name}.mp3`;

            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': 'audio/mpeg',
                'Content-Disposition': `attachment; filename="${filename}"`
            });
            fs.createReadStream(filePath).pipe(res);
        }
    } catch (error) {
        console.error('Error streaming file:', error);
        res.status(500).json({ error: 'Error streaming file' });
    }
});

// Stats endpoint
app.get('/stats', async (req, res) => {
    try {
        const [artistCount] = await db.query('SELECT COUNT(*) as count FROM artists');
        const [albumCount] = await db.query('SELECT COUNT(*) as count FROM albums');
        const [trackCount] = await db.query('SELECT COUNT(*) as count FROM tracks');
        
        const [topArtists] = await db.query(
            'SELECT name, popularity FROM artists ORDER BY popularity DESC LIMIT 5'
        );
        
        const [recentAlbums] = await db.query(
            'SELECT name, release_date FROM albums ORDER BY release_date DESC LIMIT 5'
        );
        
        res.json({
            totals: {
                artists: artistCount.count,
                albums: albumCount.count,
                tracks: trackCount.count
            },
            topArtists: topArtists,
            recentAlbums: recentAlbums
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Genres endpoint - Get all unique genres from artists
app.get('/genres', async (req, res) => {
    try {
        const artists = await db.query('SELECT genres FROM artists WHERE genres IS NOT NULL AND genres != ""');
        
        const allGenres = new Set();
        
        artists.forEach(artist => {
            try {
                const genres = typeof artist.genres === 'string' ? JSON.parse(artist.genres) : artist.genres;
                if (Array.isArray(genres)) {
                    genres.forEach(genre => {
                        if (genre && typeof genre === 'string') {
                            allGenres.add(genre.trim());
                        }
                    });
                }
            } catch (e) {
                // Skip invalid JSON
            }
        });
        
        const sortedGenres = Array.from(allGenres).sort();
        
        res.json({
            data: sortedGenres,
            total: sortedGenres.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get genres with counts - shows how many artists have each genre
app.get('/genres/counts', async (req, res) => {
    try {
        const artists = await db.query('SELECT genres FROM artists WHERE genres IS NOT NULL AND genres != ""');
        
        const genreCounts = {};
        
        artists.forEach(artist => {
            try {
                const genres = typeof artist.genres === 'string' ? JSON.parse(artist.genres) : artist.genres;
                if (Array.isArray(genres)) {
                    genres.forEach(genre => {
                        if (genre && typeof genre === 'string') {
                            const cleanGenre = genre.trim();
                            genreCounts[cleanGenre] = (genreCounts[cleanGenre] || 0) + 1;
                        }
                    });
                }
            } catch (e) {
                // Skip invalid JSON
            }
        });
        
        // Sort by count (descending) then by name
        const sortedGenres = Object.entries(genreCounts)
            .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
            .map(([genre, count]) => ({ genre, count }));
        
        res.json({
            data: sortedGenres,
            total: sortedGenres.length
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start server
app.listen(PORT, async () => {
    console.log(`Music API server running on http://localhost:${PORT}`);
    console.log(`Visit http://localhost:${PORT} for API documentation`);
    
    // Initialize database connection and show which type is being used
    try {
        await db.connect();
        const dbType = db.getDbType();
        console.log(`\n${'='.repeat(50)}`);
        console.log(`DATABASE: Using ${dbType.toUpperCase()}`);
        console.log(`${'='.repeat(50)}\n`);
    } catch (error) {
        console.error('Failed to initialize database:', error.message);
    }
});