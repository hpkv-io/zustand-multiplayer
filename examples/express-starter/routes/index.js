const express = require('express');
const router = express.Router();
const path = require('path');

// This will serve index.html for the root and any other unhandled GET requests
// ensuring client-side routing can work if the SPA uses it.
router.get('*', (req, res) => {
  // Serve from the 'public' directory, which should be set up as static in app.js
  // The path needs to be absolute or relative to where the app is run.
  // Using path.join from __dirname of app.js (or where static is defined) is safer.
  // For now, let's assume 'public' is correctly served statically by app.js
  res.sendFile(path.join(__dirname, '../public', 'index.html')); 
});

module.exports = router; 