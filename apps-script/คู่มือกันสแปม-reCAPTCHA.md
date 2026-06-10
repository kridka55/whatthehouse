# กันสแปมฟอร์มจอง — ชั้น 1 + Google reCAPTCHA v3

## ชั้นที่ 1 (ทำงานทันที ไม่ต้องตั้งค่าอะไร)
ผมใส่ให้แล้วในเว็บและ Apps Script:
- **honeypot** — ช่องซ่อนดักบอท
- **กับดักเวลา** — ถ้ากรอกเสร็จเร็วกว่า 3 วินาที = บอท ไม่บันทึก
- **กันกดถี่** — ส่งซ้ำได้ทุก 30 วินาทีต่อเครื่อง
- **กันส่งซ้ำ** — ชื่อ+เบอร์+ข้อความเดิมภายใน 5 นาที จะไม่บันทึกซ้ำ
- **ตรวจข้อมูลขั้นต่ำ** — ต้องมีชื่อ และเบอร์โทรอย่างน้อย 8 หลัก

## ชั้นที่ 2 — เปิดใช้ reCAPTCHA v3 (กันบอทจริงจัง ฟรี)

### A. สมัครเอา key (ทำครั้งเดียว)
1. เข้า https://www.google.com/recaptcha/admin/create (ล็อกอินบัญชี Google)
2. **Label:** `WHAT THE HOUSE`
3. **reCAPTCHA type:** เลือก **reCAPTCHA v3**
4. **Domains:** ใส่โดเมนเว็บ — `unrivaled-crepe-9dfb59.netlify.app`
   (ถ้ามีโดเมนจริงในอนาคต เช่น whatthehouse.co ให้เพิ่มอีกบรรทัด)
5. ติ๊กยอมรับเงื่อนไข → **Submit**
6. จะได้ key 2 ตัว:
   - **Site Key** (คีย์สาธารณะ ใช้ในเว็บ)
   - **Secret Key** (คีย์ลับ ใช้ในหลังบ้าน — ห้ามเปิดเผย)

### B. ใส่ Secret Key ใน Apps Script (คุณทำเอง — เป็นคีย์ลับ)
1. เปิด Apps Script → ไฟล์ `Code.gs`
2. หาบรรทัด `RECAPTCHA_SECRET: 'PASTE_RECAPTCHA_SECRET_KEY_HERE',`
3. แทนที่ `PASTE_RECAPTCHA_SECRET_KEY_HERE` ด้วย **Secret Key** ของคุณ
4. บันทึก → **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**

### C. ใส่ Site Key ในเว็บ
**ส่ง Site Key มาให้ผมในแชต** (เป็นคีย์สาธารณะ ปลอดภัย) ผมจะใส่ในเว็บแล้ว push ให้
หรือทำเอง: ในไฟล์ `assets/js/main.js` หาบรรทัด
`var RECAPTCHA_SITE_KEY = "PASTE_RECAPTCHA_SITE_KEY_HERE";`
แล้วแทนที่ด้วย Site Key จากนั้นอัปขึ้น GitHub

> เมื่อใส่ครบทั้ง 2 คีย์ reCAPTCHA จะเริ่มทำงานอัตโนมัติ ถ้ายังไม่ใส่ ระบบใช้แค่ชั้นที่ 1 (ก็ยังกันได้ระดับหนึ่ง)
