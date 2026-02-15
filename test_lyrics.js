const { getLyricsByTrackId, getLyricsByTrackAndArtist, searchLyrics, getLyricsStats } = require('./lyrics_api');

// Test function
async function testLyricsAPI() {
    console.log('🧪 Testing Lyrics API...\n');
    
    try {
        // Test 1: Get lyrics stats
        console.log('📊 Test 1: Getting lyrics statistics...');
        const stats = await getLyricsStats();
        console.log('✅ Stats:', stats);
        
        // Test 2: Search lyrics
        console.log('\n🔍 Test 2: Searching lyrics...');
        const searchResults = await searchLyrics('love', 5);
        console.log('✅ Search results:', searchResults.length, 'found');
        
        if (searchResults.length > 0) {
            console.log('📝 First result:', {
                track: searchResults[0].track_name,
                artist: searchResults[0].artist_name,
                preview: searchResults[0].preview?.substring(0, 100) + '...'
            });
            
            // Test 3: Get lyrics by track ID
            console.log('\n🎵 Test 3: Getting lyrics by track ID...');
            const lyricsById = await getLyricsByTrackId(searchResults[0].track_id);
            if (lyricsById) {
                console.log('✅ Found lyrics by ID:', {
                    track: lyricsById.trackName,
                    artist: lyricsById.artistName,
                    synced: lyricsById.synced,
                    lines: lyricsById.lyrics.split('\n').length
                });
            } else {
                console.log('❌ No lyrics found by ID');
            }
            
            // Test 4: Get lyrics by track name and artist
            console.log('\n🎤 Test 4: Getting lyrics by track name and artist...');
            const lyricsByName = await getLyricsByTrackAndArtist(
                searchResults[0].track_name, 
                searchResults[0].artist_name
            );
            if (lyricsByName) {
                console.log('✅ Found lyrics by name:', {
                    track: lyricsByName.trackName,
                    artist: lyricsByName.artistName,
                    synced: lyricsByName.synced,
                    lines: lyricsByName.lyrics.split('\n').length
                });
            } else {
                console.log('❌ No lyrics found by name');
            }
        }
        
        console.log('\n🎉 All tests completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run tests
if (require.main === module) {
    testLyricsAPI();
}

module.exports = { testLyricsAPI };
