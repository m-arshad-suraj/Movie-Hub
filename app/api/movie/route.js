import { getSourceUrl, scrapeMovie } from '../../../lib/scraper.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

export async function POST(request) {
  let body;
  try { body = await request.json(); }
  catch { return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400, headers: noStore }); }

  if (!body || !Number.isSafeInteger(body.topic) || body.topic <= 0) {
    return Response.json({ error: 'Send a JSON object with one positive integer topic ID.' }, { status: 400, headers: noStore });
  }

  try {
    const movie = await scrapeMovie(getSourceUrl(), body.topic);
    if (movie.downloads.length === 0) {
      return Response.json({ error: 'No download links were found for this topic.' }, { status: 404, headers: noStore });
    }
    return Response.json(movie, { headers: noStore });
  } catch (error) {
    console.error('Movie scrape failed:', error);
    return Response.json({ error: error.message || 'Unable to scrape movie.' }, { status: 502, headers: noStore });
  }
}
