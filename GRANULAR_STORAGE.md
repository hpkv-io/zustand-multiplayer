# Granular Storage Feature

## Overview

The Granular Storage feature enables conflict-free collaborative editing by storing Record/array items as individual keys in HPKV instead of replacing entire objects. This eliminates conflicts when multiple users edit different items in collections simultaneously.

## Key Benefits

- ✅ **Eliminates array replacement conflicts** - Multiple users can edit different items without overwriting each other
- ✅ **Efficient network usage** - Only changed items are synchronized, not entire collections
- ✅ **Dynamic key subscription** - Uses HPKV's pattern-based subscriptions to automatically subscribe to new items
- ✅ **Immer-like developer experience** - Familiar draft-style API for making updates
- ✅ **Full backward compatibility** - Existing code continues to work unchanged

## Basic Usage

### 1. Enable Granular Storage

```typescript
import { createMultiplayerStore } from '@hpkv/zustand-multiplayer';

interface TodoState {
  todos: Record<string, { text: string; completed: boolean }>;
  metadata: { title: string; description: string };
}

const store = createMultiplayerStore<TodoState>(
  (set, get) => ({
    todos: {},
    metadata: { title: '', description: '' },
  }),
  {
    namespace: 'todo-app',
    apiKey: 'your-api-key',
    apiBaseUrl: 'https://api.hpkv.dev',
    granularStorage: {
      enableImmerLike: true,
      recordFields: ['todos'], // Store todos as individual keys
      nestedObjectFields: ['metadata'], // Use JSON patch for metadata
    },
  },
);
```

### 2. Use Draft-Style Updates

```typescript
// Multiple users can edit different todos simultaneously without conflicts
await store.getState().updateDraft?.(draft => {
  // User A edits todo-1
  draft.todos['todo-1'] = { text: 'Updated by User A', completed: false };

  // User B edits todo-2 (no conflict!)
  draft.todos['todo-2'] = { text: 'Updated by User B', completed: true };

  // Delete a todo
  draft.todos.__granular_delete__('todo-3');

  // Update nested objects
  draft.metadata.title = 'New Title';
});
```

### 3. Traditional Updates Still Work

```typescript
// Standard Zustand updates continue to work
store.getState().set(state => ({
  ...state,
  todos: {
    ...state.todos,
    'new-todo': { text: 'Added traditionally', completed: false },
  },
}));
```

## Configuration Options

### GranularStorageConfig Interface

```typescript
interface GranularStorageConfig<TState> {
  /** Enable Immer-like draft updates */
  enableImmerLike?: boolean;

  /** Record/array fields to store as individual keys */
  recordFields?: Array<keyof TState>;

  /** Nested object fields that support JSON patch operations */
  nestedObjectFields?: Array<keyof TState>;

  /** Custom key generators for record fields */
  keyGenerators?: Partial<Record<keyof TState, (subkey: string) => string>>;
}
```

### Configuration Examples

#### Basic Record Storage

```typescript
granularStorage: {
  enableImmerLike: true,
  recordFields: ['todos', 'users', 'posts'],
}
```

#### Advanced Configuration

```typescript
granularStorage: {
  enableImmerLike: true,
  recordFields: ['todos', 'users'],
  nestedObjectFields: ['settings', 'metadata'],
  keyGenerators: {
    todos: (id) => `todo_${id}`,
    users: (id) => `user_${id}`,
  },
}
```

## API Reference

### updateDraft Method

The `updateDraft` method is automatically added to your store state when granular storage is enabled:

```typescript
updateDraft?: (updater: (draft: TState) => void) => Promise<void>
```

#### Usage Examples

```typescript
// Add new items
await updateDraft(draft => {
  draft.todos['new-id'] = { text: 'New todo', completed: false };
});

// Update existing items
await updateDraft(draft => {
  draft.todos['existing-id'].completed = true;
});

// Delete items using special method
await updateDraft(draft => {
  draft.todos.__granular_delete__('item-to-delete');
});

// Batch operations
await updateDraft(draft => {
  draft.todos['todo-1'].text = 'Updated';
  draft.todos['todo-2'].completed = true;
  draft.todos.__granular_delete__('todo-3');
  draft.metadata.title = 'New Title';
});
```

