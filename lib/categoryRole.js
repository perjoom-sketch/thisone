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

module.exports = {
  getCategoryRole,
  matchCategoryKey
};
