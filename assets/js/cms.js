/* cms.js — ดึงเนื้อหาจาก data/*.json (ที่ admin แก้ผ่าน /admin) มาแสดงผล
   ถ้าโหลด JSON ไม่ได้ จะคงเนื้อหา static เดิมไว้ (ปลอดภัย + ดีต่อ SEO) */
(function () {
  function esc(s) {
    return (s == null ? '' : String(s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function getJSON(path) {
    return fetch(path, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  var PH_SVG = '<span class="ph"><svg viewBox="0 0 24 24" width="34" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span class="lang-th">ภาพผลงาน</span><span class="lang-en">work photo</span></span>';
  var POST_PH_SVG = '<svg viewBox="0 0 24 24" width="40" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/></svg>';

  /* ---------- PORTFOLIO ---------- */
  function renderPortfolio() {
    var grid = document.querySelector('.port-grid');
    if (!grid) return;
    getJSON('data/portfolio.json').then(function (d) {
      if (!d || !d.items || !d.items.length) return;
      grid.innerHTML = d.items.map(function (it) {
        var tag = (it.tag_th || it.tag_en)
          ? '<span class="port-tag"><span class="lang-th">' + esc(it.tag_th) + '</span><span class="lang-en">' + esc(it.tag_en) + '</span></span>' : '';
        var media = it.image
          ? '<img src="' + esc(it.image) + '" alt="' + esc(it.title_en || it.title_th) + '" loading="lazy">'
          : PH_SVG;
        return '<div class="port-item"><div class="port-thumb">' + tag + media + '</div>' +
          '<div class="port-body"><b><span class="lang-th">' + esc(it.title_th) + '</span><span class="lang-en">' + esc(it.title_en) + '</span></b>' +
          '<span class="lang-th">' + esc(it.sub_th) + '</span><span class="lang-en">' + esc(it.sub_en) + '</span></div></div>';
      }).join('');
    });
  }

  /* ---------- BLOG ---------- */
  function renderBlog() {
    var grid = document.querySelector('.blog-grid');
    if (!grid) return;
    getJSON('data/blog.json').then(function (d) {
      if (!d || !d.posts || !d.posts.length) return;
      grid.innerHTML = d.posts.map(function (p) {
        var thumb = p.image
          ? '<img src="' + esc(p.image) + '" alt="' + esc(p.title_en || p.title_th) + '" loading="lazy">'
          : POST_PH_SVG;
        var cat = (p.cat_th || p.cat_en)
          ? '<span class="cat"><span class="lang-th">' + esc(p.cat_th) + '</span><span class="lang-en">' + esc(p.cat_en) + '</span></span>' : '';
        return '<article class="post"><div class="post-thumb">' + thumb + '</div>' +
          '<div class="post-body">' + cat +
          '<h3><span class="lang-th">' + esc(p.title_th) + '</span><span class="lang-en">' + esc(p.title_en) + '</span></h3>' +
          '<p><span class="lang-th">' + esc(p.excerpt_th) + '</span><span class="lang-en">' + esc(p.excerpt_en) + '</span></p>' +
          '<span class="meta"><span class="lang-th">' + esc(p.read_th) + '</span><span class="lang-en">' + esc(p.read_en) + '</span></span>' +
          '</div></article>';
      }).join('');
    });
  }

  /* ---------- PRICING ---------- */
  function renderPricing() {
    var grid = document.querySelector('.price-grid');
    if (!grid) return;
    getJSON('data/pricing.json').then(function (d) {
      if (!d || !d.plans || !d.plans.length) return;
      var note = document.querySelector('.price-note');
      if (note && (d.note_th || d.note_en)) {
        note.innerHTML = '<span class="lang-th">' + esc(d.note_th) + '</span><span class="lang-en">' + esc(d.note_en) + '</span>';
      }
      grid.innerHTML = d.plans.map(function (p) {
        var badge = p.featured && (p.tag_th || p.tag_en)
          ? '<span class="tag"><span class="lang-th">' + esc(p.tag_th) + '</span><span class="lang-en">' + esc(p.tag_en) + '</span></span>' : '';
        var unit = (p.unit_th || p.unit_en)
          ? ' <small><span class="lang-th">' + esc(p.unit_th) + '</span><span class="lang-en">' + esc(p.unit_en) + '</span></small>' : '';
        var feats = (p.features || []).map(function (f) {
          return '<li><span class="lang-th">' + esc(f.th) + '</span><span class="lang-en">' + esc(f.en) + '</span></li>';
        }).join('');
        var btnClass = p.featured ? 'btn btn-primary' : 'btn btn-outline';
        return '<div class="price-card' + (p.featured ? ' featured' : '') + '">' + badge +
          '<h3><span class="lang-th">' + esc(p.title_th) + '</span><span class="lang-en">' + esc(p.title_en) + '</span></h3>' +
          '<span class="from"><span class="lang-th">' + esc(p.from_th) + '</span><span class="lang-en">' + esc(p.from_en) + '</span></span>' +
          '<div class="amt"><span class="lang-th">' + esc(p.price_th) + '</span><span class="lang-en">' + esc(p.price_en) + '</span>' + unit + '</div>' +
          '<ul>' + feats + '</ul>' +
          '<a href="contact.html" class="' + btnClass + '"><span class="lang-th">ขอราคา</span><span class="lang-en">Get a quote</span></a>' +
          '</div>';
      }).join('');
    });
  }

  /* ---------- CONTACT (ทุกหน้า) ---------- */
  function renderContact() {
    getJSON('data/contact.json').then(function (c) {
      if (!c) return;

      // ปุ่มกดโทร / ลิงก์โทร ทุกที่ในหน้า (footer + ปุ่มลอย)
      if (c.phone_e164) {
        document.querySelectorAll('a[href^="tel:"]').forEach(function (a) {
          a.setAttribute('href', 'tel:' + c.phone_e164);
          if (/โทร/.test(a.textContent) && c.phone_display) a.textContent = 'โทร: ' + c.phone_display;
        });
      }
      // อีเมล
      if (c.email) {
        document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
          a.setAttribute('href', 'mailto:' + c.email);
          if (/@/.test(a.textContent)) a.textContent = c.email;
        });
      }
      // ปุ่ม LINE ลอย
      var fcLine = document.querySelector('.fc-line');
      if (fcLine && c.line_url) fcLine.setAttribute('href', c.line_url);

      // การ์ดช่องทางในหน้า Contact
      var cards = document.querySelector('.contact-cards');
      if (cards) {
        var html = '';
        if (c.phone_display) html += card('tel:' + (c.phone_e164 || ''), '#2e9e4f', 'TEL', '<span class="lang-th">โทรศัพท์</span><span class="lang-en">Phone</span>', c.phone_display);
        if (c.line_id) html += card(c.line_url || '#', '#06c755', 'LINE', 'LINE Official', c.line_id);
        if (c.facebook_name) html += card(c.facebook_url || '#', '#1877f2', 'FB', 'Facebook Page', c.facebook_name);
        if (c.email) html += card('mailto:' + c.email, '#16314f', '@', 'Email', c.email);
        if (c.wechat_id) html += card('#', '#09b83e', 'WC', 'WeChat', c.wechat_id);
        cards.innerHTML = html;
      }

      // แผนที่
      var map = document.querySelector('.map-embed');
      if (map && c.map_embed && c.map_embed.trim()) {
        map.innerHTML = c.map_embed;
        map.classList.add('has-map');
      }
    });
  }
  function card(href, color, ic, title, sub) {
    return '<a class="contact-card" href="' + esc(href) + '"><span class="cic" style="background:' + esc(color) + '">' + esc(ic) + '</span>' +
      '<span><b>' + title + '</b><br><span>' + esc(sub) + '</span></span></a>';
  }

  function init() {
    renderPortfolio();
    renderBlog();
    renderPricing();
    renderContact();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
