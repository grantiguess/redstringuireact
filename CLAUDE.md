# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

**Redstring** is a React-based cognitive interface for constructing and navigating networks of conceptual nodes. It implements a sophisticated graph-based system where nodes can contain other graphs, enabling hierarchical recursion and composition.

### Core Technologies
- **React 18** with functional components and hooks
- **Zustand** for state management (`src/store/graphStore.js`)
- **React DnD** for drag-and-drop interactions
- **Vite** for build tooling with hot reload
- **Vitest** for testing
- **Framer Motion** for animations
- **Web Workers** for canvas operations (`src/canvasWorker.js`)

### Key Architecture Patterns

**Prototype/Instance Model**: The system uses a dual-layer architecture:
- **Node Prototypes** (`nodePrototypes` Map): Define the "type" of a node (name, color, description, definitions)
- **Node Instances** (`graph.instances` Map): Position and scale data for prototype instances within specific graphs
- **Edges** connect instance IDs, not prototype IDs

**Context-Aware Definitions**: Nodes can have multiple definition graphs, with context-specific active definitions tracked via `nodeDefinitionIndices` Map using `"nodeId-graphId"` composite keys.

**Recursive Graph Structure**: Nodes can define graphs, and graphs can contain instances of nodes, enabling infinite recursive nesting.

## Central Components

### NodeCanvas.jsx
The main orchestration component handling:
- SVG-based graph rendering
- Mouse/touch/keyboard interactions
- Pan/zoom with sophisticated input device detection
- State management coordination
- PieMenu system for contextual actions
- Drag-and-drop operations

### Store Management (src/store/graphStore.js)
Zustand store with auto-save middleware managing:
- Graph and node prototype data (using Maps for performance)
- UI state (active graph, expanded nodes, saved nodes)
- Tab management for right panel
- Context-aware definition tracking

### Core Data Structures (src/core/)
- **Graph.js**: Graph class with nodes/edges Maps
- **Node.js**: Node class extending Entry with position/definition data
- **Edge.js**: Edge class with directional arrow system

## Important Implementation Details

### Input Device Detection
The `handleWheel` function in NodeCanvas.jsx implements sophisticated cross-platform input detection:
- **Mac Trackpad**: Ctrl+scroll triggers zoom, fractional deltas trigger pan
- **Mouse Wheel**: Large integer deltas trigger zoom
- **Pattern Analysis**: Maintains rolling history of delta values for reliable device identification

### PieMenu System
Complex state management for contextual menus:
- `selectedNodeIdForPieMenu`: Target node for menu
- `isTransitioningPieMenu`: Animation state management
- `onExitAnimationComplete`: Callback for animation coordination
- Dynamic button generation based on node context

### File Management & RedstringMenu
- **Universe Files**: `.redstring` format for complete workspace state
- **Auto-save**: Debounced saves to prevent data loss
- **RedstringMenu**: Animated header menu with nested submenus for file operations
- **Recent Files**: Dynamic loading of recent `.redstring` files

### Dynamic Description Feature
- Context-aware descriptions that adapt to active definition graphs
- Dynamic height calculation using DOM measurement
- "Chin" expansion effect for expanded nodes
- Seamless panel-canvas synchronization

## Testing Strategy

Tests are located in `test/` directory:
- `core/`: Unit tests for Graph, Node, Edge classes
- `store/`: Store functionality tests
- Component tests alongside components (e.g., `NodeCanvas.test.jsx`)

## Development Guidelines

1. **State Updates**: Always use Zustand store actions, never mutate state directly
2. **Map Usage**: Store uses Maps for performance - ensure proper serialization for file I/O
3. **Context Awareness**: Use composite keys (`"nodeId-graphId"`) for context-specific state
4. **Animation Coordination**: Respect PieMenu animation lifecycle and state transitions
5. **Input Handling**: Consider device-specific behavior in interaction code
6. **Recursive Safety**: Handle infinite nesting cases in graph traversal logic

## Common Patterns

- **Hydrated Nodes**: Combine prototype + instance data using `getHydratedNodesForGraph` selector
- **Definition Navigation**: Use `onNavigateDefinition` callbacks for context-aware definition switching
- **Cleanup**: Use `cleanupOrphanedData` for removing unreferenced prototypes/graphs
- **Edge Directionality**: Arrows stored as Set of node IDs in `edge.directionality.arrowsToward`
- **Composite Keys**: Pattern of `"nodeId-graphId"` for context-specific state tracking

## Key Files to Understand

- `src/NodeCanvas.jsx`: Main rendering and interaction logic
- `src/store/graphStore.js`: State management and data model
- `src/core/Graph.js`: Core graph data structure
- `src/Panel.jsx`: Right panel interface
- `src/PieMenu.jsx`: Contextual menu system
- `aiinstructions.txt`: Detailed project philosophy and comprehensive development patterns