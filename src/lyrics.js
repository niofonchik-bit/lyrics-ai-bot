const LRCLIB_API = 'https://lrclib.net/api';

function removeTimestamps(lyrics) {
    return lyrics
        .replace(/^\[[^\]]+\]\s*/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeSong(song) {
    const lyrics =
        song.plainLyrics?.trim() ||
        (song.syncedLyrics ? removeTimestamps(song.syncedLyrics) : '');

    return {
        id: song.id,
        trackName: song.trackName,
        artistName: song.artistName,
        albumName: song.albumName,
        duration: song.duration,
        instrumental: song.instrumental,
        lyrics,
    };
}

export async function searchLyrics({
    query = '',
    trackName = '',
    artistName = '',
}) {
    const params = new URLSearchParams();

    if (trackName) {
        params.set('track_name', trackName);

        if (artistName) {
            params.set('artist_name', artistName);
        }
    } else {
        const fallbackQuery = query || [trackName, artistName].filter(Boolean).join(' ');
        params.set('q', fallbackQuery);
    }

    const response = await fetch(`${LRCLIB_API}/search?${params.toString()}`, {
        headers: {
            Accept: 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`LRCLIB: ${response.status} ${response.statusText}`);
    }

    const songs = await response.json();

    return songs
        .map(normalizeSong)
        .filter(song => song.instrumental || song.lyrics)
        .slice(0, 5);
}
