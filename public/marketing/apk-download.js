(function () {
  var APK_URL = "https://garudaprime.id/downloads/garuda-prime.apk";

  function renderMetaLine(meta) {
    var line = document.getElementById("apk-meta-line");
    if (!line || !meta) return;
    var text = meta.display || meta.copyKey || "";
    if (!text) return;
    if (text.indexOf("|") !== -1) {
      line.textContent = "";
      text.split("|").forEach(function (part) {
        var span = document.createElement("span");
        span.className = "tagline__part";
        span.textContent = part.trim();
        line.appendChild(span);
      });
      return;
    }
    line.textContent = text;
  }

  function setBtnState(btn, state) {
    if (!btn) return;
    var label = btn.querySelector("span");
    if (state === "loading" && label) {
      label.textContent = document.documentElement.lang === "id" ? "Menyiapkan…" : "Preparing…";
      btn.setAttribute("aria-busy", "true");
      return;
    }
    if (state === "error" && label) {
      label.textContent = document.documentElement.lang === "id" ? "APK belum siap" : "APK unavailable";
      btn.classList.add("btn--disabled");
      btn.setAttribute("aria-disabled", "true");
      return;
    }
    btn.removeAttribute("aria-busy");
    btn.removeAttribute("aria-disabled");
    btn.classList.remove("btn--disabled");
  }

  function syncApkLinks(version) {
    var suffix = version ? "?v=" + encodeURIComponent(version) : "?t=" + Date.now();
    var url = APK_URL + suffix;
    document.querySelectorAll('a[href*="downloads/garuda-prime.apk"]').forEach(function (anchor) {
      anchor.href = url;
    });
    return url;
  }

  function verifyApk(url, btn) {
    return fetch(url, { method: "HEAD", cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("apk missing");
        var type = (res.headers.get("content-type") || "").toLowerCase();
        if (type && type.indexOf("html") !== -1) throw new Error("apk html");
        return res;
      })
      .catch(function () {
        setBtnState(btn, "error");
      });
  }

  function init() {
    var btn = document.getElementById("apk-download-btn");
    setBtnState(btn, "loading");

    fetch("/apk-meta.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .catch(function () { return null; })
      .then(function (meta) {
        renderMetaLine(meta);
        var url = syncApkLinks(meta && meta.version);
        setBtnState(btn, null);
        return verifyApk(url, btn);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
