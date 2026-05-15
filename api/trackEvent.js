import { sanitizeEvent, sanitizeQuery, storeAnalyticsEvent } from '../lib/analyticsStore.js';

function getHeader(req, name) {
  const headers = req?.headers || {};
  return headers[name] || headers[name.toLowerCase()] || headers[name.toUpperCase()] || '';
}

function categorizeUserAgent(userAgent) {
  const value = String(userAgent || '').toLowerCase();
  if (!value) return 'unknown';
  if (/bot|crawler|spider|slurp|facebookexternalhit|preview/.test(value)) return 'bot';
  if (/ipad|tablet|kindle|silk/.test(value)) return 'tablet';
  if (/mobile|iphone|android|ipod/.test(value)) return 'mobile';
  return 'desktop';
}

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    if (!body.userAgentCategory) {
      body.userAgentCategory = categorizeUserAgent(getHeader(req, 'user-agent'));
    }
    const event = sanitizeEvent(body);

    if (!event) {
      return res.status(400).json({ ok: false, error: 'Invalid eventName' });
    }

    await storeAnalyticsEvent(event);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.warn('[ThisOneEvent] tracking failed safely:', error?.message || error);
    return res.status(200).json({ ok: true });
  }
}

export const _private = {
  sanitizeQuery,
  sanitizeEvent,
  categorizeUserAgent
};
