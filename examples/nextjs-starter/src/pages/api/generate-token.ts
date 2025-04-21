import { TokenHelper } from '@hpkv/zustand-multiplayer';

// Create a token helper instance
const tokenHelper = new TokenHelper(
  process.env.HPKV_API_KEY || '',
  process.env.HPKV_API_BASE_URL || '',
);

export default tokenHelper.createNextApiHandler();
