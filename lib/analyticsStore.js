import { getKvEnvStatus, storeAnalyticsAggregate } from './analyticsKvStore.js';

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

function sanitizeEvent(body) {
  const eventName = limitString(body?.eventName, 60);
  if (!ALLOWED_EVENT_NAMES.has(eventName)) return null;

  const event = {
    eventName,
    isInternal: normalizeBoolean(body?.isInternal),
    timestamp: sanitizeTimestamp(body?.timestamp),
    path: limitString(body?.path, 120),
    anonymousVisitorId: limitString(body?.anonymousVisitorId, 120),
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

  return event;
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
    userAgentCategory: event.userAgentCategory
  };
}

function writeConsoleEvent(event) {
  console.log('[ThisOneEvent]', JSON.stringify(event));
}

async function postRemoteEvent(event, storageUrl, storageToken) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch unavailable');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYTICS_STORAGE_TIMEOUT_MS);

  try {
    const headers = {
      'Content-Type': 'application/json'
    };

    if (storageToken) {
      headers.Authorization = `Bearer ${storageToken}`;
    }

    const response = await fetch(storageUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(toRemotePayload(event)),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`analytics storage status ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function storeAnalyticsEvent(event) {
  const safeEvent = sanitizeEvent(event);
  const storageUrl = limitString(process.env.ANALYTICS_STORAGE_URL, 500);
  const storageToken = limitString(process.env.ANALYTICS_STORAGE_TOKEN, 500);

  if (!safeEvent) {
    return { ok: true, stored: 'console' };
  }

  const kvStatus = getKvEnvStatus();

  if (kvStatus.configured) {
    try {
      const result = await storeAnalyticsAggregate(safeEvent);
      return { ok: true, stored: result.stored ? 'kv-aggregate' : 'console' };
    } catch (error) {
      console.warn('[ThisOne Analytics KV Fallback]');
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

export {
  sanitizeQuery,
  sanitizeEvent,
  storeAnalyticsEvent,
  toRemotePayload,
  _private
};

const _private = {
  sanitizeQuery,
  sanitizeEvent,
  sanitizeMetadata,
  toRemotePayload,
  ANALYTICS_STORAGE_TIMEOUT_MS,
  SENSITIVE_METADATA_KEY_PATTERN
};
