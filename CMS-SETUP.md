# คู่มือเปิดใช้ระบบหลังบ้าน (Decap CMS)

ระบบนี้ให้ **admin แก้เนื้อหาเองได้โดยไม่ต้องแตะโค้ด** — เข้าหน้า `เว็บไซต์.com/admin` แล้วแก้ได้ 4 อย่าง:
รูป/ผลงาน Portfolio • บทความ Blog • ราคา • ข้อมูลติดต่อ (เบอร์/LINE/FB/อีเมล/WeChat/แผนที่)

> สำคัญ: Decap CMS ต้องให้เว็บอยู่บน **Git (GitHub)** + ต่อ **Netlify** แบบเชื่อม repo
> (ไม่ใช่แบบลากไฟล์วาง drag-and-drop) ระบบหลังบ้านถึงจะทำงาน
> ตัวเว็บฝั่งหน้าบ้านยังลากวางโชว์ลูกค้าได้ตามปกติ — แค่ `/admin` จะใช้ได้หลังทำขั้นตอนล่างนี้

---

## ขั้นตอนเปิดใช้งาน (ทำครั้งเดียว)

### 1. เอาโค้ดขึ้น GitHub
1. สมัคร/ล็อกอิน github.com → สร้าง repo ใหม่ (เช่น `whatthehouse`)
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้เข้า repo (ลากวางผ่านหน้าเว็บ GitHub ได้เลย หรือใช้ git)

### 2. ต่อ Netlify กับ repo
1. app.netlify.com → **Add new site → Import an existing project**
2. เลือก GitHub → เลือก repo `whatthehouse`
3. Build settings ปล่อยว่าง (เว็บ static ไม่ต้อง build) → **Deploy**

### 3. เปิด Netlify Identity (ระบบล็อกอินของ admin)
1. ในไซต์ Netlify → **Integrations / Identity** → **Enable Identity**
2. ไปที่ **Identity → Settings → Registration** → ตั้งเป็น **Invite only**
   (กันคนนอกสมัครเอง — admin จะถูกเชิญเท่านั้น)

### 4. เปิด Git Gateway (ให้ CMS เซฟกลับเข้า repo ได้)
1. **Identity → Services → Git Gateway** → **Enable Git Gateway**

### 5. เชิญ admin
1. **Identity → Invite users** → ใส่อีเมล admin → กด invite
2. admin เปิดอีเมล กดลิงก์ ตั้งรหัสผ่าน เสร็จแล้วเข้าใช้ได้

### 6. ใช้งาน
- เข้า `https://ชื่อไซต์.netlify.app/admin/` → ล็อกอิน
- แก้เนื้อหา → กด **Publish** → Netlify อัปเดตเว็บอัตโนมัติใน ~1 นาที

---

## admin แก้อะไรได้บ้าง (เมนูในหน้า /admin)

| เมนู | แก้อะไร |
|------|---------|
| ผลงาน (Portfolio) | เพิ่ม/ลบ/เรียงผลงาน + **อัปโหลดรูป** (ลากวาง) |
| บทความ (Blog) | เพิ่ม/แก้บทความ + รูปหน้าปก |
| ค่าบริการ (Pricing) | แก้ราคา หน่วย รายการในแพ็กเกจ |
| ข้อมูลติดต่อ (Contact) | เบอร์โทร LINE Facebook อีเมล WeChat + ฝัง Google Map |

แก้ "ข้อมูลติดต่อ" ครั้งเดียว → เบอร์/อีเมลอัปเดตทุกหน้าทั้งเว็บ (footer + ปุ่มลอย)

---

## โครงสร้างไฟล์ที่เกี่ยวกับ CMS
```
admin/
  index.html        ← หน้าล็อกอินหลังบ้าน
  config.yml        ← นิยามว่า admin แก้อะไรได้บ้าง
data/
  portfolio.json    ← เนื้อหาผลงาน (CMS เขียนไฟล์นี้)
  blog.json         ← บทความ
  pricing.json      ← ราคา
  contact.json      ← ข้อมูลติดต่อ
assets/js/cms.js    ← ดึง data/*.json มาแสดงบนหน้าเว็บ
assets/uploads/     ← รูปที่ admin อัปโหลดจะมาเก็บที่นี่ (สร้างอัตโนมัติ)
```

## ทดสอบในเครื่องก่อน deploy (ไม่บังคับ)
หน้าเว็บดึง JSON ผ่าน `fetch` ต้องเปิดผ่าน server (เปิดไฟล์ตรง ๆ ด้วย file:// จะไม่โหลด)
รันคำสั่งนี้ในโฟลเดอร์เว็บ แล้วเปิด http://localhost:8000
```
python3 -m http.server 8000
```
อยากทดสอบหน้า /admin ในเครื่องด้วย ให้เปิด `local_backend: true` ใน config.yml แล้วรัน `npx decap-server`

---

## หมายเหตุเรื่อง SEO
เนื้อหาผลงาน/บทความถูก render ด้วย JavaScript ฝั่งหน้าเว็บ — ใช้งานและโชว์ลูกค้าได้ดี
แต่ถ้าในอนาคตต้องการให้ **บทความติดอันดับ Google เต็มที่** แนะนำอัปเกรดเป็นระบบ build
(เช่น Eleventy + Decap) ที่ render เป็น HTML ตั้งแต่ต้น — แจ้งได้เมื่อถึงจุดนั้น
