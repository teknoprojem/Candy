(function (global) {
  "use strict";

  const STORAGE_KEY = "userLanguage";
  const FALLBACK_LANGUAGE = "en";
  const translations = global.MATCH3_TRANSLATIONS || {};
  const preferredOrder = ["en", "tr", "fr", "de", "ru", "it", "hi", "es", "pt", "ja"];
  const allLanguages = Object.keys(translations);
  const supportedLanguages = preferredOrder.filter(function (code) {
    return allLanguages.includes(code);
  });

  function normalizeLanguage(lang) {
    const raw = String(lang || "").trim().toLowerCase();
    if (!raw) return FALLBACK_LANGUAGE;
    const short = raw.split(/[-_]/)[0];
    return supportedLanguages.includes(short) ? short : FALLBACK_LANGUAGE;
  }

  function getStoredLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return "";
      return normalizeLanguage(saved);
    } catch (e) {
      return "";
    }
  }

  class LanguageManagerClass {
    constructor() {
      this.language = FALLBACK_LANGUAGE;
      this._initialized = false;
    }

    init(root) {
      const stored = getStoredLanguage();
      // Prefer explicit user choice; otherwise default to English.
      this.language = stored || FALLBACK_LANGUAGE;
      this._initialized = true;
      this.applyToDom(root || document);
      return this.language;
    }

    getSupportedLanguages() {
      return supportedLanguages.slice();
    }

    getLanguage() {
      return this.language;
    }

    t(key) {
      const current = translations[this.language] || {};
      const fallback = translations[FALLBACK_LANGUAGE] || {};
      return current[key] || fallback[key] || key;
    }

    setLanguage(lang, root) {
      const next = normalizeLanguage(lang);
      this.language = next;
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (e) {}
      this.applyToDom(root || document);
      return next;
    }

    applyToDom(root) {
      const doc = root || document;
      if (!doc || typeof doc.querySelectorAll !== "function") return;
      document.documentElement.lang = this.language;

      const textNodes = doc.querySelectorAll("[data-i18n]");
      for (let i = 0; i < textNodes.length; i++) {
        const el = textNodes[i];
        const key = el.getAttribute("data-i18n");
        if (!key) continue;
        el.textContent = this.t(key);
      }

      const attrNodes = doc.querySelectorAll("[data-i18n-attr]");
      for (let i = 0; i < attrNodes.length; i++) {
        const el = attrNodes[i];
        const spec = el.getAttribute("data-i18n-attr");
        if (!spec) continue;
        const pairs = spec.split(",");
        for (let j = 0; j < pairs.length; j++) {
          const pair = pairs[j].trim();
          if (!pair) continue;
          const parts = pair.split(":");
          if (parts.length !== 2) continue;
          el.setAttribute(parts[0].trim(), this.t(parts[1].trim()));
        }
      }

      const titleEl = document.querySelector("title[data-i18n]");
      if (titleEl) {
        document.title = this.t(titleEl.getAttribute("data-i18n"));
      }
    }
  }

  const manager = new LanguageManagerClass();
  global.LanguageManager = manager;

  if (typeof document !== "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
      manager.init(document);
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
