export const STORE_STREET_BOUNDS = { x0: -6.5, x1: 15.5, z0: -6.5, z1: 13.5 };

// Permanent street furniture. Dimensions are world-space collision footprints.
export const STORE_STREET_FIXTURES = [
  { kind: 'hatchback', x: 9.1, z: 10.65, width: 1.22, depth: 2.5 },
  { kind: 'van', x: 12.3, z: 10.65, width: 1.24, depth: 2.62 },
  { kind: 'hydrant', x: 6.95, z: 4.95, width: .57, depth: .46 },
  { kind: 'parkingSign', x: 14.55, z: 5.85, width: .32, depth: .24 },
  { kind: 'shelter', x: 12.25, z: -3.8, width: 2.9, depth: 1.25 },
  { kind: 'busStop', x: 10.4, z: -3.8, width: .35, depth: .24 },
  { kind: 'bin', x: 14, z: -3.8, width: .47, depth: .47 },
  { kind: 'planter', x: 7.6, z: -4.5, width: 1.2, depth: 1.2 },
  { kind: 'planter', x: 13.9, z: -.45, width: 1.2, depth: 1.2 },
  { kind: 'bench', x: -3.95, z: 9.6, width: 1.85, depth: .67 },
  { kind: 'planter', x: -5.4, z: 9.45, width: 1.2, depth: 1.2 },
  { kind: 'planter', x: -2.5, z: 9.45, width: 1.2, depth: 1.2 },
  { kind: 'parkingLamp', x: 7.1, z: 12.45, width: .27, depth: .27 },
  { kind: 'parkingLamp', x: 14.4, z: 12.45, width: .27, depth: .27 },
];

export const STORE_STREET_COLLIDERS = STORE_STREET_FIXTURES.map(({ x, z, width, depth }) => ({
  x0: x - width / 2,
  x1: x + width / 2,
  z0: z - depth / 2,
  z1: z + depth / 2,
}));
