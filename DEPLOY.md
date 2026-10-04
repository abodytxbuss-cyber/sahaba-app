# نشر سحابة — نسخة ثابتة (Static)

هذا المشروع تطبيق ويب ثابت (Static Site). لا يحتاج خادم Node دائم.

## ما الذي يعمل في النسخة الساكنة

| الوظيفة | الحالة |
|---|---|
| الواجهة والتصميم والخطوط | ✅ يعمل |
| `data/*.json` (الفيديوهات والمراحل) | ✅ يعمل |
| `/api/proxy` | ✅ يعمل كـ Serverless Function (Vercel/Netlify) |
| `server.js` (خادم Node الكامل) | ⚠️ لا يعمل — مخصص للتشغيل المحلي |

## المعاينة المحلية

```bash
npm install
npm start          # http://localhost:8080 — خادم Node الكامل
```

للنسخة الساكنة (كما في النشر):

```bash
npx serve .        # أو أي static server
```

## النشر

### Vercel (موصى به)

1. سجّل الدخول: `vercel login`
2. انشر: `vercel --prod`

### Netlify

- Build command: (اتركه فارغاً)
- Publish directory: `.`
- Functions: مجلد `api/` يُنشر تلقائياً

## ملاحظات

- مجلد `assets/` فيه أكثر من 3000 صورة بوستر — حجمه كبير (~90MB). إذا واجهت حد حجم، انقل البوسترات إلى CDN أو أرشف الصور القديمة.
- مجلد `api/` يحتوي `proxy.js` فقط — هو بديل `/api/proxy` الذي كان في `server.js`، بنفس قواعد الأمان.
- `sw.js` يعمل على HTTPS فقط؛ على localhost يعرض تحذير.
- `health.json` موجود لفحص الصحة في البيئات الساكنة.

## البنية

```
├── index.html          الواجهة الرئيسية
├── style.css           التصميم
├── app.js              منطق التطبيق
├── api/proxy.js        وكيل JSON للملفات الخارجية
├── data/*.json         البيانات المحلية (فيديوهات، بوسترات، مراحل)
├── assets/             صور البوسترات والخطوط
├── server.js           خادم Node (للتشغيل المحلي)
├── sw.js               Service Worker (للتخزين المؤقت)
└── vercel.json         إعدادات النشر الساكن
```