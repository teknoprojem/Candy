import { gsap } from "https://unpkg.com/gsap@3.12.5/index.js";

class BoardThreeHintFxController {
  constructor() {
    this._keys = [];
    this._mode = "none"; // none | soft | full
    this._aggressive = false;
    this._aggressiveUntilMs = 0;
    this._aggressiveMaxMs = 3600;
    this._animatedEntries = new Map();
    this._releaseUntilMs = 0;
    this._softPromoteTimerId = null;
    this._softPromoteDelayMs = 3500;
  }

  /**
   * Show a subtle breathing pulse on a move's gems — fires before the full hint.
   * Passing null/undefined clears the soft pulse.
   */
  setSoftPulse(move) {
    const nextKeys = move
      ? [this._cellKey(move.a.r, move.a.c), this._cellKey(move.b.r, move.b.c)]
      : [];
    if (
      this._mode === "soft" &&
      nextKeys.length === this._keys.length &&
      nextKeys.every((k, i) => k === this._keys[i])
    ) {
      return;
    }
    this._cancelSoftPromote();
    this._keys = nextKeys;
    this._mode = nextKeys.length ? "soft" : "none";
    this._aggressive = !!(move && move.aggressive);
    this._aggressiveUntilMs = this._aggressive
      ? performance.now() + this._aggressiveMaxMs
      : 0;
    if (this._mode === "soft") {
      const promotedKeys = this._keys.slice();
      this._softPromoteTimerId = setTimeout(() => {
        this._softPromoteTimerId = null;
        if (this._mode !== "soft") return;
        if (
          promotedKeys.length !== this._keys.length ||
          !promotedKeys.every((k, i) => k === this._keys[i])
        ) {
          return;
        }
        this._mode = "full";
      }, this._softPromoteDelayMs);
    }
  }

  /** Upgrade from soft pulse to full hint (auto-clears soft pulse). */
  setHintMove(move) {
    const nextKeys = move
      ? [this._cellKey(move.a.r, move.a.c), this._cellKey(move.b.r, move.b.c)]
      : [];
    this._cancelSoftPromote();
    if (
      this._mode === "full" &&
      nextKeys.length === this._keys.length &&
      nextKeys.every((key, index) => key === this._keys[index])
    ) {
      return;
    }
    this._keys = nextKeys;
    this._mode = nextKeys.length ? "full" : "none";
    this._aggressive = !!(move && move.aggressive);
    this._aggressiveUntilMs = this._aggressive
      ? performance.now() + this._aggressiveMaxMs
      : 0;
  }

  /** Clear everything — both soft pulse and full hint. */
  clear() {
    this._cancelSoftPromote();
    const entries = Array.from(this._animatedEntries.values());
    for (let i = 0; i < entries.length; i++) {
      this._stopEntry(entries[i]);
    }
    this._animatedEntries.clear();
    this._keys = [];
    this._mode = "none";
    this._aggressive = false;
    this._aggressiveUntilMs = 0;
  }

  sync(renderedEntriesByKey) {
    if (
      this._mode === "full" &&
      this._aggressive &&
      performance.now() >= this._aggressiveUntilMs
    ) {
      this._aggressive = false;
      this._aggressiveUntilMs = 0;
    }

    const wanted = new Set(this._keys);
    this._animatedEntries.forEach((entry, key) => {
      if (!wanted.has(key) || renderedEntriesByKey.get(key) !== entry) {
        this._stopEntry(entry);
        this._animatedEntries.delete(key);
      }
    });

    for (let i = 0; i < this._keys.length; i++) {
      const key = this._keys[i];
      const entry = renderedEntriesByKey.get(key);
      if (!entry || entry.isPicked) continue;
      const running = this._animatedEntries.get(key);
      if (running !== entry) {
        if (running) this._stopEntry(running);
        this._startEntry(entry, this._mode, this._aggressive);
        this._animatedEntries.set(key, entry);
        continue;
      }
      if ((entry.hintMode || "none") !== this._mode || !!entry.hintAggressive !== this._aggressive) {
        this._startEntry(entry, this._mode, this._aggressive);
      }
    }
  }

  hasActiveFx() {
    return (
      this._keys.length > 0 ||
      this._animatedEntries.size > 0 ||
      performance.now() < this._releaseUntilMs
    );
  }

  // ─── full hint animations ────────────────────────────────────────────────

