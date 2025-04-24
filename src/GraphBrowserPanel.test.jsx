import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { vi } from 'vitest';
import GraphBrowserPanel from './GraphBrowserPanel';
import useGraphStore from './store/graphStore';

// Mock the useGraphStore hook
vi.mock('./store/graphStore');

// Helper function to set up the mock store state and actions
const setupMockStore = (state) => {
  const mockActions = {
    openGraphTab: vi.fn(),
  };
  // Mock the return value of the hook
  useGraphStore.mockReturnValue({ ...state, ...mockActions });
  return mockActions;
};

describe('GraphBrowserPanel', () => {
  const mockGraphId1 = 'uuid-graph-1';
  const mockGraphId2 = 'uuid-graph-2';

  const mockNodesObject = {
    'node-root-1': { id: 'node-root-1', name: 'Root Node A', parentDefinitionNodeId: null, graphId: mockGraphId1 },
    'node-root-2': { id: 'node-root-2', name: 'Root Node B', parentDefinitionNodeId: null, graphId: mockGraphId2 },
    'node-child-1a': { id: 'node-child-1a', name: 'Child 1A', parentDefinitionNodeId: 'node-root-1', graphId: mockGraphId1 },
    'node-child-1b': { id: 'node-child-1b', name: 'Child 1B', parentDefinitionNodeId: 'node-root-1', graphId: mockGraphId1 },
    'node-grandchild-1a1': { id: 'node-grandchild-1a1', name: 'Grandchild 1A1', parentDefinitionNodeId: 'node-child-1a', graphId: mockGraphId1 },
    'node-child-2a': { id: 'node-child-2a', name: 'Child 2A', parentDefinitionNodeId: 'node-root-2', graphId: mockGraphId2 },
  };

  const initialNodesMap = new Map(Object.entries(mockNodesObject));

  const initialState = {
    nodes: initialNodesMap,
  };

  let mockActions;

  beforeEach(() => {
    vi.clearAllMocks();
    mockActions = setupMockStore(initialState);
  });

  test('renders the panel header', () => {
    render(<GraphBrowserPanel />);
    expect(screen.getByText('Graph Browser')).toBeInTheDocument();
  });

  test('renders hierarchical node structure correctly', () => {
    render(<GraphBrowserPanel />);

    // Check for root nodes
    expect(screen.getByText('Root Node A')).toBeInTheDocument();
    expect(screen.getByText('Root Node B')).toBeInTheDocument();

    // Check for children (assuming default expanded state)
    expect(screen.getByText('Child 1A')).toBeInTheDocument();
    expect(screen.getByText('Child 1B')).toBeInTheDocument();
    expect(screen.getByText('Child 2A')).toBeInTheDocument();

    // Check for grandchild
    expect(screen.getByText('Grandchild 1A1')).toBeInTheDocument();
  });

  test('calls openGraphTab with correct graphId when a node item is clicked', () => {
    render(<GraphBrowserPanel />);

    // Find a specific node item (e.g., Child 1B)
    const nodeItemToClick = screen.getByText('Child 1B');
    fireEvent.click(nodeItemToClick);

    // Check if the store action was called with the correct graph ID
    expect(mockActions.openGraphTab).toHaveBeenCalledTimes(1);
    expect(mockActions.openGraphTab).toHaveBeenCalledWith(mockGraphId1); // Child 1B belongs to mockGraphId1

    // Click another node
    const anotherNodeItem = screen.getByText('Child 2A');
    fireEvent.click(anotherNodeItem);
    expect(mockActions.openGraphTab).toHaveBeenCalledTimes(2);
    expect(mockActions.openGraphTab).toHaveBeenCalledWith(mockGraphId2); // Child 2A belongs to mockGraphId2
  });

  test('toggles expansion state when toggle icon is clicked', () => {
    render(<GraphBrowserPanel />);

    // Find Root Node A and its toggle icon
    const rootNodeAItem = screen.getByText('Root Node A').closest('.node-item');
    const toggleIconA = rootNodeAItem.querySelector('.toggle-icon');

    // Verify children are initially visible (default expanded)
    expect(screen.getByText('Child 1A')).toBeVisible();
    expect(screen.getByText('Child 1B')).toBeVisible();
    expect(toggleIconA).toHaveTextContent('▼'); // Expanded icon

    // Click the toggle icon to collapse
    fireEvent.click(toggleIconA);

    // Verify children are no longer rendered in the document
    expect(screen.queryByText('Child 1A')).not.toBeInTheDocument();
    expect(screen.queryByText('Child 1B')).not.toBeInTheDocument();
    // Also check grandchild is not rendered
    expect(screen.queryByText('Grandchild 1A1')).not.toBeInTheDocument();
    expect(toggleIconA).toHaveTextContent('▶'); // Collapsed icon

    // Click again to expand
    fireEvent.click(toggleIconA);
    expect(screen.getByText('Child 1A')).toBeVisible();
    expect(screen.getByText('Child 1B')).toBeVisible();
    expect(screen.getByText('Grandchild 1A1')).toBeVisible(); // Assuming grandchild is expanded by default too
    expect(toggleIconA).toHaveTextContent('▼'); // Expanded icon
  });

  test('clicking toggle icon does not trigger openGraphTab', () => {
    render(<GraphBrowserPanel />);
    const rootNodeAItem = screen.getByText('Root Node A').closest('.node-item');
    const toggleIconA = rootNodeAItem.querySelector('.toggle-icon');

    fireEvent.click(toggleIconA);
    expect(mockActions.openGraphTab).not.toHaveBeenCalled();
  });

  test('renders empty state when no nodes are provided', () => {
    setupMockStore({ nodes: new Map() }); // Override store state with an empty Map
    render(<GraphBrowserPanel />);
    expect(screen.getByText('No nodes loaded.')).toBeInTheDocument();
    expect(screen.queryByText('Graph Browser')).not.toBeInTheDocument(); // Header shouldn't render
  });
}); 