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

  // reCAPTCHA v3 site key (ค่าสาธารณะ ใส่ในเว็บได้) — ปล่อย PASTE_ ไว้ = ยังไม่เปิดใช้
  var RECAPTCHA_SITE_KEY = "6LeW1xYtAAAAAKdt62WW6oqR82GOmp0Qvw0YVUru";
  var recaptchaReady = false;

  var form = document.querySelector("#contactForm");
  if (form) {
    var formLoadedAt = Date.now();
    var lastSubmitAt = 0;

    // โหลดสคริปต์ reCAPTCHA เฉพาะหน้าที่มีฟอร์ม และเมื่อใส่ site key แล้ว
    if (RECAPTCHA_SITE_KEY && RECAPTCHA_SITE_KEY.indexOf("PASTE_") !== 0) {
      var rc = document.createElement("script");
      rc.src = "https://www.google.com/recaptcha/api.js?render=" + RECAPTCHA_SITE_KEY;
      rc.onload = function () { recaptchaReady = true; };
      document.head.appendChild(rc);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // honeypot: ถ้าช่องซ่อนมีค่า = บอท
      var hp = form.querySelector('input[name="company"]');
      if (hp && hp.value) return;

      // กันกดถี่: ส่งซ้ำได้ทุก 30 วินาที
      if (Date.now() - lastSubmitAt < 30000) return;

      // ตรวจความถูกต้องของข้อมูล
      var errEl = form.querySelector("#formErr");
      var emailEl = form.querySelector('input[name="email"]');
      var phoneEl = form.querySelector('input[name="phone"]');
      var emailVal = (emailEl ? emailEl.value : "").trim();
      var phoneDigits = (phoneEl ? phoneEl.value : "").replace(/\D/g, "");
      function showErr(msg, el) {
        if (errEl) { errEl.textContent = msg; errEl.style.display = "block"; }
        if (el) { el.focus(); }
      }
      if (errEl) { errEl.style.display = "none"; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        showErr("กรุณากรอกอีเมลให้ถูกต้อง (ต้องมี @ และโดเมน เช่น name@email.com)", emailEl);
        return;
      }
      if (phoneDigits.length !== 10) {
        showErr("เบอร์โทรต้องเป็นตัวเลข 10 หลักเท่านั้น เช่น 0812345678", phoneEl);
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      var ok = form.querySelector("#formOk");

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      data.elapsed = Date.now() - formLoadedAt; // กับดักเวลา (server ตรวจ)

      function showSuccess() {
        lastSubmitAt = Date.now();
        if (ok) ok.style.display = "block";
        form.reset();
        formLoadedAt = Date.now();
        if (btn) { btn.disabled = false; }
      }

      function doSend(token) {
        data.recaptchaToken = token || "";
        // ยังไม่ตั้งค่า endpoint -> แสดงสำเร็จไปก่อน (กันฟอร์มพัง)
        if (!BOOKING_ENDPOINT || BOOKING_ENDPOINT.indexOf("PASTE_") === 0) { showSuccess(); return; }
        if (btn) { btn.disabled = true; }
        fetch(BOOKING_ENDPOINT, {
          method: "POST",
          mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(data)
        }).then(showSuccess).catch(showSuccess);
      }

      // ขอ token จาก reCAPTCHA ถ้าพร้อม ไม่งั้นส่งเลย
      if (recaptchaReady && window.grecaptcha) {
        window.grecaptcha.ready(function () {
          window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "booking" })
            .then(doSend).catch(function () { doSend(""); });
        });
      } else {
        doSend("");
      }
    });
  }
})();
