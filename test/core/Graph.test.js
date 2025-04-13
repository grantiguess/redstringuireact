import { describe, it, expect, beforeEach } from 'vitest';
import Graph from '../../src/core/Graph';
import Node from '../../src/core/Node';
import Edge from '../../src/core/Edge';
import Entry from '../../src/core/Entry';

describe('Graph Class', () => {
  let graph;
  let nodeA;
  let nodeB;
  let nodeC;

  beforeEach(() => {
    // Create a fresh graph and nodes for each test
    graph = new Graph(true, 'Test Graph', 'Graph Desc', 'graph.png', '#eeeeee', 100); // Directed by default
    nodeA = new Node(null, 'A');
    nodeB = new Node(null, 'B');
    nodeC = new Node(null, 'C');
  });

  it('should initialize with default and provided values, inheriting from Entry', () => {
    expect(graph.isDirected()).toBe(true);
    expect(graph.getAdjacencyList()).toEqual(new Map());
    // Check inherited properties
    expect(graph.getName()).toBe('Test Graph');
    expect(graph.getDescription()).toBe('Graph Desc');
    expect(graph.getPicture()).toBe('graph.png');
    expect(graph.getColor()).toBe('#eeeeee');
    expect(graph.getId()).toBe(100);
    expect(graph instanceof Entry).toBe(true);
  });

  it('should allow initializing as an undirected graph', () => {
    const undirectedGraph = new Graph(false, 'Undirected');
    expect(undirectedGraph.isDirected()).toBe(false);
  });

  it('should add nodes correctly', () => {
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    expect(graph.getAdjacencyList().has(nodeA)).toBe(true);
    expect(graph.getAdjacencyList().get(nodeA)).toEqual([]);
    expect(graph.getAdjacencyList().has(nodeB)).toBe(true);
    expect(graph.getAdjacencyList().size).toBe(2);
    // Adding the same node again should not change the map
    graph.addNode(nodeA);
    expect(graph.getAdjacencyList().size).toBe(2);
  });

    it('should throw an error when adding non-Node objects', () => {
        expect(() => graph.addNode('not-a-node')).toThrow('Can only add Node instances to the graph.');
    });

  it('should remove nodes and associated edges correctly', () => {
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addNode(nodeC);
    graph.addEdge(nodeA, nodeB);
    graph.addEdge(nodeB, nodeC);
    graph.addEdge(nodeC, nodeA);

    expect(graph.getAdjacencyList().size).toBe(3);
    graph.removeNode(nodeB); // Remove node B
    expect(graph.getAdjacencyList().size).toBe(2);
    expect(graph.getAdjacencyList().has(nodeB)).toBe(false);
    // Check edges associated with nodeB were removed
    expect(graph.getEdges(nodeA)).toEqual([]); // Edge A->B removed
    expect(graph.getEdges(nodeC).length).toBe(1); // Edge B->C removed, C->A remains
    expect(graph.getEdges(nodeC)[0].getDestination()).toBe(nodeA);
  });

    it('should throw an error when removing non-Node objects', () => {
        graph.addNode(nodeA);
        expect(() => graph.removeNode('not-a-node')).toThrow('Can only remove Node instances from the graph.');
    });

  it('should add edges correctly in a directed graph', () => {
    graph.addEdge(nodeA, nodeB); // Adds nodes A and B automatically
    expect(graph.getAdjacencyList().size).toBe(2);
    expect(graph.getEdges(nodeA)).toHaveLength(1);
    expect(graph.getEdges(nodeA)[0].getSource()).toBe(nodeA);
    expect(graph.getEdges(nodeA)[0].getDestination()).toBe(nodeB);
    expect(graph.getEdges(nodeB)).toEqual([]); // No edge from B
  });

  it('should add edges correctly in an undirected graph', () => {
    const undirectedGraph = new Graph(false);
    undirectedGraph.addEdge(nodeA, nodeB);
    expect(undirectedGraph.getAdjacencyList().size).toBe(2);
    // Check edge A -> B
    expect(undirectedGraph.getEdges(nodeA)).toHaveLength(1);
    expect(undirectedGraph.getEdges(nodeA)[0].getSource()).toBe(nodeA);
    expect(undirectedGraph.getEdges(nodeA)[0].getDestination()).toBe(nodeB);
    // Check edge B -> A
    expect(undirectedGraph.getEdges(nodeB)).toHaveLength(1);
    expect(undirectedGraph.getEdges(nodeB)[0].getSource()).toBe(nodeB);
    expect(undirectedGraph.getEdges(nodeB)[0].getDestination()).toBe(nodeA);
  });

    it('should throw an error when adding edge with non-Node source/destination', () => {
        expect(() => graph.addEdge('not-a-node', nodeB)).toThrow('Edge source and destination must be Node instances.');
        expect(() => graph.addEdge(nodeA, 'not-a-node')).toThrow('Edge source and destination must be Node instances.');
    });


  it('should remove edges correctly in a directed graph', () => {
    graph.addEdge(nodeA, nodeB);
    graph.addEdge(nodeA, nodeC);
    expect(graph.getEdges(nodeA)).toHaveLength(2);
    graph.removeEdge(nodeA, nodeB);
    expect(graph.getEdges(nodeA)).toHaveLength(1);
    expect(graph.getEdges(nodeA)[0].getDestination()).toBe(nodeC);
    graph.removeEdge(nodeA, nodeC);
    expect(graph.getEdges(nodeA)).toHaveLength(0);
  });

  it('should remove edges correctly in an undirected graph', () => {
    const undirectedGraph = new Graph(false);
    undirectedGraph.addEdge(nodeA, nodeB);
    undirectedGraph.addEdge(nodeA, nodeC);

    expect(undirectedGraph.getEdges(nodeA)).toHaveLength(2); // A->B, A->C
    expect(undirectedGraph.getEdges(nodeB)).toHaveLength(1); // B->A
    expect(undirectedGraph.getEdges(nodeC)).toHaveLength(1); // C->A

    undirectedGraph.removeEdge(nodeA, nodeB); // Removes A->B and B->A

    expect(undirectedGraph.getEdges(nodeA)).toHaveLength(1);
    expect(undirectedGraph.getEdges(nodeA)[0].getDestination()).toBe(nodeC);
    expect(undirectedGraph.getEdges(nodeB)).toHaveLength(0); // B->A removed
    expect(undirectedGraph.getEdges(nodeC)).toHaveLength(1); // C->A remains
  });

    it('should throw an error when removing edge with non-Node source/destination', () => {
        graph.addEdge(nodeA, nodeB);
        expect(() => graph.removeEdge('not-a-node', nodeB)).toThrow('Edge source and destination must be Node instances.');
        expect(() => graph.removeEdge(nodeA, 'not-a-node')).toThrow('Edge source and destination must be Node instances.');
    });

  it('should return edges for a given node, or empty array if node not found', () => {
    graph.addEdge(nodeA, nodeB);
    graph.addEdge(nodeA, nodeC);
    expect(graph.getEdges(nodeA)).toHaveLength(2);
    expect(graph.getEdges(nodeB)).toHaveLength(0);
    const unconnectedNode = new Node(null, 'D');
    expect(graph.getEdges(unconnectedNode)).toEqual([]);
  });

  it('should return an empty array when calling getEdges with non-Node', () => {
     expect(graph.getEdges('not-a-node')).toEqual([]);
     // Optionally check console warning if implemented
  });

  it('should compose a new node defined by the graph', () => {
    graph.addNode(nodeA);
    graph.addNode(nodeB);
    graph.addEdge(nodeA, nodeB);

    const compositeNode = graph.compose('Composite Node');

    expect(compositeNode).toBeInstanceOf(Node);
    expect(compositeNode.getName()).toBe('Composite Node');
    expect(compositeNode.getDefinitions()).toHaveLength(1);
    expect(compositeNode.getDefinitions()[0]).toBe(graph);
    expect(compositeNode.getData()).toBeNull(); // Default data
  });
}); 