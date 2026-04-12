(function (global) {
  "use strict";

  const STORAGE_KEY = "match3_save_data";
  const SLOT_STORAGE_KEY = "match3_save_slots_v1";
  const SAVE_VERSION = 1;
  const SLOT_COUNT = 3;

  function clearGameState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  function normalizeSlotIndex(slot) {
    const n = Math.floor(Number(slot));
    if (!Number.isFinite(n)) return -1;
    if (n < 1 || n > SLOT_COUNT) return -1;
    return n;
  }

  function isValidGridState(gridState) {
    if (!Array.isArray(gridState) || gridState.length === 0) return false;
    const cols = Array.isArray(gridState[0]) ? gridState[0].length : 0;
    if (cols <= 0) return false;
    for (let r = 0; r < gridState.length; r++) {
      const row = gridState[r];
      if (!Array.isArray(row) || row.length !== cols) return false;
      for (let c = 0; c < row.length; c++) {
        if (!Number.isInteger(row[c])) return false;
      }
    }
    return true;
  }

  function isFiniteNonNegative(n) {
    return Number.isFinite(n) && n >= 0;
  }

  function normalizeMissionProgress(raw) {
    if (!raw || typeof raw !== "object") return null;
    const level = Math.floor(raw.level);
    const type = Math.floor(raw.type);
    const goal = Math.floor(raw.goal);
    const collected = Math.floor(raw.collected);
    if (!isFiniteNonNegative(level)) return null;
    if (!isFiniteNonNegative(type)) return null;
    if (!isFiniteNonNegative(goal) || goal <= 0) return null;
    if (!isFiniteNonNegative(collected)) return null;
    return {
      level: level,
      type: type,
      goal: goal,
      collected: Math.max(0, Math.min(goal, collected)),
    };
  }

  function normalizePayload(raw) {
    if (!raw || typeof raw !== "object") return null;
    if (raw.version !== SAVE_VERSION) return null;
    if (!isValidGridState(raw.gridState)) return null;
    if (!isFiniteNonNegative(raw.currentScore)) return null;
    if (!isFiniteNonNegative(raw.currentMoves)) return null;
    if (!isFiniteNonNegative(raw.currentLevel)) return null;
    if (!isFiniteNonNegative(raw.targetScore)) return null;

    return {
      version: SAVE_VERSION,
      gridState: raw.gridState,
      currentScore: Math.floor(raw.currentScore),
      currentMoves: Math.floor(raw.currentMoves),
      currentLevel: Math.floor(raw.currentLevel),
      targetScore: Math.floor(raw.targetScore),
      currentMissionProgress: normalizeMissionProgress(raw.currentMissionProgress),
      savedAt: Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now(),
    };
  }

  function saveGameState(data) {
    const payload = normalizePayload({
      version: SAVE_VERSION,
      gridState: data && data.gridState,
      currentScore: data && data.currentScore,
      currentMoves: data && data.currentMoves,
      currentLevel: data && data.currentLevel,
      targetScore: data && data.targetScore,
      currentMissionProgress: data && data.currentMissionProgress,
      savedAt: Date.now(),
    });
    if (!payload) return false;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  function loadGameState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const normalized = normalizePayload(parsed);
      if (!normalized) {
        clearGameState();
        return null;
      }
      return normalized;
    } catch (e) {
      clearGameState();
      return null;
    }
  }

  function hasSavedGame() {
    return loadGameState() != null;
  }

  function readSlotArray() {
    try {
      const raw = localStorage.getItem(SLOT_STORAGE_KEY);
      if (!raw) return [null, null, null];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [null, null, null];
      const out = [null, null, null];
      for (let i = 0; i < SLOT_COUNT; i++) {
        out[i] = normalizePayload(parsed[i]);
      }
      return out;
    } catch (e) {
      return [null, null, null];
    }
  }

  function writeSlotArray(arr) {
    try {
      localStorage.setItem(SLOT_STORAGE_KEY, JSON.stringify(arr));
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveSlotGameState(slot, data) {
    const slotIndex = normalizeSlotIndex(slot);
    if (slotIndex < 0) return false;
    const payload = normalizePayload({
      version: SAVE_VERSION,
      gridState: data && data.gridState,
      currentScore: data && data.currentScore,
      currentMoves: data && data.currentMoves,
      currentLevel: data && data.currentLevel,
      targetScore: data && data.targetScore,
      currentMissionProgress: data && data.currentMissionProgress,
      savedAt: Date.now(),
    });
    if (!payload) return false;
    const arr = readSlotArray();
    arr[slotIndex - 1] = payload;
    return writeSlotArray(arr);
  }

  function loadSlotGameState(slot) {
    const slotIndex = normalizeSlotIndex(slot);
    if (slotIndex < 0) return null;
    const arr = readSlotArray();
    return arr[slotIndex - 1] || null;
  }

  function clearSlotGameState(slot) {
    const slotIndex = normalizeSlotIndex(slot);
    if (slotIndex < 0) return false;
    const arr = readSlotArray();
    arr[slotIndex - 1] = null;
    return writeSlotArray(arr);
  }

  function listSlotGameStates() {
    const arr = readSlotArray();
    const list = [];
    for (let i = 0; i < SLOT_COUNT; i++) {
      const s = arr[i];
      list.push({
        slot: i + 1,
        hasData: !!s,
        savedAt: s ? s.savedAt : 0,
        currentLevel: s ? s.currentLevel : 0,
        currentScore: s ? s.currentScore : 0,
        currentMoves: s ? s.currentMoves : 0,
      });
    }
    return list;
  }

  global.SaveManager = {
    saveGameState,
    loadGameState,
    hasSavedGame,
    clearGameState,
    saveSlotGameState,
    loadSlotGameState,
    clearSlotGameState,
    listSlotGameStates,
  };
})(typeof window !== "undefined" ? window : globalThis);
