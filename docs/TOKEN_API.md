# Token API Implementation Guide

This guide explains authentication with the zustand multiplayer middleware and how to implement secure token generation for real-time state synchronization.

## Overview

The Zustand Multiplayer middleware uses a secure token-based authentication system to connect to HPKV's WebSocket infrastructure. This ensures that:

- **Only authorized clients** can access your multiplayer stores
- **Tokens are scoped** to specific namespaces and access patterns
- **Security is maintained** without exposing API keys in client code
- **Rate limiting and monitoring** can be implemented at the token level

## Why Tokens Are Needed

The zustand multiplayer middleware connects to HPKV via WebSocket to enable real-time state synchronization. **All WebSocket connections require tokens** because:

1. **Security**: Tokens provide scoped access without exposing your API key
2. **Access Control**: Each token defines which keys the connection can operate on
3. **Monitoring**: Token-based access enables usage tracking and rate limiting
4. **Flexibility**: Different clients can have different access levels

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
  subscribedKeysAndPatterns: string[];
}
```

**Example request sent by middleware:**

```json
{
  "namespace": "my-app-namespace",
  "subscribedKeysAndPatterns": ["property1", "property2", "userState"]
}
```

**Note**: The TokenHelper automatically:

- Uses the provided `subscribedKeysAndPatterns` for WebSocket subscription
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

You can implement the token generation API using the provided `TokenHelper` class.

### TokenHelper Class

The `TokenHelper` class must be imported directly from the auth module:

```typescript
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';
```

#### Constructor

```typescript
new TokenHelper(apiKey: string, baseUrl: string)
```

#### Available Methods

The `TokenHelper` provides two methods for token generation:

##### `generateTokenForStore(namespace: string, subscribedKeysAnPatterns: string[]): Promise<string>`

Generates a WebSocket token for a specific namespace.

```typescript
const tokenHelper = new TokenHelper(apiKey, baseUrl);
const token = await tokenHelper.generateTokenForStore('my-app', ['my-app:todos', 'my-app:*']);
```

**Parameters:**

- `namespace`: The store namespace
- `subscribedKeysAnPatterns`: Array of keys and patterns to subscribe to (supports wildcards with `*`)

##### `processTokenRequest(requestData: unknown): Promise<TokenResponse>`

Processes a token request and returns a structured response.

```typescript
const response = await tokenHelper.processTokenRequest(req.body);
// Returns: { namespace: 'my-app', token: 'eyJ...' }
```

### Implementation Examples

#### Express.js

```typescript
import express from 'express';
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';

const app = express();
app.use(express.json());

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

app.post('/api/token', async (req, res) => {
  try {
    // Add your authentication logic here
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Process the token request
    const response = await tokenHelper.processTokenRequest(req.body);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

#### Next.js

```typescript
// pages/api/token.ts
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

export default async function handler(req, res) {
  try {
    // Add your authentication logic here
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Process the token request
    const response = await tokenHelper.processTokenRequest(req.body);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
```

#### Fastify

```typescript
import Fastify from 'fastify';
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';

const fastify = Fastify();
const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

fastify.post('/api/token', async (request, reply) => {
  try {
    // Add your authentication logic here
    const user = await authenticateUser(request.headers.authorization);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    // Process the token request
    const response = await tokenHelper.processTokenRequest(request.body);
    reply.status(200).send(response);
  } catch (error) {
    reply.code(500).send({ error: error.message });
  }
});
```

#### Custom Implementation

For other frameworks or custom implementations:

```typescript
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

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

#### Direct Token Generation

For complete custom implementations:

```typescript
import { TokenHelper } from '@hpkv/zustand-multiplayer/auth/token-helper';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

async function generateToken(requestBody, authHeader) {
  // 1. Authenticate user
  const user = await authenticateUser(authHeader);
  if (!user) {
    throw new Error('Unauthorized');
  }

  // 2. Extract namespace and subscribedKeysAndPatterns from your request
  const namespace = requestBody.namespace;
  const subscribedKeysAndPatterns = requestBody.subscribedKeysAndPatterns || [];

  // 3. Generate the token directly
  const token = await tokenHelper.generateTokenForStore(namespace, subscribedKeysAndPatterns);

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
