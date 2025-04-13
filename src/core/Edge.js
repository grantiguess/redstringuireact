import Entry from './Entry.js';
import Node from './Node.js'; // Assuming Node class is defined in Node.js

/**
 * Represents an edge connecting two nodes in the graph.
 * Extends the base Entry class.
 * Equivalent to Edge.java.
 */
class Edge extends Entry {
  /**
   * @param {Node} source - The source node of the edge.
   * @param {Node} destination - The destination node of the edge.
   * @param {Node | null} [definition=null] - Optional node defining the edge type/meaning.
   * @param {string} [name] - Name inherited from Entry.
   * @param {string} [description] - Description inherited from Entry.
   * @param {string} [picture] - Picture inherited from Entry.
   * @param {string} [color] - Color inherited from Entry.
   * @param {number} [id] - ID inherited from Entry.
   */
  constructor(source, destination, definition = null, name, description, picture, color, id) {
    // Call the parent Entry constructor
    super(name, description, picture, color, id);

    if (!(source instanceof Node)) {
      throw new Error('Edge source must be an instance of Node.');
    }
    if (!(destination instanceof Node)) {
      throw new Error('Edge destination must be an instance of Node.');
    }

    /** @type {Node} The source node. */
    this.source = source;

    /** @type {Node} The destination node. */
    this.destination = destination;

    /** @type {Array<Node>} List of nodes defining this edge. */
    this.definitions = [];

    if (definition) {
      if (!(definition instanceof Node)) {
        throw new Error('Edge definition must be an instance of Node.');
      }
      this.definitions.push(definition);
    }
  }

  /**
   * Gets the source node of the edge.
   * @returns {Node}
   */
  getSource() {
    return this.source;
  }

  /**
   * Gets the destination node of the edge.
   * @returns {Node}
   */
  getDestination() {
    return this.destination;
  }

  /**
   * Gets the definition nodes for this edge.
   * @returns {Array<Node>}
   */
  getDefinitions() {
    return this.definitions;
  }

  /**
   * Adds a definition node for this edge.
   * @param {Node} definitionNode
   */
  addDefinition(definitionNode) {
     if (!(definitionNode instanceof Node)) {
        throw new Error('Edge definition must be an instance of Node.');
      }
    this.definitions.push(definitionNode);
  }
}

export default Edge; 