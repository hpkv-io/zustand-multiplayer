const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { TokenHelper } = require('@hpkv/zustand-multiplayer');

const app = express();

// Enable CORS for all origins (in production, configure this properly)
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Configuration endpoint for client-side settings
app.get('/api/config', (req, res) => {
  res.json({
    apiBaseUrl: process.env.HPKV_API_BASE_URL,
  });
});

// Token generation endpoint
const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY,
  process.env.HPKV_API_BASE_URL
);

app.post('/api/generate-token', tokenHelper.createExpressHandler());

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Page not found');
});

module.exports = app; 