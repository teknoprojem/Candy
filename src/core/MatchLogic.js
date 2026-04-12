/**
 * MatchLogic — eşleşme tespiti; 4'lü yatay/dikey özel taş (şerit) üretimi.
 */
(function (global) {
  "use strict";

  const EMPTY = () =>
    typeof GridManager !== "undefined" ? GridManager.EMPTY : -1;

  /** Normal taş renkleri 0..MAX (dâhil). Yatay şerit: 100+renk, dikey: 110+renk. */
  const SPECIAL_H_BASE = 100;
  const SPECIAL_V_BASE = 110;
  const MAX_NORMAL_COLOR = 4;

  class MatchLogic {
    static get SPECIAL_H_BASE() {
      return SPECIAL_H_BASE;
    }
    static get SPECIAL_V_BASE() {
      return SPECIAL_V_BASE;
    }
    static get MAX_NORMAL_COLOR() {
      return MAX_NORMAL_COLOR;
    }

    static isSpecialHorizontal(t) {
      return (
        t >= SPECIAL_H_BASE && t <= SPECIAL_H_BASE + MAX_NORMAL_COLOR
      );
    }
    static isSpecialVertical(t) {
      return (
        t >= SPECIAL_V_BASE && t <= SPECIAL_V_BASE + MAX_NORMAL_COLOR
      );
    }
    static encodeStripedHorizontal(color) {
      return SPECIAL_H_BASE + Number(color);
    }
    static encodeStripedVertical(color) {
      return SPECIAL_V_BASE + Number(color);
    }

    cellKey(r, c) {
      return r + "," + c;
    }

    /** Eşleşme rengi (normal 0..MAX_NORMAL_COLOR, şeritler alt renk). */
    matchColor(v) {
      const E = EMPTY();
      if (v == null || v === E) {
        return -1;
      }
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n === E) {
        return -1;
      }
      if (
        n >= SPECIAL_H_BASE &&
        n <= SPECIAL_H_BASE + MAX_NORMAL_COLOR
      ) {
        return n - SPECIAL_H_BASE;
      }
      if (
        n >= SPECIAL_V_BASE &&
        n <= SPECIAL_V_BASE + MAX_NORMAL_COLOR
      ) {
        return n - SPECIAL_V_BASE;
      }
      if (n <= MAX_NORMAL_COLOR) {
        return n;
      }
      return -1;
    }

    _sameMatchCell(grid, r1, c1, r2, c2) {
      const E = EMPTY();
      const a = grid.get(r1, c1);
      const b = grid.get(r2, c2);
      if (a === E || b === E) return false;
      const ca = this.matchColor(a);
      const cb = this.matchColor(b);
      if (ca < 0 || cb < 0) return false;
      return ca === cb;
    }

    wouldFormImmediateTriple(grid, r, c, t) {
      const col = this.matchColor(t);
      if (col < 0) return false;
      if (
        c >= 2 &&
        this.matchColor(grid.get(r, c - 1)) === col &&
        this.matchColor(grid.get(r, c - 2)) === col
      ) {
        return true;
      }
      if (
        r >= 2 &&
        this.matchColor(grid.get(r - 1, c)) === col &&
        this.matchColor(grid.get(r - 2, c)) === col
      ) {
        return true;
      }
      return false;
    }

    /**
     * @returns {{
     *   cellsToClear: Set<string>;
     *   specialCreates: { r: number; c: number; kind: "h" | "v"; color: number }[];
     *   flashKeys: Set<string>;
     *   matchCount: number;
     * }}
     */
    findMatches(grid) {
      const E = EMPTY();
      const cellsToClear = new Set();
      const specialCreates = [];
      const flashKeys = new Set();
      let matchCount = 0;
      const anchorReserved = new Set();

      const self = this;

      function flushHorizontal(r, endC, runLen) {
        if (runLen < 3) return;
        matchCount += 1;
        const startC = endC - runLen + 1;
        const positions = [];
        for (let i = 0; i < runLen; i++) {
          positions.push({ r, c: startC + i });
        }
        const color = self.matchColor(grid.get(r, startC));
        if (color < 0) return;

        for (let i = 0; i < positions.length; i++) {
          flashKeys.add(self.cellKey(positions[i].r, positions[i].c));
        }

        if (runLen >= 4) {
          const anchor = positions[Math.floor(runLen / 2)];
          const ak = self.cellKey(anchor.r, anchor.c);
          if (!anchorReserved.has(ak)) {
            anchorReserved.add(ak);
            specialCreates.push({
              r: anchor.r,
              c: anchor.c,
              kind: "h",
              color,
            });
            for (let i = 0; i < positions.length; i++) {
              const p = positions[i];
              if (p.r === anchor.r && p.c === anchor.c) continue;
              cellsToClear.add(self.cellKey(p.r, p.c));
            }
          } else {
            for (let i = 0; i < positions.length; i++) {
              cellsToClear.add(
                self.cellKey(positions[i].r, positions[i].c)
              );
            }
          }
        } else {
          for (let i = 0; i < positions.length; i++) {
            cellsToClear.add(
              self.cellKey(positions[i].r, positions[i].c)
            );
          }
        }
      }

      function flushVertical(c, endR, runLen) {
        if (runLen < 3) return;
        matchCount += 1;
        const startR = endR - runLen + 1;
        const positions = [];
        for (let i = 0; i < runLen; i++) {
          positions.push({ r: startR + i, c });
        }
        const color = self.matchColor(grid.get(startR, c));
        if (color < 0) return;

        for (let i = 0; i < positions.length; i++) {
          flashKeys.add(self.cellKey(positions[i].r, positions[i].c));
        }

        if (runLen >= 4) {
          const anchor = positions[Math.floor(runLen / 2)];
          const ak = self.cellKey(anchor.r, anchor.c);
          if (!anchorReserved.has(ak)) {
            anchorReserved.add(ak);
            specialCreates.push({
              r: anchor.r,
              c: anchor.c,
              kind: "v",
              color,
            });
            for (let i = 0; i < positions.length; i++) {
              const p = positions[i];
              if (p.r === anchor.r && p.c === anchor.c) continue;
              cellsToClear.add(self.cellKey(p.r, p.c));
            }
          } else {
            for (let i = 0; i < positions.length; i++) {
              cellsToClear.add(
                self.cellKey(positions[i].r, positions[i].c)
              );
            }
          }
        } else {
          for (let i = 0; i < positions.length; i++) {
            cellsToClear.add(
              self.cellKey(positions[i].r, positions[i].c)
            );
          }
        }
      }

      for (let r = 0; r < grid.rows; r++) {
        let run = 1;
        for (let c = 1; c <= grid.cols; c++) {
          const same =
            c < grid.cols &&
            this._sameMatchCell(grid, r, c, r, c - 1) &&
            grid.get(r, c) !== E;
          if (same) {
            run++;
          } else {
            flushHorizontal(r, c - 1, run);
            run = 1;
          }
        }
      }

      for (let c = 0; c < grid.cols; c++) {
        let run = 1;
        for (let r = 1; r <= grid.rows; r++) {
          const same =
            r < grid.rows &&
            this._sameMatchCell(grid, r, c, r - 1, c) &&
            grid.get(r, c) !== E;
          if (same) {
            run++;
          } else {
            flushVertical(c, r - 1, run);
            run = 1;
          }
        }
      }

      return { cellsToClear, specialCreates, flashKeys, matchCount };
    }
  }

  global.MatchLogic = MatchLogic;
})(typeof window !== "undefined" ? window : globalThis);
