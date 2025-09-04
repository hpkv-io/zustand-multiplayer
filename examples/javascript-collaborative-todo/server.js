import { TokenHelper } from '@hpkv/zustand-multiplayer';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

app.post('/api/generate-token', async (req, res) => {
  try {
    const response = await tokenHelper.processTokenRequest(req.body);
    res.json(response);
  } catch (error) {
    console.error('Error generating token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

app.listen(PORT, () => {
  console.log(`Token generation server running on http://localhost:${PORT}`);
});
