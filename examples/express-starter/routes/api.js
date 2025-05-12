const express = require('express');
const router = express.Router();
const { TokenHelper } = require('@hpkv/zustand-multiplayer'); // Assuming this path is correct based on user's feedback, or it should be @hpkv/zustand-multiplayer/token-helper

const HPKV_API_KEY = process.env.HPKV_API_KEY;
const HPKV_API_BASE_URL = process.env.HPKV_API_BASE_URL;

if (!HPKV_API_KEY || !HPKV_API_BASE_URL) {
  console.error('API Routes Error: HPKV_API_KEY and HPKV_API_BASE_URL must be set.');
  // This router will not function correctly, but we avoid crashing the app startup here.
  // The main app.js or bin/www should handle the initial check and exit.
}

// Create tokenHelper only if keys are available
let tokenHelper;
if (HPKV_API_KEY && HPKV_API_BASE_URL) {
    tokenHelper = new TokenHelper(HPKV_API_KEY, HPKV_API_BASE_URL);
}

router.post('/hpkv-token', (req, res, next) => {
    if (!tokenHelper) {
        return res.status(500).json({ error: 'TokenHelper not initialized due to missing API keys.' });
    }
    // Use the existing Express handler from TokenHelper
    tokenHelper.createExpressHandler()(req, res, next);
});

module.exports = router; 