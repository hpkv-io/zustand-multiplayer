# Token API Implementation Guide

This guide explains how to implement a token generation API endpoint to work with the zustand multiplayer middleware.

**Important** : Each generated token expires within 2 hours. The middleware has built-in functionality to refresh the token automtically

## API Contract

### Endpoint

Set up a POST endpoint at a URL of your choice (e.g., `/api/token`).

### Request Format

```typescript
interface TokenRequest {
  // Namespace to generate token for (required)
  namespace: string;
  // array of specific keys the client needs to subscribe to within the namespace.
  subscribedKeys?: string[];
}
```

Example request:

```json
{
  "namespace": "my-app-namespace",
  "subscribedKeys": ["my-app-namespace:property1", "my-app-namespace:ptoperty2"]
}
```

### Response Format

```typescript
interface TokenResponse {
  // The namespace for which the token is generated
  namespace: string;
  // The generated WebSocket token (required)
  token: string;
}
```

Example response:

```json
{
  "namespace": "my-app-namespace",
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
    return response; // { namespace:"...", token: "..." }
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

// Extract namespace and subscribedKeys from your request
const namespace = request.body.namespace;
const subscribedKeys = request.body.subscribedKeys || []; // Default to empty array if not provided

// Generate the token directly
const token = await tokenHelper.generateTokenForStore(namespace, subscribedKeys);

// Return in your response format
return { namespace, token };
```

## Security Considerations

- **Never expose your HPKV API key** in client-side code
- Implement proper authentication for your token endpoint
- Consider using rate limiting to prevent abuse
