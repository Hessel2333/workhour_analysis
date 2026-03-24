import {
  buildCorsHeaders,
  createJsonBody,
  getErrorMessage,
  getErrorStatus,
  parseAnalyzeRequest,
  runGeminiAnalysis,
} from '../../server/gemini.mjs';

export const maxDuration = 30;

export async function POST(request) {
  try {
    const rawBody = await request.text();
    const prompt = parseAnalyzeRequest(rawBody);
    const payload = await runGeminiAnalysis(prompt, { signal: request.signal });

    return Response.json(createJsonBody(payload), {
      headers: buildCorsHeaders(),
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: getErrorMessage(error),
      },
      {
        status: getErrorStatus(error),
        headers: buildCorsHeaders(),
      },
    );
  }
}

export function OPTIONS() {
  return Response.json({ ok: true }, { headers: buildCorsHeaders() });
}
