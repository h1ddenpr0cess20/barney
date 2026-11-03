import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as GFX from 'madness-engine/gfx';

import { createBarney } from '../../src/client/ball/index.js';
import { ENERGY_GAIN, MOODS } from '../../src/client/ball/moods.js';
import { RESIN } from '../../src/client/ball/model.js';
import { approach, spring } from '../../src/client/ball/motion.js';

const CHANNELS = ['jitter', 'lean', 'rock', 'rockSpeed', 'roll', 'spin', 'squash', 'fidget', 'regard'];

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

  it('spins for thinking and nothing else, rolls only while talking, and looks away from nothing but thinking', () => {
    assert.ok(MOODS.thinking.spin > 0);
    for (const name of ['idle', 'listening', 'speaking']) assert.equal(MOODS[name].spin, 0, name);
    assert.ok(MOODS.speaking.roll > 0);
    assert.equal(MOODS.idle.roll, 0);
    assert.equal(MOODS.thinking.regard, 0);
  });

  it('leans in to listen', () => {
    assert.ok(MOODS.listening.lean > MOODS.idle.lean);
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
  function rig() {
    const scene = new GFX.Scene();
    const camera = new GFX.PerspectiveCamera(36, 1, 0.3, 400);
    camera.position.set(0, 0.7, 3.9);
    camera.lookAt(0, 0.52, 0);
    camera.updateMatrixWorld();
    const stage = {
      GFX, scene, camera,
      renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } },
      target: new GFX.Vector3(),
    };
    const events = new EventTarget();
    return { stage, barney: createBarney({ stage, events, random: () => 0.5 }) };
  }

  it('puts a named bowling ball in the scene', () => {
    const { stage, barney } = rig();
    const root = stage.scene.getObjectByName('barney');
    assert.ok(root);
    assert.ok(root.getObjectByName('resin_shell'));
    assert.equal(root.getObjectByName('bowling_ball').children.filter((c) => /finger_hole/.test(c.name)).length, 3);
    barney.dispose();
  });

  it('ignores a state that is not one of the four', () => {
    const { barney } = rig();
    barney.setState('speaking');
    for (const junk of ['nonsense', 'constructor', '__proto__', 'toString']) {
      barney.setState(junk);
      assert.equal(barney.state, 'speaking', `${junk} was taken for a mood`);
    }
    barney.dispose();
  });

  it('survives a bad level and every state at the longest frame, staying finite and on the floor', () => {
    const { stage, barney } = rig();
    const root = stage.scene.getObjectByName('barney');
    barney.setLevel(4); barney.setLevel(-1); barney.pulse(9); barney.pulse(-3);
    for (const state of Object.keys(MOODS)) {
      barney.setState(state);
      for (let i = 0; i < 240; i++) {
        barney.setLevel(Math.abs(Math.sin(i / 7)));
        if (i % 30 === 0) barney.pulse(0.5);
        barney.update(0.05);
        const { x, y, z } = root.position;
        assert.ok([x, y, z].every(Number.isFinite), `${state} went non-finite`);
        assert.ok(y > 0.3, `${state} sank into the floor (${y})`);
      }
    }
    barney.dispose();
  });

  it('spins while thinking and settles face-on afterwards', () => {
    const { stage, barney } = rig();
    const spinner = stage.scene.getObjectByName('spinner');
    barney.setState('thinking');
    for (let i = 0; i < 120; i++) barney.update(1 / 30);
    assert.ok(Math.abs(spinner.rotation.y) > 1, 'did not spin');
    barney.setState('idle');
    for (let i = 0; i < 600; i++) barney.update(1 / 30);
    const turns = spinner.rotation.y / (Math.PI * 2);
    assert.ok(Math.abs(turns - Math.round(turns)) < 0.02, `stopped at ${turns} turns, not face-on`);
    barney.dispose();
  });

  it('turns toward the pointer, to either side', () => {
    const scene = new GFX.Scene();
    const camera = new GFX.PerspectiveCamera(36, 800 / 600, 0.3, 400);
    camera.position.set(0, 0.7, 3.9);
    camera.lookAt(0, 0.52, 0);
    camera.updateMatrixWorld();
    const stage = {
      GFX, scene, camera, target: new GFX.Vector3(),
      renderer: { domElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } },
    };
    const events = new EventTarget();
    const barney = createBarney({ stage, events, random: () => 0.5 });
    const gaze = scene.getObjectByName('gaze');
    const point = (clientX) => {
      for (let i = 0; i < 90; i++) {
        events.dispatchEvent(Object.assign(new Event('pointermove'), { clientX, clientY: 300 }));
        barney.update(1 / 30);
      }
      return gaze.rotation.y;
    };
    const right = point(790);
    const left = point(10);
    assert.ok(right > 0.1, `looked ${right} for a pointer on the right`);
    assert.ok(left < -0.1, `looked ${left} for a pointer on the left`);
    barney.dispose();
  });
});
