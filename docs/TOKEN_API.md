# Token API Implementation Guide

This guide explains authentication with the zustand multiplayer middleware and how to implement secure token generation.

## Why Tokens Are Needed

The zustand multiplayer middleware connects to HPKV via WebSocket to enable real-time state synchronization. **All WebSocket connections require tokens** - tokens contain information about the subscribed keys and access patterns that define which keys the connection can operate on.

## Authentication Approaches

### Client-Side Applications (Token Generation Endpoint)

For browser applications, mobile apps, or any client-side environment:

```javascript
// Client-side store configuration
{
  namespace: 'my-app',
  apiBaseUrl: 'hpkv-api-base-url',
  tokenGenerationUrl: '/api/generate-token'  // Your secure endpoint
}
```

**How it works:**

1. Client requests a token from your secure backend endpoint
2. Your backend validates the user and generates a token using your API key
3. **Token is scoped to specific keys** based on the store's namespace and required access
4. Client uses the scoped token to connect to HPKV via WebSocket

### Server-Side Applications (Internal Token Generation)

For Node.js servers, background workers, or trusted server environments:

```javascript
// Server-side store configuration
{
  namespace: 'background-jobs',
  apiBaseUrl: 'hpkv-api-base-url',
  apiKey: process.env.HPKV_API_KEY  // API key for internal token generation
}
```

**How it works:**

1. **Server uses API key to generate scoped tokens internally** (no endpoint needed)
2. **Generated token is scoped to the store's namespace and keys** (not full access)
3. **Token used for WebSocket connection** with specific access permissions

**Important**: Server-side applications generate tokens internally using the API key, but these tokens are still scoped to specific keys and access patterns - they don't provide unlimited access to all data.

## Client-Side Token Generation Implementation

**Important**: Each generated token expires within 2 hours. The middleware automatically refreshes tokens before expiration.

### Authentication Requirements

🔒 **Critical**: You must implement your own authentication mechanism for the token generation endpoint:

- **Verify user identity** (JWT, session, API key, etc.)
- **Check user permissions** for the requested namespace
- **Rate limit requests** to prevent abuse
- **Log access attempts** for security monitoring

Example authentication flow:

```javascript
async function handleTokenRequest(req) {
  // 1. Authenticate the user
  const user = await authenticateUser(req.headers.authorization);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // 2. Check permissions for the specific namespace
  const { namespace } = req.body;
  if (!user.hasAccessTo(namespace)) {
    throw new Error('Access denied to namespace');
  }

  // 3. Generate scoped token (same process as server-side internal generation)
  const response = await tokenHelper.processTokenRequest(req.body);
  return response; // Token scoped to namespace and specified keys
}
```

### API Contract

#### Endpoint

Set up a POST endpoint at a URL of your choice (e.g., `/api/generate-token`).

#### Request Format (Multiplayer to Your Endpoint)

The middleware will send a POST request with the following structure:

```typescript
interface TokenRequest {
  // Namespace to generate token for (required)
  namespace: string;
  // Array of specific keys the client needs to subscribe to
  subscribedKeys: string[];
}
```

**Example request sent by middleware:**

```json
{
  "namespace": "my-app-namespace",
  "subscribedKeys": ["property1", "property2", "userState"]
}
```

**Note**: The TokenHelper automatically:

- Uses the provided `subscribedKeys` for WebSocket subscription
- Generates an access pattern `^namespace:.*$` to restrict operations to the namespace
- Creates scoped tokens that can only operate on keys within the specified namespace

#### Response Format (Your Endpoint to Multiplayer)

Your endpoint must respond with:

```typescript
interface TokenResponse {
  // The namespace for which the token is generated
  namespace: string;
  // The generated WebSocket token (required)
  token: string;
}
```

**Example response your endpoint should return:**

```json
{
  "namespace": "my-app-namespace",
  "token": "eyJhrGciOiJIUzIgNi4sInR5cCI6IkpXVCJ9..."
}
```

#### HTTP Details

- **Method**: POST
- **Content-Type**: `application/json`
- **Success Status**: 200
- **Error Status**: 4xx or 5xx with error message in response body

## Implementation Options

You have multiple ways to implement the token generation API using the provided `TokenHelper` class.

### Option 1: Framework-Specific Handlers (Easiest)

`TokenHelper` includes built-in handlers for popular frameworks:

#### Express.js

```typescript
import express from 'express';
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const app = express();
app.use(express.json());

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

app.post('/api/token', async (req, res) => {
  try {
    // Add your authentication logic here
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use the built-in Express handler
    const handler = tokenHelper.createExpressHandler();
    return handler(req, res);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});
```

#### Next.js

```typescript
// pages/api/token.ts
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

export default async function handler(req, res) {
  try {
    // Add your authentication logic here
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Use the built-in Next.js handler
    return tokenHelper.createNextApiHandler()(req, res);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}
```

#### Fastify

```typescript
import Fastify from 'fastify';
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const fastify = Fastify();
const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

fastify.post('/api/token', async (request, reply) => {
  try {
    // Add your authentication logic here
    const user = await authenticateUser(request.headers.authorization);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Use the built-in Fastify handler
    const handler = tokenHelper.createFastifyHandler();
    return handler(request, reply);
  } catch (error) {
    reply.code(401).send({ error: error.message });
  }
});
```

### Option 2: Framework-Agnostic Request Processing

For custom implementations or other frameworks, use the `processTokenRequest` method:

```typescript
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

// In your route handler (works with any framework):
async function handleTokenRequest(requestBody, authHeader) {
  try {
    // 1. Authenticate user
    const user = await authenticateUser(authHeader);
    if (!user) {
      throw new Error('Unauthorized');
    }

    // 2. Process the request and get a typed response
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
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY, process.env.HPKV_API_BASE_URL);

async function generateToken(requestBody, authHeader) {
  // 1. Authenticate user
  const user = await authenticateUser(authHeader);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // 2. Extract namespace and subscribedKeys from your request
  const namespace = requestBody.namespace;
  const subscribedKeys = requestBody.subscribedKeys || []; // Default to empty array if not provided

  // 3. Generate the token directly
  const token = await tokenHelper.generateTokenForStore(namespace, subscribedKeys);

  // 4. Return in your response format
  return { namespace, token };
}
```

## Security Best Practices

### 1. API Key Protection

- **Never expose your HPKV API key** in client-side code
- Store API keys in secure environment variables
- Use different API keys for different environments (dev, staging, prod)

### 2. Token Scoping Understanding

**Client-side flow:**

1. Client requests a token from your secure backend endpoint
2. Your backend validates the user and generates a token using your API key
3. **Token is scoped to specific keys** based on the store's namespace and required access
4. Client uses the scoped token to connect to HPKV via WebSocket

**Server-side flow:**

1. **Server uses API key to generate scoped tokens internally** (no endpoint needed)
2. **Generated token is scoped to the store's namespace and keys** (not full access)
3. **Token used for WebSocket connection** with specific access permissions

### 3. Endpoint Security

- **Implement proper authentication** for your token endpoint
- **Validate user permissions** before generating tokens
- **Use HTTPS** for all token generation requests
- **Implement rate limiting** to prevent abuse
