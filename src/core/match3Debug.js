/**
 * Geliştirici logları ve ızgara doğrulama.
 * Açmak için: URL'ye ?debug=1 ekleyin veya localStorage.match3Debug = "1"
 */
(function (global) {
  "use strict";

  let _seq = 0;

  global.Match3Debug = {
    enabled() {
      try {
        if (
          typeof location !== "undefined" &&
          location.search &&
          new URLSearchParams(location.search).get("debug") === "1"
        ) {
          return true;
        }
        if (
          typeof localStorage !== "undefined" &&
          localStorage.getItem("match3Debug") === "1"
        ) {
          return true;
        }
      } catch (e) {
        /* ignore */
      }
      return false;
    },

    nextSeq() {
      return ++_seq;
    },

    log() {
      if (!this.enabled()) return;
      const args = Array.prototype.slice.call(arguments);
      args.unshift("[match3]");
      console.log.apply(console, args);
    },

    warn() {
      if (!this.enabled()) return;
      const args = Array.prototype.slice.call(arguments);
      args.unshift("[match3]");
      console.warn.apply(console, args);
    },

    /**
     * Yerçekimi sonrası: üstte taş varken altında boşluk olmamalı (yukarıdan aşağı tara).
     * @param {GridManager} grid
     * @param {number} E
     */
    noFloatUnder(grid, E) {
      const rows = grid.rows;
      const cols = grid.cols;
      for (let c = 0; c < cols; c++) {
        let seenTile = false;
        for (let r = 0; r < rows; r++) {
          const v = grid.get(r, c);
          if (v !== E) {
            seenTile = true;
          } else if (seenTile) {
            return {
              ok: false,
              col: c,
              row: r,
              msg: "EMPTY cell under stacked tiles (gravity hole)",
            };
          }
        }
      }
      return { ok: true };
    },

    /** @param {GridManager} grid */
    dumpGrid(grid, E) {
      const lines = [];
      for (let r = 0; r < grid.rows; r++) {
        const cells = [];
        for (let c = 0; c < grid.cols; c++) {
          const v = grid.get(r, c);
          cells.push(v === E ? "." : String(v));
        }
        lines.push("r" + r + " " + cells.join(" "));
      }
      return lines.join("\n");
    },
  };
})(typeof window !== "undefined" ? window : globalThis);
