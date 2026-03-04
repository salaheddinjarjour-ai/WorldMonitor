import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import pkg from './package.json';

const VARIANT_META: Record<string, {
  title: string;
  description: string;
  keywords: string;
  url: string;
  siteName: string;
  features: string[];
}> = {
  world: {
    title: 'World Monitor - Real-Time Global Intelligence Dashboard',
    description: 'Real-time global intelligence dashboard with live news, markets, military tracking, infrastructure monitoring, and geopolitical data. OSINT in one view.',
    keywords: 'global intelligence, geopolitical dashboard, world news, market data, military bases, nuclear facilities, undersea cables, conflict zones, real-time monitoring, situation awareness, OSINT, flight tracking, AIS ships, earthquake monitor, protest tracker, power outages, oil prices, government spending, polymarket predictions',
    url: 'https://worldmonitor.app/',
    siteName: 'World Monitor',
    features: [
      'Real-time news aggregation',
      'Stock market tracking',
      'Military flight monitoring',
      'Ship AIS tracking',
      'Earthquake alerts',
      'Protest tracking',
      'Power outage monitoring',
      'Oil price analytics',
      'Government spending data',
      'Prediction markets',
      'Infrastructure monitoring',
      'Geopolitical intelligence',
    ],
  },
  tech: {
    title: 'Tech Monitor - Real-Time AI & Tech Industry Dashboard',
    description: 'Real-time AI and tech industry dashboard tracking tech giants, AI labs, startup ecosystems, funding rounds, and tech events worldwide.',
    keywords: 'tech dashboard, AI industry, startup ecosystem, tech companies, AI labs, venture capital, tech events, tech conferences, cloud infrastructure, datacenters, tech layoffs, funding rounds, unicorns, FAANG, tech HQ, accelerators, Y Combinator, tech news',
    url: 'https://tech.worldmonitor.app/',
    siteName: 'Tech Monitor',
    features: [
      'Tech news aggregation',
      'AI lab tracking',
      'Startup ecosystem mapping',
      'Tech HQ locations',
      'Conference & event calendar',
      'Cloud infrastructure monitoring',
      'Datacenter mapping',
      'Tech layoff tracking',
      'Funding round analytics',
      'Tech stock tracking',
      'Service status monitoring',
    ],
  },
};

function htmlVariantPlugin(): Plugin {
  const variant = process.env.VITE_VARIANT || 'world';
  const meta = VARIANT_META[variant] || VARIANT_META.world;

  return {
    name: 'html-variant',
    transformIndexHtml(html) {
      return html
        .replace(/<title>.*?<\/title>/, `<title>${meta.title}</title>`)
        .replace(/<meta name="title" content=".*?" \/>/, `<meta name="title" content="${meta.title}" />`)
        .replace(/<meta name="description" content=".*?" \/>/, `<meta name="description" content="${meta.description}" />`)
        .replace(/<meta name="keywords" content=".*?" \/>/, `<meta name="keywords" content="${meta.keywords}" />`)
        .replace(/<link rel="canonical" href=".*?" \/>/, `<link rel="canonical" href="${meta.url}" />`)
        .replace(/<meta name="application-name" content=".*?" \/>/, `<meta name="application-name" content="${meta.siteName}" />`)
        .replace(/<meta property="og:url" content=".*?" \/>/, `<meta property="og:url" content="${meta.url}" />`)
        .replace(/<meta property="og:title" content=".*?" \/>/, `<meta property="og:title" content="${meta.title}" />`)
        .replace(/<meta property="og:description" content=".*?" \/>/, `<meta property="og:description" content="${meta.description}" />`)
        .replace(/<meta property="og:site_name" content=".*?" \/>/, `<meta property="og:site_name" content="${meta.siteName}" />`)
        .replace(/<meta name="twitter:url" content=".*?" \/>/, `<meta name="twitter:url" content="${meta.url}" />`)
        .replace(/<meta name="twitter:title" content=".*?" \/>/, `<meta name="twitter:title" content="${meta.title}" />`)
        .replace(/<meta name="twitter:description" content=".*?" \/>/, `<meta name="twitter:description" content="${meta.description}" />`)
        .replace(/"name": "World Monitor"/, `"name": "${meta.siteName}"`)
        .replace(/"alternateName": "WorldMonitor"/, `"alternateName": "${meta.siteName.replace(' ', '')}"`)
        .replace(/"url": "https:\/\/worldmonitor\.app\/"/, `"url": "${meta.url}"`)
        .replace(/"description": "Real-time global intelligence dashboard with live news, markets, military tracking, infrastructure monitoring, and geopolitical data."/, `"description": "${meta.description}"`)
        .replace(/"featureList": \[[\s\S]*?\]/, `"featureList": ${JSON.stringify(meta.features, null, 8).replace(/\n/g, '\n      ')}`);
    },
  };
}

