import Entry from './Entry.js';
// We'll define Edge and Graph later, but import placeholders for now
// import Edge from './Edge.js';
// import Graph from './Graph.js';

/**
 * Represents a node in the graph, extending the base Entry class.
 * Equivalent to Node.java.
 */
class Node extends Entry {
  /**
   * @param {any} [data=null] - The data payload associated with the node.
   * @param {string} [name="Untitled"]
   * @param {string} [description="No description."]
   * @param {string} [picture=""]
   * @param {string} [color=""]
   * @param {number} [id=-1]
   * @param {number} [x=0] - UI x-coordinate
   * @param {number} [y=0] - UI y-coordinate
   * @param {number} [scale=1] - UI scale factor
   * @param {string | null} [imageSrc=null] - Full resolution image data URL
   * @param {string | null} [thumbnailSrc=null] - Thumbnail image data URL
   * @param {number | null} [imageAspectRatio=null] - Aspect ratio (height/width) of the image
   */
  constructor(data = null, name, description, picture, color, id, x = 0, y = 0, scale = 1, imageSrc = null, thumbnailSrc = null, imageAspectRatio = null) {
    // Call the parent Entry constructor
    super(name, description, picture, color, id);

    /** @type {any} The data held by the node. */
    this.data = data;

    // UI specific properties
    /** @type {number} The x-coordinate for rendering. */
    this.x = x;
    /** @type {number} The y-coordinate for rendering. */
    this.y = y;
    /** @type {number} The scale factor for rendering. */
    this.scale = scale;

    /** @type {string | null} Full resolution image data URL. */
    this.imageSrc = imageSrc;
    /** @type {string | null} Thumbnail image data URL. */
    this.thumbnailSrc = thumbnailSrc;

    /** @type {number | null} Aspect ratio (height/width) of the image. */
    this.imageAspectRatio = imageAspectRatio;

    /** @type {Array<import('./Edge.js').default>} List of edges connected to this node. */
    this.edges = [];

    /** @type {Array<import('./Graph.js').default>} List of graphs defining this node (Reverse Blackboxing). */
    this.definitions = [];
  }

  /**
   * Adds an edge to this node's list of edges.
   * @param {import('./Edge.js').default} edge - The edge to add.
   */
  addEdge(edge) {
    this.edges.push(edge);
  }

  /**
   * Gets the list of edges connected to this node.
   * @returns {Array<import('./Edge.js').default>}
   */
  getEdges() {
    return this.edges;
  }

  /**
   * Gets the data associated with this node.
   * @returns {any}
   */
  getData() {
    return this.data;
  }

   /**
   * Sets the data associated with this node.
   * @param {any} data
   */
  setData(data) {
    this.data = data;
  }

  /**
   * Gets the list of graph definitions for this node.
   * @returns {Array<import('./Graph.js').default>}
   */
  getDefinitions() {
    return this.definitions;
  }

  /**
   * Adds a graph definition to this node.
   * @param {import('./Graph.js').default} graph - The graph definition to add.
   * @returns {boolean} - Returns true (consistent with Java ArrayList.add behavior).
   */
  addDefinition(graph) {
    this.definitions.push(graph);
    return true; // Mimic Java's ArrayList.add return
  }

  // --- UI Property Getters/Setters ---

  getX() {
    return this.x;
  }

  setX(x) {
    this.x = x;
  }

  getY() {
    return this.y;
  }

  setY(y) {
    this.y = y;
  }

  getScale() {
    return this.scale;
  }

  setScale(scale) {
    this.scale = scale;
  }

  getImageSrc() {
    return this.imageSrc;
  }

  setImageSrc(src) {
    this.imageSrc = src;
  }

  getThumbnailSrc() {
    return this.thumbnailSrc;
  }

  setThumbnailSrc(src) {
    this.thumbnailSrc = src;
  }

  // Optional convenience setter
  setImageData(imageSrc, thumbnailSrc) {
    this.imageSrc = imageSrc;
    this.thumbnailSrc = thumbnailSrc;
  }

  getImageAspectRatio() {
    return this.imageAspectRatio;
  }

  setImageAspectRatio(ratio) {
    this.imageAspectRatio = ratio;
  }

  /**
   * Creates a shallow clone of the node.
   * Note: edges and definitions arrays are copied by reference initially.
   * Data object is also copied by reference.
   * @returns {Node}
   */
  clone() {
    const newNode = new Node(
      this.data, // Shallow copy data
      this.getName(),
      this.getDescription(),
      this.getPicture(),
      this.getColor(),
      this.getId(),
      this.x,
      this.y,
      this.scale,
      this.imageSrc,     // Clone full image src
      this.thumbnailSrc, // Clone thumbnail src
      this.imageAspectRatio // Clone aspect ratio
    );
    // Copy edges and definitions by reference (arrays themselves are new)
    newNode.edges = [...this.edges];
    newNode.definitions = [...this.definitions];
    return newNode;
  }
}

export default Node; 