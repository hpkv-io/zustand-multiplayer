import { NextApiRequest, NextApiResponse } from 'next';

import { TokenHelper } from '../../../../../dist';

// Create a token helper instance
const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY || '',
  process.env.HPKV_API_BASE_URL || '',
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only accept GET and POST requests
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get storeName from body (POST) or query (GET)
  const storeName = req.body.storeName;

  if (!storeName) {
    return res.status(400).json({ error: 'Store name is required' });
  }

  try {
    // Generate a token for the store
    const token = await tokenHelper.generateTokenForStore(storeName);
    res.status(200).json({ token });
  } catch {
    res.status(500).json({ error: 'Failed to generate token' });
  }
}