function youtubeLivePlugin(): Plugin {
  const cache = new Map<string, { videoId: string | null; ts: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  return {
    name: 'youtube-live',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/youtube/live')) {
          return next();
        }

        const url = new URL(req.url, 'http://localhost');
        const channel = url.searchParams.get('channel');

        if (!channel) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Missing channel parameter' }));
          return;
        }

        // Serve from cache
        const cached = cache.get(channel);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.end(JSON.stringify({ videoId: cached.videoId, channel, cached: true }));
          return;
        }

        try {
          const handle = channel.startsWith('@') ? channel : `@${channel}`;
          const liveUrl = `https://www.youtube.com/${handle}/live`;

          const response = await fetch(liveUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(8000),
          });

          let videoId: string | null = null;

          if (response.ok) {
            const html = await response.text();
            // Extract video ID - look for canonical URL first (most reliable)
            const canonicalMatch = html.match(/\"canonical\":\"https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})\"/);
            const videoIdMatch = html.match(/\"videoId\":\"([a-zA-Z0-9_-]{11})\"/);
            const isLive = html.includes('"isLive":true') || html.includes('"isLiveNow":true');

            if (canonicalMatch && isLive) {
              videoId = canonicalMatch[1]!;
            } else if (videoIdMatch && isLive) {
              videoId = videoIdMatch[1]!;
            }
          }

          cache.set(channel, { videoId, ts: Date.now() });

          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'public, max-age=300');
          res.end(JSON.stringify({ videoId, channel, isLive: !!videoId }));
        } catch (error) {
          console.error(`[YouTube Live] Error for ${channel}:`, error);
          cache.set(channel, { videoId: null, ts: Date.now() });
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ videoId: null, channel, error: 'fetch failed' }));
        }
      });
    },
  };
}

/**
 * iptvStreamPlugin – scrapes elahmad.com to get fresh (token-based) HLS stream URLs.
 * Cached for 25 min to stay under elahmad.com token expiry (~30 min).
 */
function iptvStreamPlugin(): Plugin {
  const cache = new Map<string, { url: string; ts: number }>();
  const CACHE_TTL = 25 * 60 * 1000; // 25 minutes

  // Map channel id → elahmad.com page to scrape
  const CHANNEL_PAGES: Record<string, string> = {
    aljadeed: 'https://www.elahmad.com/tv/watchtv.php?id=aljadeed',
  };

  return {
    name: 'iptv-stream',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/iptv-stream')) return next();

        const url = new URL(req.url, 'http://localhost');
        const channel = url.searchParams.get('channel') ?? '';
        const pageUrl = CHANNEL_PAGES[channel];

        if (!pageUrl) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Unknown channel', channel }));
          return;
        }

        // Serve from cache
        const cached = cache.get(channel);
        if (cached && Date.now() - cached.ts < CACHE_TTL) {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ streamUrl: cached.url, channel, cached: true }));
          return;
        }

        try {
          const html = await fetch(pageUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              'Referer': 'https://www.elahmad.com/',
            },
            signal: AbortSignal.timeout(10000),
          }).then(r => r.text());

          // Extract m3u8 URL (elahmad embeds it as a plain string in the HTML/JS)
          const m3u8Match = html.match(/https?:\/\/[^"'\s<>]+?\.m3u8[^"'\s<>]*/);
          const streamUrl = m3u8Match?.[0] ?? null;

          if (streamUrl) {
            cache.set(channel, { url: streamUrl, ts: Date.now() });
            console.log(`[IPTVStream] Resolved ${channel}: ${streamUrl.substring(0, 70)}...`);
          }

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ streamUrl, channel }));
        } catch (err) {
          console.error(`[IPTVStream] Error for ${channel}:`, err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ streamUrl: null, channel, error: 'scrape failed' }));
        }
      });
    },
  };
}

