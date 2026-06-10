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


/*** ===== เสิร์ฟหน้าเว็บ: ?app=tech = แอปช่าง, ?key=... = Dashboard ===== ***/
function doGet(e) {
  var p = (e && e.parameter) || {};

  // แอปทีมช่าง (ล็อกอินด้วยชื่อ+PIN ในหน้าแอป)
  if (p.app === 'tech') {
    return HtmlService.createTemplateFromFile('Technician').evaluate()
      .setTitle('WTH ช่างตรวจบ้าน')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  // Dashboard แอดมิน (ต้องมี key)
  if (p.key === CONFIG.DASHBOARD_KEY) {
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

/*** ==============================================================
 *   ระบบทีมช่างลงพื้นที่ (Technician app) — เชื่อมกับงานตรวจบ้านเดิม
 *  ============================================================== ***/

var TECH_SHEET = 'ช่าง';        // ชีตรายชื่อช่าง: [ชื่อช่าง, PIN, ใช้งาน]
var DEFECT_SHEET = 'Defects';   // ชีตจุดที่ตรวจพบ
var DEFECT_HEADERS = ['DefectID', 'JobID', 'วันที่', 'ช่าง', 'พื้นที่', 'ลำดับ', 'คำอธิบาย', 'ลิงก์รูป', 'FileId'];
var STAGE_INSPECT = 2; // index ของ 'ตรวจหน้างาน'
var STAGE_REPORT = 3;  // index ของ 'จัดทำรายงาน'

function getTechSheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sh = ss.getSheetByName(TECH_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TECH_SHEET);
    sh.appendRow(['ชื่อช่าง', 'PIN', 'ใช้งาน (yes/no)']);
    sh.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#e8f3ec');
    sh.setFrozenRows(1);
  }
  return sh;
}

function getDefectSheet_() {
  var ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  var sh = ss.getSheetByName(DEFECT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(DEFECT_SHEET);
    sh.appendRow(DEFECT_HEADERS);
    sh.getRange(1, 1, 1, DEFECT_HEADERS.length).setFontWeight('bold').setBackground('#e8f3ec');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ตรวจชื่อช่าง + PIN จากชีต "ช่าง"
function techVerify_(name, pin) {
  if (!name || !pin) return false;
  var vals = getTechSheet_().getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    var n = String(vals[i][0]).trim();
    var p = String(vals[i][1]).trim();
    var active = String(vals[i][2] === '' ? 'yes' : vals[i][2]).trim().toLowerCase();
    if (n && n === String(name).trim() && p === String(pin).trim() && active !== 'no') return true;
  }
  return false;
}

function techLogin(name, pin) {
  return techVerify_(name, pin)
    ? { ok: true, name: String(name).trim() }
    : { ok: false, error: 'ชื่อช่างหรือ PIN ไม่ถูกต้อง' };
}

// งานที่ช่างต้องตรวจ (ยังไม่ส่งงาน)
function techGetJobs(name, pin) {
  if (!techVerify_(name, pin)) return { ok: false, error: 'unauthorized' };
  var values = getSheet_().getDataRange().getValues();
  var last = CONFIG.STAGES[CONFIG.STAGES.length - 1];
  var jobs = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[0] || r[2] === last) continue;
    jobs.push({
      jobId: r[0], status: r[2], name: r[3], phone: String(r[4]),
      type: r[6], area: r[7], project: r[8], date: String(r[9]),
      folderUrl: r[11], tech: String(r[14] || '')
    });
  }
  jobs.reverse();
  return { ok: true, stages: CONFIG.STAGES, jobs: jobs };
}

// ช่างเริ่มตรวจงาน -> ขยับสถานะเป็น "ตรวจหน้างาน" + บันทึกชื่อช่าง
function techStartJob(name, pin, jobId) {
  if (!techVerify_(name, pin)) return { ok: false, error: 'unauthorized' };
  var sheet = getSheet_();
  var row = findRow_(sheet, jobId);
  if (row < 0) return { ok: false, error: 'ไม่พบงาน' };
  if (CONFIG.STAGES.indexOf(sheet.getRange(row, 3).getValue()) < STAGE_INSPECT) {
    sheet.getRange(row, 3).setValue(CONFIG.STAGES[STAGE_INSPECT]);
  }
  sheet.getRange(row, 15).setValue(String(name).trim()); // คอลัมน์ O = ช่างผู้ตรวจ
  sheet.getRange(row, 14).setValue(nowStr_());
  return { ok: true };
}

