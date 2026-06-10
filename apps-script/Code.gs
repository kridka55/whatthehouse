/*** =========================================================================
 *   WHAT THE HOUSE – ระบบจองคิว + Dashboard งานตรวจบ้าน (Google Apps Script)
 *   - รับฟอร์มจองจากเว็บไซต์  -> บันทึกลง Google Sheet
 *   - สร้างโฟลเดอร์ใน Google Drive ชื่อ "ชื่อลูกค้า_โครงการ" อัตโนมัติ
 *   - แจ้งเตือนอีเมลถึงแอดมินเมื่อมีจองใหม่
 *   - หน้า Dashboard ดูสถานะงาน + แถบ Progress 5 ขั้น + อัปไฟล์เข้า Drive
 *   - ปุ่มส่งอีเมลแจ้งลูกค้าเมื่องานเสร็จ
 *  ========================================================================= ***/

/*** ===== ตั้งค่า (แก้ตรงนี้ได้) ===== ***/
var CONFIG = {
  // รหัส Google Sheet (อยู่ใน URL ของชีตระหว่าง /d/ กับ /edit)
  SHEET_ID: '1Lsn0A5U500QKYRVRh1WWlAACCfZe6lUukVAQmbqlrSQ',

  // รหัสโฟลเดอร์ Google Drive หลัก (อยู่ใน URL ของโฟลเดอร์หลัง /folders/)
  DRIVE_PARENT_FOLDER_ID: '1ouEAja_tG1yZqBCKUNnh0GFTO6cIHB8Y',

  // อีเมลแอดมินที่จะรับแจ้งเตือนเมื่อมีจองใหม่
  ADMIN_EMAIL: 'krid.kt@gmail.com',

  // กุญแจลับสำหรับเปิดหน้า Dashboard (เปลี่ยนเป็นรหัสของคุณเอง, ห้ามบอกใคร)
  DASHBOARD_KEY: 'wth-cnx-2026',

  // ===== กันสแปม =====
  // Secret key ของ Google reCAPTCHA v3 (เอามาจากหน้าสมัคร) — ปล่อยว่างไว้แบบนี้ = ยังไม่เปิดใช้
  RECAPTCHA_SECRET: 'PASTE_RECAPTCHA_SECRET_KEY_HERE',
  RECAPTCHA_MIN_SCORE: 0.1,   // คะแนนต่ำกว่านี้ถือว่าเป็นบอท (ตั้งต่ำไว้ กันบล็อกลูกค้าจริงพลาด)
  MIN_FILL_SECONDS: 3,        // ถ้ากรอกเสร็จเร็วกว่านี้ (วินาที) ถือว่าเป็นบอท

  BUSINESS_NAME: 'WHAT THE HOUSE – Home Inspections',
  TIMEZONE: 'Asia/Bangkok',

  // ขั้นตอนงาน (Progress) 5 ขั้น
  STAGES: ['จองคิว', 'นัดหมาย', 'ตรวจหน้างาน', 'จัดทำรายงาน', 'ส่งรายงาน/เสร็จสิ้น']
};

// หัวตารางในชีต (คอลัมน์ A..N)
var HEADERS = ['รหัสงาน', 'วันที่จอง', 'สถานะ', 'ชื่อลูกค้า', 'เบอร์โทร', 'อีเมล',
  'ประเภททรัพย์', 'พื้นที่/จังหวัด', 'โครงการ/ขนาด', 'วันที่ต้องการตรวจ',
  'รายละเอียด', 'ลิงก์โฟลเดอร์', 'FolderId', 'อัปเดตล่าสุด'];


