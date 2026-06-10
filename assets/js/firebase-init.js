// เริ่มต้น Firebase (compat) — ใช้ร่วมกันหลายหน้า (ฟอร์มจอง / Dashboard / แอปช่าง)
// ต้องโหลด firebase-app-compat.js (+ บริการที่ใช้) ก่อนไฟล์นี้
(function () {
  var firebaseConfig = {
    apiKey: "AIzaSyBMPj3OCw26yAVCcEk3sgUAfnj5i6Ns9yQ",
    authDomain: "whatthehouse-a95c6.firebaseapp.com",
    projectId: "whatthehouse-a95c6",
    storageBucket: "whatthehouse-a95c6.firebasestorage.app",
    messagingSenderId: "101612487838",
    appId: "1:101612487838:web:1589be5337d7c0c8fd678f"
  };
  try {
    if (window.firebase && !firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
  } catch (e) {
    console.warn("Firebase init error:", e);
  }
})();
