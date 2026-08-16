# -*- coding: utf-8 -*-
"""ديوان المُراجِع — أدوات تدقيق مالي بالتعلّم الآلي غير المُشرِف."""
import io, math, os, random, re

import numpy as np
import pandas as pd
from flask import Flask, render_template, request
from sklearn.ensemble import IsolationForest
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024  # 4MB

NAV = [
    {"endpoint": "index",      "label": "الرئيسية",            "num": "٠١"},
    {"endpoint": "scanner",    "label": "ماسح الفواتير",       "num": "٠٢"},
    {"endpoint": "anomaly",    "label": "كشف العمليات الشاذة", "num": "٠٣"},
    {"endpoint": "benford",    "label": "تحليل قانون بنفور",   "num": "٠٤"},
    {"endpoint": "clustering", "label": "تجميع المعاملات",     "num": "٠٥"},
    {"endpoint": "sampling",   "label": "عيّنات التدقيق",      "num": "٠٦"},
]

@app.context_processor
def inject_nav():
    return {"nav": NAV}

# --------------------------------------------------------------- أدوات البيانات
AMOUNT_KEYS = ("مبلغ", "المبلغ", "قيمة", "القيمة", "amount", "total", "price")
LABEL_KEYS  = ("مورد", "المورد", "بيان", "البيان", "وصف", "الوصف", "بند", "vendor", "description", "item")
NUMBER_KEYS = ("رقم", "الرقم", "رقم الفاتورة", "number", "id", "no", "ref")

def _pick(df, keys):
    for c in df.columns:
        if str(c).strip().lower() in keys:
            return c
    for c in df.columns:
        for k in keys:
            if k in str(c).lower():
                return c
    return None

def demo_data(n=60, seed=7):
    """بيانات تجريبية مع حقن حالات شاذة عمدًا."""
    vendors = ["شركة النخيل للتوريدات", "مؤسسة الأفق للتقنية", "مصنع البحر للمعادن",
               "دار الصرح للطباعة", "شركة المدى للخدمات"]
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        base = rng.choice([1200, 2500, 4800, 950, 7300])
        rows.append((f"INV-{1000+i}", rng.choice(vendors), round(base * rng.uniform(.8, 1.25), 2)))
    rows += [("INV-1901", vendors[1], 97500.0),
             ("INV-1902", vendors[3], 13.5),
             ("INV-1903", vendors[0], 88888.0),
             ("INV-1904", vendors[2], 61234.0)]
    return pd.DataFrame(rows, columns=["id", "label", "amount"])

def load_records(demo=False, file=None, text=None):
    """توحيد المدخلات إلى أعمدة: id , label , amount."""
    has_file = bool(file and getattr(file, "filename", ""))
    has_text = bool((text or "").strip())
    if demo or (not has_file and not has_text):
        return demo_data()

    if has_file:
        raw = file.read()
        decoded = None
        for enc in ("utf-8-sig", "cp1256"):
            try:
                decoded = raw.decode(enc); break
            except UnicodeDecodeError:
                continue
        source = decoded or raw.decode("utf-8", errors="replace")
    else:
        source = text

    df = pd.read_csv(io.StringIO(source.strip()))
    df.columns = [str(c).strip() for c in df.columns]

    amt_col = _pick(df, AMOUNT_KEYS)
    if amt_col is None:
        nums = df.select_dtypes(include=[np.number]).columns
        if len(nums) == 0:
            raise ValueError("لم أجد عمود المبلغ — تأكد أن الملف يحوي عمودًا رقميًا باسم «المبلغ» أو «القيمة».")
        amt_col = nums[-1]

    out = pd.DataFrame()
    out["amount"] = pd.to_numeric(df[amt_col].astype(str).str.replace(",", "", regex=False), errors="coerce")
    lbl = _pick(df, LABEL_KEYS)
    num = _pick(df, NUMBER_KEYS)
    out["label"] = df[lbl].astype(str) if lbl else [f"بند {i+1}" for i in range(len(df))]
    out["id"]    = df[num].astype(str) if num else [str(i+1) for i in range(len(df))]
    out = out.dropna(subset=["amount"])
    out = out[out["amount"] > 0]
    if out.empty:
        raise ValueError("لا توجد صفوف صالحة بعد تنقية البيانات.")
    return out.reset_index(drop=True)

