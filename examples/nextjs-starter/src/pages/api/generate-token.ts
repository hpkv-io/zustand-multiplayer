import { TokenHelper } from '@hpkv/zustand-multiplayer';


export default new TokenHelper(process.env.HPKV_API_KEY || '', process.env.HPKV_API_BASE_URL || '').createNextApiHandler();
