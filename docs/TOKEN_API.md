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

## Advanced Implementation Patterns

### Multi-Tenant Token Generation

For applications serving multiple organizations or teams:

```typescript
// Advanced token generation with tenant isolation
import { TokenHelper } from '@hpkv/zustand-multiplayer';

const tokenHelper = new TokenHelper(process.env.HPKV_API_KEY!, process.env.HPKV_API_BASE_URL!);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // 1. Authenticate user
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { namespace } = req.body;

    // 2. Extract tenant from namespace or user context
    const tenantId = extractTenantId(namespace, user);

    // 3. Validate tenant access
    if (!(await validateTenantAccess(user.id, tenantId))) {
      return res.status(403).json({ error: 'Tenant access denied' });
    }

    // 4. Generate scoped namespace
    const scopedNamespace = `tenant:${tenantId}:${namespace}`;

    // 5. Create modified request with scoped namespace
    const scopedRequest = {
      ...req.body,
      namespace: scopedNamespace,
    };

    const response = await tokenHelper.processTokenRequest(scopedRequest);

    // 6. Log for audit
    await auditLog({
      userId: user.id,
      tenantId,
      namespace: scopedNamespace,
      action: 'token_generated',
      timestamp: Date.now(),
    });

    res.status(200).json(response);
  } catch (error) {
    console.error('Token generation failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

async function extractTenantId(namespace: string, user: any): Promise<string> {
  // Extract tenant from namespace pattern or user context
  const tenantMatch = namespace.match(/^tenant:([^:]+):/);
  if (tenantMatch) {
    return tenantMatch[1];
  }

  // Fallback to user's primary tenant
  return user.primaryTenantId;
}

async function validateTenantAccess(userId: string, tenantId: string): Promise<boolean> {
  // Check if user has access to the tenant
  const membership = await db.tenantMemberships.findFirst({
    where: { userId, tenantId, status: 'active' },
  });

  return !!membership;
}
```

### Role-Based Access Control

Implement different access levels based on user roles:

```typescript
interface UserRole {
  role: 'admin' | 'editor' | 'viewer';
  permissions: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { namespace, subscribedKeys } = req.body;
    const userRole = await getUserRole(user.id, namespace);

    // Filter subscribed keys based on role
    const allowedKeys = filterKeysByRole(subscribedKeys, userRole);

    if (allowedKeys.length === 0) {
      return res.status(403).json({ error: 'No access to requested keys' });
    }

    // Generate token with filtered keys
    const filteredRequest = {
      namespace,
      subscribedKeys: allowedKeys,
    };

    const response = await tokenHelper.processTokenRequest(filteredRequest);
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function filterKeysByRole(keys: string[], role: UserRole): string[] {
  const rolePermissions = {
    admin: ['*'], // Access to all keys
    editor: ['todos', 'settings', 'comments'], // Write access
    viewer: ['todos', 'comments'], // Read-only access
  };

  const allowedPatterns = rolePermissions[role.role] || [];

  return keys.filter(key => {
    return allowedPatterns.some(pattern => {
      if (pattern === '*') return true;
      return key.startsWith(pattern);
    });
  });
}
```

### Rate Limiting Implementation

Implement comprehensive rate limiting:

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Create rate limiters for different scenarios
const globalLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many token requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
});

