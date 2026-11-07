import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clay } from "../core/materials.js";
import { P } from "../core/palette.js";
import { makeYardGarden } from "./yard-garden.js";
import { ResourcePool } from "../core/resource-pool.js";
import * as THREE from "three";
import {
  coastalSurface,
  coastalTerraceEdges,
  coastalTerrainHeight,
  COASTAL_LOW_OBSTACLES,
} from "../../shared/world/coastal.js";
const smooth = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
function terrainChunk(x0,z0,x1,z1){
  const positions=[],colors=[];
  const quad=(a,b,c,d,color)=>{for(const v of [a,b,c,a,c,d]){positions.push(...v);colors.push(color.r,color.g,color.b);}};
  const grass=new THREE.Color(0x9fbe78),sand=new THREE.Color(0xe5d2ad),earth=new THREE.Color(0xb99778),dark=new THREE.Color(0xa38062);
  const xs=[x0,x1,-5,-2,.25,1.75].filter(x=>x>=x0&&x<=x1);for(let x=x0+.18;x<x1;x+=.18)xs.push(x);xs.sort((a,b)=>a-b);
  const top=(xa,xb,za,zb,zc,zd,h,color)=>quad([xa,h,za],[xa,h,zb],[xb,h,zc],[xb,h,zd],color);
  for(let i=1;i<xs.length;i++){
    const xa=xs[i-1],xb=xs[i],mid=(xa+xb)/2;
    if(xb-xa<1e-7)continue;
    const ramp=(mid>=-5&&mid<=-2)||(mid>=.25&&mid<=1.75);
    // Analytic quad strips make continuous rounded contours and truly vertical strata,
    // instead of connecting discontinuous height-field samples into spikes.
    if(!ramp&&z0<2&&z1>-2){
      const ea=[-2,...coastalTerraceEdges(xa),2],eb=[-2,...coastalTerraceEdges(xb),2];
      for(let k=0;k<4;k++){
        const h=2-k*.5,a=Math.max(z0,ea[k]),b=Math.min(z1,ea[k+1]),c=Math.min(z1,eb[k+1]),d=Math.max(z0,eb[k]);
        if(b>a&&c>d)top(xa,xb,a,b,c,d,h,grass.clone().multiplyScalar(.94+h*.035));
        if(k<3&&ea[k+1]>=z0&&ea[k+1]<=z1){
          const za=ea[k+1],zb=eb[k+1];
          quad([xa,h,za],[xa,h-.07,za],[xb,h-.07,zb],[xb,h,zb],grass);
          quad([xa,h-.07,za],[xa,h-.44,za],[xb,h-.44,zb],[xb,h-.07,zb],earth.clone().multiplyScalar(1+k*.025));
          quad([xa,h-.44,za],[xa,h-.5,za],[xb,h-.5,zb],[xb,h-.44,zb],dark);
        }
      }
    }
    const zs=[z0,z1,-2,2,6].filter(z=>z>=z0&&z<=z1);for(let z=z0+.22;z<z1;z+=.22)zs.push(z);zs.sort((a,b)=>a-b);
    for(let j=1;j<zs.length;j++){
      const za=zs[j-1],zb=zs[j],zm=(za+zb)/2;if(zb-za<1e-7||(!ramp&&zm>-2&&zm<2))continue;
      const color=grass.clone().lerp(sand,Math.max(0,Math.min(1,(zm-1.6)/1.3)));
      quad([xa,coastalTerrainHeight(xa,za),za],[xa,coastalTerrainHeight(xa,zb),zb],[xb,coastalTerrainHeight(xb,zb),zb],[xb,coastalTerrainHeight(xb,za),za],color);
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,clay(0xffffff,{extra:{vertexColors:true,side:THREE.DoubleSide}}).clone());mesh.receiveShadow=true;return mesh;
}
function* detailChunk(x0, z0, x1, z1) {
  const group = new THREE.Group();
  let lastYield = 0;
  group.userData.buildStage = "terrain";
  group.add(terrainChunk(x0, z0, x1, z1));
  if (group.children.length !== lastYield) {
    lastYield = group.children.length;
    yield group;
  }
  const wood = clay(P.woodWarm).clone(),
    stone = clay(0xd7c8ab).clone(),
    leaf = clay(0x91b478).clone();
  const inside = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
  const box = (w, h, d, mat, x, y, z) => {
    if (!inside(x, z)) return;
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.055, h / 4, d / 4)),
      mat,
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };
  group.userData.buildStage = "paving";
  // Paving is laid against the sampled surface, including the street transition.
  for (let x = -11.5; x <= 0; x += 0.62) {
    box(0.57, 0.045, 1.1, stone, x, 2.025, -2.85 + Math.sin(x) * 0.055);
    if (group.children.length !== lastYield) {
      lastYield = group.children.length;
      yield group;
    }
  }
  for (let z = -1.8; z <= 1.9; z += 0.34) {
    const h = coastalSurface(-3.5, z).height;
    const p = box(2.65, 0.045, 0.33, stone, -3.5, h + 0.015, z);
    if (p) p.rotation.x = Math.atan(0.375);
    for (const x of [-5.04, -1.96]) {
      box(0.08, 0.72, 0.08, wood, x, h + 0.38, z);
    }
    if (group.children.length !== lastYield) {
      lastYield = group.children.length;
      yield group;
    }
  }
  for (const x of [-5.04, -1.96]) {
    const rail = box(0.1, 0.09, Math.hypot(4, 1.5), wood, x, 1.98, 0);
    if (rail) rail.rotation.x = Math.atan(0.375);
  }
  for (let i = 0; i < 10; i++) {
    box(1.48, 0.13, 0.42, stone, 1, 2 - i * 0.15, -1.8 + i * 0.4);
    if (group.children.length !== lastYield) {
      lastYield = group.children.length;
      yield group;
    }
  }
  for (let x = -6; x <= 10; x += 0.72) {
    box(0.64, 0.04, 0.95, stone, x, 0.52, 4.7 + Math.sin(x * 0.7) * 0.08);
    if (group.children.length !== lastYield) {
      lastYield = group.children.length;
      yield group;
    }
  }
  for (let z = 5.8; z <= 10.5; z += 0.24) {
    box(1.96, 0.07, 0.21, wood, 3, 0.5, z);
    if (group.children.length !== lastYield) {
      lastYield = group.children.length;
      yield group;
    }
  }
  for (const x of [2.04, 3.96])
    for (let z = 5.9; z <= 10.5; z += 0.9) {
      box(0.12, 1.18, 0.12, wood, x, 0.46, z);
      box(0.1, 0.08, 0.95, wood, x, 1.01, z + 0.35);
      if (group.children.length !== lastYield) {
        lastYield = group.children.length;
        yield group;
      }
    }
  group.userData.buildStage = "tree";
  const treeGeometry = new THREE.SphereGeometry(1, 10, 7);
  const trees = [
    [-10, -10],
    [-8, -9],
    [2, -10],
    [5, -8],
    [8, -10],
    [10, -6],
    [-10, 3],
    [-8, 5],
    [10, 5],
    [-8, -5],
    [7, -4],
    [4, -7],
    [9, -8],
    [-11, -7],
  ];
  for (const [x, z] of trees)
    if (inside(x, z)) {
      const h = coastalTerrainHeight(x, z),
        tree = new THREE.Group();
      tree.position.set(x, h, z);
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.14, 1.25, 8),
        wood,
      );
      trunk.position.y = 0.6;
      tree.add(trunk);
      for (let i = 0; i < 5; i++) {
        const m = new THREE.Mesh(
          treeGeometry,
          i % 2 ? leaf : clay(0xa9bd85).clone(),
        );
        m.scale.set(0.65, 0.58, 0.61);
        m.position.set(
          Math.sin(i * 2.4) * 0.38,
          1.25 + (i === 0 ? 0.45 : 0),
          Math.cos(i * 2.4) * 0.32,
        );
        m.castShadow = true;
        tree.add(m);
      }
      group.add(tree);
      if (group.children.length !== lastYield) {
        lastYield = group.children.length;
        yield group;
      }
    }
  group.userData.buildStage = "flower";
  const patches = [
    [-9, -8.8],
    [-6, -10],
    [2, -8],
    [8, -9],
    [-8, 3],
    [8, 3],
    [-6, 4],
    [10, 5],
    [-10, -5],
  ].filter(([x, z]) => inside(x, z));
  for (const placement of patches) {
    const garden = makeYardGarden({ placements: [placement] });
    for (const p of garden.children)
      p.position.y = coastalTerrainHeight(p.position.x, p.position.z);
    group.add(garden);
    if (group.children.length !== lastYield) {
      lastYield = group.children.length;
      yield group;
    }
  }
  group.userData.buildStage = "rocks";
  for (const r of COASTAL_LOW_OBSTACLES)
    box(
      r.x1 - r.x0,
      r.height,
      r.z1 - r.z0,
      clay(0xb7b09e).clone(),
      (r.x0 + r.x1) / 2,
      2 + r.height / 2,
      (r.z0 + r.z1) / 2,
    );
  for (let i = 0; i < 20; i++) {
    const x = -11 + i * 1.12,
      z = 7.2 + Math.sin(i * 1.3) * 0.45;
    if (!inside(x, z)) continue;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(1, 7, 5),
      clay(0xbab4a5).clone(),
    );
    m.position.set(x, coastalTerrainHeight(x, z) + 0.06, z);
    m.scale.set(0.25 + (i % 3) * 0.1, 0.16 + (i % 2) * 0.12, 0.23);
    m.rotation.y = i;
    group.add(m);
  }
  return group;
}
export function buildCoastalTown() {
  const root = new THREE.Group(),
    chunks = new Map(),
    pool = new ResourcePool();
  for (let x = -12; x < 12; x += 8)
    for (let z = -12; z < 12; z += 8)
      chunks.set(`${x},${z}`, {
        x,
        z,
        root: null,
        resources: null,
        iterator: null,
        complete: false,
      });
  const waterGeo = new THREE.PlaneGeometry(24, 7, 24, 14);
  waterGeo.rotateX(-Math.PI / 2);
  const colors = [];
  for (let i = 0; i < waterGeo.attributes.position.count; i++) {
    const z = waterGeo.attributes.position.getZ(i) + 8.5;
    waterGeo.attributes.position.setZ(i, z);
    const c = new THREE.Color(0xa6d9d5).lerp(
      new THREE.Color(0x64a8bf),
      Math.max(0, (z - 7) / 5),
    );
    colors.push(c.r, c.g, c.b);
  }
  waterGeo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const waterMat = clay(0xffffff, {
      extra: {
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        roughness: 0.38,
      },
    }).clone(),
    water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0.005;
  root.add(water);
  const foamGeo = new THREE.BufferGeometry(),
    foamPoints = [];
  for (let x = -11.8; x <= 11.8; x += 0.18)
    foamPoints.push(
      x,
      0.025,
      7.7 + Math.sin(x * 0.45) * 0.42 + Math.sin(x * 0.9) * 0.13,
    );
  foamGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(foamPoints, 3),
  );
  const foam = new THREE.Line(
    foamGeo,
    new THREE.LineBasicMaterial({
      color: 0xf4efda,
      transparent: true,
      opacity: 0.65,
    }),
  );
  root.add(foam);
  const queue = [],
    taskTimes = [];
  let generation = 0;
  const stats = {
    resident: 0,
    pending: 0,
    maxResident: 16,
    concurrency: 2,
    cacheBudgetBytes: 64 * 1024 * 1024,
    cacheBytes: 0,
    maxTaskMs: 0,
    maxTaskStage: null,
    taskP95Ms: 0,
    maxRetainMs: 0,
  };
  root.userData.streaming = {
    stats,
    update(position) {
      generation++;
      const wanted = [...chunks.values()]
          .filter(
            (c) =>
              Math.hypot(c.x + 4 - position[0], c.z + 4 - position[2]) < 22,
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x + 4 - position[0], a.z + 4 - position[2]) -
              Math.hypot(b.x + 4 - position[0], b.z + 4 - position[2]),
          )
          .slice(0, 16),
        ids = new Set(wanted);
      for (const c of chunks.values())
        if (c.root && !ids.has(c)) {
          root.remove(c.root);
          pool.release(c.resources);
          c.root = null;
          c.resources = null;
          c.iterator = null;
          c.complete = false;
        }
      queue.length = 0;
      for (const c of wanted) if (!c.complete) queue.push({ c, generation });
      stats.pending = queue.length;
    },
    tick() {
      const t = performance.now() / 1000;
      water.position.y = 0.005 + Math.sin(t * 0.8) * 0.008;
      foam.material.opacity = 0.5 + Math.sin(t) * 0.12;
      let count = 0;
      const start = performance.now();
      while (queue.length && count++ < 2 && performance.now() - start < 4) {
        const job = queue.shift();
        if (job.generation !== generation) continue;
        const c = job.c,
          taskStart = performance.now();
        if (!c.iterator)
          c.iterator = detailChunk(
            c.x,
            c.z,
            Math.min(12, c.x + 8),
            Math.min(12, c.z + 8),
          );
        const result = c.iterator.next();
        if (!c.root) {
          c.root = result.value;
          root.add(c.root);
        }
        const generationTime = performance.now() - taskStart,
          stage = c.root.userData.buildStage;
        const previous = c.resources,
          retainStart = performance.now();
        c.resources = pool.retain(c.root);
        if (previous) pool.release(previous);
        stats.maxRetainMs = Math.max(
          stats.maxRetainMs,
          performance.now() - retainStart,
        );
        if (result.done) {
          c.complete = true;
          c.iterator = null;
        } else queue.push(job);
        taskTimes.push(generationTime);
        if (taskTimes.length > 512) taskTimes.shift();
        stats.taskP95Ms = [...taskTimes].sort((a, b) => a - b)[
          Math.floor(taskTimes.length * 0.95)
        ];
        if (generationTime > stats.maxTaskMs) {
          stats.maxTaskMs = generationTime;
          stats.maxTaskStage = stage;
        }
      }
      stats.resident = [...chunks.values()].filter((c) => c.root).length;
      stats.pending = queue.length;
    },
    dispose() {
      generation++;
      queue.length = 0;
      for (const c of chunks.values())
        if (c.resources) {
          c.root.removeFromParent();
          pool.release(c.resources);
          c.root = null;
          c.resources = null;
        }
      pool.release(pool.retain(root));
      chunks.clear();
      root.clear();
    },
  };
  root.userData.streaming.update([-10, 2, -2]);
  return root;
}
export function makeCoastalHouse() {
  const g = new THREE.Group(),
    wall = clay(P.wall).clone(),
    wood = clay(P.woodWarm).clone(),
    tile = clay(0xc99376).clone(),
    stone = clay(0xd5c6aa).clone(),
    glass = new THREE.MeshStandardMaterial({
      color: 0x97cad1,
      roughness: 0.28,
      metalness: 0.12,
      emissive: 0xbfd8c3,
      emissiveIntensity: 0.12,
    });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.04, h / 5, d / 5)),
      mat,
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  box(3.2, 2.4, 2.6, wall, 0, 1.2, 0);
  box(3.35, 0.18, 2.75, stone, 0, 0.09, 0);
  const angle = Math.atan(0.7 / 1.85);
  for (const side of [-1, 1]) {
    const roof = box(
      Math.hypot(1.85, 0.7),
      0.14,
      3.1,
      tile,
      side * 0.925,
      2.78,
      0,
    );
    roof.rotation.z = -side * angle;
    box(0.1, 0.12, 3.15, wood, side * 1.83, 2.39, 0);
  }
  box(0.13, 0.12, 3.2, tile, 0, 3.15, 0);
  for (const side of [-1, 1])
    for (let z = -1.4; z <= 1.4; z += 0.35) {
      const ridge = box(
        Math.hypot(1.85, 0.7),
        0.035,
        0.045,
        tile,
        side * 0.925,
        2.87,
        z,
      );
      ridge.rotation.z = -side * angle;
    }

  for (const z of [-1.33, 1.33]) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [-1.6, 2.4, z, 1.6, 2.4, z, 0, 3.08, z],
        3,
      ),
    );
    geo.computeVertexNormals();
    const mat = wall.clone();
    mat.side = THREE.DoubleSide;
    g.add(new THREE.Mesh(geo, mat));
    box(3.2, 0.09, 0.1, wood, 0, 2.39, z);
  }
  for (const x of [-1.55, 1.55]) box(0.1, 2.35, 0.1, wood, x, 1.24, 1.33);
  box(0.8, 1.65, 0.09, wood, 0, 0.93, 1.34);
  box(0.62, 0.58, 0.035, glass, 0, 1.28, 1.4);
  box(0.04, 0.6, 0.045, wall, 0, 1.28, 1.43);
  box(0.55, 0.035, 0.04, wall, 0, 1.28, 1.43);
  const knob = new THREE.Mesh(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0xd9b87a,
      metalness: 0.5,
      roughness: 0.35,
    }),
  );
  knob.position.set(0.25, 0.8, 1.43);
  g.add(knob);
  for (const x of [-1, 1]) {
    box(0.65, 0.78, 0.06, glass, x, 1.45, 1.34);
    for (const dx of [-0.36, 0.36])
      box(0.07, 0.9, 0.1, wood, x + dx, 1.45, 1.4);
    for (const y of [1.02, 1.88]) box(0.78, 0.07, 0.1, wood, x, y, 1.4);
    box(0.035, 0.8, 0.11, wood, x, 1.45, 1.42);
    box(0.68, 0.035, 0.1, wood, x, 1.45, 1.42);
    box(0.8, 0.16, 0.24, wood, x, 0.88, 1.42);
    for (let i = 0; i < 5; i++) {
      const bloom = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.065, 1),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0xf1b6ba : 0xfbe6af }),
      );
      bloom.position.set(x - 0.28 + i * 0.14, 1, 1.45);
      g.add(bloom);
    }
  }
  box(0.95, 0.12, 0.35, stone, 0, 0.12, 1.48);
  box(1.15, 0.07, 0.35, stone, 0, 0.04, 1.65);
  return g;
}
