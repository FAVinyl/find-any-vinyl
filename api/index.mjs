const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Tells Express to use EJS from the 'views' folder
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Serve static files (like CSS, images) from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Dummy vinyl data (replace with real data later)
const vinyls = [
  'Daft Punk – Homework',
  'Massive Attack – Mezzanine',
  'Aphex Twin – Selected Ambient Works',
  'The Chemical Brothers – Dig Your Own Hole',
  'Underworld – Dubnobasswithmyheadman',
  'Orbital – In Sides',
  'Fatboy Slim – You’ve Come A Long Way, Baby'
];

// Home page
app.get('/', (req, res) => {
  res.render('index', { result: null });
});

// Handle search
const https = require('https');

// Handle search with real Discogs data
app.post('/search', (req, res) => {
  const query = req.body.query;

  const options = {
    hostname: 'api.discogs.com',
    path: `/database/search?q=${encodeURIComponent(query)}&token=ZsXMxGGPWnzyycHnrimUVViCQWAtustyttiVrHXz`,
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

// Start server
aimport express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from '@vercel/node';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));

const vinyls = [
  'Daft Punk – Homework',
  'Massive Attack – Mezzanine'
  // etc.
];

app.get('/', (req, res) => {
  res.render('index', { result: null });
});

app.post('/search', (req, res) => {
  const query = req.body.query?.toLowerCase() || '';
  const result = vinyls.filter(item => item.toLowerCase().includes(query));
  res.render('index', { result });
});

export default app;
