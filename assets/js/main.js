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

  /* ---------- contact / booking form ---------- */
  // วาง URL ของ Apps Script Web App (ลงท้าย /exec) ที่นี่ หลัง Deploy เสร็จ
  var BOOKING_ENDPOINT = "https://script.google.com/macros/s/AKfycbyOL_bFiw8bpR8ZIS44VA3aUFlkMpzLjMcfPl-2wD_R4hjK0Pvs-Mmn93qPhOEtwG2P/exec";

  var form = document.querySelector("#contactForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      // honeypot: if filled, silently drop (bot)
      var hp = form.querySelector('input[name="company"]');
      if (hp && hp.value) return;

      var btn = form.querySelector('button[type="submit"]');
      var ok = form.querySelector("#formOk");

      // เก็บข้อมูลฟอร์ม
      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });

      function showSuccess() {
        if (ok) ok.style.display = "block";
        form.reset();
        if (btn) { btn.disabled = false; }
      }

      // ยังไม่ได้ตั้งค่า endpoint -> แสดงสำเร็จไปก่อน (กันฟอร์มพัง)
      if (!BOOKING_ENDPOINT || BOOKING_ENDPOINT.indexOf("PASTE_") === 0) {
        showSuccess();
        return;
      }

      if (btn) { btn.disabled = true; }
      fetch(BOOKING_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data)
      }).then(showSuccess).catch(showSuccess);
    });
  }
})();
