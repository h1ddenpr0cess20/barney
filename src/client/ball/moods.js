/**
 * What each conversational state does to him. Where he looks is the engine's
 * (`heroes/alan/attention`); these are the rest.
 *
 *   roam     how readily he rolls off somewhere, and how far (0 stays put)
 *   pace     how fast he rolls
 *   spin     spinning on the spot, in radians a second, like a ball in the return
 *   regard   how far he turns to look at the pointer or round the room (0–1)
 */
export const MOODS = {
  idle:      { roam: 0.30, pace: 0.45, spin: 0,  regard: 1.00 },
  listening: { roam: 0.00, pace: 0.45, spin: 0,  regard: 0.55 },
  thinking:  { roam: 0.00, pace: 0.45, spin: 14, regard: 0.00 },
  speaking:  { roam: 1.00, pace: 0.80, spin: 0,  regard: 0.60 },
};

/** How far a loud voice pushes past the mood, slowly: it sets his pace, not his every move. */
export const ENERGY_GAIN = { pace: 0.5 };
