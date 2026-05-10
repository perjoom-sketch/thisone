import { kv } from '@vercel/kv';

const SEARCH_EVENTS_KEY = 'thisone_search_events';
const ALLOWED_TYPES = new Set([
  'search_start',
  'search_raw_done',
  'search_full_done',
  'search_error'
]);

function mapUpstashEnv() {
  // Upstash 연동 시 변수명이 다를 수 있어 inquiry.js와 동일하게 자동 매핑 시도
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

function limitString(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

function nonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (e) {
      return {};
    }
  }
  return body;
}

export default async function handler(req, res) {
  mapUpstashEnv();

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    const type = String(body.type || '');

    if (!ALLOWED_TYPES.has(type)) {
      return res.status(400).json({ status: 'error', message: 'Invalid event type' });
    }

    const event = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      q: limitString(body.q, 120),
      mode: limitString(body.mode, 40),
      rawCount: nonNegativeNumber(body.rawCount),
      fullCount: nonNegativeNumber(body.fullCount),
      resultCount: nonNegativeNumber(body.resultCount),
      hasError: normalizeBoolean(body.hasError),
      errorMessage: limitString(body.errorMessage, 160),
      elapsedMs: nonNegativeNumber(body.elapsedMs),
      createdAt: new Date().toISOString()
    };

    await kv.lpush(SEARCH_EVENTS_KEY, JSON.stringify(event));
    await kv.ltrim(SEARCH_EVENTS_KEY, 0, 999);

    return res.status(200).json({ status: 'success' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: 'Failed to track event' });
  }
}
