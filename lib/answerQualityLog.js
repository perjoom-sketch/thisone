const ANSWER_QUALITY_PREFIX = 'answerQuality:';
const ANSWER_QUALITY_INDEX_KEY = `${ANSWER_QUALITY_PREFIX}index`;
const ANSWER_QUALITY_TTL_SECONDS = 60 * 60 * 24 * 30;
const ANSWER_QUALITY_INDEX_LIMIT = 1000;
const ANSWER_QUALITY_TIMEOUT_MS = 1500;

const ALLOWED_STATUSES = new Set(['ok', 'fallback', 'error']);
const ALLOWED_ISSUE_FLAGS = new Set([
  'no_sources',
  'weak_sources',
  'fallback_used',
  'search_failed',
  'model_review_failed',
  'answer_too_short',
  'answer_too_long',
  'repeated_sections',
  'json_error_hidden',
  'official_source_missing',
  'unsupported_claim_risk'
]);

function limitString(value, maxLength = 80) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function firstConfiguredEnv(names, maxLength = 1000) {
  for (const name of names) {
    const value = limitString(process.env[name], maxLength);
    if (value) return value;
  }
  return '';
}

function getKvRestConfig() {
  const url = firstConfiguredEnv(['KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL']).replace(/\/$/, '');
  const token = firstConfiguredEnv(['KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN']);
  return url && token ? { url, token } : null;
}

function sanitizeIssueFlags(flags) {
  const output = [];
  const seen = new Set();
  for (const flag of Array.isArray(flags) ? flags : []) {
    const clean = limitString(flag, 60);
    if (!ALLOWED_ISSUE_FLAGS.has(clean) || seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }
  return output;
}

function sanitizeAnswerQualityMetadata(metadata = {}) {
  const status = limitString(metadata.status, 20);
  const createdAt = metadata.createdAt ? new Date(metadata.createdAt) : new Date();
  const safeCreatedAt = Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString();

  return {
    mode: 'instant-answer',
    createdAt: safeCreatedAt,
    taskType: limitString(metadata.taskType || 'unknown', 80),
    evidencePreference: limitString(metadata.evidencePreference || 'general', 80),
    resolutionStrategy: limitString(metadata.resolutionStrategy || 'normal', 80),
    sourceQuality: limitString(metadata.sourceQuality || 'none', 40),
    usedSearch: normalizeBoolean(metadata.usedSearch),
    usedDeeperResearch: normalizeBoolean(metadata.usedDeeperResearch),
    reviewUsed: normalizeBoolean(metadata.reviewUsed),
    fallbackUsed: normalizeBoolean(metadata.fallbackUsed),
    sourceCount: normalizeInteger(metadata.sourceCount),
    hasOfficialSource: normalizeBoolean(metadata.hasOfficialSource),
    answerLength: normalizeInteger(metadata.answerLength),
    status: ALLOWED_STATUSES.has(status) ? status : 'ok',
    issueFlags: sanitizeIssueFlags(metadata.issueFlags)
  };
}

function buildAnswerQualityKey(createdAt = new Date().toISOString()) {
  const dateKey = String(createdAt).slice(0, 10) || new Date().toISOString().slice(0, 10);
  const entropy = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${ANSWER_QUALITY_PREFIX}${dateKey}:${entropy}`;
}

async function fetchWithTimeout(url, options, timeoutMs = ANSWER_QUALITY_TIMEOUT_MS) {
  if (typeof fetch !== 'function') throw new Error('fetch unavailable');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('answer quality log timeout');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function redisPipeline(commands, config = getKvRestConfig()) {
  if (!config) throw new Error('KV/Redis is not configured');

  const response = await fetchWithTimeout(`${config.url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });

  if (!response.ok) throw new Error(`answer quality log status ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload)) return [];

  const failed = payload.find((item) => item?.error);
  if (failed) throw new Error(`answer quality log command error ${failed.error}`);
  return payload.map((item) => item?.result);
}

async function logAnswerQuality(metadata) {
  const config = getKvRestConfig();
  const safeMetadata = sanitizeAnswerQualityMetadata(metadata);

  if (!config) {
    console.warn('[answerQualityLog] KV/Redis is not configured; skipped answer quality metadata log.');
    return { ok: true, stored: false, reason: 'kv_not_configured' };
  }

  const key = buildAnswerQualityKey(safeMetadata.createdAt);
  const commands = [
    ['SET', key, JSON.stringify(safeMetadata), 'EX', ANSWER_QUALITY_TTL_SECONDS],
    ['LPUSH', ANSWER_QUALITY_INDEX_KEY, key],
    ['LTRIM', ANSWER_QUALITY_INDEX_KEY, 0, ANSWER_QUALITY_INDEX_LIMIT - 1]
  ];

  try {
    await redisPipeline(commands, config);
    return { ok: true, stored: true, key };
  } catch (error) {
    console.warn('[answerQualityLog] Failed to store answer quality metadata:', error?.message || error);
    return { ok: false, stored: false, reason: 'write_failed' };
  }
}

module.exports = {
  logAnswerQuality,
  sanitizeAnswerQualityMetadata,
  _private: {
    ANSWER_QUALITY_PREFIX,
    ANSWER_QUALITY_INDEX_KEY,
    ANSWER_QUALITY_TTL_SECONDS,
    ANSWER_QUALITY_INDEX_LIMIT,
    ALLOWED_ISSUE_FLAGS,
    getKvRestConfig,
    buildAnswerQualityKey,
    redisPipeline
  }
};
