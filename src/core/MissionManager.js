(function (global) {
  "use strict";

  const TYPE_COUNT = 5;
  const BASE_GOAL = 15;

  const ICONS_BY_TYPE = {
    0: "🍓",
    1: "🍎",
    2: "🍐",
    3: "🍃",
    4: "💎",
  };

  const ICON_IMAGE_BY_TYPE = {
    0: "assets/gems/pembe_ejder.png",
  };

  function toInt(n, fallback) {
    if (!Number.isFinite(n)) return fallback;
    return Math.floor(n);
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function missionForLevel(level) {
    const lvl = Math.max(1, toInt(level, 1));
    const type = (lvl - 1) % TYPE_COUNT;
    const tier = Math.floor((lvl - 1) / TYPE_COUNT);
    const goal = BASE_GOAL + tier * 3 + (type % 2);
    return {
      level: lvl,
      type: type,
      goal: goal,
      icon: ICONS_BY_TYPE[type] || "⭐",
      iconImage: ICON_IMAGE_BY_TYPE[type] || null,
    };
  }

  class MissionManager {
    constructor(options) {
      const o = options || {};
      this._onUpdate = typeof o.onUpdate === "function" ? o.onUpdate : function () {};
      this._onComplete = typeof o.onComplete === "function" ? o.onComplete : function () {};
      this._state = {
        level: 1,
        type: 0,
        goal: BASE_GOAL,
        collected: 0,
        icon: ICONS_BY_TYPE[0],
        iconImage: ICON_IMAGE_BY_TYPE[0] || null,
        completed: false,
      };
    }

    setMissionForLevel(level, savedProgress) {
      const base = missionForLevel(level);
      const s = {
        level: base.level,
        type: base.type,
        goal: base.goal,
        collected: 0,
        icon: base.icon,
        iconImage: base.iconImage,
        completed: false,
      };

      if (
        savedProgress &&
        toInt(savedProgress.level, -1) === s.level &&
        toInt(savedProgress.type, -1) === s.type &&
        toInt(savedProgress.goal, -1) === s.goal
      ) {
        const c = clamp(toInt(savedProgress.collected, 0), 0, s.goal);
        s.collected = c;
        s.completed = c >= s.goal;
      }

      this._state = s;
      this._onUpdate(this.getState());
      if (this._state.completed) {
        this._onComplete(this.getState());
      }
      return this.getState();
    }

    updateProgress(type, count) {
      const s = this._state;
      if (!s || s.completed) return this.getState();
      const t = toInt(type, -1);
      const inc = Math.max(0, toInt(count, 0));
      if (inc <= 0 || t !== s.type) return this.getState();

      const before = s.collected;
      s.collected = clamp(s.collected + inc, 0, s.goal);
      s.completed = s.collected >= s.goal;
      if (s.collected !== before) {
        this._onUpdate(this.getState());
      }
      if (s.completed && before < s.goal) {
        this._onComplete(this.getState());
      }
      return this.getState();
    }

    isMissionComplete() {
      return !!(this._state && this._state.completed);
    }

    getState() {
      const s = this._state;
      return {
        level: s.level,
        type: s.type,
        goal: s.goal,
        collected: s.collected,
        remaining: Math.max(0, s.goal - s.collected),
        icon: s.icon,
        iconImage: s.iconImage || null,
        completed: s.completed,
      };
    }

    getSaveState() {
      const s = this._state;
      return {
        level: s.level,
        type: s.type,
        goal: s.goal,
        collected: s.collected,
      };
    }
  }

  global.MissionManager = MissionManager;
})(typeof window !== "undefined" ? window : globalThis);
