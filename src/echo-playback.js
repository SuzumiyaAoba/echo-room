import { CATALOG_VERSION, rank } from "./content.js";

export const rewindsEchoes = (run) =>
  run?.catalogVersion === CATALOG_VERSION && rank(run, "rewind") > 0;

// The same order is used by the floor preview and the actual cast. Recorded
// aim and shot events retain their positions and direction, exactly once.
// Reordering never edits the live history or consumes combat randomness.
export function echoPlaybackFrames(run, history) {
  return rewindsEchoes(run) ? history.slice().reverse() : history;
}
