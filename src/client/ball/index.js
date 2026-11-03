import { createAttention } from 'madness-engine/heroes/alan/attention';
import { anglesOf, pointerOffset } from 'madness-engine/heroes/alan/gaze';
import { createBall, placeBall, rollSpin, stepBall, turn } from 'madness-engine/physics';

import { HOME, ROAM } from './board.js';
import { createBarneyBall, BALL_RADIUS as R } from './model.js';
import { ENERGY_GAIN, MOODS } from './moods.js';
import { approach, spring } from './motion.js';

/** How far in front of the ball the pointer's plane sits, in radii. */
const REACH = 2.2;

/** Spring stiffness for each kind of look: a saccade is a jump, a pan a slow sweep. */
const STIFFNESS = Object.freeze({ saccade: 260, roll: 150, pan: 100, pursuit: 60 });

/**
 * A ball turns less than an eye does. The holes are its face, and turned past
 * about this much of the gaze's range they are round the back.
 */
const TURN = 0.55;

/** The physics runs in fixed steps, whatever the frame rate. */
const STEP = 1 / 120;

/** The push he rolls with, how quickly he settles, and how hard the steering pulls and brakes. */
const PUSH = 6;
const DRAG = 1.1;
const PULL = 2.2;
const BRAKE = 1.6;

/** How fast he turns back to face you once he stops, per second. */
const SETTLE = 2.4;

/** How quickly the push eases toward what the steering asks for, per second. */
const EASE = 9;

const IDENTITY = [0, 0, 0, 1];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function stepSpring(s, k, dt, to, damping = 1) {
  const c = 2 * Math.sqrt(k) * damping;
  const steps = Math.max(1, Math.ceil(dt / STEP));
  for (let i = 0; i < steps; i++) spring(s, k, c, dt / steps, to);
}

/**
 * Barney: a bowling ball that is a voice. He is a rigid ball on the engine's
 * physics and he never changes shape: he rolls round the board when he talks,
 * stops and turns his holes toward you while he listens, spins on the spot
 * while he thinks. When nobody is
 * pointing he looks round the room, and now and then rolls his gaze or flips
 * over — those gestures are the engine's `heroes/alan/attention`.
 *
 * The ball is steered, not animated: a small controller pushes the engine's
 * `stepBall` toward a waypoint and brakes on arrival, and the picture is
 * whatever the physics did — `rollSpin` and `turn` turn him as he rolls, so he
 * rolls the way a ball rolls. Once he stops he eases back round to face you.
 *
 * The conversation drives him through `setState`, `setLevel` and `pulse`, and
 * the stage's loop through `update(dt)`.
 */
