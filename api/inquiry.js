import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Upstash 연동 시 변수명이 다를 수 있어 자동 매핑 시도
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }

  console.log(`[Inquiry API] ${req.method} request received`);

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1. 문의 목록 조회 (GET)
    if (req.method === 'GET') {
      const inquiries = await kv.lrange('thisone_inquiries', 0, 29);
      // 보안을 위해 비밀번호 제외
      const safeInquiries = (inquiries || []).map(inq => {
        const p = typeof inq === 'string' ? JSON.parse(inq) : inq;
        const { password, ...rest } = p;
        return rest;
      });
      return res.status(200).json({ status: 'success', data: safeInquiries });
    }

    // 2. 문의 등록 (POST)
    if (req.method === 'POST') {
      const { title, content, password, author = '익명' } = req.body || {};
      if (!title || !content || !password) {
        return res.status(400).json({ status: 'error', message: '제목, 내용, 비밀번호를 모두 입력해주세요.' });
      }

      const newInquiry = {
        id: Date.now(),
        title: String(title).substring(0, 100),
        content: String(content).substring(0, 2000),
        password,
        author: String(author).substring(0, 20),
        createdAt: new Date().toISOString()
      };

      try {
        await kv.lpush('thisone_inquiries', JSON.stringify(newInquiry));
        await kv.ltrim('thisone_inquiries', 0, 99);
        return res.status(200).json({ status: 'success', data: newInquiry });
      } catch (kvErr) {
        console.error('[KV Error]:', kvErr);
        return res.status(500).json({ status: 'error', message: '데이터베이스 연결을 확인해주세요.' });
      }
    }

    // 3. 문의 수정 (PUT)
    if (req.method === 'PUT') {
      const { id, title, content, password } = req.body || {};
      if (!id || !password) return res.status(400).json({ message: '필수 정보 누락' });

      const inquiries = await kv.lrange('thisone_inquiries', 0, 99);
      let foundIdx = -1;
      let target = null;
      const parsed = inquiries.map((inq, i) => {
        const p = typeof inq === 'string' ? JSON.parse(inq) : inq;
        if (p.id == id) { foundIdx = i; target = p; }
        return p;
      });

      if (foundIdx === -1) return res.status(404).json({ message: '글을 찾을 수 없습니다.' });

      const managerKey = String(process.env.INQUIRY_MANAGER_KEY || '').trim();
      const inputKey = String(password || '').trim();
      const isWriter = String(target.password || '') === inputKey;
      const isManager = !!managerKey && inputKey === managerKey;

      if (!isWriter && !isManager) {
        return res.status(403).json({ message: '비밀번호가 틀립니다.' });
      }

      target.title = String(title).substring(0, 100);
      target.content = String(content).substring(0, 2000);
      target.updatedAt = new Date().toISOString();
      parsed[foundIdx] = target;

      await kv.del('thisone_inquiries');
      for (const item of parsed) {
        await kv.rpush('thisone_inquiries', JSON.stringify(item));
      }
      return res.status(200).json({ status: 'success' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[Inquiry API Error]:', err);
    return res.status(500).json({ status: 'error', message: '서버 오류가 발생했습니다.' });
  }
}
