/**
 * Netlify Edge Function – static-import catch-all for all /api/* routes.
 *
 * Dynamic imports can't be bundled by Netlify at build time, so we statically
 * import every handler here. This ensures all api/*.js files are included in
 * the edge function bundle.
 *
 * The api/*.js files use Vercel Edge Runtime format (Web API Request/Response),
 * which is identical to Netlify Edge Functions — they can be called directly.
 */

import acledConflict from '../../api/acled-conflict.js';
import acled from '../../api/acled.js';
import aisSnapshot from '../../api/ais-snapshot.js';
import arxiv from '../../api/arxiv.js';
import cacheTelemetry from '../../api/cache-telemetry.js';
import classifyBatch from '../../api/classify-batch.js';
import classifyEvent from '../../api/classify-event.js';
import climateAnomalies from '../../api/climate-anomalies.js';
import cloudflareOutages from '../../api/cloudflare-outages.js';
import coingecko from '../../api/coingecko.js';
import countryIntel from '../../api/country-intel.js';
import debugEnv from '../../api/debug-env.js';
import earthquakes from '../../api/earthquakes.js';
import etfFlows from '../../api/etf-flows.js';
import faaStatus from '../../api/faa-status.js';
import finnhub from '../../api/finnhub.js';
import firmsFires from '../../api/firms-fires.js';
import fredData from '../../api/fred-data.js';
import fwdstart from '../../api/fwdstart.js';
import gdeltDoc from '../../api/gdelt-doc.js';
import gdeltGeo from '../../api/gdelt-geo.js';
import githubTrending from '../../api/github-trending.js';
import groqSummarize from '../../api/groq-summarize.js';
import hackernews from '../../api/hackernews.js';
import hapi from '../../api/hapi.js';
import macroSignals from '../../api/macro-signals.js';
import ngaWarnings from '../../api/nga-warnings.js';
import ogStory from '../../api/og-story.js';
import openrouterSummarize from '../../api/openrouter-summarize.js';
import opensky from '../../api/opensky.js';
import polymarket from '../../api/polymarket.js';
import riskScores from '../../api/risk-scores.js';
import rssProxy from '../../api/rss-proxy.js';
import serviceStatus from '../../api/service-status.js';
import stablecoinMarkets from '../../api/stablecoin-markets.js';
import stockIndex from '../../api/stock-index.js';
import story from '../../api/story.js';
import techEvents from '../../api/tech-events.js';
import temporalBaseline from '../../api/temporal-baseline.js';
import theaterPosture from '../../api/theater-posture.js';
import ucdpEvents from '../../api/ucdp-events.js';
import ucdp from '../../api/ucdp.js';
import unhcrPopulation from '../../api/unhcr-population.js';
import worldbank from '../../api/worldbank.js';
import worldpopExposure from '../../api/worldpop-exposure.js';
import yahooFinance from '../../api/yahoo-finance.js';

// Route map: URL path segment → handler function
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
const ROUTES: Record<string, Function> = {
    'acled-conflict': acledConflict,
    'acled': acled,
    'ais-snapshot': aisSnapshot,
    'arxiv': arxiv,
    'cache-telemetry': cacheTelemetry,
    'classify-batch': classifyBatch,
    'classify-event': classifyEvent,
    'climate-anomalies': climateAnomalies,
    'cloudflare-outages': cloudflareOutages,
    'coingecko': coingecko,
    'country-intel': countryIntel,
    'debug-env': debugEnv,
    'earthquakes': earthquakes,
    'etf-flows': etfFlows,
    'faa-status': faaStatus,
    'finnhub': finnhub,
    'firms-fires': firmsFires,
    'fred-data': fredData,
    'fwdstart': fwdstart,
    'gdelt-doc': gdeltDoc,
    'gdelt-geo': gdeltGeo,
    'github-trending': githubTrending,
    'groq-summarize': groqSummarize,
    'hackernews': hackernews,
    'hapi': hapi,
    'macro-signals': macroSignals,
    'nga-warnings': ngaWarnings,
    'og-story': ogStory,
    'openrouter-summarize': openrouterSummarize,
    'opensky': opensky,
    'polymarket': polymarket,
    'risk-scores': riskScores,
    'rss-proxy': rssProxy,
    'service-status': serviceStatus,
    'stablecoin-markets': stablecoinMarkets,
    'stock-index': stockIndex,
    'story': story,
    'tech-events': techEvents,
    'temporal-baseline': temporalBaseline,
    'theater-posture': theaterPosture,
    'ucdp-events': ucdpEvents,
    'ucdp': ucdp,
    'unhcr-population': unhcrPopulation,
    'worldbank': worldbank,
    'worldpop-exposure': worldpopExposure,
    'yahoo-finance': yahooFinance,
};

export default async function handler(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    // /api/foo/bar → first segment = 'foo'
    const segment = url.pathname.replace(/^\/api\//, '').split('/')[0] ?? '';
    const fn = ROUTES[segment];

    if (!fn) {
        return new Response(JSON.stringify({ error: `No handler: ${url.pathname}` }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }

    try {
        const response: Response = await fn(request);
        const headers = new Headers(response.headers);
        headers.set('Access-Control-Allow-Origin', '*');
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    } catch (err) {
        console.error(`[NetlifyEdge] Error in ${segment}:`, err);
        return new Response(JSON.stringify({ error: String(err) }), {
            status: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
    }
}

export const config = { path: '/api/*' };
