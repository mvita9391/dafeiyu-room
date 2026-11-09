import { STORE_STREET_BOUNDS } from './world/store-street.js';
import { COURTYARD_BOUNDS } from './world/templates.js';
// The historical browser name is an alias, never a second persistent scene.
export const normalizeSceneId = id => id === 'room' ? 'bedroom' : id;
export const furnitureTypes = ['coastalHouse','bed','desk','chair','shelf','lamp','bean','table','plant','smallPlant','nightstand','rug','livingSofa','livingTable','livingChair','livingShelf','livingLamp','livingPlant','livingRug','yardPool','yardFarm','yardTree','yardBench','yardLantern','yardFlowers','yardCan','yardSwing','yardPicnicTable','yardUmbrella','yardFlowerBox','yardRoseArch','yardBirdBath','shopBuilding','shopVending','shopLamp','shopCar'];
export function validLayout(data, scene='bedroom', bounds) {
  scene=normalizeSceneId(scene);
  const limit=scene==='seaside-town'?12:3.6;
  const {x0,x1,z0,z1}=bounds??(scene==='convenience-store'?STORE_STREET_BOUNDS:scene==='yard'?COURTYARD_BOUNDS:{x0:-limit,x1:limit,z0:-limit,z1:limit});
  return Array.isArray(data) && data.length<=100 && data.every(o =>
    o && furnitureTypes.includes(o.type) && Array.isArray(o.position) && o.position.length===3 &&
    o.position.every(Number.isFinite) && o.position[0]>=x0 && o.position[0]<=x1 && o.position[2]>=z0 && o.position[2]<=z1 && Math.abs(o.position[1])<=6 &&
    Number.isFinite(o.rotation) && Array.isArray(o.scale) && o.scale.length===3 &&
    o.scale.every(v=>Number.isFinite(v)&&v>0&&v<=4));
}
