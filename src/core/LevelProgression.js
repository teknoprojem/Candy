/**
 * LevelProgression - level/target progression with bonus moves.
 */
(function (global) {
  "use strict";

  class LevelProgression {
    constructor(opts) {
      const o = opts || {};
      this.startLevel = Number.isFinite(o.startLevel) ? o.startLevel : 1;
      this.baseTarget = Number.isFinite(o.baseTarget) ? o.baseTarget : 1000;
      this.targetMultiplier = Number.isFinite(o.targetMultiplier)
        ? o.targetMultiplier
        : 1.5;
      this.bonusMovesPerLevel = Number.isFinite(o.bonusMovesPerLevel)
        ? o.bonusMovesPerLevel
        : 5;
      this.currentLevel = this.startLevel;
      this.currentTarget = this.getTargetForLevel(this.startLevel);
    }

    getTargetForLevel(level) {
      const lvl = Math.max(this.startLevel, Math.floor(level));
      let target = this.baseTarget;
      for (let i = this.startLevel; i < lvl; i++) {
        target = Math.ceil(target * this.targetMultiplier);
      }
      return target;
    }

    reset() {
      this.currentLevel = this.startLevel;
      this.currentTarget = this.getTargetForLevel(this.startLevel);
      return {
        level: this.currentLevel,
        target: this.currentTarget,
      };
    }

    syncByScore(totalScore) {
      let leveledUpBy = 0;
      while (totalScore >= this.currentTarget) {
        this.currentLevel += 1;
        this.currentTarget = this.getTargetForLevel(this.currentLevel);
        leveledUpBy += 1;
      }
      return {
        level: this.currentLevel,
        target: this.currentTarget,
        leveledUpBy,
        bonusMoves: leveledUpBy * this.bonusMovesPerLevel,
      };
    }
  }

  global.LevelProgression = LevelProgression;
})(typeof window !== "undefined" ? window : globalThis);
