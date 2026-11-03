/**
 * What each conversational state does to the body. The gaze itself — where the
 * ball turns to look — is the engine's `heroes/alan/attention`; these are the
 * rest.
 *
 *   jitter   tremor while there is sound
 *   lean     how far it tips toward the viewer (negative: back)
 *   rock     the side-to-side rock, and its speed
 *   roll     rolling back and forth along the floor
 *   spin     spinning on the spot, like a ball in the return
 *   squash   how hard it squashes in time with a voice
 *   fidget   how often it fidgets by itself
 *   regard   how far it turns toward the pointer or around the room (0–1)
 */
export const MOODS = {
  idle:      { jitter: 0.04, lean:  0.00, rock: 0.04, rockSpeed: 1.0, roll: 0.00, spin: 0,  squash: 0.00, fidget: 0.35, regard: 1.00 },
  listening: { jitter: 0.03, lean:  0.45, rock: 0.08, rockSpeed: 1.5, roll: 0.00, spin: 0,  squash: 0.12, fidget: 0.20, regard: 0.55 },
  thinking:  { jitter: 0.04, lean:  0.00, rock: 0.02, rockSpeed: 1.2, roll: 0.00, spin: 14, squash: 0.00, fidget: 0.00, regard: 0.00 },
  speaking:  { jitter: 0.12, lean:  0.15, rock: 0.04, rockSpeed: 1.6, roll: 0.30, spin: 0,  squash: 0.45, fidget: 0.10, regard: 0.60 },
};

export const ENERGY_GAIN = { squash: 2.0, jitter: 0.9, rock: 0.04 };
