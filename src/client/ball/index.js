import { createAttention } from 'madness-engine/heroes/alan/attention';
import { anglesOf, pointerOffset } from 'madness-engine/heroes/alan/gaze';

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

/** How far it rolls either side of centre while talking, in tiles. */
const ROLL_REACH = 0.26;

/** The springs are stepped at no less than this, so a stiff one stays stable on a slow frame. */
const STEP = 1 / 120;

function stepSpring(s, k, dt, to, damping = 1) {
  const c = 2 * Math.sqrt(k) * damping;
  const steps = Math.max(1, Math.ceil(dt / STEP));
  for (let i = 0; i < steps; i++) spring(s, k, c, dt / steps, to);
}

/**
 * Barney: a bowling ball that is a voice. Resting on the floor facing you, he
 * turns his holes toward the pointer — and round the room when nobody is
 * pointing — leans in while he listens, spins like a ball in the return while
 * he thinks, and rolls and squashes in time with whoever is making sound.
 *
 * Where he looks is the engine's (`heroes/alan/attention`); the rest is here.
 * The conversation drives him through `setState`, `setLevel` and `pulse`, and
 * the stage's loop through `update(dt)`.
 */
export function createBarney({ stage, random = Math.random, events = globalThis }) {
  const { GFX } = stage;
  const ball = createBarneyBall(GFX);

  const barney = new GFX.Group();
  barney.name = 'barney';
  const tumble = new GFX.Group();
  tumble.name = 'tumble';
  const spinner = new GFX.Group();
  spinner.name = 'spinner';
  const gaze = new GFX.Group();
  gaze.name = 'gaze';
  gaze.rotation.order = 'YXZ';
  const roller = new GFX.Group();
  roller.name = 'roller';
  const body = new GFX.Group();
  body.name = 'body';

  barney.add(tumble);
  tumble.add(spinner);
  spinner.add(gaze);
  gaze.add(roller);
  roller.add(body);
  body.add(ball.group);
  stage.scene.add(barney);

  const attention = createAttention({ random });

  let state = 'idle';
  let mood = MOODS.idle;
  const m = { ...MOODS.idle };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;

  const yaw = { p: 0, v: 0 };
  const pitch = { p: 0, v: 0 };
  const sq = { p: 0, v: 0 };
  const tz = { p: 0, v: 0 };
  const tx = { p: 0, v: 0 };
  const jolt = { p: 0, v: 0 };

  let t = 0;
  let spinA = 0;
  let spinV = 0;
  let ang = 0;
  let x = 0;
  let dir = 1;
  let rest = 0;
  let fidgetT = 2.4;
  let lastMove = -Infinity;

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
  const side = new GFX.Vector3();
  const up = new GFX.Vector3(0, 1, 0);

  function pointerGaze() {
    if (!pointer.seen || !pointer.inside) return null;
    const rect = stage.renderer.domElement.getBoundingClientRect?.();
    if (!rect || !rect.width || !rect.height) return null;
    ndc.set(((pointer.x - rect.left) / rect.width) * 2 - 1, -((pointer.y - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, stage.camera);
    return pointerOffset({ ray: ray.ray, eye: barney.position, toCamera, reach: REACH * R });
  }

  function frame(dt) {
    t += dt;

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    energy = approach(energy, Math.min(1, sustain + impulse), 6, dt);
    for (const k in m) m[k] = approach(m[k], mood[k], 3.4, dt);

    const jitter = m.jitter * (1 + energy * ENERGY_GAIN.jitter);
    const squash = m.squash * (1 + energy * ENERGY_GAIN.squash);
    const rockAmp = m.rock + energy * ENERGY_GAIN.rock;

    // Where he is looking.
    toCamera.copy(stage.camera.position).sub(barney.position).normalize();
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
    if (look.speed === 'pursuit' && (Math.abs(look.yaw * TURN - yaw.p) > 0.2 || Math.abs(look.pitch * TURN - pitch.p) > 0.2)) {
      k = STIFFNESS.saccade;
    }
    const regard = TURN * m.regard;
    stepSpring(yaw, k, dt, look.yaw * regard, 0.9);
    stepSpring(pitch, k, dt, look.pitch * regard, 0.9);

    // A tumble hops him up and turns him over, drifting a little as he goes.
    let hop = 0;
    let driftX = 0;
    let driftZ = 0;
    if (look.gesture?.kind === 'tumble') {
      axis.set(look.gesture.axis.x, look.gesture.axis.y, look.gesture.axis.z);
      tumble.quaternion.setFromAxisAngle(axis, look.gesture.angle);
      hop = Math.sin(Math.PI * look.gesture.progress) * 0.55 * R;
      side.crossVectors(axis, up).normalize().multiplyScalar(0.25 * R * look.gesture.drift);
      driftX = side.x;
      driftZ = side.z;
    } else {
      tumble.quaternion.set(0, 0, 0, 1);
    }

    // Thinking: round and round on the spot, and back to rest.
    const spinning = state === 'thinking';
    if (spinning) {
      spinV += (m.spin - spinV) * Math.min(1, dt * 3.2) - spinV * 0.1 * dt;
    } else {
      spinV = approach(spinV, 0, 3.2, dt);
      if (Math.abs(spinV) < 0.05) spinV = 0;
      // Settle to the nearest face-on turn rather than stopping where it was.
      spinA = approach(spinA, Math.round(spinA / (Math.PI * 2)) * Math.PI * 2, 2.4, dt);
    }
    spinA += spinV * dt;

    // Speaking: a little roll one way, a rest, and back.
    const rolling = m.roll > 0.02 && !spinning;
    let lift = 0;
    if (rolling) {
      if (rest > 0) {
        rest -= dt;
      } else {
        const speed = 0.9 * m.roll;
        ang += dir * dt * speed * 3;
        x += dir * dt * speed * R * 3;
        lift = Math.abs(Math.sin(t * 7)) * 0.012;
        if (Math.abs(x) > ROLL_REACH) {
          dir *= -1;
          rest = 0.5 + random() * 0.6;
          sq.v += 1.2;
        }
      }
    } else {
      x = approach(x, 0, 1.8, dt);
      ang = approach(ang, 0, 1.8, dt);
      rest = 0;
    }

    if (m.fidget > 0.01) {
      fidgetT -= dt * m.fidget;
      if (fidgetT <= 0) {
        const r = random();
        if (r < 0.5) sq.v += 1.6;
        else { tz.v += (random() - 0.5) * 3.2; tx.v += 1; }
        fidgetT = 2.6 + random() * 4;
      }
    }

    spring(sq, 175, 10.5, dt, squash);
    const rock = Math.sin(t * m.rockSpeed * 2.0) * rockAmp;
    spring(tz, 68, 6.2, dt, rolling && rest <= 0 ? dir * 0.06 : rock);
    spring(tx, 68, 6.2, dt, m.lean * 0.14);
    stepSpring(jolt, 160, dt, 0, 0.5);

    const tremor = jitter * 0.01;
    const breathe = Math.sin(t * 1.3) * 0.004;
    const s = sq.p * 0.08 + breathe;
    const squashY = 1 - s;

    // Leaning in is also coming forward, toward the camera.
    const lean = m.lean * 0.18 * R;
    barney.position.set(
      x + toCamera.x * lean + driftX + (random() - 0.5) * tremor,
      R * squashY + lift + hop + jolt.p * R,
      toCamera.z * lean + driftZ + (random() - 0.5) * tremor,
    );
    barney.rotation.set(tx.p, 0, tz.p);

    spinner.rotation.y = spinA;
    gaze.rotation.set(-(home.pitch + pitch.p), home.yaw + yaw.p, 0);
    roller.rotation.z = -ang;
    body.scale.set(1 + s * 0.5, squashY, 1 + s * 0.5);
  }

  /** The stage's loop calls this once a frame; the camera follows the ball's centre. */
  function update(dt) {
    frame(Math.min(dt, 0.05));
    stage.target.set(0, R, 0);
  }

  return {
    get state() { return state; },
    get ball() { return ball; },

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      mood = MOODS[next];
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    pulse(weight = 0.3) {
      const w = Math.min(1, Math.max(0, weight));
      impulse = Math.min(1, impulse + w);
      sq.v += w * 2.2;
      jolt.v += w * 0.12;
      tz.v += (random() - 0.5) * w * 2.2;
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
