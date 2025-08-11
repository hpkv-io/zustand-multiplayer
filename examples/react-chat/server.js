const { TokenHelper } = require('@hpkv/zustand-multiplayer');
const cors = require('cors');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

app.post('/api/generate-token', async (req, res) => {
  try {
    const response = await tokenHelper.processTokenRequest(req.body);
    res.json(response);
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

app.listen(PORT, () => {
  console.log(`Token server running on http://localhost:${PORT}`);
  console.log('Make sure to set your HPKV_API_KEY in the .env file');
});
