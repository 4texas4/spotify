// api/token.js

export default async function handler(req, res) {
  const client_id = '3802011aaa7c42229602a521e35c33de';  // your Client ID
  const client_secret = '6caba9949e724308b7bcffd0a91de9b3';  // your Client Secret

  const auth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  try {
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      res.status(500).json({ error: 'Failed to get token', details: err });
      return;
    }

    const data = await tokenRes.json();
    // Return only access_token and expires_in to client
    res.status(200).json({
      access_token: data.access_token,
      expires_in: data.expires_in,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
