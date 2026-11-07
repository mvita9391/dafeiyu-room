import {authorSurface} from './author-scenes.js';
export const COASTAL_ID = "seaside-town";
export const COASTAL_ZONES = [
  {
    zoneId: "home-plot",
    purpose: "housing",
    bounds: { x0: -7, x1: -1, z0: -9, z1: -4 },
    height: 2,
  },
  {
    zoneId: "beach-plot",
    purpose: "decoration",
    bounds: { x0: 5, x1: 10, z0: 2, z1: 5 },
    height: 0.5,
  },
];
export const COASTAL_LANDMARKS = [
  { landmarkId: "entrance", name: "街区入口", position: [-10, 2, -2] },
  { landmarkId: "terrace", name: "海边平台", position: [0, 2, -3] },
  { landmarkId: "beach", name: "沙滩", position: [0, 0.5, 5] },
  { landmarkId: "pier", name: "短码头", position: [3, 0.5, 9] },
  { landmarkId: "shallows", name: "浅海", position: [-3, 0, 9] },
];
export function coastalSurface(x, z) {
  if (x < -11.8 || x > 11.8 || z < -11.8 || z > 11.8) return null;
  if (z <= -2) return { height: 2, kind: "land" };
  if (z < 2) {
    if ((x < -5 || x > -2) && (x < 0.25 || x > 1.75)) return null;
    return { height: 2 - (z + 2) * 0.375, kind: "land" };
  }
  if (z <= 6) return { height: 0.5, kind: "land" };
  if (x >= 2 && x <= 4 && z <= 10.5) return { height: 0.5, kind: "deck" };
  if (z < 8) {
    if (x < -2 || x > 1) return null;
    return { height: Math.max(0, 0.5 - (z - 6) * 0.25), kind: "land" };
  }
  return { height: 0, kind: "water" };
}
export function surfaceAt(template, x, z) {
  if(template.authorSceneId)return authorSurface(template.authorSceneId,x,z);
  return template.templateId === "coastal_town_v1"
    ? coastalSurface(x, z)
    : { height: template.groundY, kind: "land" };
}
export function surfaceSegment(template, a, b) {
  if (template.templateId !== "coastal_town_v1"&&!template.authorSceneId) return true;
  const n = Math.max(1, Math.ceil(Math.hypot(a[0] - b[0], a[2] - b[2]) / 0.08));
  let prev = surfaceAt(template, a[0], a[2]);
  if (!prev) return false;
  for (let i = 1; i <= n; i++) {
    const s = surfaceAt(
      template,
      a[0] + ((b[0] - a[0]) * i) / n,
      a[2] + ((b[2] - a[2]) * i) / n,
    );
    if (
      !s ||
      Math.abs(s.height - prev.height) > (template.maxStepHeight??(template.authorSceneId?.22:.08)) ||
      ((s.kind === "deck") !== (prev.kind === "deck") &&
        (s.kind === "water" || prev.kind === "water"))
    )
      return false;
    prev = s;
  }
  return true;
}
export const COASTAL_SCENE = {
  sceneId: COASTAL_ID,
  name: "海边小镇",
  templateId: "coastal_town_v1",
  status: "active",
};

export const COASTAL_LOW_OBSTACLES = [
  { x0: 1.6, x1: 2.4, z0: -5.4, z1: -4.6, height: 0.35 },
  { x0: 4.6, x1: 5.4, z0: -5.4, z1: -4.6, height: 0.45 },
];

export const COASTAL_ENTITIES = [
  {
    type: "coastalHouse",
    position: [-4, 2, -6],
    rotation: 0,
    scale: [1, 1, 1],
  },
  {
    type: "yardBench",
    position: [7, 0.5, 3],
    rotation: Math.PI,
    scale: [1, 1, 1],
  },
  {
    type: "yardFlowerBox",
    position: [-6, 2, -8.5],
    rotation: 0,
    scale: [1, 1, 1],
  },
  {
    type: "yardLantern",
    position: [9, 0.5, 3.5],
    rotation: 0,
    scale: [0.7, 0.7, 0.7],
  },
];

// Continuous visible terrain; blocked shoulders still have a real surface, while
// coastalSurface remains the authoritative set of permitted walking surfaces.
export function coastalTerraceEdges(x){return [-1.12+Math.sin(x*.72)*.19+Math.cos(x*1.31)*.09,.03+Math.sin(x*.53+.9)*.28,1.34+Math.sin(x*.61-.4)*.22];}
export function coastalTerrainHeight(x, z) {
  const ground = coastalSurface(x, z);
  if (ground && ground.kind !== "deck" && ground.kind !== "water")
    return ground.height;
  if (z < -2) return 2;
  if (z < 2) {
    // Three broad grass shelves with softly undulating outlines and narrow earth faces.
    const [edge1,edge2,edge3]=coastalTerraceEdges(x);
    if(z<edge1)return 2;
    if(z<edge2)return 1.5;
    if(z<edge3)return 1;
    return .5;
  }
  if (z <= 6) return 0.5;
  const coast = 7.7 + Math.sin(x * 0.45) * 0.42 + Math.sin(x * 0.9) * 0.13,
    t = Math.max(0, Math.min(1, (z - 6) / (coast - 6)));
  return 0.5 - 0.7 * t * t * (3 - 2 * t);
}
