const ALLOWED_EVENT_NAMES = new Set([
  'mode_open',
  'shopping_search_submit',
  'ai_tool_submit',
  'source_click',
  'product_click'
]);

const MAX_QUERY_LENGTH = 100;
const MAX_STRING_LENGTH = 160;
const MAX_METADATA_KEYS = 20;

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (error) {
      return {};
    }
  }
  if (typeof body === 'object') return body;
  return {};
}

function limitString(value, maxLength = MAX_STRING_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeQuery(value) {
  return limitString(value, 500)
    .replace(/\b\d{6}-?\d{7}\b/g, '[removed-id]')
    .replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, '[removed-phone]')
    .replace(/\b\d{4,}([-.\s]?\d{2,}){1,}\b/g, '[removed-number]')
    .replace(/\b\d{7,}\b/g, '[removed-number]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
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
    if (!key) continue;

    if (rawValue === null || rawValue === undefined) {
      output[key] = null;
    } else if (typeof rawValue === 'boolean') {
      output[key] = rawValue;
    } else if (typeof rawValue === 'number') {
      output[key] = Number.isFinite(rawValue) ? rawValue : null;
    } else if (typeof rawValue === 'string') {
      output[key] = limitString(rawValue, MAX_STRING_LENGTH);
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
  const eventName = limitString(body.eventName, 60);
  if (!ALLOWED_EVENT_NAMES.has(eventName)) return null;

  const event = {
    eventName,
    isInternal: normalizeBoolean(body.isInternal),
    timestamp: sanitizeTimestamp(body.timestamp),
    path: limitString(body.path, 120),
    receivedAt: new Date().toISOString()
  };

  const mode = limitString(body.mode, 40);
  if (mode) event.mode = mode;

  const query = sanitizeQuery(body.query);
  if (query) event.query = query;

  const metadata = sanitizeMetadata(body.metadata);
  if (metadata) event.metadata = metadata;

  return event;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    const event = sanitizeEvent(body);

    if (!event) {
      return res.status(400).json({ ok: false, error: 'Invalid eventName' });
    }

    console.log('[ThisOneEvent]', JSON.stringify(event));
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.warn('[ThisOneEvent] tracking failed safely:', error?.message || error);
    return res.status(200).json({ ok: true });
  }
}

export const _private = {
  sanitizeQuery,
  sanitizeEvent
};
