/**
 * requestAnimationFrame ile sabit zaman adımı; GameManager animasyon sürücüsü.
 */
(function (global) {
  "use strict";

  /**
   * @param {(dtSec: number, nowMs: number) => boolean} onStep true = devam
   * @returns {{ start: () => void; stop: () => void; get running(): boolean }}
   */
  function createRafLoop(onStep) {
    let rafId = null;
    let active = false;
    let lastMs = 0;

    function frame(nowMs) {
      if (!active) return;
      if (!lastMs) lastMs = nowMs;
      const dtSec = Math.min((nowMs - lastMs) / 1000, 0.064);
      lastMs = nowMs;
      const cont = onStep(dtSec, nowMs);
      if (cont && active) {
        rafId = requestAnimationFrame(frame);
      } else {
        active = false;
        rafId = null;
        lastMs = 0;
      }
    }

    return {
      start() {
        if (active) return;
        active = true;
        lastMs = 0;
        rafId = requestAnimationFrame(frame);
      },
      stop() {
        active = false;
        if (rafId != null) cancelAnimationFrame(rafId);
        rafId = null;
        lastMs = 0;
      },
      get running() {
        return active;
      },
    };
  }

  global.createRafLoop = createRafLoop;
})(typeof window !== "undefined" ? window : globalThis);
