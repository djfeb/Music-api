# Database Fallback Feature

The Music API now supports automatic fallback from MySQL to SQLite.

## How It Works

1. **Primary Connection**: The API first attempts to connect to MySQL using credentials from `.env`
2. **Fallback**: If MySQL connection fails (timeout, wrong credentials, server down), it automatically falls back to SQLite
3. **Transparent**: All queries work the same way regardless of which database is being used

## Configuration

Add to your `.env` file:

```env
# MySQL Configuration (Primary)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=music_database

# SQLite Configuration (Fallback)
SQLITE_DB_PATH=./music_database.sqlite
```

## Database Files

- `database.js` - New fallback-enabled database module
- `database-original.js` - Backup of original MySQL-only module
- `music_database.sqlite` - SQLite database file (85.5 MB)

## Testing the Fallback

### Test 1: MySQL Connection (Normal Operation)
```bash
# Make sure MySQL is running
npm start
```
Expected output:
```
✓ Database connected successfully (MySQL)
==================================================
DATABASE: Using MYSQL
==================================================
```

### Test 2: SQLite Fallback
```bash
# Stop MySQL service or change DB_HOST to invalid value
# Then start the API
npm start
```
Expected output:
```
MySQL connection failed: ...
Falling back to SQLite...
✓ Database connected successfully (SQLite fallback)
==================================================
DATABASE: Using SQLITE
==================================================
```

## Benefits

1. **High Availability**: API continues working even if MySQL is down
2. **Portability**: Can run without MySQL installation (using SQLite)
3. **Development**: Easier local development without MySQL setup
4. **Deployment**: More flexible deployment options

## Performance Notes

- **MySQL**: Better for concurrent writes, production use
- **SQLite**: Faster for reads, perfect for single-user or read-heavy scenarios
- **Database Size**: SQLite (85.5 MB) vs MySQL (135 MB) - 37% smaller

## Limitations

When using SQLite fallback:
- No concurrent write operations from multiple processes
- Some MySQL-specific features may not work
- Recommended for read-only or single-instan