const { exec } = require('child_process');

const {updateTrackStatus} = require('./utilities')

// const url = 'https://music.youtube.com/watch?v=IvJpo697LPY';

// Function to list available formats
const listFormats = (url) => {
    return new Promise((resolve, reject) => {
        const command = `yt-dlp --list-formats "${url}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(`Error executing command: ${error.message}`);
                return;
            }
            if (stderr) {
                reject(`stderr: ${stderr}`);
                return;
            }
            resolve(stdout);
        });
    });
};

// Function to download audio using a specific format
const downloadAudio = (url, format, output) => {
    return new Promise((resolve, reject) => {
        const command = `yt-dlp.exe -f "${format}" --extract-audio --audio-format mp3 --audio-quality 0 --add-metadata --embed-thumbnail -o "${output}" "${url}"`;
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(`Error downloading audio with format ${format}: ${error.message}`);
                return;
            }
            if (stderr) {
                reject(`stderr: ${stderr}`);
                return;
            }
            resolve(stdout);
        });
    });
};

// Main function
async function YtdlDownload (url, output, connection, trackID, message) {
    try {
        console.log(`Trying Format switching strategy for download....`)
        const formatList = await listFormats(url);
        console.log(`Available formats:\n${formatList}`);

        // Extract format IDs
        const availableFormats = formatList.match(/^\s*(\d+)\s+/gm);
        const formatsToTry = availableFormats ? availableFormats.map(format => format.trim()) : [];

        for (const format of formatsToTry) {
            console.log(`Trying format: ${format}`);
            try {
                const downloadOutput = await downloadAudio(url, format, output);
                console.log(`Download completed successfully with Format switching strategy ${format}:\n${downloadOutput}`);
                console.log('Updating Track Status To Available...');
                updateTrackStatus(connection, trackID, 'available');
                break; // Exit loop on success
            } catch (error) {
                console.error(error);
            }
        }
    } catch (error) {
        console.error(error);
    }
};

// Run the main function
module.exports = {YtdlDownload};