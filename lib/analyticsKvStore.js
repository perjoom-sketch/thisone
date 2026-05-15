import { createHash } from 'node:crypto';
import { kv } from '@vercel/kv';

const ANALYTICS_PREFIX = 'thisone:analytics:v1';
const ANALYTICS_KV_TIMEOUT_MS = 2000;
const MAX_BREAKDOWN_ROWS = 20;
const MAX_LABEL_LENGTH = 80;
const PERIOD_DAY_COUNTS = {
  today: 1,
  last7Days: 7,
  last30Days: 30
};

function limitString(value, maxLength = MAX_LABEL_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function mapUpstashEnv() {
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
}

function getKvEnvStatus() {
  mapUpstashEnv();

  const hasVercelKv = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
  const hasUpstashRest = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const hasRedisUrl = Boolean(process.env.REDIS_URL);

  return {
    configured: hasVercelKv || hasUpstashRest,
    provider: hasVercelKv ? 'vercel-kv' : hasUpstashRest ? 'upstash-rest' : hasRedisUrl ? 'redis-url' : 'none',
    hasRedisUrl
  };
}

function toUtcDateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dateKeysForLastDays(days, now = new Date()) {
  const keys = [];
  for (let index = 0; index < days; index += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - index));
    keys.push(toUtcDateKey(date));
  }
  return keys;
}

function countKey(dateKey) {
  return `${ANALYTICS_PREFIX}:day:${dateKey}:counts`;
}

function modeKey(dateKey) {
  return `${ANALYTICS_PREFIX}:day:${dateKey}:modes`;
}

function eventNameKey(dateKey) {
  return `${ANALYTICS_PREFIX}:day:${dateKey}:eventNames`;
}

function visitorKey(dateKey) {
  return `${ANALYTICS_PREFIX}:day:${dateKey}:visitors`;
}

function toCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.floor(numberValue);
}

function createEmptyPeriod() {
  return {
    totalEvents: 0,
    pageViews: 0,
    uniqueVisitors: 0,
    externalEvents: 0,
    internalEvents: 0
  };
}

function createEmptySummary() {
  return {
    today: createEmptyPeriod(),
    last7Days: createEmptyPeriod(),
    last30Days: createEmptyPeriod(),
    byMode: [],
    byEventName: []
  };
}

function normalizeCounterHash(hash) {
  const source = hash && typeof hash === 'object' ? hash : {};
  return {
    totalEvents: toCount(source.totalEvents),
    pageViews: toCount(source.pageViews),
    externalEvents: toCount(source.externalEvents),
    internalEvents: toCount(source.internalEvents)
  };
}

function addPeriod(target, counters) {
  target.totalEvents += toCount(counters.totalEvents);
  target.pageViews += toCount(counters.pageViews);
  target.externalEvents += toCount(counters.externalEvents);
  target.internalEvents += toCount(counters.internalEvents);
}

async function countUniqueVisitors(dateKeys) {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return 0;
  return toCount(await kv.pfcount(...dateKeys.map(visitorKey)).catch(() => 0));
}

function addBreakdown(target, hash) {
  if (!hash || typeof hash !== 'object') return;

  for (const [rawLabel, rawCount] of Object.entries(hash)) {
    const label = limitString(rawLabel);
    if (!label) continue;
    target.set(label, (target.get(label) || 0) + toCount(rawCount));
  }
}

function mapToRows(map, labelKey) {
  return Array.from(map, ([label, count]) => ({ [labelKey]: label, count }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || String(a[labelKey]).localeCompare(String(b[labelKey])))
    .slice(0, MAX_BREAKDOWN_ROWS);
}

function hashAnonymousVisitorId(value) {
  const safeValue = limitString(value, 120);
  if (!safeValue) return '';
  return createHash('sha256').update(safeValue).digest('hex');
}

async function withTimeout(operation, timeoutMs = ANALYTICS_KV_TIMEOUT_MS) {
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('analytics kv timeout')), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function storeAnalyticsAggregate(event) {
  const status = getKvEnvStatus();
  if (!status.configured) return { ok: true, stored: false, reason: status.provider };

  const dateKey = toUtcDateKey(new Date(event.receivedAt || event.timestamp || Date.now()));
  const internal = event.isInternal === true;
  const increments = [
    kv.hincrby(countKey(dateKey), 'totalEvents', 1),
    kv.hincrby(countKey(dateKey), internal ? 'internalEvents' : 'externalEvents', 1)
  ];

  if (event.eventName === 'page_view') {
    increments.push(kv.hincrby(countKey(dateKey), 'pageViews', 1));
  }

  const eventName = limitString(event.eventName, 60);
  if (eventName && !internal) {
    increments.push(kv.hincrby(eventNameKey(dateKey), eventName, 1));
  }

  const mode = limitString(event.mode, 40);
  if (mode && !internal) {
    increments.push(kv.hincrby(modeKey(dateKey), mode, 1));
  }

  const visitorHash = !internal ? hashAnonymousVisitorId(event.anonymousVisitorId) : '';
  if (visitorHash) {
    increments.push(kv.pfadd(visitorKey(dateKey), visitorHash));
  }

  await withTimeout(Promise.all(increments));
  return { ok: true, stored: true, provider: status.provider };
}

async function readDay(dateKey) {
  const [counts, modes, eventNames] = await Promise.all([
    kv.hgetall(countKey(dateKey)),
    kv.hgetall(modeKey(dateKey)),
    kv.hgetall(eventNameKey(dateKey))
  ]);

  return {
    counts: normalizeCounterHash(counts),
    modes,
    eventNames
  };
}

async function readAnalyticsSummary(now = new Date()) {
  const status = getKvEnvStatus();
  if (!status.configured) {
    return { storageConfigured: false, provider: status.provider, summary: createEmptySummary() };
  }

  const allDateKeys = dateKeysForLastDays(PERIOD_DAY_COUNTS.last30Days, now);
  const days = await withTimeout(Promise.all(allDateKeys.map(async (dateKey) => [dateKey, await readDay(dateKey)])));
  const dayMap = new Map(days);
  const summary = createEmptySummary();
  const modeTotals = new Map();
  const eventNameTotals = new Map();

  for (const [periodKey, dayCount] of Object.entries(PERIOD_DAY_COUNTS)) {
    const periodDateKeys = allDateKeys.slice(0, dayCount);
    for (const dateKey of periodDateKeys) {
      const day = dayMap.get(dateKey);
      if (!day) continue;
      addPeriod(summary[periodKey], day.counts);
    }
    summary[periodKey].uniqueVisitors = await countUniqueVisitors(periodDateKeys);
  }

  for (const dateKey of allDateKeys) {
    const day = dayMap.get(dateKey);
    if (!day) continue;
    addBreakdown(modeTotals, day.modes);
    addBreakdown(eventNameTotals, day.eventNames);
  }

  summary.byMode = mapToRows(modeTotals, 'mode');
  summary.byEventName = mapToRows(eventNameTotals, 'eventName');

  return { storageConfigured: true, provider: status.provider, summary };
}

export {
  ANALYTICS_KV_TIMEOUT_MS,
  createEmptySummary,
  getKvEnvStatus,
  mapUpstashEnv,
  readAnalyticsSummary,
  storeAnalyticsAggregate,
  _private
};

const _private = {
  ANALYTICS_PREFIX,
  MAX_BREAKDOWN_ROWS,
  createEmptyPeriod,
  dateKeysForLastDays,
  countUniqueVisitors,
  hashAnonymousVisitorId,
  limitString,
  normalizeCounterHash,
  toUtcDateKey
};
