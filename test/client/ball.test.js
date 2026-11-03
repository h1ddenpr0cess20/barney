import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as GFX from 'madness-engine/gfx';

import { createBarney } from '../../src/client/ball/index.js';
import { ENERGY_GAIN, MOODS } from '../../src/client/ball/moods.js';
import { RESIN } from '../../src/client/ball/model.js';
import { approach, spring } from '../../src/client/ball/motion.js';

/** The angle between two orientations, in radians. */
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w)));
const UPRIGHT = new GFX.Quaternion();

const CHANNELS = ['roam', 'pace', 'spin', 'regard', 'hop'];

describe('MOODS', () => {
  it('covers the four conversational states', () => {
    assert.deepEqual(Object.keys(MOODS).sort(), ['idle', 'listening', 'speaking', 'thinking']);
  });

  it('gives every state every channel, finite', () => {
    for (const [name, mood] of Object.entries(MOODS)) {
      assert.deepEqual(Object.keys(mood).sort(), [...CHANNELS].sort(), `${name} is missing a channel`);
      for (const [channel, value] of Object.entries(mood)) {
        assert.ok(Number.isFinite(value), `${name}.${channel} is not finite`);
      }
    }
  });

  it('names only channels that exist when energy pushes them', () => {
    for (const channel of Object.keys(ENERGY_GAIN)) assert.ok(channel in MOODS.idle, channel);
  });

  it('rolls round most while talking, never while listening or thinking', () => {
    assert.ok(MOODS.speaking.roam > MOODS.idle.roam);
    assert.equal(MOODS.listening.roam, 0);
    assert.equal(MOODS.thinking.roam, 0);
  });

  it('spins for thinking and nothing else, which is the pose that reads, and looks at nothing then', () => {
    assert.ok(MOODS.thinking.spin > 0);
    for (const name of ['idle', 'listening', 'speaking']) assert.equal(MOODS[name].spin, 0, name);
    assert.equal(MOODS.thinking.regard, 0);
  });
});

describe('motion', () => {
  it('a spring settles on its target', () => {
    const s = { p: -2, v: 0 };
    for (let i = 0; i < 2000; i++) spring(s, 175, 10.5, 1 / 60, 1);
    assert.ok(Math.abs(s.p - 1) < 1e-6);
  });

  it('approach lands on target rather than overshooting', () => {
    assert.equal(approach(0, 1, 10, 1), 1);
  });
});

describe('Barney\'s resin', () => {
  it('is the tiger flame ball', () => {
    assert.equal(RESIN.design, 'flame');
    assert.equal(RESIN.colors.base, '#492b19');
  });
});

