(function (global) {
  "use strict";

  const FLAGS = {
    tr: "🇹🇷",
    en: "🇺🇸",
    fr: "🇫🇷",
    de: "🇩🇪",
    ru: "🇷🇺",
    it: "🇮🇹",
    hi: "🇮🇳",
    es: "🇪🇸",
    pt: "🇵🇹",
    ja: "🇯🇵",
  };

  const LABELS = {
    tr: "Turkce",
    en: "English",
    fr: "Francais",
    de: "Deutsch",
    ru: "Russkiy",
    it: "Italiano",
    hi: "Hindi",
    es: "Espanol",
    pt: "Portugues",
    ja: "Nihongo",
  };

  class LanguageSelector {
    constructor(opts) {
      const o = opts || {};
      this.manager = o.manager || global.LanguageManager || null;
      this.onChange = typeof o.onChange === "function" ? o.onChange : null;
      this._outsideClickHandler = null;
      this._escapeHandler = null;
    }

    _labelFor(code) {
      return LABELS[code] || code.toUpperCase();
    }

    _flagFor(code) {
      return FLAGS[code] || "🌐";
    }

    buildSelect() {
      if (!this.manager) return null;
      const wrap = document.createElement("div");
      wrap.className = "language-selector";
      wrap.setAttribute("role", "group");

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "language-selector__trigger";
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.setAttribute("aria-label", this.manager.t("language.label"));

      const triggerText = document.createElement("span");
      triggerText.className = "language-selector__trigger-text";
      trigger.appendChild(triggerText);

      const caret = document.createElement("span");
      caret.className = "language-selector__caret";
      caret.textContent = "▾";
      trigger.appendChild(caret);
      wrap.appendChild(trigger);

      const list = document.createElement("ul");
      list.className = "language-selector__menu";
      list.setAttribute("role", "listbox");
      list.hidden = true;
      wrap.appendChild(list);

      const setOpen = (open) => {
        const isOpen = Boolean(open);
        wrap.classList.toggle("is-open", isOpen);
        list.hidden = !isOpen;
        trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
      };

      const updateTrigger = () => {
        const code = this.manager.getLanguage();
        triggerText.textContent =
          this._flagFor(code) + " " + code.toUpperCase();
      };

      const rebuildOptions = () => {
        list.innerHTML = "";
        const supported = this.manager.getSupportedLanguages();
        const active = this.manager.getLanguage();
        for (let i = 0; i < supported.length; i++) {
          const code = supported[i];
          const li = document.createElement("li");
          li.className = "language-selector__item";

          const itemBtn = document.createElement("button");
          itemBtn.type = "button";
          itemBtn.className = "language-selector__option";
          itemBtn.setAttribute("role", "option");
          itemBtn.setAttribute("aria-selected", code === active ? "true" : "false");
          if (code === active) {
            itemBtn.classList.add("is-active");
          }
          itemBtn.innerHTML =
            "<span class=\"language-selector__flag\">" + this._flagFor(code) +
            "</span><span class=\"language-selector__name\">" + this._labelFor(code) + "</span>";

          itemBtn.addEventListener("click", () => {
            const next = this.manager.setLanguage(code);
            trigger.setAttribute("aria-label", this.manager.t("language.label"));
            updateTrigger();
            rebuildOptions();
            setOpen(false);
            if (this.onChange) {
              this.onChange(next);
            }
          });

          li.appendChild(itemBtn);
          list.appendChild(li);
        }
      };

      trigger.addEventListener("click", () => {
        setOpen(!wrap.classList.contains("is-open"));
      });

      this._outsideClickHandler = (ev) => {
        if (!wrap.contains(ev.target)) {
          setOpen(false);
        }
      };
      document.addEventListener("pointerdown", this._outsideClickHandler);

      this._escapeHandler = (ev) => {
        if (ev.key === "Escape") {
          setOpen(false);
        }
      };
      document.addEventListener("keydown", this._escapeHandler);

      updateTrigger();
      rebuildOptions();
      return wrap;
    }

    mount(container) {
      if (!container || typeof container.appendChild !== "function") {
        return null;
      }
      const select = this.buildSelect();
      if (!select) return null;
      container.appendChild(select);
      return select;
    }
  }

  global.LanguageSelector = LanguageSelector;
})(typeof window !== "undefined" ? window : globalThis);
