import { kv } from '@vercel/kv';

function getManagerKey() {
  return String(process.env.INQUIRY_MANAGER_KEY || '').trim();
}

function normalizeKey(value) {
  return String(value || '').trim();
}

function isWriterKey(target, inputValue) {
  return String(target?.password || '') === normalizeKey(inputValue);
}

function isManagerKey(inputValue) {
  const managerKey = getManagerKey();
  const inputKey = normalizeKey(inputValue);
  return !!managerKey && inputKey === managerKey;
}

function canManageInquiry(target, inputValue) {
  return isWriterKey(target, inputValue) || isManagerKey(inputValue);
}

function isLegacyWelcomeInquiry(target) {
  const title = String(target?.title || '');
  const author = String(target?.author || '');
  return title.includes('지능형 가격비교 에이전트') && author === '익명';
}

async function readInquiryList() {
  const inquiries = await kv.lrange('thisone_inquiries', 0, 99);
  return (inquiries || []).map((inq) => (typeof inq === 'string' ? JSON.parse(inq) : inq));
}

async function writeInquiryList(items) {
  await kv.del('thisone_inquiries');
  for (const item of items) {
    await kv.rpush('thisone_inquiries', JSON.stringify(item));
  }
}

function findInquiry(parsed, id) {
  let foundIdx = -1;
  let target = null;
  parsed.forEach((item, i) => {
    if (item.id == id) {
      foundIdx = i;
      target = item;
    }
  });
  return { foundIdx, target };
}

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

    // 3. 문의 수정 / 관리자 비밀번호 재설정 (PUT)
    if (req.method === 'PUT') {
      const { mode, id, title, content, password, newPassword } = req.body || {};

      if (mode === 'manager_check') {
        if (!password) return res.status(400).json({ message: '관리자 키를 입력해주세요.' });
        if (!isManagerKey(password)) {
          const hint = getManagerKey() ? '관리자 키가 일치하지 않습니다.' : '서버에 INQUIRY_MANAGER_KEY가 설정되어 있지 않습니다.';
          return res.status(403).json({ message: hint });
        }
        return res.status(200).json({ status: 'success', mode: 'manager_check' });
      }

      if (!id || !password) return res.status(400).json({ message: '필수 정보 누락' });

      const parsed = await readInquiryList();
      const { foundIdx, target } = findInquiry(parsed, id);

      if (foundIdx === -1) return res.status(404).json({ message: '글을 찾을 수 없습니다.' });

      // 글 비밀번호 재설정은 작성자 비밀번호와 완전히 분리한다.
      // 오직 관리자키(INQUIRY_MANAGER_KEY)로만 허용한다.
      if (newPassword !== undefined) {
        if (!isManagerKey(password)) {
          const hint = getManagerKey() ? '관리자 권한이 필요합니다.' : '서버에 INQUIRY_MANAGER_KEY가 설정되어 있지 않습니다.';
          return res.status(403).json({ message: hint });
        }
        const nextPassword = normalizeKey(newPassword);
        if (nextPassword.length < 4) {
          return res.status(400).json({ message: '새 비밀번호는 4자리 이상 입력해주세요.' });
        }
        target.password = nextPassword;
        target.updatedAt = new Date().toISOString();
        parsed[foundIdx] = target;
        await writeInquiryList(parsed);
        return res.status(200).json({ status: 'success', mode: 'password_reset' });
      }

      if (!canManageInquiry(target, password)) {
        return res.status(403).json({ message: '비밀번호가 틀립니다.' });
      }

      target.title = String(title).substring(0, 100);
      target.content = String(content).substring(0, 2000);
      target.updatedAt = new Date().toISOString();
      parsed[foundIdx] = target;

      await writeInquiryList(parsed);
      return res.status(200).json({ status: 'success' });
    }

    // 4. 문의 삭제 (DELETE)
    if (req.method === 'DELETE') {
      const { id, password } = req.body || {};
      if (!id) return res.status(400).json({ message: '필수 정보 누락' });

      const parsed = await readInquiryList();
      const { foundIdx, target } = findInquiry(parsed, id);

      if (foundIdx === -1) return res.status(404).json({ message: '글을 찾을 수 없습니다.' });

      if (!isLegacyWelcomeInquiry(target)) {
        if (!password) return res.status(400).json({ message: '비밀번호가 필요합니다.' });
        if (!canManageInquiry(target, password)) {
          return res.status(403).json({ message: '비밀번호가 틀립니다.' });
        }
      }

      parsed.splice(foundIdx, 1);
      await writeInquiryList(parsed);
      return res.status(200).json({ status: 'success' });
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (err) {
    console.error('[Inquiry API Error]:', err);
    return res.status(500).json({ status: 'error', message: '서버 오류가 발생했습니다.' });
  }
}
