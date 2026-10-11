/**
 * Strings the retrieval worker and the panel must agree on exactly. Kept in a file of their own (no imports)
 * so the panel can compare against them without pulling the whole engine into its chunk.
 */

/** The message of the error a search in embedding mode raises before the model is loaded (the panel looks for it). */
export const MODEL_NOT_LOADED = 'The embedding model is not loaded in this worker yet.'
