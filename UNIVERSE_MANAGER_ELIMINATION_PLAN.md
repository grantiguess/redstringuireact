# UniverseManager Elimination Plan

## Current State (2025-01)

### The Problem
We have TWO services managing universe state:
- **`universeManager.js`** - 2,283 lines, has all the actual logic
- **`universeBackend.js`** - 1,587 lines, just a facade that delegates to universeManager

This creates:
- ❌ Duplicate state (fileHandles, gitSyncEngines in BOTH services)
- ❌ Synchronization bugs (fileHandles must be manually synced between them)
- ❌ Unclear API (which one to use?)
- ❌ Circular dependency issues
- ❌ 1,500+ lines of pointless delegation code

### What We Discovered

**Experiment Result**: We deactivated `universeManager.js` and the app **compiled successfully** with only 4 simple changes:
1. `src/backend/universes/index.js` - Changed re-export to use universeBackend
2. `src/NodeCanvas.jsx` - Changed one import
3. `vite.config.js` - Updated build config
4. (universeBackend still tries to load universeManager internally - needs fixing)

**The build worked!** This means the external API surface is minimal.

### The Core Issue

`universeBackend.js` is a **hollow facade**. It has 39 places where it calls `universeManager.method()`. Examples:
```javascript
// universeBackend.js just forwards everything:
getAllUniverses() {
  return universeManager.getAllUniverses(); // Line 336
}

getUniverse(slug) {
  return universeManager.getUniverse(slug); // Line 874
}

createUniverse(name, options) {
  return universeManager.createUniverse(name, options); // Line 826
}
// ...35 more like this
```

## The Solution

### Step 1: Copy Core State & Methods into universeBackend
```javascript
class UniverseBackend {
  constructor() {
    this.universes = new Map(); // FROM universeManager
    this.activeUniverseSlug = null; // FROM universeManager
    this.fileHandles = new Map(); // Already has this
    this.gitSyncEngines = new Map(); // Already has this
    // ... rest of state
  }
  
  // Add these methods WITH implementations (not delegation):
  - loadFromStorage()
  - getAllUniverses()
  - getUniverse(slug)
  - createUniverse(name, options)
  - updateUniverse(slug, updates)
  - deleteUniverse(slug)
  - loadUniverseData(universe)
  - saveActiveUniverse(storeState)
  - loadFromGit(universe)
  - loadFromLocalFile(universe)
  - loadFromBrowserStorage(universe)
  - saveToGit(universe, data)
  - saveToLocalFile(universe, data)
  - saveToBrowserStorage(universe, data)
  // ... ~20 more core methods
}
```

### Step 2: Replace All 39 Delegation Calls
Search for `universeManager.` in `universeBackend.js` and replace with `this.`

### Step 3: Remove universeManager Loading
Remove lines 10-11 and 76-82 that try to load universeManager

### Step 4: Delete universeManager.js
Once universeBackend is self-contained, delete the old file

### Step 5: Update External References
Only 6 files import universeManager:
- `src/services/universeBackend.js` ← Will be fixed in step 3
- `src/services/gitSyncEngine.js` ← Check if it really needs it
- `src/backend/universes/index.js` ← Already updated
- `src/NodeCanvas.jsx` ← Already updated
- `src/components/FederationBootstrap.jsx` ← Update to use universeBackend
- `src/components/UniverseBrowser.jsx` ← Update to use universeBackend

## Benefits

After consolidation:
- ✅ Single source of truth for universe state
- ✅ No more manual synchronization between services
- ✅ ~1,500 lines of delegation code deleted
- ✅ Clear, simple API
- ✅ No more circular dependencies
- ✅ Bugs like "file handle not found" become impossible

## Estimated Effort

- **Time**: 2-3 hours of focused work
- **Risk**: Medium (touching core system)
- **Testing**: Need to verify all universe operations still work

## Why Not Done Yet

The original plan was to gradually migrate logic from universeManager into universeBackend, but this was never completed. universeBackend ended up as just a wrapper.

**Now is the time to finish it.**

## Status

- [ ] Copy core methods from universeManager to universeBackend
- [ ] Replace 39 delegation calls with `this.`
- [ ] Remove universeManager import/loading code
- [ ] Update 4 remaining external references
- [ ] Delete universeManager.js
- [ ] Test all universe operations
- [ ] Update documentation

## Notes

- Keep the changes in the `src/backend/universes/index.js` adapter - it provides backward compatibility
- The SOURCE_OF_TRUTH constant can stay in the adapter
- Consider adding unit tests before making the change to ensure no regressions

