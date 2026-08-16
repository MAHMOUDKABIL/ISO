# ديوان المُراجِع 🖋

منصة أدوات تدقيق مالي تعمل بخوارزميات التعلم الآلي **غير المُشرِف** — بنيت بـ Vanilla JS و CSS خالص، وتعمل مباشرة في المتصفح.

## 🛠️ الأدوات

| الصفحة | الأداة | الخوارزمية |
|---|---|---|
| `scanner.html` | ماسح الفواتير | Isolation Forest |
| `anomaly.html` | كشف العمليات الشاذة | Isolation + Z-Score + IQR |
| `benford.html` | تحليل قانون بنفور | Benford + MAD |
| `clustering.html` | تجميع المعاملات | K-Means |
| `sampling.html` | عيّنات التدقيق | عشوائي / منتظم / MUS |

## 🎨 التصميم
- لوحة ألوان: **كحلي / رمادي / أبيض**
- خطوط عربية: Cairo + Almarai
- متجاوب بالكامل (موبايل/تابلت/شاشة)

## 🚀 الرفع على GitHub Pages

1. أنشئ مستودعًا جديدًا على GitHub
2. ارفع الملفات كلها (لا حاجة لمجلد خاص)
3. اذهب إلى **Settings → Pages**
4. اختر الفرع `main` والمجلد `/ (root)`
5. انتظر دقيقة ثم افتح: `https://USERNAME.github.io/REPO-NAME/`

## 🔒 الخصوصية
كل المعالجة تتم في متصفح المستخدم — **لا تُرسَل أي بيانات إلى أي خادم**.

## 📦 الملفات
- `index.html` — الصفحة الرئيسية
- `scanner.html`, `anomaly.html`, `benford.html`, `clustering.html`, `sampling.html` — صفحات الأدوات
- `assets/style.css` — التصميم الكامل
- `assets/app.js` — خوارزميات التعلم غير المُشرِف