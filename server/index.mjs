import { createServer } from 'node:http';
import {
  buildCorsHeaders,
  buildHealthPayload,
  createJsonBody,
  getErrorMessage,
  getErrorStatus,
  parseAnalyzeRequest,
  runGeminiAnalysis,
} from './gemini.mjs';

const PORT = Number(process.env.PORT || 8787);

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    ...buildCorsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (req.method === 'OPTIONS') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/gemini/health') {
      sendJson(res, 200, buildHealthPayload());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/gemini/analyze') {
      const rawBody = await readBody(req);
      const prompt = parseAnalyzeRequest(rawBody);
      const payload = await runGeminiAnalysis(prompt);
      sendJson(res, 200, createJsonBody(payload));
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not Found' });
  } catch (error) {
    sendJson(res, getErrorStatus(error), {
      ok: false,
      error: getErrorMessage(error),
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[gemini-proxy] listening on http://127.0.0.1:${PORT}`);
  const health = buildHealthPayload();
  console.log(`[gemini-proxy] model=${health.model} configured=${health.configured ? 'yes' : 'no'}`);
});
