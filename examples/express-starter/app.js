require('dotenv').config();
const express = require('express');
const path = require('path');

// Routers
const apiRouter = require('./routes/api');
const indexRouter = require('./routes/index');

const app = express();

// Check for essential environment variables for application setup
// The TokenHelper instantiation is now in routes/api.js, which also checks these.
// This top-level check in app.js ensures the app doesn't try to run if core config is missing.
const HPKV_API_KEY = process.env.HPKV_API_KEY;
const HPKV_API_BASE_URL = process.env.HPKV_API_BASE_URL;

if (!HPKV_API_KEY || !HPKV_API_BASE_URL) {
  console.error('App Error: HPKV_API_KEY and HPKV_API_BASE_URL must be set in the environment variables for the application to function correctly.');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount Routers
app.use('/api', apiRouter); 
app.use('/', indexRouter);

module.exports = app; 