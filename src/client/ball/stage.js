import { createStage } from 'madness-engine/stage';
import { paintRoom } from 'madness-engine/textures/rooms/studio';
import { defineView } from 'madness-engine/view';

import { BALL_RADIUS } from './model.js';

/**
 * Face on, a touch above level, close enough that the ball is the whole scene.
 * The views are the engine's; this one only differs in where home is.
 */
const { createView } = defineView({ home: { yaw: 0, pitch: 0.08, zoom: 1 } });

const LENS = Object.freeze({ distance: 3.1, fov: 36 });

/** The stage: the engine's, with a floor that shows nothing but the shadow on it. */
export async function createBallStage(host) {
  const stage = await createStage(host, {
    lens: LENS,
    view: createView(),
    room: paintRoom(),
    backdrop: '#0f0e0d',
    shadowSize: 1024,
    label: 'barney',
  });
  const { GFX } = stage;

  const floor = new GFX.Mesh(
    new GFX.PlaneGeometry(24, 24),
    new GFX.ShadowMaterial({ color: new GFX.Color('#000000'), opacity: 0.4 }),
  );
  floor.name = 'floor';
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  stage.scene.add(floor);

  stage.target.set(0, BALL_RADIUS, 0);
  stage.view.step(0, true);
  return stage;
}
