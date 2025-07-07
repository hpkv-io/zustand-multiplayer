import { TokenHelper } from '@hpkv/zustand-multiplayer';
import { NextApiRequest, NextApiResponse } from 'next';

// Use the existing  NextJS handler from the TokenHelper
//export default new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!).createNextApiHandler();
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);
  const body = await req.body;
  const token = await tokenHelper.processTokenRequest(body);
  res.status(200).json(token);
}