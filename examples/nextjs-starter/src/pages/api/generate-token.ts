import { TokenHelper } from '@hpkv/zustand-multiplayer';

// Use the existing  NextJS handler from the TokenHelper
export default new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!).createNextApiHandler();