/*** ===== ตัวรับฟอร์มจองจากเว็บไซต์ ===== ***/
function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      try { data = JSON.parse(e.postData.contents); }
      catch (_) { data = (e.parameter || {}); }
    } else {
      data = (e && e.parameter) || {};
    }

    // ----- กันสแปม / บอท -----
    // 1) honeypot: ถ้าช่องซ่อน (company) มีค่า = บอท ทิ้งเงียบ ๆ
    if (data.company) return jsonOut_({ ok: true });

    // 2) กับดักเวลา: กรอกเสร็จเร็วผิดมนุษย์ = บอท
    var elapsed = Number(data.elapsed || 0); // มิลลิวินาทีจากตอนเปิดหน้า
    if (elapsed > 0 && elapsed < CONFIG.MIN_FILL_SECONDS * 1000) return jsonOut_({ ok: true });

    // 3) reCAPTCHA v3 (ตรวจเฉพาะเมื่อตั้งค่า secret แล้ว)
    if (!verifyRecaptcha_(data.recaptchaToken)) {
      return jsonOut_({ ok: false, error: 'reCAPTCHA ไม่ผ่าน' });
    }

    // 4) ตรวจความถูกต้อง: ต้องมีชื่อ, เบอร์โทร 10 หลักพอดี, อีเมลรูปแบบถูกต้อง
    var nameRaw = String(data.name || '').trim();
    var phoneDigits = String(data.phone || '').replace(/\D/g, '');
    var emailRaw = String(data.email || '').trim();
    var emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw);
    if (!nameRaw || phoneDigits.length !== 10 || !emailOk) {
      return jsonOut_({ ok: false, error: 'ข้อมูลไม่ถูกต้อง (ต้องมีชื่อ / เบอร์ 10 หลัก / อีเมลที่ถูกต้อง)' });
    }

    // 5) กันส่งซ้ำรัว ๆ: ชื่อ+เบอร์+ข้อความเดิมภายใน 5 นาที = ข้าม
    var cache = CacheService.getScriptCache();
    var sig = 'dup_' + Utilities.base64EncodeWebSafe(
      Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, nameRaw + '|' + phoneDigits + '|' + String(data.message || '')));
    if (cache.get(sig)) return jsonOut_({ ok: true, dup: true });
    cache.put(sig, '1', 300);

    var sheet = getSheet_();

    var name = nameRaw || 'ลูกค้า';
    var project = String(data.project || '').trim();
    var jobId = 'WTH' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyMMdd-HHmmss');

    // สร้างโฟลเดอร์ใน Drive: ชื่อลูกค้า_โครงการ
    var folderName = sanitize_(name) + (project ? '_' + sanitize_(project) : '');
    var parent = DriveApp.getFolderById(CONFIG.DRIVE_PARENT_FOLDER_ID);
    var folder = parent.createFolder(folderName);
    var folderUrl = folder.getUrl();

    var now = nowStr_();
    sheet.appendRow([
      jobId, now, CONFIG.STAGES[0], name,
      String(data.phone || ''), String(data.email || ''),
      String(data.type || ''), String(data.area || ''), project,
      String(data.date || ''), String(data.message || ''),
      folderUrl, folder.getId(), now
    ]);

    notifyAdmin_(jobId, name, project, data, folderUrl);
    return jsonOut_({ ok: true, jobId: jobId });

  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}


/*** ===== เสิร์ฟหน้า Dashboard (ต้องมี key ที่ถูกต้อง) ===== ***/
function doGet(e) {
  var key = (e && e.parameter && e.parameter.key) || '';
  if (key === CONFIG.DASHBOARD_KEY) {
    var t = HtmlService.createTemplateFromFile('Dashboard');
    return t.evaluate()
      .setTitle('WTH Dashboard')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center">' +
    '<h2>' + CONFIG.BUSINESS_NAME + '</h2>' +
    '<p>ต้องระบุกุญแจเข้าถึง (key) ที่ถูกต้องจึงจะเปิด Dashboard ได้</p></div>'
  );
}


/*** ===== ฟังก์ชันที่หน้า Dashboard เรียกใช้ (google.script.run) ===== ***/

// ดึงรายการงานทั้งหมด
function apiGetJobs() {
  var sheet = getSheet_();
  var values = sheet.getDataRange().getValues();
  var jobs = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0]) continue;
    jobs.push({
      jobId: r[0], booked: String(r[1]), status: r[2], name: r[3],
      phone: String(r[4]), email: String(r[5]), type: r[6], area: r[7],
      project: r[8], date: String(r[9]), message: r[10],
      folderUrl: r[11], updated: String(r[13])
    });
  }
  jobs.reverse(); // ใหม่สุดอยู่บนสุด
  return { stages: CONFIG.STAGES, jobs: jobs, business: CONFIG.BUSINESS_NAME };
}

// อัปเดตสถานะงาน
function apiUpdateStatus(jobId, newStatus) {
  var sheet = getSheet_();
  var row = findRow_(sheet, jobId);
  if (row < 0) return { ok: false, error: 'ไม่พบงาน' };
  sheet.getRange(row, 3).setValue(newStatus);   // คอลัมน์ C = สถานะ
  sheet.getRange(row, 14).setValue(nowStr_());  // คอลัมน์ N = อัปเดตล่าสุด
  return { ok: true };
}

