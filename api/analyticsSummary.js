import { createEmptySummary, getKvEnvStatus, readAnalyticsSummary } from '../lib/analyticsKvStore.js';

const PLACEHOLDER_MESSAGE = 'Analytics event collection is active, but Vercel KV/Redis storage is not configured yet.';
const STORAGE_READ_FAILURE_MESSAGE = 'Analytics KV/Redis storage is configured, but the summary could not be loaded safely.';
const REDIS_URL_ONLY_MESSAGE = 'REDIS_URL is present, but this project is configured to use the existing Vercel KV/Upstash REST variables for analytics aggregation.';
const MAX_BREAKDOWN_ROWS = 20;
const MAX_LABEL_LENGTH = 80;

function placeholderResponse(message = PLACEHOLDER_MESSAGE, provider = 'none') {
  return {
    ok: true,
    storageConfigured: false,
    provider,
    message,
    summary: createEmptySummary()
  };
}

function limitString(value, maxLength = MAX_LABEL_LENGTH) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function toCount(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return 0;
  return Math.floor(numberValue);
}

function normalizePeriod(value) {
  const period = value && typeof value === 'object' ? value : {};
  return {
    totalEvents: toCount(period.totalEvents),
    pageViews: toCount(period.pageViews),
    uniqueVisitors: toCount(period.uniqueVisitors),
    externalEvents: toCount(period.externalEvents),
    internalEvents: toCount(period.internalEvents)
  };
}

function normalizeBreakdownRows(value, labelKey) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_BREAKDOWN_ROWS)
    .map((row) => {
      const label = limitString(row?.[labelKey]);
      if (!label) return null;
      return {
        [labelKey]: label,
        count: toCount(row?.count)
      };
    })
    .filter(Boolean);
}

function normalizeSummaryPayload(payload) {
  const source = payload?.summary && typeof payload.summary === 'object' ? payload.summary : payload;

  return {
    today: normalizePeriod(source?.today),
    last7Days: normalizePeriod(source?.last7Days),
    last30Days: normalizePeriod(source?.last30Days),
    byMode: normalizeBreakdownRows(source?.byMode, 'mode'),
    byEventName: normalizeBreakdownRows(source?.byEventName, 'eventName')
  };
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const status = getKvEnvStatus();
  if (!status.configured) {
    const message = status.hasRedisUrl ? REDIS_URL_ONLY_MESSAGE : PLACEHOLDER_MESSAGE;
    return res.status(200).json(placeholderResponse(message, status.provider));
  }

  try {
    const result = await readAnalyticsSummary();
    return res.status(200).json({
      ok: true,
      storageConfigured: true,
      provider: result.provider,
      message: 'Analytics KV/Redis aggregation is configured and returning real counts.',
      summary: normalizeSummaryPayload(result.summary)
    });
  } catch (error) {
    console.warn('[ThisOne Analytics Summary] KV/Redis storage unavailable:', error?.message || error);
    return res.status(200).json(placeholderResponse(STORAGE_READ_FAILURE_MESSAGE, status.provider));
  }
}

export const _private = {
  PLACEHOLDER_MESSAGE,
  STORAGE_READ_FAILURE_MESSAGE,
  REDIS_URL_ONLY_MESSAGE,
  createEmptySummary,
  normalizeSummaryPayload
};
