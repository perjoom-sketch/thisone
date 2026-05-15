import { resetAnalyticsKeys } from '../lib/analyticsStore.js';

const CONFIRM_TEXT = '통계 초기화';
const ALLOWED_RANGES = new Set(['today', 'last7Days', 'last30Days', 'all']);
const KV_NOT_CONFIGURED_MESSAGE = 'KV 저장소가 설정되지 않아 초기화할 수 없습니다.';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return null;
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4096) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

function normalizeBody(body) {
  const range = typeof body?.range === 'string' ? body.range : '';
  const confirmText = typeof body?.confirmText === 'string' ? body.confirmText : '';
  return { range, confirmText };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = normalizeBody(await readBody(req));

  if (!ALLOWED_RANGES.has(body.range)) {
    return res.status(400).json({ ok: false, error: 'Invalid reset range' });
  }

  if (body.confirmText !== CONFIRM_TEXT) {
    return res.status(400).json({ ok: false, error: 'Confirmation text does not match' });
  }

  try {
    const result = await resetAnalyticsKeys(body.range);
    if (!result.ok) {
      return res.status(503).json({
        ok: false,
        resetRange: result.resetRange,
        deletedKeys: null,
        message: KV_NOT_CONFIGURED_MESSAGE
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.warn('[ThisOne Analytics Reset] Reset failed safely:', error?.message || error);
    return res.status(500).json({
      ok: false,
      resetRange: body.range,
      deletedKeys: null,
      message: 'analytics: 통계 키 초기화에 실패했습니다. 잠시 후 다시 시도해 주세요.'
    });
  }
}

export const _private = {
  CONFIRM_TEXT,
  ALLOWED_RANGES,
  KV_NOT_CONFIGURED_MESSAGE,
  normalizeBody,
  readBody
};
