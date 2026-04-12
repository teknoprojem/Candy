/**
 * Yerçekimi öncesi sütun bazında dikey hareket planı (ızgara henüz mutate edilmez).
 */
(function (global) {
  "use strict";

  /** @param {GridManager} grid */
  function planGravityMoves(grid) {
    const moves = [];
    const E = GridManager.EMPTY;
    const rows = grid.rows;
    const cols = grid.cols;

    for (let c = 0; c < cols; c++) {
      const stack = [];
      for (let r = rows - 1; r >= 0; r--) {
        const t = grid.get(r, c);
        if (t !== E) stack.push({ r, t });
      }
      for (let i = 0; i < stack.length; i++) {
        const destR = rows - 1 - i;
        const fromR = stack[i].r;
        if (fromR !== destR) {
          moves.push({
            fromR,
            toR: destR,
            c,
            t: stack[i].t,
          });
        }
      }
    }
    return moves;
  }

  global.planGravityMoves = planGravityMoves;
  global.easeOutQuad = function easeOutQuad(t) {
    return 1 - (1 - t) * (1 - t);
  };
})(typeof window !== "undefined" ? window : globalThis);