### Special Methods

#### **granular_delete**(key: string)

Use this method to delete items from Record fields:

```typescript
await updateDraft(draft => {
  // ✅ Correct way to delete
  draft.todos.__granular_delete__('todo-id');

  // ❌ Don't use delete operator
  // delete draft.todos['todo-id']; // This won't sync properly
});
```

## Storage Strategy

### How Items Are Stored

#### Record Fields

- **Traditional**: `namespace:todos` → `{"todo-1": {...}, "todo-2": {...}}`
- **Granular**:
  - `namespace:todos:todo-1` → `{...}`
  - `namespace:todos:todo-2` → `{...}`

#### Subscription Patterns

- **Traditional**: Subscribe to exact key `namespace:todos`
- **Granular**: Subscribe to pattern `namespace:todos:*`

### Key Generation

Default key format: `namespace:fieldName:itemKey`

Custom key generators:

```typescript
keyGenerators: {
  todos: (id) => `todo_${id}`, // Results in: namespace:todos:todo_123
  users: (id) => `user_${id}`, // Results in: namespace:users:user_456
}
```

## Migration Guide

### From Traditional to Granular Storage

1. **Add granular configuration**:

```typescript
// Before
const store = createMultiplayerStore(stateCreator, {
  namespace: 'my-app',
  // ... other options
});

// After
const store = createMultiplayerStore(stateCreator, {
  namespace: 'my-app',
  granularStorage: {
    enableImmerLike: true,
    recordFields: ['todos', 'users'], // Specify Record fields
  },
  // ... other options
});
```

2. **Update state updates to use drafts**:

```typescript
// Before
set(state => ({
  ...state,
  todos: {
    ...state.todos,
    [newId]: newTodo,
  },
}));

// After (preferred for granular updates)
await updateDraft?.(draft => {
  draft.todos[newId] = newTodo;
});

// Or keep using traditional updates (still works)
set(state => ({
  ...state,
  todos: {
    ...state.todos,
    [newId]: newTodo,
  },
}));
```

3. **Update deletions**:

```typescript
// Before
set(state => {
  const newTodos = { ...state.todos };
  delete newTodos[todoId];
  return { ...state, todos: newTodos };
});

// After
await updateDraft?.(draft => {
  draft.todos.__granular_delete__(todoId);
});
```

## Technical Implementation

### Architecture Components

1. **StorageKeyManager**: Generates storage keys and subscription patterns
2. **GranularStateManager**: Manages draft states and tracks changes
3. **Enhanced HPKV Storage**: Supports pattern-based subscriptions
4. **Proxy-based Change Tracking**: Monitors Record field modifications

### Pattern-Based Subscriptions

The feature leverages HPKV's pattern-based subscription system:

```typescript
// Subscribe to all items in a field
subscribeKeys: ['namespace:todos:*'];

// Matches:
// - namespace:todos:item1
// - namespace:todos:item2
// - namespace:todos:any-key
```

### Change Detection Flow

1. **Draft Creation**: Create Proxy-wrapped state copy
2. **Change Tracking**: Monitor Record field modifications
3. **Granular Sync**: Sync only changed items to HPKV
4. **Pattern Notification**: Other clients receive updates via pattern subscriptions

## Performance Considerations

### Network Efficiency

- **Before**: Sync entire array on any change
- **After**: Sync only modified items

### Memory Usage

- Minimal overhead from Proxy objects
- Draft states are temporary and garbage collected

### Subscription Scalability

- Pattern subscriptions scale better than individual key subscriptions
- Automatic subscription to new items without token regeneration

## Troubleshooting

### Common Issues

1. **updateDraft is undefined**

   - Ensure `enableImmerLike: true` is set
   - Check that granular storage is properly configured

2. **Changes not syncing**

   - Verify field is listed in `recordFields`
   - Use `__granular_delete__` for deletions
   - Check network connectivity and HPKV credentials

3. **Type errors with drafts**
   - Ensure your state interface includes the `updateDraft` method
   - Use proper TypeScript types for Record fields

### Debug Logging

Enable debug logging to troubleshoot issues:

