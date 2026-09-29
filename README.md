# Movie Hub

Movie Hub is a Next.js movie library. Scraping runs on the server in two Next.js API routes; the browser does not call the old Go endpoints.

## Run locally

1. Install Node.js 20 or later.
2. Install packages with `npm install`.
3. Copy `.env.example` to `.env.local` and set `SOURCE_URL`, the required `MOVIE_WORKER_COUNT`, and `DEFAULT_TOPIC_COUNT` if users will open the site without a `count` query parameter. `.env.local` is ignored by Git. For PowerShell:

   ```powershell
   $env:SOURCE_URL = "https://your-forum.example/"
   $env:DEFAULT_TOPIC_COUNT = "25"
   $env:MOVIE_WORKER_COUNT = "25"
   npm run dev
   ```

4. Open `http://localhost:3000/?count=25`; the page automatically scans. When `count` is omitted, `DEFAULT_TOPIC_COUNT` is required. If neither is set, the page reports a configuration error.

The source site must be reachable from the Next.js server and should expose links containing `/forums/topic/<numeric-id>`. Topic pages are fetched at `<source-url>/index.php?/forums/topic/<id>-0`, matching the previous Go scraper. IDs below 100000 are ignored. Detail pages use `h1.ipsType_pageTitle` for the title and `[data-role="commentContent"]` for the image and download details. Movies without a magnet download are not included.

## Deploy to Netlify

Import this folder as a Netlify site. The included `netlify.toml` builds the Next.js app with Netlify's Next.js plugin. In **Site configuration → Environment variables**, set `SOURCE_URL`, required `MOVIE_WORKER_COUNT`, and `DEFAULT_TOPIC_COUNT` if visitors may arrive without a `count` query parameter, then deploy. The source URL is only read by server-side routes and is not exposed in the browser.

The API routes are `GET /api/topics`, which returns an array of topic IDs, and `POST /api/movie`, which accepts one topic such as `{ "topic": 123456 }` and returns one scraped movie object. Download entries include a label and any available magnet, torrent, and direct links. On page load, the UI calls the topics route, takes the first `count` IDs from the query string when present or from `DEFAULT_TOPIC_COUNT` otherwise, then requests `/api/movie` using the configured `MOVIE_WORKER_COUNT` concurrency. Each successful movie is added to the grid as soon as its request completes. If a required configuration value is missing or invalid, the page reports an error. Movie results are not persisted or merged with older scans; API fetches and responses disable caching. Netlify runs the scraper server-side, so it must be able to reach the source website.
