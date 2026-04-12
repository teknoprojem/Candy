/**
 * GridManager — yalnızca ızgara yapısı ve taşların konumları (hücre değerleri).
 * Eşleşme kuralları, rastgele tip üretimi ve girdi burada yoktur.
 *
 * swap / applyGravity çağrıları GameManager tarafından yönetilir; animasyon
 * ve girdi kilidi üst katmanda (animating) tutulur.
 */
(function (global) {
  "use strict";

  /** Boş / silinmiş hücre göstergesi */
  const EMPTY = -1;

  class GridManager {
    /**
     * @param {number} rows
     * @param {number} cols
     */
    constructor(rows, cols) {
      this.rows = rows;
      this.cols = cols;
      /** @type {number[][]} */
      this._cells = [];
      this._allocateEmpty();
    }

    static get EMPTY() {
      return EMPTY;
    }

    _allocateEmpty() {
      this._cells = [];
      for (let r = 0; r < this.rows; r++) {
        this._cells[r] = [];
        for (let c = 0; c < this.cols; c++) {
          this._cells[r][c] = EMPTY;
        }
      }
    }

    /** Tüm hücreleri boşaltır (yeni el öncesi tahta yapısı). */
    resetEmpty() {
      this._allocateEmpty();
    }

    isInside(r, c) {
      return r >= 0 && r < this.rows && c >= 0 && c < this.cols;
    }

    isEmpty(r, c) {
      return this._cells[r][c] === EMPTY;
    }

    get(r, c) {
      return this._cells[r][c];
    }

    set(r, c, tileId) {
      this._cells[r][c] = tileId;
    }

    /**
     * İki hücredeki taşların konumlarını değiştirir.
     * @param {{ r: number; c: number }} a
     * @param {{ r: number; c: number }} b
     */
    swap(a, b) {
      const t = this.get(a.r, a.c);
      this.set(a.r, a.c, this.get(b.r, b.c));
      this.set(b.r, b.c, t);
    }

    /**
     * Sütun bazında taşları aşağı kaydırır; boşluklar (EMPTY) üstte toplanır.
     */
    applyGravity() {
      for (let c = 0; c < this.cols; c++) {
        let write = this.rows - 1;
        for (let r = this.rows - 1; r >= 0; r--) {
          if (this._cells[r][c] !== EMPTY) {
            this._cells[write][c] = this._cells[r][c];
            write--;
          }
        }
        for (let r = write; r >= 0; r--) {
          this._cells[r][c] = EMPTY;
        }
      }
    }

    /**
     * Her EMPTY hücre için `fillFn(r, c)` ile yeni taş tipi yazar.
     * @param {(r: number, c: number) => number} fillFn
     */
    fillEmpty(fillFn) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          if (this._cells[r][c] === EMPTY) {
            this._cells[r][c] = fillFn(r, c);
          }
        }
      }
    }
  }

  global.GridManager = GridManager;
})(typeof window !== "undefined" ? window : globalThis);
