export default async function handler(req, res) {
  const client_id = '3802011aaa7c42229602a521e35c33de';
  const client_secret = '6caba9949e724308b7bcffd0a91de9b3';
  const creds = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await tokenRes.json();
  res.json(data);
}
