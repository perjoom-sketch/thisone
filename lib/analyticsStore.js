const MAX_QUERY_LENGTH = 100;
const MAX_METADATA_STRING_LENGTH = 100;
const MAX_METADATA_KEYS = 30;

const SENSITIVE_METADATA_KEYS = new Set([
  'imagedata',
  'imagedataurl',
  'documenttext',
  'filecontent',
  'base64',
  'password',
  'phone',
  'rrn',
  'address',
  'account'
]);

const PHONE_PATTERN = /(?:\+?\d{1,3}[\s.-]?)?(?:0\d{1,2}[\s.-]?\d{3,4}[\s.-]?\d{4}|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
const RRN_PATTERN = /\b\d{6}[\s-]?[1-4]\d{6}\b/g;
const LONG_DIGIT_PATTERN = /\d{7,}/g;
const DATA_URL_PATTERN = /data:(?:image|application)\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi;
const LONG_BASE64_PATTERN = /\b[a-z0-9+/]{80,}={0,2}\b/gi;

function limitString(value, maxLength) {
  return String(value || '').slice(0, maxLength);
}

function sanitizeText(value, maxLength) {
  const sanitized = String(value || '')
    .replace(DATA_URL_PATTERN, '[removed]')
    .replace(RRN_PATTERN, '[removed]')
    .replace(PHONE_PATTERN, '[removed]')
    .replace(LONG_DIGIT_PATTERN, '[removed]')
    .replace(LONG_BASE64_PATTERN, '[removed]')
    .trim();

  return limitString(sanitized, maxLength);
}

function normalizeBoolean(value) {
  return value === true || value === 'true';
}

function normalizeTimestamp(value) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};

  return Object.entries(metadata).slice(0, MAX_METADATA_KEYS).reduce((safeMetadata, [key, value]) => {
    const safeKey = limitString(key, 60).trim();
    if (!safeKey) return safeMetadata;

    if (SENSITIVE_METADATA_KEYS.has(safeKey.toLowerCase())) return safeMetadata;

    if (typeof value === 'string') {
      safeMetadata[safeKey] = sanitizeText(value, MAX_METADATA_STRING_LENGTH);
      return safeMetadata;
    }

    if (typeof value === 'number') {
      if (Number.isFinite(value)) safeMetadata[safeKey] = value;
      return safeMetadata;
    }

    if (typeof value === 'boolean' || value === null) {
      safeMetadata[safeKey] = value;
      return safeMetadata;
    }

    return safeMetadata;
  }, {});
}

function categorizeUserAgent(userAgent) {
  const value = String(userAgent || '').toLowerCase();
  if (!value) return 'unknown';
  if (/bot|crawl|spider|slurp|preview/.test(value)) return 'bot';
  if (/ipad|tablet/.test(value)) return 'tablet';
  if (/mobi|iphone|android/.test(value)) return 'mobile';
  return 'desktop';
}

export function normalizeAnalyticsEvent(event = {}) {
  const rawEvent = event && typeof event === 'object' ? event : {};

  return {
    eventName: limitString(rawEvent.eventName, 80),
    mode: limitString(rawEvent.mode, 40),
    query: limitString(rawEvent.query ?? rawEvent.q, 300),
    metadata: rawEvent.metadata && typeof rawEvent.metadata === 'object' ? rawEvent.metadata : {},
    isInternal: normalizeBoolean(rawEvent.isInternal),
    timestamp: normalizeTimestamp(rawEvent.timestamp),
    path: limitString(rawEvent.path, 200),
    userAgentCategory: limitString(rawEvent.userAgentCategory || categorizeUserAgent(rawEvent.userAgent), 40)
  };
}

export function sanitizeAnalyticsEvent(event = {}) {
  const normalized = normalizeAnalyticsEvent(event);

  return {
    ...normalized,
    query: sanitizeText(normalized.query, MAX_QUERY_LENGTH),
    metadata: normalizeMetadata(normalized.metadata),
    path: sanitizeText(normalized.path, 200)
  };
}

export async function storeAnalyticsEvent(event) {
  const safeEvent = sanitizeAnalyticsEvent(event);
  console.log('[ThisOne Analytics Event]', safeEvent);

  return { ok: true, stored: 'console' };
}