  _startEntry(entry, mode, aggressive) {
    // Hard kill — no restore tween, hint animation takes over immediately
    if (entry.hintScaleTween) { entry.hintScaleTween.kill(); entry.hintScaleTween = null; }
    if (entry.hintRotateTween) { entry.hintRotateTween.kill(); entry.hintRotateTween = null; }
    if (entry.hintGlowTween) { entry.hintGlowTween.kill(); entry.hintGlowTween = null; }
    gsap.killTweensOf(entry.group.scale);
    gsap.killTweensOf(entry.group.rotation);
    entry.hintMode = mode || "none";
    entry.hintAggressive = !!aggressive;

    if (mode === "soft") {
      entry.hintScaleTween = gsap.to(entry.group.scale, {
        x: 1.065,
        y: 1.065,
        duration: 0.7,
        ease: "sine.inOut",
        yoyo: true,
        repeat: -1,
      });
      entry.hintRotateTween = null;
      this._restoreHintGlow(entry);
      return;
    }

    entry.hintScaleTween = gsap.to(entry.group.scale, {
      x: 1.14,
      y: 1.14,
      duration: 0.28,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });
    const rotateDuration = aggressive ? 0.09 : 0.18;
    entry.hintRotateTween = gsap.to(entry.group.rotation, {
      z: 0.175,
      duration: rotateDuration,
      ease: "sine.inOut",
      yoyo: true,
      repeat: -1,
    });

    if (aggressive) {
      const glowMat = this._ensureHintGlowMaterial(entry);
      if (glowMat && typeof glowMat.emissiveIntensity === "number") {
        const base = Number.isFinite(entry.hintGlowBase)
          ? entry.hintGlowBase
          : Math.max(0.1, glowMat.emissiveIntensity || 1);
        entry.hintGlowTween = gsap.to(glowMat, {
          emissiveIntensity: base * 2.1,
          duration: 0.18,
          ease: "sine.inOut",
          yoyo: true,
          repeat: -1,
          overwrite: true,
        });
      }
    } else {
      this._restoreHintGlow(entry);
    }
  }

  _stopEntry(entry) {
    if (entry.hintScaleTween) {
      entry.hintScaleTween.kill();
      entry.hintScaleTween = null;
    }
    if (entry.hintRotateTween) {
      entry.hintRotateTween.kill();
      entry.hintRotateTween = null;
    }
    if (entry.hintGlowTween) {
      entry.hintGlowTween.kill();
      entry.hintGlowTween = null;
    }
    entry.hintMode = "none";
    entry.hintAggressive = false;
    this._releaseUntilMs = performance.now() + 160;
    gsap.killTweensOf(entry.group.scale);
    gsap.killTweensOf(entry.group.rotation);
    gsap.to(entry.group.scale, { x: 1, y: 1, duration: 0.14, ease: "power2.out", overwrite: true });
    gsap.to(entry.group.rotation, { z: 0, duration: 0.14, ease: "power2.out", overwrite: true });
    this._restoreHintGlow(entry);
  }

  _cellKey(r, c) {
    return r + "," + c;
  }

  _cancelSoftPromote() {
    if (this._softPromoteTimerId != null) {
      clearTimeout(this._softPromoteTimerId);
      this._softPromoteTimerId = null;
    }
  }

  _ensureHintGlowMaterial(entry) {
    const mesh = entry && entry.mesh;
    if (!mesh || !mesh.material) return null;
    if (entry.hintGlowMaterial && mesh.material === entry.hintGlowMaterial) {
      return entry.hintGlowMaterial;
    }
    const src = mesh.material;
    if (typeof src.emissiveIntensity !== "number") return null;
    const clone = src.clone();
    clone.emissiveIntensity = src.emissiveIntensity;
    entry.hintGlowSourceMaterial = src;
    entry.hintGlowMaterial = clone;
    entry.hintGlowBase = src.emissiveIntensity;
    mesh.material = clone;
    return clone;
  }

  _restoreHintGlow(entry) {
    const mesh = entry && entry.mesh;
    if (!mesh) return;
    if (entry.hintGlowTween) {
      entry.hintGlowTween.kill();
      entry.hintGlowTween = null;
    }
    if (entry.hintGlowMaterial) {
      if (entry.hintGlowSourceMaterial) {
        mesh.material = entry.hintGlowSourceMaterial;
      }
      if (typeof entry.hintGlowMaterial.dispose === "function") {
        entry.hintGlowMaterial.dispose();
      }
      entry.hintGlowMaterial = null;
      entry.hintGlowSourceMaterial = null;
      entry.hintGlowBase = null;
    }
  }
}

export function createBoardHintFx() {
  return new BoardThreeHintFxController();
}
