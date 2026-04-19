/**
 * api/inquiry.js
 * Vercel KV를 사용하여 문의 게시판 데이터를 관리하는 엔드포인트.
 */
const { kv } = require('@vercel/kv');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

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
      if (!title || !content) {
        return res.status(400).json({ status: 'error', message: '제목과 내용을 입력해주세요.' });
      }

      const newInquiry = {
        id: Date.now(),
        title,
        content,
        author,
        createdAt: new Date().toISOString()
      };

      // 목록 맨 앞에 추가
      await kv.lpush('thisone_inquiries', newInquiry);
      // 최대 100개까지만 유지 (관리용)
      await kv.ltrim('thisone_inquiries', 0, 99);

      return res.status(200).json({ status: 'success', data: newInquiry });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[Inquiry API Error]:', err);
    return res.status(500).json({ status: 'error', message: '서버 오류가 발생했습니다.' });
  }
}
