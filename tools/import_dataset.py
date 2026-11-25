"""
Copy a balanced sample of REAL cases from the Saudi visual-pollution dataset (YOLO format, zip) into
public/dataset/ so the digital twin can show them. Photos of the same MOMRA case (INC-.. in the file name) stay together.

    python -I tools/import_dataset.py "C:/Users/<you>/Downloads/archive (13).zip" --per-class 10

public/dataset/ is git-ignored: the photos stay on this computer unless you decide to publish them.
"""
import argparse, json, os, random, re, shutil, zipfile
from collections import Counter, defaultdict

CLASSES = ["barrier", "sidewalk", "pothole"]  # dataset.yaml: names: ['barriers', 'sidewalks', 'pothole']
INC = re.compile(r"INC-\d{2}-\d{2}-\d{4,}", re.I)
WHEN = re.compile(r"(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})")

ap = argparse.ArgumentParser()
ap.add_argument("zip")
ap.add_argument("--per-class", type=int, default=10)
ap.add_argument("--split", default="val", choices=["val", "train"])
ap.add_argument("--max-photos", type=int, default=4, help="photos kept per case")
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--out", default="public/dataset")
a = ap.parse_args()

z = zipfile.ZipFile(a.zip)
root = next(n.split("/")[0] for n in z.namelist() if "/labels/" in n)
prefix = f"{root}/labels/{a.split}/"

cases = defaultdict(list)  # INC -> [(image name, label text)]
for n in z.namelist():
    if not n.startswith(prefix) or not n.endswith(".txt"):
        continue
    img = n.replace("/labels/", "/images/")[:-4] + ".jpg"
    if img not in z.NameToInfo:
        continue
    m = INC.search(n)
    key = m.group(0).upper() if m else os.path.basename(img)
    cases[key].append((img, z.read(n).decode("utf-8", "ignore")))

def boxes(text):
    out = []
    for line in text.splitlines():
        p = line.split()
        if len(p) < 5:
            continue
        c, cx, cy, w, h = int(p[0]), *map(float, p[1:5])
        if 0 <= c < 3:
            out.append({"cls": CLASSES[c], "bbox": [round(max(0, cx - w / 2), 4), round(max(0, cy - h / 2), 4), round(min(1, w), 4), round(min(1, h), 4)], "source": "manual"})
    return out

by_class = defaultdict(list)
for key, items in cases.items():
    cls = Counter(b["cls"] for _, t in items for b in boxes(t)).most_common(1)
    if cls:
        by_class[cls[0][0]].append(key)

random.seed(a.seed)
shutil.rmtree(a.out, ignore_errors=True)
os.makedirs(a.out)
manifest = []
for cls in CLASSES:
    keys = sorted(by_class[cls])
    random.shuffle(keys)
    for key in keys[: a.per_class]:
        media = []
        for img, text in sorted(cases[key])[: a.max_photos]:
            fname = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(img))
            with open(os.path.join(a.out, fname), "wb") as f:
                f.write(z.read(img))
            w = WHEN.search(img)
            media.append({
                "type": "image", "file": fname, "name": os.path.basename(img), "annotations": boxes(text),
                "capturedAt": f"{w[1]}-{w[2]}-{w[3]}T{w[4]}:{w[5]}:{w[6]}Z" if w else None,
            })
        manifest.append({"caseId": key, "cls": cls, "media": media})

with open(os.path.join(a.out, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump({"source": "Saudi visual-pollution dataset (MOMRA), " + a.split, "cases": manifest}, f, indent=1)
print(f"{len(manifest)} cases, {sum(len(c['media']) for c in manifest)} photos -> {a.out}")
for cls in CLASSES:
    print(f"  {cls}: {sum(1 for c in manifest if c['cls'] == cls)} cases (available: {len(by_class[cls])})")
