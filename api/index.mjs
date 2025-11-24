// Load environment variables first
import 'dotenv/config';

// Core imports
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

// eBay client
import { searchEbayVinyl } from '../ebayClient.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();


// ===================================================================
// eBay Search page (debug/demo)
// ===================================================================
app.get('/api/ebay/search', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).send('Missing q query parameter');

  try {
    const items = await searchEbayVinyl(q, 20);
    return res.render('ebay-results', { query: q, items });
  } catch (err) {
    console.error('eBay search failed:', err);
    return res.status(500).send('eBay search failed');
  }
});


// ===================================================================
// Discogs config & Curated Picks
// ===================================================================
const DISCOGS_TOKEN =
  process.env.DISCOGS_TOKEN ||
  'ZsXMxGGPWnzyycHnrimUVViCQWAtustyttiVrHXz';

const CURATED_BASE = [
  {
    slug: 'the-stone-roses',
    title: 'The Stone Roses',
    artist: 'The Stone Roses',
    note: 'Original 1989-style pressing',
    masterId: 12458,
    linkUrl: 'https://www.discogs.com/master/12458'
  },
  {
    slug: 'turns-into-stone',
    title: 'Turns Into Stone',
    artist: 'The Stone Roses',
    note: 'Essential compilation of early singles',
    masterId: 12763,
    linkUrl: 'https://www.discogs.com/master/12763'
  },
  {
    slug: 'screamadelica',
    title: 'Screamadelica',
    artist: 'Primal Scream',
    note: 'Mani’s other spiritual home',
    masterId: 28274,
    linkUrl: 'https://www.discogs.com/master/28274'
  },
  {
    slug: 'pills-n-thrills',
    title: "Pills 'n' Thrills and Bellyaches",
    artist: 'Happy Mondays',
    note: 'Madchester in full technicolor',
    masterId: 10610,
    linkUrl: 'https://www.discogs.com/master/10610'
  }
];

let curatedCache = null;

function fetchDiscogsMasterImage(masterId) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.discogs.com',
      path: `/masters/${masterId}`,
      method: 'GET',
      headers: {
        'User-Agent': 'FindAnyVinylApp/1.0',
        Authorization: `Discogs token=${DISCOGS_TOKEN}`
      }
    };

    let body = '';

    const req = https.request(options, (res) => {
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          const img = json.images && json.images[0];
          resolve(img ? img.uri || img.resource_url : null);
        } catch (e) {
          console.error('Error parsing Discogs master JSON', masterId, e);
          resolve(null);
        }
      });
    });

    req.on('error', (err) => {
      console.error('Discogs master fetch error', masterId, err);
      resolve(null);
    });

    req.end();
  });
}

async function getCuratedPicks() {
  if (curatedCache) return curatedCache;

  const picks = await Promise.all(
    CURATED_BASE.map(async (base) => {
      const coverUrl = await fetchDiscogsMasterImage(base.masterId);
      return { ...base, coverUrl };
    })
  );

  curatedCache = picks;
  return picks;
}


// ===================================================================
// View engine
// ===================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));


// ===================================================================
// Static files
// ===================================================================
app.use(express.static(path.join(__dirname, '../public')));


// ===================================================================
// Home route
// ===================================================================
app.get('/', async (req, res) => {
  const curatedPicks = await getCuratedPicks();

  res.render('index', {
    result: null,
    ebayResults: [],
    query: '',
    curatedPicks
  });
});


// ===================================================================
// Search route (Discogs + NEW eBay integration)
// ===================================================================
app.get('/search', async (req, res) => {
  const query = (req.query.query || '').trim();
  if (!query) return res.redirect('/');

  const curatedPicks = await getCuratedPicks();

  // Discogs request options
  const options = {
    hostname: 'api.discogs.com',
    path: `/database/search?q=${encodeURIComponent(
      query
    )}&format=vinyl&type=release&token=${DISCOGS_TOKEN}`,
    method: 'GET',
    headers: { 'User-Agent': 'FindAnyVinylApp/1.0' }
  };

  let data = '';

  const request = https.request(options, async (response) => {
    response.on('data', (chunk) => (data += chunk));

    response.on('end', async () => {
      try {
        const resultJson = JSON.parse(data);

        const vinyls = (resultJson.results || []).map((r) => ({
          title: r.title,
          thumb: r.cover_image || r.thumb || '',
          year: r.year || '',
          format: Array.isArray(r.format) ? r.format[0] : '',
          label: Array.isArray(r.label) ? r.label[0] : '',
          url: r.uri || '#'
        }));

        // Fetch eBay results in parallel
        let ebayResults = [];
        try {
          ebayResults = await searchEbayVinyl(query, 20);
        } catch (e) {
          console.error('eBay fetch error:', e);
          ebayResults = [];
        }

        return res.render('index', {
          result: vinyls,
          ebayResults,
          query,
          curatedPicks
        });

      } catch (err) {
        console.error('Error parsing Discogs JSON:', err);

        return res.render('index', {
          result: [],
          ebayResults: [],
          query,
          curatedPicks
        });
      }
    });
  });

  request.on('error', (error) => {
    console.error('Discogs API error:', error);
    return res.render('index', {
      result: [],
      ebayResults: [],
      query,
      curatedPicks
    });
  });

  request.end();
});


// ===================================================================
// Static: sitemap + robots
// ===================================================================
app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/robots.txt'));
});

// ============================
// Genre browsing route
// ============================
app.get('/genre/:slug', async (req, res) => {
  const slug = req.params.slug;

  // Map slugs → Discogs genre names
  const GENRE_MAP = {
    indie: "Indie",
    rock: "Rock",
    "hip-hop": "Hip Hop",
    electronic: "Electronic",
    house: "House"
  };

  const genreName = GENRE_MAP[slug];
  if (!genreName) {
    return res.redirect('/');
  }

  const curatedPicks = await getCuratedPicks();

  const options = {
    hostname: 'api.discogs.com',
    path: `/database/search?genre=${encodeURIComponent(
      genreName
    )}&format=vinyl&type=release&token=${DISCOGS_TOKEN}`,
    method: 'GET',
    headers: { 'User-Agent': 'FindAnyVinylApp/1.0' }
  };

  let data = '';

  const request = https.request(options, (response) => {
    response.on('data', (chunk) => (data += chunk));
    response.on('end', () => {
      try {
        const result = JSON.parse(data);

        const vinyls = (result.results || []).map((r) => ({
          title: r.title,
          thumb: r.cover_image || r.thumb || '',
          year: r.year || '',
          format: Array.isArray(r.format) ? r.format[0] : '',
          label: Array.isArray(r.label) ? r.label[0] : '',
          url: r.uri || '#'
        }));

        res.render('index', {
          result: vinyls,
          ebayResults: [],
          query: genreName,
          curatedPicks
        });
      } catch (err) {
        console.error('Genre JSON parse error:', err);
        res.render('index', {
          result: [],
          ebayResults: [],
          query: genreName,
          curatedPicks
        });
      }
    });
  });

  request.on('error', (error) => {
    console.error('Genre API error:', error);
    res.render('index', {
      result: [],
      ebayResults: [],
      query: genreName,
      curatedPicks
    });
  });

  request.end();
});


// ===================================================================
// 404 fallback
// ===================================================================
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
});


// ===================================================================
// Local development server
// ===================================================================
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Find Any Vinyl listening on http://localhost:${PORT}`);
  });
}

export default app;
