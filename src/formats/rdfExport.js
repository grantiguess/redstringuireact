/**
 * RDF Export Handler
 * Handles export of the current graph state to RDF/Turtle format.
 */

import { exportToRedstring } from './redstringFormat';
import jsonld from 'jsonld';
import $rdf from 'rdflib';

/**
 * Export current Zustand store state to RDF Turtle format
 * @param {object} storeState - The current state from the Zustand store.
 * @returns {Promise<string>} A promise that resolves with the RDF data in Turtle format.
 */
export const exportToRdfTurtle = async (storeState) => {
  // 1. Get the data in our native JSON-LD format
  const redstringData = exportToRedstring(storeState);

  // 2. Convert JSON-LD to a canonical RDF dataset (N-Quads format)
  const nquads = await jsonld.toRDF(redstringData, { format: 'application/n-quads' });

  // 3. Parse the N-Quads and serialize to Turtle
  const store = $rdf.graph();
  const mimeType = 'application/n-quads';
  const baseURI = 'https://redstring.org/data/'; // A base URI for our data

  return new Promise((resolve, reject) => {
    $rdf.parse(nquads, store, baseURI, mimeType, (error, kb) => {
      if (error) {
        console.error("Error parsing N-Quads:", error);
        reject(error);
        return;
      }

      $rdf.serialize(kb, (err, result) => {
        if (err) {
          console.error("Error serializing to Turtle:", err);
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  });
}; 