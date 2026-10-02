import { resolveDirectDownload } from '../../../lib/scraper.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers: noStore }); }

  if (typeof body?.url !== 'string') {
    return Response.json({ error: 'Send a JSON object with a direct link URL.' }, { status: 400, headers: noStore });
  }

  try {
    const finalUrl = await resolveDirectDownload(body.url);
    return Response.json({ url: finalUrl }, { headers: noStore });
  } catch (error) {
    console.error('Direct download resolution failed:', error);
    return Response.json({ error: error.message || 'Unable to resolve the direct download.' }, { status: 502, headers: noStore });
  }
}