# --------------------------------------------------------------- خوارزميات غير مُشرِفة
def build_features(df):
    amt = df["amount"].astype(float)
    feats = pd.DataFrame({
        "amount": amt,
        "log": np.log1p(amt),
        "digits": np.floor(np.log10(amt.clip(lower=1))) + 1,
        "frac": (amt % 1 > 0).astype(int),
        "vendor_freq": df.groupby("label")["amount"].transform("count"),
    })
    return feats

def run_isolation(df, contamination=0.08):
    X = StandardScaler().fit_transform(build_features(df))
    model = IsolationForest(n_estimators=200, contamination=contamination, random_state=42)
    pred = model.fit_predict(X)
    score = -model.score_samples(X)
    df = df.copy()
    df["score"] = (score - score.min()) / (score.max() - score.min() + 1e-9) * 100
    df["flag"] = pred == -1
    return df.sort_values("score", ascending=False).reset_index(drop=True)

# --------------------------------------------------------------- الصفحات
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/scanner", methods=["GET", "POST"])
def scanner():
    result, error = None, None
    if request.method == "POST":
        try:
            cont = float(request.form.get("contamination", 0.08))
            df = load_records("demo" in request.form, request.files.get("file"), request.form.get("text"))
            df = run_isolation(df, cont)
            flagged = df[df["flag"]]
            result = {
                "rows": df.head(100).to_dict("records"),
                "count": len(df), "total": df["amount"].sum(),
                "flag_count": len(flagged),
                "flag_share": round(len(flagged) / len(df) * 100, 1),
                "flag_amount": flagged["amount"].sum() if len(flagged) else 0,
            }
        except Exception as e:
            error = str(e)
    return render_template("scanner.html", result=result, error=error)

@app.route("/anomaly", methods=["GET", "POST"])
def anomaly():
    result, error = None, None
    if request.method == "POST":
        try:
            df = load_records("demo" in request.form, request.files.get("file"), request.form.get("text"))
            df = run_isolation(df, 0.08)
            amt = df["amount"]
            z = (amt - amt.mean()).abs() / (amt.std(ddof=0) + 1e-9)
            q1, q3 = amt.quantile(0.25), amt.quantile(0.75)
            iqr = q3 - q1
            out_iqr = (amt < q1 - 1.5 * iqr) | (amt > q3 + 1.5 * iqr)
            zmax = max(z.max(), 1e-9)
            df["z"] = z.round(2)
            df["risk"] = (df["score"] * 0.60 + (z / zmax * 100) * 0.25 + out_iqr.astype(float) * 15).clip(0, 100).round().astype(int)
            df = df.sort_values("risk", ascending=False).reset_index(drop=True)

            def lvl(r):
                return ("hi", "مرتفعة") if r >= 70 else ("mid", "متوسطة") if r >= 40 else ("lo", "منخفضة")

            rows = []
            for _, r in df.head(100).iterrows():
                cls, tag = lvl(r["risk"])
                rows.append({**r.to_dict(), "cls": cls, "tag": tag})
            result = {"rows": rows, "count": len(df),
                      "high": int((df["risk"] >= 70).sum()),
                      "mid": int(((df["risk"] >= 40) & (df["risk"] < 70)).sum())}
        except Exception as e:
            error = str(e)
    return render_template("anomaly.html", result=result, error=error)

@app.route("/benford", methods=["GET", "POST"])
def benford():
    result, error = None, None
    if request.method == "POST":
        try:
            df = load_records("demo" in request.form, request.files.get("file"), request.form.get("text"))
            ints = df["amount"].abs().astype(int)
            ints = ints[ints > 0]
            if len(ints) < 30:
                raise ValueError("قانون بنفور يحتاج ٣٠ رقمًا على الأقل لنتيجة يُعتد بها.")
            first = ints.astype(str).str[0].astype(int)
            obs = first.value_counts(normalize=True).reindex(range(1, 10), fill_value=0)
            exp = pd.Series({d: math.log10(1 + 1 / d) for d in range(1, 10)})
            mad = float((obs - exp).abs().mean())
            if   mad < 0.006: verdict, grade = "توافق ممتاز مع القانون — لا مؤشرات على تلاعب", "ok"
            elif mad < 0.012: verdict, grade = "توافق مقبول — الوضع طبيعي إجمالًا", "ok"
            elif mad < 0.015: verdict, grade = "توافق ضعيف — يُنصح بفحص استقصائي", "warn"
            else:             verdict, grade = "انحراف جوهري عن القانون — يلزم فحص موسّع", "bad"
            maxv = max(obs.max(), exp.max()) * 100
            result = {
                "bars": [{"d": d, "obs": round(obs[d]*100, 1), "exp": round(exp[d]*100, 1)} for d in range(1, 10)],
                "maxv": maxv, "mad": round(mad, 4), "verdict": verdict, "grade": grade, "n": len(ints),
            }
        except Exception as e:
            error = str(e)
    return render_template("benford.html", result=result, error=error)

