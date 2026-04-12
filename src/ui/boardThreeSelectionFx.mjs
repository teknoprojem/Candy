import * as THREE from "three";

const SELECTION_FX_PRESETS = {
  minimal: {
    dimOthers: false,
    sparkleTrail: false,
  },
  premium: {
    dimOthers: true,
    sparkleTrail: true,
  },
};

const DEFAULT_SELECTION_FX_MODE = "premium";

class BoardThreeSelectionFxController {
  /**
   * @param {THREE.Group} root
   * @param {{ dimOthers: boolean; sparkleTrail: boolean }} profile
   */
  constructor(root, profile) {
    this._root = root;
    this._profile = profile;
    this._lastSparkleMs = 0;

    this._dimmer = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        color: 0x06070d,
        transparent: true,
        opacity: 0,
        depthTest: false,
      })
    );
    this._dimmer.visible = false;
    this._dimmer.renderOrder = 70;
    this._root.add(this._dimmer);

    this._sparkleGroup = new THREE.Group();
    this._sparkleGroup.renderOrder = 90;
    this._root.add(this._sparkleGroup);
    this._sparkles = [];
    this._activeSparkles = [];
    const sparkleGeo = new THREE.CircleGeometry(0.5, 18);
    for (let i = 0; i < 28; i++) {
      const sparkle = new THREE.Mesh(
        sparkleGeo,
        new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthTest: false,
        })
      );
      sparkle.visible = false;
      sparkle.renderOrder = 91;
      this._sparkleGroup.add(sparkle);
      this._sparkles.push(sparkle);
    }
    this._sparkleCursor = 0;
  }

  createHaloMesh() {
    const halo = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 28),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthTest: false,
      })
    );
    halo.visible = false;
    halo.renderOrder = 6;
    return halo;
  }

  syncEntry(entry, options) {
    const { ring, halo } = entry;
    const { isSelected, isDragging, width, height, theme, nowMs } = options;
    const pulse = 0.5 + 0.5 * Math.sin(nowMs * 0.01);

    ring.visible = isSelected;
    if (ring.visible) {
      const outlineSize = Math.min(width, height) * 1.08;
      ring.scale.set(outlineSize, outlineSize, 1);
      ring.position.set(0, 0, 0.04);
      ring.material.color.setHex(this._hexToNum(theme.hi));
      ring.material.opacity = 0.78 + pulse * 0.16;
    }

    halo.visible = isSelected;
    if (halo.visible) {
      halo.position.set(0, -height * 0.08, -0.04);
      halo.scale.set(width * 1.34, height * 0.76, 1);
      halo.material.color.setHex(this._hexToNum(theme.mid));
      halo.material.opacity = isDragging ? 0.34 + pulse * 0.08 : 0.26 + pulse * 0.06;
    }
  }

  updateFrame(options) {
    const {
      geo,
      rows,
      cols,
      selectionActive,
      dragInfo,
      nowMs,
      canvasToWorld,
    } = options;

    if (this._profile.dimOthers && selectionActive) {
      const width = geo.cs * cols;
      const height = geo.cs * rows;
      const centerX = geo.ox + width / 2;
      const centerY = geo.oy + height / 2;
      const world = canvasToWorld(centerX, centerY);
      this._dimmer.visible = true;
      this._dimmer.position.set(world.x, world.y, 0.85);
      this._dimmer.scale.set(width, height, 1);
      this._dimmer.material.opacity = 0.14;
    } else {
      this._dimmer.visible = false;
      this._dimmer.material.opacity = 0;
    }

    if (this._profile.sparkleTrail && dragInfo) {
      this._spawnSparkles(dragInfo, nowMs);
    }
    this._updateSparkles(nowMs);
  }

  hasActiveFx() {
    return this._activeSparkles.length > 0;
  }

  _spawnSparkles(dragInfo, nowMs) {
    if (nowMs - this._lastSparkleMs < 28) return;
    this._lastSparkleMs = nowMs;
    for (let i = 0; i < 2; i++) {
      const sparkle = this._sparkles[this._sparkleCursor];
      this._sparkleCursor = (this._sparkleCursor + 1) % this._sparkles.length;
      const driftX = (Math.random() - 0.5) * dragInfo.size * 0.28;
      const driftY = (Math.random() - 0.5) * dragInfo.size * 0.22;
      sparkle.visible = true;
      sparkle.position.set(
        dragInfo.worldX + driftX,
        dragInfo.worldY + driftY,
        2.6
      );
      sparkle.scale.set(dragInfo.size * 0.12, dragInfo.size * 0.12, 1);
      sparkle.material.color.setHex(this._hexToNum(dragInfo.color));
      sparkle.material.opacity = 0.9;
      this._activeSparkles.push({
        mesh: sparkle,
        bornMs: nowMs,
        lifeMs: 180 + Math.random() * 70,
        velX: (Math.random() - 0.5) * dragInfo.size * 0.04,
        velY: (-0.4 - Math.random() * 0.5) * dragInfo.size * 0.03,
        spin: (Math.random() - 0.5) * 0.18,
      });
    }
  }

  _updateSparkles(nowMs) {
    const next = [];
    for (let i = 0; i < this._activeSparkles.length; i++) {
      const item = this._activeSparkles[i];
      const t = (nowMs - item.bornMs) / item.lifeMs;
      if (t >= 1) {
        item.mesh.visible = false;
        item.mesh.material.opacity = 0;
        item.mesh.rotation.z = 0;
        continue;
      }
      const fade = 1 - t;
      item.mesh.position.x += item.velX;
      item.mesh.position.y += item.velY;
      item.mesh.rotation.z += item.spin;
      const scale = item.mesh.scale.x * (0.96 + fade * 0.02);
      item.mesh.scale.set(scale, scale, 1);
      item.mesh.material.opacity = 0.85 * fade;
      next.push(item);
    }
    this._activeSparkles = next;
  }

  _hexToNum(hex) {
    return parseInt(String(hex).replace("#", ""), 16);
  }
}

export function createBoardSelectionFx(root, mode = DEFAULT_SELECTION_FX_MODE) {
  const profile = SELECTION_FX_PRESETS[mode] || SELECTION_FX_PRESETS.premium;
  return new BoardThreeSelectionFxController(root, profile);
}

export { DEFAULT_SELECTION_FX_MODE, SELECTION_FX_PRESETS };
