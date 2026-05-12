const SERPER_URL = 'https://google.serper.dev/search';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RESULT_COUNT = 10;

function stripTags(text) {
  return String(text || '').replace(/<[^>]*>/g, '').trim();
}

function parseHostname(link) {
  try {
    return new URL(String(link || '').trim()).hostname;
  } catch (e) {
    return '';
  }
}

function normalizeSerperResults(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const link = String(item?.link || '').trim();
      return {
        title: stripTags(item?.title),
        snippet: stripTags(item?.snippet),
        link,
        displayLink: String(item?.displayLink || '').trim() || parseHostname(link)
      };
    })
    .filter((item) => item.title || item.snippet || item.link)
    .slice(0, DEFAULT_RESULT_COUNT);
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {};

  if (!req || typeof req[Symbol.asyncIterator] !== 'function') return {};

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

async function fetchSerper(query) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(SERPER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.SERPER_API_KEY
      },
      body: JSON.stringify({
        q: query,
        num: DEFAULT_RESULT_COUNT,
        gl: 'kr',
        hl: 'ko'
      }),
      signal: controller.signal
    });

    const text = await response.text();
    if (!response.ok) {
      const error = new Error('Serper API error');
      error.status = response.status;
      error.detail = text;
      throw error;
    }

    const data = text ? JSON.parse(text) : {};
    return normalizeSerperResults(data.organic || []);
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Serper API timeout');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.SERPER_API_KEY) {
    return res.status(503).json({ error: 'SERPER_API_KEY is not configured' });
  }

  try {
    const body = await readBody(req);
    const query = String(body?.q || body?.query || '').replace(/\s+/g, ' ').trim();

    if (!query) {
      return res.status(400).json({ error: '검색어를 입력해주세요.' });
    }

    const results = await fetchSerper(query);
    return res.status(200).json({ results });
  } catch (error) {
    const status = Number(error.status || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: error.status === 504 ? '검색 요청 시간이 초과되었습니다.' : '웹 검색 중 오류가 발생했습니다.'
    });
  }
};
