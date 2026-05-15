import {
  normalizeAnalyticsEvent,
  sanitizeAnalyticsEvent,
  storeAnalyticsEvent
} from '../lib/analyticsStore.js';

const ALLOWED_EVENT_NAMES = new Set([
  'mode_open',
  'shopping_search_submit',
  'ai_tool_submit',
  'source_click',
  'product_click'
]);

function parseBody(body) {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch (err) {
      return {};
    }
  }
  return body;
}

function logTrackingError(message, error) {
  console.error('[ThisOne Analytics Error]', {
    message,
    error: error?.message || String(error || '')
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    const eventName = String(body.eventName || '');

    if (!ALLOWED_EVENT_NAMES.has(eventName)) {
      return res.status(400).json({ ok: false, error: 'Invalid eventName' });
    }

    const normalizedEvent = normalizeAnalyticsEvent({
      ...body,
      userAgent: req.headers?.['user-agent']
    });
    const sanitizedEvent = sanitizeAnalyticsEvent(normalizedEvent);

    await storeAnalyticsEvent(sanitizedEvent);

    return res.status(200).json({ ok: true });
  } catch (err) {
    logTrackingError('Failed to track analytics event', err);
    return res.status(200).json({ ok: true });
  }
}
