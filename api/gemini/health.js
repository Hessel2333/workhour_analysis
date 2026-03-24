import { buildCorsHeaders, buildHealthPayload } from '../../server/gemini.mjs';

export function GET() {
  return Response.json(buildHealthPayload(), {
    headers: buildCorsHeaders(),
  });
}

export function OPTIONS() {
  return Response.json({ ok: true }, { headers: buildCorsHeaders() });
}