export function createBarney({ stage, board, random = Math.random, events = globalThis }) {
  const { GFX } = stage;
  const { world } = board;
  const ball = createBarneyBall(GFX);

  const barney = new GFX.Group();
  barney.name = 'barney';
  const body = new GFX.Group();
  body.name = 'body';
  barney.add(body);
  body.add(ball.group);
  stage.scene.add(barney);

  // The physics ball, resting on the board where he starts.
  const phys = createBall({ r: R });
  placeBall(phys, HOME.x, R + 0.02, HOME.z);
  stage.target.set(phys.x, R, phys.z);

  const attention = createAttention({ random });
  const between = (a, b) => a + (b - a) * random();

  let state = 'idle';
  let mood = MOODS.idle;
  const m = { ...MOODS.idle };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;

  const yaw = { p: 0, v: 0 };
  const pitch = { p: 0, v: 0 };

  let t = 0;
  let accumulator = 0;
  const before = { x: HOME.x, y: R, z: HOME.z };
  const drawn = { x: HOME.x, y: R, z: HOME.z };
  const push = [0, 0];
  let loud = 0;
  let lastMove = -Infinity;
  let wait = between(2, 5);
  let goal = null;

  // How he is turned: the roll the physics gave him, then his gaze, then a flip.
  const spin = [0, 0, 0];
  const roll = [...IDENTITY];
  let spinV = 0;
  const rollQ = new GFX.Quaternion();
  const gazeQ = new GFX.Quaternion();
  const flipQ = new GFX.Quaternion();
  const euler = new GFX.Euler(0, 0, 0, 'YXZ');
  const identityQ = new GFX.Quaternion();

  /** The pointer, in client pixels. `moved` is picked up by the next frame. */
  const pointer = { x: 0, y: 0, moved: false, seen: false, inside: false };
  const onMove = (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.moved = true;
    pointer.seen = true;
    pointer.inside = true;
  };
  const onOut = (e) => {
    if (!e.relatedTarget) pointer.inside = false;
  };
  events.addEventListener?.('pointermove', onMove, { passive: true });
  events.addEventListener?.('pointerdown', onMove, { passive: true });
  events.addEventListener?.('pointerout', onOut, { passive: true });

  const ray = new GFX.Raycaster();
  const ndc = new GFX.Vector2();
  const toCamera = new GFX.Vector3();
  const axis = new GFX.Vector3();
  const eye = new GFX.Vector3();

  function pointerGaze() {
    if (!pointer.seen || !pointer.inside) return null;
    const rect = stage.renderer.domElement.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return null;
    ndc.set(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    return pointerOffset({ ray: ray.ray, eye, toCamera, reach: REACH * R });
  }

  /** Where to roll next: somewhere on the floor, not far from here. */
  function chooseGoal() {
    const reach = 0.8 + 1.8 * m.roam;
    const a = random() * Math.PI * 2;
    goal = {
      x: clamp(phys.x + Math.cos(a) * reach, ROAM.x[0], ROAM.x[1]),
      z: clamp(phys.z + Math.sin(a) * reach, ROAM.z[0], ROAM.z[1]),
    };
  }

  /** The controls for one physics step: toward the goal, braking as he nears it, or just braking. */
  function steer() {
    let ex, ez;
    if (goal) {
      ex = goal.x - phys.x;
      ez = goal.z - phys.z;
      if (Math.hypot(ex, ez) < 0.1 && Math.hypot(phys.vx, phys.vz) < 0.25) {
        goal = null;
        // Talking, he sets off again soon; idle, he stays a good while.
        wait = between(0.3, 1) + (1 - clamp(m.roam, 0, 1)) * between(4, 9);
      }
    }
    if (!goal) { ex = -phys.vx * 0.4; ez = -phys.vz * 0.4; }
    return [clamp(PULL * ex - BRAKE * phys.vx, -1, 1), clamp(PULL * ez - BRAKE * phys.vz, -1, 1)];
  }

  function frame(dt) {
    t += dt;

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    energy = approach(energy, Math.min(1, sustain + impulse), 6, dt);
    for (const k in m) m[k] = approach(m[k], mood[k], 3.4, dt);

    // Whether to roll somewhere: often while talking, now and then when idle, never while listening.
    // The next place is only chosen once he has got to the last, so he never changes his mind mid-roll.
    if (m.roam > 0.05) {
      if (!goal) {
        wait -= dt;
        if (wait <= 0) chooseGoal();
      }
    } else {
      goal = null;
    }

    // The physics, in fixed steps. How loud he is, slowly, sets his pace: following every syllable made him lurch.
    loud = approach(loud, energy, 0.8, dt);
    const top = 0.9 + 1.7 * (m.pace + loud * ENERGY_GAIN.pace);
    accumulator = Math.min(accumulator + dt, STEP * 12);
    while (accumulator >= STEP) {
      accumulator -= STEP;
      before.x = phys.x; before.y = phys.y; before.z = phys.z;
      const [ax, az] = steer();
      // The push eases in and out rather than snapping on, so he sets off and stops smoothly.
      push[0] = approach(push[0], ax, EASE, STEP);
      push[1] = approach(push[1], az, EASE, STEP);
      stepBall(phys, world, push[0], push[1], STEP, { push: PUSH, topSpeed: top, drag: DRAG });
    }
    // The picture is between the last two steps, not on the latest: whole steps per frame vary, and drawn
    // as they fall they would shake him.
    const alpha = accumulator / STEP;
    drawn.x = before.x + (phys.x - before.x) * alpha;
    drawn.y = before.y + (phys.y - before.y) * alpha;
    drawn.z = before.z + (phys.z - before.z) * alpha;
    const speed = Math.hypot(phys.vx, phys.vz);
    eye.set(drawn.x, drawn.y, drawn.z);

    // How he is turned as he rolls: what the physics gives, and a spin on the spot while he thinks.
    const thinking = state === 'thinking';
    if (thinking) spinV += (m.spin - spinV) * Math.min(1, dt * 3.2);
    else spinV = approach(spinV, 0, 3.2, dt);
    if (phys.grounded) rollSpin(phys, spin); else spin[0] = spin[1] = spin[2] = 0;
    spin[1] += spinV;
    turn(roll, spin, dt);

    // At rest he turns back round to face you.
    if (!thinking && state !== 'speaking' && !goal && speed < 0.2 && Math.abs(spinV) < 0.5) {
      rollQ.set(roll[0], roll[1], roll[2], roll[3]).slerp(identityQ, 1 - Math.exp(-SETTLE * dt));
      roll[0] = rollQ.x; roll[1] = rollQ.y; roll[2] = rollQ.z; roll[3] = rollQ.w;
    }
    rollQ.set(roll[0], roll[1], roll[2], roll[3]);

    // Where he is looking.
    toCamera.copy(stage.camera.position).sub(eye).normalize();
    const home = anglesOf(toCamera);
    if (pointer.moved) {
      pointer.moved = false;
      lastMove = t;
    }
    const look = attention.update(dt, {
      state,
      pointer: pointerGaze(),
      pointerAge: t - lastMove,
    });
    let k = STIFFNESS[look.speed] ?? STIFFNESS.pursuit;
    // Talking and rolling, his eyes drift rather than jump: a snap of the gaze reads as a shake.
    if (state === 'speaking' && look.speed === 'saccade') k = STIFFNESS.pan;
    if (state !== 'speaking' && look.speed === 'pursuit' && (Math.abs(look.yaw * TURN - yaw.p) > 0.2 || Math.abs(look.pitch * TURN - pitch.p) > 0.2)) {
      k = STIFFNESS.saccade;
    }
    const regard = TURN * m.regard;
    stepSpring(yaw, k, dt, look.yaw * regard, 0.9);
    stepSpring(pitch, k, dt, look.pitch * regard, 0.9);
    euler.set(-(home.pitch + pitch.p), home.yaw + yaw.p, 0);
    gazeQ.setFromEuler(euler);

    // A flip hops him up and turns him over, and he comes down where he was.
    let hop = 0;
    if (look.gesture?.kind === 'tumble') {
      axis.set(look.gesture.axis.x, look.gesture.axis.y, look.gesture.axis.z);
      flipQ.setFromAxisAngle(axis, look.gesture.angle);
      hop = Math.sin(Math.PI * look.gesture.progress) * 0.55 * R;
    } else {
      flipQ.identity();
    }

    // The ball is rigid: where the physics put it, turned, and nothing else.
    barney.position.set(drawn.x, drawn.y + hop, drawn.z);
    body.quaternion.copy(flipQ).multiply(rollQ).multiply(gazeQ);
  }

  /** The stage's loop calls this once a frame; the camera goes after the ball, as in the starter. */
  function update(dt) {
    frame(Math.min(dt, 0.05));
    stage.view.step(dt);
    const follow = 1 - Math.exp(-5 * dt);
    stage.target.x += (drawn.x - stage.target.x) * follow;
    stage.target.y += (R - stage.target.y) * follow;
    stage.target.z += (drawn.z - stage.target.z) * follow;
  }

  return {
    get state() { return state; },
    get ball() { return ball; },
    /** Where the physics has him, for the page and for tests. */
    get at() { return { x: phys.x, y: phys.y, z: phys.z, vx: phys.vx, vz: phys.vz }; },

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      mood = MOODS[next];
      if (next === 'idle' || next === 'thinking') sustain = 0;
      wait = Math.min(wait, 0.4);
    },

    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    /** A burst of sound: it lifts his energy, and with it his pace. It does not knock him about. */
    pulse(weight = 0.3) {
      const w = Math.min(1, Math.max(0, weight));
      impulse = Math.min(1, impulse + w);
    },

    /** Roll the gaze round, or flip over — the idle gestures, on demand. */
    perform(kind) {
      if (kind === 'roll' || kind === 'tumble') attention.perform(kind);
    },

    update,

    dispose() {
      events.removeEventListener?.('pointermove', onMove);
      events.removeEventListener?.('pointerdown', onMove);
      events.removeEventListener?.('pointerout', onOut);
      stage.scene.remove(barney);
      ball.dispose();
    },
  };
}
