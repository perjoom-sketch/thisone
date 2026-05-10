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

  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

function normalizeQuery(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSummary(events) {
  const byType = {};
  const topQueryCounts = new Map();
  const errorQueries = [];
  const zeroResultQueries = [];
  const seenZeroResultQueries = new Set();

  for (const event of events) {
    const type = String(event.type || '');
    byType[type] = (byType[type] || 0) + 1;

    if (type === 'search_start' || type === 'search_full_done') {
      const normalizedQuery = normalizeQuery(event.q);
      if (normalizedQuery) {
        topQueryCounts.set(normalizedQuery, (topQueryCounts.get(normalizedQuery) || 0) + 1);
      }
    }

    if (type === 'search_error' && errorQueries.length < 20) {
      errorQueries.push({
        q: event.q || '',
        errorMessage: event.errorMessage || '',
        createdAt: event.createdAt || ''
      });
    }

    if (type === 'search_full_done' && Number(event.resultCount) === 0) {
      const normalizedQuery = normalizeQuery(event.q);
      if (normalizedQuery && !seenZeroResultQueries.has(normalizedQuery)) {
        seenZeroResultQueries.add(normalizedQuery);
        zeroResultQueries.push({
          q: event.q || '',
          createdAt: event.createdAt || ''
        });
      }
    }
  }

  const topQueries = Array.from(topQueryCounts, ([q, count]) => ({ q, count }))
    .sort((a, b) => b.count - a.count || a.q.localeCompare(b.q))
    .slice(0, 10);

  return {
    byType,
    topQueries,
    errorQueries,
    zeroResultQueries: zeroResultQueries.slice(0, 20)
  };
}

async function handleGet(req, res) {
  const managerKey = process.env.THISONE_MANAGER_KEY;
  if (!managerKey) {
    return res.status(503).json({ error: 'Manager key not configured' });
  }

  if (req.query?.key !== managerKey) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const rawEvents = await kv.lrange(SEARCH_EVENTS_KEY, 0, 99);
    const events = [];

    for (const rawEvent of rawEvents || []) {
      try {
        const event = typeof rawEvent === 'string' ? JSON.parse(rawEvent) : rawEvent;
        if (event && typeof event === 'object') events.push(event);
      } catch (e) {
        // Ignore malformed historical entries and continue returning valid events.
      }
    }

    return res.status(200).json({
      ok: true,
      total: events.length,
      summary: buildSummary(events),
      events
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load search events' });
  }
}

async function handlePost(req, res) {
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
