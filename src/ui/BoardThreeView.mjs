/**
 * Three.js WebGL tahta — premium: MSAA, DPR≤2, EffectComposer + UnrealBloomPass + OutputPass.
 * Taş 0–4: PNG + MeshStandardMaterial (pembe ejder, kırmızı elma, sarı, yeşil, mavi).
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createBoardSceneAmbience } from "./boardThreeSceneAmbience.mjs";
import { createBoardHintFx } from "./boardThreeHintFx.mjs";
import { createBoardSelectionFx } from "./boardThreeSelectionFx.mjs";
import { gsap } from "https://unpkg.com/gsap@3.12.5/index.js";

const ease =
  typeof globalThis.easeOutQuad === "function"
    ? globalThis.easeOutQuad
    : function (t) {
        return 1 - (1 - t) * (1 - t);
      };

function easeOutBounce(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  }
  if (t < 2 / d1) {
    return n1 * (t -= 1.5 / d1) * t + 0.75;
  }
  if (t < 2.5 / d1) {
    return n1 * (t -= 2.25 / d1) * t + 0.9375;
  }
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function spawnRowOffsetCells(startMs, durMs) {
  const t = Math.min(1, (performance.now() - startMs) / durMs);
  return -(1 - easeOutBounce(t)) * 0.55;
}

const GEM_PNG_PATHS = {
  0: "assets/gems/pembe_ejder.png",
  1: "assets/gems/kırmızı_elma.png",
  2: "assets/gems/armut_sarı.png",
  3: "assets/gems/yeşil_yaprak.png",
  4: "assets/gems/Mavi_elmas.png",
};

function resolveGemImageSrc(ci) {
  return GEM_PNG_PATHS[ci] != null ? GEM_PNG_PATHS[ci] : null;
}

const TILE_THEMES = [
  { hi: "#ffd6eb", mid: "#ff3d8a", lo: "#d41060" },
  { hi: "#ff9a8f", mid: "#ff2438", lo: "#a31428" },
  { hi: "#fff8d0", mid: "#ffdd00", lo: "#f5a000" },
  { hi: "#b5ffd0", mid: "#00e676", lo: "#00964c" },
  { hi: "#b8ecff", mid: "#00c8ff", lo: "#0078c8" },
];

function hexToNum(hex) {
  const n = String(hex).replace("#", "");
  return parseInt(n, 16);
}

function _hexToRgb(hex) {
  const n = hex.replace("#", "");
  return {
    r: parseInt(n.slice(0, 2), 16),
    g: parseInt(n.slice(2, 4), 16),
    b: parseInt(n.slice(4, 6), 16),
  };
}

function applyTextureColorSpace(tex) {
  if ("colorSpace" in tex && THREE.SRGBColorSpace) {
    tex.colorSpace = THREE.SRGBColorSpace;
  } else if ("encoding" in tex && THREE.sRGBEncoding != null) {
    tex.encoding = THREE.sRGBEncoding;
  }
}

class BoardThreeView {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._lastBurstNonce = -1;
    this._burstRedrawUntil = 0;
    this._lastRenderTime =
      typeof performance !== "undefined" ? performance.now() : 0;
    this._renderNowMs = 0;
    this._missionSparkleStartMs = 0;
    this._missionSparkleUntilMs = 0;
    this._missionSparkleAnchorEl = null;
    this._missionSparklePreset = "default";
    /** @type {null | (() => void)} */
    this._onRestart = null;

    this._renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    if ("outputColorSpace" in this._renderer && THREE.SRGBColorSpace) {
      this._renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if (
      "outputEncoding" in this._renderer &&
      THREE.sRGBEncoding != null
    ) {
      this._renderer.outputEncoding = THREE.sRGBEncoding;
    }
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.05;

    const iw0 = parseInt(canvas.getAttribute("width") || "720", 10);
    const ih0 = parseInt(canvas.getAttribute("height") || "1280", 10);
    const dpr0 = Math.min(
      typeof window !== "undefined" && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1,
      2
    );
    this._renderer.setPixelRatio(dpr0);
    this._renderer.setSize(iw0, ih0, false);

    this._scene = new THREE.Scene();

    this._camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000);
    this._camera.position.set(0, 0, 1000);
    this._camera.lookAt(0, 0, 0);

    this._root = new THREE.Group();
    this._scene.add(this._root);
    this._hintFx = createBoardHintFx();
    const selectionFxMode =
      typeof globalThis.MATCH3_SELECTION_FX_MODE === "string"
        ? globalThis.MATCH3_SELECTION_FX_MODE
        : undefined;
    this._selectionFx = createBoardSelectionFx(this._root, selectionFxMode);
    this._renderedEntriesByKey = new Map();

    /** @type {ReturnType<typeof createBoardSceneAmbience> | null} */
    this._ambience = createBoardSceneAmbience(this._scene, this._root);

    const amb = new THREE.AmbientLight(0xffffff, 0.62);
    this._scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(-420, 820, 1400);
    this._scene.add(dir);

    /** @type {THREE.Texture[]} */
    this._textures = [];
    /** @type {Record<number, THREE.MeshStandardMaterial>} */
    this._texMaterials = {};
    /** @type {Record<number, THREE.MeshStandardMaterial>} */
    this._solidMaterials = {};

    const loader = new THREE.TextureLoader();
    const maxAniso = this._renderer.capabilities.getMaxAnisotropy();
    for (let ci = 0; ci < TILE_THEMES.length; ci++) {
      const th = TILE_THEMES[ci];
      this._solidMaterials[ci] = new THREE.MeshStandardMaterial({
        color: hexToNum(th.mid),
        roughness: 0.42,
        metalness: 0.1,
        transparent: false,
      });
      const src = resolveGemImageSrc(ci);
      if (!src) continue;
      const tex = loader.load(
        src,
        (t) => {
          applyTextureColorSpace(t);
          t.anisotropy = maxAniso;
          t.minFilter = THREE.LinearMipmapLinearFilter;
          t.magFilter = THREE.LinearFilter;
          t.generateMipmaps = true;
        },
        undefined,
        () => {}
      );
      applyTextureColorSpace(tex);
      this._textures.push(tex);
      const em = new THREE.Color(hexToNum(th.mid)).multiplyScalar(0.08);
      this._texMaterials[ci] = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        depthWrite: true,
        roughness: 0.48,
        metalness: 0.06,
        emissive: em,
        emissiveIntensity: 0.35,
      });
    }

    /** @type {{ group: THREE.Group; mesh: THREE.Mesh; ring: THREE.Mesh; halo: THREE.Mesh; stripe: THREE.Group; stripeMats: THREE.MeshBasicMaterial[]; isPicked: boolean; sharedMaterial?: THREE.Material | null; pickedMaterial?: THREE.Material | null; jiggleScaleTween?: gsap.core.Tween | null; jiggleRotateTween?: gsap.core.Tween | null; releaseCleanupTween?: gsap.core.Tween | null; hintScaleTween?: gsap.core.Tween | null; hintRotateTween?: gsap.core.Tween | null; hintMode?: string | null; softPulseScaleTween?: gsap.core.Tween | null }[]} */
    this._pool = [];
    const gemGeo = new THREE.PlaneGeometry(1, 1);
    const ringGeo = new THREE.RingGeometry(0.38, 0.48, 40);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthTest: false,
    });

    const gemPoolSize = 96;
    for (let i = 0; i < gemPoolSize; i++) {
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(gemGeo, this._solidMaterials[0]);
      mesh.renderOrder = 2;
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.visible = false;
      ring.renderOrder = 4;
      const halo = this._selectionFx.createHaloMesh();
      const stripe = new THREE.Group();
      stripe.renderOrder = 3;
      const stripeMats = [];
      for (let s = 0; s < 4; s++) {
        const sm = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthTest: true,
        });
        stripeMats.push(sm);
        const pl = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sm);
        pl.visible = false;
        stripe.add(pl);
      }
      group.add(mesh);
      group.add(halo);
      group.add(stripe);
      group.add(ring);
      group.visible = false;
      this._root.add(group);
      this._pool.push({
        group,
        mesh,
        ring,
        halo,
        stripe,
        stripeMats,
        isPicked: false,
        sharedMaterial: this._solidMaterials[0],
        pickedMaterial: null,
        jiggleScaleTween: null,
        jiggleRotateTween: null,
        releaseCleanupTween: null,
        hintScaleTween: null,
        hintRotateTween: null,
        softPulseScaleTween: null,
      });
    }
    this._poolIndex = 0;
    /** @type {boolean} */
    this._gemPoolExhaustLogged = false;

    this._cellMeshes = [];
    const cellGeo = new THREE.PlaneGeometry(1, 1);
    const cellMatFull = new THREE.MeshBasicMaterial({
      color: 0x261c44,
      transparent: true,
      opacity: 0.82,
    });
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(cellGeo, cellMatFull.clone());
      m.renderOrder = 0;
      this._root.add(m);
      this._cellMeshes.push(m);
    }

    this._flashGroup = new THREE.Group();
    this._flashGroup.renderOrder = 10;
    this._root.add(this._flashGroup);
    /** @type {THREE.Mesh[]} */
    this._flashMeshes = [];
    const flashGeo = new THREE.CircleGeometry(0.5, 28);
    for (let f = 0; f < 72; f++) {
      const fm = new THREE.Mesh(
        flashGeo,
        new THREE.MeshBasicMaterial({
          color: 0xfff5cc,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
        })
      );
      fm.renderOrder = 11;
      fm.visible = false;
      this._flashGroup.add(fm);
      this._flashMeshes.push(fm);
    }

    /** @type {THREE.Mesh[]} */
    this._missionSparkleMeshes = [];
    const missionSparkGeo = new THREE.CircleGeometry(0.5, 16);
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(
        missionSparkGeo,
        new THREE.MeshBasicMaterial({
          color: 0xc8fff2,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
        })
      );
      m.renderOrder = 12;
      m.visible = false;
      this._flashGroup.add(m);
      this._missionSparkleMeshes.push(m);
    }

    this._composer = new EffectComposer(this._renderer);
    this._composer.addPass(new RenderPass(this._scene, this._camera));
    this._bloomPass = new UnrealBloomPass(
      new THREE.Vector2(iw0, ih0),
      0.5,
      0.1,
      0.9
    );
    this._bloomPass.threshold = 0.9;
    this._bloomPass.strength = 0.5;
    this._bloomPass.radius = 0.1;
    this._baseBloomStrength = 0.5;
    this._composer.addPass(this._bloomPass);
    this._composer.addPass(new OutputPass());

    this.syncPixelBuffer(iw0, ih0);
  }

  /**
   * @param {() => void} fn gameOver iken çağrılır (overlay / tuval).
   */
  setRestartHandler(fn) {
    this._onRestart = typeof fn === "function" ? fn : null;
  }

  setHintMove(move) {
    if (!this._hintFx) return;
    this._hintFx.setHintMove(move || null);
  }

  triggerMissionSparkle(durationMs) {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    let d = 900;
    let anchorEl = null;
    let preset = "default";
    if (typeof durationMs === "number") {
      d = durationMs;
    } else if (durationMs && typeof durationMs === "object") {
      d = Number.isFinite(durationMs.durationMs) ? durationMs.durationMs : d;
      anchorEl = durationMs.anchorEl || null;
      preset = typeof durationMs.preset === "string" ? durationMs.preset : preset;
    }
    this._missionSparkleStartMs = now;
    this._missionSparkleUntilMs = now + Math.max(250, d);
    this._missionSparkleAnchorEl = anchorEl;
    this._missionSparklePreset = preset;
  }

  /** Show a gentle breathing pre-warning before the real hint fires. */
  setSoftPulseMove(move) {
    if (!this._hintFx) return;
    this._hintFx.setSoftPulse(move || null);
  }

  clearHint() {
    if (!this._hintFx) return;
    this._hintFx.clear();
  }

  _logicalSize() {
    const c = this._canvas;
    const lw = parseInt(c.dataset.logicalW || "", 10);
    const lh = parseInt(c.dataset.logicalH || "", 10);
    if (lw > 0 && lh > 0 && c.width > 0 && c.height > 0) {
      return { w: lw, h: lh, dpr: c.width / lw };
    }
    return { w: c.width, h: c.height, dpr: 1 };
  }

  /**
   * @param {number} W
   * @param {number} H
   */
  syncPixelBuffer(W, H) {
    const c = this._canvas;
    const dpr =
      typeof window !== "undefined" && window.devicePixelRatio
        ? Math.min(window.devicePixelRatio, 2)
        : 1;
    c.dataset.logicalW = String(W);
    c.dataset.logicalH = String(H);
    this._renderer.setPixelRatio(dpr);
    this._renderer.setSize(W, H, false);
    c.dataset.dpr = String(c.width / W);
    this._composer.setPixelRatio(dpr);
    this._composer.setSize(W, H);
    this._resizeCamera(W, H);
  }

  _resizeCamera(W, H) {
    const halfW = W / 2;
    const halfH = H / 2;
    this._camera.left = -halfW;
    this._camera.right = halfW;
    this._camera.top = halfH;
    this._camera.bottom = -halfH;
    this._camera.updateProjectionMatrix();
  }

  _canvasCenterToWorld(cx, cy, W, H) {
    return { x: cx - W / 2, y: H / 2 - cy };
  }

  getBoardGeometry(W, H, rows, cols) {
    const k = W / 360;
    const m = Math.max(8, Math.round(11 * k));
    const outerR = Math.max(14, Math.round(22 * k));
    const inset = Math.max(8, Math.round(11 * k));
    const innerR = Math.max(12, Math.round(16 * k));
    const fx = m;
    const fy = m;
    const fw = W - m * 2;
    const fh = H - m * 2;
    const ix = fx + inset;
    const iy = fy + inset;
    const iw = fw - inset * 2;
    const ih = fh - inset * 2;
    const pad = Math.max(4, Math.round(7 * k));
    const hudH = Math.max(36, Math.round(44 * k));
    const boardTop = iy + hudH;
    const boardHAvail = Math.max(ih - hudH, pad * 4);
    const cs = Math.min(
      (iw - pad * 2) / cols,
      (boardHAvail - pad * 2) / rows
    );
    const ox = ix + (iw - cs * cols) / 2;
    const oy =
      boardTop +
      (boardHAvail - pad * 2 - cs * rows) / 2 +
      pad;
    return {
      cs,
      ox,
      oy,
      frame: { x: fx, y: fy, w: fw, h: fh, r: outerR },
      inner: { x: ix, y: iy, w: iw, h: ih, r: innerR },
      hudBand: { x: ix, y: iy, w: iw, h: hudH },
    };
  }

  _gemColorIndex(tileType) {
    const ML = typeof MatchLogic !== "undefined" ? MatchLogic : null;
    if (ML && ML.isSpecialHorizontal(tileType)) {
      return tileType - ML.SPECIAL_H_BASE;
    }
    if (ML && ML.isSpecialVertical(tileType)) {
      return tileType - ML.SPECIAL_V_BASE;
    }
    return tileType % TILE_THEMES.length;
  }

  _spawnOffsetForCell(state, r, c) {
    const arr = state.spawnAnimations;
    if (!arr || !arr.length) return 0;
    let best = null;
    for (let i = 0; i < arr.length; i++) {
      const s = arr[i];
      if (s.r === r && s.c === c) {
        if (!best || s.startMs >= best.startMs) {
          best = s;
        }
      }
    }
    if (!best) return 0;
    return spawnRowOffsetCells(best.startMs, best.durMs);
  }

  _computeScreenShake(shakeUntilMs) {
    if (!shakeUntilMs) return { x: 0, y: 0 };
    const now = performance.now();
    if (now >= shakeUntilMs) return { x: 0, y: 0 };
    const remGuess = Math.max(0, shakeUntilMs - now);
    const total = remGuess > 260 ? 480 : 220;
    const rem = Math.max(0, shakeUntilMs - now);
    const peakAmp = total >= 480 ? 7.2 : 5.2;
    const amp = peakAmp * (rem / total);
    return {
      x: (Math.random() - 0.5) * 2 * amp,
      y: (Math.random() - 0.5) * 2 * amp,
    };
  }

  _computeComboFx(comboFeedback) {
    if (!comboFeedback || !comboFeedback.untilMs) {
      return { bloom: this._baseBloomStrength, x: 0, y: 0 };
    }
    const now = performance.now();
    if (now >= comboFeedback.untilMs) {
      return { bloom: this._baseBloomStrength, x: 0, y: 0 };
    }
    const rem = comboFeedback.untilMs - now;
    const dur = 650;
    const t = Math.max(0, Math.min(1, rem / dur));
    const amp = (comboFeedback.boost || 0.22) * 3.5 * t;
    return {
      bloom: this._baseBloomStrength + (comboFeedback.boost || 0.22) * t,
      x: (Math.random() - 0.5) * 2 * amp,
      y: (Math.random() - 0.5) * 2 * amp,
    };
  }

  _syncStripeOverlay(stripeGroup, stripeMats, tileType, gw, gh) {
    const ML = typeof MatchLogic !== "undefined" ? MatchLogic : null;
    for (let i = 0; i < stripeGroup.children.length; i++) {
      stripeGroup.children[i].visible = false;
    }
    if (
      !ML ||
      (!ML.isSpecialHorizontal(tileType) && !ML.isSpecialVertical(tileType))
    ) {
      return;
    }
    const theme = TILE_THEMES[this._gemColorIndex(tileType) % TILE_THEMES.length];
    const rgb = _hexToRgb(theme.mid);
    const col = new THREE.Color(rgb.r / 255, rgb.g / 255, rgb.b / 255);
    const pulse = 0.55 + 0.45 * Math.sin(this._renderNowMs * 0.008);
    const op = 0.35 + 0.35 * pulse;
    const t = this._renderNowMs * 0.0014;
    if (ML.isSpecialHorizontal(tileType)) {
      for (let k = 0; k < 2; k++) {
        const p = /** @type {THREE.Mesh} */ (stripeGroup.children[k]);
        p.visible = true;
        p.scale.set(gw * 0.82, gh * 0.09, 1);
        p.position.set(
          Math.sin(t + k) * gw * 0.02,
          (k === 0 ? 0.18 : -0.18) * gh,
          0.02
        );
        stripeMats[k].color.copy(col);
        stripeMats[k].opacity = op;
      }
    } else {
      for (let k = 0; k < 2; k++) {
        const p = /** @type {THREE.Mesh} */ (stripeGroup.children[k]);
        p.visible = true;
        p.scale.set(gw * 0.09, gh * 0.82, 1);
        p.position.set(
          (k === 0 ? -0.18 : 0.18) * gw,
          Math.cos(t + k) * gh * 0.02,
          0.02
        );
        stripeMats[k].color.copy(col);
        stripeMats[k].opacity = op;
      }
    }
  }

  _ensureEmissiveBase(material) {
    if (!material || typeof material !== "object") return 0;
    if (!material.userData) material.userData = {};
    if (typeof material.userData.baseEmissiveIntensity !== "number") {
      material.userData.baseEmissiveIntensity =
        typeof material.emissiveIntensity === "number"
          ? material.emissiveIntensity
          : 0;
    }
    return material.userData.baseEmissiveIntensity;
  }

  _ensurePickedMaterial(entry) {
    if (entry.pickedMaterial) {
      entry.mesh.material = entry.pickedMaterial;
      return entry.pickedMaterial;
    }
    const sharedMaterial = entry.sharedMaterial || entry.mesh.material;
    if (!sharedMaterial || typeof sharedMaterial.clone !== "function") {
      return entry.mesh.material;
    }
    const pickedMaterial = sharedMaterial.clone();
    entry.pickedMaterial = pickedMaterial;
    entry.mesh.material = pickedMaterial;
    this._ensureEmissiveBase(pickedMaterial);
    return pickedMaterial;
  }

  _restoreSharedMaterial(entry) {
    if (entry.releaseCleanupTween) {
      entry.releaseCleanupTween.kill();
      entry.releaseCleanupTween = null;
    }
    const pickedMaterial = entry.pickedMaterial;
    if (pickedMaterial) {
      entry.mesh.material = entry.sharedMaterial || entry.mesh.material;
      if (typeof pickedMaterial.dispose === "function") {
        pickedMaterial.dispose();
      }
      entry.pickedMaterial = null;
    } else if (entry.sharedMaterial && entry.mesh.material !== entry.sharedMaterial) {
      entry.mesh.material = entry.sharedMaterial;
    }
  }

  _applyGemPickState(entry, isPicked) {
    const { group, mesh } = entry;
    const material = isPicked
      ? this._ensurePickedMaterial(entry)
      : entry.pickedMaterial || mesh.material;
    const baseEmissive = this._ensureEmissiveBase(material);
    if (entry.isPicked === isPicked) return;

    // Aynı objede üst üste binmiş scale/position/emissive tween'lerini temizle.
    gsap.killTweensOf(group.scale);
    gsap.killTweensOf(group.rotation);
    gsap.killTweensOf(mesh.position);
    if (material && typeof material.emissiveIntensity === "number") {
      gsap.killTweensOf(material);
    }
    if (entry.jiggleScaleTween) {
      entry.jiggleScaleTween.kill();
      entry.jiggleScaleTween = null;
    }
    if (entry.jiggleRotateTween) {
      entry.jiggleRotateTween.kill();
      entry.jiggleRotateTween = null;
    }
    if (entry.releaseCleanupTween) {
      entry.releaseCleanupTween.kill();
      entry.releaseCleanupTween = null;
    }

    if (isPicked) {
      group.renderOrder = Number.POSITIVE_INFINITY;
      gsap.to(group.scale, {
        x: 1.2,
        y: 1.2,
        duration: 0.13,
        ease: "back.out(2.2)",
        overwrite: true,
        onComplete: () => {
          entry.jiggleScaleTween = gsap.to(group.scale, {
            duration: 0.07,
            repeat: -1,
            yoyo: true,
            repeatRefresh: true,
            ease: "sine.inOut",
            x: () => 1.2 + gsap.utils.random(-0.025, 0.025),
            y: () => 1.2 + gsap.utils.random(-0.025, 0.025),
            overwrite: false,
          });
          entry.jiggleRotateTween = gsap.to(group.rotation, {
            duration: 0.055,
            repeat: -1,
            yoyo: true,
            repeatRefresh: true,
            ease: "sine.inOut",
            z: () => gsap.utils.random(-0.05, 0.05),
            overwrite: false,
          });
        },
      });
      gsap.to(mesh.position, {
        z: 2,
        duration: 0.13,
        ease: "back.out(1.8)",
        overwrite: true,
      });
      if (material && typeof material.emissiveIntensity === "number") {
        gsap.to(material, {
          emissiveIntensity: baseEmissive * 5,
          duration: 0.08,
          ease: "power3.out",
          overwrite: true,
        });
      }
    } else {
      gsap.to(group.scale, {
        x: 1,
        y: 1,
        duration: 0.2,
        ease: "power2.out",
        overwrite: true,
      });
      gsap.to(group.rotation, {
        z: 0,
        duration: 0.2,
        ease: "power2.out",
        overwrite: true,
      });
      gsap.to(mesh.position, {
        z: 0,
        duration: 0.2,
        ease: "power2.out",
        overwrite: true,
      });
      if (material && typeof material.emissiveIntensity === "number") {
        gsap.to(material, {
          emissiveIntensity: baseEmissive,
          duration: 0.2,
          ease: "power2.out",
          overwrite: true,
          onComplete: () => {
            if (!entry.isPicked) {
              this._restoreSharedMaterial(entry);
            }
          },
        });
      } else {
        this._restoreSharedMaterial(entry);
      }
      entry.releaseCleanupTween = gsap.delayedCall(0.2, () => {
        if (!entry.isPicked) {
          group.renderOrder = 0;
        }
      });
    }

    entry.isPicked = isPicked;
  }

  _placeGemEntry(
    geo,
    W,
    H,
    tileType,
    floatRow,
    floatCol,
    extraRowCells,
    pixelOffset,
    scaleMul,
    highlight,
    dragLift
  ) {
    if (tileType < 0) return null;
    const { cs, ox, oy } = geo;
    const row = floatRow + (extraRowCells || 0);
    const px = pixelOffset && pixelOffset.x ? pixelOffset.x : 0;
    const py = pixelOffset && pixelOffset.y ? pixelOffset.y : 0;
    let cx;
    let cy;
    if (dragLift) {
      cx = ox + floatCol * cs + cs / 2 + px;
      cy = oy + row * cs + cs / 2 + py;
    } else {
      const gx = ox + floatCol * cs + px;
      const gy = oy + row * cs + py;
      cx = gx + cs / 2;
      cy = gy + cs / 2;
    }
    const inset = cs * 0.1;
    const gw = cs - inset * 2;
    const gh = cs - inset * 2;
    const sc = scaleMul && scaleMul > 0 ? scaleMul : 1;
    const pickedState = !!(highlight || dragLift);

    if (this._poolIndex >= this._pool.length) {
      if (!this._gemPoolExhaustLogged) {
        this._gemPoolExhaustLogged = true;
        console.warn(
          "[match3] Taş havuzu yetmedi; bazı hücreler boş görünebilir (pool büyütüldü, yine olursa bildir)."
        );
      }
      return null;
    }
    const entry = this._pool[this._poolIndex++];
    const { group, mesh, stripe, stripeMats } = entry;
    const ci = this._gemColorIndex(tileType);
    const theme = TILE_THEMES[ci % TILE_THEMES.length];

    const mat =
      this._texMaterials[ci] != null
        ? this._texMaterials[ci]
        : this._solidMaterials[ci];
    entry.sharedMaterial = mat;
    if (!entry.isPicked) {
      mesh.material = mat;
      if (entry.pickedMaterial) {
        this._restoreSharedMaterial(entry);
      }
    }

    const pos = this._canvasCenterToWorld(cx, cy, W, H);
    const liftZ = dragLift ? 4.5 : pickedState ? 1.2 : 0;
    group.position.set(pos.x, pos.y, liftZ);
    group.renderOrder = entry.isPicked || pickedState ? Number.POSITIVE_INFINITY : 0;
    group.visible = true;

    mesh.scale.set(gw * sc, gh * sc, 1);
    mesh.position.x = 0;
    mesh.position.y = 0;

    this._selectionFx.syncEntry(entry, {
      isSelected: pickedState,
      isDragging: !!dragLift,
      width: gw,
      height: gh,
      theme,
      nowMs: this._renderNowMs,
    });

    this._syncStripeOverlay(stripe, stripeMats, tileType, gw, gh);

    this._applyGemPickState(entry, pickedState);
    return entry;
  }

  _updateCells(geo, rows, cols, cells, empty, W, H) {
    const { cs, ox, oy } = geo;
    const gap = Math.max(2, cs * 0.042);
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const m = this._cellMeshes[idx++];
        const gx = ox + c * cs + gap * 0.5;
        const gy = oy + r * cs + gap * 0.5;
        const s = cs - gap;
        const t = cells[r][c];
        const cx = gx + s / 2;
        const cy = gy + s / 2;
        const wpos = this._canvasCenterToWorld(cx, cy, W, H);
        m.position.set(wpos.x, wpos.y, -0.5);
        m.scale.set(s, s, 1);
        m.visible = true;
        const mat = /** @type {THREE.MeshBasicMaterial} */ (m.material);
        if (t === empty) {
          mat.color.setHex(0x1a1430);
          mat.opacity = 0.72;
        } else {
          mat.color.setHex(0x261c44);
          mat.opacity = 0.85;
        }
      }
    }
    for (; idx < this._cellMeshes.length; idx++) {
      this._cellMeshes[idx].visible = false;
    }
  }

  _updateFlash(geo, flashAnim, cells, empty, W, H) {
    let fi = 0;
    if (flashAnim && flashAnim.keys.length) {
      const peak = 1 - flashAnim.p;
      const { cs, ox, oy } = geo;
      if (peak > 0) {
        for (let i = 0; i < flashAnim.keys.length; i++) {
          const [r, c] = flashAnim.keys[i].split(",").map(Number);
          const gx = ox + c * cs;
          const gy = oy + r * cs;
          const cx = gx + cs / 2;
          const cy = gy + cs / 2;
          const wpos = this._canvasCenterToWorld(cx, cy, W, H);
          const fm = this._flashMeshes[fi++];
          if (!fm) break;
          fm.visible = true;
          fm.position.set(wpos.x, wpos.y, 2);
          fm.scale.set(cs * 0.92, cs * 0.92, 1);
          const tt = cells[r][c];
          const ci = tt !== empty ? this._gemColorIndex(tt) : 0;
          const th = TILE_THEMES[ci % TILE_THEMES.length];
          fm.material.color.setHex(hexToNum(th.hi));
          fm.material.opacity = peak * 0.72;
        }
      }
    }
    for (; fi < this._flashMeshes.length; fi++) {
      this._flashMeshes[fi].visible = false;
    }
  }

  _updateMissionSparkle(now, geo) {
    if (!this._missionSparkleUntilMs || now >= this._missionSparkleUntilMs) {
      for (let i = 0; i < this._missionSparkleMeshes.length; i++) {
        this._missionSparkleMeshes[i].visible = false;
      }
      return;
    }

    const { w: W, h: H } = this._logicalSize();
    let center = { x: 0, y: 0 };
    if (
      this._missionSparkleAnchorEl &&
      typeof this._missionSparkleAnchorEl.getBoundingClientRect === "function"
    ) {
      const cRect = this._canvas.getBoundingClientRect();
      const aRect = this._missionSparkleAnchorEl.getBoundingClientRect();
      const cx = aRect.left + aRect.width * 0.5;
      const cy = aRect.top + aRect.height * 0.52;
      const relX = ((cx - cRect.left) / Math.max(1, cRect.width)) * W;
      const relY = ((cy - cRect.top) / Math.max(1, cRect.height)) * H;
      center = this._canvasCenterToWorld(relX, relY, W, H);
    }

    const total = Math.max(1, this._missionSparkleUntilMs - this._missionSparkleStartMs);
    const t = Math.min(1, Math.max(0, (now - this._missionSparkleStartMs) / total));
    const alpha = 1 - t;
    const missionPreset = this._missionSparklePreset === "mission-box";
    const activeCount = missionPreset ? 28 : 20;
    const baseRadius = missionPreset ? 0.9 : 1.5;
    const growRadius = missionPreset ? 2.2 : 3.6;
    const radius = geo.cs * (baseRadius + growRadius * t);
    for (let i = 0; i < this._missionSparkleMeshes.length; i++) {
      const m = this._missionSparkleMeshes[i];
      if (i >= activeCount) {
        m.visible = false;
        continue;
      }
      const phase = (i / this._missionSparkleMeshes.length) * Math.PI * 2;
      const drift = Math.sin(now * (missionPreset ? 0.019 : 0.012) + i) * geo.cs * (missionPreset ? 0.11 : 0.08);
      m.visible = true;
      m.position.set(
        center.x + Math.cos(phase) * (radius + drift),
        center.y + Math.sin(phase) * (radius + drift),
        3
      );
      const s = geo.cs * ((missionPreset ? 0.065 : 0.07) + (1 - t) * (missionPreset ? 0.095 : 0.08));
      m.scale.set(s, s, 1);
      if (missionPreset) {
        m.material.color.setHex(i % 3 === 0 ? 0xb6ff7d : i % 2 === 0 ? 0xffe47a : 0x8fffd4);
        m.material.opacity = 0.42 * alpha;
      } else {
        m.material.color.setHex(0xc8fff2);
        m.material.opacity = 0.34 * alpha;
      }
    }
  }

  _syncGameOverDom(state) {
    const layer = document.getElementById("gameOverLayer");
    if (!layer) return;
    const hidden = !state.gameOver;
    layer.hidden = hidden;
    layer.setAttribute("aria-hidden", hidden ? "true" : "false");
    if (!hidden) {
      const sc = layer.querySelector("[data-go-score]");
      const lv = layer.querySelector("[data-go-level]");
      const hi = layer.querySelector("[data-go-high]");
      if (sc) sc.textContent = String(state.score);
      if (lv) lv.textContent = String(state.level || 1);
      if (hi) hi.textContent = String(state.highScore || 0);
    }
  }

  _syncLevelUpDom(state) {
    const toast = document.getElementById("levelUpToast");
    if (!toast) return;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if ((state.levelUpUntilMs || 0) > now) {
      if (!toast.classList.contains("is-visible")) {
        toast.classList.remove("is-visible");
        void toast.offsetWidth;
        toast.classList.add("is-visible");
      }
      toast.setAttribute("aria-hidden", "false");
    } else {
      toast.classList.remove("is-visible");
      toast.setAttribute("aria-hidden", "true");
    }
  }

  _syncComboDom(state) {
    const toast = document.getElementById("comboToast");
    if (!toast) return;
    const feedback = state.comboFeedback || null;
    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (feedback && (feedback.labelKey || feedback.label) && (feedback.untilMs || 0) > now) {
      const label = feedback.labelKey && globalThis.LanguageManager
        ? globalThis.LanguageManager.t(feedback.labelKey)
        : feedback.label;
      const nextText = feedback.multiplier > 1
        ? label + " x" + String(feedback.multiplier)
        : label;
      const stamp = String(feedback.untilMs || 0);
      if (toast.textContent !== nextText) {
        toast.textContent = nextText;
      }
      if (toast.dataset.comboStamp !== stamp) {
        toast.dataset.comboStamp = stamp;
        toast.classList.remove("is-visible");
        void toast.offsetWidth;
        toast.classList.add("is-visible");
      }
      toast.setAttribute("aria-hidden", "false");
    } else {
      toast.classList.remove("is-visible");
      toast.setAttribute("aria-hidden", "true");
    }
  }

  _bindGameOverOnce() {
    const layer = document.getElementById("gameOverLayer");
    if (!layer || layer.dataset.boundThree === "1") return;
    layer.dataset.boundThree = "1";
    const fire = () => {
      if (typeof this._onRestart === "function") {
        this._onRestart();
      }
    };
    layer.addEventListener("click", fire);
    layer.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        fire();
      },
      { passive: false }
    );
  }

  /**
   * @param {*} state GameManager.buildRenderState çıktısı
   */
  render(state) {
    this._bindGameOverOnce();
    this._syncGameOverDom(state);
    this._syncLevelUpDom(state);
    this._syncComboDom(state);

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    this._lastRenderTime = now;
    this._renderNowMs = now;

    const { w: W, h: H } = this._logicalSize();

    const {
      rows,
      cols,
      cells,
      empty,
      selection,
      swapAnim,
      fallAnim,
      flashAnim,
      shakeUntilMs,
      particleBurst,
      dragTileOffset,
      comboFeedback,
    } = state;

    if (particleBurst && particleBurst.nonce !== this._lastBurstNonce) {
      this._lastBurstNonce = particleBurst.nonce;
      this._burstRedrawUntil = now + 450;
    }

    const geo = this.getBoardGeometry(W, H, rows, cols);
    const shake = this._computeScreenShake(shakeUntilMs || 0);
    const comboFx = this._computeComboFx(comboFeedback);
    let dragSparkle = null;

    if (this._ambience) {
      this._ambience.update(
        geo,
        rows,
        cols,
        W,
        H,
        (cx, cy) => this._canvasCenterToWorld(cx, cy, W, H),
        now
      );
    }

    this._root.position.set(shake.x + comboFx.x, -(shake.y + comboFx.y), 0);
    this._bloomPass.strength = comboFx.bloom;

    this._updateCells(geo, rows, cols, cells, empty, W, H);

    for (let p = 0; p < this._pool.length; p++) {
      this._pool[p].group.visible = false;
    }
    this._poolIndex = 0;
    this._gemPoolExhaustLogged = false;
    this._renderedEntriesByKey.clear();

    const skipStatic = new Set();
    if (swapAnim) {
      skipStatic.add(swapAnim.ar + "," + swapAnim.ac);
      skipStatic.add(swapAnim.br + "," + swapAnim.bc);
    }
    if (fallAnim) {
      for (let i = 0; i < fallAnim.moves.length; i++) {
        skipStatic.add(fallAnim.moves[i].fromR + "," + fallAnim.moves[i].c);
      }
    }
    if (dragTileOffset) {
      skipStatic.add(dragTileOffset.ar + "," + dragTileOffset.ac);
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (skipStatic.has(r + "," + c)) continue;
        const t = cells[r][c];
        if (t === empty) continue;
        const hi = selection && selection.r === r && selection.c === c;
        const sp = this._spawnOffsetForCell(state, r, c);
        let sm = 1;
        if (hi) sm = 1.07;
        const entry = this._placeGemEntry(
          geo,
          W,
          H,
          t,
          r,
          c,
          sp,
          undefined,
          sm,
          hi,
          false
        );
        if (entry) {
          this._renderedEntriesByKey.set(r + "," + c, entry);
        }
      }
    }

    if (swapAnim) {
      const e = ease(swapAnim.p);
      const rowA = swapAnim.ar + (swapAnim.br - swapAnim.ar) * e;
      const colA = swapAnim.ac + (swapAnim.bc - swapAnim.ac) * e;
      const rowB = swapAnim.br + (swapAnim.ar - swapAnim.br) * e;
      const colB = swapAnim.bc + (swapAnim.ac - swapAnim.bc) * e;
      this._placeGemEntry(
        geo,
        W,
        H,
        swapAnim.va,
        rowA,
        colA,
        0,
        undefined,
        1,
        false,
        false
      );
      this._placeGemEntry(
        geo,
        W,
        H,
        swapAnim.vb,
        rowB,
        colB,
        0,
        undefined,
        1,
        false,
        false
      );
    }

    if (fallAnim) {
      const e = ease(fallAnim.p);
      const order = fallAnim.moves.slice().sort(function (a, b) {
        const fa = a.fromR + (a.toR - a.fromR) * e;
        const fb = b.fromR + (b.toR - b.fromR) * e;
        return fa - fb;
      });
      for (let i = 0; i < order.length; i++) {
        const m = order[i];
        const fr = m.fromR + (m.toR - m.fromR) * e;
        this._placeGemEntry(
          geo,
          W,
          H,
          m.t,
          fr,
          m.c,
          0,
          undefined,
          1,
          false,
          false
        );
      }
    }

    if (dragTileOffset) {
      const dr = dragTileOffset.ar;
      const dc = dragTileOffset.ac;
      const tDrag = cells[dr][dc];
      if (tDrag !== empty) {
        const hiDrag =
          selection && selection.r === dr && selection.c === dc;
        const spD = this._spawnOffsetForCell(state, dr, dc);
        this._placeGemEntry(
          geo,
          W,
          H,
          tDrag,
          dr,
          dc,
          spD,
          { x: dragTileOffset.dx, y: dragTileOffset.dy },
          1,
          hiDrag,
          true
        );
        const theme = TILE_THEMES[this._gemColorIndex(tDrag) % TILE_THEMES.length];
        const baseX = geo.ox + dc * geo.cs + geo.cs / 2 + dragTileOffset.dx;
        const baseY = geo.oy + dr * geo.cs + geo.cs / 2 + dragTileOffset.dy;
        const world = this._canvasCenterToWorld(baseX, baseY, W, H);
        dragSparkle = {
          worldX: world.x,
          worldY: world.y,
          color: theme.hi,
          size: geo.cs,
        };
      }
    }

    this._updateFlash(geo, flashAnim, cells, empty, W, H);
    this._updateMissionSparkle(now, geo);
    if (this._hintFx) {
      this._hintFx.sync(this._renderedEntriesByKey);
    }
    this._selectionFx.updateFrame({
      geo,
      rows,
      cols,
      selectionActive: !!selection,
      dragInfo: dragSparkle,
      nowMs: now,
      canvasToWorld: (cx, cy) => this._canvasCenterToWorld(cx, cy, W, H),
    });

    this._composer.render();
  }

  hasActiveJuice(shakeUntilMs, comboFeedback) {
    if (shakeUntilMs && performance.now() < shakeUntilMs) return true;
    if (comboFeedback && comboFeedback.untilMs && performance.now() < comboFeedback.untilMs) {
      return true;
    }
    if (this._burstRedrawUntil && performance.now() < this._burstRedrawUntil) {
      return true;
    }
    if (this._selectionFx && this._selectionFx.hasActiveFx()) {
      return true;
    }
    if (this._hintFx && this._hintFx.hasActiveFx()) {
      return true;
    }
    if (this._missionSparkleUntilMs && performance.now() < this._missionSparkleUntilMs) {
      return true;
    }
    return false;
  }

  clearJuice() {
    this._lastBurstNonce = -1;
    this._burstRedrawUntil = 0;
    this._gemPoolExhaustLogged = false;
  }
}

globalThis.BoardThreeView = BoardThreeView;
