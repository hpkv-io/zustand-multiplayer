require('dotenv').config();
const express = require('express');
const path = require('path');
// const { TokenHelper } = require('@hpkv/zustand-multiplayer'); // Moved to routes/api.js

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
  // Unlike server.js, we might not want app.js to process.exit(1) directly,
  // as it's a module. The bin/www script handles graceful exit on critical startup errors.
  // However, for this specific setup, exiting might still be preferred if routes depend heavily on it.
  // For now, log and let it potentially fail in route setup if those env vars are critical there.
  // The routes/api.js has its own check.
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount Routers
app.use('/api', apiRouter); // All API routes will be prefixed with /api
app.use('/', indexRouter); // Handles serving index.html and any other root-level GETs

// Optional: Add 404 and error handlers similar to `tmp` boilerplate if desired
// For simplicity, these are omitted for now but can be added for more robust error handling.
// app.use(function(req, res, next) {
//   next(createError(404));
// });
// app.use(function(err, req, res, next) {
//   res.status(err.status || 500);
//   res.json({ error: err.message }); // Example error response
// });

module.exports = app; 