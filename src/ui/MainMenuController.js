(function (global) {
  "use strict";

  function mountLanguageSelector(container) {
    if (!container || !global.LanguageSelector || !global.LanguageManager) {
      return null;
    }
    container.innerHTML = "";
    const selector = new global.LanguageSelector({
      manager: global.LanguageManager,
      onChange: function () {},
    });
    return selector.mount(container);
  }

  function initMainMenu() {
    const menu = document.getElementById("mainMenu");
    const playBtn = document.getElementById("playButton");
    const continueBtn = document.getElementById("continueButton");
    const saveNowBtn = document.getElementById("saveNowButton");
    const saveSlotsOpenBtn = document.getElementById("saveSlotsOpen");
    const saveSlotsPanelEl = document.getElementById("saveSlotsPanel");
    const saveSlotsBackBtn = document.getElementById("saveSlotsBack");
    const slotsEl = document.getElementById("saveSlots");
    const deleteConfirmEl = document.getElementById("slotDeleteConfirm");
    const deleteConfirmTitleEl = document.getElementById("slotDeleteConfirmTitle");
    const deleteConfirmTextEl = document.getElementById("slotDeleteConfirmText");
    const deleteCancelBtn = document.getElementById("slotDeleteCancel");
    const deleteAcceptBtn = document.getElementById("slotDeleteAccept");
    const selectorSlot = document.getElementById("globalLanguageSlot");
    const newBtn = document.getElementById("newGame");
    let pendingConfirmAction = "";
    let pendingSlotId = 0;
    if (!menu || !playBtn) return;

    mountLanguageSelector(selectorSlot);
    if (newBtn) {
      newBtn.disabled = true;
    }

    function t(key, fallback) {
      if (!global.LanguageManager || typeof global.LanguageManager.t !== "function") {
        return fallback;
      }
      const v = global.LanguageManager.t(key);
      if (!v || v === key) return fallback;
      return v;
    }

    function refreshContinueVisibility() {
      if (!continueBtn) return;
      const hasSave =
        global.SaveManager && typeof global.SaveManager.hasSavedGame === "function"
          ? global.SaveManager.hasSavedGame()
          : false;
      continueBtn.hidden = !hasSave;
    }

    function refreshSaveNowState() {
      if (!saveNowBtn) return;
      const canSave =
        global.Match3Game && typeof global.Match3Game.canSaveNow === "function"
          ? !!global.Match3Game.canSaveNow()
          : false;
      saveNowBtn.disabled = !canSave;
      saveNowBtn.setAttribute("aria-disabled", canSave ? "false" : "true");
    }

    function formatSlotMeta(s) {
      if (!s || !s.hasData) return t("menu.slotEmpty", "Empty slot");
      const stamp = Number.isFinite(s.savedAt) && s.savedAt > 0
        ? new Date(s.savedAt).toLocaleString()
        : "-";
      return "L" + String(s.currentLevel || 0) + " | " +
        t("hud.score", "Score") + ": " + String(s.currentScore || 0) + " | " +
        t("hud.moves", "Moves") + ": " + String(s.currentMoves || 0) + " | " + stamp;
    }

    function closeDeleteConfirm() {
      if (!deleteConfirmEl) return;
      pendingConfirmAction = "";
      pendingSlotId = 0;
      deleteConfirmEl.classList.remove("is-open");
      deleteConfirmEl.setAttribute("aria-hidden", "true");
    }

    function closeSlotsPanel() {
      if (!saveSlotsPanelEl) return;
      saveSlotsPanelEl.classList.remove("is-open");
      saveSlotsPanelEl.setAttribute("aria-hidden", "true");
    }

    function openSlotsPanel() {
      if (!saveSlotsPanelEl) return;
      refreshSlots();
      saveSlotsPanelEl.classList.add("is-open");
      saveSlotsPanelEl.setAttribute("aria-hidden", "false");
    }

    function openDeleteConfirm(slotId) {
      if (!deleteConfirmEl) return;
      pendingConfirmAction = "delete";
      pendingSlotId = slotId;
      if (deleteConfirmTitleEl) {
        deleteConfirmTitleEl.textContent = t("menu.confirmDeleteTitle", "Delete slot?");
      }
      if (deleteConfirmTextEl) {
        const tmpl = t("menu.confirmDeleteText", "Delete Slot {0}? This cannot be undone.");
        deleteConfirmTextEl.textContent = String(tmpl).replace("{0}", String(slotId));
      }
      if (deleteCancelBtn) {
        deleteCancelBtn.textContent = t("menu.confirmNo", "Cancel");
      }
      if (deleteAcceptBtn) {
        deleteAcceptBtn.textContent = t("menu.confirmYes", "Delete");
        deleteAcceptBtn.classList.add("is-danger");
      }
      deleteConfirmEl.classList.add("is-open");
      deleteConfirmEl.setAttribute("aria-hidden", "false");
    }

    function openLoadConfirm(slotId) {
      if (!deleteConfirmEl) return;
      pendingConfirmAction = "load";
      pendingSlotId = slotId;
      if (deleteConfirmTitleEl) {
        deleteConfirmTitleEl.textContent = t("menu.confirmLoadTitle", "Load slot?");
      }
      if (deleteConfirmTextEl) {
        const tmpl = t("menu.confirmLoadText", "Load Slot {0}? Current progress will be replaced.");
        deleteConfirmTextEl.textContent = String(tmpl).replace("{0}", String(slotId));
      }
      if (deleteCancelBtn) {
        deleteCancelBtn.textContent = t("menu.confirmNo", "Cancel");
      }
      if (deleteAcceptBtn) {
        deleteAcceptBtn.textContent = t("menu.confirmLoadYes", "Load");
        deleteAcceptBtn.classList.remove("is-danger");
      }
      deleteConfirmEl.classList.add("is-open");
      deleteConfirmEl.setAttribute("aria-hidden", "false");
    }

    function closeMenuThen(run) {
      let doneOnce = false;
      hideMenu();
      const done = function () {
        if (doneOnce) return;
        doneOnce = true;
        menu.hidden = true;
        menu.removeEventListener("transitionend", done);
        if (newBtn) {
          newBtn.disabled = false;
        }
        run();
      };
      menu.addEventListener("transitionend", done);
      global.setTimeout(done, 420);
    }

    function refreshSlots() {
      if (!slotsEl) return;
      const canSave =
        global.Match3Game && typeof global.Match3Game.canSaveNow === "function"
          ? !!global.Match3Game.canSaveNow()
          : false;
      const list =
        global.Match3Game && typeof global.Match3Game.getSlotSummaries === "function"
          ? global.Match3Game.getSlotSummaries()
          : [];
      const safeList = Array.isArray(list) && list.length
        ? list
        : [{ slot: 1, hasData: false }, { slot: 2, hasData: false }, { slot: 3, hasData: false }];

      const title = t("menu.slotsTitle", "Save Slots");
      const saveLabel = t("menu.slotSave", "Save");
      const loadLabel = t("menu.slotLoad", "Load");
      const delLabel = t("menu.slotDelete", "Delete");

      let html = '<h3 class="save-slots__title">' + title + "</h3>";
      html += '<div class="save-slots__grid">';
      for (let i = 0; i < safeList.length; i++) {
        const s = safeList[i];
        const slot = Number(s.slot) || i + 1;
        const hasData = !!s.hasData;
        html += '<article class="save-slot-card">';
        html += '<div class="save-slot-card__head">';
        html += '<strong class="save-slot-card__name">Slot ' + String(slot) + "</strong>";
        html += '</div>';
        html += '<p class="save-slot-card__meta">' + formatSlotMeta(s) + "</p>";
        html += '<div class="save-slot-card__actions">';
        html += '<button type="button" class="save-slot-btn" data-slot-action="save" data-slot-id="' +
          String(slot) + '"' + (canSave ? "" : " disabled") + ">" + saveLabel + "</button>";
        html += '<button type="button" class="save-slot-btn" data-slot-action="load" data-slot-id="' +
          String(slot) + '"' + (hasData ? "" : " disabled") + ">" + loadLabel + "</button>";
        html += '<button type="button" class="save-slot-btn is-danger" data-slot-action="delete" data-slot-id="' +
          String(slot) + '"' + (hasData ? "" : " disabled") + ">" + delLabel + "</button>";
        html += "</div></article>";
      }
      html += "</div>";
      slotsEl.innerHTML = html;
    }

    function showMenu() {
      refreshContinueVisibility();
      refreshSaveNowState();
      refreshSlots();
      closeSlotsPanel();
      menu.hidden = false;
      menu.classList.remove("is-hiding");
      menu.setAttribute("aria-hidden", "false");
      document.body.classList.add("is-menu-open");
      if (newBtn) {
        newBtn.disabled = true;
      }
    }

    function hideMenu() {
      closeDeleteConfirm();
      closeSlotsPanel();
      menu.classList.add("is-hiding");
      menu.setAttribute("aria-hidden", "true");
      document.body.classList.remove("is-menu-open");
    }

    global.MainMenuUI = {
      show: showMenu,
      hide: hideMenu,
      refreshContinue: refreshContinueVisibility,
      refreshSlots: refreshSlots,
    };

    playBtn.addEventListener("click", function () {
      closeMenuThen(function () {
        if (global.Match3Game && typeof global.Match3Game.start === "function") {
          global.Match3Game.start();
        }
      });
    });

    if (continueBtn) {
      continueBtn.addEventListener("click", function () {
        closeMenuThen(function () {
          if (global.Match3Game && typeof global.Match3Game.continueFromSave === "function") {
            const resumed = global.Match3Game.continueFromSave();
            if (!resumed && global.Match3Game.start) {
              global.Match3Game.start();
            }
          } else if (global.Match3Game && typeof global.Match3Game.start === "function") {
            global.Match3Game.start();
          }
        });
      });
    }

    if (saveNowBtn) {
      saveNowBtn.addEventListener("click", function () {
        if (saveNowBtn.disabled) return;
        if (global.Match3Game && typeof global.Match3Game.saveNow === "function") {
          global.Match3Game.saveNow();
          refreshContinueVisibility();
          refreshSaveNowState();
          refreshSlots();
        }
      });
    }

    if (saveSlotsOpenBtn) {
      saveSlotsOpenBtn.addEventListener("click", openSlotsPanel);
    }

    if (saveSlotsBackBtn) {
      saveSlotsBackBtn.addEventListener("click", closeSlotsPanel);
    }

    if (slotsEl) {
      slotsEl.addEventListener("click", function (ev) {
        const btn = ev.target && ev.target.closest
          ? ev.target.closest("button[data-slot-action]")
          : null;
        if (!btn || btn.disabled) return;
        const action = btn.getAttribute("data-slot-action");
        const slotId = Number(btn.getAttribute("data-slot-id") || "0");
        if (!slotId || !global.Match3Game) return;

        if (action === "save" && typeof global.Match3Game.saveToSlot === "function") {
          global.Match3Game.saveToSlot(slotId);
          refreshContinueVisibility();
          refreshSaveNowState();
          refreshSlots();
          return;
        }

        if (action === "delete" && typeof global.Match3Game.clearSlot === "function") {
          openDeleteConfirm(slotId);
          return;
        }

        if (action === "load" && typeof global.Match3Game.loadFromSlot === "function") {
          openLoadConfirm(slotId);
          return;
        }
      });
    }

    if (deleteCancelBtn) {
      deleteCancelBtn.addEventListener("click", closeDeleteConfirm);
    }

    if (deleteAcceptBtn) {
      deleteAcceptBtn.addEventListener("click", function () {
        if (!pendingSlotId || !global.Match3Game) {
          closeDeleteConfirm();
          return;
        }

        if (
          pendingConfirmAction === "delete" &&
          typeof global.Match3Game.clearSlot === "function"
        ) {
          global.Match3Game.clearSlot(pendingSlotId);
          refreshSlots();
          closeDeleteConfirm();
          return;
        }

        if (
          pendingConfirmAction === "load" &&
          typeof global.Match3Game.loadFromSlot === "function"
        ) {
          const slotId = pendingSlotId;
          closeDeleteConfirm();
          closeMenuThen(function () {
            const resumed = global.Match3Game.loadFromSlot(slotId);
            if (!resumed && typeof global.Match3Game.start === "function") {
              global.Match3Game.start();
            }
          });
          return;
        }

        closeDeleteConfirm();
      });
    }

    if (deleteConfirmEl) {
      deleteConfirmEl.addEventListener("click", function (ev) {
        if (ev.target === deleteConfirmEl) {
          closeDeleteConfirm();
        }
      });
    }

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && deleteConfirmEl && deleteConfirmEl.classList.contains("is-open")) {
        closeDeleteConfirm();
      }
    });

    showMenu();
  }

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", initMainMenu);
  }
})(typeof window !== "undefined" ? window : globalThis);