@app.route("/clustering", methods=["GET", "POST"])
def clustering():
    result, error = None, None
    if request.method == "POST":
        try:
            df = load_records("demo" in request.form, request.files.get("file"), request.form.get("text"))
            k = min(max(int(request.form.get("k", 3)), 2), 5)
            if len(df) < k * 3:
                raise ValueError("عدد الصفوف قليل نسبةً إلى عدد الشرائح المطلوب.")
            X = StandardScaler().fit_transform(pd.DataFrame({
                "amount": df["amount"],
                "log": np.log1p(df["amount"]),
                "digits": np.floor(np.log10(df["amount"].clip(lower=1))) + 1,
            }))
            km = KMeans(n_clusters=k, n_init=10, random_state=42).fit(X)
            df = df.copy(); df["c"] = km.labels_
            order = df.groupby("c")["amount"].mean().sort_values(ascending=False).index.tolist()
            names = ["الشريحة المرتفعة", "الشريحة المتوسطة", "الشريحة المنخفضة", "الشريحة الصغرى", "الشريحة الدنيا"]
            total = df["amount"].sum()
            clusters = []
            for rank, c in enumerate(order):
                g = df[df["c"] == c]
                top = g.loc[g["amount"].idxmax()]
                clusters.append({
                    "name": names[rank], "count": len(g), "total": g["amount"].sum(),
                    "avg": g["amount"].mean(), "share": g["amount"].sum() / total * 100,
                    "max": top["amount"], "max_label": top["label"],
                    "top": g.sort_values("amount", ascending=False).head(3).to_dict("records"),
                })
            result = {"clusters": clusters, "count": len(df), "k": k}
        except Exception as e:
            error = str(e)
    return render_template("clustering.html", result=result, error=error)

@app.route("/sampling", methods=["GET", "POST"])
def sampling():
    result, error = None, None
    if request.method == "POST":
        try:
            method = request.form.get("method", "simple")
            if method == "mus":
                txt = (request.form.get("amounts") or "").strip()
                if not txt:
                    raise ValueError("عينة الوحدات النقدية (MUS) تحتاج إلى لصق المبالغ أولًا.")
                vals = []
                for tok in re.split(r"[,\s;،٬]+", txt):
                    try: vals.append(float(tok))
                    except ValueError: pass
                vals = [v for v in vals if v > 0]
                if not vals:
                    raise ValueError("لم أستخرج أي مبالغ صالحة من النص الملصوق.")
                df = pd.DataFrame({"id": [str(i+1) for i in range(len(vals))],
                                   "label": [f"مفردة {i+1}" for i in range(len(vals))],
                                   "amount": vals})
                N = len(df); n = min(max(int(request.form.get("n", 25)), 1), N)
                total = df["amount"].sum(); interval = total / n
                r0 = random.uniform(0, interval)
                points = [r0 + i * interval for i in range(n)]
                cum = df["amount"].cumsum()
                picks, pi = [], 0
                for p in points:
                    while pi < N - 1 and cum.iloc[pi] < p:
                        pi += 1
                    if not picks or picks[-1]["idx"] != pi:
                        picks.append({"idx": pi, "id": df["id"][pi],
                                      "label": df["label"][pi], "amount": df["amount"][pi]})
                result = {"method": "mus", "picks": picks, "n": len(picks),
                          "total": total, "interval": interval}
            else:
                N = int(request.form.get("N", 500)); n = int(request.form.get("n", 25))
                if N < 2 or n < 1 or n > N:
                    raise ValueError("تحقق من الأرقام: يجب أن يكون حجم العينة بين 1 وحجم المجتمع.")
                if method == "systematic":
                    k = max(1, N // n); start = random.randint(1, k)
                    sel = list(range(start, N + 1, k))[:n]
                    note = f"الفاصل المنتظم = {k} ، ونقطة البداية العشوائية = {start}"
                else:
                    sel = sorted(random.sample(range(1, N + 1), n))
                    note = "اختيار عشوائي بسيط — لكل مفردة فرصة متساوية"
                result = {"method": method, "nums": sel, "n": len(sel), "note": note, "N": N}
        except Exception as e:
            error = str(e)
    return render_template("sampling.html", result=result, error=error)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)