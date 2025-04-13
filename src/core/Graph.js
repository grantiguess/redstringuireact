import Entry from './Entry.js';
import Node from './Node.js';
import Edge from './Edge.js';

/**
 * Represents the graph structure containing nodes and edges.
 * Extends the base Entry class.
 * Equivalent to Graph.java.
 */
class Graph extends Entry {
  /**
   * @param {boolean} [directed=true] - Whether the graph is directed.
   * @param {string} [name] - Name inherited from Entry.
   * @param {string} [description] - Description inherited from Entry.
   * @param {string} [picture] - Picture inherited from Entry.
   * @param {string} [color] - Color inherited from Entry.
   * @param {number} [id] - ID inherited from Entry.
   */
  constructor(directed = true, name, description, picture, color, id) {
    // Call the parent Entry constructor
    super(name, description, picture, color, id);

    /** @type {Map<Node, Array<Edge>>} Adjacency list representing the graph. */
    this.adjacencyList = new Map();
    /** @type {boolean} Whether the graph is directed. */
    this.directed = directed;
  }

  /**
   * Checks if the graph is directed.
   * @returns {boolean}
   */
  isDirected() {
    return this.directed;
  }

  /**
   * Gets the adjacency list map.
   * @returns {Map<Node, Array<Edge>>}
   */
  getAdjacencyList() {
    return this.adjacencyList;
  }

  /**
   * Gets an array of all nodes in the graph.
   * @returns {Array<Node>}
   */
  getNodes() {
    return Array.from(this.adjacencyList.keys());
  }

  /**
   * Gets an array of all edges in the graph.
   * @returns {Array<Edge>}
   */
  getEdges() {
    // Flatten the lists of edges from the adjacency map values
    return Array.from(this.adjacencyList.values()).flat();
  }

  /**
   * Finds a node in the graph by its ID.
   * @param {number} id - The ID of the node to find.
   * @returns {Node | undefined} The node instance or undefined if not found.
   */
  getNodeById(id) {
    for (const node of this.adjacencyList.keys()) {
        if (node.getId() === id) {
            return node;
        }
    }
    return undefined;
  }

  /**
   * Updates a node instance in the graph. Finds the node by ID and replaces it.
   * Important for immutability patterns: Use this to replace a node with its updated clone.
   * @param {Node} updatedNode - The updated node instance.
   * @returns {boolean} True if the node was found and updated, false otherwise.
   */
   updateNode(updatedNode) {
    const existingNode = this.getNodeById(updatedNode.getId());
    if (!existingNode) {
      console.warn(`Graph.updateNode: Node with ID ${updatedNode.getId()} not found.`);
      return false;
    }

    // To update the key in the Map, we need to delete the old key and set the new one.
    // We preserve the edges associated with the old key.
    const edges = this.adjacencyList.get(existingNode);
    this.adjacencyList.delete(existingNode);
    this.adjacencyList.set(updatedNode, edges);

    // We might also need to update edges if the node reference changed in other parts
    // of the adjacency list (as edge targets), but let's keep it simple for now.
    // A more robust implementation might iterate through all edges.

    return true;
  }

  /**
   * Adds a node to the graph.
   * @param {Node} node - The node to add.
   */
  addNode(node) {
    if (!(node instanceof Node)) {
      throw new Error('Can only add Node instances to the graph.');
    }
    if (!this.adjacencyList.has(node)) {
      this.adjacencyList.set(node, []);
    }
  }

  /**
   * Removes a node and all connected edges from the graph.
   * @param {Node} node - The node to remove.
   */
  removeNode(node) {
     if (!(node instanceof Node)) {
      throw new Error('Can only remove Node instances from the graph.');
    }
    // Remove the node itself
    this.adjacencyList.delete(node);

    // Remove edges pointing to or from the removed node
    for (const [currentNode, edges] of this.adjacencyList.entries()) {
      const filteredEdges = edges.filter(edge => edge.source !== node && edge.destination !== node);
      this.adjacencyList.set(currentNode, filteredEdges);
    }
  }

  /**
   * Adds an edge between two nodes.
   * If the nodes don't exist, they are added to the graph.
   * @param {Node} source - The source node.
   * @param {Node} destination - The destination node.
   * @param {Node | null} [definition=null] - Optional node defining the edge type.
   */
  addEdge(source, destination, definition = null) {
    if (!(source instanceof Node) || !(destination instanceof Node)) {
      throw new Error('Edge source and destination must be Node instances.');
    }
    this.addNode(source); // Ensure source node exists
    this.addNode(destination); // Ensure destination node exists

    const edge = new Edge(source, destination, definition);
    this.adjacencyList.get(source).push(edge);

    // If undirected, add the reverse edge
    if (!this.directed) {
      const reverseEdge = new Edge(destination, source, definition); // Reuse definition for reverse?
      this.adjacencyList.get(destination).push(reverseEdge);
    }
  }

  /**
   * Removes an edge between two nodes.
   * @param {Node} source - The source node.
   * @param {Node} destination - The destination node.
   */
  removeEdge(source, destination) {
     if (!(source instanceof Node) || !(destination instanceof Node)) {
      throw new Error('Edge source and destination must be Node instances.');
    }

    if (this.adjacencyList.has(source)) {
      const edges = this.adjacencyList.get(source);
      const filteredEdges = edges.filter(edge => edge.destination !== destination);
      this.adjacencyList.set(source, filteredEdges);
    }

    // If undirected, remove the reverse edge
    if (!this.directed && this.adjacencyList.has(destination)) {
       const reverseEdges = this.adjacencyList.get(destination);
       // Corrected logic: remove edge from dest where the edge's destination is the source
       const filteredReverseEdges = reverseEdges.filter(edge => edge.destination !== source);
       this.adjacencyList.set(destination, filteredReverseEdges);
    }
  }

  /**
   * Creates a shallow clone of the graph structure (nodes and edges are references).
   * For React state updates, ensure nodes/edges are also cloned if mutated.
   * @returns {Graph}
   */
  clone() {
    const newGraph = new Graph(this.directed, this.getName(), this.getDescription(), this.getPicture(), this.getColor(), this.getId());
    // Deep copy the adjacency list structure (Map and Arrays)
    // Node and Edge instances themselves are copied by reference initially
    // This is often sufficient if node/edge properties aren't mutated directly
    // but be careful if you modify node.x, node.y etc. - you might need deeper cloning then.
    for (const [node, edges] of this.adjacencyList.entries()) {
      newGraph.adjacencyList.set(node, [...edges]);
    }
    return newGraph;
  }

  /**
   * Creates a new Node that has this Graph as one of its definitions.
   * Implements the "Reverse Blackboxing" concept.
   * @param {string} name - The name for the new composite Node.
   * @returns {Node}
   */
  compose(name) {
    const newNode = new Node(null, name); // Create a new node with the given name
    newNode.addDefinition(this); // Add this graph as a definition
    return newNode;
  }
}

export default Graph; 