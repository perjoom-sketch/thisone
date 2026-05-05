import { kv } from '@vercel/kv';

function setupKvEnv() {
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

function normalizeQuery(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function safeNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  setupKvEnv();

  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const query = String(body.query || '').trim();
    const improvedQuery = String(body.improvedQuery || '').trim();
    const normalizedQuery = normalizeQuery(improvedQuery || query);

    if (!normalizedQuery) {
      return res.status(400).json({ error: '검색어가 없습니다.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    const total = safeNumber(body.total);
    const returnedItems = safeNumber(body.returnedItems);
    const rejectedCount = safeNumber(body.rejectedCount);
    const suspectFlags = Array.isArray(body.suspectFlags) ? body.suspectFlags : [];
    const source = String(body.source || 'search');

    const queryKey = `thisone:query:${normalizedQuery}`;
    const dayKey = `thisone:query-log:${today}`;

    await kv.hincrby(queryKey, 'count', 1);
    await kv.hset(queryKey, {
      query,
      improvedQuery,
      normalizedQuery,
      lastSearchedAt: now,
      lastSource: source,
      lastTotal: total,
      lastReturnedItems: returnedItems,
      lastRejectedCount: rejectedCount
    });

    await kv.zincrby('thisone:queries:popular', 1, normalizedQuery);
    await kv.lpush(dayKey, {
      query,
      improvedQuery,
      normalizedQuery,
      total,
      returnedItems,
      rejectedCount,
      suspectFlags,
      source,
      createdAt: now
    });
    await kv.ltrim(dayKey, 0, 999);

    if (total === 0 || returnedItems === 0) {
      await kv.zincrby('thisone:queries:zero-result', 1, normalizedQuery);
    }

    if (suspectFlags.length > 0 || rejectedCount > 0) {
      await kv.zincrby('thisone:queries:suspect', 1, normalizedQuery);
      for (const flag of suspectFlags) {
        await kv.zincrby(`thisone:queries:suspect:${flag}`, 1, normalizedQuery);
      }
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[record-query] failed:', err);
    return res.status(200).json({
      success: false,
      error: err instanceof Error ? err.message : 'record failed'
    });
  }
}
