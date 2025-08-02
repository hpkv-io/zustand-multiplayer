# Zustand Multiplayer Middleware - Technical Specification

## Executive Summary

The Zustand Multiplayer middleware is a complex system that enables real-time state synchronization between multiple clients using Zustand stores. It leverages the HPKV WebSocket client for persistent storage and real-time communication. The system supports granular state management through configurable depth levels (zFactor), conflict resolution, selective synchronization, and comprehensive error handling.

## Architecture Overview

### Core Components

The middleware is built with a modular architecture consisting of several key components:

1. **Multiplayer Orchestrator** (`MultiplayerOrchestrator`) - Central coordinator
2. **Service Factory** (`ServiceFactory`) - Dependency injection container
3. **Storage Layer** (`HPKVStorage`) - HPKV client wrapper
4. **State Manager** (`state-manager`) - State change detection and path operations
5. **Conflict Resolver** (`ConflictResolver`) - Handles offline conflicts
6. **Sync Queue Manager** (`SyncQueueManager`) - Manages pending operations
7. **Performance Monitor** (`Profiler`) - Tracks metrics and performance

### Component Relationships

```
┌─────────────────────────┐
│    Multiplayer API      │
├─────────────────────────┤
│ MultiplayerOrchestrator │◄─┐
├─────────────────────────┤  │
│    Service Factory      │──┘
├─────────────────────────┤
│      HPKV Storage       │
├─────────────────────────┤
│   @hpkv/websocket-client│
└─────────────────────────┘
```

## Core Functionality Specifications

### 1. State Synchronization

#### Primary Features:

- **Real-time sync**: Changes propagate instantly to all connected clients
- **Granular storage**: Configurable depth level (zFactor 0-10) for conflict reduction
- **Selective sync**: Choose which fields to publish/subscribe to
- **Automatic hydration**: Initial state loading from persistent storage

#### State Change Detection:

```typescript
// Detects changes between current and next state
detectStateChanges(currentState, nextState): Changes[]

// Detects deletions between states
detectStateDeletions(currentState, nextState, zFactor): Deletions[]
```

#### Storage Key Patterns:

- **zFactor 0**: `namespace-0:topLevelKey`
- **zFactor 1**: `namespace-1:topLevel:secondLevel`
- **zFactor 2**: `namespace-2:top:second:third` (default)
- **zFactor N**: Depth N+1 for individual properties

### 2. Connection Management

#### States:

- `DISCONNECTED` - No connection
- `CONNECTING` - Establishing connection
- `CONNECTED` - Active connection
- `RECONNECTING` - Attempting to reconnect

#### Auto-reconnection:

- Exponential backoff strategy
- Configurable max retry attempts
- Queue operations during disconnection
- Automatic state restoration on reconnection

### 3. Conflict Resolution

#### Detection:

Conflicts occur when:

1. Client goes offline
2. Makes local changes
3. Reconnects and finds server state has changed

#### Resolution Strategies:

- `keep-remote`: Use server state (default)
- `keep-local`: Use local changes
- `merge`: Custom merge logic with `mergedValues`

#### Example:

```typescript
onConflict: conflicts => {
  return {
    strategy: 'merge',
    mergedValues: {
      content: mergeDocumentContent(local, remote),
    },
  };
};
```

### 4. Authentication

#### Server-side:

```typescript
// Direct API key usage
{
  apiKey: 'your-api-key',
  apiBaseUrl: 'https://api.hpkv.io'
}
```

#### Client-side:

```typescript
// Token generation endpoint
{
  tokenGenerationUrl: '/api/generate-token',
  apiBaseUrl: 'https://api.hpkv.io'
}
```

## Configuration Options

### Core Options

```typescript
interface MultiplayerOptions<TState> {
  // Required
  namespace: string; // Unique identifier
  apiBaseUrl: string; // HPKV API endpoint

  // Authentication (one required)
  apiKey?: string; // Server-side
  tokenGenerationUrl?: string; // Client-side

  // Synchronization
  publishUpdatesFor?: () => Array<keyof TState>;
  subscribeToUpdatesFor?: () => Array<keyof TState>;

  // Storage granularity
  zFactor?: number; // 0-10, default: 2

  // Lifecycle hooks
  onHydrate?: (state: TState) => void;
  onConflict?: (conflicts: ConflictInfo<TState>[]) => ConflictResolution<TState>;

  // Performance & debugging
  logLevel?: LogLevel; // ERROR, WARN, INFO, DEBUG
  profiling?: boolean; // Performance metrics
  retryConfig?: RetryConfig; // Custom retry strategy
  clientConfig?: ConnectionConfig; // WebSocket settings
}
```

### Advanced Configuration

