/**
 * Tahta dışı sahne süslemesi: radyal gradyan, silik zemin ızgarası (düz XY),
 * yavaş toz parçacıkları.
 */
import * as THREE from "three";

const FLOOR_GROUP_Z = -4;

/**
 * @param {THREE.WebGLRenderer} renderer
 */
function applyTexColorSpace(tex) {
  if ("colorSpace" in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else if ("encoding" in tex && THREE.sRGBEncoding != null) {
    tex.encoding = THREE.sRGBEncoding;
  }
}

function createSoftDustTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const g = ctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  g.addColorStop(0, "rgba(255,255,255,0.9)");
  g.addColorStop(0.25, "rgba(255,255,255,0.35)");
  g.addColorStop(0.55, "rgba(255,255,255,0.08)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 48, 48);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  applyTexColorSpace(tex);
  return tex;
}

function buildGradientMaterial() {
  return new THREE.ShaderMaterial({
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    uniforms: {},
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.2;
        float d = length(p);
        vec3 core = vec3(0.09, 0.045, 0.14);
        vec3 mid = vec3(0.035, 0.018, 0.07);
        vec3 rim = vec3(0.002, 0.0, 0.012);
        float t = smoothstep(0.0, 0.42, d);
        float t2 = smoothstep(0.35, 1.15, d);
        vec3 col = mix(core, mid, t);
        col = mix(col, rim, t2);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/**
 * @param {THREE.Scene} scene
 * @param {THREE.Group} boardRoot
 */
export function createBoardSceneAmbience(scene, boardRoot) {
  scene.background = new THREE.Color(0x03020a);

  const gradMat = buildGradientMaterial();
  const gradMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    gradMat
  );
  gradMesh.frustumCulled = false;
  gradMesh.position.z = -1800;
  gradMesh.renderOrder = -50;
  scene.add(gradMesh);

  const floorGroup = new THREE.Group();
  floorGroup.renderOrder = -3;
  boardRoot.add(floorGroup);

  let gridLines = /** @type {THREE.LineSegments | null} */ (null);
  const gridMat = new THREE.LineBasicMaterial({
    color: 0xc4d0ff,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });

  const dustTex = createSoftDustTexture();
  const dustCount = 96;
  const dustGeom = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustBase = new Float32Array(dustCount * 3);
  const dustPhase = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    const ix = i * 3;
    const bx = (Math.random() - 0.5) * 1.15;
    const by = (Math.random() - 0.5) * 1.15;
    const bz = -0.35 - Math.random() * 0.55;
    dustBase[ix] = bx;
    dustBase[ix + 1] = by;
    dustBase[ix + 2] = bz;
    dustPos[ix] = bx;
    dustPos[ix + 1] = by;
    dustPos[ix + 2] = bz;
    dustPhase[i] = Math.random() * Math.PI * 2;
  }
  dustGeom.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));

  const dustMat = new THREE.PointsMaterial({
    map: dustTex || undefined,
    color: new THREE.Color(0xe8eeff),
    size: 9,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    alphaTest: 0.02,
  });
  if (!dustTex) {
    dustMat.map = null;
  }

  const dustPoints = new THREE.Points(dustGeom, dustMat);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = -40;
  scene.add(dustPoints);

  function resizeGradient(W, H) {
    const pad = 1.25;
    gradMesh.scale.set(W * pad, H * pad, 1);
  }

  /**
   * @param {*} geo
   * @param {number} rows
   * @param {number} cols
   * @param {number} W
   * @param {number} H
   * @param {(cx: number, cy: number) => { x: number; y: number }} toWorld
   */
  function updateGrid(geo, rows, cols, W, H, toWorld) {
    const { cs, ox, oy } = geo;
    const midCx = ox + cols * cs * 0.5;
    const midCy = oy + rows * cs * 0.5;
    const wc = toWorld(midCx, midCy);

    floorGroup.position.set(wc.x, wc.y, FLOOR_GROUP_Z);
    floorGroup.rotation.set(0, 0, 0);

    const verts = [];
    const x0 = ox;
    const x1 = ox + cols * cs;
    const y0 = oy;
    const y1 = oy + rows * cs;

    function pushSeg(cx0, cy0, cx1, cy1) {
      const a = toWorld(cx0, cy0);
      const b = toWorld(cx1, cy1);
      verts.push(
        a.x - wc.x,
        a.y - wc.y,
        0,
        b.x - wc.x,
        b.y - wc.y,
        0
      );
    }

    for (let i = 0; i <= cols; i++) {
      const x = ox + i * cs;
      pushSeg(x, y0, x, y1);
    }
    for (let j = 0; j <= rows; j++) {
      const y = oy + j * cs;
      pushSeg(x0, y, x1, y);
    }

    const arr = new Float32Array(verts);
    const attr = new THREE.BufferAttribute(arr, 3);
    if (!gridLines) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", attr);
      gridLines = new THREE.LineSegments(g, gridMat);
      gridLines.frustumCulled = false;
      gridLines.renderOrder = -2;
      floorGroup.add(gridLines);
    } else {
      const g = gridLines.geometry;
      const oldAttr = g.getAttribute("position");
      if (oldAttr && oldAttr.array.length === arr.length) {
        oldAttr.array.set(arr);
        oldAttr.needsUpdate = true;
      } else {
        g.dispose();
        const ng = new THREE.BufferGeometry();
        ng.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        gridLines.geometry = ng;
      }
    }
  }

  function tickParticles(nowMs, W, H) {
    const t = nowMs * 0.0001;
    const pos = dustGeom.attributes.position;
    const arr = /** @type {Float32Array} */ (pos.array);
    const halfW = W * 0.52;
    const halfH = H * 0.52;
    for (let i = 0; i < dustCount; i++) {
      const ix = i * 3;
      const bx = dustBase[ix] * halfW;
      const by = dustBase[ix + 1] * halfH;
      const ph = dustPhase[i];
      arr[ix] = bx + Math.sin(t * 0.65 + ph) * (W * 0.015);
      arr[ix + 1] = by + Math.cos(t * 0.5 + ph * 1.2) * (H * 0.012);
      arr[ix + 2] = -280 - dustBase[ix + 2] * 220;
    }
    pos.needsUpdate = true;
  }

  return {
    /**
     * @param {*} geo
     * @param {number} rows
     * @param {number} cols
     * @param {number} W
     * @param {number} H
     * @param {(cx: number, cy: number) => { x: number; y: number }} toWorld
     * @param {number} nowMs
     */
    update(geo, rows, cols, W, H, toWorld, nowMs) {
      resizeGradient(W, H);
      dustMat.size = Math.max(5, W * 0.011);
      updateGrid(geo, rows, cols, W, H, toWorld);
      tickParticles(nowMs, W, H);
    },
  };
}
