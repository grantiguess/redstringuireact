import { describe, it, expect, vi } from 'vitest';
import Node from '../../src/core/Node';
import Edge from '../../src/core/Edge'; // Needed for testing edges
import Graph from '../../src/core/Graph'; // Needed for testing definitions

describe('Node Class', () => {
  it('should initialize with default values, inheriting from Entry', () => {
    const node = new Node();
    // Inherited defaults
    expect(node.getName()).toBe('Untitled');
    expect(node.getDescription()).toBe('No description.');
    expect(node.getPicture()).toBe('');
    expect(node.getColor()).toBe('');
    expect(node.getId()).toBe(-1);
    // Node specific defaults
    expect(node.getData()).toBeNull();
    expect(node.getEdges()).toEqual([]);
    expect(node.getDefinitions()).toEqual([]);
  });

  it('should initialize with provided values', () => {
    const data = { key: 'value' };
    const node = new Node(data, 'Node 1', 'Node Desc', 'node.png', '#0000ff', 1);
    // Inherited values
    expect(node.getName()).toBe('Node 1');
    expect(node.getDescription()).toBe('Node Desc');
    expect(node.getPicture()).toBe('node.png');
    expect(node.getColor()).toBe('#0000ff');
    expect(node.getId()).toBe(1);
    // Node specific value
    expect(node.getData()).toBe(data);
  });

  it('should allow setting and getting data', () => {
    const node = new Node();
    const newData = { updated: true };
    node.setData(newData);
    expect(node.getData()).toBe(newData);
  });

  it('should add an edge correctly', () => {
    const node1 = new Node(null, 'Source');
    const node2 = new Node(null, 'Target');
    const edge = new Edge(node1, node2);
    node1.addEdge(edge);
    expect(node1.getEdges()).toHaveLength(1);
    expect(node1.getEdges()[0]).toBe(edge);
  });

  it('should add a graph definition correctly', () => {
    const node = new Node(null, 'Defined Node');
    const graph = new Graph(true, 'Definition Graph'); // Use the Graph class
    const result = node.addDefinition(graph);
    expect(result).toBe(true); // Based on Java's ArrayList.add return
    expect(node.getDefinitions()).toHaveLength(1);
    expect(node.getDefinitions()[0]).toBe(graph);
  });

  it('should return an empty array if getEdges is called with no edges', () => {
    const node = new Node();
    expect(node.getEdges()).toEqual([]);
  });

  it('should return an empty array if getDefinitions is called with no definitions', () => {
    const node = new Node();
    expect(node.getDefinitions()).toEqual([]);
  });
}); 