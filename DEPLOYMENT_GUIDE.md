# Deployment Guide - Global Intelligence Monitor

This guide will help you deploy your own fully functional Global Intelligence Monitor on Vercel for free.

## What Works Without Any API Keys

The following features work **completely free** without any API keys:

| Feature | Data Source | Status |
|---------|-------------|--------|
| Interactive Map | MapLibre GL (open source) | ✅ Works |
| News Feeds | 100+ RSS feeds (proxied) | ✅ Works |
| Earthquake Data | USGS (public API) | ✅ Works |
| GDELT Events | Public API | ✅ Works |
| UCDP Conflict Data | Public API | ✅ Works |
| Weather Data | Open-Meteo (free API) | ✅ Works |
| Crypto Data | CoinGecko (free API) | ✅ Works |
| BTC Hashrate | mempool.space (public) | ✅ Works |
| Fear & Greed Index | alternative.me (public) | ✅ Works |
| Yahoo Finance | Public API (limited) | ✅ Works |
| Browser-side ML | Transformers.js | ✅ Works |

## Optional Free API Keys (Enhanced Features)

These API keys have **generous free tiers** that unlock additional features:

| Service | Free Tier | Feature | Sign Up Link |
|----------|-----------|---------|--------------|
| **Groq** | 14,400 req/day | AI summarization | https://console.groq.com/ |
| **Upstash Redis** | 10K commands/day | Cross-user caching | https://upstash.com/ |
| **OpenRouter** | 50 req/day | AI fallback | https://openrouter.ai/ |
| **Finna Hub** | 60 calls/min | Stock quotes | https://finnhub.io/ |
| **FRED** | 120 req/day | Economic indicators | https://fred.stlouisfed.org/ |
| **EIA** | Free | Oil analytics | https://www.eia.gov/opendata/ |
| **ACLED** | Free for researchers | Protest data | https://acleddata.com/ |
| **NASA FIRMS** | Free | Satellite fire detection | https://firms.modaps.eosdis.nasa.gov/ |

## Quick Deploy (5 Minutes)

### Step 1: Install Dependencies

```bash
cd /Users/jonsmith/Downloads/worldmonitor-main
npm install
```

### Step 2: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 3: Link to Your Vercel Account

```bash
vercel login
```

This will open a browser to authenticate with your Vercel account.

### Step 4: Deploy!

```bash
vercel
```

Follow the prompts:
- **Set up and deploy?** → **Yes**
- **Which scope?** → Select your account
- **Link to existing project?** → **No**
- **Project name** → Enter your preferred name
- **In which directory is your code located?** → Press Enter (current directory)
- **Override settings?** → **No**

Vercel will build and deploy your app. Once done, you'll get a URL like:
```
https://your-project-name.vercel.app
```

### Step 5: Set Up Environment Variables (Optional)

For enhanced features, add API keys in the Vercel dashboard:

1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Add any keys you want from the `.env.example` file

**Recommended free tier keys for full functionality:**
```
GROQ_API_KEY=your_key_here           # AI summarization (14,400 req/day FREE)
UPSTASH_REDIS_REST_URL=your_url      # Caching (10K commands/day FREE)
UPSTASH_REDIS_REST_TOKEN=your_token
```

### Step 6: Production Deploy

```bash
vercel --prod
```

## Custom Domain (Optional)

1. Go to your project in Vercel dashboard
2. Navigate to **Settings** → **Domains**
3. Add your custom domain
4. Update DNS records as instructed

## Features Requiring Optional Setup

### Live Aircraft/Vessel Tracking

For real-time military flights and ship tracking, deploy the Railway relay server:

```bash
# Create a new Railway project
# Deploy: scripts/ais-relay.cjs
# Set these env vars in Vercel:
WS_RELAY_URL=https://your-relay.railway.app
VITE_WS_RELAY_URL=wss://your-relay.railway.app
```

## Troubleshooting

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### Build errors on Vercel
- Make sure you're using Node.js 18+
- Check the Build Logs in Vercel dashboard

### API rate limits
- Free tiers have rate limits
- Add Upstash Redis to cache responses
- The app gracefully handles rate limits with fallbacks

## Completely Free Features Summary

Even with **ZERO API keys**, your dashboard will have:

✅ Interactive global map with 25+ layers
✅ Real-time news from 100+ RSS sources
✅ Earthquake monitoring
✅ Crypto market data
✅ Fear & Greed Index
✅ Weather alerts
✅ GDELT event tracking
✅ UCDP conflict data
✅ Browser-side ML (NER, embeddings)
✅ Map clustering and filtering
✅ Custom keyword monitors
✅ Story sharing with QR codes
✅ All panel configurations

## Next Steps

1. **Deploy now:** Run `vercel` and get your URL
2. **Test locally:** Run `vercel dev` to test with API functions
3. **Add API keys:** Sign up for free tiers (Groq, Upstash)
4. **Customize:** Edit `src/config/variants/` to add your own feeds
5. **Rebrand:** Update `index.html` meta tags with your branding

## License

MIT License - This is your application. Customize it as you wish!
