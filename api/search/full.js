// api/search/full.js
// Full search intentionally reuses the existing /api/search flow to preserve AI filtering,
// category-role behavior, fallback policy, YouTube reputation enrichment, scoring, and counts.
module.exports = require('../search');
