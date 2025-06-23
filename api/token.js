// api/token.js
export default async function handler(req, res) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to get token' });
    }

    const data = await response.json();
    res.status(200).json({ access_token: data.access_token, expires_in: data.expires_in });
  } catch (error) {
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
