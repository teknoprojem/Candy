(function (global) {
  "use strict";

  const DEFAULT_IDLE_MS = 5000;
  // Fraction of idleMs at which the soft pre-pulse warning fires (0.5 = halfway)
  const PRE_PULSE_RATIO = 0.5;
  // How many consecutive idle events before "easy-first" adaptive mode activates
  const ADAPTIVE_IDLE_THRESHOLD = 2;

  function cloneBoard(board) {
    return board.map(function (row) {
      return row.slice();
    });
  }

  class HintManager {
    constructor(options) {
      const o = options || {};
      this.idleMs = Number.isFinite(o.idleMs) ? o.idleMs : DEFAULT_IDLE_MS;
      this._getBoard = typeof o.getBoard === "function" ? o.getBoard : null;
      this._onHint = typeof o.onHint === "function" ? o.onHint : function () {};
      this._onClear = typeof o.onClear === "function" ? o.onClear : function () {};
      this._onPreHint =
        typeof o.onPreHint === "function" ? o.onPreHint : function () {};
      this._onShuffleNeeded =
        typeof o.onShuffleNeeded === "function"
          ? o.onShuffleNeeded
          : function () {};
      this._timerId = null;
      this._prePulseTimerId = null;
      this._activeMove = null;
      this._cycleToken = 0;
      // Tracks consecutive idle events; resets when user interacts or game resets
      this._idleCount = 0;
      this._matchLogic = new MatchLogic();
    }

    startTimer() {
      this._schedule(false);
    }

    /** Called on every user interaction — resets idle streak and clears pre-pulse. */
    resetTimer() {
      this._idleCount = 0;
      this.clearHint();
      this._schedule(true);
    }

    stop() {
      this._clearTimers();
      this._idleCount = 0;
      this.clearHint();
    }

    clearHint() {
      this._activeMove = null;
      this._onPreHint(null);
      this._onClear();
    }

    /** Public: find first valid move (used by GameManager for shuffle validation). */
    findPossibleMove(board) {
      if (!Array.isArray(board) || !board.length || !Array.isArray(board[0])) {
        return null;
      }
      const rows = board.length;
      const cols = board[0].length;
      const E = typeof GridManager !== "undefined" ? GridManager.EMPTY : -1;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c] === E) continue;
          if (c + 1 < cols) {
            const move = { a: { r: r, c: c }, b: { r: r, c: c + 1 } };
            if (this._wouldCreateMatch(board, move.a, move.b)) return move;
          }
          if (r + 1 < rows) {
            const move = { a: { r: r, c: c }, b: { r: r + 1, c: c } };
            if (this._wouldCreateMatch(board, move.a, move.b)) return move;
          }
        }
      }
      return null;
    }

    // ─── private ────────────────────────────────────────────────────────────

    _schedule(fromReset) {
      this._clearTimers();
      const token = ++this._cycleToken;
      const preMs = this.idleMs * PRE_PULSE_RATIO;

      // Full hint timer
      this._timerId = setTimeout(() => {
        if (token !== this._cycleToken) return;
        this._timerId = null;
        this._wake();
      }, this.idleMs);

      // Pre-pulse fires at PRE_PULSE_RATIO fraction of the idle window
      this._prePulseTimerId = setTimeout(() => {
        if (token !== this._cycleToken) return;
        this._prePulseTimerId = null;
        this._wakePrePulse();
      }, preMs);

      if (!fromReset) {
        this.clearHint();
      }
    }

    /** Fires halfway through idle — shows soft pulse on the soon-to-be-hinted gems. */
    _wakePrePulse() {
      const board = this._getBoard ? this._getBoard() : null;
      const move = this._findAdaptiveMove(board);
      if (!move) {
        this._onPreHint(null);
        return;
      }
      const metaMove = {
        a: move.a,
        b: move.b,
        aggressive: this._idleCount >= ADAPTIVE_IDLE_THRESHOLD,
      };
      this._onPreHint(metaMove);
    }

    /** Fires at full idle timeout — upgrades soft pulse to full hint (or triggers shuffle). */
    _wake() {
      // Dismiss the pre-pulse visual before showing the real hint
      this._onPreHint(null);
      this._idleCount++;

      const board = this._getBoard ? this._getBoard() : null;
      const move = this._findAdaptiveMove(board);
      if (!move) {
        this._activeMove = null;
        this._onClear();
        this._onShuffleNeeded();
        return;
      }
      this._activeMove = move;
      const metaMove = {
        a: move.a,
        b: move.b,
        aggressive: this._idleCount >= ADAPTIVE_IDLE_THRESHOLD,
      };
      this._onHint(metaMove);
    }

    _clearTimers() {
      if (this._prePulseTimerId != null) {
        clearTimeout(this._prePulseTimerId);
        this._prePulseTimerId = null;
      }
      if (this._timerId != null) {
        clearTimeout(this._timerId);
        this._timerId = null;
      }
    }

    /**
     * Adaptive move selection:
     * - First idle streak (idleCount < ADAPTIVE_IDLE_THRESHOLD): return first valid move (fast).
     * - Repeated idle (idleCount >= threshold): score all moves and return the one
     *   that matches the most cells — making the "easiest / most rewarding" move obvious.
     */
    _findAdaptiveMove(board) {
      if (
        !Array.isArray(board) ||
        !board.length ||
        !Array.isArray(board[0])
      ) {
        return null;
      }
      if (this._idleCount < ADAPTIVE_IDLE_THRESHOLD) {
        return this.findPossibleMove(board);
      }
      // Adaptive: scan all valid moves and pick the highest-scoring one
      const rows = board.length;
      const cols = board[0].length;
      const E = typeof GridManager !== "undefined" ? GridManager.EMPTY : -1;
      let bestMove = null;
      let bestScore = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c] === E) continue;
          const neighbors = [];
          if (c + 1 < cols) neighbors.push({ r: r, c: c + 1 });
          if (r + 1 < rows) neighbors.push({ r: r + 1, c: c });
          for (let n = 0; n < neighbors.length; n++) {
            const nb = neighbors[n];
            const score = this._scoreMoveMatchCount(board, { r: r, c: c }, nb);
            if (score > bestScore) {
              bestScore = score;
              bestMove = { a: { r: r, c: c }, b: nb };
            }
          }
        }
      }
      return bestMove;
    }

    /** Returns how many cells would be matched by swapping a↔b (0 if no match). */
    _scoreMoveMatchCount(board, a, b) {
      const E = typeof GridManager !== "undefined" ? GridManager.EMPTY : -1;
      if (board[a.r][a.c] === E || board[b.r][b.c] === E) return 0;
      const next = cloneBoard(board);
      const t = next[a.r][a.c];
      next[a.r][a.c] = next[b.r][b.c];
      next[b.r][b.c] = t;
      const probeGrid = {
        rows: next.length,
        cols: next[0].length,
        get: function (r, c) { return next[r][c]; },
      };
      const result = this._matchLogic.findMatches(probeGrid);
      return result.flashKeys ? result.flashKeys.size : 0;
    }

    _wouldCreateMatch(board, a, b) {
      return this._scoreMoveMatchCount(board, a, b) > 0;
    }
  }

  global.HintManager = HintManager;
})(typeof window !== "undefined" ? window : globalThis);
