# Music API

A simple REST API for accessing your music database with no authentication required.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Visit http://localhost:3000 for interactive documentation

## API Endpoints

### Artists

#### Get All Artists
```
GET /artists
```
**Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50, max: 100)
- `sort` (optional): Sort field - name, popularity, followers_total, created_at (default: name)
- `order` (optional): asc or desc (default: asc)

**Example:**
```
GET /artists?page=1&limit=20&sort=popularity&order=desc
```

#### Get Artist by ID
```
GET /artists/:id
```

#### Search Artists
```
GET /artists/search/:query
```
**Example:**
```
GET /artists/search/taylor
```

#### Get Artist's Albums
```
GET /artists/:id/albums
```

#### Get Artist's Tracks
```
GET /artists/:id/tracks
```

### Albums

#### Get All Albums
```
GET /albums
```
**Parameters:** Same as artists, plus:
- `sort` options: name, popularity, release_date, total_tracks

#### Get Album by ID
```
GET /albums/:id
```

#### Search Albums
```
GET /albums/search/:query
```

#### Get Album Tracks
```
GET /albums/:id/tracks
```

### Tracks

#### Get All Tracks
```
GET /tracks
```
**Parameters:** Same as artists, plus:
- `sort` options: name, popularity, duration_ms, created_at

#### Get Track by ID
```
GET /tracks/:id
```

#### Search Tracks
```
GET /tracks/search/:query
```
#### Play Track
```
GET /play/:trackid
```

#### Download Track
```
GET /download/:trackid
```


### Statistics

#### Get Database Stats
```
GET /stats
```
Returns total counts, top artists, and recent albums.

## Response Format

All endpoints return JSON with consistent structure:

### Single Item Response
```json
{
  "id": "artist_id",
  "name": "Artist Name",
  "popularity": 85,
  "genres": ["pop", "rock"],
  "images": [{"url": "...", "width": 640, "height": 640}],
  ...
}
```

### List Response
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1250,
    "pages": 25
  }
}
```

### Error Response
```json
{
  "error": "Error message"
}
```

## Data Fields

### Artist
- `id`: Spotify artist ID
- `name`: Artist name
- `popularity`: Popularity score (0-100)
- `followers_total`: Total followers
- `genres`: Array of genre strings
- `external_urls`: Object with Spotify URL
- `images`: Array of image objects
- `created_at`, `updated_at`: Timestamps

### Album
- `id`: Spotify album ID
- `name`: Album name
- `album_type`: album, single, or compilation
- `total_tracks`: Number of tracks
- `release_date`: Release date
- `popularity`: Popularity score (0-100)
- `external_urls`: Object with Spotify URL
- `images`: Array of image objects

### Track
- `id`: Spotify track ID
- `name`: Track name
- `album_id`: Associated album ID
- `track_number`: Track position in album
- `disc_number`: Disc number
- `duration_ms`: Duration in milliseconds
- `explicit`: Boolean for explicit content
- `popularity`: Popularity score (0-100)
- `preview_url`: 30-second preview URL
- `external_urls`: Object with Spotify URL

## Examples

### Get Popular Artists
```bash
curl "http://localhost:3000/artists?sort=popularity&order=desc&limit=10"
```

### Search for Songs
```bash
curl "http://localhost:3000/tracks/search/love"
```

### Get Artist's Complete Discography
```bash
# Get artist info
curl "http://localhost:3000/artists/4dpARuHxo51G3z768sgnrY"

# Get their albums
curl "http://localhost:3000/artists/4dpARuHxo51G3z768sgnrY/albums"

# Get their tracks
curl "http://localhost:3000/artists/4dpARuHxo51G3z768sgnrY/tracks"
```

### Database Statistics
```bash
curl "http://localhost:3000/stats"
```

## CORS

CORS is enabled for all origins, making this API accessible from any web application.

## No Authentication

This API requires no API keys or authentication - perfect for development and testing!