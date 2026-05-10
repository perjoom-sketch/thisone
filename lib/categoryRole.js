const categoryMap = require('../data/categoryMap.json');

const ROLE_ORDER = ['main', 'accessory', 'irrelevant'];

function matchesRule(item, rule) {
  return Object.keys(rule).every((field) => item[field] === rule[field]);
}

function matchesRole(item, categoryKey, role) {
  const rules = categoryMap[categoryKey][role] || [];
  return rules.some((rule) => matchesRule(item, rule));
}

function matchCategoryKey(item) {
  if (!item) return null;

  return Object.keys(categoryMap).find((categoryKey) => (
    ROLE_ORDER.some((role) => matchesRole(item, categoryKey, role))
  )) || null;
}

function getCategoryRole(item) {
  const categoryKey = matchCategoryKey(item);
  if (!categoryKey) return 'unknown';

  return ROLE_ORDER.find((role) => matchesRole(item, categoryKey, role)) || 'unknown';
}

function isAmbiguousQuery(query, allCandidates) {
  const { detectIntent } = require('./intentDetector');
  const contextKeywords = ['가정용', '차량용', '자동차', '실내용', '업무용', '사무용'];
  const normalized = String(query || '').trim();

  if (detectIntent(normalized) !== 'accessory') return false;
  if (contextKeywords.some((keyword) => normalized.includes(keyword))) return false;

  const accessoryCategoryKeys = new Set();
  let hasAccessoryCandidate = false;
  let hasIrrelevantCandidate = false;

  for (const item of (allCandidates || [])) {
    for (const categoryKey of Object.keys(categoryMap)) {
      if (matchesRole(item, categoryKey, 'accessory')) {
        accessoryCategoryKeys.add(categoryKey);
        hasAccessoryCandidate = true;
      }

      if (matchesRole(item, categoryKey, 'irrelevant')) {
        hasIrrelevantCandidate = true;
      }
    }
  }

  return accessoryCategoryKeys.size >= 2 || (hasAccessoryCandidate && hasIrrelevantCandidate);
}

module.exports = {
  getCategoryRole,
  matchCategoryKey,
  isAmbiguousQuery
};
