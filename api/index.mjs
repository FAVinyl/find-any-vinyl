import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));

// Home route
app.get('/', (req, res) => {
  res.render('index', { result: null });
});

// Search route using Discogs API
app.post('/search', (req, res) => {
  const query = req.body.query;

  const options = {
    hostname: 'api.discogs.com',
    path: `/database/search?q=${encodeURIComponent(query)}&format=vinyl&type=release&token=ZsXMxGGPWnzyycHnrimUVViCQWAtustyttiVrHXz`,
    method: 'GET',
    headers: {
      'User-Agent': 'FindAnyVinylApp/1.0'
    }
  };

  let data = '';

  const request = https.request(options, response => {
    response.on('data', chunk => {
      data += chunk;
    });

    response.on('end', () => {
      try {
        const result = JSON.parse(data);
        const vinyls = result.results.map(r => ({
          title: r.title,
          thumb: r.thumb,
          year: r.year,
          format: r.format?.[0] || '',
          label: r.label?.[0] || '',
          url: r.uri || '#'
        }));
        res.render('index', { result: vinyls });
      } catch (err) {
        console.error('Error parsing JSON:', err);
        res.render('index', { result: [] });
      }
    });
  });

  request.on('error', error => {
    console.error('API error:', error);
    res.render('index', { result: [] });
  });

  request.end();
});

// Export the app for Vercel
export default app;