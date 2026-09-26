(function () {
  var STORAGE_KEY = "garuda_prime_lang";

  var registryData = null;
  var currentLang = "id";
  var menuOpen = false;

  function getBundle() {
    return window.MARKETING_COPY_BUNDLE || {};
  }

  function normalizeLang(value) {
    if (!registryData) return value === "gb" || value === "en" ? "gb" : "id";
    if (!value) return "id";
    if (registryData.supported.indexOf(value) !== -1) return value;
    return registryData.legacyMap[value] || "id";
  }

  function getEntry(code) {
    if (!registryData) return null;
    for (var i = 0; i < registryData.registry.length; i++) {
      if (registryData.registry[i].code === code) return registryData.registry[i];
    }
    return registryData.registry[0];
  }

  function i18nKeyFor(lang) {
    var entry = getEntry(lang);
    return (entry && entry.i18nKey) || "en";
  }

  function getCopy(lang) {
    var bundle = getBundle();
    var key = i18nKeyFor(lang);
    return bundle[key] || bundle.en || bundle.id || {};
  }

  function uiLocaleFor(lang) {
    return i18nKeyFor(lang) === "id" ? "id" : "en";
  }

  function countryName(entry, lang) {
    return uiLocaleFor(lang) === "id" ? entry.countryNameId : entry.countryNameEn;
  }

  function languageName(entry, lang) {
    return uiLocaleFor(lang) === "id" ? entry.languageNameId : entry.languageNameEn;
  }

  function regionLabel(region, lang) {
    var copy = getCopy(lang);
    var regionKey = "region_" + region;
    if (copy[regionKey]) return copy[regionKey];
    var labels = registryData && registryData.regionLabels && registryData.regionLabels[region];
    if (!labels) return region;
    return uiLocaleFor(lang) === "id" ? labels.id : labels.en;
  }

  function applyLang(lang) {
    currentLang = normalizeLang(lang);
    var entry = getEntry(currentLang);
    var copy = getCopy(currentLang);

    document.documentElement.lang = i18nKeyFor(currentLang);
    document.documentElement.dir = entry && entry.rtl ? "rtl" : "ltr";
    localStorage.setItem(STORAGE_KEY, currentLang);

    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      var key = node.getAttribute("data-i18n");
      if (!key || copy[key] == null) return;
      var value = copy[key];
      if (node.hasAttribute("data-i18n-tagline") && value.indexOf("|") !== -1) {
        node.textContent = "";
        value.split("|").forEach(function (part) {
          var span = document.createElement("span");
          span.className = "tagline__part";
          span.textContent = part.trim();
          node.appendChild(span);
        });
        return;
      }
      node.textContent = value;
    });

    var badge = document.querySelector("[data-lang-badge]");
    if (badge && entry) badge.textContent = entry.countryCode;

    var menuTitle = document.querySelector("[data-lang-menu-title]");
    if (menuTitle) menuTitle.textContent = copy.langLabel;

    syncMenuSelection();
  }

  function syncMenuSelection() {
    document.querySelectorAll("[data-lang-option]").forEach(function (btn) {
      var code = btn.getAttribute("data-lang-option");
      var active = code === currentLang;
      btn.classList.toggle("lang-menu__option--active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function setMenuOpen(open) {
    menuOpen = open;
    var menu = document.getElementById("lang-menu");
    var toggle = document.getElementById("lang-toggle");
    if (!menu || !toggle) return;
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) syncMenuSelection();
  }

  function buildMenu() {
    var menu = document.getElementById("lang-menu");
    if (!menu || !registryData) return;
    menu.innerHTML = "";

    var title = document.createElement("p");
    title.className = "lang-menu__title";
    title.setAttribute("data-lang-menu-title", "");
    title.textContent = getCopy(currentLang).langLabel;
    menu.appendChild(title);

    var scroll = document.createElement("div");
    scroll.className = "lang-menu__scroll";
    menu.appendChild(scroll);

    registryData.regionOrder.forEach(function (region) {
      var entries = registryData.registry.filter(function (e) {
        return e.region === region;
      });
      if (!entries.length) return;

      var group = document.createElement("div");
      group.className = "lang-menu__group";

      var groupTitle = document.createElement("p");
      groupTitle.className = "lang-menu__group-title";
      groupTitle.textContent = regionLabel(region, currentLang);
      group.appendChild(groupTitle);

      entries.forEach(function (entry) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lang-menu__option";
        btn.setAttribute("role", "option");
        btn.setAttribute("data-lang-option", entry.code);

        var code = document.createElement("span");
        code.className = "lang-menu__option-code";
        code.textContent = entry.countryCode;

        var text = document.createElement("span");
        text.className = "lang-menu__option-text";

        var label = document.createElement("span");
        label.className = "lang-menu__option-label";
        label.textContent = countryName(entry, currentLang);

        var sub = document.createElement("span");
        sub.className = "lang-menu__option-sub";
        sub.textContent = languageName(entry, currentLang);

        text.appendChild(label);
        text.appendChild(sub);
        btn.appendChild(code);
        btn.appendChild(text);

        btn.addEventListener("click", function () {
          applyLang(entry.code);
          setMenuOpen(false);
        });

        group.appendChild(btn);
      });

      scroll.appendChild(group);
    });
  }

  function loadRegistry() {
    return fetch("/shared/lang-registry.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("registry fetch failed");
        return res.json();
      })
      .catch(function () {
        return null;
      });
  }

  function init() {
    loadRegistry().then(function (data) {
      registryData = data;
      if (!registryData) {
        registryData = {
          supported: ["id", "gb"],
          legacyMap: { en: "gb" },
          regionOrder: ["primary"],
          regionLabels: { primary: { id: "Utama", en: "Primary" } },
          registry: [
            { code: "id", countryCode: "ID", countryNameId: "Indonesia", countryNameEn: "Indonesia", languageNameId: "Bahasa Indonesia", languageNameEn: "Indonesian", region: "primary", i18nKey: "id" },
            { code: "gb", countryCode: "GB", countryNameId: "Britania Raya", countryNameEn: "United Kingdom", languageNameId: "English", languageNameEn: "English", region: "primary", i18nKey: "en" },
          ],
        };
      }

      buildMenu();
      applyLang(normalizeLang(localStorage.getItem(STORAGE_KEY)));

      var toggle = document.getElementById("lang-toggle");
      if (toggle) {
        toggle.addEventListener("click", function (e) {
          e.stopPropagation();
          setMenuOpen(!menuOpen);
        });
      }

      document.addEventListener("click", function (e) {
        var menu = document.getElementById("lang-menu");
        var btn = document.getElementById("lang-toggle");
        if (!menu || !btn) return;
        if (menu.contains(e.target) || btn.contains(e.target)) return;
        setMenuOpen(false);
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setMenuOpen(false);
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
