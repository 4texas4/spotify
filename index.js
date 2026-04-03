const SPOTIFY_CLIENT_ID = 'd3699c4089874585ab34fc2a4090f766';
const SPOTIFY_CLIENT_SECRET = '2b1bc7c989b54558912d71c439df41d3';

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
        // Fetch Metadata via Spotify API
        const token = await getSpotifyToken();
        const metaRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
          headers: { "Authorization": `Bearer ${token}` }
        });
        let fileName = "track.mp3";
        if (metaRes.ok) {
          const t = await metaRes.json();
          const title = t.name || "track";
          const artist = t.artists?.map(a => a.name).join(", ") || "";
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
        const res = await fetch(`https://playlist.texas-projects.xyz/${playlistId}`);
        if (!res.ok) return new Response(`Playlist fetch error: ${res.status}`, { status: res.status });

        const data = await res.json();

        return new Response(JSON.stringify(data, null, 2), {
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
