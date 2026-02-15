@echo off
echo ========================================
echo Local Images Setup Script
echo ========================================
echo.

echo Step 1: Running database migration...
node run-migration-safe.js
if %errorlevel% neq 0 (
    echo Migration failed!
    pause
    exit /b %errorlevel%
)
echo.

echo Step 2: Downloading images from Spotify...
echo This may take a while depending on your database size...
node download-images.js
if %errorlevel% neq 0 (
    echo Image download failed!
    pause
    exit /b %errorlevel%
)
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Your images are now stored locally in:
echo %cd%\public\images
echo.
echo The API will now serve local images instead of Spotify URLs.
echo.
pause