```typescript
const store = createMultiplayerStore(stateCreator, {
  // ... other options
  logLevel: 'debug', // Enable detailed logging
});
```

Look for these log messages:

- `[GRANULAR]` - Granular storage operations
- `[DRAFT]` - Draft state management
- `[PATTERN]` - Pattern subscription events

## Examples

### Todo Application

```typescript
interface TodoState {
  todos: Record<
    string,
    {
      text: string;
      completed: boolean;
      createdAt: number;
    }
  >;
  filter: 'all' | 'active' | 'completed';
}

const todoStore = createMultiplayerStore<TodoState>(
  (set, get) => ({
    todos: {},
    filter: 'all',
  }),
  {
    namespace: 'todo-app',
    apiKey: process.env.HPKV_API_KEY!,
    apiBaseUrl: 'https://api.hpkv.dev',
    granularStorage: {
      enableImmerLike: true,
      recordFields: ['todos'],
    },
  },
);

// Add todo
const addTodo = async (text: string) => {
  const id = crypto.randomUUID();
  await todoStore.getState().updateDraft?.(draft => {
    draft.todos[id] = {
      text,
      completed: false,
      createdAt: Date.now(),
    };
  });
};

// Toggle todo
const toggleTodo = async (id: string) => {
  await todoStore.getState().updateDraft?.(draft => {
    if (draft.todos[id]) {
      draft.todos[id].completed = !draft.todos[id].completed;
    }
  });
};

// Delete todo
const deleteTodo = async (id: string) => {
  await todoStore.getState().updateDraft?.(draft => {
    draft.todos.__granular_delete__(id);
  });
};
```

### Real-time Collaboration Dashboard

```typescript
interface DashboardState {
  widgets: Record<
    string,
    {
      type: 'chart' | 'table' | 'metric';
      position: { x: number; y: number };
      size: { width: number; height: number };
      config: any;
    }
  >;
  users: Record<
    string,
    {
      name: string;
      cursor: { x: number; y: number };
      color: string;
    }
  >;
  settings: {
    theme: 'light' | 'dark';
    autoSave: boolean;
  };
}

const dashboardStore = createMultiplayerStore<DashboardState>(
  (set, get) => ({
    widgets: {},
    users: {},
    settings: { theme: 'light', autoSave: true },
  }),
  {
    namespace: 'dashboard',
    apiKey: process.env.HPKV_API_KEY!,
    apiBaseUrl: 'https://api.hpkv.dev',
    granularStorage: {
      enableImmerLike: true,
      recordFields: ['widgets', 'users'],
      nestedObjectFields: ['settings'],
    },
  },
);

// Multiple users can edit different widgets simultaneously
const updateWidget = async (widgetId: string, updates: Partial<Widget>) => {
  await dashboardStore.getState().updateDraft?.(draft => {
    if (draft.widgets[widgetId]) {
      Object.assign(draft.widgets[widgetId], updates);
    }
  });
};

// Update user cursor position (high frequency updates)
const updateCursor = async (userId: string, position: { x: number; y: number }) => {
  await dashboardStore.getState().updateDraft?.(draft => {
    if (draft.users[userId]) {
      draft.users[userId].cursor = position;
    }
  });
};
```

## Best Practices

1. **Use granular updates for Record fields**: Store collections as Records and use `updateDraft` for modifications
2. **Batch related changes**: Group multiple updates in a single `updateDraft` call
3. **Use meaningful keys**: Choose descriptive, unique keys for Record items
4. **Handle concurrent edits gracefully**: Design UI to show real-time changes from other users
5. **Test offline scenarios**: Ensure your app handles network interruptions properly

## Limitations

1. **Record fields only**: Granular storage only works with Record<string, T> fields
2. **No nested Records**: Nested Record fields within Record items aren't supported for granular updates
3. **Key immutability**: Once an item is created, its key shouldn't change
4. **Pattern subscription dependency**: Requires HPKV server support for pattern-based subscriptions

## Version Compatibility

- **Minimum HPKV version**: Requires HPKV server with pattern subscription support
- **Zustand compatibility**: Works with all supported Zustand versions
- **TypeScript**: Full TypeScript support with proper type inference
