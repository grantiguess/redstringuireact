import { describe, it, expect } from 'vitest';
import Edge from '../../src/core/Edge';
import Node from '../../src/core/Node';
import Entry from '../../src/core/Entry'; // Import Entry to check inheritance

describe('Edge Class', () => {
  let sourceNode;
  let destNode;
  let defNode;

  beforeEach(() => {
    // Create fresh nodes for each test
    sourceNode = new Node(null, 'Source');
    destNode = new Node(null, 'Destination');
    defNode = new Node(null, 'Definition');
  });

  it('should initialize with required source and destination nodes', () => {
    const edge = new Edge(sourceNode, destNode);
    expect(edge.getSource()).toBe(sourceNode);
    expect(edge.getDestination()).toBe(destNode);
    expect(edge.getDefinitions()).toEqual([]);
    // Check inherited defaults from Entry
    expect(edge.getName()).toBe('Untitled');
    expect(edge.getId()).toBe(-1);
  });

  it('should initialize with source, destination, and a definition node', () => {
    const edge = new Edge(sourceNode, destNode, defNode);
    expect(edge.getSource()).toBe(sourceNode);
    expect(edge.getDestination()).toBe(destNode);
    expect(edge.getDefinitions()).toHaveLength(1);
    expect(edge.getDefinitions()[0]).toBe(defNode);
  });

  it('should initialize with all Entry properties', () => {
    const edge = new Edge(sourceNode, destNode, defNode, 'Edge 1', 'Edge Desc', 'edge.gif', '#ffff00', 2);
    expect(edge.getName()).toBe('Edge 1');
    expect(edge.getDescription()).toBe('Edge Desc');
    expect(edge.getPicture()).toBe('edge.gif');
    expect(edge.getColor()).toBe('#ffff00');
    expect(edge.getId()).toBe(2);
  });

  it('should throw an error if source is not a Node instance', () => {
    expect(() => new Edge({}, destNode)).toThrow('Edge source must be an instance of Node.');
  });

  it('should throw an error if destination is not a Node instance', () => {
    expect(() => new Edge(sourceNode, 'not a node')).toThrow('Edge destination must be an instance of Node.');
  });

  it('should throw an error if definition is provided but not a Node instance', () => {
    expect(() => new Edge(sourceNode, destNode, {})).toThrow('Edge definition must be an instance of Node.');
  });

  it('should allow adding a valid definition node after construction', () => {
    const edge = new Edge(sourceNode, destNode);
    const anotherDefNode = new Node(null, 'Another Def');
    edge.addDefinition(anotherDefNode);
    expect(edge.getDefinitions()).toHaveLength(1);
    expect(edge.getDefinitions()[0]).toBe(anotherDefNode);
  });

   it('should throw an error when adding an invalid definition node', () => {
    const edge = new Edge(sourceNode, destNode);
    expect(() => edge.addDefinition('invalid')).toThrow('Edge definition must be an instance of Node.');
  });

  it('should inherit methods from Entry', () => {
    const edge = new Edge(sourceNode, destNode);
    edge.setName('Updated Edge Name');
    expect(edge.getName()).toBe('Updated Edge Name');
    expect(edge instanceof Entry).toBe(true);
  });
}); 