```typescript
// Custom retry strategy
retryConfig: {
  maxRetries: 5,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffFactor: 2
}

// WebSocket client settings
clientConfig: {
  maxReconnectAttempts: 10,
  throttling: {
    enabled: true,
    rateLimit: 10
  }
}
```

## API Reference

### Multiplayer State Object

```typescript
interface MultiplayerState {
  // Reactive properties
  connectionState: ConnectionState; // Current connection status
  hasHydrated: boolean; // Initial load complete

  // Control methods
  hydrate(): Promise<void>; // Refresh from server
  clearStorage(): Promise<void>; // Clear all data
  connect(): Promise<void>; // Establish connection
  disconnect(): Promise<void>; // Close connection
  destroy(): Promise<void>; // Cleanup resources

  // Status methods
  getConnectionStatus(): ConnectionStats | null;
  getMetrics(): PerformanceMetrics;
}
```

### Performance Metrics

```typescript
interface PerformanceMetrics {
  stateChangesProcessed: number; // Total state updates
  averageSyncTime: number; // MS per sync operation
  averageHydrationTime: number; // MS for initial load
}

interface ConnectionStats {
  isConnected: boolean;
  connectionState: ConnectionState;
  reconnectAttempts: number;
  messagesPending: number;
  throttling?: {
    currentRate: number;
    queueLength: number;
  };
}
```

## Code Execution Paths

### 1. Store Creation & Initialization

```
create() → multiplayer() →
  validateOptions() →
  extractNonFunctionKeys() →
  normalizeOptions() →
  createHPKVStorage() →
  ServiceFactory.create() →
  new MultiplayerOrchestrator() →
  initializeOrchestrator() →
    connect() →
    hydrate()
```

### 2. State Change Propagation

```
setState() →
  multiplayerSet() →
  detectStateChanges() →
  detectStateDeletions() →
  handleStateChangeRequest() →
    shouldQueueStateChange()? →
      [YES] queueStateChange()
      [NO]  applyStateChange() →
        syncStateToRemote() →
          detectSerializableChanges() →
          createSyncPromises() →
          HPKV.setItem()
```

### 3. Remote Change Handling

```
HPKV.onChange() →
  handleRemoteChange() →
  keyManager.parseStorageKey() →
    [deletion] handleRemoteDeletion() →
      buildDeleteUpdate() →
      applyStateChange()
    [update] handleRemoteUpdate() →
      buildSetUpdate() →
      applyStateChange()
```

### 4. Connection State Changes

```
HPKV.onConnectionChange() →
  handleConnectionStateChange() →
    [DISCONNECTED]
      stateBeforeDisconnection = current
      resetHydrationStatus()
    [CONNECTED]
      hydrate() →
        processConflictsAndPendingChanges()
```

### 5. Hydration Process

```
hydrate() →
  stateHydrator.hydrate() →
    HPKV.range() →
    reconstructStateFromKeys() →
    applyStateChange(reconstructed, replace=true) →
  processConflictsAndPendingChanges() →
    [conflicts exist]
      conflictResolver.detectConflicts() →
      conflictResolver.resolveConflicts() →
      applyResolvedChanges()
    [no conflicts]
      processPendingChanges()
```

## Test Coverage Specifications

### E2E Tests

1. **Basic Integration** (`basic-e2e.test.ts`)
   - Auto-connection on store creation
   - Auto-hydration on store creation
   - State synchronization between clients
   - Namespace isolation
   - Persistence across store instances
   - Clear storage functionality
   - Token generation URL support

2. **Conflict Management** (`conflict-management-e2e.test.ts`)
   - Keep-remote strategy (default)
   - Keep-local strategy
   - Custom merge strategy
   - zFactor-based conflict reduction

3. **Middleware Composition** (`middleware-composition-e2e.test.ts`)
   - Integration with `subscribeWithSelector`
   - Integration with `immer` middleware
   - State synchronization with composed middleware

4. **Subscriptions** (`subscriptions-e2e.test.ts`)
   - Selective synchronization (publish/subscribe)
   - Nested state synchronization with different zFactors
   - Record-based state synchronization
   - Multi-client eventual consistency

### Integration Tests

1. **Basic Integration** (`basic-integration.test.ts`)
   - Store creation with various auth methods
   - Connection management lifecycle
   - State persistence and hydration
   - Namespace isolation
   - Performance metrics tracking

2. **Performance** (`performance-integration.test.ts`)
   - Metrics tracking accuracy
   - Sync time measurement
   - Hydration time measurement

3. **zFactor Tests** (`zfactor-integration.test.ts`)
   - Storage key patterns for each zFactor (0-3)
   - Hydration correctness for each zFactor
   - zFactor validation (min/max bounds)

### Unit Tests

