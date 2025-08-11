const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { TokenHelper } = require('@hpkv/zustand-multiplayer');

const app = express();

app.use(cors());

app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (_req, res) => {
  res.json({
    apiBaseUrl: process.env.HPKV_API_BASE_URL,
  });
});

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

app.post('/api/generate-token', async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const response = await tokenHelper.processTokenRequest(req.body);
  res.json(response);
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

app.use((_req, res) => {
  res.status(404).send('Page not found');
});

module.exports = app;
