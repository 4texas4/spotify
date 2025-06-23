export default async function handler(req, res) {
  const clientId = '3802011aaa7c42229602a521e35c33de';
  const clientSecret = '6caba9949e724308b7bcffd0a91de9b3';

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
