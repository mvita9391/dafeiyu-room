import * as THREE from 'three';

const timeUniform={value:0};

function animateSurface(material,key,editFragment){
 material.customProgramCacheKey=()=>key;
 material.onBeforeCompile=shader=>{
  shader.uniforms.poolTime=timeUniform;
  shader.vertexShader='varying vec3 vPoolWorld;\n'+shader.vertexShader.replace(
   '#include <begin_vertex>',
   '#include <begin_vertex>\nvPoolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;',
  );
  shader.fragmentShader=editFragment('varying vec3 vPoolWorld;\nuniform float poolTime;\n'+shader.fragmentShader);
 };
 return material;
}

export function makePoolWater(){
 const water=new THREE.MeshPhysicalMaterial({
  color:0x177d98,roughness:.12,transparent:true,opacity:.38,depthWrite:false,
  ior:1.333,clearcoat:.65,clearcoatRoughness:.11,envMapIntensity:1.35,
 });
 return animateSurface(water,'pool-surface-ripples',source=>source
  .replace('#include <normal_fragment_maps>',`
   #include <normal_fragment_maps>
   vec2 p = vPoolWorld.xz;
   vec2 wind = vec2(.91, .41);
   vec2 crossWind = vec2(-.52, .85);
   vec2 slope = wind * (.070 * cos(dot(p, wind) * 3.8 - poolTime * 1.8));
   slope += crossWind * (.044 * cos(dot(p, crossWind) * 6.7 + poolTime * 2.2));
   slope += vec2(.44, .9) * (.022 * cos(dot(p, vec2(.44, .9)) * 12.3 - poolTime * 2.9));
   normal = normalize((viewMatrix * vec4(-slope.x, 1.0, -slope.y, 0.0)).xyz);
   float poolFresnel = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 3.0);
  `)
  .replace('#include <clearcoat_normal_fragment_maps>',`
   #include <clearcoat_normal_fragment_maps>
   #ifdef USE_CLEARCOAT
    clearcoatNormal = normal;
   #endif
  `)
  .replace('#include <opaque_fragment>',`
   diffuseColor.a = mix(opacity, .84, poolFresnel);
   outgoingLight += vec3(.12, .23, .30) * poolFresnel;
   #include <opaque_fragment>
  `));
}

export function addPoolCaustics(tile,waterLevel){
 const lakeMask=waterLevel===undefined?'':`
  float depth = ${waterLevel.toFixed(4)} - vPoolWorld.y;
  strength *= .48 * smoothstep(0.0, .24, depth) * (1.0 - .70 * smoothstep(.9, 2.8, depth));
 `;
 return animateSurface(tile,`pool-floor-caustics-${waterLevel??'pool'}`,source=>source.replace('#include <emissivemap_fragment>',`
  #include <emissivemap_fragment>
  vec2 p = vPoolWorld.xz * 4.7;
  vec2 warp = vec2(sin(p.y * .53 + poolTime * .58), sin(p.x * .49 - poolTime * .64));
  p += 1.15 * warp;
  float first = sin(p.x + p.y * .38 + poolTime * .76);
  float second = sin(p.y - p.x * .47 - poolTime * .82);
  float weave = abs(first + .58 * second + .39 * sin(p.x * .76 - p.y * .87 + poolTime * .51));
  float width = max(.09, fwidth(weave));
  float focused = 1.0 - smoothstep(0.0, .15 + width, weave);
  float strength = .62 + .38 * sin(p.x * .17 + p.y * .25 + poolTime * .68);
  ${lakeMask}
  totalEmissiveRadiance += vec3(.15, .34, .34) * focused * strength;
 `));
}

export function updatePoolWaterTime(time){timeUniform.value=time;}
