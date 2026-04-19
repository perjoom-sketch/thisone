import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Upstash 연동 대응
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }

  const { action, pw } = req.query;
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  try {
    // 1. 방문자 트래킹 (ACTION: track)
    if (action === 'track') {
      await kv.incr('stats:total_visits');
      await kv.incr(`stats:daily:${today}`);
      return res.status(200).json({ success: true });
    }

    // 2. 통계 조회 (ACTION: get)
    if (action === 'get') {
      // 보안 확인 (임시 비밀번호: 0000 -> 나중에 바꾸셔도 됩니다)
      if (pw !== 'thisone123') {
        return res.status(403).json({ message: '접근 권한이 없습니다.' });
      }

      const total = await kv.get('stats:total_visits') || 0;
      const daily = await kv.get(`stats:daily:${today}`) || 0;
      
      // 최근 7일간의 기록도 가져옴
      const history = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dStr = d.toISOString().split('T')[0];
        const count = await kv.get(`stats:daily:${dStr}`) || 0;
        history.push({ date: dStr, count });
      }

      return res.status(200).json({
        success: true,
        data: {
          total,
          daily,
          history: history.reverse()
        }
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('[Stats API Error]:', err);
    return res.status(500).json({ error: 'Stats processing failed' });
  }
}
