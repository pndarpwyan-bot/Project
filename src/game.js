import * as THREE from 'three';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
export const WEAPONS = {
  m4: { name: 'M4A1', title: 'تفنگ تهاجمی', damage: 34, magazine: 30, interval: 0.115, reload: 1.65, recoil: 0.016 },
  scar: { name: 'SCAR-H', title: 'تفنگ سنگین', damage: 51, magazine: 20, interval: 0.18, reload: 2.0, recoil: 0.025 },
  mp5: { name: 'MP5', title: 'مسلسل سبک', damage: 25, magazine: 40, interval: 0.075, reload: 1.35, recoil: 0.011 },
};

// All environment assets and sounds are generated locally. No model downloads.
function makeTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(512, 512);
  for (let i = 0; i < image.data.length; i += 4) {
    const n = Math.random() * 21;
    const base = kind === 'ground' ? 52 : 111;
    image.data[i] = base + n;
    image.data[i + 1] = base + n + 3;
    image.data[i + 2] = base + n - 2;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  if (kind === 'ground') {
    for (let j = 0; j < 40; j++) {
      let x = Math.random() * 512, y = Math.random() * 512;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 0; i < 5; i++) { x += (Math.random() - 0.5) * 45; y += Math.random() * 20; ctx.lineTo(x, y); }
      ctx.strokeStyle = '#18211d40'; ctx.lineWidth = Math.random() * 1.5; ctx.stroke();
    }
  } else {
    for (let j = 0; j < 90; j++) {
      ctx.fillStyle = `rgba(29,36,28,${Math.random() * .15})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, Math.random() * 5, Math.random() * 130);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === 'ground' ? 24 : 2, kind === 'ground' ? 24 : 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Game {
  constructor(container, callbacks = {}) {
    this.callbacks = callbacks;
    this.active = false; this.paused = false; this.finished = false;
    this.keys = {}; this.touchMove = { x: 0, y: 0 }; this.firing = false;
    this.yaw = 0; this.pitch = 0; this.speed = 5; this.sensitivity = 1;
    this.effects = []; this.enemies = []; this.colliders = []; this.obstacles = [];
    this.elapsed = 0; this.time = 0; this.lastShot = -1; this.reloading = 0;
    this.audioEnabled = false; this.audio = null; this.audioVolume = .28;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x334137, .012);
    this.camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, .08, 250);
    this.scene.add(this.camera);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.24;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
    this.materials = {};
    this.raycaster = new THREE.Raycaster();
    this.tempV = new THREE.Vector3();
    this.buildEnvironment();
    this.buildGun();
    this.bindInput();
    this.clock = new THREE.Clock();
    this.frameCount = 0; this.frameTime = 0;
    this.animate = this.animate.bind(this);
    this.renderer.setAnimationLoop(this.animate);
    window.addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.active && !this.paused) this.pause();
    });
  }

  mat(color, roughness = .85, metalness = .1) {
    const key = `${color}-${roughness}-${metalness}`;
    if (!this.materials[key]) this.materials[key] = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    return this.materials[key];
  }

  box(x, y, z, w, h, d, material, parent = this.scene, shadow = true) {
    const mesh = new THREE.Mesh(this.boxGeo, typeof material === 'number' ? this.mat(material) : material);
    mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
    mesh.castShadow = shadow; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  cylinder(x, y, z, radius, height, material, parent = this.scene) {
    const mesh = new THREE.Mesh(this.cylinderGeo, typeof material === 'number' ? this.mat(material) : material);
    mesh.position.set(x, y, z); mesh.scale.set(radius, height, radius); mesh.castShadow = true;
    parent.add(mesh); return mesh;
  }

  blocker(x, z, w, d, mesh) {
    this.colliders.push({ minX: x - w / 2 - .35, maxX: x + w / 2 + .35, minZ: z - d / 2 - .35, maxZ: z + d / 2 + .35 });
    if (mesh) this.obstacles.push(mesh);
  }

  buildEnvironment() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 18), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: { top: { value: new THREE.Color(0x101e20) }, bottom: { value: new THREE.Color(0x7d8063) } },
      vertexShader: 'varying vec3 vPos; void main(){ vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vPos; uniform vec3 top; uniform vec3 bottom;
        float noise(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float smoothNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(noise(i),noise(i+vec2(1,0)),f.x),mix(noise(i+vec2(0,1)),noise(i+vec2(1,1)),f.x),f.y);}
        void main(){float h=normalize(vPos).y; vec3 c=mix(bottom,top,smoothstep(-.05,.72,h));
        vec2 p=vPos.xz/(max(vPos.y,1.0)+30.0)*5.0; float n=smoothNoise(p)*.5+smoothNoise(p*2.1)*.25+smoothNoise(p*4.3)*.125;
        c=mix(c,c*.47,smoothstep(.3,.68,n)*smoothstep(0.0,.14,h));gl_FragColor=vec4(c,1.);}`,
    }));
    this.scene.add(sky);
    const hemi = new THREE.HemisphereLight(0xbbc4a8, 0x20271f, 1.5); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffc28a, 2.5);
    sun.position.set(-28, 24, -35); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 130 });
    sun.shadow.normalBias = .04; sun.shadow.bias = -.0002;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x90a6b4, .85); rim.position.set(18, 12, 12); this.scene.add(rim);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(3, 20, 20), new THREE.MeshBasicMaterial({ color: 0xd9d6a8, fog: false }));
    moon.position.set(-62, 31, -120); this.scene.add(moon);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x727c6c, map: makeTexture('ground'), roughness: .5, metalness: .24 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), groundMaterial);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    const concrete = new THREE.MeshStandardMaterial({ color: 0x77786a, map: makeTexture('wall'), roughness: .89 });
    const metal = this.mat(0x303b33, .48, .7);
    const yellow = this.mat(0x8f8150, .8, .3);
    // Road paint, runoff channels, concrete seams and wet surface reflections.
    for (let z = -90; z < 28; z += 8) {
      this.box(0, .012, z, .13, .008, 3.1, yellow, this.scene, false);
      this.box(-9, .015, z, .1, .01, 7.9, yellow, this.scene, false);
      this.box(9, .015, z, .1, .01, 7.9, yellow, this.scene, false);
      this.box(-21, .02, z, 1.1, .01, .14, 0x131d18, this.scene, false);
    }
    const puddleMat = new THREE.MeshStandardMaterial({ color: 0x596557, roughness: .07, metalness: .82, transparent: true, opacity: .6 });
    for (let i = 0; i < 27; i++) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 16), puddleMat);
      puddle.rotation.x = -Math.PI / 2; puddle.rotation.z = Math.random() * 6;
      puddle.scale.set(1 + Math.random() * 3, .15 + Math.random() * .6, 1);
      puddle.position.set((Math.random() - .5) * 46, .022, Math.random() * -72 + 12); this.scene.add(puddle);
    }
    const glow = new THREE.MeshBasicMaterial({ color: 0xffb863 });
    // Distant industrial buildings and lit windows.
    for (const [x, z, w, h, d] of [[-36,-37,20,17,42],[33,-45,23,22,38],[-18,-81,29,23,16],[17,-86,32,18,18],[-47,10,17,11,27],[45,0,19,14,32]]) {
      const b = this.box(x, h / 2, z, w, h, d, concrete); this.blocker(x, z, w, d, b);
      this.box(x, h + .2, z, w + .6, .45, d + .6, metal);
      for (let k = 0; k < 4; k++) {
        this.box(x - w / 2 + 2 + k * 4.1, h - 4, z + d / 2 + .05, 2.5, 1.25, .07, k % 3 === 1 ? glow : this.mat(0x242e27), this.scene, false);
        this.box(x - w / 2 + 2 + k * 4.1, h - 3.9, z + d / 2 + .09, .06, 1.3, .08, metal, this.scene, false);
      }
      this.box(x + 2, 2.6, z + d / 2 + .08, 5, 5.2, .15, 0x30382f);
      for (let k = 0; k < 7; k++) this.box(x + 2, .5 + k * .6, z + d / 2 + .17, 4.9, .055, .1, 0x5c6050, this.scene, false);
      this.box(x - w / 2 + .4, h / 2, z + d / 2 + .13, .18, h, .17, 0x665f48);
      for (let i = 0; i < 2; i++) {
        this.cylinder(x + i * 3, h + 1.6, z, .65, 3.2, metal);
        this.cylinder(x + i * 3, h + 3.2, z, .95, .2, metal);
      }
    }
    // Gantry crane: structural diagonal bracing, trolley, cables, hook.
    const crane = new THREE.Group(); this.scene.add(crane);
    for (const x of [-22, 11]) {
      for (const z of [-43, -51]) {
        this.box(x, 12, z, .8, 24, .8, 0x71644a, crane);
        this.box(x, .4, z, 2, .8, 3.3, metal, crane);
      }
      this.box(x, 22, -47, 1.4, 1.2, 11, yellow, crane);
      const brace = this.box(x, 12, -47, .4, 21, .4, 0x786a4d, crane); brace.rotation.x = .34;
    }
    for (const z of [-43, -51]) {
      this.box(-5.5, 25, z, 45, 1.2, .8, 0x71654c, crane);
      this.box(-5.5, 22, z, 45, .5, .5, yellow, crane);
      for (let x = -25; x < 15; x += 4) {
        const beam = this.box(x, 23.5, z, .2, 4.8, .2, yellow, crane); beam.rotation.z = .95;
      }
    }
    this.box(-7, 24.2, -47, 4, .65, 10, metal, crane);
    this.box(-7, 22.4, -45, 2.5, 2.3, 2.1, 0x746d52, crane);
    this.box(-7, 22.6, -43.92, 2.1, 1, .03, 0x2c443f, crane);
    for (const x of [-8, -6]) this.cylinder(x, 16, -47, .025, 13, metal, crane);
    this.box(-7, 9.6, -47, 3, .6, 1.2, yellow, crane);
    // Corrugated freight containers create combat cover on either side of the road.
    const containerData = [[-14,-8,0,0x586552],[-14,-21,0,0x82684b],[-14,-34,0,0x4c5b56],[15,-15,0,0x69715d],[15,-30,0,0x4d5a51],[-14,-20,3.0,0x4f655c],[22,-16,0,0x5a6150],[15,-30,3,0x86754d],[-25,6,0,0x546054]];
    for (const [x,z,y,color] of containerData) this.container(x,y,z,color);
    // Small cover, concrete barriers, pallets, barrels.
    for (const [x,z] of [[-5,-14],[6,-29],[-5,-44],[6,-56],[-20,13]]) {
      const mesh = this.box(x, .8, z, 3.5, 1.6, 1.1, concrete); this.blocker(x,z,3.5,1.1,mesh);
      this.box(x, 1.62, z, 3.65, .12, 1.2, concrete);
      for (let i = 0; i < 5; i++) {
        const mark = this.box(x - 1.3 + i * .64, .85, z + .558, .26, 1, .02, i%2 ? 0x847b49 : 0x252c23, this.scene, false); mark.rotation.z = -.4;
      }
    }
    for (const [x,z] of [[-8,1],[9,-9],[-18,-3],[20,-5],[-7,-39]]) {
      const box = this.box(x,.65,z,1.25,1.3,1.2,0x655f47); this.blocker(x,z,1.25,1.2,box);
      for (const side of [-.48,.48]) {
        this.box(x+side,.65,z+.61,.09,1.3,.07,0x92826a);
        this.box(x+side,.65,z-.61,.09,1.3,.07,0x92826a);
      }
      this.box(x,1.32,z,1.4,.12,1.4,0x605a43);
      for (let i = 0; i < 2; i++) {
        this.cylinder(x+1.6+i*.8,.62,z+.4,.36,1.24,0x39463a);
        this.cylinder(x+1.6+i*.8,.22,z+.4,.38,.06,metal);
        this.cylinder(x+1.6+i*.8,1.0,z+.4,.38,.06,metal);
      }
    }
    for (const [x,z] of [[-10,-3],[10,-20],[-10,-39],[10,-57],[-29,-19]]) {
      this.cylinder(x,5.8,z,.085,11.6,metal);
      this.box(x,11.5,z,2.3,.13,.15,metal);
      this.box(x-.8,11.35,z,.7,.15,.4,glow,this.scene,false);
      const spot = new THREE.SpotLight(0xffc88a, 850, 31, .72, .7, 1.8);
      spot.position.set(x-.8,11.15,z); spot.target.position.set(x*.65,0,z-1);
      this.scene.add(spot,spot.target);
      // Local glow sprite around lamps.
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTexture(), color:0xffb568, transparent:true, opacity:.18, depthWrite:false, blending:THREE.AdditiveBlending }));
      halo.position.set(x-.8,11.3,z); halo.scale.set(3,3,1); this.scene.add(halo);
    }
    // Fence posts and horizontal wire, horizon chimneys.
    for (let z = -75; z < 30; z += 5) {
      this.cylinder(-27,1.6,z,.06,3.2,metal);
      this.cylinder(27,1.6,z,.06,3.2,metal);
      for (const x of [-27,27]) for (const y of [.8,1.6,2.4,3]) this.box(x,y,z-2.5,.014,.014,5,0x5e6b56,this.scene,false);
    }
    for (const [x,z,h] of [[-43,-87,36],[-39,-89,31],[40,-90,32]]) {
      this.cylinder(x,h/2,z,1.1,h,concrete);
      this.cylinder(x,h-5,z,1.16,2.6,0x6d4336);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:0xff4e2c}));
      lamp.position.set(x,h+.1,z); this.scene.add(lamp);
    }
    // Low drifting smoke, softly textured and depth sorted.
    const smokeMat = new THREE.SpriteMaterial({ map:this.glowTexture(),color:0x8d9c89,transparent:true,opacity:.06,depthWrite:false });
    this.smoke = [];
    for (let i=0;i<12;i++) {
      const sprite = new THREE.Sprite(smokeMat); sprite.position.set(-30+Math.random()*65,.8+Math.random()*2,-65+Math.random()*60);
      sprite.scale.set(13+Math.random()*10,2.5+Math.random()*3,1); this.scene.add(sprite); this.smoke.push(sprite);
    }
    // Rain catches the lights without covering the UI.
    const rainPositions = new Float32Array(650*6);
    for(let i=0;i<650;i++){const p=i*6;const x=(Math.random()-.5)*90,y=Math.random()*28,z=(Math.random()-.5)*100;rainPositions.set([x,y,z,x-.03,y-.26,z],p);}
    const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position',new THREE.BufferAttribute(rainPositions,3));
    this.rain = new THREE.LineSegments(rainGeo,new THREE.LineBasicMaterial({color:0xbfcbbb,transparent:true,opacity:.11,depthWrite:false})); this.scene.add(this.rain);
    this.heroSoldier = this.makeSoldier(false);
    this.heroSoldier.position.set(-3.1,0,5.6); this.heroSoldier.rotation.y = .62; this.heroSoldier.scale.setScalar(1.32); this.scene.add(this.heroSoldier);
    const heroLight = new THREE.SpotLight(0xe3ae70,100,18,.7,.65,1.3);
    heroLight.position.set(-8,5,1); heroLight.target=this.heroSoldier; this.scene.add(heroLight); this.heroLight=heroLight;
    this.resetLobbyCamera();
  }

  glowTexture() {
    if(this._glow) return this._glow;
    const c=document.createElement('canvas');c.width=c.height=64;
    const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.2,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,64,64);this._glow=new THREE.CanvasTexture(c);return this._glow;
  }

  container(x,y,z,color) {
    const body=this.box(x,y+1.5,z,5.5,3,11.7,color); if(y===0)this.blocker(x,z,5.5,11.7,body);
    const dark=this.mat(new THREE.Color(color).multiplyScalar(.63));
    for(let i=0;i<19;i++) {
      this.box(x-2.77,y+1.5,z-5.45+i*.6,.075,2.7,.1,dark);
      this.box(x+2.77,y+1.5,z-5.45+i*.6,.075,2.7,.1,dark);
    }
    for(const side of [-1,1]){
      this.box(x,y+.1,z+side*5.9,5.5,.15,.1,dark);
      this.box(x,y+2.9,z+side*5.9,5.5,.15,.1,dark);
      this.box(x,y+1.5,z+side*5.91,.045,2.8,.04,dark);
      for(const dx of [-2.65,-1.35,1.35,2.65]) this.box(x+dx,y+1.5,z+side*5.92,.07,2.9,.08,0x889080);
    }
    if(!this.containerLabel){
      const c=document.createElement('canvas');c.width=512;c.height=256;const ctx=c.getContext('2d');
      ctx.fillStyle='#bec4a6';ctx.font='bold 62px Arial';ctx.fillText('NORTHSTAR',30,100);ctx.font='18px monospace';ctx.fillText('GLOBAL LOGISTICS  //  07-241',36,139);ctx.font='12px monospace';ctx.fillText('MAX GROSS 30,480 KG    •    ISO 22G1',36,172);
      this.containerLabel=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false});
    }
    const label=new THREE.Mesh(new THREE.PlaneGeometry(4.0,2),this.containerLabel);
    label.position.set(x,y+1.55,z+5.97);this.scene.add(label);
  }

  makeRifle(parent, variant='m4') {
    const gun=new THREE.Group();parent.add(gun);
    const gunMetal=this.mat(0x252c27,.34,.85), edge=this.mat(0x4e574b,.55,.55), polymer=this.mat(variant==='scar'?0x80704b:0x303b2f,.82,.12);
    this.box(0,0,0,.15,.2,.49,gunMetal,gun);
    this.box(0,-.025,.34,.14,.21,.33,polymer,gun);
    this.box(0,-.01,.53,.17,.3,.08,polymer,gun);
    this.box(0,.015,-.44,.13,.17,.46,polymer,gun);
    for(let i=0;i<8;i++)this.box(0,.114,-.59+i*.105,.17,.034,.028,edge,gun);
    for(let i=0;i<6;i++)this.box(.071,.0,-.62+i*.067,.012,.057,.037,gunMetal,gun);
    const barrel=this.cylinder(0,.015,-.79,.03,.35,gunMetal,gun);barrel.rotation.x=Math.PI/2;
    const muzzle=this.cylinder(0,.015,-.99,.041,.08,gunMetal,gun);muzzle.rotation.x=Math.PI/2;
    const grip=this.box(0,-.21,.13,.1,.26,.11,polymer,gun);grip.rotation.x=-.25;
    const mag=this.box(0,-.23,-.13,.1,.31,.15,polymer,gun);mag.rotation.x=.19;
    for(let i=0;i<3;i++)this.box(.054,-.18-i*.06,-.13,.008,.019,.13,edge,gun);
    this.box(0,.2,-.06,.15,.17,.2,gunMetal,gun);
    this.box(0,.215,-.168,.112,.102,.01,this.mat(0x587264,.15,.55),gun);
    this.box(.076,.033,.08,.025,.06,.18,edge,gun);
    return gun;
  }

  makeSoldier(enemy=true) {
    const root=new THREE.Group();
    const fabric=this.mat(enemy?0x454b3b:0x363f32,.95,.02),armor=this.mat(enemy?0x333c30:0x263129,.88,.07),strap=this.mat(0x66684d,.95,.02),black=this.mat(0x1b2520,.73,.2);
    const limb=(x,y,z,radius,length,mat,parent=root)=>{
      const m=new THREE.Mesh(new THREE.CapsuleGeometry(radius,length,4,8),mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;
    };
    const leftLeg=new THREE.Group(),rightLeg=new THREE.Group();root.add(leftLeg,rightLeg);leftLeg.position.set(-.18,.93,0);rightLeg.position.set(.18,.93,0);
    for(const leg of [leftLeg,rightLeg]){
      limb(0,-.24,0,.115,.29,fabric,leg);limb(0,-.63,.02,.095,.28,fabric,leg);
      this.box(0,-.45,-.085,.18,.19,.1,armor,leg);this.box(0,-.87,-.06,.21,.16,.34,black,leg);
      this.box(.095,-.18,.01,.07,.19,.15,strap,leg);
    }
    const torso=limb(0,1.26,0,.26,.29,fabric);torso.scale.z=.65;
    this.box(0,1.32,-.15,.49,.48,.18,armor,root);
    this.box(0,1.29,.17,.44,.49,.2,armor,root);
    this.box(0,1.16,.28,.38,.3,.15,armor,root);
    for(const x of [-.16,0,.16])this.box(x,1.23,-.274,.135,.2,.085,strap,root);
    for(const x of [-.2,.2])this.box(x,1.47,-.17,.068,.28,.07,strap,root);
    this.box(0,.98,-.02,.46,.08,.34,black,root);
    this.box(.22,1.48,-.23,.095,.14,.05,black,root);
    this.cylinder(.24,1.65,-.23,.01,.24,black,root);
    limb(0,1.73,0,.155,.15,black);
    const helmet=new THREE.Mesh(new THREE.SphereGeometry(.21,12,10,0,Math.PI*2,0,Math.PI*.62),armor);
    helmet.position.set(0,1.82,.01);helmet.scale.z=1.05;helmet.castShadow=true;root.add(helmet);
    this.box(0,1.8,-.19,.3,.068,.06,this.mat(enemy?0x965d34:0x323e34,.18,.7),root);
    this.box(0,1.94,-.18,.08,.09,.07,black,root);
    for(const x of [-.2,.2])this.box(x,1.76,0,.065,.16,.12,black,root);
    const a=limb(-.31,1.33,-.09,.09,.26,fabric);a.rotation.x=-.65;a.rotation.z=-.22;
    const b=limb(.31,1.33,-.09,.09,.25,fabric);b.rotation.x=-.5;b.rotation.z=.24;
    const fore1=limb(-.25,1.14,-.33,.076,.25,fabric);fore1.rotation.x=-1.1;fore1.rotation.z=-.6;
    const fore2=limb(.22,1.16,-.29,.076,.24,fabric);fore2.rotation.x=-1.2;fore2.rotation.z=.4;
    limb(-.07,1.18,-.52,.067,.055,black);limb(.14,1.2,-.4,.067,.06,black);
    const gun=this.makeRifle(root);gun.position.set(.08,1.22,-.42);gun.scale.setScalar(.75);
    if(enemy){
      const marker=this.box(0,1.42,-.258,.18,.035,.013,new THREE.MeshBasicMaterial({color:0xec7842}),root,false);
      marker.userData.isMarker=true;
    }
    root.userData={leftLeg,rightLeg,gun,baseY:0};
    return root;
  }

  buildGun(variant='m4') {
    if(this.gunRig) {
      this.camera.remove(this.gunRig);
      // Geometry/materials are shared with the environment; do not dispose here.
    }
    this.gunRig=new THREE.Group();this.camera.add(this.gunRig);
    this.gunModel=this.makeRifle(this.gunRig,variant);this.gunModel.position.set(.28,-.27,-.43);this.gunModel.rotation.y=-.03;
    const glove=this.mat(0x3c4937,.95,.02);
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.07,.4,4,8),glove);arm.rotation.x=-1.05;arm.position.set(.29,-.43,-.31);this.gunRig.add(arm);
    const other=new THREE.Mesh(new THREE.CapsuleGeometry(.065,.42,4,8),glove);other.rotation.set(-.8,0,-.55);other.position.set(.12,-.46,-.66);this.gunRig.add(other);
    this.muzzleFlash=new THREE.PointLight(0xffb34c,0,5);this.muzzleFlash.position.set(.28,-.25,-1.5);this.gunRig.add(this.muzzleFlash);
    this.flashSprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture(),color:0xffce70,transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false}));
    this.flashSprite.position.set(.28,-.25,-1.44);this.flashSprite.scale.set(.34,.34,1);this.gunRig.add(this.flashSprite);this.flashSprite.visible=false;
    this.gunRig.visible=false;
  }

  resetLobbyCamera() {
    this.camera.position.set(9,4.1,16);this.camera.lookAt(-6,3.5,-14);
  }

  bindInput() {
    const canvas=this.renderer.domElement;
    document.addEventListener('keydown',(e)=>{
      if(!this.active||this.paused)return;
      if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();
      this.keys[e.code]=true;
      if(e.code==='KeyR')this.reload();
      if(e.code==='Escape')this.pause();
      if(e.code==='Space'&&this.jumpY===0)this.jumpVelocity=4.8;
    });
    document.addEventListener('keyup',(e)=>{this.keys[e.code]=false;});
    window.addEventListener('blur',()=>{this.keys={};this.firing=false;});
    document.addEventListener('mousemove',(e)=>{
      if(!this.active||this.paused)return;
      if(document.pointerLockElement===canvas||this.dragLook){
        this.yaw-=e.movementX*.002*this.sensitivity;
        this.pitch=clamp(this.pitch-e.movementY*.002*this.sensitivity,-1.25,1.25);
      }
    });
    canvas.addEventListener('mousedown',(e)=>{
      if(!this.active||this.paused)return;
      if(e.button===0){this.firing=true;this.requestLock();}
      if(e.button===2){this.aiming=true;this.dragLook=true;}
    });
    document.addEventListener('mouseup',()=>{this.firing=false;this.aiming=false;this.dragLook=false;});
    canvas.addEventListener('contextmenu',(e)=>e.preventDefault());
    document.addEventListener('pointerlockchange',()=>{
      if(!document.pointerLockElement&&this.active&&!this.paused&&!this.finished)this.pause();
      this.callbacks.onLock?.(!!document.pointerLockElement);
    });
    let lookTouch=null;
    canvas.addEventListener('touchstart',(e)=>{
      if(!this.active||this.paused)return;e.preventDefault();
      const t=e.changedTouches[0];lookTouch={id:t.identifier,x:t.clientX,y:t.clientY};
    },{passive:false});
    canvas.addEventListener('touchmove',(e)=>{
      if(!lookTouch||!this.active||this.paused)return;e.preventDefault();
      const t=Array.from(e.changedTouches).find(t=>t.identifier===lookTouch.id);if(!t)return;
      this.yaw-=(t.clientX-lookTouch.x)*.004*this.sensitivity;this.pitch=clamp(this.pitch-(t.clientY-lookTouch.y)*.004*this.sensitivity,-1.25,1.25);
      lookTouch.x=t.clientX;lookTouch.y=t.clientY;
    },{passive:false});
    const endTouch=(e)=>{if(lookTouch&&Array.from(e.changedTouches).some(t=>t.identifier===lookTouch.id))lookTouch=null;};
    canvas.addEventListener('touchend',endTouch);canvas.addEventListener('touchcancel',endTouch);
  }

  requestLock() {
    if(matchMedia('(pointer:coarse)').matches)return;
    if(!document.pointerLockElement&&this.renderer.domElement.requestPointerLock){
      try {const p=this.renderer.domElement.requestPointerLock();if(p?.catch)p.catch(()=>this.callbacks.onLock?.(false));}catch{this.callbacks.onLock?.(false);}
    }
  }

  start(weapon='m4',difficulty='normal') {
    this.clearCombat();this.weapon=WEAPONS[weapon];this.weaponKey=weapon;this.difficulty=difficulty;
    this.health=100;this.ammo=this.weapon.magazine;this.wave=0;this.kills=0;this.shots=0;this.hits=0;this.elapsed=0;
    this.reloading=0;this.lastShot=-10;this.time=0;this.flashTime=0;this.nextWave=0;
    this.finished=false;this.paused=false;this.active=true;this.keys={};this.firing=false;this.touchMove={x:0,y:0};
    this.yaw=0;this.pitch=0;this.jumpY=0;this.jumpVelocity=0;
    this.camera.position.set(0,1.72,9);this.camera.rotation.set(0,0,0,'YXZ');this.camera.fov=64;this.camera.updateProjectionMatrix();
    this.heroSoldier.visible=false;this.heroLight.visible=false;
    this.buildGun(weapon);this.gunRig.visible=true;
    this.spawnWave();this.emitState();this.requestLock();
    this.ensureAudio();
  }

  spawnWave() {
    this.wave++;const total=this.wave+3;
    const points=[[-4,-20],[4,-24],[-2,-33],[7,-38],[-7,-48],[3,-54]];
    for(let i=0;i<total;i++){
      const root=this.makeSoldier();const [x,z]=points[i];root.position.set(x,0,z);this.scene.add(root);
      const enemy={root,health:this.difficulty==='easy'?68:100,shootAt:this.time+2+Math.random()*2,phase:Math.random()*6,dead:false,deathTime:0};
      root.traverse(obj=>{if(obj.isMesh)obj.userData.enemy=enemy;});this.enemies.push(enemy);
    }
    this.callbacks.onWave?.(this.wave);this.emitState();
  }

  emitState() {this.callbacks.onState?.({health:Math.ceil(this.health),ammo:this.ammo,wave:this.wave,enemies:this.enemies.filter(e=>!e.dead).length,reloading:this.reloading>0,weapon:this.weapon?.name,kills:this.kills});}

  canMove(x,z) {
    if(x < -25.8 || x > 25.8 || z > 24 || z < -73)return false;
    return !this.colliders.some(b=>x>b.minX&&x<b.maxX&&z>b.minZ&&z<b.maxZ);
  }

  reload() {
    if(!this.active||this.paused||this.reloading>0||this.ammo===this.weapon.magazine)return;
    this.reloading=this.weapon.reload;this.sound('reload');this.emitState();
  }

  shoot() {
    if(this.time-this.lastShot<this.weapon.interval||this.reloading>0)return;
    if(this.ammo===0){this.reload();return;}
    this.lastShot=this.time;this.ammo--;this.shots++;this.flashTime=.055;
    this.pitch=clamp(this.pitch+this.weapon.recoil*(this.aiming?.5:1),-1.25,1.25);
    this.sound('shot');this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2(0,0),this.camera);
    const targets=[...this.enemies.filter(e=>!e.dead).map(e=>e.root),...this.obstacles];
    const intersections=this.raycaster.intersectObjects(targets,true);
    let end=this.raycaster.ray.at(70,new THREE.Vector3());
    if(intersections.length){
      const hit=intersections[0];end=hit.point;const enemy=hit.object.userData.enemy;
      if(enemy){
        const headshot=hit.point.y>1.64;enemy.health-=this.weapon.damage*(headshot?2:1);this.hits++;
        this.callbacks.onHit?.(headshot);this.sound('hit');
        if(enemy.health<=0){enemy.dead=true;enemy.deathTime=this.time;this.kills++;this.callbacks.onKill?.(this.kills);this.emitState();}
      }else this.spark(end);
    }
    const start=new THREE.Vector3(.28,-.25,-1.4).applyMatrix4(this.camera.matrixWorld);this.tracer(start,end,0xf7ce7e,.055);
    this.emitState();
  }

  tracer(start,end,color,life) {
    const geo=new THREE.BufferGeometry().setFromPoints([start,end]);
    const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.65});
    const line=new THREE.Line(geo,material);this.scene.add(line);this.effects.push({obj:line,life,dispose:true});
  }

  spark(point) {
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture(),color:0xffbc55,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));
    sprite.position.copy(point);sprite.scale.set(.35,.35,1);this.scene.add(sprite);this.effects.push({obj:sprite,life:.13,dispose:true});
  }

  updateCombat(dt) {
    this.time+=dt;this.elapsed+=dt;
    if(this.reloading>0){this.reloading-=dt;if(this.reloading<=0){this.reloading=0;this.ammo=this.weapon.magazine;this.emitState();}}
    if(this.firing)this.shoot();
    this.flashTime=Math.max(0,this.flashTime-dt);this.flashSprite.visible=this.flashTime>0;this.muzzleFlash.intensity=this.flashTime>0?10:0;
    const forward=(this.keys.KeyW||this.keys.ArrowUp?1:0)-(this.keys.KeyS||this.keys.ArrowDown?1:0)-this.touchMove.y;
    const right=(this.keys.KeyD||this.keys.ArrowRight?1:0)-(this.keys.KeyA||this.keys.ArrowLeft?1:0)+this.touchMove.x;
    const moving=Math.abs(forward)+Math.abs(right)>.05;
    const sprint=this.keys.ShiftLeft||this.keys.ShiftRight;
    const speed=(sprint?7.7:4.6)*dt*(this.aiming?.65:1);
    const norm=Math.max(1,Math.hypot(forward,right));
    const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*right)/norm*speed;
    const dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*right)/norm*speed;
    if(this.canMove(this.camera.position.x+dx,this.camera.position.z))this.camera.position.x+=dx;
    if(this.canMove(this.camera.position.x,this.camera.position.z+dz))this.camera.position.z+=dz;
    if(this.jumpY>0||this.jumpVelocity>0){this.jumpVelocity-=12*dt;this.jumpY=Math.max(0,this.jumpY+this.jumpVelocity*dt);if(this.jumpY===0)this.jumpVelocity=0;}
    this.camera.position.y=1.72+this.jumpY+(moving?Math.sin(this.time*(sprint?16:11))*.027:0);
    this.camera.rotation.set(this.pitch,this.yaw,0,'YXZ');
    this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,this.aiming?45:64,Math.min(1,dt*12));this.camera.updateProjectionMatrix();
    this.gunRig.position.x=THREE.MathUtils.lerp(this.gunRig.position.x,this.aiming?-.27:0,dt*12);
    this.gunRig.position.y=(moving?Math.sin(this.time*10)*.009:Math.sin(this.time*1.4)*.003)-(this.reloading>0?.19*Math.sin(this.reloading/this.weapon.reload*Math.PI):0);
    this.gunRig.position.z=this.flashTime>0?.045:0;
    this.gunRig.rotation.z=this.reloading>0?-.28*Math.sin(this.reloading/this.weapon.reload*Math.PI):0;
    this.scene.updateMatrixWorld();
    for(const enemy of this.enemies){
      if(enemy.dead){const t=Math.min(1,(this.time-enemy.deathTime)*3);enemy.root.rotation.x=-t*Math.PI*.47;enemy.root.position.y=-t*.6;if(this.time-enemy.deathTime>4)enemy.root.visible=false;continue;}
      const pos=enemy.root.position;
      const ex=this.camera.position.x-pos.x,ez=this.camera.position.z-pos.z,dist=Math.hypot(ex,ez);
      enemy.root.rotation.y=Math.atan2(-ex,-ez);
      const hasSight=this.lineOfSight(pos);
      if(dist>9||!hasSight){
        const pace=(this.difficulty==='hard'?2.25:1.6)*dt;
        const moveX=ex/Math.max(dist,.1)*pace,moveZ=ez/Math.max(dist,.1)*pace;
        let moved=false;
        if(this.canMove(pos.x+moveX,pos.z)){pos.x+=moveX;moved=true;}
        if(this.canMove(pos.x,pos.z+moveZ)){pos.z+=moveZ;moved=true;}
        if(!moved||(!this.canMove(pos.x,pos.z+moveZ)&&Math.abs(ez)>1)){
          const side=pos.x>0?-1:1;if(this.canMove(pos.x+side*pace,pos.z))pos.x+=side*pace;
        }
        const step=Math.sin(this.time*7+enemy.phase)*.43;enemy.root.userData.leftLeg.rotation.x=step;enemy.root.userData.rightLeg.rotation.x=-step;
      }else {enemy.root.userData.leftLeg.rotation.x=0;enemy.root.userData.rightLeg.rotation.x=0;}
      if(dist<36&&this.time>enemy.shootAt&&hasSight){
        enemy.shootAt=this.time+(this.difficulty==='hard'?1.3:2.0)+Math.random();
        const from=pos.clone().add(new THREE.Vector3(0,1.35,0));const to=this.camera.position.clone();this.tracer(from,to,0xe89d55,.07);
        this.sound('enemy');
        if(Math.random()<(this.difficulty==='easy'?.35:.58)){
          this.health=Math.max(0,this.health-(this.difficulty==='hard'?10:this.difficulty==='easy'?4:6));this.callbacks.onDamage?.();this.emitState();
          if(this.health<=0){this.end(false);return;}
        }
      }
    }
    if(this.enemies.every(e=>e.dead)){
      if(this.nextWave===0){this.nextWave=this.time+3.5;this.callbacks.onClear?.(this.wave);}
      if(this.time>=this.nextWave){
        this.nextWave=0;if(this.wave>=3){this.end(true);return;}
        this.health=Math.min(100,this.health+25);this.ammo=this.weapon.magazine;this.reloading=0;this.spawnWave();
      }
    }
  }

  lineOfSight(pos) {
    const origin=pos.clone().add(new THREE.Vector3(0,1.5,0));
    const dir=this.camera.position.clone().sub(origin),distance=dir.length();
    this.raycaster.set(origin,dir.normalize());this.raycaster.far=distance;
    const blocked=this.raycaster.intersectObjects(this.obstacles,false).length>0;
    this.raycaster.far=Infinity;return !blocked;
  }

  pause() {
    if(!this.active||this.paused||this.finished)return;
    this.paused=true;this.firing=false;this.keys={};this.touchMove={x:0,y:0};this.aiming=false;
    if(document.pointerLockElement)document.exitPointerLock();this.callbacks.onPause?.();
  }

  resume() {if(!this.active||this.finished)return;this.paused=false;this.clock.getDelta();this.requestLock();}

  end(won) {
    if(this.finished)return;this.finished=true;this.active=false;this.firing=false;
    if(document.pointerLockElement)document.exitPointerLock();
    this.callbacks.onEnd?.({won,kills:this.kills,shots:this.shots,hits:this.hits,time:this.elapsed,accuracy:this.shots?Math.round(this.hits/this.shots*100):0});
  }

  returnToLobby() {
    this.active=false;this.paused=false;this.finished=false;this.firing=false;this.keys={};
    if(document.pointerLockElement)document.exitPointerLock();this.clearCombat();
    this.heroSoldier.visible=true;this.heroLight.visible=true;this.gunRig.visible=false;this.camera.fov=56;this.camera.updateProjectionMatrix();this.resetLobbyCamera();
  }

  clearCombat() {
    for(const e of this.enemies){this.scene.remove(e.root);e.root.traverse(obj=>{if(obj.isMesh&&obj.geometry!==this.boxGeo&&obj.geometry!==this.cylinderGeo)obj.geometry.dispose();});}this.enemies=[];
    for(const effect of this.effects)this.removeEffect(effect);this.effects=[];
  }

  removeEffect(effect) {this.scene.remove(effect.obj);if(effect.dispose){effect.obj.geometry?.dispose();effect.obj.material.dispose();}}

  ensureAudio() {
    if(!this.audioEnabled)return;
    try {if(!this.audio)this.audio=new (window.AudioContext||window.webkitAudioContext)();if(this.audio.state==='suspended')this.audio.resume().catch(()=>{});}catch{this.audioEnabled=false;}
  }

  setAudio(enabled) {this.audioEnabled=enabled;if(enabled)this.ensureAudio();}

  sound(type) {
    if(!this.audioEnabled||!this.audio||this.audio.state!=='running')return;
    const ctx=this.audio,now=ctx.currentTime;
    const gain=ctx.createGain();gain.connect(ctx.destination);
    if(type==='shot'||type==='enemy'){
      const buffer=ctx.createBuffer(1,ctx.sampleRate*.16,ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1)*Math.exp(-i/(ctx.sampleRate*.027));
      const noise=ctx.createBufferSource();noise.buffer=buffer;
      const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=type==='enemy'?900:2700;noise.connect(filter);filter.connect(gain);
      gain.gain.setValueAtTime(this.audioVolume*(type==='enemy'?.12:.65),now);noise.start();noise.stop(now+.17);
    }else{
      const osc=ctx.createOscillator();osc.type=type==='hit'?'sine':'triangle';osc.frequency.setValueAtTime(type==='hit'?950:190,now);osc.frequency.exponentialRampToValueAtTime(type==='hit'?350:80,now+.09);
      gain.gain.setValueAtTime(this.audioVolume*.14,now);gain.gain.exponentialRampToValueAtTime(.0001,now+.12);osc.connect(gain);osc.start();osc.stop(now+.13);
    }
  }

  setQuality(quality) {this.renderer.setPixelRatio(quality==='low'?1:Math.min(devicePixelRatio,quality==='high'?2:1.5));this.renderer.shadowMap.enabled=quality!=='low';this.rain.visible=quality!=='low';}

  animate() {
    const dt=Math.min(this.clock.getDelta(),.05);this.frameCount++;this.frameTime+=dt;
    if(this.frameTime>=1){this.callbacks.onFPS?.(Math.round(this.frameCount/this.frameTime));this.frameTime=0;this.frameCount=0;}
    if(this.active&&!this.paused)this.updateCombat(dt);
    else if(!this.active&&!this.finished){
      const t=this.clock.elapsedTime;this.camera.position.x=9+Math.sin(t*.06)*.45;this.camera.position.y=4.1+Math.sin(t*.1)*.08;this.camera.lookAt(-6,3.5,-14);
      this.heroSoldier.rotation.y=.62+Math.sin(t*.4)*.025;this.heroSoldier.position.y=Math.sin(t*1.4)*.006;
    }
    if(!this.paused){
      for(let i=this.effects.length-1;i>=0;i--){const e=this.effects[i];e.life-=dt;if(e.life<=0){this.removeEffect(e);this.effects.splice(i,1);}}
      this.rain.position.y-=dt*7;if(this.rain.position.y<-14)this.rain.position.y=12;
      for(const smoke of this.smoke){smoke.position.x+=dt*.2;if(smoke.position.x>35)smoke.position.x=-35;}
    }
    this.renderer.render(this.scene,this.camera);
  }
}
