# Token API Implementation Guide

This guide explains how to implement a token generation API endpoint to work with the zustand multiplayer middleware.

## API Contract

### Endpoint

Set up a POST endpoint at a URL of your choice (e.g., `/api/token`).

### Request Format

```typescript
interface TokenRequest {
  // Store name to generate token for
  storeName: string;
}
```

Example request:

```json
{
  "storeName": "my-store"
}
```

### Response Format

```typescript
interface TokenResponse {
  // The store name for which the token is generated
  storeName: string;
  // The generated WebSocket token (required)
  token: string;
}
```

Example response:

```json
{
  "storeName": "my-store",
  "token": "eyJhrGciOiJIUzIgNi4sInR5cCI6IkpXVCJ9..."
}
```

## Implementation Options

You have multiple ways to implement the token generation API using the provided `TokenHelper` class.

### Option 1: Framework-Specific Handlers (Easiest)

`TokenHelper` includes built-in handlers for popular frameworks:

#### Express.js

```typescript
import express from 'express';
import { TokenHelper } from './token-helper';

const app = express();
app.use(express.json());

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

// Use the built-in Express handler
app.post('/api/token', tokenHelper.createExpressHandler());
```

#### Next.js

```typescript
// pages/api/token.ts
import { TokenHelper } from '../../token-helper';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

// Export the handler directly
export default tokenHelper.createNextApiHandler();
```

#### Fastify

```typescript
import Fastify from 'fastify';
import { TokenHelper } from './token-helper';

const fastify = Fastify();
const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

// Use the built-in Fastify handler
fastify.post('/api/token', tokenHelper.createFastifyHandler());
```

### Option 2: Framework-Agnostic Request Processing

For custom implementations or other frameworks, use the `processTokenRequest` method:

```typescript
import { TokenHelper } from './token-helper';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

// In your route handler (works with any framework):
async function handleTokenRequest(requestBody) {
  try {
    // Process the request and get a typed response
    const response = await tokenHelper.processTokenRequest(requestBody);
    return response; // { storeName:"...", token: "..." }
  } catch (error) {
    // Handle errors
    return { error: error.message };
  }
}
```

### Option 3: Direct Token Generation

For complete custom implementations:

```typescript
import { TokenHelper } from './token-helper';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

// Extract store name from your request
const storeName = request.body.storeName;

// Generate the token directly
const token = await tokenHelper.generateTokenForStore(storeName);

// Return in your response format
return { storeName, token };
```

## Security Considerations

- **Never expose your HPKV API key** in client-side code
- Implement proper authentication for your token endpoint
- Consider using rate limiting to prevent abuse
