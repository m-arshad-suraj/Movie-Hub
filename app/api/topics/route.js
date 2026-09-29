import { getSourceUrl, scrapeTopics } from '../../../lib/scraper.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store, max-age=0' };

export async function GET() {
  try {
    const topics = await scrapeTopics(getSourceUrl());
    return Response.json(topics, { headers: noStore });
  } catch (error) {
    console.error('Topic scrape failed:', error);
    return Response.json({ error: error.message || 'Unable to scrape topics.' }, { status: 502, headers: noStore });
  }
}
