"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { HarborAudio } from "@/lib/harbor-audio";

/**
 * Night harbor: a 3D lighthouse on a rock, a moonlit swell and three sailboats.
 * Click the lighthouse: the lamp ignites and two beams sweep across the sky and the water.
 */

// ---------------------------------------------------------------- shared wave model (JS + GLSL must match)
const WAVES = [
  { a: 0.34, d: [0.96, 0.28], k: 0.17, w: 0.85, p: 0.0 },
  { a: 0.2, d: [-0.37, 0.93], k: 0.29, w: 1.25, p: 1.7 },
  { a: 0.1, d: [0.71, -0.71], k: 0.57, w: 1.9, p: 4.1 },
  { a: 0.05, d: [0.2, 0.98], k: 1.15, w: 2.7, p: 2.3 },
];

function waveHeight(x: number, z: number, t: number) {
  let h = 0;
  for (const v of WAVES) h += v.a * Math.sin((v.d[0] * x + v.d[1] * z) * v.k + t * v.w + v.p);
  return h;
}

const WAVE_GLSL = `
  const int NW = ${WAVES.length};
  uniform float uTime;
  vec3 waves(vec2 p) {            // returns (height, d/dx, d/dz)
    vec3 r = vec3(0.0);
    ${WAVES.map(
      (v) => `{
      vec2 d = vec2(${v.d[0].toFixed(3)}, ${v.d[1].toFixed(3)});
      float ph = dot(d, p) * ${v.k.toFixed(3)} + uTime * ${v.w.toFixed(3)} + ${v.p.toFixed(3)};
      r.x += ${v.a.toFixed(3)} * sin(ph);
      r.yz += ${v.a.toFixed(3)} * ${v.k.toFixed(3)} * cos(ph) * d;
    }`,
    ).join("\n")}
    return r;
  }
`;

// ---------------------------------------------------------------- palette (sRGB, converted to linear by three)
const C = {
  zenith: new THREE.Color("#050f1c"),
  horizon: new THREE.Color("#1d3654"),
  glow: new THREE.Color("#3a4a5c"),
  deep: new THREE.Color("#04101d"),
  shallow: new THREE.Color("#0d2a42"),
  fog: new THREE.Color("#0f2236"),
  moon: new THREE.Color("#f1ead8"),
  warm: new THREE.Color("#ffd28a"),
  ivory: "#ece5d4",
  navy: "#142b45",
  brass: new THREE.Color("#b08a4a"),
  rock: new THREE.Color("#33404d"),
};

// small deterministic noise for rocks and stars
function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x: number, y: number, z: number) {
  return (Math.sin(x * 1.7 + Math.sin(z * 2.3)) + Math.sin(y * 2.9 + x * 0.7) + Math.sin(z * 1.3 - y * 1.1)) / 3;
}

function towerTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = C.ivory;
  g.fillRect(0, 0, 64, 512);
  g.fillStyle = C.navy;
  for (const [y, h] of [
    [70, 46],
    [210, 46],
    [350, 46],
  ])
    g.fillRect(0, y, 64, h);
  // subtle weathering
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(0,0,0,${0.02 + hash(i) * 0.04})`;
    g.fillRect(hash(i * 3.1) * 64, hash(i * 7.7) * 512, 1 + hash(i) * 2, 1 + hash(i * 2.2) * 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, "rgba(255,236,200,1)");
  r.addColorStop(0.18, "rgba(255,210,140,0.55)");
  r.addColorStop(0.5, "rgba(255,190,110,0.12)");
  r.addColorStop(1, "rgba(255,190,110,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- builders
function buildSky() {
  const geo = new THREE.SphereGeometry(400, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uZenith: { value: C.zenith }, uHorizon: { value: C.horizon }, uGlow: { value: C.glow }, uMoonDir: { value: new THREE.Vector3() }, uMoon: { value: C.moon }, uOn: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uGlow, uMoonDir, uMoon; uniform float uOn; varying vec3 vDir;
      void main(){
        float y = clamp(vDir.y, -0.2, 1.0);
        vec3 col = mix(uHorizon, uZenith, pow(clamp(y, 0.0, 1.0), 0.55));
        col += uGlow * exp(-abs(y) * 14.0) * 0.55;                 // haze on the horizon
        float m = dot(normalize(vDir), uMoonDir);
        col += uMoon * smoothstep(0.99955, 0.99975, m) * 1.6;     // disc
        col += uMoon * pow(max(m, 0.0), 320.0) * 0.16 + uMoon * pow(max(m, 0.0), 18.0) * 0.025;
        col *= 1.0 + uOn * 0.06;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

function buildStars() {
  const n = 1400;
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = hash(i + 1.3);
    const v = hash(i * 2.7 + 9.1);
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v * 0.92); // mostly upper sky
    const r = 380;
    pos.set([r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) + 6, r * Math.sin(phi) * Math.sin(theta)], i * 3);
    rnd[i] = hash(i * 5.3 + 2.2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `
      attribute float aRnd; uniform float uTime; uniform float uPx; varying float vA;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aRnd * 2.2) + aRnd * 40.0);
        vA = tw * (0.25 + aRnd * 0.75) * smoothstep(0.0, 0.18, normalize(position).y);
        gl_PointSize = (0.8 + aRnd * aRnd * 2.2) * uPx;
      }`,
    fragmentShader: `
      varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA; gl_FragColor = vec4(vec3(0.92, 0.94, 1.0) * a, a); }`,
  });
  return new THREE.Points(geo, mat);
}

function buildOcean(moonDir: THREE.Vector3) {
  const geo = new THREE.PlaneGeometry(520, 520, 300, 300);
  geo.rotateX(-Math.PI / 2);
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: C.deep },
    uShallow: { value: C.shallow },
    uSkyTop: { value: C.zenith },
    uSkyLow: { value: C.horizon },
    uMoonDir: { value: moonDir },
    uMoon: { value: C.moon },
    uWarm: { value: C.warm },
    uLampPos: { value: new THREE.Vector3() },
    uOn: { value: 0 },
    uLamp: { value: 0.15 },
    uBeam: { value: 0 },
    uFog: { value: C.fog },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      ${WAVE_GLSL}
      varying vec3 vWorld; varying vec3 vN;
      void main(){
        vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 w = waves(p.xz);
        p.y += w.x;
        vN = normalize(vec3(-w.y, 1.0, -w.z));
        vWorld = p;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uDeep, uShallow, uSkyTop, uSkyLow, uMoonDir, uMoon, uWarm, uLampPos, uFog;
      uniform float uOn, uLamp, uBeam, uTime;
      varying vec3 vWorld; varying vec3 vN;
      const float PI = 3.14159265;
      float angDist(float a, float b){ float d = mod(a - b + PI, 2.0 * PI) - PI; return abs(d); }
      void main(){
        // fine ripples on top of the swell
        vec2 q = vWorld.xz;
        vec3 n = normalize(vN + 0.06 * vec3(sin(q.x * 2.1 + uTime * 1.7) * cos(q.y * 1.7 - uTime), 0.0, cos(q.y * 2.4 + uTime * 1.3) * sin(q.x * 1.3)));
        vec3 V = normalize(cameraPosition - vWorld);
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n);
        vec3 sky = mix(uSkyLow, uSkyTop, pow(clamp(R.y, 0.0, 1.0), 0.6));
        vec3 base = mix(uDeep, uShallow, clamp(vWorld.y * 0.9 + 0.35, 0.0, 1.0));
        vec3 col = mix(base, sky, fres);
        // moon path
        float m = max(dot(R, uMoonDir), 0.0);
        col += uMoon * (pow(m, 900.0) * 1.7 + pow(m, 90.0) * 0.1);
        // lamp reflection
        vec3 L = uLampPos - vWorld; float dl = length(L); L /= dl;
        col += uWarm * pow(max(dot(R, L), 0.0), 220.0) * uLamp * 1.6;
        col += uWarm * uLamp * 0.18 * exp(-dl * 0.11);
        // the two beams sweeping the water
        vec2 rel = vWorld.xz - uLampPos.xz;
        float a = atan(rel.y, rel.x);
        float d = min(angDist(a, uBeam), angDist(a, uBeam + PI));
        float r = length(rel);
        float beam = exp(-pow(d / (0.05 + 1.4 / (r + 6.0)), 2.0)) * smoothstep(3.0, 9.0, r) * exp(-r * 0.012);
        float toCam = smoothstep(14.0, 34.0, length(vWorld.xz - cameraPosition.xz));
        col += uWarm * beam * uOn * toCam * (0.05 + 0.32 * fres + 0.18 * pow(max(dot(R, normalize(vec3(rel.x, 0.0, rel.y))), 0.0), 6.0));
        // atmosphere
        float dist = length(cameraPosition - vWorld);
        float f = 1.0 - exp(-pow(dist * 0.0085, 1.6));
        col = mix(col, uFog, f);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  return { mesh: new THREE.Mesh(geo, mat), uniforms };
}

function buildRock(radius: number, seed: number, squash = 0.42) {
  const geo = new THREE.IcosahedronGeometry(radius, 3);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = noise3(v.x * 0.9 + seed, v.y * 0.9 - seed, v.z * 0.9 + seed * 2) * 0.32 + noise3(v.x * 2.7, v.y * 2.7 + seed, v.z * 2.7) * 0.12;
    v.multiplyScalar(1 + n);
    v.y *= squash;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: C.rock, roughness: 0.95, metalness: 0, flatShading: true }));
}

function buildLighthouse() {
  const g = new THREE.Group();
  const meshes: THREE.Object3D[] = [];
  const glow: { mat: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial; base: number; full: number }[] = [];

  // island
  const isle = buildRock(5.2, 1.3, 0.36);
  isle.position.y = -0.2;
  g.add(isle);
  for (const [x, z, r, s] of [
    [-5.2, 2.8, 1.4, 4.2],
    [4.6, 3.6, 1.1, 6.7],
    [6.4, -1.5, 1.6, 2.9],
    [-3.8, -3.5, 1.2, 8.1],
  ]) {
    const rk = buildRock(r, s, 0.55);
    rk.position.set(x, -0.15, z);
    rk.rotation.y = s;
    g.add(rk);
  }

  // tower
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    profile.push(new THREE.Vector2(1.32 - 0.5 * t - 0.06 * Math.sin(t * Math.PI), 0.9 + t * 8.1));
  }
  const towerGeo = new THREE.LatheGeometry(profile, 72);
  const towerMat = new THREE.MeshStandardMaterial({ map: towerTexture(), roughness: 0.62, metalness: 0.02 });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  g.add(tower);
  meshes.push(tower);

  // plinth
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.95, 0.9, 48), new THREE.MeshStandardMaterial({ color: "#3a3f45", roughness: 0.9 }));
  plinth.position.y = 0.55;
  g.add(plinth);
  meshes.push(plinth);

  // windows (warm, faintly lit even when the lamp is off)
  const winMat = new THREE.MeshStandardMaterial({ color: "#1b1206", emissive: new THREE.Color("#ffb766"), emissiveIntensity: 0.25 });
  glow.push({ mat: winMat, base: 0.25, full: 1.6 });
  for (const [y, a] of [
    [2.6, 0.4],
    [4.9, 2.3],
    [7.0, 0.9],
  ]) {
    const r = 1.32 - 0.5 * ((y - 0.9) / 8.1) - 0.06 * Math.sin(((y - 0.9) / 8.1) * Math.PI);
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.06), winMat);
    w.position.set(Math.sin(a) * r, y, Math.cos(a) * r);
    w.rotation.y = a;
    g.add(w);
  }

  // gallery and railing
  const metal = new THREE.MeshStandardMaterial({ color: "#1e3550", roughness: 0.45, metalness: 0.6 });
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.2, 0.2, 48), metal);
  deck.position.y = 9.08;
  g.add(deck);
  meshes.push(deck);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(1.24, 0.028, 8, 64), metal);
  rail.rotation.x = Math.PI / 2;
  rail.position.y = 9.62;
  g.add(rail);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.52, 6), metal);
    b.position.set(Math.cos(a) * 1.24, 9.38, Math.sin(a) * 1.24);
    g.add(b);
  }

  // lantern room
  const glassMat = new THREE.MeshStandardMaterial({ color: "#20344a", emissive: new THREE.Color("#ffcf8a"), emissiveIntensity: 0.12, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2 });
  glow.push({ mat: glassMat, base: 0.12, full: 1.1 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 1.15, 32, 1, true), glassMat);
  glass.position.y = 9.78;
  g.add(glass);
  meshes.push(glass);
  const brass = new THREE.MeshStandardMaterial({ color: C.brass, roughness: 0.35, metalness: 0.85 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.15, 0.05), brass);
    m.position.set(Math.cos(a) * 0.75, 9.78, Math.sin(a) * 0.75);
    g.add(m);
  }
  const ringTop = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.08, 32), brass);
  ringTop.position.y = 10.38;
  g.add(ringTop);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.92, 0.78, 32), new THREE.MeshStandardMaterial({ color: "#16283d", roughness: 0.4, metalness: 0.7 }));
  roof.position.y = 10.8;
  g.add(roof);
  meshes.push(roof);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), brass);
  ball.position.y = 11.25;
  g.add(ball);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), brass);
  rod.position.y = 11.6;
  g.add(rod);

  // lamp
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffcf8a").multiplyScalar(0.35) });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), lampMat);
  lamp.position.y = 9.75;
  g.add(lamp);

  // keeper's cottage
  const wall = new THREE.MeshStandardMaterial({ color: "#d9d1bf", roughness: 0.85 });
  const cottage = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.15, 1.5), wall);
  cottage.position.set(-2.55, 0.95, 0.9);
  cottage.rotation.y = 0.35;
  g.add(cottage);
  meshes.push(cottage);
  const roofGeo = new THREE.CylinderGeometry(0.01, 1.05, 0.75, 4, 1);
  roofGeo.rotateY(Math.PI / 4);
  roofGeo.scale(1.65, 1, 1.1);
  const croof = new THREE.Mesh(roofGeo, new THREE.MeshStandardMaterial({ color: "#2b3a4a", roughness: 0.7 }));
  croof.position.set(-2.55, 1.9, 0.9);
  croof.rotation.y = 0.35;
  g.add(croof);
  for (const dx of [-0.5, 0.45]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.04), winMat);
    w.position.set(-2.55 + Math.cos(0.35) * dx + Math.sin(0.35) * 0.76, 1.0, 0.9 - Math.sin(0.35) * dx + Math.cos(0.35) * 0.76);
    w.rotation.y = 0.35;
    g.add(w);
  }

  return { group: g, meshes, glow, lamp, lampMat };
}

function buildBeams() {
  const pivot = new THREE.Group();
  const L = 58;
  const mats: THREE.ShaderMaterial[] = [];
  for (const dir of [0, Math.PI]) {
    const geo = new THREE.ConeGeometry(3.4, L, 64, 24, true);
    geo.translate(0, -L / 2, 0); // apex at the origin, opening along -Y
    const p = geo.attributes.position as THREE.BufferAttribute;
    const len = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) len[i] = -p.getY(i) / L;
    geo.setAttribute("aLen", new THREE.BufferAttribute(len, 1));
    geo.rotateZ(Math.PI / 2); // now opens along +X
    geo.rotateZ(-0.045); // aim slightly down toward the sea
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uOn: { value: 0 }, uTime: { value: 0 }, uWarm: { value: C.warm } },
      vertexShader: `
        attribute float aLen; varying float vLen; varying vec3 vNv; varying vec3 vPv;
        void main(){ vLen = aLen; vec4 mv = modelViewMatrix * vec4(position,1.0); vPv = mv.xyz; vNv = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform float uOn, uTime; uniform vec3 uWarm; varying float vLen; varying vec3 vNv; varying vec3 vPv;
        void main(){
          float facing = abs(dot(normalize(vNv), normalize(-vPv)));
          float core = pow(facing, 3.2);
          float along = pow(1.0 - vLen, 1.35) * smoothstep(0.0, 0.03, vLen);
          float dust = 0.88 + 0.12 * sin(vLen * 60.0 - uTime * 1.6) * sin(vLen * 23.0 + uTime * 0.7);
          float nearFade = smoothstep(6.0, 26.0, -vPv.z);
          float a = uOn * core * along * dust * nearFade * 0.38;
          gl_FragColor = vec4(uWarm * a, a);
        }`,
    });
    mats.push(mat);
    const cone = new THREE.Mesh(geo, mat);
    cone.rotation.y = dir;
    cone.renderOrder = 5;
    pivot.add(cone);
  }
  return { pivot, mats };
}

function buildBoat(hullColor: string, sailTint = "#efe8d8") {
  const g = new THREE.Group();
  // hull: a tapered box with a pointed bow
  const geo = new THREE.BoxGeometry(2.6, 0.55, 0.95, 16, 2, 4);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    const t = (x + 1.3) / 2.6; // 0 stern .. 1 bow
    const bow = Math.max(0, (t - 0.55) / 0.45);
    z *= 1 - Math.pow(bow, 1.6) * 0.96;
    if (y < 0) {
      z *= 0.5;
      x *= 0.92;
    }
    const lift = Math.pow(bow, 2) * 0.22 + (y > 0 ? 0 : 0.0);
    p.setXYZ(i, x, y + lift, z);
  }
  geo.computeVertexNormals();
  const hull = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hullColor, roughness: 0.55 }));
  hull.position.y = 0.12;
  g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: "#8a6a45", roughness: 0.8 }));
  deck.position.set(-0.25, 0.42, 0);
  g.add(deck);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: "#e3dccb", roughness: 0.8 }));
  cabin.position.set(-0.45, 0.58, 0);
  g.add(cabin);
  const portMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffc071").multiplyScalar(1.8) });
  const port = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.52), portMat);
  port.position.set(-0.4, 0.6, 0);
  g.add(port);
  // mast + sails
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 3.0, 8), new THREE.MeshStandardMaterial({ color: "#c9c2b2", roughness: 0.6 }));
  mast.position.set(0.15, 1.9, 0);
  g.add(mast);
  const sailMat = new THREE.MeshStandardMaterial({ color: sailTint, roughness: 0.9, side: THREE.DoubleSide });
  const main = new THREE.Shape();
  main.moveTo(0, 0);
  main.lineTo(0, 2.7);
  main.quadraticCurveTo(-0.55, 1.2, -1.25, 0.05);
  main.lineTo(0, 0);
  const mainSail = new THREE.Mesh(new THREE.ShapeGeometry(main, 12), sailMat);
  mainSail.position.set(0.1, 0.55, 0.02);
  mainSail.rotation.y = 0.18;
  g.add(mainSail);
  const jib = new THREE.Shape();
  jib.moveTo(0, 0);
  jib.lineTo(0, 2.3);
  jib.quadraticCurveTo(0.45, 1.0, 1.05, 0.05);
  jib.lineTo(0, 0);
  const jibSail = new THREE.Mesh(new THREE.ShapeGeometry(jib, 12), sailMat);
  jibSail.position.set(0.2, 0.55, -0.02);
  jibSail.rotation.y = -0.22;
  g.add(jibSail);
  // masthead light
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff1d6").multiplyScalar(2.2) }));
  top.position.set(0.15, 3.42, 0);
  g.add(top);
  return g;
}

// ---------------------------------------------------------------- component
function soundOff() {
  try {
    return localStorage.getItem("lh_sound") === "off";
  } catch {
    return false; // storage unavailable: sound stays on
  }
}

export default function LighthouseScene({ className }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const hint = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<() => void>(() => {});
  const [on, setOn] = useState(false);
  const [ready, setReady] = useState(false);
  const audioRef = useRef<HarborAudio | null>(null);
  const [muted, setMuted] = useState(soundOff);
  const [heard, setHeard] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const audio = new HarborAudio();
    audioRef.current = audio;
    audio.setMuted(soundOff());

    // renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = "block";
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 900);

    // world
    const moonDir = new THREE.Vector3(0.115, 0.34, -1).normalize();
    const sky = buildSky();
    (sky.material as THREE.ShaderMaterial).uniforms.uMoonDir.value = moonDir;
    scene.add(sky);
    const stars = buildStars();
    scene.add(stars);
    const ocean = buildOcean(moonDir);
    scene.add(ocean.mesh);

    scene.add(new THREE.HemisphereLight(new THREE.Color("#4a6489"), new THREE.Color("#07131f"), 0.8));
    const moonLight = new THREE.DirectionalLight(new THREE.Color("#c9d6ea"), 0.9);
    moonLight.position.copy(moonDir).multiplyScalar(100);
    scene.add(moonLight);
    const fill = new THREE.DirectionalLight(new THREE.Color("#7f97b8"), 0.55);
    fill.position.set(-20, 18, 40);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(new THREE.Color("#e8dcc4"), 0.35);
    rim.position.set(30, 10, -20);
    scene.add(rim);

    const lh = buildLighthouse();
    const LH_POS = new THREE.Vector3(9.5, 0, -12);
    lh.group.position.copy(LH_POS);
    lh.group.rotation.y = -0.4;
    scene.add(lh.group);
    const lampWorld = new THREE.Vector3();
    lh.lamp.getWorldPosition(lampWorld);
    lh.group.updateMatrixWorld(true);
    lh.lamp.getWorldPosition(lampWorld);
    ocean.uniforms.uLampPos.value.copy(lampWorld);

    const lampLight = new THREE.PointLight(new THREE.Color("#ffc983"), 0, 40, 1.6);
    lampLight.position.copy(lampWorld);
    scene.add(lampLight);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.25 }));
    halo.position.copy(lampWorld);
    halo.scale.setScalar(2.2);
    scene.add(halo);

    const beams = buildBeams();
    beams.pivot.position.copy(lampWorld);
    scene.add(beams.pivot);
    const sweep = new THREE.SpotLight(new THREE.Color("#ffd496"), 0, 120, 0.11, 0.6, 1.2);
    sweep.position.copy(lampWorld);
    scene.add(sweep);
    scene.add(sweep.target);

    const boats = [
      { g: buildBoat("#7a2e2a"), x: -3.4, z: 9.0, heading: 0.25, speed: 0.14, scale: 0.62, maxX: 2.5 },
      { g: buildBoat("#1f3b57", "#f2ead6"), x: -7.0, z: 0.5, heading: -0.15, speed: 0.11, scale: 0.85, maxX: 2.0 },
      { g: buildBoat("#e2dccd", "#d9b97a"), x: -9.0, z: -15.0, heading: 0.1, speed: 0.07, scale: 1.0, maxX: -1.5 },
    ];
    for (const b of boats) {
      b.g.scale.setScalar(b.scale);
      scene.add(b.g);
    }

    // post
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.55, 0.86);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // sizing + framing (keep the lighthouse right, boats lower-left)
    const look = new THREE.Vector3();
    const camBase = new THREE.Vector3();
    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      composer.setSize(w, h);
      bloom.setSize(w, h);
      const aspect = w / h;
      camera.aspect = aspect;
      camera.fov = aspect < 0.8 ? 46 : aspect < 1.1 ? 40 : 34;
      camera.updateProjectionMatrix();
      camBase.set(aspect < 1 ? -1.5 : 0, 3.3, 26);
      look.set(aspect < 1 ? 1.2 : 2.2, 5.6, -6);
      (stars.material as THREE.ShaderMaterial).uniforms.uPx.value = renderer.getPixelRatio();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // interaction
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pointer = { x: 0, y: 0 };
    const state = { on: false, target: 0, value: 0, ignite: 0, angle: 0.6, speed: 0 };
    const hitLighthouse = (cx: number, cy: number) => {
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      return ray.intersectObjects([lh.group], true).length > 0;
    };
    const toggle = () => {
      state.on = !state.on;
      state.target = state.on ? 1 : 0;
      if (state.on) state.ignite = 0;
      setOn(state.on);
      audio.lamp(state.on);
      setHeard(true);
    };
    toggleRef.current = toggle;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      el.style.cursor = hitLighthouse(e.clientX, e.clientY) ? "pointer" : "default";
    };
    const onDown = (e: PointerEvent) => {
      audio.start(); // surf begins on the first click (browsers require a gesture)
      setHeard(true);
      if (hitLighthouse(e.clientX, e.clientY)) toggle();
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);

    // loop (paused when hidden or offscreen)
    let visible = true;
    const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
    io.observe(el);
    const clock = new THREE.Clock();
    let t = 0;
    let raf = 0;
    const proj = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible || document.hidden) {
        clock.getDelta();
        return;
      }
      const dt = Math.min(clock.getDelta(), 0.05);
      t += dt * (reduce ? 0.35 : 1);

      // light state: ignite with a short double flash, then settle
      state.value += (state.target - state.value) * (1 - Math.exp(-dt * (state.on ? 2.2 : 3.5)));
      if (state.on) state.ignite = Math.min(1, state.ignite + dt * 1.6);
      const flash = state.on && state.ignite < 0.45 ? (Math.sin(state.ignite * 44) > 0.2 ? 1 : 0.35) : 1;
      const on01 = state.value * flash;
      const lampLevel = 0.04 + 0.96 * on01;
      state.speed += ((state.on ? (reduce ? 0.18 : 0.55) : 0) - state.speed) * (1 - Math.exp(-dt * 0.8));
      state.angle += state.speed * dt;

      lh.lampMat.color.copy(C.warm).multiplyScalar(0.3 + 5.0 * on01);
      for (const gm of lh.glow) (gm.mat as THREE.MeshStandardMaterial).emissiveIntensity = gm.base + (gm.full - gm.base) * on01;
      lampLight.intensity = 26 * on01;
      const toCamAng = Math.atan2(camera.position.z - lampWorld.z, camera.position.x - lampWorld.x);
      const face = Math.max(Math.cos(state.angle - toCamAng), Math.cos(state.angle + Math.PI - toCamAng));
      const flare = Math.pow(Math.max(face, 0), 24) * on01;
      halo.material.opacity = Math.min(1, 0.18 + 0.7 * on01 + 0.3 * flare);
      halo.scale.setScalar(2.0 + 3.6 * on01 + 7 * flare);
      beams.pivot.rotation.y = -state.angle;
      for (const m of beams.mats) {
        m.uniforms.uOn.value = on01;
        m.uniforms.uTime.value = t;
      }
      tmp.set(Math.cos(state.angle), -0.09, Math.sin(state.angle)).multiplyScalar(30).add(lampWorld);
      sweep.target.position.copy(tmp);
      sweep.intensity = 140 * on01;
      bloom.strength = 0.4 + 0.3 * on01;

      ocean.uniforms.uTime.value = t;
      ocean.uniforms.uOn.value = on01;
      ocean.uniforms.uLamp.value = lampLevel;
      ocean.uniforms.uBeam.value = state.angle; // world xz angle of the beam
      (sky.material as THREE.ShaderMaterial).uniforms.uOn.value = on01;
      (stars.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

      // boats ride the swell
      for (const b of boats) {
        b.x += b.speed * dt * Math.cos(b.heading);
        b.z += b.speed * dt * Math.sin(b.heading) * 0.3;
        if (b.x > b.maxX) b.x = -14;
        const y = waveHeight(b.x, b.z, t);
        const e = 0.6;
        const dx = (waveHeight(b.x + e, b.z, t) - waveHeight(b.x - e, b.z, t)) / (2 * e);
        const dz = (waveHeight(b.x, b.z + e, t) - waveHeight(b.x, b.z - e, t)) / (2 * e);
        b.g.position.set(b.x, y - 0.08, b.z);
        b.g.rotation.set(0, 0, 0);
        b.g.rotateY(-b.heading);
        b.g.rotateZ(Math.atan(dx * Math.cos(b.heading) + dz * Math.sin(b.heading)) * 0.9);
        b.g.rotateX(-Math.atan(-dx * Math.sin(b.heading) + dz * Math.cos(b.heading)) * 0.9);
      }

      // gentle parallax
      camera.position.set(camBase.x + pointer.x * 0.9, camBase.y - pointer.y * 0.35 + Math.sin(t * 0.4) * 0.05, camBase.z);
      camera.lookAt(look);

      // keep the hint next to the lamp
      if (hint.current) {
        proj.copy(lampWorld).project(camera);
        hint.current.style.transform = `translate(${((proj.x + 1) / 2) * el.clientWidth}px, ${((1 - proj.y) / 2) * el.clientHeight}px)`;
      }
      composer.render();
    };
    frame();
    setReady(true);

    return () => {
      cancelAnimationFrame(raf);
      audio.dispose();
      ro.disconnect();
      io.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
          Object.values(x).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
          x.dispose();
        });
      });
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={className} aria-label="Night harbor with a lighthouse. Click the lighthouse to switch its light on or off.">
      <div ref={host} className={`absolute inset-0 transition-opacity duration-[1400ms] ${ready ? "opacity-100" : "opacity-0"}`} />
      <div ref={hint} className="pointer-events-none absolute top-0 left-0 will-change-transform">
        <button
          type="button"
          onClick={() => toggleRef.current()}
          className="pointer-events-auto absolute -translate-x-[calc(100%+28px)] -translate-y-1/2 rounded-full border border-[#D9B97A]/40 bg-[#0E2238]/70 px-3 py-1.5 text-[12px] whitespace-nowrap text-[#E8D3A6] backdrop-blur-sm transition hover:border-[#D9B97A]/80 hover:text-[#F4F1EA]"
        >
          <span className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${on ? "bg-[#FFD28A] shadow-[0_0_8px_2px_rgba(255,210,138,0.7)]" : "bg-[#D9B97A]/60"}`} />
          {on ? "Lights out" : "Light the lighthouse"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          const next = !muted;
          if (!next) a.start();
          a.setMuted(next);
          setMuted(next);
          setHeard(true);
          try {
            localStorage.setItem("lh_sound", next ? "off" : "on");
          } catch {
            /* ignore */
          }
        }}
        aria-label={muted ? "Turn sound on" : "Turn sound off"}
        className="absolute right-6 bottom-6 z-20 inline-flex items-center gap-1.5 rounded-full border border-[#D9B97A]/30 bg-[#0E2238]/60 px-3 py-1.5 text-[12px] text-[#C9CFD8] backdrop-blur-sm transition hover:border-[#D9B97A]/70 hover:text-[#F4F1EA]"
      >
        {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
        {muted ? "Sound off" : heard ? "Sound on" : "Click for sound"}
      </button>
    </div>
  );
}
