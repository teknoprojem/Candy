/**
 * ComboManager - combo, chain and feedback state for a single move.
 */
(function (global) {
  "use strict";

  const LABEL_KEYS = [
    "",
    "",
    "combo.good",
    "combo.great",
    "combo.amazing",
    "combo.unbelievable",
  ];

  class ComboManager {
    constructor(opts) {
      const o = opts || {};
      this.maxMultiplier = Number.isFinite(o.maxMultiplier) ? o.maxMultiplier : 12;
      this.onFeedback = typeof o.onFeedback === "function" ? o.onFeedback : null;
      this.resetTurn();
    }

    resetTurn() {
      this.chainDepth = 0;
      this.totalMatchGroups = 0;
      this.lastMultiplier = 1;
      this.lastLabel = "";
    }

    beginTurn() {
      this.resetTurn();
    }

    recordMatch(info) {
      const meta = info || {};
      const matchCount = Math.max(1, meta.matchCount | 0);
      const hadStripeBlast = Boolean(meta.hadStripeBlast);

      this.chainDepth += 1;
      this.totalMatchGroups += matchCount;

      const comboRank = Math.max(0, this.totalMatchGroups - 1);
      const chainRank = Math.max(0, this.chainDepth - 1);
      const bonusRank = hadStripeBlast ? 1 : 0;
      const multiplier = Math.min(
        this.maxMultiplier,
        1 + comboRank + chainRank + bonusRank
      );

      this.lastMultiplier = multiplier;
      this.lastLabel = this.getLabel();

      const feedback = {
        multiplier,
        label: this.lastLabel,
        labelKey: this.getLabelKey(),
        chainDepth: this.chainDepth,
        totalMatchGroups: this.totalMatchGroups,
        isCombo: this.totalMatchGroups > 1,
        isChain: this.chainDepth > 1,
        boost: Math.min(1.35, 0.2 + (multiplier - 1) * 0.16),
        durationMs: 650,
      };

      if ((feedback.isCombo || feedback.isChain) && this.onFeedback) {
        this.onFeedback(feedback);
      }

      return feedback;
    }

    getMultiplier() {
      return this.lastMultiplier;
    }

    getLabelKey() {
      const idx = Math.max(0, Math.min(LABEL_KEYS.length - 1, this.lastMultiplier));
      if (LABEL_KEYS[idx]) {
        return LABEL_KEYS[idx];
      }
      if (this.lastMultiplier >= 5) {
        return LABEL_KEYS[LABEL_KEYS.length - 1];
      }
      return "";
    }

    getLabel() {
      const key = this.getLabelKey();
      if (!key) return "";
      if (global.LanguageManager && typeof global.LanguageManager.t === "function") {
        return global.LanguageManager.t(key);
      }
      return key;
    }
  }

  global.ComboManager = ComboManager;
})(typeof window !== "undefined" ? window : globalThis);
