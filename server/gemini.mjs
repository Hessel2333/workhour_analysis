function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function extractText(responseJson) {
  const parts = responseJson?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part?.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function buildCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  };
}

export function getGeminiConfig() {
  return {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    apiBase:
      process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta',
  };
}

export function buildHealthPayload() {
  const config = getGeminiConfig();
  return {
    ok: true,
    configured: Boolean(config.apiKey),
    model: config.model,
  };
}

export function parseAnalyzeRequest(rawBody) {
  let body = {};

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody);
      body = parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      throw createHttpError(400, '请求体必须是合法 JSON。');
    }
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    throw createHttpError(400, '请求体缺少 prompt。');
  }

  return prompt;
}

export async function runGeminiAnalysis(prompt, options = {}) {
  const config = getGeminiConfig();
  if (!config.apiKey) {
    throw createHttpError(
      503,
      '未配置 GEMINI_API_KEY。请在本地 .env 或 Vercel 项目环境变量中填写 key。',
    );
  }

  const url = `${config.apiBase}/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
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
    signal: options.signal,
  });

  const responseJson = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      responseJson?.error?.message || `Gemini 请求失败，状态码 ${response.status}`;
    throw createHttpError(response.status || 502, message);
  }

  const text = extractText(responseJson);
  if (!text) {
    throw createHttpError(502, 'Gemini 返回为空，未生成可展示文本。');
  }

  return {
    model: config.model,
    text,
  };
}

export function createJsonBody(payload) {
  return {
    ok: true,
    ...payload,
  };
}

export function getErrorStatus(error) {
  return typeof error?.statusCode === 'number' ? error.statusCode : 500;
}

export function getErrorMessage(error) {
  return error instanceof Error ? error.message : '服务器内部错误';
}
