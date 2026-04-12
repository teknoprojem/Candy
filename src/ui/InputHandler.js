/**
 * InputHandler — pointer; merkez kilitleme, eksen kilidi, komşuya snap, bırakınca geri yay.
 */
(function (global) {
  "use strict";

  const AXIS_LOCK_SLOP = 12;
  const DRAG_START_SLIP = 5;
  const SNAP_FRAC_LOW = 0.38;
  const SNAP_FRAC_HIGH = 0.52;
  const COMMIT_FRAC = 0.42;
  const MAX_PULL_FRAC = 0.92;

  function smoothstep01(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
  }

  /**
   * @param {number} d
   * @param {number} cs
   */
  function snapAxis1D(d, cs) {
    const cap = cs * MAX_PULL_FRAC;
    let out = Math.max(-cap, Math.min(cap, d));
    const ad = Math.abs(out);
    const low = SNAP_FRAC_LOW * cs;
    const high = SNAP_FRAC_HIGH * cs;
    if (ad <= low) return out;
    const target = Math.sign(out) * cs;
    const u = smoothstep01((ad - low) / Math.max(high - low, 1));
    return out + (target - out) * u;
  }

  class InputHandler {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{
     *   rows: number;
     *   cols: number;
     *   cellSize: number;
     *   originX?: number;
     *   originY?: number;
     *   logicalWidth?: number;
     *   logicalHeight?: number;
     * }} metrics
     * @param {{
     *   onSwapAttempt: (a: {r:number;c:number}, b: {r:number;c:number}, dragMeta?: { dx: number; dy: number }) => void;
     *   onSelectionChanged?: () => void;
    *   onInteractionStart?: () => void;
     *   onDragOffset?: (null | { ar: number; ac: number; dx: number; dy: number }) => void;
     *   onDragSnapBack?: (ar: number, ac: number, dx: number, dy: number) => void;
     * }} handlers
     */
    constructor(canvas, metrics, handlers) {
      this._canvas = canvas;
      this._rows = metrics.rows;
      this._cols = metrics.cols;
      this._cellSize = metrics.cellSize;
      this._originX = metrics.originX ?? 0;
      this._originY = metrics.originY ?? 0;
      this._logicalW =
        metrics.logicalWidth != null ? metrics.logicalWidth : canvas.width;
      this._logicalH =
        metrics.logicalHeight != null ? metrics.logicalHeight : canvas.height;
      this._onSwapAttempt = handlers.onSwapAttempt;
      this._onSelectionChanged = handlers.onSelectionChanged || function () {};
      this._onInteractionStart = handlers.onInteractionStart || function () {};
      this._onDragOffset = handlers.onDragOffset || function () {};
      this._onDragSnapBack =
        typeof handlers.onDragSnapBack === "function"
          ? handlers.onDragSnapBack
          : function () {};
      /** @type {{ r: number; c: number } | null} */
      this._selected = null;
      this._enabled = true;

      /** @type {number | null} */
      this._activePointerId = null;
      /** @type {{ r: number; c: number } | null} */
      this._anchorCell = null;
      /** @type {{ x: number; y: number } | null} */
      this._startClient = null;
      /** @type {{ x: number; y: number } | null} */
      this._lastClient = null;
      /** @type {null | 'h' | 'v'} */
      this._lockAxis = null;
      /** @type {{ x: number; y: number } | null} */
      this._anchorCenterLogical = null;
      /** @type {boolean} */
      this._hadMeaningfulDrag = false;
      /** @type {{ dx: number; dy: number }} */
      this._lastOffset = { dx: 0, dy: 0 };

      this._onPointerDown = this._handlePointerDown.bind(this);
      this._onPointerMove = this._handlePointerMove.bind(this);
      this._onPointerUp = this._handlePointerEnd.bind(this);
      this._onPointerCancel = this._handlePointerEnd.bind(this);

      canvas.addEventListener("pointerdown", this._onPointerDown);
      canvas.addEventListener("pointermove", this._onPointerMove, {
        passive: false,
      });
      canvas.addEventListener("pointerup", this._onPointerUp);
      canvas.addEventListener("pointercancel", this._onPointerCancel);
      canvas.addEventListener("pointerleave", this._onPointerLeave);
    }

    /** @param {PointerEvent} ev */
    _onPointerLeave = (ev) => {
      if (ev.pointerId !== this._activePointerId) return;
      this._lastClient = { x: ev.clientX, y: ev.clientY };
    };

    destroy() {
      this._endPointerSession();
      this._onDragOffset(null);
      this._canvas.removeEventListener("pointerdown", this._onPointerDown);
      this._canvas.removeEventListener("pointermove", this._onPointerMove);
      this._canvas.removeEventListener("pointerup", this._onPointerUp);
      this._canvas.removeEventListener("pointercancel", this._onPointerCancel);
      this._canvas.removeEventListener("pointerleave", this._onPointerLeave);
    }

    setEnabled(value) {
      this._enabled = value;
      if (!value) {
        this._endPointerSession();
        this._selected = null;
        this._onDragOffset(null);
        this._onSelectionChanged();
      }
    }

    getSelection() {
      return this._selected;
    }

    clearSelection() {
      this._selected = null;
      this._onSelectionChanged();
    }

    /**
     * @param {{
     *   rows: number;
     *   cols: number;
     *   cellSize: number;
     *   originX?: number;
     *   originY?: number;
     *   logicalWidth?: number;
     *   logicalHeight?: number;
     * }} metrics
     */
    updateMetrics(metrics) {
      if (metrics.rows != null) this._rows = metrics.rows;
      if (metrics.cols != null) this._cols = metrics.cols;
      if (metrics.cellSize != null) this._cellSize = metrics.cellSize;
      if (metrics.originX != null) this._originX = metrics.originX;
      if (metrics.originY != null) this._originY = metrics.originY;
      if (metrics.logicalWidth != null) {
        this._logicalW = metrics.logicalWidth;
      }
      if (metrics.logicalHeight != null) {
        this._logicalH = metrics.logicalHeight;
      }
    }

    _pickCell(clientX, clientY) {
      const rect = this._canvas.getBoundingClientRect();
      const x =
        (clientX - rect.left) * (this._logicalW / rect.width) - this._originX;
      const y =
        (clientY - rect.top) * (this._logicalH / rect.height) - this._originY;
      const c = Math.floor(x / this._cellSize);
      const r = Math.floor(y / this._cellSize);
      if (r < 0 || r >= this._rows || c < 0 || c >= this._cols) return null;
      return { r, c };
    }

    _clientDeltaToCanvas(x1, y1, x2, y2) {
      const rect = this._canvas.getBoundingClientRect();
      return {
        dx: (x2 - x1) * (this._logicalW / rect.width),
        dy: (y2 - y1) * (this._logicalH / rect.height),
      };
    }

    _cellCenterLogical(r, c) {
      const cs = this._cellSize;
      return {
        x: this._originX + (c + 0.5) * cs,
        y: this._originY + (r + 0.5) * cs,
      };
    }

    /**
     * Parmak hareketinden eksen kilidi + snap; dönüş hücre merkezine göre ofset (px).
     */
    _computeDragOffset(rawDx, rawDy) {
      const cs = this._cellSize;
      const mag = Math.hypot(rawDx, rawDy);
      if (!this._lockAxis && mag >= AXIS_LOCK_SLOP) {
        this._lockAxis =
          Math.abs(rawDx) >= Math.abs(rawDy) ? "h" : "v";
      }

      let ddx = rawDx;
      let ddy = rawDy;
      if (this._lockAxis === "h") {
        ddy = 0;
        ddx = snapAxis1D(ddx, cs);
      } else if (this._lockAxis === "v") {
        ddx = 0;
        ddy = snapAxis1D(ddy, cs);
      } else {
        const k = 0.88;
        ddx *= k;
        ddy *= k;
      }

      return { dx: ddx, dy: ddy };
    }

    /**
     * @param {{ r: number; c: number }} anchor
     * @param {number} odx merkez ofseti
     * @param {number} ody
     */
    _neighborFromOffset(anchor, odx, ody) {
      const cs = this._cellSize;
      if (this._lockAxis === "h") {
        if (Math.abs(odx) < COMMIT_FRAC * cs) return null;
        const dc = odx > 0 ? 1 : -1;
        const tc = anchor.c + dc;
        const tr = anchor.r;
        if (tr < 0 || tr >= this._rows || tc < 0 || tc >= this._cols) {
          return null;
        }
        return { r: tr, c: tc };
      }
      if (this._lockAxis === "v") {
        if (Math.abs(ody) < COMMIT_FRAC * cs) return null;
        const dr = ody > 0 ? 1 : -1;
        const tr = anchor.r + dr;
        const tc = anchor.c;
        if (tr < 0 || tr >= this._rows || tc < 0 || tc >= this._cols) {
          return null;
        }
        return { r: tr, c: tc };
      }
      return null;
    }

    _isAdjacent(a, b) {
      return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
    }

    _endPointerSession() {
      const id = this._activePointerId;
      if (id != null) {
        try {
          const cap = this._canvas.hasPointerCapture;
          if (typeof cap === "function" && cap.call(this._canvas, id)) {
            this._canvas.releasePointerCapture(id);
          }
        } catch (e) {
          /* ignore */
        }
      }
      this._activePointerId = null;
      this._anchorCell = null;
      this._startClient = null;
      this._lastClient = null;
      this._lockAxis = null;
      this._anchorCenterLogical = null;
      this._hadMeaningfulDrag = false;
      this._lastOffset = { dx: 0, dy: 0 };
    }

    /**
     * @param {PointerEvent} ev
     */
    _handlePointerDown(ev) {
      if (!this._enabled) return;
      if (ev.pointerType === "mouse" && ev.button !== 0) return;

      const cell = this._pickCell(ev.clientX, ev.clientY);
      if (!cell) return;

      this._activePointerId = ev.pointerId;
      this._anchorCell = cell;
      this._startClient = { x: ev.clientX, y: ev.clientY };
      this._lastClient = { x: ev.clientX, y: ev.clientY };
      this._lockAxis = null;
      this._anchorCenterLogical = this._cellCenterLogical(cell.r, cell.c);
      this._hadMeaningfulDrag = false;
      this._lastOffset = { dx: 0, dy: 0 };
      this._onInteractionStart();

      try {
        this._canvas.setPointerCapture(ev.pointerId);
      } catch (e) {
        /* ignore */
      }

      if (ev.pointerType !== "mouse") {
        ev.preventDefault();
      }
    }

    /**
     * @param {PointerEvent} ev
     */
    _handlePointerMove(ev) {
      if (!this._enabled || ev.pointerId !== this._activePointerId) return;
      if (!this._startClient || !this._anchorCell) return;

      this._lastClient = { x: ev.clientX, y: ev.clientY };

      const delta = this._clientDeltaToCanvas(
        this._startClient.x,
        this._startClient.y,
        ev.clientX,
        ev.clientY
      );
      const mag = Math.hypot(delta.dx, delta.dy);
      if (mag < DRAG_START_SLIP) {
        this._onDragOffset(null);
        return;
      }

      const { dx, dy } = this._computeDragOffset(delta.dx, delta.dy);
      this._lastOffset = { dx, dy };
      this._hadMeaningfulDrag = true;

      this._onDragOffset({
        ar: this._anchorCell.r,
        ac: this._anchorCell.c,
        dx,
        dy,
      });

      if (mag > 6) {
        ev.preventDefault();
      }
    }

    /**
     * @param {PointerEvent} ev
     */
    _handlePointerEnd(ev) {
      if (ev.pointerId !== this._activePointerId) return;

      const anchor = this._anchorCell;
      const start = this._startClient;
      const lastDrag = { dx: this._lastOffset.dx, dy: this._lastOffset.dy };
      const hadDrag = this._hadMeaningfulDrag;

      try {
        const cap = this._canvas.hasPointerCapture;
        if (typeof cap === "function" && cap.call(this._canvas, ev.pointerId)) {
          this._canvas.releasePointerCapture(ev.pointerId);
        }
      } catch (e) {
        /* ignore */
      }

      this._activePointerId = null;
      this._anchorCell = null;
      this._startClient = null;
      this._lastClient = null;

      if (!this._enabled || !anchor || !start) {
        this._onDragOffset(null);
        this._lockAxis = null;
        this._hadMeaningfulDrag = false;
        this._lastOffset = { dx: 0, dy: 0 };
        return;
      }

      const endX = ev.clientX;
      const endY = ev.clientY;
      const delta = this._clientDeltaToCanvas(
        start.x,
        start.y,
        endX,
        endY
      );
      const rawMag = Math.hypot(delta.dx, delta.dy);
      const finalOff =
        rawMag >= DRAG_START_SLIP
          ? this._computeDragOffset(delta.dx, delta.dy)
          : { dx: lastDrag.dx, dy: lastDrag.dy };

      this._onDragOffset(null);

      if (hadDrag) {
        const neighbor = this._neighborFromOffset(
          anchor,
          finalOff.dx,
          finalOff.dy
        );
        if (neighbor) {
          ev.preventDefault();
          this._selected = null;
          this._onSwapAttempt(anchor, neighbor, {
            dx: finalOff.dx,
            dy: finalOff.dy,
          });
          this._onSelectionChanged();
        } else {
          this._onDragSnapBack(anchor.r, anchor.c, finalOff.dx, finalOff.dy);
          this._onSelectionChanged();
        }
        this._lockAxis = null;
        this._anchorCenterLogical = null;
        this._hadMeaningfulDrag = false;
        this._lastOffset = { dx: 0, dy: 0 };
        return;
      }

      this._lockAxis = null;
      this._anchorCenterLogical = null;
      this._hadMeaningfulDrag = false;
      this._lastOffset = { dx: 0, dy: 0 };

      const endCell = this._pickCell(endX, endY);
      this._processPick(endCell, anchor);
    }

    /**
     * @param {{ r: number; c: number } | null} cell
     * @param {{ r: number; c: number } | null} [fallbackCell]
     */
    _processPick(cell, fallbackCell) {
      const target = cell || fallbackCell;
      if (!target) return;

      if (!this._selected) {
        this._selected = { r: target.r, c: target.c };
        this._onSelectionChanged();
        return;
      }

      if (this._selected.r === target.r && this._selected.c === target.c) {
        this._selected = null;
        this._onSelectionChanged();
        return;
      }

      if (this._isAdjacent(this._selected, target)) {
        const a = this._selected;
        this._selected = null;
        this._onSwapAttempt(a, target, undefined);
        this._onSelectionChanged();
      } else {
        this._selected = { r: target.r, c: target.c };
        this._onSelectionChanged();
      }
    }
  }

  global.InputHandler = InputHandler;
})(typeof window !== "undefined" ? window : globalThis);