// ดึงจุด defect ของงานหนึ่ง
function techGetDefects(name, pin, jobId) {
  if (!techVerify_(name, pin)) return { ok: false, error: 'unauthorized' };
  var vals = getDefectSheet_().getDataRange().getValues();
  var list = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (String(r[1]) === String(jobId)) {
      list.push({ defectId: r[0], date: String(r[2]), tech: r[3], area: r[4], number: r[5], description: r[6], hasPhoto: !!r[8] });
    }
  }
  return { ok: true, defects: list };
}

// เพิ่มจุด defect + อัปรูปเข้าโฟลเดอร์ Drive ของงาน
function techAddDefect(name, pin, jobId, defect) {
  if (!techVerify_(name, pin)) return { ok: false, error: 'unauthorized' };
  try {
    var bookings = getSheet_();
    var row = findRow_(bookings, jobId);
    if (row < 0) return { ok: false, error: 'ไม่พบงาน' };
    var folderId = bookings.getRange(row, 13).getValue(); // คอลัมน์ M = FolderId
    var photoUrl = '', fileId = '';
    if (defect.photoBase64) {
      var folder = DriveApp.getFolderById(folderId);
      var bytes = Utilities.base64Decode(defect.photoBase64);
      var blob = Utilities.newBlob(bytes, defect.photoType || 'image/jpeg', defect.photoName || ('defect_' + Date.now() + '.jpg'));
      var file = folder.createFile(blob);
      photoUrl = file.getUrl();   // ลิงก์ดูใน Drive (เจ้าของ/แอดมินเปิดได้)
      fileId = file.getId();
    }
    var defectId = 'D' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyMMddHHmmss');
    getDefectSheet_().appendRow([
      defectId, jobId, nowStr_(), String(name).trim(),
      String(defect.area || ''), defect.number || '', String(defect.description || ''),
      photoUrl, fileId
    ]);
    return { ok: true, defectId: defectId };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// สร้างรายงาน PDF จาก defect ทั้งหมดของงาน -> เก็บในโฟลเดอร์ Drive
function techGenerateReport(name, pin, jobId) {
  if (!techVerify_(name, pin)) return { ok: false, error: 'unauthorized' };
  try {
    var bookings = getSheet_();
    var row = findRow_(bookings, jobId);
    if (row < 0) return { ok: false, error: 'ไม่พบงาน' };
    var b = bookings.getRange(row, 1, 1, 15).getValues()[0];
    var custName = b[3], phone = String(b[4]), custArea = b[7], project = b[8], folderId = b[12];

    var dvals = getDefectSheet_().getDataRange().getValues();
    var defects = [];
    for (var i = 1; i < dvals.length; i++) {
      if (String(dvals[i][1]) === String(jobId)) {
        defects.push({ area: String(dvals[i][4]), number: dvals[i][5], description: String(dvals[i][6]), fileId: dvals[i][8] });
      }
    }
    if (defects.length === 0) return { ok: false, error: 'ยังไม่มีจุดที่ตรวจพบ กรุณาเพิ่มอย่างน้อย 1 จุดก่อนออกรายงาน' };

    var dateStr = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'd MMM yyyy');
    var docName = 'รายงานตรวจบ้าน - ' + custName + ' - ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
    var doc = DocumentApp.create(docName);
    var body = doc.getBody();
    body.setMarginTop(40).setMarginBottom(40).setMarginLeft(45).setMarginRight(45);

    body.appendParagraph(CONFIG.BUSINESS_NAME).setHeading(DocumentApp.ParagraphHeading.TITLE);
    body.appendParagraph('รายงานผลการตรวจบ้าน / Home Inspection Report').setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

    var info = body.appendTable([
      ['ลูกค้า', custName], ['โครงการ / ที่ตั้ง', project + (custArea ? '  /  ' + custArea : '')],
      ['เบอร์ติดต่อ', phone], ['ช่างผู้ตรวจ', String(name)],
      ['วันที่ตรวจ', dateStr], ['จำนวนจุดที่พบ', defects.length + ' จุด']
    ]);
    info.setBorderWidth(0);
    for (var ri = 0; ri < info.getNumRows(); ri++) info.getRow(ri).getCell(0).editAsText().setBold(true);

    body.appendParagraph('สรุปภาพรวม').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    var byArea = {};
    defects.forEach(function (d) { var a = d.area || 'ไม่ระบุ'; byArea[a] = (byArea[a] || 0) + 1; });
    var sumRows = [['พื้นที่', 'จำนวนจุดที่พบ']];
    Object.keys(byArea).forEach(function (a) { sumRows.push([a, String(byArea[a])]); });
    var st = body.appendTable(sumRows);
    st.getRow(0).editAsText().setBold(true);
    st.getRow(0).getCell(0).setBackgroundColor('#e8f3ec');
    st.getRow(0).getCell(1).setBackgroundColor('#e8f3ec');

    body.appendParagraph('รายละเอียดจุดที่ตรวจพบ').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    defects.forEach(function (d, idx) {
      body.appendParagraph((idx + 1) + '. ' + (d.area || '-') + (d.number ? '  (จุดที่ ' + d.number + ')' : ''))
        .setHeading(DocumentApp.ParagraphHeading.HEADING2);
      body.appendParagraph('รายละเอียด: ' + (d.description || '-'));
      if (d.fileId) {
        try {
          var pic = body.appendImage(DriveApp.getFileById(d.fileId).getBlob());
          var w = pic.getWidth(), h = pic.getHeight(), maxW = 340;
          if (w > maxW) { pic.setWidth(maxW); pic.setHeight(Math.round(h * maxW / w)); }
        } catch (e) { body.appendParagraph('(แนบรูปไม่สำเร็จ)'); }
      }
      body.appendParagraph('');
    });

    body.appendParagraph('ความเห็น / สรุปท้ายรายงาน').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('________________________________________________________________');
    body.appendParagraph('________________________________________________________________');
    body.appendParagraph('');
    var sign = body.appendTable([
      ['ลงชื่อ ช่างผู้ตรวจ', 'ลงชื่อ ผู้รับรายงาน'],
      ['', ''],
      ['(  ' + name + '  )', '(________________________)'],
      ['วันที่ ' + dateStr, 'วันที่ ____/____/____']
    ]);
    sign.setBorderWidth(0);

    doc.saveAndClose();
    var pdf = DriveApp.getFileById(doc.getId()).getAs('application/pdf').setName(docName + '.pdf');
    var pdfFile = DriveApp.getFolderById(folderId).createFile(pdf);
    DriveApp.getFileById(doc.getId()).setTrashed(true); // ลบไฟล์ Doc ชั่วคราว

    if (CONFIG.STAGES.indexOf(bookings.getRange(row, 3).getValue()) < STAGE_REPORT) {
      bookings.getRange(row, 3).setValue(CONFIG.STAGES[STAGE_REPORT]);
    }
    bookings.getRange(row, 14).setValue(nowStr_());

    return { ok: true, pdfUrl: pdfFile.getUrl(), name: pdfFile.getName() };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}


/*** ===== ทดสอบสิทธิ์ครั้งแรก (กดรันฟังก์ชันนี้เพื่ออนุญาตสิทธิ์) ===== ***/
function setup() {
  getSheet_();                                            // เข้าถึง Sheet งานจอง
  getTechSheet_();                                        // สร้างชีต "ช่าง"
  getDefectSheet_();                                      // สร้างชีต "Defects"
  DriveApp.getFolderById(CONFIG.DRIVE_PARENT_FOLDER_ID);  // เข้าถึง Drive
  var d = DocumentApp.create('wth-permission-check');     // ขอสิทธิ์ DocumentApp (สำหรับออก PDF)
  DriveApp.getFileById(d.getId()).setTrashed(true);
  Logger.log('พร้อมใช้งาน: ชีต/โฟลเดอร์/เอกสารเชื่อมต่อเรียบร้อย — เพิ่มรายชื่อช่างในชีต "ช่าง" ได้เลย');
}
