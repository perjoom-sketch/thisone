// api/search/raw.js
const searchHandler = require('../search');

const {
  applySearchSettings,
  fetchNaverShopItemsExactFirst,
  improveQuery,
  mapNaverItems
} = searchHandler._private || {};

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    if (!applySearchSettings || !fetchNaverShopItemsExactFirst || !improveQuery || !mapNaverItems) {
      return res.status(500).json({ error: 'Search helpers are unavailable' });
    }

    const q = String(req.query.q || req.query.query || '').trim();
    if (!q) {
      return res.status(400).json({ error: '검색어가 없습니다.' });
    }

    const start = parseInt(req.query.start || '1', 10);
    const display = parseInt(req.query.display || '30', 10);
    const sort = req.query.sort || 'sim';
    const improvedQ = improveQuery(q);

    let data;
    let naverQueryDebug = null;
    try {
      const exactFirstResult = await fetchNaverShopItemsExactFirst(q, improvedQ, { display, start, sort });
      data = exactFirstResult.data;
      naverQueryDebug = exactFirstResult.debug;
    } catch (err) {
      if (err.status) {
        return res.status(err.status).json({ error: 'Naver Shopping API error', detail: err.detail });
      }
      throw err;
    }

    const mappedItems = mapNaverItems(data.items);
    const settingsResult = applySearchSettings(mappedItems, req.query);

    return res.status(200).json({
      query: q,
      improvedQuery: improvedQ,
      total: data.total || 0,
      items: settingsResult.items,
      rejectedItems: settingsResult.rejected || [],
      searchSettingsDebug: {
        applied: settingsResult.settings,
        rejectedCount: settingsResult.rejected.length,
        note: 'raw endpoint skips AI filtering and YouTube reputation enrichment'
      },
      naverQueryDebug,
      track: 'raw'
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}

module.exports = handler;
module.exports.config = { maxDuration: 20 };
