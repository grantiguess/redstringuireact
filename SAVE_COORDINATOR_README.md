# SaveCoordinator - Centralized Save Management System

## Overview

The SaveCoordinator is a new centralized system that intelligently manages saving across local files, Git repositories, and browser storage. It replaces the previous fragmented auto-save mechanisms with a unified, tiered approach optimized for GitHub free tier usage.

## Key Features

### 🎯 **Tiered Save Strategies**
- **IMMEDIATE**: Prototype changes (saved immediately, commit within 1s)
- **HIGH**: Node placement, connections (saved in 2s, commit in 5s)  
- **NORMAL**: Position updates during dragging (saved in 5s, commit in 15s)
- **LOW**: Viewport changes, UI state (saved in 10s, commit in 60s)

### 🚫 **GitHub Free Tier Optimized**
- Minimum 5-second intervals between Git commits
- Intelligent rate limiting and backoff
- Smart batching of rapid changes
- Prevents API limit violations

### 🧠 **Smart Change Detection**
- Context-aware change classification
- Drag operation detection and debouncing
- Content-only hashing (ignores viewport changes)
- Prevents redundant saves

### 🔄 **Automatic Initialization**
- GitFederationBootstrap automatically initializes SaveCoordinator
- Works with or without GitNativeFederation tab selection
- Maintains consistent state synchronization

## Architecture

```
[GraphStore] → [SaveCoordinator] → [Local File Storage]
                     ↓
               [GitSyncEngine] → [GitHub Repository]
```

### Integration Points

1. **GraphStore Middleware**: Intercepts all state changes and categorizes them
2. **SaveCoordinator**: Manages save timing and coordination
3. **GitFederationBootstrap**: Initializes the system at app startup
4. **GitNativeFederation**: Uses SaveCoordinator for manual saves

## Usage

### Automatic Operation

The SaveCoordinator runs automatically once initialized. It listens for state changes from the GraphStore and applies appropriate save strategies based on change type.

### Manual Saves

```javascript
// Force immediate save (e.g., Ctrl+S)
await saveCoordinator.forceSave(storeState);

// Check status
const status = saveCoordinator.getStatus();
console.log('Pending changes:', status.pendingChanges);
```

### Change Context

The GraphStore middleware now supports change context to help the SaveCoordinator make better decisions:

```javascript
// In store actions
api.setChangeContext({ type: 'prototype_create', target: 'prototype' });
// ... make changes ...
```

## Benefits

### For Users
- **Responsive**: Critical changes saved immediately
- **Reliable**: Never lose work due to failed saves
- **Non-intrusive**: Viewport changes don't spam commits
- **GitHub-friendly**: Won't hit API rate limits

### For Developers
- **Unified**: Single point of save coordination
- **Extensible**: Easy to add new save strategies
- **Debuggable**: Comprehensive status reporting
- **Testable**: Isolated save logic

## Configuration

### Save Priorities

```javascript
const SAVE_PRIORITIES = {
  IMMEDIATE: {
    localDelay: 0,        // Save immediately
    gitDelay: 1000,       // Commit in 1s
  },
  HIGH: {
    localDelay: 2000,     // Save in 2s  
    gitDelay: 5000,       // Commit in 5s
  },
  // ... etc
};
```

### Rate Limiting

```javascript
this.minGitInterval = 5000; // 5 seconds minimum between commits
this.maxPendingChanges = 50; // Prevent memory buildup
```

## Troubleshooting

### SaveCoordinator Not Working

1. Check if it's initialized:
   ```javascript
   console.log(saveCoordinator.getStatus());
   ```

2. Verify dependencies:
   - FileStorage module loaded
   - GitSyncEngine available
   - UniverseManager connected

3. Check for errors:
   ```javascript
   saveCoordinator.onStatusChange((status) => {
     if (status.type === 'error') {
       console.error('Save error:', status.message);
     }
   });
   ```

### High Save Frequency

The SaveCoordinator automatically handles this through:
- Change type classification
- Rate limiting for Git commits
- Dragging detection and debouncing
- Redundancy prevention

### GitHub API Limits

The system is designed to respect GitHub's rate limits:
- 5-second minimum intervals between commits
- Exponential backoff on errors
- Batching of rapid changes
- Smart priority-based queuing

## Migration Notes

### Removed Systems
- ❌ Old `autoSaveMiddleware` in graphStore
- ❌ Direct `notifyChanges()` calls
- ❌ Independent GitSyncEngine auto-commits
- ❌ Fragmented save timing

### Added Systems  
- ✅ Unified SaveCoordinator
- ✅ Change context tracking
- ✅ Tiered save strategies
- ✅ Automatic initialization
- ✅ Status monitoring

## Testing

The SaveCoordinator can be tested in various scenarios:

```javascript
// Test rapid changes (should debounce)
for (let i = 0; i < 10; i++) {
  api.setChangeContext({ type: 'node_position' });
  updateNodeInstance(graphId, instanceId, { x: i * 10 });
}

// Test priority classification
api.setChangeContext({ type: 'prototype_create' });
addNodePrototype({ name: 'Test Node' });
// Should trigger IMMEDIATE save

// Test status monitoring
console.log(saveCoordinator.getStatus());
```

## Future Enhancements

- **Conflict Resolution**: Automatic merge conflict handling
- **Offline Support**: Queue changes when disconnected
- **Performance Metrics**: Save timing analytics
- **User Preferences**: Configurable save intervals
- **Multi-Repository**: Support for multiple Git remotes