/**
 * GameManager — oyun akışı; çizim BoardThreeView.render(state) ile (Three.js / WebGL).
 */
(function () {
  "use strict";

  const ROWS = 8;
  const COLS = 8;
  const TYPE_COUNT = 5;
  const START_MOVES = 30;

  const POINTS_PER_TILE = 10;

  const SWAP_DURATION_SEC = 0.22;
  const FLASH_DURATION_SEC = 0.11;
  const FALL_SEC_PER_ROW = 0.055;
  const FALL_MIN_SEC = 0.14;

  /** Yeni taşların üstten bounce ile oturması (ms) */
  const SPAWN_BOUNCE_MS = 300;
  /** Şerit patlamasında ekran sarsıntısı süresi (ms) */
  const SCREEN_SHAKE_MS = 220;
  /** Shuffle sonrası ekran sarsıntısı süresi (ms) */
  const SHUFFLE_SHAKE_MS = 480;

  /** Mantıksal tuval (2× eski 360×640): taşlar daha çok pikselle çizilir, Retina ile birleşince netlik artar. */
  const VIEW_W = 720;
  const VIEW_H = 1280;
  const HIGH_SCORE_KEY = "match3-highscore-v1";
  const START_LEVEL = 1;
  const LEVEL_TARGET_BASE = 1000;
  const LEVEL_TARGET_MULTIPLIER = 1.5;
  const LEVEL_UP_BONUS_MOVES = 5;
  const HINT_IDLE_MS = 5000;
  const MISSION_LEVELUP_MS = 950;
  const AUTO_SAVE_DEBOUNCE_MS = 180;

  const canvas = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const movesEl = document.getElementById("moves");
  const levelEl = document.getElementById("level");
  const targetEl = document.getElementById("target");
  const newBtn = document.getElementById("newGame");
  const menuBtn = document.getElementById("menuBtn");
  const gameOverMenuBtn = document.querySelector("[data-go-menu]");
  const shuffleToastEl = document.getElementById("shuffleToast");
  const missionHudEl = document.getElementById("missionHud");
  const missionIconImgEl = document.getElementById("missionIconImg");
  const missionIconEl = document.getElementById("missionIcon");
  const missionValueEl = document.getElementById("missionValue");
  const missionStartToastEl = document.getElementById("missionStartToast");
  const missionCompleteBadgeEl = document.getElementById("missionCompleteBadge");
  const savedToastEl = document.getElementById("savedToast");

  const boardView = new BoardThreeView(canvas);
  boardView.setRestartHandler(function () {
    if (gameOver) {
      resetGame();
    }
  });
  const audio = new AudioManager();
  const grid = new GridManager(ROWS, COLS);
  const matchLogic = new MatchLogic();
  const comboManager = new ComboManager({
    maxMultiplier: 12,
    onFeedback: handleComboFeedback,
  });
  const progression = new LevelProgression({
    startLevel: START_LEVEL,
    baseTarget: LEVEL_TARGET_BASE,
    targetMultiplier: LEVEL_TARGET_MULTIPLIER,
    bonusMovesPerLevel: LEVEL_UP_BONUS_MOVES,
  });
  const hintManager = new HintManager({
    idleMs: HINT_IDLE_MS,
    getBoard: snapshotCells,
    onPreHint: function (move) {
      // Soft pre-warning pulse: fires at 50% of idle window before the real hint
      boardView.setSoftPulseMove(move);
      draw();
    },
    onHint: function (move) {
      boardView.setHintMove(move);
      draw();
    },
    onClear: function () {
      boardView.clearHint();
      draw();
    },
    onShuffleNeeded: function () {
      reshuffleBoard();
    },
  });
  const missionManager = new MissionManager({
    onUpdate: handleMissionUpdate,
    onComplete: handleMissionComplete,
  });

  let score = 0;
  let movesLeft = START_MOVES;
  let gameOver = false;
  let highScore = readHighScore();
  let currentLevel = START_LEVEL;
  let levelTarget = progression.getTargetForLevel(START_LEVEL);
  let levelUpUntilMs = 0;
  let comboFeedback = null;
  let hasActiveRun = false;
  /** @type {InputHandler | null} */
  let inputHandler = null;

  let animating = false;
  let pendingReshuffle = false;
  /** @type {ReturnType<typeof createRafLoop> | null} */
  let activeAnimLoop = null;

  /** @type {{ ar: number; ac: number; br: number; bc: number; va: number; vb: number; p: number } | null} */
  let swapAnim = null;
  /** @type {{ moves: { fromR: number; toR: number; c: number; t: number }[]; p: number } | null} */
  let fallAnim = null;
  /** @type {{ keys: string[]; p: number } | null} */
  let flashAnim = null;

  /** @type {number} */
  let shakeUntilMs = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let shuffleToastTimerId = null;
  /** @type {null | { nonce: number; cells: { r: number; c: number; t: number }[] }} */
  let particleBurst = null;
  let particleBurstNonce = 0;
  /** @type {{ r: number; c: number; t: number; startMs: number; durMs: number }[]} */
  let spawnAnimations = [];
  let missionPendingLevelUp = false;
  let missionFlowActive = false;
  let missionToastTimerId = null;
  let missionCelebrateTimerId = null;
  let savedToastTimerId = null;
  let autoSaveTimerId = null;

  /** @type {string | null} */
  let lastInputLayoutKey = null;

  /** @type {null | { ar: number; ac: number; dx: number; dy: number }} */
  let dragTileOffset = null;
  /** @type {null | { ar: number; ac: number; dx: number; dy: number; t0: number; dur: number }} */
  let rejectSpring = null;
  /** @type {number | null} */
  let rejectSpringRafId = null;
  /** @type {null | { ar: number; ac: number; dx: number; dy: number; t0: number; dur: number }} */
  let dragReturnSpring = null;
  /** @type {number | null} */
  let dragReturnRafId = null;

  function setDragTileOffset(o) {
    dragTileOffset = o;
    draw();
  }

  function cancelRejectSpring() {
    if (rejectSpringRafId != null) {
      cancelAnimationFrame(rejectSpringRafId);
      rejectSpringRafId = null;
    }
    rejectSpring = null;
  }

  function cancelDragReturnSpring() {
    if (dragReturnRafId != null) {
      cancelAnimationFrame(dragReturnRafId);
      dragReturnRafId = null;
    }
    dragReturnSpring = null;
  }

  function startRejectSpring(ar, ac, dx, dy) {
    cancelDragReturnSpring();
    cancelRejectSpring();
    rejectSpring = {
      ar,
      ac,
      dx,
      dy,
      t0: performance.now(),
      dur: 200,
    };
    draw();
    function tick() {
      if (!rejectSpring) {
        rejectSpringRafId = null;
        return;
      }
      draw();
      const t = (performance.now() - rejectSpring.t0) / rejectSpring.dur;
      if (t >= 1) {
        rejectSpring = null;
        rejectSpringRafId = null;
        draw();
        return;
      }
      rejectSpringRafId = requestAnimationFrame(tick);
    }
    rejectSpringRafId = requestAnimationFrame(tick);
  }

  function startDragReturnSpring(ar, ac, dx, dy) {
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
      dragTileOffset = null;
      draw();
      return;
    }
    cancelDragReturnSpring();
    cancelRejectSpring();
    dragTileOffset = null;
    dragReturnSpring = {
      ar,
      ac,
      dx,
      dy,
      t0: performance.now(),
      dur: 220,
    };
    draw();
    function tick() {
      if (!dragReturnSpring) {
        dragReturnRafId = null;
        return;
      }
      draw();
      const t = (performance.now() - dragReturnSpring.t0) / dragReturnSpring.dur;
      if (t >= 1) {
        dragReturnSpring = null;
        dragReturnRafId = null;
        draw();
        return;
      }
      dragReturnRafId = requestAnimationFrame(tick);
    }
    dragReturnRafId = requestAnimationFrame(tick);
  }

  function getDragTileVisual() {
    if (dragTileOffset) return dragTileOffset;
    if (dragReturnSpring) {
      const t = (performance.now() - dragReturnSpring.t0) / dragReturnSpring.dur;
      if (t >= 1) return null;
      const e =
        typeof easeOutQuad === "function" ? easeOutQuad(t) : t * (2 - t);
      const k = 1 - e;
      return {
        ar: dragReturnSpring.ar,
        ac: dragReturnSpring.ac,
        dx: dragReturnSpring.dx * k,
        dy: dragReturnSpring.dy * k,
      };
    }
    if (rejectSpring) {
      const t = (performance.now() - rejectSpring.t0) / rejectSpring.dur;
      if (t >= 1) return null;
      const e =
        typeof easeOutQuad === "function" ? easeOutQuad(t) : t * (2 - t);
      const k = 1 - e;
      return {
        ar: rejectSpring.ar,
        ac: rejectSpring.ac,
        dx: rejectSpring.dx * k,
        dy: rejectSpring.dy * k,
      };
    }
    return null;
  }

  function randomType() {
    return Math.floor(Math.random() * TYPE_COUNT);
  }

  function readHighScore() {
    try {
      const v = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || "0", 10);
      return Number.isFinite(v) && v >= 0 ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function persistHighScore() {
    try {
      const prev = readHighScore();
      if (score > prev) {
        localStorage.setItem(HIGH_SCORE_KEY, String(score));
      }
    } catch (e) {
      /* ignore */
    }
    highScore = readHighScore();
  }

  function enterGameOver() {
    hintManager.stop();
    if (missionCelebrateTimerId != null) {
      clearTimeout(missionCelebrateTimerId);
      missionCelebrateTimerId = null;
    }
    persistHighScore();
    gameOver = true;
    setAnimating(false);
    if (inputHandler) {
      inputHandler.setEnabled(false);
    }
    updateHud();
    draw();
  }

  function handleComboFeedback(feedback) {
    comboFeedback = {
      label: feedback.label,
      multiplier: feedback.multiplier,
      untilMs: performance.now() + feedback.durationMs,
      boost: feedback.boost,
    };
  }

  function resetGame() {
    hintManager.stop();
    if (missionCelebrateTimerId != null) {
      clearTimeout(missionCelebrateTimerId);
      missionCelebrateTimerId = null;
    }
    if (autoSaveTimerId != null) {
      clearTimeout(autoSaveTimerId);
      autoSaveTimerId = null;
    }
    if (savedToastTimerId != null) {
      clearTimeout(savedToastTimerId);
      savedToastTimerId = null;
    }
    stopAnimLoop();
    swapAnim = null;
    fallAnim = null;
    flashAnim = null;
    shakeUntilMs = 0;
    particleBurst = null;
    particleBurstNonce = 0;
    spawnAnimations = [];
    lastInputLayoutKey = null;
    dragTileOffset = null;
    cancelRejectSpring();
    cancelDragReturnSpring();
    boardView.clearJuice();
    score = 0;
    movesLeft = START_MOVES;
    const p = progression.reset();
    currentLevel = p.level;
    levelTarget = p.target;
    levelUpUntilMs = 0;
    missionPendingLevelUp = false;
    missionFlowActive = false;
    comboFeedback = null;
    comboManager.resetTurn();
    gameOver = false;
    hasActiveRun = true;
    highScore = readHighScore();
    setAnimating(false);
    updateHud();
    fillBoardWithoutInitialMatches();
    ensureNoMatchesLoop();
    missionManager.setMissionForLevel(currentLevel, null);
    syncMissionHud(false);
    showMissionStartToast();
    setupCanvasResolution();
    attachInput();
    draw();
    hintManager.startTimer();
    requestAutoSave();
  }

  function goToMenu() {
    // Persist current run before opening menu so Continue resumes this exact state.
    saveProgress();
    hintManager.stop();
    if (missionCelebrateTimerId != null) {
      clearTimeout(missionCelebrateTimerId);
      missionCelebrateTimerId = null;
    }
    stopAnimLoop();
    if (inputHandler) {
      inputHandler.setEnabled(false);
    }
    if (window.MainMenuUI && typeof window.MainMenuUI.show === "function") {
      window.MainMenuUI.show();
    } else {
      document.body.classList.add("is-menu-open");
      const menu = document.getElementById("mainMenu");
      if (menu) {
        menu.hidden = false;
        menu.classList.remove("is-hiding");
        menu.setAttribute("aria-hidden", "false");
      }
    }
  }

  function onCanvasRestart(ev) {
    if (!gameOver) return;
    if (ev.type === "touchend") {
      ev.preventDefault();
    }
    resetGame();
  }

  function readSafeInsets() {
    const el = document.querySelector(".safe-chrome");
    if (!el) {
      return { top: 10, bottom: 10, left: 10, right: 10 };
    }
    const s = getComputedStyle(el);
    return {
      top: parseFloat(s.paddingTop) || 10,
      right: parseFloat(s.paddingRight) || 10,
      bottom: parseFloat(s.paddingBottom) || 10,
      left: parseFloat(s.paddingLeft) || 10,
    };
  }

  function updateHud() {
    scoreEl.textContent = String(score);
    movesEl.textContent = String(Math.max(0, movesLeft));
    if (levelEl) {
      levelEl.textContent = String(currentLevel);
    }
    if (targetEl) {
      targetEl.textContent = String(Math.max(0, levelTarget - score));
    }
  }

  function animateMissionPop() {
    if (!globalThis.gsap || !missionIconEl || !missionValueEl) return;
    globalThis.gsap.killTweensOf([missionIconEl, missionValueEl]);
    globalThis.gsap.fromTo(
      [missionIconEl, missionValueEl],
      { scale: 1 },
      {
        scale: 1.3,
        duration: 0.11,
        ease: "back.out(2)",
        yoyo: true,
        repeat: 1,
      }
    );
  }

  function syncMissionHud(withPop) {
    if (!missionIconEl || !missionValueEl) return;
    const s = missionManager.getState();
    if (missionIconImgEl && s.iconImage) {
      missionIconImgEl.src = s.iconImage;
      missionIconImgEl.hidden = false;
      missionIconEl.hidden = true;
    } else {
      if (missionIconImgEl) {
        missionIconImgEl.hidden = true;
        missionIconImgEl.removeAttribute("src");
      }
      missionIconEl.hidden = false;
      missionIconEl.textContent = s.icon || "⭐";
    }
    missionValueEl.textContent = String(Math.max(0, s.remaining)) + " / " + String(s.goal);
    if (missionHudEl) {
      missionHudEl.classList.toggle("is-complete", !!s.completed);
    }
    if (withPop) animateMissionPop();
  }

  function tSafe(key, fallback) {
    const lm = globalThis.LanguageManager;
    if (lm && typeof lm.t === "function") {
      const v = lm.t(key);
      if (typeof v === "string" && v.trim()) return v;
    }
    return fallback;
  }

  function makeLevelUpText(level) {
    const tmpl = tSafe("level_up_msg", "LEVEL UP! {0}");
    return String(tmpl).replace("{0}", String(level));
  }

  function showLevelUpToast(level) {
    const toast = document.getElementById("levelUpToast");
    if (toast) {
      toast.textContent = makeLevelUpText(level);
    }
    levelUpUntilMs = performance.now() + MISSION_LEVELUP_MS;
  }

  function fitMissionToastToTwoLines() {
    if (!missionStartToastEl) return;
    missionStartToastEl.style.fontSize = "";
    missionStartToastEl.style.lineHeight = "";

    const computed = getComputedStyle(missionStartToastEl);
    const baseSize = parseFloat(computed.fontSize) || 10.5;
    const baseLine = parseFloat(computed.lineHeight) || baseSize * 1.28;
    let size = baseSize;
    let line = baseLine;

    for (let i = 0; i < 5; i++) {
      const lineCount = Math.ceil(missionStartToastEl.scrollHeight / line);
      if (lineCount <= 2) break;
      size = Math.max(9.6, size - 0.35);
      line = Math.max(size * 1.2, line - 0.2);
      missionStartToastEl.style.fontSize = size.toFixed(2) + "px";
      missionStartToastEl.style.lineHeight = line.toFixed(2) + "px";
    }
  }

  function showMissionStartToast() {
    if (!missionStartToastEl) return;
    const s = missionManager.getState();
    const itemName = tSafe("mission.item." + s.type, "fruit");
    const toastTemplate = tSafe("mission.collect_target", "Collect {0} {1}");
    const toastText = String(toastTemplate)
      .replace("{0}", String(s.goal))
      .replace("{1}", itemName);
    missionStartToastEl.textContent = toastText;
    fitMissionToastToTwoLines();
    missionStartToastEl.classList.remove("is-visible");
    missionStartToastEl.setAttribute("aria-hidden", "false");
    void missionStartToastEl.offsetWidth;
    missionStartToastEl.classList.add("is-visible");
    if (missionToastTimerId != null) {
      clearTimeout(missionToastTimerId);
    }
    missionToastTimerId = setTimeout(function () {
      missionStartToastEl.classList.remove("is-visible");
      missionStartToastEl.setAttribute("aria-hidden", "true");
      missionToastTimerId = null;
    }, 3000);
  }

  function showMissionCompleteBadge() {
    if (!missionCompleteBadgeEl || !globalThis.gsap) return;
    missionCompleteBadgeEl.textContent = tSafe("mission.complete", "Mission complete") + " ✓";
    missionCompleteBadgeEl.setAttribute("aria-hidden", "false");
    globalThis.gsap.killTweensOf(missionCompleteBadgeEl);
    globalThis.gsap.fromTo(
      missionCompleteBadgeEl,
      { opacity: 0, y: 6, scale: 0.7 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.25,
        ease: "back.out(2.2)",
        yoyo: true,
        repeat: 1,
        repeatDelay: 1.0,
      }
    );
    setTimeout(function () {
      missionCompleteBadgeEl.setAttribute("aria-hidden", "true");
      missionCompleteBadgeEl.style.opacity = "0";
    }, 1500);
  }

  function showSavedToast(ok) {
    if (!savedToastEl) return;
    const isOk = ok !== false;
    savedToastEl.classList.toggle("is-error", !isOk);
    savedToastEl.textContent = isOk
      ? tSafe("fx.saved", "Saved")
      : tSafe("fx.saveFailed", "Save failed");
    savedToastEl.classList.remove("is-visible");
    savedToastEl.setAttribute("aria-hidden", "false");
    void savedToastEl.offsetWidth;
    savedToastEl.classList.add("is-visible");
    if (savedToastTimerId != null) {
      clearTimeout(savedToastTimerId);
    }
    savedToastTimerId = setTimeout(function () {
      savedToastEl.classList.remove("is-visible");
      savedToastEl.setAttribute("aria-hidden", "true");
      savedToastTimerId = null;
    }, 900);
  }

  function handleMissionUpdate() {
    syncMissionHud(true);
    requestAutoSave();
  }

  function handleMissionComplete() {
    missionPendingLevelUp = true;
  }

  function runMissionLevelUpFlow() {
    if (missionFlowActive || gameOver) return;
    missionFlowActive = true;
    setAnimating(true);
    if (inputHandler) inputHandler.setEnabled(false);
    showMissionCompleteBadge();
    if (typeof boardView.triggerMissionSparkle === "function") {
      boardView.triggerMissionSparkle({
        durationMs: 1000,
        anchorEl: missionHudEl,
        preset: "mission-box",
      });
    }

    if (missionCelebrateTimerId != null) {
      clearTimeout(missionCelebrateTimerId);
      missionCelebrateTimerId = null;
    }

    missionCelebrateTimerId = setTimeout(function () {
      missionCelebrateTimerId = null;
      currentLevel += 1;
      levelTarget = progression.getTargetForLevel(currentLevel);
      progression.currentLevel = currentLevel;
      progression.currentTarget = levelTarget;
      movesLeft += LEVEL_UP_BONUS_MOVES;
      showLevelUpToast(currentLevel);

      missionManager.setMissionForLevel(currentLevel, null);
      missionPendingLevelUp = false;
      updateHud();
      showMissionStartToast();
      requestAutoSave();
      draw();

      missionFlowActive = false;
      setAnimating(false);
      hintManager.startTimer();
      draw();
    }, 1000);
  }

  function setAnimating(value) {
    animating = value;
    if (inputHandler) {
      inputHandler.setEnabled(!value && !gameOver);
    }
    if (!animating && pendingReshuffle && !gameOver) {
      pendingReshuffle = false;
      // Run on next tick so state transitions from the finished animation settle first.
      setTimeout(function () {
        if (!gameOver) reshuffleBoard();
      }, 0);
    }
  }

  function stopAnimLoop() {
    if (activeAnimLoop) {
      activeAnimLoop.stop();
      activeAnimLoop = null;
    }
  }

  function snapshotCells() {
    const cells = [];
    for (let r = 0; r < ROWS; r++) {
      cells[r] = [];
      for (let c = 0; c < COLS; c++) {
        cells[r][c] = grid.get(r, c);
      }
    }
    return cells;
  }

  function applyGridState(gridState) {
    if (!Array.isArray(gridState)) return false;
    if (gridState.length !== ROWS) return false;
    for (let r = 0; r < ROWS; r++) {
      if (!Array.isArray(gridState[r]) || gridState[r].length !== COLS) {
        return false;
      }
      for (let c = 0; c < COLS; c++) {
        const v = gridState[r][c];
        if (!Number.isInteger(v)) {
          return false;
        }
      }
    }

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        grid.set(r, c, gridState[r][c]);
      }
    }
    return true;
  }

  function saveProgress() {
    let showToast = false;
    if (arguments.length > 0 && arguments[0] && arguments[0].showToast) {
      showToast = true;
    }
    if (typeof SaveManager === "undefined" || !SaveManager.saveGameState) {
      if (showToast) {
        showSavedToast(false);
      }
      return false;
    }
    const ok = SaveManager.saveGameState({
      gridState: snapshotCells(),
      currentScore: score,
      currentMoves: movesLeft,
      currentLevel: currentLevel,
      targetScore: levelTarget,
      currentMissionProgress: missionManager.getSaveState(),
    });
    if (ok && window.MainMenuUI && typeof window.MainMenuUI.refreshContinue === "function") {
      window.MainMenuUI.refreshContinue();
    }
    if (showToast) {
      showSavedToast(ok);
    }
    return ok;
  }

  function buildSavePayload() {
    return {
      gridState: snapshotCells(),
      currentScore: score,
      currentMoves: movesLeft,
      currentLevel: currentLevel,
      targetScore: levelTarget,
      currentMissionProgress: missionManager.getSaveState(),
    };
  }

  function syncMenuSaveUi() {
    if (window.MainMenuUI && typeof window.MainMenuUI.refreshContinue === "function") {
      window.MainMenuUI.refreshContinue();
    }
    if (window.MainMenuUI && typeof window.MainMenuUI.refreshSlots === "function") {
      window.MainMenuUI.refreshSlots();
    }
  }

  function saveToSlot(slot) {
    const slotId = Math.floor(Number(slot));
    if (!hasActiveRun) {
      showSavedToast(false);
      return false;
    }
    if (
      typeof SaveManager === "undefined" ||
      typeof SaveManager.saveSlotGameState !== "function"
    ) {
      showSavedToast(false);
      return false;
    }
    const ok = SaveManager.saveSlotGameState(slotId, buildSavePayload());
    if (ok) {
      showSavedToast(true);
      syncMenuSaveUi();
    } else {
      showSavedToast(false);
    }
    return ok;
  }

  function clearSlot(slot) {
    const slotId = Math.floor(Number(slot));
    if (
      typeof SaveManager === "undefined" ||
      typeof SaveManager.clearSlotGameState !== "function"
    ) {
      return false;
    }
    const ok = SaveManager.clearSlotGameState(slotId);
    if (ok) {
      syncMenuSaveUi();
    }
    return ok;
  }

  function getSlotSummaries() {
    if (
      typeof SaveManager === "undefined" ||
      typeof SaveManager.listSlotGameStates !== "function"
    ) {
      return [];
    }
    return SaveManager.listSlotGameStates();
  }

  function restoreFromSavePayload(saved) {
    resetGame();
    const ok = applyGridState(saved.gridState);
    if (!ok) {
      resetGame();
      return false;
    }

    score = saved.currentScore;
    movesLeft = saved.currentMoves;
    currentLevel = saved.currentLevel;
    levelTarget = saved.targetScore;
    gameOver = false;
    hasActiveRun = true;
    comboFeedback = null;
    missionPendingLevelUp = false;
    missionFlowActive = false;
    swapAnim = null;
    fallAnim = null;
    flashAnim = null;
    spawnAnimations = [];
    levelUpUntilMs = 0;
    missionManager.setMissionForLevel(currentLevel, saved.currentMissionProgress || null);
    syncMissionHud(false);
    setAnimating(false);
    updateHud();
    draw();
    hintManager.startTimer();
    return true;
  }

  function requestAutoSave() {
    if (autoSaveTimerId != null) {
      clearTimeout(autoSaveTimerId);
    }
    autoSaveTimerId = setTimeout(function () {
      autoSaveTimerId = null;
      saveProgress();
    }, AUTO_SAVE_DEBOUNCE_MS);
  }

  function buildRenderState() {
    const safe = readSafeInsets();
    return {
      rows: ROWS,
      cols: COLS,
      cells: snapshotCells(),
      empty: GridManager.EMPTY,
      selection: inputHandler ? inputHandler.getSelection() : null,
      swapAnim,
      fallAnim,
      flashAnim,
      gameOver,
      score,
      level: currentLevel,
      levelUpUntilMs,
      comboFeedback,
      movesLeft: Math.max(0, movesLeft),
      highScore,
      safeInsets: safe,
      shakeUntilMs,
      particleBurst,
      spawnAnimations,
      dragTileOffset: getDragTileVisual(),
    };
  }

  function pruneSpawnAnims() {
    const now = performance.now();
    if (!spawnAnimations.length) return;
    spawnAnimations = spawnAnimations.filter(function (s) {
      return now < s.startMs + s.durMs;
    });
  }

  function hasActiveSpawnAnims() {
    const now = performance.now();
    for (let i = 0; i < spawnAnimations.length; i++) {
      const s = spawnAnimations[i];
      if (now < s.startMs + s.durMs) return true;
    }
    return false;
  }

  function dbgLog() {
    if (typeof Match3Debug !== "undefined" && Match3Debug.enabled()) {
      const a = Array.prototype.slice.call(arguments);
      a.unshift("[match3]");
      console.log.apply(console, a);
    }
  }

  function dbgWarn() {
    if (typeof Match3Debug !== "undefined" && Match3Debug.enabled()) {
      const a = Array.prototype.slice.call(arguments);
      a.unshift("[match3]");
      console.warn.apply(console, a);
    }
  }

  function draw() {
    pruneSpawnAnims();
    if (
      inputHandler &&
      typeof inputHandler.updateMetrics === "function"
    ) {
      const { cs, ox, oy } = getBoardLayout();
      const key = cs.toFixed(4) + "|" + ox.toFixed(4) + "|" + oy.toFixed(4);
      if (key !== lastInputLayoutKey) {
        lastInputLayoutKey = key;
        inputHandler.updateMetrics({
          rows: ROWS,
          cols: COLS,
          cellSize: cs,
          originX: ox,
          originY: oy,
          logicalWidth: VIEW_W,
          logicalHeight: VIEW_H,
        });
        dbgLog("input metrics synced", { cs, ox, oy });
      }
    }
    boardView.render(buildRenderState());
    const juice =
      boardView.hasActiveJuice(shakeUntilMs, comboFeedback) ||
      hasActiveSpawnAnims() ||
      rejectSpring != null ||
      dragReturnSpring != null;
    if (juice && !activeAnimLoop) {
      requestAnimationFrame(draw);
    }
  }

  function showShuffleToast() {
    if (!shuffleToastEl) return;
    const text =
      globalThis.LanguageManager && typeof globalThis.LanguageManager.t === "function"
        ? globalThis.LanguageManager.t("fx.shuffling")
        : "KARIŞTIRILIYOR";
    shuffleToastEl.textContent = text || "KARIŞTIRILIYOR";
    shuffleToastEl.style.animationDuration = SHUFFLE_SHAKE_MS + "ms";
    shuffleToastEl.classList.remove("is-visible");
    void shuffleToastEl.offsetWidth; // force reflow to restart animation
    shuffleToastEl.classList.add("is-visible");
    shuffleToastEl.setAttribute("aria-hidden", "false");
    if (shuffleToastTimerId != null) clearTimeout(shuffleToastTimerId);
    shuffleToastTimerId = setTimeout(function () {
      shuffleToastEl.classList.remove("is-visible");
      shuffleToastEl.setAttribute("aria-hidden", "true");
      shuffleToastTimerId = null;
    }, SHUFFLE_SHAKE_MS);
  }

  function reshuffleBoard() {
    if (gameOver) return;
    if (animating) {
      pendingReshuffle = true;
      return;
    }
    pendingReshuffle = false;
    hintManager.clearHint();

    const E = GridManager.EMPTY;
    const tiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = grid.get(r, c);
        if (t !== E) {
          tiles.push(t);
        }
      }
    }

    for (let attempt = 0; attempt < 36; attempt++) {
      const shuffled = tiles.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }
      let index = 0;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          grid.set(r, c, shuffled[index++]);
        }
      }
      if (matchLogic.findMatches(grid).flashKeys.size > 0) {
        continue;
      }
      if (hintManager.findPossibleMove(snapshotCells())) {
        shakeUntilMs = performance.now() + SHUFFLE_SHAKE_MS;
        showShuffleToast();
        draw();
        hintManager.startTimer();
        return;
      }
    }

    fillBoardWithoutInitialMatches();
    ensureNoMatchesLoop();
    shakeUntilMs = performance.now() + SHUFFLE_SHAKE_MS;
    showShuffleToast();
    draw();
    hintManager.startTimer();
  }

  function getBoardLayout() {
    const { cs, ox, oy } = boardView.getBoardGeometry(
      VIEW_W,
      VIEW_H,
      ROWS,
      COLS
    );
    return { cs, ox, oy };
  }

  function fillBoardWithoutInitialMatches() {
    grid.resetEmpty();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let t;
        let guard = 0;
        do {
          t = randomType();
          guard++;
        } while (
          matchLogic.wouldFormImmediateTriple(grid, r, c, t) &&
          guard < 80
        );
        grid.set(r, c, t);
      }
    }
  }

  function ensureNoMatchesLoop() {
    let safety = 0;
    while (matchLogic.findMatches(grid).flashKeys.size > 0 && safety < 100) {
      fillBoardWithoutInitialMatches();
      safety++;
    }
  }

  /**
   * Patlayan şerit taşlar: yatay → tüm satır, dikey → tüm sütun (zincirle).
   */
  function expandStripedExplosion(seedKeys) {
    const all = new Set(seedKeys);
    const frontier = Array.from(seedKeys);
    const isH = MatchLogic.isSpecialHorizontal.bind(MatchLogic);
    const isV = MatchLogic.isSpecialVertical.bind(MatchLogic);

    while (frontier.length > 0) {
      const k = frontier.pop();
      const parts = k.split(",");
      const r = parseInt(parts[0], 10);
      const c = parseInt(parts[1], 10);
      const v = grid.get(r, c);
      if (isH(v)) {
        for (let cc = 0; cc < COLS; cc++) {
          const nk = r + "," + cc;
          if (!all.has(nk)) {
            all.add(nk);
            frontier.push(nk);
          }
        }
      }
      if (isV(v)) {
        for (let rr = 0; rr < ROWS; rr++) {
          const nk = rr + "," + c;
          if (!all.has(nk)) {
            all.add(nk);
            frontier.push(nk);
          }
        }
      }
    }
    return all;
  }

  function fillEmptyTracked() {
    const E = GridManager.EMPTY;
    const startMs = performance.now();
    let filled = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid.get(r, c) === E) {
          const t = randomType();
          grid.set(r, c, t);
          spawnAnimations = spawnAnimations.filter(function (s) {
            return s.r !== r || s.c !== c;
          });
          spawnAnimations.push({
            r,
            c,
            t,
            startMs,
            durMs: SPAWN_BOUNCE_MS,
          });
          filled++;
        }
      }
    }
    dbgLog("fillEmptyTracked", { filled, startMs });
  }

  function runSwapAnimation(a, b, onDone, startP) {
    const va = grid.get(a.r, a.c);
    const vb = grid.get(b.r, b.c);
    const p0 =
      startP == null ? 0 : Math.min(1, Math.max(0, startP));
    swapAnim = {
      ar: a.r,
      ac: a.c,
      br: b.r,
      bc: b.c,
      va,
      vb,
      p: p0,
    };
    audio.playSwipe();
    stopAnimLoop();
    let p = p0;
    activeAnimLoop = createRafLoop((dt) => {
      p += dt / SWAP_DURATION_SEC;
      if (p >= 1) p = 1;
      swapAnim.p = p;
      draw();
      if (p >= 1) {
        swapAnim = null;
        activeAnimLoop = null;
        onDone();
        return false;
      }
      return true;
    });
    activeAnimLoop.start();
    draw();
  }

  /**
   * @param {string[]} keys
   * @param {{ kind: "match" | "combo" | "big"; mult?: number }} audioHint
   * @param {() => void} onDone
   */
  function runFlashAnimation(keys, audioHint, onDone) {
    if (audioHint.kind === "big") {
      audio.playBigPop();
    } else if (audioHint.kind === "combo" && audioHint.mult) {
      audio.playCombo(audioHint.mult);
    } else {
      audio.playMatch();
    }
    flashAnim = { keys, p: 0 };
    stopAnimLoop();
    let p = 0;
    activeAnimLoop = createRafLoop((dt) => {
      const nextP = p + dt / FLASH_DURATION_SEC;
      if (nextP >= 1) {
        flashAnim.p = Math.min(0.999, p);
        draw();
        flashAnim = null;
        activeAnimLoop = null;
        onDone();
        draw();
        return false;
      }
      p = nextP;
      flashAnim.p = p;
      draw();
      return true;
    });
    activeAnimLoop.start();
    draw();
  }

  function runFallAnimation(moves, onDone) {
    dbgLog("fall start", { count: moves.length, sample: moves.slice(0, 20) });
    const maxDelta = moves.reduce(
      (acc, m) => Math.max(acc, Math.abs(m.toR - m.fromR)),
      0
    );
    const dur = Math.max(FALL_MIN_SEC, maxDelta * FALL_SEC_PER_ROW);
    fallAnim = { moves, p: 0 };
    stopAnimLoop();
    let p = 0;
    activeAnimLoop = createRafLoop((dt) => {
      const nextP = p + dt / dur;
      if (nextP >= 1) {
        fallAnim.p = Math.min(0.999, p);
        draw();
        fallAnim = null;
        activeAnimLoop = null;
        onDone();
        draw();
        return false;
      }
      p = nextP;
      fallAnim.p = p;
      draw();
      return true;
    });
    activeAnimLoop.start();
    draw();
  }

  /**
   * Zincirleme: patla → düş → doldur → tekrar findMatches.
   * comboMultiplier aynı hamlede her yeni patlamada katlanır.
   */
  function processMatches(onFullyDone) {
    comboManager.beginTurn();
    const chainId =
      typeof Match3Debug !== "undefined" && Match3Debug.enabled()
        ? Match3Debug.nextSeq()
        : 0;
    let chainStep = 0;

    function step() {
      chainStep++;
      const raw = matchLogic.findMatches(grid);
      if (raw.flashKeys.size === 0) {
        dbgLog("chain end", { chainId, chainStep });
        onFullyDone();
        return;
      }

      const expanded = expandStripedExplosion(raw.flashKeys);
      const hadStripeBlast = expanded.size > raw.flashKeys.size;

      dbgLog("match step", {
        chainId,
        chainStep,
        flashKeys: raw.flashKeys.size,
        expanded: expanded.size,
        stripeBlast: hadStripeBlast,
        specials: raw.specialCreates.length,
        comboMult: comboManager.getMultiplier(),
      });

      const anchorKeys = new Set(
        raw.specialCreates.map(function (s) {
          return s.r + "," + s.c;
        })
      );

      const flashKeysArr = Array.from(expanded);
      const comboState = comboManager.recordMatch({
        matchCount: raw.matchCount,
        hadStripeBlast,
      });
      const audioHint = hadStripeBlast
        ? { kind: "big" }
        : comboState.multiplier > 1
          ? { kind: "combo", mult: comboState.multiplier }
          : { kind: "match" };

      const burstCells = [];
      for (let fi = 0; fi < flashKeysArr.length; fi++) {
        const parts = flashKeysArr[fi].split(",");
        const br = parseInt(parts[0], 10);
        const bc = parseInt(parts[1], 10);
        burstCells.push({ r: br, c: bc, t: grid.get(br, bc) });
      }
      particleBurst = { nonce: ++particleBurstNonce, cells: burstCells };
      if (hadStripeBlast) {
        shakeUntilMs = performance.now() + SCREEN_SHAKE_MS;
      }

      runFlashAnimation(flashKeysArr, audioHint, () => {
        const clearedCount = expanded.size;
        score += clearedCount * POINTS_PER_TILE * comboState.multiplier;

        const missionCounts = {};
        for (let bi = 0; bi < burstCells.length; bi++) {
          const base = matchLogic.matchColor(burstCells[bi].t);
          if (base < 0) continue;
          missionCounts[base] = (missionCounts[base] || 0) + 1;
        }
        const missionKeys = Object.keys(missionCounts);
        for (let mi = 0; mi < missionKeys.length; mi++) {
          const type = parseInt(missionKeys[mi], 10);
          missionManager.updateProgress(type, missionCounts[type]);
        }

        const sync = progression.syncByScore(score);
        if (sync.leveledUpBy > 0) {
          currentLevel = sync.level;
          levelTarget = sync.target;
          movesLeft += sync.bonusMoves;
          showLevelUpToast(currentLevel);
          missionPendingLevelUp = false;
          missionManager.setMissionForLevel(currentLevel, null);
          syncMissionHud(false);
          requestAutoSave();
        }
        updateHud();

        const E = GridManager.EMPTY;
        expanded.forEach(function (k) {
          if (anchorKeys.has(k)) return;
          const parts = k.split(",");
          grid.set(parseInt(parts[0], 10), parseInt(parts[1], 10), E);
        });

        raw.specialCreates.forEach(function (s) {
          const t =
            s.kind === "h"
              ? MatchLogic.encodeStripedHorizontal(s.color)
              : MatchLogic.encodeStripedVertical(s.color);
          grid.set(s.r, s.c, t);
        });

        const moves = planGravityMoves(grid);
        dbgLog("post-clear gravity plan", {
          chainId,
          chainStep,
          moveCount: moves.length,
          moves: moves.slice(0, 24),
        });

        function afterSettled() {
          grid.applyGravity();
          const E = GridManager.EMPTY;
          if (
            typeof Match3Debug !== "undefined" &&
            Match3Debug.enabled()
          ) {
            const hole = Match3Debug.noFloatUnder(grid, E);
            if (!hole.ok) {
              dbgWarn("GRAVITY HOLE after applyGravity", hole, "\n", Match3Debug.dumpGrid(grid, E));
            }
          }
          const emptyBeforeFill = (function countE() {
            let n = 0;
            for (let r = 0; r < ROWS; r++) {
              for (let c = 0; c < COLS; c++) {
                if (grid.get(r, c) === E) n++;
              }
            }
            return n;
          })();
          fillEmptyTracked();
          dbgLog("afterSettled", {
            chainId,
            chainStep,
            emptyCellsBeforeFill: emptyBeforeFill,
            spawnAnimCount: spawnAnimations.length,
          });
          if (
            typeof Match3Debug !== "undefined" &&
            Match3Debug.enabled()
          ) {
            const hole2 = Match3Debug.noFloatUnder(grid, E);
            if (!hole2.ok) {
              dbgWarn("GRAVITY HOLE after fill", hole2, "\n", Match3Debug.dumpGrid(grid, E));
            }
          }
          draw();
          requestAutoSave();
          requestAnimationFrame(step);
        }

        if (moves.length === 0) {
          dbgLog("no fall moves; settle immediately", { chainId, chainStep });
          afterSettled();
        } else {
          runFallAnimation(moves, afterSettled);
        }
      });
    }

    step();
  }

  function trySwap(a, b, dragMeta) {
    if (gameOver || animating) return;

    cancelRejectSpring();
    cancelDragReturnSpring();

    grid.swap(a, b);
    const probe = matchLogic.findMatches(grid);
    const ok = probe.flashKeys.size > 0;
    dbgLog("trySwap probe", {
      a,
      b,
      ok,
      flashKeys: probe.flashKeys.size,
      cellsToClear: probe.cellsToClear.size,
      specials: probe.specialCreates.length,
    });
    grid.swap(a, b);

    if (!ok) {
      if (dragMeta && (dragMeta.dx !== 0 || dragMeta.dy !== 0)) {
        startRejectSpring(a.r, a.c, dragMeta.dx, dragMeta.dy);
      } else {
        draw();
      }
      return;
    }

    setAnimating(true);
    const { cs } = getBoardLayout();
    let swapStartP = 0;
    if (dragMeta && cs > 0) {
      const horiz = a.r === b.r;
      const dist = horiz ? Math.abs(dragMeta.dx) : Math.abs(dragMeta.dy);
      swapStartP = Math.min(0.9, dist / cs);
    }
    runSwapAnimation(a, b, () => {
      grid.swap(a, b);
      movesLeft--;
      updateHud();
      processMatches(() => {
        comboManager.resetTurn();
        setAnimating(false);
        if (missionPendingLevelUp) {
          runMissionLevelUpFlow();
          return;
        }
        if (movesLeft <= 0 && score < levelTarget) {
          enterGameOver();
        } else {
          hintManager.startTimer();
          draw();
        }
      });
    }, swapStartP);
  }

  function setupCanvasResolution() {
    if (typeof boardView.syncPixelBuffer === "function") {
      boardView.syncPixelBuffer(VIEW_W, VIEW_H);
    } else {
      const dpr =
        typeof window !== "undefined" && window.devicePixelRatio
          ? Math.min(window.devicePixelRatio, 3.5)
          : 1;
      canvas.width = Math.round(VIEW_W * dpr);
      canvas.height = Math.round(VIEW_H * dpr);
      canvas.dataset.logicalW = String(VIEW_W);
      canvas.dataset.logicalH = String(VIEW_H);
      canvas.dataset.dpr = String(canvas.width / VIEW_W);
    }
  }

  function attachInput() {
    if (inputHandler) inputHandler.destroy();
    const { cs, ox, oy } = getBoardLayout();
    inputHandler = new InputHandler(
      canvas,
      {
        rows: ROWS,
        cols: COLS,
        cellSize: cs,
        originX: ox,
        originY: oy,
        logicalWidth: VIEW_W,
        logicalHeight: VIEW_H,
      },
      {
        onSwapAttempt: trySwap,
        onSelectionChanged: draw,
        onInteractionStart: function () {
          hintManager.resetTimer();
        },
        onDragOffset: setDragTileOffset,
        onDragSnapBack: startDragReturnSpring,
      }
    );
    inputHandler.setEnabled(!animating && !gameOver);
  }

  function continueFromSave() {
    if (typeof SaveManager === "undefined" || !SaveManager.loadGameState) {
      resetGame();
      return false;
    }

    const saved = SaveManager.loadGameState();
    if (!saved) {
      if (SaveManager.clearGameState) {
        SaveManager.clearGameState();
      }
      if (window.MainMenuUI && typeof window.MainMenuUI.refreshContinue === "function") {
        window.MainMenuUI.refreshContinue();
      }
      resetGame();
      return false;
    }

    const ok = restoreFromSavePayload(saved);
    if (!ok) {
      if (SaveManager.clearGameState) {
        SaveManager.clearGameState();
      }
      if (window.MainMenuUI && typeof window.MainMenuUI.refreshContinue === "function") {
        window.MainMenuUI.refreshContinue();
      }
      resetGame();
      return false;
    }
    return true;
  }

  function loadFromSlot(slot) {
    const slotId = Math.floor(Number(slot));
    if (
      typeof SaveManager === "undefined" ||
      typeof SaveManager.loadSlotGameState !== "function"
    ) {
      return false;
    }
    const saved = SaveManager.loadSlotGameState(slotId);
    if (!saved) return false;
    return restoreFromSavePayload(saved);
  }

  canvas.addEventListener("click", onCanvasRestart, true);
  canvas.addEventListener("touchend", onCanvasRestart, true);

  newBtn.addEventListener("click", resetGame);
  if (menuBtn) {
    menuBtn.addEventListener("click", function () {
      goToMenu();
    });
  }
  if (gameOverMenuBtn) {
    gameOverMenuBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      goToMenu();
    });
  }
  window.Match3Game = {
    start: resetGame,
    goToMenu: goToMenu,
    continueFromSave: continueFromSave,
    saveNow: function () {
      return saveProgress({ showToast: true });
    },
    saveToSlot: saveToSlot,
    loadFromSlot: loadFromSlot,
    clearSlot: clearSlot,
    getSlotSummaries: getSlotSummaries,
    canSaveNow: function () {
      return !!hasActiveRun;
    },
  };
})();
