// spawnpoint landing: progressive enhancement only.
// The page is fully readable without JS; this adds accordion + nav behavior.
(function () {
  "use strict";

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

  // ---- Mobile menu toggle ----
  var nav = document.getElementById("nav");
  var toggle = document.getElementById("navToggle");

  function closeMobileMenu() {
    if (nav && nav.classList.contains("open")) {
      nav.classList.remove("open");
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    }
  }

  if (nav && toggle) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Outside-click and Escape close both the dropdowns and the open mobile menu.
  document.addEventListener("click", function (e) {
    closeAllDropdowns();
    if (nav && !nav.contains(e.target)) closeMobileMenu();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { closeAllDropdowns(); closeMobileMenu(); }
  });

  // ---- First-party visit pixel ----
  // Counts unique visitors on our own server: no analytics vendor, no cookie.
  // The server stores a one-way daily hash, never an IP address.
  new Image().src = "https://app.spawnpoint.lol/v.gif?p=" +
    encodeURIComponent(location.pathname) + "&r=" + encodeURIComponent(document.referrer);
})();
