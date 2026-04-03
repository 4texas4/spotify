/**
 * Spoticatch Pure API Worker
 */
const SPOTIFY_CLIENT_ID = 'ac6dca97304146688f3eb14da1cb3b0d';
const SPOTIFY_CLIENT_SECRET = '716f2b0268e9468ea4d1b80cd05df605';

async function getSpotifyToken() {
  const authResponse = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`
    },
    body: "grant_type=client_credentials"
  });
  const data = await authResponse.json();
  return data.access_token;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // --- /s/QUERY - SEARCH ENDPOINT ---
    if (path.startsWith("/s/")) {
      const query = decodeURIComponent(path.slice(3));
      if (!query) return new Response("Missing query", { status: 400 });

      try {
        const token = await getSpotifyToken();
        const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        const data = await res.json();

        const tracks = (data.tracks?.items || []).map(t => ({
          id: t.id,
          title: t.name,
          artist: t.artists.map(a => a.name).join(", "),
          album: t.album.name,
          cover: t.album.images[0]?.url,
          spotify_url: t.external_urls.spotify
        }));

        return new Response(JSON.stringify(tracks, null, 2), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) { return new Response(err.message, { status: 500 }); }
    }

    // --- /d/ID - DOWNLOAD ENDPOINT ---
    if (path.startsWith("/d/")) {
      const trackId = path.slice(3);
      if (!trackId) return new Response("Missing track ID", { status: 400 });

      const spotifyUrl = `https://open.spotify.com/track/${trackId}`;

      try {
        // Fetch Metadata for filename
        const spotifyRes = await fetch(spotifyUrl);
        const html = await spotifyRes.text();
        const titleMatch = html.match(/<meta property="og:title" content="([^"]+)">/);
        const artistMatch = html.match(/<meta property="og:description" content="([^"]+)">/);
        let fileName = "track.mp3";
        if (titleMatch) {
          let title = titleMatch[1];
          let artist = artistMatch ? artistMatch[1].split(' · ')[1] : '';
          fileName = `${artist ? artist + ' - ' : ''}${title}.mp3`.replace(/[\\/:*?"<>|]/g, '_');
        }

        // Call Spoticatch Proxy
        const spoticatchRes = await fetch("https://spoticatch.net/api/proxy/download", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Origin": "https://spoticatch.net",
            "Referer": "https://spoticatch.net/en",
            "User-Agent": "Mozilla/5.0"
          },
          body: JSON.stringify({ url: spotifyUrl, quality: "320" })
        });

        if (!spoticatchRes.ok) return new Response("Download Failed", { status: spoticatchRes.status });

        const mp3 = await spoticatchRes.blob();
        return new Response(mp3, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Disposition": `attachment; filename="${fileName}"`,
            "Access-Control-Allow-Origin": "*"
          }
        });

      } catch (err) { return new Response(err.message, { status: 500 }); }
    }

    // --- /p/ID - PLAYLIST ENDPOINT ---
    if (path.startsWith("/p/")) {
      const playlistId = path.slice(3).split("/")[0];
      if (!playlistId) return new Response("Missing playlist ID", { status: 400 });

      try {
        const token = await getSpotifyToken();
        let allTracks = [];
        let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`;

        while (nextUrl) {
          const res = await fetch(nextUrl, {
            headers: { "Authorization": `Bearer ${token}` }
          });
          if (!res.ok) {
            const errorData = await res.text();
            return new Response(`Spotify API error: ${errorData}`, { status: res.status });
          }
          const data = await res.json();
          
          const batch = (data.items || []).map(item => {
            const t = item.track;
            if (!t) return null;
            return {
              id: t.id,
              title: t.name,
              artist: t.artists?.map(a => a.name).join(", ") || "Unknown Artist",
              album: t.album?.name || "Unknown Album",
              cover: t.album?.images?.[0]?.url || "",
              spotify_url: t.external_urls?.spotify || ""
            };
          }).filter(t => t !== null);

          allTracks = allTracks.concat(batch);
          nextUrl = data.next;
        }

        return new Response(JSON.stringify(allTracks, null, 2), {
          headers: { 
            "Content-Type": "application/json", 
            "Access-Control-Allow-Origin": "*" 
          }
        });
      } catch (err) { return new Response(err.message, { status: 500 }); }
    }

    return new Response("Available: /s/QUERY, /d/ID, or /p/PLAYLIST_ID", { status: 404 });
  }
};
