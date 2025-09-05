import { TokenHelper } from '@hpkv/zustand-multiplayer';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed',
      message: 'Only POST requests are supported',
    });
  }

  try {
    const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);
    const response = await tokenHelper.processTokenRequest(req.body);
    return res.status(200).json(response);
  } catch (error) {
    console.error('Error generating token:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to generate token',
    });
  }
}
