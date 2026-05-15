const SUMMARY_READ_TIMEOUT_MS = 2500;
const PLACEHOLDER_MESSAGE = 'Analytics event collection is active, but readable storage is not configured yet.';
const STORAGE_READ_FAILURE_MESSAGE = 'Analytics readable storage is configured, but the summary could not be loaded safely.';
const MAX_BREAKDOWN_ROWS = 20;
const MAX_LABEL_LENGTH = 80;

function createEmptyPeriod() {
  return {
    totalEvents: 0,
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
  return {
    totalEvents: toCount(period.totalEvents),
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

function buildReadUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.searchParams.set('excludeInternal', 'true');
  url.searchParams.set('aggregateOnly', 'true');
  return url.toString();
}

async function fetchStorageSummary(readUrl, token) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch unavailable');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUMMARY_READ_TIMEOUT_MS);

  try {
    const headers = {
      Accept: 'application/json'
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(buildReadUrl(readUrl), {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`analytics summary storage status ${response.status}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  if (req.method && req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const readUrl = limitString(process.env.ANALYTICS_STORAGE_READ_URL, 1000);
  const token = limitString(process.env.ANALYTICS_STORAGE_TOKEN, 1000);

  if (!readUrl) {
    return res.status(200).json(placeholderResponse());
  }

  try {
    const remotePayload = await fetchStorageSummary(readUrl, token);
    return res.status(200).json({
      ok: true,
      storageConfigured: true,
      summary: normalizeSummaryPayload(remotePayload)
    });
  } catch (error) {
    console.warn('[ThisOne Analytics Summary] readable storage unavailable:', error?.message || error);
    return res.status(200).json(placeholderResponse(STORAGE_READ_FAILURE_MESSAGE));
  }
}

export const _private = {
  SUMMARY_READ_TIMEOUT_MS,
  PLACEHOLDER_MESSAGE,
  STORAGE_READ_FAILURE_MESSAGE,
  createEmptySummary,
  normalizeSummaryPayload,
  buildReadUrl
};
