// spawnpoint landing — progressive enhancement only.
// The page is fully readable without JS; this adds accordion + nav behavior.
(function () {
  "use strict";

  // ---- Dark-mode toggle (system default, manual override persisted) ----
  var root = document.documentElement;
  function effectiveTheme() {
    return root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function syncToggles() {
    var mode = effectiveTheme();
    document.querySelectorAll(".theme-toggle").forEach(function (b) { b.setAttribute("data-mode", mode); });
  }
  syncToggles();
  document.querySelectorAll(".theme-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = effectiveTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("theme", next); } catch (e) {}
      syncToggles();
    });
  });

  // (Floating bubbles retired for the calmer, toned-down look.)

  // ---- Copy-to-clipboard (console token reveal) ----
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var el = document.getElementById(btn.getAttribute("data-copy"));
      if (!el) return;
      var text = el.textContent;
      var done = function () {
        var prev = btn.textContent;
        btn.textContent = "Copied ✓";
        setTimeout(function () { btn.textContent = prev; }, 1400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        done();
      }
    });
  });

  // ---- FAQ accordion ----
  document.querySelectorAll(".faq-q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".faq-item");
      var answer = item.querySelector(".faq-a");
      var isOpen = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", String(isOpen));
      answer.style.maxHeight = isOpen ? answer.scrollHeight + "px" : null;
    });
  });

  // ---- Nav dropdowns (button triggers only) ----
  var navItems = Array.prototype.slice.call(document.querySelectorAll(".nav-item"));
  navItems.forEach(function (item) {
    var trigger = item.querySelector("button.nav-trigger");
    if (!trigger) return; // plain links (e.g. Docs) have no dropdown
    trigger.addEventListener("click", function (e) {
      e.stopPropagation();
      var willOpen = !item.classList.contains("open");
      closeAllDropdowns();
      item.classList.toggle("open", willOpen);
      trigger.setAttribute("aria-expanded", String(willOpen));
    });
  });

  function closeAllDropdowns() {
    navItems.forEach(function (item) {
      item.classList.remove("open");
      var t = item.querySelector("button.nav-trigger");
      if (t) t.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", closeAllDropdowns);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAllDropdowns();
  });

  // ---- Mobile menu toggle ----
  var nav = document.getElementById("nav");
  var toggle = document.getElementById("navToggle");
  if (nav && toggle) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }
})();
