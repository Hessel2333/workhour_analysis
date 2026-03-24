import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function extractText(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function analyzeWithGemini(prompt) {
  const url = `${GEMINI_API_BASE}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
      },
    }),
  });

  const responseJson = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      responseJson?.error?.message || `Gemini 请求失败，状态码 ${response.status}`;
    throw new Error(message);
  }

  const text = extractText(responseJson);
  if (!text) {
    throw new Error('Gemini 返回为空，未生成可展示文本。');
  }

  return text;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/gemini/health') {
      sendJson(res, 200, {
        ok: true,
        configured: Boolean(GEMINI_API_KEY),
        model: GEMINI_MODEL,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/gemini/analyze') {
      if (!GEMINI_API_KEY) {
        sendJson(res, 503, {
          ok: false,
          error: '未配置 GEMINI_API_KEY。请先在项目根目录创建 .env 并填写 key。',
        });
        return;
      }

      const rawBody = await readBody(req);
      const body = rawBody ? JSON.parse(rawBody) : {};
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';

      if (!prompt) {
        sendJson(res, 400, {
          ok: false,
          error: '请求体缺少 prompt。',
        });
        return;
      }

      const text = await analyzeWithGemini(prompt);
      sendJson(res, 200, {
        ok: true,
        model: GEMINI_MODEL,
        text,
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not Found' });
  } catch (error) {
    sendJson(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : '服务器内部错误',
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[gemini-proxy] listening on http://127.0.0.1:${PORT}`);
  console.log(
    `[gemini-proxy] model=${GEMINI_MODEL} configured=${GEMINI_API_KEY ? 'yes' : 'no'}`,
  );
});
