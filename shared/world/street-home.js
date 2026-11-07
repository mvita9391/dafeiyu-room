// Fixed street architecture: the open gate faces +X toward the road.
const facadeScale=1.34;
const centerZ=3.4;
const houseHalfWidth=1.425*facadeScale;
const courtyardSides=[1.58,5.32];
export const STREET_HOME={
 facadeScale,courtyardSides,
 houseCenter:[-5.25,0,centerZ],gateCenter:[-2.75,0,centerZ],departure:[-3.45,0,centerZ],inwardNormal:[1,0,0],
 colliders:[
  {x0:-6.4,x1:-4.05,z0:centerZ-houseHalfWidth,z1:centerZ+houseHalfWidth},
  ...courtyardSides.map(z=>({x0:-6.4,x1:-2.7,z0:z-.09,z1:z+.09})),
  {x0:-2.84,x1:-2.66,z0:courtyardSides[0]+.09,z1:2.75},
  {x0:-2.84,x1:-2.66,z0:4.05,z1:courtyardSides[1]-.09},
 ],
};
