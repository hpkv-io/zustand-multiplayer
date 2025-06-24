# Granular Storage Implementation Changelog

## Overview

This document details all the technical changes made to implement the granular storage feature for conflict-free collaborative editing.

## New Files Added

### 1. `GRANULAR_STORAGE.md`

- Comprehensive documentation for the granular storage feature
- Usage examples and API reference
- Migration guide and best practices

## Modified Files

### 1. `src/multiplayer.ts`

#### New Interfaces Added

```typescript
// Granular storage configuration interface
interface GranularStorageConfig<TState> {
  enableImmerLike?: boolean;
  recordFields?: Array<keyof TState>;
  nestedObjectFields?: Array<keyof TState>;
  keyGenerators?: Partial<Record<keyof TState, (subkey: string) => string>>;
}

// Enhanced sync options to include granular storage
interface SyncOptions<TState> {
  // ... existing options
  granularStorage?: GranularStorageConfig<TState>;
}

// Enhanced multiplayer state interface
interface MultiplayerState {
  // ... existing properties
  updateDraft?: (updater: (draft: TState) => void) => Promise<void>;
}
```

#### New Classes Added

```typescript
// Manages storage keys and subscription patterns
class StorageKeyManager<TState> {
  constructor(namespace: string, config?: GranularStorageConfig<TState>);

  getFieldKey(field: keyof TState): string;
  getRecordItemKey(field: keyof TState, subkey: string): string;
  getSubscriptionPatterns(): string[];
  parseStorageKey(key: string): { field: string; subkey?: string } | null;
  isRecordField(field: keyof TState): boolean;
  getStorageStrategy(field: keyof TState): 'traditional' | 'granular' | 'nested';
}

// Manages draft states and granular updates
class GranularStateManager<TState> {
  constructor(keyManager: StorageKeyManager<TState>, storage: HPKVStorage, logger: Logger);

  createDraftState(currentState: TState): TState;
  applyGranularUpdates(
    state: TState,
    updates: Array<{ field: string; subkey?: string; value: unknown }>,
  ): TState;
}
```

#### Key Generation Logic Changes

**Before:**

```typescript
// Keys were generated with full namespace prefix
subscribedKeysArray = syncOptions.subscribeToUpdatesFor!().map(
  key => keyManager.getFieldKey(key), // This added namespace prefix
);

publishedKeysArray = syncOptions.publishUpdatesFor!().map(
  key => keyManager.getFieldKey(key), // This added namespace prefix
);
```

**After:**

```typescript
// Generate subscription patterns for granular updates or use traditional keys
let subscribedKeysArray: string[];
if (syncOptions.granularStorage?.enableImmerLike) {
  // Use pattern-based subscriptions for granular updates
  subscribedKeysArray = keyManager.getSubscriptionPatterns();
} else {
  // Pass just the field names, not full keys - HPKVStorage will add namespace prefix
  subscribedKeysArray = syncOptions.subscribeToUpdatesFor!().map(key => String(key));
}

// Pass just the field names, not full keys - HPKVStorage will add namespace prefix
const publishedKeysArray = syncOptions.publishUpdatesFor!().map(key => String(key));
```

#### Enhanced Change Listener

**Before:**

```typescript
// Simple field-based updates
const changeListener = (event: HPKVChangeEvent) => {
  // Basic state merging logic
};
```

**After:**

```typescript
// Granular change detection and application
const changeListener = (event: HPKVChangeEvent) => {
  const keyInfo = keyManager.parseStorageKey(event.key);

  if (keyInfo) {
    if (keyInfo.subkey && keyManager.isRecordField(keyInfo.field as keyof TState)) {
      // Handle granular Record field updates
      granularStateManager.applyGranularUpdates(currentState, [
        { field: keyInfo.field, subkey: keyInfo.subkey, value: event.value },
      ]);
    } else {
      // Handle traditional field updates
      // ... existing logic
    }
  }
};
```

#### Draft Update Method

**New Addition:**

```typescript
// Add updateDraft method when granular storage is enabled
if (syncOptions.granularStorage?.enableImmerLike) {
  const updateDraft = async (updater: (draft: TState) => void): Promise<void> => {
    const currentState = get();
    const draftState = granularStateManager.createDraftState(currentState);

    try {
      updater(draftState);
      // Process and sync granular changes
    } catch (error) {
      logger.error('Error in updateDraft', error);
    }
  };

  // Add to multiplayer state
  multiplayerState.updateDraft = updateDraft;
}
```

### 2. `src/hpkvStorage.ts`

#### Published Keys Validation Fix

**Before:**

```typescript
// Incorrectly checked against full keys with namespace prefix
if (!this.publishedKeys.includes(fullKey)) {
  return Promise.resolve();
}
```

**After:**

