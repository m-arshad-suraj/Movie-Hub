import { load } from 'cheerio';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

export function getSourceUrl() {
  const sourceUrl = process.env.SOURCE_URL?.trim();
  if (!sourceUrl) throw new Error('SOURCE_URL is not configured.');
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { throw new Error('SOURCE_URL must be a valid absolute URL.'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('SOURCE_URL must use HTTP or HTTPS.');
  return sourceUrl;
}

async function getHtml(url) {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000), cache: 'no-store' });
  if (!response.ok) throw new Error(`Source returned ${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

export async function resolveDirectDownload(url) {
  const initialUrl = new URL(url);
  if (!['http:', 'https:'].includes(initialUrl.protocol)) throw new Error('Direct link must use HTTP or HTTPS.');

  const firstPage = load(await getHtml(initialUrl.href));
  const continueLink = findLink(firstPage, text => text.toLowerCase().includes('continue to destination'));
  if (!continueLink) throw new Error('Could not find the “Continue to Destination” button.');

  const destinationUrl = new URL(continueLink, initialUrl).href;
  const destinationPage = load(await getHtml(destinationUrl));
  const directLink = findLink(destinationPage, text => /\[M1\]\s*DIRECT/i.test(text));
  if (!directLink) throw new Error('Could not find the “[M1] DIRECT” button.');

  return new URL(directLink, destinationUrl).href;
}

function findLink($, matchesText) {
  let href = '';
  $('a[href], button').each((_, element) => {
    if (href) return;
    const node = $(element);
    if (!matchesText(node.text().trim())) return;
    const candidate = node.attr('href') || node.attr('data-href') || node.attr('data-url') || '';
    if (candidate) href = candidate;
  });
  return href;
}

export async function scrapeTopics(sourceUrl) {
  const $ = load(await getHtml(sourceUrl));
  const topics = [];
  $('a[href]').each((_, anchor) => {
    const href = $(anchor).attr('href') || '';
    const match = href.match(/\/forums\/topic\/(\d+)/);
    if (!match) return;
    const topicId = Number(match[1]);
    if (Number.isSafeInteger(topicId) && Math.floor(topicId / 100000) >= 1) topics.push(topicId);
  });
  return [...new Set(topics)];
}

export async function scrapeMovie(sourceUrl, topicId) {
  const parsedUrl = new URL(sourceUrl);
  const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/$/, '')}`;
  const url = `${baseUrl.replace(/\/$/, '')}/index.php?/forums/topic/${topicId}-0`;
  const $ = load(await getHtml(url));
  const content = $('[data-role="commentContent"]').first();
  const movie = { topicId, title: $('h1.ipsType_pageTitle').first().text().trim(), imageUrl: '', downloads: [] };
  const image = content.find('img').first();
  const imagePath = image.attr('src') || image.attr('data-src') || '';
  try { movie.imageUrl = imagePath ? new URL(imagePath, url).href : ''; } catch { movie.imageUrl = imagePath; }

  const elements = [];
  content.find('strong, a').each((_, element) => {
    const node = $(element);
    if (node.is('strong')) {
      const text = node.text().trim();
      if ((text.includes('GB') || text.includes('MB')) && text.includes('-')) elements.push({ type: 'label', value: text });
    } else {
      const href = node.attr('href') || '';
      let link = href;
      if (href && !href.startsWith('magnet:')) {
        try { link = new URL(href, url).href; } catch { /* Keep the scraped href as-is. */ }
      }
      const isDirectLink = node.hasClass('download-button') || node.text().trim().toUpperCase() === 'DIRECT LINK';
      elements.push({ type: 'link', value: link, directLink: isDirectLink });
    }
  });

  let label = '';
  let download = { label: '', magnet: '', torrent: '', directLink: '' };
  for (const element of elements) {
    if (element.type === 'label') {
      if (label && download.magnet) movie.downloads.push({ ...download, label });
      label = element.value;
      download = { label: '', magnet: '', torrent: '', directLink: '' };
    } else if (element.value.startsWith('magnet:')) download.magnet = element.value;
    else if (element.value.includes('.torrent') || element.value.includes('attachment.php')) download.torrent = element.value;
    else if (element.directLink && /^https?:\/\//i.test(element.value)) download.directLink = element.value;
  }
  if (label && download.magnet) movie.downloads.push({ ...download, label });
  return movie;
}
