import { getKvRestConfig, readAnalyticsSummary } from '../lib/analyticsStore.js';

const PLACEHOLDER_MESSAGE = 'Analytics event collection is active, but readable storage is not configured yet.';
const STORAGE_READ_FAILURE_MESSAGE = 'Analytics readable storage is configured, but the summary could not be loaded safely.';
const MAX_BREAKDOWN_ROWS = 20;
const MAX_LABEL_LENGTH = 80;

function createEmptyPeriod() {
  return {
    events: 0,
    totalEvents: 0,
    externalEvents: 0,
    internalEvents: 0,
    pageViews: 0,
    externalPageViews: 0,
    internalPageViews: 0,
    visitors: 0,
    externalVisitors: 0,
    internalVisitors: 0
  };
}

function createEmptySummary() {
  return {
    today: createEmptyPeriod(),
    last7Days: createEmptyPeriod(),
    last30Days: createEmptyPeriod(),
    byMode: [],
    byEventName: [],
    daily: []
  };
}

function placeholderResponse(message = PLACEHOLDER_MESSAGE) {
  return {
    ok: true,
    storageConfigured: false,
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
  const events = toCount(period.events || period.totalEvents);
  return {
    events,
    totalEvents: events,
    externalEvents: toCount(period.externalEvents),
    internalEvents: toCount(period.internalEvents),
    pageViews: toCount(period.pageViews),
    externalPageViews: toCount(period.externalPageViews),
    internalPageViews: toCount(period.internalPageViews),
    visitors: toCount(period.visitors),
    externalVisitors: toCount(period.externalVisitors),
    internalVisitors: toCount(period.internalVisitors)
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
        count: toCount(row?.count),
        externalCount: toCount(row?.externalCount),
        internalCount: toCount(row?.internalCount)
      };
    })
    .filter(Boolean);
}

function normalizeDailyRows(value) {
  if (!Array.isArray(value)) return [];

  return value
    .slice(-30)
    .map((row) => {
      const date = limitString(row?.date, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
      return {
        date,
        ...normalizePeriod(row)
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
    byEventName: normalizeBreakdownRows(source?.byEventName, 'eventName'),
    daily: normalizeDailyRows(source?.daily)
  };
}

function hasReadableKvConfig() {
  return Boolean(getKvRestConfig('read'));
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!hasReadableKvConfig()) {
    return res.status(200).json(placeholderResponse());
  }

  try {
    const summary = await readAnalyticsSummary();
    return res.status(200).json({
      ok: true,
      storageConfigured: true,
      summary: normalizeSummaryPayload(summary)
    });
  } catch (error) {
    console.warn('[ThisOne Analytics Summary] Redis summary unavailable:', error?.message || error);
    return res.status(200).json(placeholderResponse(STORAGE_READ_FAILURE_MESSAGE));
  }
}

export const _private = {
  PLACEHOLDER_MESSAGE,
  STORAGE_READ_FAILURE_MESSAGE,
  createEmptySummary,
  normalizePeriod,
  normalizeBreakdownRows,
  normalizeDailyRows,
  normalizeSummaryPayload,
  placeholderResponse,
  hasReadableKvConfig
};
