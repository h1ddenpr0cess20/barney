import { FLOORS, tiled } from 'madness-engine/textures/painters';
import { World } from 'madness-engine/physics';

/**
 * The board from the engine's starter example (`examples/starter`), laid flat:
 * a planked floor in the physics and on screen. It is the same ground the
 * engine's own games are built on, so Barney rolls on it the way the marble
 * does.
 */
export const SIZE = 12;

/** Where Barney wanders: the floor, clear of its edge. */
export const ROAM = Object.freeze({ x: [1.3, 10.7], z: [1.3, 10.7] });

/** Where he starts, and where the camera first looks. */
export const HOME = Object.freeze({ x: 6, z: 6 });

/** The board's triangles, for the physics and for the picture alike: a tile at a time, so the planks tile. */
export function boardTriangles() {
  const tris = [];
  for (let x = 0; x < SIZE; x++) {
    for (let z = 0; z < SIZE; z++) {
      const a = [x, 0, z], b = [x, 0, z + 1], c = [x + 1, 0, z + 1], d = [x + 1, 0, z];
      tris.push([a, b, c], [a, c, d]);
    }
  }
  return tris;
}

/** Where a corner of a triangle is on the planks: across the ground. */
const uvOf = (tri) => tri.map(([x, , z]) => [x, z]);

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
