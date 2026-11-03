import { createStage } from 'madness-engine/stage';
import dive from 'madness-engine/moods/dive';
import { defineView } from 'madness-engine/view';

import { BALL_RADIUS } from './model.js';
import { createBoard, HOME } from './board.js';

/**
 * Face on, tipped a little over the board so the planks show. The views are
 * the engine's; this one only differs in where home is.
 */
const { createView } = defineView({ home: { yaw: 0, pitch: 0.3, zoom: 1 } });

const LENS = Object.freeze({ distance: 4.4, fov: 36 });

/**
 * The engine's stage, as the starter example sets it up, with the starter's
 * wood board laid in it and the room dressed as Sticky's, the dive bar the
 * engine's `dive` mood is: warm lamp light, neon beer signs in what the ball
 * reflects, and the dark of the bar beyond.
 */
export async function createBallStage(host) {
  const stage = await createStage(host, {
    lens: LENS,
    view: createView(),
    label: 'barney',
  });
  stage.setMood(dive);
  const board = createBoard(stage.GFX);
  stage.scene.add(board.mesh);
  stage.target.set(HOME.x, BALL_RADIUS, HOME.z);
  stage.view.step(0, true);
  return { stage, board };
}
