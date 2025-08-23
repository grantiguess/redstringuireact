import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import SemanticDiscovery from '../../src/components/SemanticDiscovery.jsx';

// Mock the services
vi.mock('../../src/services/knowledgeFederation.js', () => ({
  knowledgeFederation: {
    importKnowledgeCluster: vi.fn()
  }
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  Search: vi.fn(() => 'Search'),
  Globe: vi.fn(() => 'Globe'),
  Database: vi.fn(() => 'Database'),
  Code: vi.fn(() => 'Code'),
  ChevronDown: vi.fn(() => 'ChevronDown'),
  ChevronRight: vi.fn(() => 'ChevronRight'),
  Sparkles: vi.fn(() => 'Sparkles'),
  Settings: vi.fn(() => 'Settings'),
  Plus: vi.fn(() => 'Plus'),
  ExternalLink: vi.fn(() => 'ExternalLink'),
  CheckCircle: vi.fn(() => 'CheckCircle'),
  AlertCircle: vi.fn(() => 'AlertCircle'),
  Info: vi.fn(() => 'Info'),
  XCircle: vi.fn(() => 'XCircle')
}));

// Mock the store
vi.mock('../../src/store/graphStore.js', () => ({
  default: vi.fn(() => ({
    activeGraphId: 'test-graph',
    nodePrototypes: new Map([
      ['prototype-1', { id: 'prototype-1', name: 'Test Node', color: '#8B0000' }]
    ]),
    graphs: new Map([
      ['test-graph', { id: 'test-graph', instances: new Map() }]
    ])
  }))
}));

describe('SemanticDiscovery', () => {
  const mockNodeData = {
    id: 'test-node',
    name: 'Test Node',
    description: 'A test node for testing'
  };

  const mockOnMaterializeConnection = vi.fn();
  const mockOnNodeUpdate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no node data is provided', () => {
    render(
      <SemanticDiscovery
        nodeData={null}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    expect(screen.getByText('Select a node to discover semantic connections')).toBeInTheDocument();
  });

  it('renders all four discovery levels', () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    expect(screen.getByText('Discover Related')).toBeInTheDocument();
    expect(screen.getByText('Guided Search')).toBeInTheDocument();
    expect(screen.getByText('Custom Links')).toBeInTheDocument();
    expect(screen.getByText('Advanced Queries')).toBeInTheDocument();
  });

  it('shows simple discovery button with correct text', () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const discoverButton = screen.getByText('Discover');
    expect(discoverButton).toBeInTheDocument();
    expect(discoverButton).toHaveClass('discovery-button', 'primary');
  });

  it('expands guided search section when clicked', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const guidedHeader = screen.getByText('Guided Search').closest('.level-header');
    fireEvent.click(guidedHeader);

    await waitFor(() => {
      expect(screen.getByText('Data Sources')).toBeInTheDocument();
      expect(screen.getByText('Search Depth')).toBeInTheDocument();
      expect(screen.getByText('Max Entities')).toBeInTheDocument();
    });
  });

  it('expands advanced queries section when clicked', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const advancedHeader = screen.getByText('Advanced Queries').closest('.level-header');
    fireEvent.click(advancedHeader);

    await waitFor(() => {
      expect(screen.getByText('SPARQL Query')).toBeInTheDocument();
      expect(screen.getByText('Saved Queries')).toBeInTheDocument();
    });
  });

  it('shows guided search options when expanded', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const guidedHeader = screen.getByText('Guided Search').closest('.level-header');
    fireEvent.click(guidedHeader);

    await waitFor(() => {
      // Check for data source checkboxes
      expect(screen.getByLabelText('wikidata')).toBeInTheDocument();
      expect(screen.getByLabelText('dbpedia')).toBeInTheDocument();
      expect(screen.getByLabelText('wikipedia')).toBeInTheDocument();
      
      // Check for range sliders
      expect(screen.getByDisplayValue('1')).toBeInTheDocument(); // Search Depth
      expect(screen.getByDisplayValue('5')).toBeInTheDocument(); // Max Entities
    });
  });

  it('shows advanced query textarea when expanded', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const advancedHeader = screen.getByText('Advanced Queries').closest('.level-header');
    fireEvent.click(advancedHeader);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Enter your SPARQL query here...');
      expect(textarea).toBeInTheDocument();
      expect(textarea).toHaveClass('query-textarea');
    });
  });

  it('allows typing in advanced query textarea', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const advancedHeader = screen.getByText('Advanced Queries').closest('.level-header');
    fireEvent.click(advancedHeader);

    await waitFor(() => {
      const textarea = screen.getByPlaceholderText('Enter your SPARQL query here...');
      fireEvent.change(textarea, { target: { value: 'SELECT * WHERE { ?s ?p ?o }' } });
      expect(textarea.value).toBe('SELECT * WHERE { ?s ?p ?o }');
    });
  });

  it('shows guided search button when guided section is expanded', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const guidedHeader = screen.getByText('Guided Search').closest('.level-header');
    fireEvent.click(guidedHeader);

    await waitFor(() => {
      const searchButton = screen.getByText('Search with Options');
      expect(searchButton).toBeInTheDocument();
      expect(searchButton).toHaveClass('discovery-button', 'secondary');
    });
  });

  it('shows execute query button when advanced section is expanded', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const advancedHeader = screen.getByText('Advanced Queries').closest('.level-header');
    fireEvent.click(advancedHeader);

    await waitFor(() => {
      const executeButton = screen.getByText('Execute Query');
      expect(executeButton).toBeInTheDocument();
      expect(executeButton).toHaveClass('discovery-button', 'secondary');
      expect(executeButton).toBeDisabled(); // Should be disabled when no query
    });
  });

  it('renders custom links section', () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    expect(screen.getByText('Custom Links')).toBeInTheDocument();
    expect(screen.getByText('Add DOIs, Wikipedia links, and other external references')).toBeInTheDocument();
  });

  it('expands custom links section when clicked', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const customLinksHeader = screen.getByText('Custom Links').closest('.level-header');
    fireEvent.click(customLinksHeader);

    await waitFor(() => {
      expect(screen.getByText('Existing Links')).toBeInTheDocument();
      expect(screen.getByText('No custom links added yet')).toBeInTheDocument();
    });
  });

  it('shows link type selector and input when custom links section is expanded', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const customLinksHeader = screen.getByText('Custom Links').closest('.level-header');
    fireEvent.click(customLinksHeader);

    await waitFor(() => {
      expect(screen.getByText('DOI')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Enter DOI...')).toBeInTheDocument();
      expect(screen.getByText('Plus')).toBeInTheDocument();
    });
  });

  it('allows adding custom links', async () => {
    render(
      <SemanticDiscovery
        nodeData={mockNodeData}
        onMaterializeConnection={mockOnMaterializeConnection}
        onNodeUpdate={mockOnNodeUpdate}
      />
    );

    const customLinksHeader = screen.getByText('Custom Links').closest('.level-header');
    fireEvent.click(customLinksHeader);

    await waitFor(() => {
      const input = screen.getByPlaceholderText('Enter DOI...');
      const addButton = screen.getByText('Plus');
      
      fireEvent.change(input, { target: { value: '10.1000/123456' } });
      fireEvent.click(addButton);
      
      expect(input.value).toBe(''); // Should be cleared after adding
    });
  });
});
