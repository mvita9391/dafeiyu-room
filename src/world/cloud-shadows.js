import * as THREE from 'three';
import {outdoorHash} from '../../shared/world/outdoor-builder.js';

const tileSize=72;
let cloudMap;

function makeCloudMap(){
 const size=128,pixels=new Uint8Array(size*size);
 const smooth=t=>t*t*(3-2*t);
 function noise(u,v,cells,seed){
  const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y);
  const tx=smooth(x-ix),ty=smooth(y-iy);
  const corner=(dx,dy)=>outdoorHash((ix+dx)%cells+seed,(iy+dy)%cells+seed);
  return THREE.MathUtils.lerp(
   THREE.MathUtils.lerp(corner(0,0),corner(1,0),tx),
   THREE.MathUtils.lerp(corner(0,1),corner(1,1),tx),ty,
  );
 }
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const u=x/size,v=y/size;
  const density=.72*noise(u,v,6,11)+.21*noise(u,v,13,23)+.07*noise(u,v,27,41);
  pixels[y*size+x]=Math.round(255*THREE.MathUtils.smoothstep(density,.46,.67));
 }
 const texture=new THREE.DataTexture(pixels,size,size,THREE.RedFormat);
 texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
 texture.minFilter=texture.magFilter=THREE.LinearFilter;
 texture.needsUpdate=true;
 return texture;
}

export function createCloudShadows(){
 const map={value:cloudMap??=makeCloudMap()};
 const offset={value:new THREE.Vector2()};
 return {
  update(time){offset.value.set(.29+time*.72/tileSize,.16+time*.24/tileSize);},
  apply(material){
   const previous=material.onBeforeCompile;
   const key=material.customProgramCacheKey();
   material.customProgramCacheKey=()=>key+'|forest-cloud-shadows';
   material.onBeforeCompile=function(shader,renderer){
    previous.call(this,shader,renderer);
    shader.uniforms.cloudShadowMap=map;
    shader.uniforms.cloudShadowOffset=offset;
    shader.vertexShader='varying vec2 vCloudShadowUv;\n'+shader.vertexShader.replace('#include <project_vertex>',`
     #include <project_vertex>
     vec4 cloudWorld = vec4(transformed, 1.0);
     #ifdef USE_INSTANCING
      cloudWorld = instanceMatrix * cloudWorld;
     #endif
     cloudWorld = modelMatrix * cloudWorld;
     vCloudShadowUv = (cloudWorld.xz - cloudWorld.y * vec2(.46, .30)) / ${tileSize.toFixed(1)};
    `);
    shader.fragmentShader=`varying vec2 vCloudShadowUv;
uniform sampler2D cloudShadowMap;
uniform vec2 cloudShadowOffset;
`+shader.fragmentShader.replace('#include <lights_fragment_end>',`
     #include <lights_fragment_end>
     float cloudLight = 1.0 - .58 * texture2D(cloudShadowMap, vCloudShadowUv - cloudShadowOffset).r;
     reflectedLight.directDiffuse *= cloudLight;
     reflectedLight.directSpecular *= cloudLight;
    `);
   };
   return material;
  },
 };
}