/**
 * vercelApiPlugin – dev-mode middleware that executes api/*.js Vercel Edge handlers.
 *
 * Vercel serverless functions use the Web API (Request / Response) and cannot be
 * executed directly by the Vite dev server, which would otherwise serve them as
 * plain static JS text (causing JSON parse errors in every panel).
 *
 * This plugin:
 *  1. Intercepts any /api/* request not already handled by proxies or the YouTube plugin.
 *  2. Derives the handler file path from the URL (e.g. /api/risk-scores → api/risk-scores.js).
 *  3. Dynamically imports and calls the default-export handler with a proper Request object.
 *  4. Streams the Web API Response back as a Node.js http response.
 */
function vercelApiPlugin(): Plugin {
  return {
    name: 'vercel-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';

        // Only handle /api/* routes
        if (!url.startsWith('/api/')) return next();

        // Already handled by other plugins / proxies – skip known proxy prefixes
        const alreadyProxied = [
          '/api/youtube/live',
          '/api/yahoo', '/api/coingecko', '/api/polymarket',
          '/api/earthquake', '/api/pizzint', '/api/fred-data',
          '/api/cloudflare-radar', '/api/nga-msi', '/api/acled',
          '/api/gdelt-geo', '/api/gdelt', '/api/faa',
          '/api/opensky', '/api/adsb-exchange',
        ];
        if (alreadyProxied.some(p => url.startsWith(p))) return next();

        // Derive the handler file: /api/foo/bar?x=1 → api/foo/bar.js
        const withoutQuery = url.split('?')[0]!;
        const segments = withoutQuery.replace(/^\/api\//, '').split('/');

        // Try exact path first, then sub-directory index
        const candidatePaths = [
          resolve(__dirname, 'api', ...segments) + '.js',
          resolve(__dirname, 'api', ...segments, 'index.js'),
        ];

        let handlerPath: string | null = null;
        for (const p of candidatePaths) {
          try {
            const { existsSync } = await import('fs');
            if (existsSync(p)) { handlerPath = p; break; }
          } catch { /* ignore */ }
        }

        if (!handlerPath) return next(); // No matching handler — let Vite handle

        try {
          // Build a proper Web API Request for the handler
          const fullUrl = `http://localhost${url}`;
          let bodyBuf: ArrayBuffer | undefined;

          if (req.method !== 'GET' && req.method !== 'HEAD') {
            const rawBuf = await new Promise<Buffer>((resolve, reject) => {
              const chunks: Buffer[] = [];
              req.on('data', (c: Buffer) => chunks.push(c));
              req.on('end', () => resolve(Buffer.concat(chunks)));
              req.on('error', reject);
            });
            bodyBuf = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength) as ArrayBuffer;
          }

          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
          }

          const request = new Request(fullUrl, {
            method: req.method ?? 'GET',
            headers,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: bodyBuf as any,
          });

          // Dynamic import with cache-bust so Vite picks up edits
          const mod = await import(`${handlerPath}?t=${Date.now()}`);
          const handler = mod.default ?? mod.handler;

          if (typeof handler !== 'function') {
            return next();
          }

          const response: Response = await handler(request);

          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));

          const buf = Buffer.from(await response.arrayBuffer());
          res.end(buf);
        } catch (err) {
          console.error(`[VercelAPI] Error executing ${req.url}:`, err);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Dev server handler error', detail: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [htmlVariantPlugin(), youtubeLivePlugin(), iptvStreamPlugin(), vercelApiPlugin()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('/@xenova/transformers/') || id.includes('/onnxruntime-web/')) {
              return 'ml';
            }
            if (id.includes('/@deck.gl/') || id.includes('/maplibre-gl/') || id.includes('/h3-js/')) {
              return 'map';
            }
            if (id.includes('/d3/')) {
              return 'd3';
            }
            if (id.includes('/topojson-client/')) {
              return 'topojson';
            }
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      // Yahoo Finance API
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
      },
      // CoinGecko API
      '/api/coingecko': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => {
          const idx = path.indexOf('?');
          const qs = idx >= 0 ? path.substring(idx) : '';
          const params = new URLSearchParams(qs);
          if (params.get('endpoint') === 'markets') {
            params.delete('endpoint');
            const vs = params.get('vs_currencies') || 'usd';
            params.delete('vs_currencies');
            params.set('vs_currency', vs);
            params.set('sparkline', 'true');
            params.set('order', 'market_cap_desc');
            return `/api/v3/coins/markets?${params.toString()}`;
          }
          return `/api/v3/simple/price${qs}`;
        },
      },
      // Polymarket API
      '/api/polymarket': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/polymarket/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Polymarket proxy error:', err.message);
          });
        },
      },
      // USGS Earthquake API
      '/api/earthquake': {
        target: 'https://earthquake.usgs.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/earthquake/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('Earthquake proxy error:', err.message);
          });
        },
      },
      // PizzINT - Pentagon Pizza Index
      '/api/pizzint': {
        target: 'https://www.pizzint.watch',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pizzint/, '/api'),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('PizzINT proxy error:', err.message);
          });
        },
      },
      // FRED Economic Data - handled by Vercel serverless function in prod
      // In dev, we proxy to the API directly with the key from .env
      '/api/fred-data': {
        target: 'https://api.stlouisfed.org',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL(path, 'http://localhost');
          const seriesId = url.searchParams.get('series_id');
          const start = url.searchParams.get('observation_start');
          const end = url.searchParams.get('observation_end');
          const apiKey = process.env.FRED_API_KEY || '';
          return `/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10${start ? `&observation_start=${start}` : ''}${end ? `&observation_end=${end}` : ''}`;
        },
      },
      // RSS Feeds - BBC
      '/rss/bbc': {
        target: 'https://feeds.bbci.co.uk',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/bbc/, ''),
      },
      // RSS Feeds - Guardian
      '/rss/guardian': {
        target: 'https://www.theguardian.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/guardian/, ''),
      },
      // RSS Feeds - NPR
      '/rss/npr': {
        target: 'https://feeds.npr.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/npr/, ''),
      },
      // RSS Feeds - AP News
      '/rss/apnews': {
        target: 'https://rsshub.app/apnews',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/apnews/, ''),
      },
      // RSS Feeds - Al Jazeera
      '/rss/aljazeera': {
        target: 'https://www.aljazeera.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/aljazeera/, ''),
      },
      // RSS Feeds - CNN
      '/rss/cnn': {
        target: 'http://rss.cnn.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/cnn/, ''),
      },
      // RSS Feeds - Hacker News
      '/rss/hn': {
        target: 'https://hnrss.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/hn/, ''),
      },
      // RSS Feeds - Ars Technica
      '/rss/arstechnica': {
        target: 'https://feeds.arstechnica.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/arstechnica/, ''),
      },
      // RSS Feeds - The Verge
      '/rss/verge': {
        target: 'https://www.theverge.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/verge/, ''),
      },
      // RSS Feeds - CNBC
      '/rss/cnbc': {
        target: 'https://www.cnbc.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/cnbc/, ''),
      },
      // RSS Feeds - MarketWatch
      '/rss/marketwatch': {
        target: 'https://feeds.marketwatch.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/marketwatch/, ''),
      },
      // RSS Feeds - Defense/Intel sources
      '/rss/defenseone': {
        target: 'https://www.defenseone.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/defenseone/, ''),
      },
      '/rss/warontherocks': {
        target: 'https://warontherocks.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/warontherocks/, ''),
      },
      '/rss/breakingdefense': {
        target: 'https://breakingdefense.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/breakingdefense/, ''),
      },
      '/rss/bellingcat': {
        target: 'https://www.bellingcat.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/bellingcat/, ''),
      },
      // RSS Feeds - TechCrunch (layoffs)
      '/rss/techcrunch': {
        target: 'https://techcrunch.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/techcrunch/, ''),
      },
      // Google News RSS
      '/rss/googlenews': {
        target: 'https://news.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/googlenews/, ''),
      },
      // AI Company Blogs
      '/rss/openai': {
        target: 'https://openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/openai/, ''),
      },
      '/rss/anthropic': {
        target: 'https://www.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/anthropic/, ''),
      },
      '/rss/googleai': {
        target: 'https://blog.google',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/googleai/, ''),
      },
      '/rss/deepmind': {
        target: 'https://deepmind.google',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/deepmind/, ''),
      },
      '/rss/huggingface': {
        target: 'https://huggingface.co',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/huggingface/, ''),
      },
      '/rss/techreview': {
        target: 'https://www.technologyreview.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/techreview/, ''),
      },
      '/rss/arxiv': {
        target: 'https://rss.arxiv.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/arxiv/, ''),
      },
      // Government
      '/rss/whitehouse': {
        target: 'https://www.whitehouse.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/whitehouse/, ''),
      },
      '/rss/statedept': {
        target: 'https://www.state.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/statedept/, ''),
      },
      '/rss/state': {
        target: 'https://www.state.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/state/, ''),
      },
      '/rss/defense': {
        target: 'https://www.defense.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/defense/, ''),
      },
      '/rss/justice': {
        target: 'https://www.justice.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/justice/, ''),
      },
      '/rss/cdc': {
        target: 'https://tools.cdc.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/cdc/, ''),
      },
      '/rss/fema': {
        target: 'https://www.fema.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/fema/, ''),
      },
      '/rss/dhs': {
        target: 'https://www.dhs.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/dhs/, ''),
      },
      '/rss/fedreserve': {
        target: 'https://www.federalreserve.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/fedreserve/, ''),
      },
      '/rss/sec': {
        target: 'https://www.sec.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/sec/, ''),
      },
      '/rss/treasury': {
        target: 'https://home.treasury.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/treasury/, ''),
      },
      '/rss/cisa': {
        target: 'https://www.cisa.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/cisa/, ''),
      },
      // Think Tanks
      '/rss/brookings': {
        target: 'https://www.brookings.edu',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/brookings/, ''),
      },
      '/rss/cfr': {
        target: 'https://www.cfr.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/cfr/, ''),
      },
      '/rss/csis': {
        target: 'https://www.csis.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/csis/, ''),
      },
      // Defense
      '/rss/warzone': {
        target: 'https://www.thedrive.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/warzone/, ''),
      },
      '/rss/defensegov': {
        target: 'https://www.defense.gov',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/defensegov/, ''),
      },
      // Security
      '/rss/krebs': {
        target: 'https://krebsonsecurity.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/krebs/, ''),
      },
      // Finance
      '/rss/yahoonews': {
        target: 'https://finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/yahoonews/, ''),
      },
      // Diplomat
      '/rss/diplomat': {
        target: 'https://thediplomat.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/diplomat/, ''),
      },
      // VentureBeat
      '/rss/venturebeat': {
        target: 'https://venturebeat.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/venturebeat/, ''),
      },
      // Foreign Policy
      '/rss/foreignpolicy': {
        target: 'https://foreignpolicy.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/foreignpolicy/, ''),
      },
      // Financial Times
      '/rss/ft': {
        target: 'https://www.ft.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/ft/, ''),
      },
      // Reuters
      '/rss/reuters': {
        target: 'https://www.reutersagency.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rss\/reuters/, ''),
      },
      // Cloudflare Radar - Internet outages
      '/api/cloudflare-radar': {
        target: 'https://api.cloudflare.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/cloudflare-radar/, ''),
      },
      // NGA Maritime Safety Information - Navigation Warnings
      '/api/nga-msi': {
        target: 'https://msi.nga.mil',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/nga-msi/, ''),
      },
      // ACLED - Armed Conflict Location & Event Data (protests, riots)
      '/api/acled': {
        target: 'https://acleddata.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/acled/, ''),
      },
      // GDELT GEO 2.0 API - Geolocation endpoint (must come before /api/gdelt)
      '/api/gdelt-geo': {
        target: 'https://api.gdeltproject.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gdelt-geo/, '/api/v2/geo/geo'),
      },
      // GDELT GEO 2.0 API - Global event data
      '/api/gdelt': {
        target: 'https://api.gdeltproject.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/gdelt/, ''),
      },
      // AISStream WebSocket proxy for live vessel tracking
      '/ws/aisstream': {
        target: 'wss://stream.aisstream.io',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/ws\/aisstream/, ''),
      },
      // FAA NASSTATUS - Airport delays and closures
      '/api/faa': {
        target: 'https://nasstatus.faa.gov',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/faa/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('FAA NASSTATUS proxy error:', err.message);
          });
        },
      },
      // OpenSky Network - Aircraft tracking (military flight detection)
      '/api/opensky': {
        target: 'https://opensky-network.org/api',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/opensky/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('OpenSky proxy error:', err.message);
          });
        },
      },
      // ADS-B Exchange - Military aircraft tracking (backup/supplement)
      '/api/adsb-exchange': {
        target: 'https://adsbexchange.com/api',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/adsb-exchange/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('ADS-B Exchange proxy error:', err.message);
          });
        },
      },
    },
  },
});
