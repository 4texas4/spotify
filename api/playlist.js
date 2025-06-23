import fetch from 'node-fetch';

const CLIENT_ID = '3802011aaa7c42229602a521e35c33de';
const CLIENT_SECRET = '6caba9949e724308b7bcffd0a91de9b3';

async function getAccessToken() {
  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('Failed to get access token: ' + text);
  }

  const data = await resp.json();
  if (!data.access_token) {
    throw new Error('No access token returned');
  }
  return data.access_token;
}

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    if (!id) {
      res.status(400).json({ error: 'Missing playlist id' });
      return;
    }
    console.log('Fetching playlist id:', id);

    const token = await getAccessToken();
    console.log('Got access token');

    let url = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=50`;
    let allTracks = [];

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Spotify API error:', errorText);
        res.status(response.status).json({ error: errorText });
        return;
      }
      const data = await response.json();

      if (!data.items) {
        res.status(500).json({ error: 'No items in response' });
        return;
      }

      const tracks = data.items.map(item => {
        const t = item.track;
        if (!t) return null;
        return {
          title: t.name,
          artists: t.artists ? t.artists.map(a => a.name).join(', ') : 'Unknown Artist',
        };
      }).filter(Boolean);
      allTracks = allTracks.concat(tracks);
      url = data.next;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ tracks: allTracks });
  } catch (e) {
    console.error('Unexpected error:', e);
    res.status(500).json({ error: e.message });
  }
}