// ส่งอีเมลแจ้งลูกค้าว่างานเสร็จ + ตั้งสถานะเป็นขั้นสุดท้าย
function apiSendDone(jobId) {
  var sheet = getSheet_();
  var row = findRow_(sheet, jobId);
  if (row < 0) return { ok: false, error: 'ไม่พบงาน' };
  var r = sheet.getRange(row, 1, 1, 14).getValues()[0];
  var email = String(r[5]).trim();
  if (!email) return { ok: false, error: 'งานนี้ยังไม่มีอีเมลลูกค้า กรุณากรอกอีเมลในชีตก่อน' };

  var name = r[3], project = r[8], folderUrl = r[11];
  var subject = '[WHAT THE HOUSE] รายงานตรวจบ้านของคุณเสร็จเรียบร้อยแล้ว';
  var body =
    'เรียน คุณ' + name + '\n\n' +
    'งานตรวจสอบ' + (project ? ' "' + project + '"' : '') + ' ของคุณดำเนินการเสร็จสิ้นเรียบร้อยแล้ว\n' +
    'คุณสามารถดูรายงานและไฟล์ที่เกี่ยวข้องได้ที่ลิงก์ด้านล่างนี้:\n' +
    folderUrl + '\n\n' +
    'หากมีข้อสงสัยเพิ่มเติม ติดต่อกลับได้ตลอดครับ\n\n' +
    'ขอบคุณที่ใช้บริการ\n' + CONFIG.BUSINESS_NAME;

  MailApp.sendEmail(email, subject, body);
  sheet.getRange(row, 3).setValue(CONFIG.STAGES[CONFIG.STAGES.length - 1]);
  sheet.getRange(row, 14).setValue(nowStr_());
  return { ok: true };
}


/*** ===== ตัวช่วยภายใน ===== ***/

function getSheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sheet = ss.getSheets()[0];
  // ใส่หัวตารางถ้าชีตยังว่าง
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#e8f3ec');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow_(sheet, jobId) {
  var ids = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(jobId)) return i + 1;
  }
  return -1;
}

function sanitize_(s) {
  // ตัดอักขระที่ใช้ตั้งชื่อโฟลเดอร์ไม่ได้
  return String(s).replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim() || 'ลูกค้า';
}

function nowStr_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
}

function verifyRecaptcha_(token) {
  // ยังไม่ตั้งค่า secret -> ข้ามการตรวจ (ระบบยังทำงานได้ปกติ)
  if (!CONFIG.RECAPTCHA_SECRET || String(CONFIG.RECAPTCHA_SECRET).indexOf('PASTE_') === 0) return true;
  if (!token) return true; // ไม่มี token (สคริปต์อาจโหลดไม่ทัน) -> ปล่อยผ่าน กันพลาดลูกค้าจริง
  try {
    var resp = UrlFetchApp.fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'post',
      payload: { secret: String(CONFIG.RECAPTCHA_SECRET).trim(), response: token },
      muteHttpExceptions: true
    });
    var r = JSON.parse(resp.getContentText());
    // บล็อกเฉพาะกรณีตรวจผ่านจริง แล้วได้คะแนนต่ำกว่าเกณฑ์ (บอทชัด ๆ)
    if (r.success === true && typeof r.score === 'number' && r.score < CONFIG.RECAPTCHA_MIN_SCORE) return false;
    // กรณีอื่น (รวม success:false จากตั้งค่า secret ผิด หรือ error) -> ปล่อยผ่าน ไม่ทิ้งลูกค้า
    return true;
  } catch (err) {
    return true; // error -> ปล่อยผ่าน
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function notifyAdmin_(jobId, name, project, data, folderUrl) {
  try {
    var subject = '🔔 มีลูกค้าจองคิวประเมินราคาใหม่: ' + name + (project ? ' (' + project + ')' : '');
    var body =
      'มีคำขอจองคิวประเมินราคาเข้ามาใหม่\n' +
      '------------------------------\n' +
      'รหัสงาน: ' + jobId + '\n' +
      'ชื่อลูกค้า: ' + name + '\n' +
      'เบอร์โทร: ' + (data.phone || '-') + '\n' +
      'อีเมล: ' + (data.email || '-') + '\n' +
      'ประเภททรัพย์: ' + (data.type || '-') + '\n' +
      'พื้นที่: ' + (data.area || '-') + '\n' +
      'โครงการ/ขนาด: ' + (project || '-') + '\n' +
      'วันที่ต้องการตรวจ: ' + (data.date || '-') + '\n' +
      'รายละเอียด: ' + (data.message || '-') + '\n' +
      'โฟลเดอร์งาน: ' + folderUrl + '\n' +
      '------------------------------\n' +
      'เปิด Dashboard เพื่อจัดการงานนี้';
    MailApp.sendEmail(CONFIG.ADMIN_EMAIL, subject, body);
  } catch (err) {
    // ไม่ให้การส่งเมลล้มเหลวมากระทบการบันทึกงาน
  }
}

/*** ===== ทดสอบสิทธิ์ครั้งแรก (กดรันฟังก์ชันนี้เพื่ออนุญาตสิทธิ์) ===== ***/
function setup() {
  getSheet_();                                  // เข้าถึง Sheet
  DriveApp.getFolderById(CONFIG.DRIVE_PARENT_FOLDER_ID); // เข้าถึง Drive
  Logger.log('พร้อมใช้งาน: ชีตและโฟลเดอร์เชื่อมต่อเรียบร้อย');
}
