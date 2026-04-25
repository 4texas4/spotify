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

// Handle Range requests for seeking support
async function handleRangeRequest(response, rangeHeader) {
  const arrayBuffer = await response.arrayBuffer();
  const totalLength = arrayBuffer.byteLength;
  
  // Parse range header (e.g., "bytes=0-1023")
  const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
  if (!rangeMatch) {
    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": totalLength.toString(),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
  
  const start = parseInt(rangeMatch[1]);
  const end = rangeMatch[2] ? parseInt(rangeMatch[2]) : totalLength - 1;
  const chunkSize = (end - start) + 1;
  
  const chunk = arrayBuffer.slice(start, end + 1);
  
  return new Response(chunk, {
    status: 206,
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": chunkSize.toString(),
      "Content-Range": `bytes ${start}-${end}/${totalLength}`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges"
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Type",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // --- /pref/TRACKID GET - get source preference ---
    if (path.startsWith("/pref/") && request.method === "GET") {
      const trackId = path.slice(6);
      if (!trackId) return new Response("Missing track ID", { status: 400 });
      const cached = await caches.default.match(new Request(`https://prefs.zenith/${trackId}`));
      if (cached) {
        const data = await cached.json();
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
      return new Response(JSON.stringify({ source: null }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // --- /pref/TRACKID POST - save/overwrite source preference ---
    if (path.startsWith("/pref/") && request.method === "POST") {
      const trackId = path.slice(6);
      if (!trackId) return new Response("Missing track ID", { status: 400 });
      try {
        const body = await request.json();
        const source = body.source;
        if (!source) return new Response("Missing source", { status: 400 });
        const prefKey = new Request(`https://prefs.zenith/${trackId}`);
        // Delete old pref first so we always get fresh value
        await caches.default.delete(prefKey);
        const prefResponse = new Response(JSON.stringify({ source, updatedAt: Date.now() }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=31536000",
            "Access-Control-Allow-Origin": "*"
          }
        });
        ctx.waitUntil(caches.default.put(prefKey, prefResponse));
        return new Response(JSON.stringify({ ok: true, trackId, source }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      } catch (err) { return new Response(err.message, { status: 500 }); }
    }

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

    // --- /d/ID - DOWNLOAD ENDPOINT WITH CACHING & RANGE SUPPORT ---
    if (path.startsWith("/d/")) {
      const trackId = path.slice(3);
      if (!trackId) return new Response("Missing track ID", { status: 400 });

      const spotifyUrl = `https://open.spotify.com/track/${trackId}`;
      const cacheKey = new Request(`https://cache-spotify/${trackId}`, { method: "GET" });
      const cache = caches.default;

      try {
        // Check cache first
        let cachedResponse = await cache.match(cacheKey);
        
        if (!cachedResponse) {
          // Not in cache, fetch from Spoticatch
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

          if (!spoticatchRes.ok) {
            return new Response("Download Failed", { status: spoticatchRes.status });
          }

          // Create cacheable response
          cachedResponse = new Response(spoticatchRes.body, {
            headers: {
              "Content-Type": "audio/mpeg",
              "Cache-Control": "public, max-age=600",
              "Access-Control-Allow-Origin": "*"
            }
          });

          // Store in cache (non-blocking)
          ctx.waitUntil(cache.put(cacheKey, cachedResponse.clone()));
        }

        // Handle range requests
        const rangeHeader = request.headers.get("Range");
        if (rangeHeader) {
          return await handleRangeRequest(cachedResponse.clone(), rangeHeader);
        }

        // Return full file
        const arrayBuffer = await cachedResponse.arrayBuffer();
        return new Response(arrayBuffer, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Length": arrayBuffer.byteLength.toString(),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Length, Accept-Ranges"
          }
        });

      } catch (err) { return new Response(err.message, { status: 500 }); }
    }

    // --- /i/PLAYLIST_ID - GET PLAYLIST COVER IMAGE ---
if (path.startsWith("/i/")) {
  const playlistId = path.slice(3);
  if (!playlistId) {
    return new Response("Missing playlist ID", { status: 400 });
  }

  try {
    const token = await getSpotifyToken();

    const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) {
      return new Response(`Spotify error: ${res.status}`, { status: res.status });
    }

    const data = await res.json();
    const imageUrl = data.images?.[0]?.url;

    if (!imageUrl) {
      return new Response("No image found", { status: 404 });
    }

    return new Response(JSON.stringify({ cover: imageUrl }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });

  } catch (err) {
    return new Response(err.message, { status: 500 });
  }
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

    return new Response("Available: /s/QUERY, /d/ID, /p/PLAYLIST_ID, /pref/TRACKID", { status: 404 });
  }
};
