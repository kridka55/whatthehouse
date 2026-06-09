/* WHAT THE HOUSE – shared interactions
   - TH/EN language toggle (persisted)
   - mobile nav
   - FAQ accordion
   - contact form (honeypot anti-spam, no backend yet) */
(function () {
  "use strict";

  /* ---------- language ---------- */
  var KEY = "wth_lang";
  function applyLang(lang) {
    document.body.classList.toggle("en", lang === "en");
    document.documentElement.lang = lang === "en" ? "en" : "th";
    document.querySelectorAll("[data-lang-btn]").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-lang-btn") === lang);
    });
    try { localStorage.setItem(KEY, lang); } catch (e) {}
  }
  var saved = "th";
  try { saved = localStorage.getItem(KEY) || "th"; } catch (e) {}
  applyLang(saved);
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-lang-btn]");
    if (btn) applyLang(btn.getAttribute("data-lang-btn"));
  });

  /* ---------- mobile nav ---------- */
  var burger = document.querySelector(".burger");
  var links = document.querySelector(".nav-links");
  if (burger && links) {
    burger.addEventListener("click", function () {
      links.classList.toggle("open");
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) links.classList.remove("open");
    });
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll(".faq-q").forEach(function (q) {
    q.addEventListener("click", function () {
      q.parentElement.classList.toggle("open");
    });
  });

  /* ---------- contact form ---------- */
  var form = document.querySelector("#contactForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      // honeypot: if filled, silently drop (bot)
      var hp = form.querySelector('input[name="company"]');
      if (hp && hp.value) return;
      var ok = form.querySelector("#formOk");
      if (ok) ok.style.display = "block";
      form.reset();
    });
  }
})();