describe('createBarney', () => {
  async function rig() {
    const { createBoard, ROAM } = await import('../../src/client/ball/board.js');
    const scene = new GFX.Scene();
    const camera = new GFX.PerspectiveCamera(36, 800 / 600, 0.3, 400);
    camera.position.set(3.8, 2.6, 10);
    camera.lookAt(3.8, 0.52, 6);
    camera.updateMatrixWorld();
    const stage = {
      GFX, scene, camera, target: new GFX.Vector3(),
      view: { step() {} },
      renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } },
    };
    const events = new EventTarget();
    const board = createBoard(GFX);
    let n = 0;
    const random = () => ((n = (n * 9301 + 49297) % 233280 || 1234) / 233280);
    return { stage, events, ROAM, barney: createBarney({ stage, board, events, random }) };
  }

  it('puts a named, three-holed bowling ball in the scene', async () => {
    const { stage, barney } = await rig();
    const root = stage.scene.getObjectByName('barney');
    assert.ok(root.getObjectByName('resin_shell'));
    assert.equal(root.getObjectByName('bowling_ball').children.filter((c) => /finger_hole/.test(c.name)).length, 3);
    barney.dispose();
  });

  it('ignores a state that is not one of the four', async () => {
    const { barney } = await rig();
    barney.setState('speaking');
    for (const junk of ['nonsense', 'constructor', '__proto__', 'toString']) {
      barney.setState(junk);
      assert.equal(barney.state, 'speaking', `${junk} was taken for a mood`);
    }
    barney.dispose();
  });

  it('never changes shape, whatever the state, the level or the frame length', async () => {
    const { stage, barney } = await rig();
    const root = stage.scene.getObjectByName('barney');
    const body = stage.scene.getObjectByName('body');
    barney.setLevel(4); barney.setLevel(-1); barney.pulse(9); barney.pulse(-3);
    for (const state of Object.keys(MOODS)) {
      barney.setState(state);
      for (let i = 0; i < 240; i++) {
        barney.setLevel(Math.abs(Math.sin(i / 7)));
        if (i % 20 === 0) barney.pulse(0.8);
        barney.update(0.05);
        for (const o of [root, body]) {
          assert.deepEqual([o.scale.x, o.scale.y, o.scale.z], [1, 1, 1], `${state} squashed ${o.name}`);
        }
        const { x, y, z } = root.position;
        assert.ok([x, y, z].every(Number.isFinite), `${state} went non-finite`);
        assert.ok(y > 0.4, `${state} sank into the floor (${y})`);
      }
    }
    barney.dispose();
  });

  it('rolls round the board while he talks, and stays on the floor he may roam', async () => {
    const { barney, ROAM } = await rig();
    barney.setState('speaking');
    const start = barney.at;
    let farthest = 0;
    for (let i = 0; i < 600; i++) {
      barney.setLevel(0.5);
      barney.update(1 / 30);
      const { x, z } = barney.at;
      assert.ok(x > ROAM.x[0] - 0.4 && x < ROAM.x[1] + 0.4, `rolled off the floor at x=${x}`);
      assert.ok(z > ROAM.z[0] - 0.4 && z < ROAM.z[1] + 0.4, `rolled off the floor at z=${z}`);
      farthest = Math.max(farthest, Math.hypot(x - start.x, z - start.z));
    }
    assert.ok(farthest > 0.8, `only ever got ${farthest} from where he started`);
    barney.dispose();
  });

  it('turns as he rolls — the roll is the physics\'s, not a slide', async () => {
    const { stage, barney } = await rig();
    const body = stage.scene.getObjectByName('body');
    barney.setState('speaking');
    let turned = 0;
    for (let i = 0; i < 300; i++) {
      barney.update(1 / 30);
      turned = Math.max(turned, angle(body.quaternion, UPRIGHT));
    }
    assert.ok(turned > 0.5, `never turned (${turned})`);
    barney.dispose();
  });

  it('stays where he is while he listens or thinks', async () => {
    const { barney } = await rig();
    barney.setState('speaking');
    for (let i = 0; i < 90; i++) barney.update(1 / 30);
    for (const state of ['listening', 'thinking']) {
      barney.setState(state);
      for (let i = 0; i < 120; i++) barney.update(1 / 30);
      const here = barney.at;
      for (let i = 0; i < 90; i++) barney.update(1 / 30);
      const { x, z } = barney.at;
      assert.ok(Math.hypot(x - here.x, z - here.z) < 0.05, `${state} kept rolling`);
    }
    barney.dispose();
  });

  it('spins while thinking and turns back to face you when he stops', async () => {
    const { stage, barney } = await rig();
    const body = stage.scene.getObjectByName('body');
    barney.setState('thinking');
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      barney.update(1 / 30);
      peak = Math.max(peak, angle(body.quaternion, UPRIGHT));
    }
    assert.ok(peak > 1, 'did not spin');
    barney.setState('listening');
    for (let i = 0; i < 400; i++) barney.update(1 / 30);
    // Face on: all that is left is the gaze, which is small.
    assert.ok(angle(body.quaternion, UPRIGHT) < 1, `did not settle face on (${angle(body.quaternion, UPRIGHT)} rad off)`);
    barney.dispose();
  });

  it('turns toward the pointer, to either side', async () => {
    const { stage, events, barney } = await rig();
    const body = stage.scene.getObjectByName('body');
    barney.setState('listening');
    const point = (clientX) => {
      for (let i = 0; i < 120; i++) {
        events.dispatchEvent(Object.assign(new Event('pointermove'), { clientX, clientY: 300 }));
        barney.update(1 / 30);
      }
      // Which way his front points, across the screen.
      return new GFX.Vector3(0, 0, 1).applyQuaternion(body.quaternion).x;
    };
    const right = point(790);
    const left = point(10);
    assert.ok(right > left + 0.1, `faced ${right} for the right and ${left} for the left`);
    barney.dispose();
  });
});
