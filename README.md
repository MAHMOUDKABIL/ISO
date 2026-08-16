# ديوان المُراجِع 🖋
منصة أدوات تدقيق مالي تعمل بخوارزميات التعلم الآلي **غير المُشرِف** (Python + Flask + CSS).

## الأدوات
| الصفحة | الأداة | الخوارزمية |
|---|---|---|
| ٠٢ | ماسح الفواتير | Isolation Forest |
| ٠٣ | كشف العمليات الشاذة | Isolation + Z-Score + IQR |
| ٠٤ | تحليل قانون بنفور | Benford + MAD |
| ٠٥ | تجميع المعاملات | K-Means |
| ٠٦ | عيّنات التدقيق | عشوائي / منتظم / MUS |

## التشغيل محليًا
pip install -r requirements.txt
python app.py
# ثم افتح http://127.0.0.1:5000

## الرفع إلى GitHub
git init && git add . && git commit -m "ديوان المراجع"
git branch -M main
git remote add origin https://github.com/USERNAME/auditor-diwan.git
git push -u origin main

## الاستضافة المجانية (Flask لا يعمل على GitHub Pages)
- **Render**: New → Web Service → اختر المستودع → Build: `pip install -r requirements.txt` → Start: `python app.py`
- **PythonAnywhere**: رفع الملفات ثم تشغيل Flask من وحدة التحكم.