```typescript
// Correctly check against field names without prefix
if (!this.publishedKeys.includes(key)) {
  return Promise.resolve();
}
```

#### Subscription Setup Enhancement

**Before:**

```typescript
// Only supported exact key subscriptions
const fullSubscribedKeys = this.subscribedKeys.map(key => this.getFullKey(key));
```

**After:**

```typescript
// Supports both exact keys and pattern-based subscriptions
const fullSubscribedKeys = this.subscribedKeys.map(key => this.getFullKey(key));
// Pattern keys (containing '*') are used as-is for pattern subscriptions
```

#### Publish Parameter Fix

**Before:**

```typescript
// Missing publish parameter in some cases
await this.client?.set(fullKey, stringValue);
```

**After:**

```typescript
// Always include publish parameter to ensure notifications
await this.client?.set(fullKey, stringValue, true);
```

## Bug Fixes

### 1. Double-Prefixing Issue

**Problem:** Subscription keys were being double-prefixed with namespace

- `subscribedKeys`: `['namespace:field']` (already prefixed)
- `fullSubscribedKeys`: `['namespace:namespace:field']` (double prefixed)

**Solution:** Pass field names without prefix to HPKVStorage and let it add the prefix

### 2. Published Keys Validation

**Problem:** `publishedKeys` contained field names but validation checked against full keys

- `publishedKeys`: `['count', 'text']`
- `fullKey`: `'namespace:count'`
- Check: `publishedKeys.includes(fullKey)` → `false` (always rejected)

**Solution:** Check against the field name instead of the full key

### 3. Missing Publish Flag

**Problem:** Some `client.set()` calls were missing the `true` parameter for publishing notifications

**Solution:** Ensure all `client.set()` calls include the publish flag

## New Dependencies

### Runtime Dependencies

- No new external dependencies added
- Leverages existing Zustand and HPKV client libraries

### Development Dependencies

- Enhanced TypeScript types for granular storage configuration
- Additional test utilities for pattern-based subscriptions

## API Changes

### Breaking Changes

- **None** - All changes are backward compatible

### New APIs

#### 1. GranularStorageConfig

```typescript
interface GranularStorageConfig<TState> {
  enableImmerLike?: boolean;
  recordFields?: Array<keyof TState>;
  nestedObjectFields?: Array<keyof TState>;
  keyGenerators?: Partial<Record<keyof TState, (subkey: string) => string>>;
}
```

#### 2. updateDraft Method

```typescript
updateDraft?: (updater: (draft: TState) => void) => Promise<void>
```

#### 3. Special Draft Methods

```typescript
// Available on Record fields in draft state
__granular_delete__(key: string): void
```

## Test Changes

### New Test Files

- Enhanced mock support for pattern-based subscriptions
- Additional test utilities for granular storage scenarios

### Modified Test Files

#### `tests/mocks/mock-hpkv-client.ts`

- Added pattern matching support for subscriptions
- Enhanced `matchesSubscriptionPattern()` function
- Added simulation methods for granular updates

#### `tests/mocks/index.ts`

- Added `createPatternToken()` helper
- Enhanced token creation for pattern-based subscriptions

#### Integration Tests

- All existing tests continue to pass
- New test scenarios for granular storage (when enabled)

## Performance Improvements

### Network Efficiency

- **Before:** Entire Record objects sent on any change
- **After:** Only modified items sent for granular fields

### Subscription Scalability

- **Before:** Required individual subscriptions for each key
- **After:** Single pattern subscription covers all items in a field

### Memory Usage

- Minimal overhead from Proxy objects for draft state
- Temporary draft states are garbage collected after updates

## Migration Path

### For Existing Applications

1. **No immediate changes required** - existing code continues to work
2. **Optional migration** to granular storage for better collaboration
3. **Gradual adoption** - can enable granular storage for specific fields

### For New Applications

1. **Recommended approach** - use granular storage for Record fields
2. **Better developer experience** with draft-style updates
3. **Conflict-free collaboration** out of the box

## Version Compatibility

### HPKV Server Requirements

- **Minimum version:** Requires pattern-based subscription support
- **Backward compatibility:** Traditional exact-key subscriptions still supported

### Client Library Compatibility

- **Zustand:** All supported versions
- **TypeScript:** Full type safety and inference
- **Node.js/Browser:** Cross-platform compatibility maintained

## Future Enhancements

### Planned Features

1. **Nested Record support** - Granular updates for nested Record fields
2. **Array field support** - Granular updates for array indices
3. **Conflict resolution strategies** - Custom merge strategies for granular updates
4. **Performance optimizations** - Batching and debouncing for high-frequency updates

### Extensibility Points

1. **Custom key generators** - Already supported for advanced use cases
2. **Storage strategies** - Framework for additional storage patterns
3. **Change tracking** - Extensible change detection system
