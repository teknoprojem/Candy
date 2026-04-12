/**
 * Web Audio API ile sentezlenen kısa sesler (dış dosya yok).
 * Tetikleme GameManager’dan; üretim ve routing burada kalır.
 */
(function (global) {
  "use strict";

  class AudioManager {
    constructor() {
      /** @type {AudioContext | null} */
      this._ctx = null;
    }

    _ensureContext() {
      if (this._ctx) {
        return this._ctx;
      }
      const Ctx = global.AudioContext || global.webkitAudioContext;
      if (!Ctx) {
        return null;
      }
      this._ctx = new Ctx();
      return this._ctx;
    }

    _resume() {
      const ctx = this._ensureContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(function () {});
      }
      return ctx;
    }

    /**
     * Taş kayması — kısa, hafif yukarı süpürme.
     */
    playSwipe() {
      const ctx = this._resume();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      const dur = 0.078;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      const g = ctx.createGain();
      osc.connect(g).connect(ctx.destination);

      osc.frequency.setValueAtTime(380, t0);
      osc.frequency.exponentialRampToValueAtTime(920, t0 + dur * 0.55);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.1, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    /**
     * Patlama anı — kısa “pop”.
     */
    playMatch() {
      const ctx = this._resume();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      const dur = 0.062;
      const o1 = ctx.createOscillator();
      o1.type = "triangle";
      const o2 = ctx.createOscillator();
      o2.type = "sine";
      const g = ctx.createGain();
      const m = ctx.createGain();
      o1.connect(m);
      o2.connect(m);
      m.connect(g).connect(ctx.destination);

      o1.frequency.setValueAtTime(340, t0);
      o1.frequency.exponentialRampToValueAtTime(55, t0 + dur);
      o2.frequency.setValueAtTime(520, t0);
      o2.frequency.exponentialRampToValueAtTime(120, t0 + dur * 0.85);

      m.gain.value = 0.55;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      o1.start(t0);
      o2.start(t0);
      o1.stop(t0 + dur + 0.015);
      o2.stop(t0 + dur + 0.015);
    }

    /**
     * Kombo dalgası — çarpan büyüdükçe daha tiz “ding”.
     * @param {number} comboMultiplier o anki puan çarpanı (≥2)
     */
    playCombo(comboMultiplier) {
      const ctx = this._resume();
      if (!ctx) return;

      const mult = Math.max(2, comboMultiplier);
      const step = Math.log2(mult);
      const freq = Math.min(1960, 620 + step * 115);
      const t0 = ctx.currentTime;
      const dur = 0.11;

      const osc = ctx.createOscillator();
      osc.type = "sine";
      const g = ctx.createGain();
      osc.connect(g).connect(ctx.destination);

      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.04, t0 + 0.028);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.92, t0 + dur);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    /**
     * Şerit satır/sütun patlaması — tok, bas ağırlıklı.
     */
    playBigPop() {
      const ctx = this._resume();
      if (!ctx) return;

      const t0 = ctx.currentTime;
      const dur = 0.19;
      const sub = ctx.createOscillator();
      sub.type = "sine";
      const body = ctx.createOscillator();
      body.type = "triangle";
      const g = ctx.createGain();
      sub.connect(g);
      body.connect(g);
      g.connect(ctx.destination);

      sub.frequency.setValueAtTime(128, t0);
      sub.frequency.exponentialRampToValueAtTime(48, t0 + dur);
      body.frequency.setValueAtTime(98, t0);
      body.frequency.exponentialRampToValueAtTime(36, t0 + dur * 0.92);

      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.32, t0 + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      sub.start(t0);
      body.start(t0);
      sub.stop(t0 + dur + 0.03);
      body.stop(t0 + dur + 0.03);
    }
  }

  global.AudioManager = AudioManager;
})(typeof window !== "undefined" ? window : globalThis);
