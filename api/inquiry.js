import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  console.log(`[Inquiry API] ${req.method} request received`);

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. 문의 목록 조회 (GET)
    if (req.method === 'GET') {
      // 최신 30개의 문의를 가져옴
      const inquiries = await kv.lrange('thisone_inquiries', 0, 29);
      return res.status(200).json({ status: 'success', data: inquiries || [] });
    }

    // 2. 문의 등록 (POST)
    if (req.method === 'POST') {
      const { title, content, author = '익명' } = req.body || {};
      console.log('[Inquiry API] Received Data:', { title, content, author });

      if (!title || !content) {
        return res.status(400).json({ status: 'error', message: '제목과 내용을 입력해주세요.' });
      }

      const newInquiry = {
        id: Date.now(),
        title: String(title).substring(0, 100),
        content: String(content).substring(0, 2000),
        author: String(author).substring(0, 20),
        createdAt: new Date().toISOString()
      };

      try {
        await kv.lpush('thisone_inquiries', JSON.stringify(newInquiry));
        await kv.ltrim('thisone_inquiries', 0, 99);
        console.log('[Inquiry API] Successfully saved to KV');
        return res.status(200).json({ status: 'success', data: newInquiry });
      } catch (kvErr) {
        console.error('[Inquiry API KV Error]:', kvErr);
        return res.status(500).json({ status: 'error', message: '데이터베이스 저장 실패: ' + kvErr.message });
      }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[Inquiry API Error]:', err);
    return res.status(500).json({ status: 'error', message: '서버 오류가 발생했습니다.' });
  }
}