1. **State Manager** (`state-manager-unit.test.ts`)
   - Path creation and navigation
   - State building operations
   - Integration with path utilities

2. **Cache Manager** (`cache-manager-unit.test.ts`)
   - LRU cache operations
   - Cache invalidation
   - Memory management

3. **Storage Key Manager** (`storage-key-manager-unit.test.ts`)
   - Key generation patterns
   - Key parsing
   - Namespace handling

## Error Handling Specifications

### Error Categories

1. **Configuration Errors**
   - Missing required options
   - Invalid zFactor bounds
   - Authentication setup issues

2. **Network Errors**
   - Connection failures
   - Token generation failures
   - Sync operation failures

3. **State Management Errors**
   - Hydration failures
   - Conflict resolution errors
   - Invalid state updates

### Error Recovery Strategies

1. **Automatic Recovery**
   - Connection drops: Auto-reconnect with exponential backoff
   - Sync failures: Retry with configurable limits
   - Token expiry: Automatic token refresh

2. **Manual Recovery**
   - Clear storage for corrupted state
   - Manual hydration for data refresh
   - Force reconnection for network issues

## Performance Characteristics

### Optimization Strategies

1. **Change Detection**
   - Path-based diff calculation
   - Function property filtering
   - Cached path extraction

2. **Network Efficiency**
   - Granular updates (per zFactor)
   - Batch operations where possible
   - Throttling for rapid changes

3. **Memory Management**
   - LRU caches for path operations
   - Cleanup on component unmount
   - Resource deallocation on destroy

### Scalability Considerations

1. **State Size**
   - zFactor affects storage overhead
   - Higher zFactor = more keys, less conflicts
   - Lower zFactor = fewer keys, more conflicts

2. **Client Count**
   - Real-time sync scales with WebSocket capacity
   - HPKV backend handles concurrent clients
   - Local state management is per-client

3. **Update Frequency**
   - Throttling prevents overwhelming the network
   - Queue management during disconnections
   - Batching for performance optimization

## Security Specifications

### Authentication Flow

1. **Server-side** (Direct API Key)

   ```typescript
   // Direct connection with API key
   HPKVClientFactory.createApiClient(apiKey, baseUrl);
   ```

2. **Client-side** (Token-based)

   ```typescript
   // Token request to backend
   POST / api / generate - token;
   Body: {
     (namespace, subscribedKeys);
   }

   // Backend validates and generates token
   tokenHelper.processTokenRequest(body);

   // Client uses token for connection
   HPKVClientFactory.createSubscriptionClient(token, baseUrl);
   ```

### Security Best Practices

1. **API Key Protection**
   - Never expose API keys in client code
   - Use environment variables
   - Rotate keys regularly

2. **Token Management**
   - Implement proper authentication in token endpoints
   - Add rate limiting to token generation
   - Validate namespace permissions

3. **Data Validation**
   - Validate all incoming state updates
   - Sanitize data before storage
   - Implement proper CORS configuration

## Current Complexity Issues

### Architecture Complexity

1. **Over-Engineering**
   - 23 TypeScript files with deep abstractions
   - Multiple layers of indirection
   - Complex service factory pattern
   - Extensive use of dependency injection

2. **State Management Complexity**
   - Complex path-based state operations
   - Multiple change detection algorithms
   - Intricate conflict resolution logic
   - Complex zFactor storage patterns

3. **Error Handling Overhead**
   - Elaborate error classification system
   - Multiple error types and categories
   - Complex error context management

### Code Maintainability Issues

1. **High Coupling**
   - Components heavily dependent on each other
   - Complex initialization sequences
   - Shared state across multiple managers

2. **Testing Complexity**
   - Complex mock setups required
   - Integration tests require full system
   - Difficult to test individual components

3. **Learning Curve**
   - Complex APIs for simple use cases
   - Many configuration options
   - Steep learning curve for contributors

## Recommendations for Simplification

1. **Architectural Simplification**
   - Reduce the number of abstraction layers
   - Combine related functionality into fewer files
   - Simplify the service factory pattern
   - Reduce dependency injection complexity

2. **API Simplification**
   - Provide sensible defaults for most options
   - Hide complexity behind simple interfaces
   - Reduce the number of configuration options
   - Simplify the conflict resolution API

3. **Implementation Simplification**
   - Simplify state change detection
   - Reduce the complexity of path operations
   - Streamline the error handling system
   - Consolidate storage key management

4. **Testing Simplification**
   - Create simpler unit test interfaces
   - Reduce mock complexity
   - Improve test isolation
   - Simplify integration test setup

This technical specification provides a comprehensive understanding of the current implementation, which will guide the simplification efforts to create a more maintainable and easier-to-understand codebase.
