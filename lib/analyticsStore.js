const ALLOWED_EVENT_NAMES = new Set([
  'page_view',
  'mode_open',
  'shopping_search_submit',
  'ai_tool_submit',
  'source_click',
  'product_click'
]);

const MAX_QUERY_LENGTH = 100;
const MAX_STRING_LENGTH = 160;
const MAX_METADATA_KEYS = 20;
const ANALYTICS_STORAGE_TIMEOUT_MS = 2000;
const ANALYTICS_SUMMARY_DAYS = 30;
const ANALYTICS_BREAKDOWN_LIMIT = 20;
const ANALYTICS_RESET_SCAN_COUNT = 100;
const ANALYTICS_KEY_PREFIX = 'analytics:';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SENSITIVE_METADATA_KEY_PATTERN = /(image|photo|base64|document|content|body|text|prompt|password|passwd|pwd|address|addr|phone|tel|rrn|resident|account)/i;

function limitString(value, maxLength = MAX_STRING_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function redactSensitiveText(value, maxLength = MAX_STRING_LENGTH) {
  return limitString(value, Math.max(maxLength, 500))
    .replace(/\b\d{6}-?\d{7}\b/g, '[removed-id]')
    .replace(/\b01[016789][-\.\s]?\d{3,4}[-\.\s]?\d{4}\b/g, '[removed-phone]')
    .replace(/\b\d{4,}([-\.\s]?\d{2,}){1,}\b/g, '[removed-number]')
    .replace(/\b\d{7,}\b/g, '[removed-number]')
    .replace(/\b(?:password|passwd|pwd|비밀번호)\s*[:=]\s*\S+/gi, '[removed-password]')
    .replace(/\b[A-Za-z0-9+/]{80,}={0,2}\b/g, '[removed-base64]')
    .replace(/[가-힣A-Za-z0-9\s.-]+(?:시|도)\s+[가-힣A-Za-z0-9\s.-]+(?:구|군)\s+[가-힣A-Za-z0-9\s.-]+(?:로|길)(?:\s*\d+[가-힣A-Za-z0-9\s.-]*)?/g, '[removed-address]')
    .replace(/\b\d{1,6}\s+[A-Za-z0-9 .'-]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl)\b/gi, '[removed-address]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeQuery(value) {
  return redactSensitiveText(value, MAX_QUERY_LENGTH);
}

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;

  const output = {};
  const entries = Object.entries(metadata).slice(0, MAX_METADATA_KEYS);

  for (const [rawKey, rawValue] of entries) {
    const key = limitString(rawKey, 40);
    if (!key || SENSITIVE_METADATA_KEY_PATTERN.test(key)) continue;

    if (rawValue === null || rawValue === undefined) {
      output[key] = null;
    } else if (typeof rawValue === 'boolean') {
      output[key] = rawValue;
    } else if (typeof rawValue === 'number') {
      output[key] = Number.isFinite(rawValue) ? rawValue : null;
    } else if (typeof rawValue === 'string') {
      output[key] = redactSensitiveText(rawValue, MAX_STRING_LENGTH);
    }
  }

  return Object.keys(output).length ? output : undefined;
}

function sanitizeTimestamp(value) {
  const raw = limitString(value, 40);
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function sanitizeVisitorId(value) {
  const visitorId = limitString(value, 80).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 80);
  return visitorId.length >= 8 ? visitorId : '';
}

function sanitizeEvent(body) {
  const eventName = limitString(body?.eventName, 60);
  if (!ALLOWED_EVENT_NAMES.has(eventName)) return null;

  const event = {
    eventName,
    isInternal: normalizeBoolean(body?.isInternal),
    timestamp: sanitizeTimestamp(body?.timestamp),
    path: limitString(body?.path, 120),
    receivedAt: new Date().toISOString()
  };

  const mode = limitString(body?.mode, 40);
  if (mode) event.mode = mode;

  const query = sanitizeQuery(body?.query);
  if (query) event.query = query;

  const metadata = sanitizeMetadata(body?.metadata);
  if (metadata) event.metadata = metadata;

  const userAgentCategory = limitString(body?.userAgentCategory, 40);
  if (userAgentCategory) event.userAgentCategory = userAgentCategory;

  const visitorId = sanitizeVisitorId(body?.visitorId);
  if (visitorId) event.visitorId = visitorId;

  return event;
}

function firstConfiguredEnv(names, maxLength = 1000) {
  for (const name of names) {
    const value = limitString(process.env[name], maxLength);
    if (value) return value;
  }
  return '';
}

function toRemotePayload(event) {
  return {
    eventName: event.eventName,
    mode: event.mode,
    query: event.query,
    metadata: event.metadata,
    isInternal: event.isInternal,
    timestamp: event.timestamp,
    path: event.path,
    userAgentCategory: event.userAgentCategory,
    visitorId: event.visitorId
  };
}

function getKvRestConfig(access = 'write') {
  const url = firstConfiguredEnv(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']).replace(/\/$/, '');
  const writeToken = firstConfiguredEnv(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']);
  const readToken = firstConfiguredEnv(['KV_REST_API_READ_ONLY_TOKEN', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']);
  const token = access === 'read' ? readToken : writeToken;

  return url && token ? { url, token, writeToken, readToken } : null;
}

function writeConsoleEvent(event) {
  console.log('[ThisOneEvent]', JSON.stringify(event));
}

async function fetchWithTimeout(url, options, timeoutMs = ANALYTICS_STORAGE_TIMEOUT_MS) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch unavailable');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function postRemoteEvent(event, storageUrl, storageToken) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (storageToken) {
    headers.Authorization = `Bearer ${storageToken}`;
  }

  const response = await fetchWithTimeout(storageUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(toRemotePayload(event))
  });

  if (!response.ok) {
    throw new Error(`analytics storage status ${response.status}`);
  }
}

function getKstDateKey(dateValue = new Date()) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const time = Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10);
}

function getRecentDateKeys(days = ANALYTICS_SUMMARY_DAYS) {
  const todayKstMs = Date.now() + KST_OFFSET_MS;
  return Array.from({ length: days }, (_, index) => new Date(todayKstMs - index * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)).reverse();
}

function dayKey(date, suffix) {
  return `analytics:day:${date}:${suffix}`;
}

function buildRedisWriteCommands(event) {
  const date = getKstDateKey(event.timestamp || event.receivedAt);
  const internalSuffix = event.isInternal ? 'internal' : 'external';
  const mode = limitString(event.mode || 'unknown', 40) || 'unknown';
  const commands = [
    ['INCR', dayKey(date, 'events')],
    ['INCR', dayKey(date, `events:${internalSuffix}`)],
    ['INCR', dayKey(date, `eventName:${event.eventName}`)],
    ['INCR', dayKey(date, `mode:${mode}`)],
    ['SADD', dayKey(date, 'eventNames'), event.eventName],
    ['SADD', dayKey(date, 'modes'), mode]
  ];

  if (event.eventName === 'page_view') {
    commands.push(['INCR', dayKey(date, 'pageViews')]);

    if (event.visitorId) {
      commands.push(
        ['SADD', dayKey(date, 'visitors'), event.visitorId],
        ['SADD', dayKey(date, `visitors:${internalSuffix}`), event.visitorId]
      );
    }
  }

  return commands;
}

async function redisPipeline(commands, config = getKvRestConfig('write')) {
  if (!config) throw new Error('redis storage not configured');
  if (!Array.isArray(commands) || commands.length === 0) return [];

  const response = await fetchWithTimeout(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) {
    throw new Error(`redis status ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) return [];

  const failed = payload.find((item) => item?.error);
  if (failed) {
    throw new Error(`redis command error ${failed.error}`);
  }

  return payload.map((item) => item?.result);
}

async function storeRedisAggregate(event, config = getKvRestConfig('write')) {
  await redisPipeline(buildRedisWriteCommands(event), config);
}

function toCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.floor(numberValue);
}

function createEmptyPeriod() {
  return {
    totalEvents: 0,
    externalEvents: 0,
    internalEvents: 0,
    pageViews: 0,
    visitors: 0,
    externalVisitors: 0,
    internalVisitors: 0
  };
}

function addPeriod(target, source) {
  target.totalEvents += toCount(source.totalEvents);
  target.externalEvents += toCount(source.externalEvents);
  target.internalEvents += toCount(source.internalEvents);
  target.pageViews += toCount(source.pageViews);
  target.visitors += toCount(source.visitors);
  target.externalVisitors += toCount(source.externalVisitors);
  target.internalVisitors += toCount(source.internalVisitors);
  return target;
}

function sortBreakdownMap(map, labelKey) {
  return Array.from(map.entries())
    .map(([label, count]) => ({ [labelKey]: label, count }))
    .sort((a, b) => b.count - a.count || String(a[labelKey]).localeCompare(String(b[labelKey])))
    .slice(0, ANALYTICS_BREAKDOWN_LIMIT);
}

async function readAnalyticsSummary() {
  const config = getKvRestConfig('read');
  if (!config) {
    return null;
  }

  const dates = getRecentDateKeys(ANALYTICS_SUMMARY_DAYS);
  const readCommands = [];

  dates.forEach((date) => {
    readCommands.push(
      ['GET', dayKey(date, 'events')],
      ['GET', dayKey(date, 'events:external')],
      ['GET', dayKey(date, 'events:internal')],
      ['GET', dayKey(date, 'pageViews')],
      ['SCARD', dayKey(date, 'visitors')],
      ['SCARD', dayKey(date, 'visitors:external')],
      ['SCARD', dayKey(date, 'visitors:internal')],
      ['SMEMBERS', dayKey(date, 'modes')],
      ['SMEMBERS', dayKey(date, 'eventNames')]
    );
  });

  const results = await redisPipeline(readCommands, config);
  const daily = [];
  const modesByDate = new Map();
  const eventNamesByDate = new Map();

  dates.forEach((date, index) => {
    const offset = index * 9;
    daily.push({
      date,
      totalEvents: toCount(results[offset]),
      externalEvents: toCount(results[offset + 1]),
      internalEvents: toCount(results[offset + 2]),
      pageViews: toCount(results[offset + 3]),
      visitors: toCount(results[offset + 4]),
      externalVisitors: toCount(results[offset + 5]),
      internalVisitors: toCount(results[offset + 6])
    });
    modesByDate.set(date, Array.isArray(results[offset + 7]) ? results[offset + 7].map((mode) => limitString(mode, 40)).filter(Boolean) : []);
    eventNamesByDate.set(date, Array.isArray(results[offset + 8]) ? results[offset + 8].map((eventName) => limitString(eventName, 60)).filter(Boolean) : []);
  });

  const breakdownCommands = [];
  const breakdownRefs = [];
  dates.forEach((date) => {
    modesByDate.get(date).forEach((mode) => {
      breakdownRefs.push({ type: 'mode', label: mode });
      breakdownCommands.push(['GET', dayKey(date, `mode:${mode}`)]);
    });
    eventNamesByDate.get(date).forEach((eventName) => {
      breakdownRefs.push({ type: 'eventName', label: eventName });
      breakdownCommands.push(['GET', dayKey(date, `eventName:${eventName}`)]);
    });
  });

  const breakdownResults = breakdownCommands.length ? await redisPipeline(breakdownCommands, config) : [];
  const byModeMap = new Map();
  const byEventNameMap = new Map();

  breakdownRefs.forEach((ref, index) => {
    const count = toCount(breakdownResults[index]);
    const map = ref.type === 'mode' ? byModeMap : byEventNameMap;
    map.set(ref.label, toCount(map.get(ref.label)) + count);
  });

  const today = daily[daily.length - 1] || createEmptyPeriod();
  const last7Days = daily.slice(-7).reduce((period, item) => addPeriod(period, item), createEmptyPeriod());
  const last30Days = daily.reduce((period, item) => addPeriod(period, item), createEmptyPeriod());

  return {
    today,
    last7Days,
    last30Days,
    byMode: sortBreakdownMap(byModeMap, 'mode'),
    byEventName: sortBreakdownMap(byEventNameMap, 'eventName'),
    daily
  };
}


function normalizeResetRange(range) {
  return ['today', 'last7Days', 'last30Days', 'all'].includes(range) ? range : '';
}

function getAnalyticsResetDateKeys(range) {
  const normalizedRange = normalizeResetRange(range);
  if (normalizedRange === 'today') return [getKstDateKey()];
  if (normalizedRange === 'last7Days') return getRecentDateKeys(7);
  if (normalizedRange === 'last30Days') return getRecentDateKeys(30);
  return [];
}

function getAnalyticsResetPatterns(range) {
  const normalizedRange = normalizeResetRange(range);
  if (normalizedRange === 'all') return [`${ANALYTICS_KEY_PREFIX}*`];
  return getAnalyticsResetDateKeys(normalizedRange).map((date) => `${ANALYTICS_KEY_PREFIX}day:${date}:*`);
}

function normalizeScanResult(result) {
  if (!Array.isArray(result) || result.length < 2) {
    throw new Error('redis scan result unavailable');
  }

  const cursor = String(result[0] ?? '0');
  const keys = Array.isArray(result[1])
    ? result[1].filter((key) => typeof key === 'string' && key.startsWith(ANALYTICS_KEY_PREFIX))
    : [];

  return { cursor, keys };
}

async function deleteAnalyticsKeysByPattern(pattern, config) {
  let cursor = '0';
  let deletedKeys = 0;
  const seenCursors = new Set();

  do {
    if (seenCursors.has(cursor)) {
      throw new Error('redis scan cursor loop detected');
    }
    seenCursors.add(cursor);

    const [scanResult] = await redisPipeline([
      ['SCAN', cursor, 'MATCH', pattern, 'COUNT', String(ANALYTICS_RESET_SCAN_COUNT)]
    ], config);
    const normalized = normalizeScanResult(scanResult);
    cursor = normalized.cursor;

    if (normalized.keys.length) {
      const deleteResult = await redisPipeline([['DEL', ...normalized.keys]], config);
      deletedKeys += toCount(deleteResult[0]);
    }
  } while (cursor !== '0');

  return deletedKeys;
}

async function resetAnalyticsKeys(range, config = getKvRestConfig('write')) {
  const normalizedRange = normalizeResetRange(range);
  if (!normalizedRange) {
    throw new Error('invalid analytics reset range');
  }
  if (!config) {
    return {
      ok: false,
      resetRange: normalizedRange,
      deletedKeys: null,
      message: 'KV 저장소가 설정되지 않아 초기화할 수 없습니다.'
    };
  }

  const patterns = getAnalyticsResetPatterns(normalizedRange);
  let deletedKeys = 0;

  for (const pattern of patterns) {
    deletedKeys += await deleteAnalyticsKeysByPattern(pattern, config);
  }

  return {
    ok: true,
    resetRange: normalizedRange,
    deletedKeys,
    message: deletedKeys > 0
      ? 'analytics: 통계 키만 초기화했습니다.'
      : '삭제할 analytics: 통계 키가 없습니다.'
  };
}

async function storeAnalyticsEvent(event) {
  const safeEvent = sanitizeEvent(event);
  const storageUrl = limitString(process.env.ANALYTICS_STORAGE_URL, 500);
  const storageToken = limitString(process.env.ANALYTICS_STORAGE_TOKEN, 500);
  const kvConfig = getKvRestConfig('write');

  if (!safeEvent) {
    return { ok: true, stored: 'console' };
  }

  if (kvConfig) {
    try {
      await storeRedisAggregate(safeEvent, kvConfig);
      return { ok: true, stored: 'redis' };
    } catch (error) {
      console.warn('[ThisOne Analytics Redis Fallback]', error?.message || error);
      writeConsoleEvent(safeEvent);
      return { ok: true, stored: 'console-fallback' };
    }
  }

  if (!storageUrl) {
    writeConsoleEvent(safeEvent);
    return { ok: true, stored: 'console' };
  }

  try {
    await postRemoteEvent(safeEvent, storageUrl, storageToken);
    return { ok: true, stored: 'remote' };
  } catch (error) {
    console.warn('[ThisOne Analytics Storage Fallback]');
    writeConsoleEvent(safeEvent);
    return { ok: true, stored: 'console-fallback' };
  }
}

const _private = {
  sanitizeQuery,
  sanitizeEvent,
  sanitizeMetadata,
  sanitizeVisitorId,
  firstConfiguredEnv,
  toRemotePayload,
  getKstDateKey,
  getRecentDateKeys,
  buildRedisWriteCommands,
  getKvRestConfig,
  createEmptyPeriod,
  readAnalyticsSummary,
  resetAnalyticsKeys,
  getAnalyticsResetPatterns,
  normalizeResetRange,
  ANALYTICS_STORAGE_TIMEOUT_MS,
  SENSITIVE_METADATA_KEY_PATTERN
};

export {
  sanitizeQuery,
  sanitizeEvent,
  storeAnalyticsEvent,
  readAnalyticsSummary,
  resetAnalyticsKeys,
  getKvRestConfig,
  toRemotePayload,
  _private
};
