// api/chat.js

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'Anthropic API error',
        detail: text,
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(500).json({
        error: 'Anthropic returned non-JSON response',
        detail: text,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      error: err.message || 'Server error',
    });
  }
}

module.exports = handler;
module.exports.config = {
  maxDuration: 60,
};
