# Git Universe Loading Fixes

## Problem
Git universes were loading eagerly on application startup, causing:
1. **Request spam** - Multiple network requests before user clicks Git federation tab
2. **Incomplete loading** - Git universes sometimes failed to load completely
3. **Performance issues** - Unnecessary initialization slowing down app startup

## Root Causes
1. `autoConnectToUniverse()` in `fileStorage.js` was trying Git loading by default
2. `GitFederationBootstrap` was running eagerly in `App.jsx`
3. Multiple `useEffect` hooks in `GitNativeFederation.jsx` were triggering connections immediately
4. No proper lazy loading mechanism for Git operations

## Solution: Lazy Loading Implementation

### 1. Modified `autoConnectToUniverse()` 
- Added `allowGitLoading` parameter (default: false)
- Only attempts Git loading when explicitly enabled
- Prevents eager Git requests during app startup

### 2. Updated `restoreLastSession()`
- Now accepts options parameter to control Git loading
- Passes through `allowGitLoading` flag to `autoConnectToUniverse`

### 3. Added `forceGitUniverseLoad()` function
- New function to trigger Git loading when user accesses Git federation tab
- Uses `allowGitLoading: true` to bypass lazy loading restrictions

### 4. Modified `GitNativeFederation.jsx`
- Added visibility checks to all Git-related `useEffect` hooks
- Only runs Git operations when `isVisible && isInteractive`
- Added lazy loading trigger when component becomes visible
- Added loading states and user feedback

### 5. Updated `GitFederationBootstrap.jsx`
- Added `enableEagerInit` parameter (default: false)
- Prevents eager initialization unless explicitly enabled
- Can be triggered on-demand when Git federation is accessed

### 6. Modified `App.jsx`
- Disabled eager `GitFederationBootstrap` execution
- Prevents startup request spam

### 7. Updated `Panel.jsx`
- Added lazy `GitFederationBootstrap` when Git federation tab is accessed
- Enables proper initialization only when user needs Git features

## Benefits
1. **No more request spam** - Git requests only happen when user accesses Git federation
2. **Faster startup** - App loads without unnecessary Git initialization
3. **Complete loading** - Proper initialization sequence when Git federation is accessed
4. **Better UX** - Loading indicators and status messages for user feedback
5. **Lazy loading** - Resources only loaded when needed

## Technical Details

### Files Modified
- `src/store/fileStorage.js` - Added lazy loading parameters
- `src/GitNativeFederation.jsx` - Added visibility-based loading
- `src/components/GitFederationBootstrap.jsx` - Added conditional initialization
- `src/App.jsx` - Disabled eager bootstrap
- `src/Panel.jsx` - Added lazy bootstrap for Git federation tab

### Key Functions Added
- `forceGitUniverseLoad()` - Triggers Git loading on demand
- Lazy loading state management in GitNativeFederation
- Visibility-based useEffect conditions

### Backward Compatibility
- All existing functionality preserved
- Git federation works the same from user perspective
- Only the timing of initialization has changed

## Testing
The implementation has been tested to ensure:
- No requests are made before clicking Git federation tab
- Git federation loads completely when accessed
- Proper error handling and user feedback
- No performance regression in app startup
