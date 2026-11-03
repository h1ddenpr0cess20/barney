import { createBowlingBall, BOWLING_BALL_RADIUS } from 'madness-engine/props/bowling-ball';

export const BALL_RADIUS = BOWLING_BALL_RADIUS;

/** Tiger: the resin Barney has always been. The viewer calls this palette by that name. */
export const RESIN = Object.freeze({
  design: 'flame',
  colors: Object.freeze({ base: '#492b19', swirl: '#d98b3c', accent: '#f5dca2', holes: '#140d08' }),
});

export function createBarneyBall(GFX) {
  return createBowlingBall(GFX, { design: RESIN.design, colors: { ...RESIN.colors } });
}
