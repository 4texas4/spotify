const clientId = '3802011aaa7c42229602a521e35c33de';
const clientSecret = '6caba9949e724308b7bcffd0a91de9b3';

let cachedToken = null;
let tokenExpireTime = 0;

export default async function handler(req, res) {
  const now = Date.now();

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (cachedToken && now < tokenExpireTime) {
    return res.status(200).json({ access_token: cachedToken });
  }

  const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    cachedToken = data.access_token;
    tokenExpireTime = now + (data.expires_in * 1000) - 60000;

    res.status(200).json({ access_token: cachedToken });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get token' });
  }
}