const userLimiter = rateLimit({
  store: new RedisStore({
    sendCommand: (...args: string[]) => redis.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each user to 10 tokens per minute
  keyGenerator: req => req.user?.id || req.ip,
  message: 'Too many token requests for this user',
});

// Apply rate limiting middleware
app.use('/api/generate-token', globalLimiter);
app.use('/api/generate-token', userLimiter);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Token generation logic here
}
```

### Token Caching Strategy

Implement intelligent token caching to reduce API calls:

```typescript
import { TokenHelper } from '@hpkv/zustand-multiplayer';
import NodeCache from 'node-cache';

// Cache tokens for 1.5 hours (tokens expire in 2 hours)
const tokenCache = new NodeCache({ stdTTL: 5400 });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const user = await authenticateUser(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { namespace, subscribedKeys } = req.body;

    // Create cache key based on user, namespace, and keys
    const cacheKey = createCacheKey(user.id, namespace, subscribedKeys);

    // Check cache first
    let response = tokenCache.get(cacheKey);

    if (!response) {
      // Generate new token
      response = await tokenHelper.processTokenRequest(req.body);

      // Cache the response
      tokenCache.set(cacheKey, response);

      console.log(`Generated new token for ${user.id}:${namespace}`);
    } else {
      console.log(`Using cached token for ${user.id}:${namespace}`);
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function createCacheKey(userId: string, namespace: string, keys: string[]): string {
  const keyHash = hashObject(keys.sort());
  return `token:${userId}:${namespace}:${keyHash}`;
}

function hashObject(obj: any): string {
  return require('crypto').createHash('md5').update(JSON.stringify(obj)).digest('hex');
}
```

## Testing Your Token Endpoint

### Unit Tests

```typescript
import { createMocks } from 'node-mocks-http';
import handler from '../pages/api/generate-token';

describe('/api/generate-token', () => {
  it('should generate token for valid request', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-jwt-token',
      },
      body: {
        namespace: 'test-app',
        subscribedKeys: ['todos', 'settings'],
      },
    });

    // Mock authentication
    jest.spyOn(auth, 'authenticateUser').mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty('token');
    expect(data).toHaveProperty('namespace', 'test-app');
  });

  it('should reject unauthorized requests', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {},
      body: {
        namespace: 'test-app',
        subscribedKeys: ['todos'],
      },
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
  });
});
```

### Integration Tests

```typescript
describe('Token Integration', () => {
  it('should work with multiplayer store', async () => {
    // Setup test server
    const server = createTestServer();
    const tokenEndpoint = `${server.url}/api/generate-token`;

    // Create store with test endpoint
    const store = create(
      multiplayer(
        set => ({
          counter: 0,
          increment: () =>
            set(state => {
              state.counter += 1;
            }),
        }),
        {
          namespace: 'integration-test',
          apiBaseUrl: process.env.TEST_HPKV_API_BASE_URL!,
          tokenGenerationUrl: tokenEndpoint,
        },
      ),
    );

    // Test connection
    await store.getState().multiplayer.connect();
    expect(store.getState().multiplayer.connectionState).toBe('CONNECTED');

    // Test state updates
    store.getState().increment();
    expect(store.getState().counter).toBe(1);

    // Cleanup
    await store.getState().multiplayer.destroy();
    server.close();
  });
});
```

## Security Checklist

### ✅ Essential Security Measures

- [ ] **API Key Protection**: API keys stored securely in environment variables
- [ ] **HTTPS Only**: All token requests use HTTPS in production
- [ ] **Authentication**: Proper user authentication before token generation
- [ ] **Authorization**: User permissions validated for requested namespaces
- [ ] **Rate Limiting**: Implemented at both IP and user levels
- [ ] **Input Validation**: All request data validated and sanitized
- [ ] **Error Handling**: No sensitive information leaked in error responses
- [ ] **Audit Logging**: Token generation events logged for security monitoring

### 🔒 Advanced Security Measures

- [ ] **Multi-Factor Authentication**: MFA required for sensitive operations
- [ ] **IP Whitelisting**: Restrict token generation to known IP ranges
- [ ] **Token Rotation**: Implement automatic token refresh
- [ ] **Anomaly Detection**: Monitor for unusual token generation patterns
- [ ] **CORS Configuration**: Properly configured for your domain
- [ ] **SQL Injection Protection**: Use parameterized queries
- [ ] **XSS Protection**: Sanitize all user inputs
- [ ] **CSRF Protection**: Implement CSRF tokens for web applications

## Troubleshooting

### Common Issues

#### Token Generation Fails

**Symptoms**: 500 errors from token endpoint

**Solutions**:

1. Verify API key and base URL are correct
2. Check HPKV service availability
3. Review server logs for detailed error messages
4. Test API key with direct HPKV API calls

#### Authentication Errors

**Symptoms**: 401/403 responses

**Solutions**:

1. Verify JWT token format and signature
2. Check token expiration
3. Validate user permissions in your system
4. Review authentication middleware logs

#### Rate Limiting Issues

**Symptoms**: 429 Too Many Requests

**Solutions**:

1. Implement exponential backoff in clients
2. Review rate limiting thresholds
3. Consider token caching strategies
4. Monitor usage patterns

### Debug Mode

Enable debug logging for token generation:

```typescript
// Add debug logging to your token endpoint
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const debug = process.env.NODE_ENV === 'development';

  if (debug) {
    console.log('Token request received:', {
      headers: req.headers,
      body: req.body,
      timestamp: new Date().toISOString(),
    });
  }

  try {
    // ... token generation logic

    if (debug) {
      console.log('Token generated successfully:', {
        namespace: req.body.namespace,
        keyCount: req.body.subscribedKeys?.length,
      });
    }
  } catch (error) {
    if (debug) {
      console.error('Token generation failed:', error);
    }
    // ... error handling
  }
}
```
