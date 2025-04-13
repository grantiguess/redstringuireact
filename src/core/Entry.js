/**
 * Base class for graph elements (Nodes, Edges).
 * Equivalent to the abstract Entry class in Java.
 */
class Entry {
  /**
   * @param {string} [name="Untitled"]
   * @param {string} [description="No description."]
   * @param {string} [picture=""]
   * @param {string} [color=""] // Added color property based on Java
   * @param {number} [id=-1] // Assuming IDs are numbers in JS
   */
  constructor(name = "Untitled", description = "No description.", picture = "", color = "", id = -1) {
    this.name = name;
    this.description = description;
    this.picture = picture;
    this.color = color;
    this.id = id; // Note: Java uses long, JS uses number (up to 2^53-1 accurately)
  }

  // Getters
  getName() {
    return this.name;
  }

  getDescription() {
    return this.description;
  }

  getPicture() {
    return this.picture;
  }

  getColor() {
    return this.color;
  }

  getId() {
    // Note: Java getter returned picture, which seems like a typo. Returning id here.
    return this.id;
  }

  // Setters
  setName(name) {
    this.name = name;
  }

  setDescription(description) {
    this.description = description;
  }

  setPicture(picture) {
    this.picture = picture;
  }

  setColor(color) {
    this.color = color;
  }

  setId(id) {
    this.id = id;
  }
}

// Export the class for use in other modules
export default Entry; 