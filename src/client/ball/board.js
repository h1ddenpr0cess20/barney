import { FLOORS, tiled } from 'madness-engine/textures/painters';
import { World } from 'madness-engine/physics';

/**
 * The board from the engine's starter example (`examples/starter`): a planked
 * floor in the physics and on screen, with a ramp up to a platform. It is the
 * same ground the engine's own games are built on, so Barney rolls on it the
 * way the marble does.
 */
export const SIZE = 12;
const PLATFORM = { x0: 7, x1: 11, z0: 7, z1: 11, y: 1 };
const RAMP = { z0: 3, z1: 7 };

/** Where Barney wanders: the flat floor beside the ramp, clear of its walls and the edge. */
export const ROAM = Object.freeze({ x: [1.3, 6.2], z: [1.3, 10.7] });

/** Where he starts, and where the camera first looks. */
export const HOME = Object.freeze({ x: 3.8, z: 6 });

/** How high the board is at (x, z); null off its edge. */
export function heightAt(x, z) {
  if (x < 0 || z < 0 || x > SIZE || z > SIZE) return null;
  if (x >= PLATFORM.x0 && x <= PLATFORM.x1) {
    if (z >= PLATFORM.z0 && z <= PLATFORM.z1) return PLATFORM.y;
    if (z >= RAMP.z0 && z < RAMP.z1) return ((z - RAMP.z0) / (RAMP.z1 - RAMP.z0)) * PLATFORM.y;
  }
  return 0;
}

/** The board's triangles, for the physics and for the picture alike. */
export function boardTriangles() {
  const tris = [];
  const quad = (a, b, c, d) => tris.push([a, b, c], [a, c, d]);
  const { x0, x1, z0, z1, y } = PLATFORM;
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      // A tile of the ramp or the platform has its corners at their height; the rest is floor.
      const raised = x >= x0 && x < x1 && z >= RAMP.z0 && z < z1;
      const at = (px, pz) => [px, raised ? heightAt(px, pz) : 0, pz];
      quad(at(x, z), at(x, z + 1), at(x + 1, z + 1), at(x + 1, z));
    }
  }
  // The sides: the back of the platform, and down each side the ramp and the platform.
  quad([x0, 0, z1], [x0, y, z1], [x1, y, z1], [x1, 0, z1]);
  for (const x of [x0, x1]) {
    tris.push([[x, 0, RAMP.z0], [x, 0, z0], [x, y, z0]]);
    quad([x, 0, z0], [x, 0, z1], [x, y, z1], [x, y, z0]);
  }
  return tris;
}

/** Where a corner of a triangle is on the planks: across the ground for the floor, along and up for a side. */
function uvOf(tri) {
  const upright = tri.every((p) => p[0] === tri[0][0]) || tri.every((p) => p[2] === tri[0][2]);
  return tri.map(([x, y, z]) => (upright ? [x + z, y] : [x, z]));
}

/** The board in the physics, and drawn in planks. */
export function createBoard(GFX) {
  const world = new World({ cols: SIZE, rows: SIZE });
  const position = [], uv = [];
  for (const tri of boardTriangles()) {
    world.addTriangle(...tri.flat());
    position.push(...tri.flat());
    uv.push(...uvOf(tri).flat());
  }
  world.finish();

  const geometry = new GFX.BufferGeometry();
  geometry.setAttribute('position', new GFX.BufferAttribute(new Float32Array(position), 3));
  geometry.setAttribute('uv', new GFX.BufferAttribute(new Float32Array(uv), 2));
  geometry.computeVertexNormals();

  // Under node there is no canvas to paint planks on; the board is then plain.
  const planks = typeof document === 'undefined' ? null : FLOORS.planks(GFX);
  const mesh = new GFX.Mesh(geometry, new GFX.MeshStandardMaterial({
    name: 'board', color: new GFX.Color('#b88a5a'), roughness: 0.7, side: GFX.DoubleSide,
    ...(planks ? { map: tiled(GFX, planks.map, 1, 1), bumpMap: tiled(GFX, planks.bump, 1, 1), bumpScale: 0.6 } : {}),
  }));
  mesh.name = 'board';
  mesh.receiveShadow = true;
  return { world, mesh };
}
