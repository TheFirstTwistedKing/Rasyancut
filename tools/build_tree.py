"""tree-source.png 에서 나무 실루엣을 따고, 잔가지·뿌리·나무결을 덧붙여
assets/tree-data.js (SVG path 데이터)로 내보낸다.

사용: python3 tools/build_tree.py [--preview 미리보기.png]
필요: numpy, opencv-python-headless, scikit-image
"""
import json, math, sys
from pathlib import Path
import cv2
import numpy as np
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "tree-source.png"
OUT = ROOT / "assets" / "tree-data.js"

PAD = 90          # 사방 여백(원본 px). 잔가지·뿌리가 바깥으로 자라도 잘리지 않게.
SS = 4            # 슈퍼샘플링 배율(곡선 품질)
rng = np.random.default_rng(20261015)

# ---------------------------------------------------------------- 마스크
img = cv2.imread(str(SRC))
h0, w0 = img.shape[:2]
white = (img.min(axis=2) >= 240).astype(np.uint8)
_, lab = cv2.connectedComponents(white, connectivity=4)
border = set(lab[0, :]) | set(lab[-1, :]) | set(lab[:, 0]) | set(lab[:, -1])
bg = np.isin(lab, [b for b in border if b != 0])
mask0 = np.zeros((h0 + 2 * PAD, w0 + 2 * PAD), np.uint8)
mask0[PAD:PAD + h0, PAD:PAD + w0] = (~bg).astype(np.uint8) * 255
H, W = mask0.shape

# 슈퍼샘플 캔버스: 이후 모든 덧그림은 여기에
big = cv2.resize(mask0, (W * SS, H * SS), interpolation=cv2.INTER_CUBIC)
big = cv2.GaussianBlur(big, (0, 0), SS * 0.8)
big = (big > 127).astype(np.uint8) * 255

def disk(x, y, r):
    cv2.circle(big, (int(round(x * SS)), int(round(y * SS))), max(1, int(round(r * SS))), 255, -1, cv2.LINE_8)

# ---------------------------------------------------------------- 골격
sk = skeletonize(mask0 > 0)
dist0 = cv2.distanceTransform((mask0 > 0).astype(np.uint8), cv2.DIST_L2, 5)
ys, xs = np.nonzero(sk)
skpts = np.stack([xs, ys], 1)
skset = {(int(x), int(y)) for x, y in skpts}

def nbrs(x, y):
    return [(x + dx, y + dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)
            if (dx or dy) and (x + dx, y + dy) in skset]

endpoints = [p for p in skset if len(nbrs(*p)) == 1]
BASE = np.array([PAD + 298, PAD + 640.0])   # 줄기 아래쪽 기준점(바깥 방향 판정용)

def walk_back(p, n=14):
    """끝점에서 골격을 따라 n칸 되짚어 방향 벡터(바깥쪽) 반환"""
    path = [p]
    prev = None
    cur = p
    for _ in range(n):
        nb = [q for q in nbrs(*cur) if q != prev]
        if not nb:
            break
        prev, cur = cur, nb[0]
        path.append(cur)
    v = np.array(path[0], float) - np.array(path[-1], float)
    nrm = np.linalg.norm(v)
    return v / nrm if nrm else np.array([0, -1.0])

# ---------------------------------------------------------------- 잔가지
def grow(x, y, ang, width, length, depth, bias_up=0.035, allow_sub=True):
    """꺾이며 가늘어지는 잔가지를 big 마스크에 그린다."""
    step = 1.6
    n = int(length / step)
    r = width / 2
    taper = (0.45 / max(r, 0.5)) ** (1 / max(n, 1))      # 끝에서 r≈0.45
    wob = rng.uniform(-1, 1) * 0.04
    for i in range(n):
        disk(x, y, r)
        ang += wob + rng.normal(0, 0.06)
        wob = wob * 0.92 + rng.normal(0, 0.022)
        # 위(-90°)로 향하려는 성질(굴광성)
        ang += bias_up * math.atan2(math.sin(-math.pi / 2 - ang), math.cos(-math.pi / 2 - ang))
        x += math.cos(ang) * step
        y += math.sin(ang) * step
        r *= taper
        if r < 0.45:
            break
        if allow_sub and depth < 2 and i > 4 and i < n - 5 and rng.random() < 0.03 + 0.01 * (2 - depth):
            side = rng.choice([-1, 1])
            sub_ang = ang + side * rng.uniform(0.45, 0.95)
            grow(x, y, sub_ang, r * 1.5, length * rng.uniform(0.35, 0.55), depth + 1, bias_up)
            
# 1) 모든 가지 끝에서 연장(갈라지는 잔가지)
for (x, y) in endpoints:
    d = walk_back((x, y))
    wd = max(dist0[y, x] * 2, 2.0)
    base_ang = math.atan2(d[1], d[0])
    for k in range(rng.integers(1, 3)):
        ang = base_ang + rng.uniform(-0.45, 0.45)
        grow(x, y, ang, min(wd * 0.8, 5.5), rng.uniform(30, 70), 0)

# 2) 가늘고 중간 굵기의 가지 옆구리에서 곁가지
cand = [(x, y) for (x, y) in skpts if 2.2 < dist0[y, x] < 11]
rng.shuffle(cand)
picked = []
for (x, y) in cand:
    if all((x - px) ** 2 + (y - py) ** 2 > 30 ** 2 for px, py in picked):
        picked.append((x, y))
for (x, y) in picked:
    # 국소 접선 → 줄기 바깥 방향 쪽 선택
    near = [q for q in skpts if abs(q[0] - x) <= 6 and abs(q[1] - y) <= 6]
    if len(near) < 4:
        continue
    pts = np.array(near, float)
    c = pts.mean(0)
    u, s, vt = np.linalg.svd(pts - c)
    t = vt[0]
    if np.dot(t, np.array([x, y]) - BASE) < 0:
        t = -t
    base_ang = math.atan2(t[1], t[0])
    side = rng.choice([-1, 1])
    ang = base_ang + side * rng.uniform(0.5, 1.0)
    # 아래로 처지는 가지는 줄인다
    if math.sin(ang) > 0.55:
        ang = base_ang - side * rng.uniform(0.5, 0.9)
    wd = dist0[y, x] * 2
    grow(x, y, ang, min(wd * 0.55, 5.5), rng.uniform(30, 64), 1)

# 3) 줄기 중간~위쪽의 굵은 가지에서 잔가지 몇 개(공백 메우기)
thick = [(x, y) for (x, y) in skpts if 11 <= dist0[y, x] < 20 and y < PAD + 470]
rng.shuffle(thick)
tp = []
for (x, y) in thick:
    if all((x - px) ** 2 + (y - py) ** 2 > 50 ** 2 for px, py in tp):
        tp.append((x, y))
for (x, y) in tp[:9]:
    near = [q for q in skpts if abs(q[0] - x) <= 8 and abs(q[1] - y) <= 8]
    if len(near) < 4:
        continue
    pts = np.array(near, float)
    c = pts.mean(0)
    u, s, vt = np.linalg.svd(pts - c)
    t = vt[0]
    if np.dot(t, np.array([x, y]) - BASE) < 0:
        t = -t
    side = rng.choice([-1, 1])
    ang = math.atan2(t[1], t[0]) + side * rng.uniform(0.55, 0.9)
    off = np.array([math.cos(ang), math.sin(ang)]) * dist0[y, x] * 0.6
    grow(x + off[0], y + off[1], ang, 7.5, rng.uniform(40, 72), 0)

# ---------------------------------------------------------------- 뿌리
def root(x, y, ang, width, length, depth=0):
    step = 1.8
    n = int(length / step)
    r = width / 2
    taper = (0.5 / r) ** (1 / n)
    for i in range(n):
        disk(x, y, r)
        ang += rng.normal(0, 0.045)
        # 바깥으로 뻗으며 살짝 아래로 눌림
        ang += 0.012 * math.atan2(math.sin(math.pi / 2 - ang), math.cos(math.pi / 2 - ang)) * (1 if abs(math.cos(ang)) > 0.4 else 0)
        x += math.cos(ang) * step
        y += math.sin(ang) * step
        r *= taper
        if depth < 1 and 8 < i < n - 12 and rng.random() < 0.03:
            s = rng.choice([-1, 1])
            root(x, y, ang + s * rng.uniform(0.35, 0.7), r * 1.4, length * rng.uniform(0.3, 0.45), depth + 1)

base_y = PAD + 748
for (sx, dirx, n) in [(PAD + 170, -1, 2), (PAD + 418, 1, 2), (PAD + 232, -1, 1), (PAD + 350, 1, 1)]:
    for k in range(n):
        a = (math.pi - rng.uniform(0.0, 0.5)) if dirx < 0 else rng.uniform(0.0, 0.5)
        root(sx + dirx * rng.uniform(-2, 6), base_y + rng.uniform(-4, 12), a,
             rng.uniform(8, 12), rng.uniform(60, 110))

# ---------------------------------------------------------------- 정리 → 윤곽
big = cv2.morphologyEx(big, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (SS * 2 + 1,) * 2))
sm = cv2.GaussianBlur(big, (0, 0), SS * 0.55)
sm = (sm > 127).astype(np.uint8) * 255
mask1 = cv2.resize(sm, (W, H), interpolation=cv2.INTER_AREA)
mask1 = (mask1 > 127).astype(np.uint8) * 255

contours, hier = cv2.findContours(sm, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)

def to_path(pts):
    """폐곡선 점들 → 부드러운 Catmull-Rom 3차 베지어 path"""
    p = pts.reshape(-1, 2).astype(float) / SS
    p = p - np.array([PAD, PAD])
    n = len(p)
    d = [f"M{p[0][0]:.1f} {p[0][1]:.1f}"]
    for i in range(n):
        p0, p1, p2, p3 = p[(i - 1) % n], p[i], p[(i + 1) % n], p[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        d.append(f"C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}")
    return "".join(d) + "Z"

outline = []
for c in contours:
    if cv2.contourArea(c) < 40 * SS * SS:
        continue
    eps = 1.1
    c2 = cv2.approxPolyDP(c, eps, True)
    outline.append(to_path(c2))
outline_d = "".join(outline)

# ---------------------------------------------------------------- 나무결(흐름선)
m1 = (mask1 > 0).astype(np.uint8)
dist = cv2.distanceTransform(m1, cv2.DIST_L2, 5)
dsm = cv2.GaussianBlur(dist, (0, 0), 2.2)
gx = cv2.Sobel(dsm, cv2.CV_32F, 1, 0, ksize=3) / 8
gy = cv2.Sobel(dsm, cv2.CV_32F, 0, 1, ksize=3) / 8

def sample(arr, x, y):
    xi, yi = int(x), int(y)
    if xi < 0 or yi < 0 or xi >= W - 1 or yi >= H - 1:
        return 0.0
    return float(arr[yi, xi])

def streamline(x, y, max_len, sign):
    pts = [(x, y)]
    lat = 0.0
    prev_dir = None
    for i in range(int(max_len / 1.8)):
        g = np.array([sample(gx, x, y), sample(gy, x, y)])
        gn = np.linalg.norm(g)
        if gn < 0.12:
            break
        t = np.array([-g[1], g[0]]) / gn * sign        # 등고선(가지 결) 방향
        if prev_dir is not None:
            if np.dot(t, prev_dir) < 0:
                t = -t
            t = 0.7 * prev_dir + 0.3 * t
            t /= np.linalg.norm(t)
        prev_dir = t
        lat = lat * 0.92 + rng.normal(0, 0.05)           # 살짝 흔들림
        n = np.array([-t[1], t[0]])
        v = t + n * lat
        v /= np.linalg.norm(v)
        x += v[0] * 1.8
        y += v[1] * 1.8
        if sample(dist, x, y) < 3.2:
            break
        pts.append((x, y))
    return pts

bark = []
area_pts = np.argwhere(dist > 4.4)           # (y, x)
rng.shuffle(area_pts)
used = np.zeros_like(m1)
for (y, x) in area_pts:
    if used[y, x]:
        continue
    L = rng.uniform(16, 70) * min(1.0, dist[y, x] / 10 + 0.5)
    sign = 1.0 if rng.random() < 0.5 else -1.0
    a = streamline(float(x), float(y), L, 1.0)
    b = streamline(float(x), float(y), L * rng.uniform(0.3, 0.8), -1.0)
    pts = list(reversed(b[1:])) + a
    if len(pts) < 7:
        continue
    for (px, py) in pts:
        cv2.circle(used, (int(px), int(py)), 4, 1, -1)
    q = np.array(pts) - np.array([PAD, PAD])
    d = f"M{q[0][0]:.1f} {q[0][1]:.1f}" + "".join(
        f"L{px:.1f} {py:.1f}" for px, py in q[1::2]) + f"L{q[-1][0]:.1f} {q[-1][1]:.1f}"
    bark.append(d)
bark_d = "".join(bark)

# ---------------------------------------------------------------- 옹이
def knot(cx, cy, rx, ry, rings=3):
    out = []
    for i in range(rings):
        k = 1 - i * 0.3
        out.append(f"M{cx - rx * k:.1f} {cy:.1f}A{rx * k:.1f} {ry * k:.1f} 0 1 0 {cx + rx * k:.1f} {cy:.1f}"
                   f"A{rx * k:.1f} {ry * k:.1f} 0 1 0 {cx - rx * k:.1f} {cy:.1f}Z")
    return "".join(out)

knots_d = knot(280, 552, 6, 10) + knot(314, 636, 5, 8, 2) + knot(279, 480, 4, 7, 2)

# ---------------------------------------------------------------- 열매 위치(오른쪽 긴 가지 끝쪽 아랫면)
fx = None
for X in range(PAD + 622, PAD + 640):
    col = np.nonzero(m1[PAD + 150:PAD + 260, X])[0]
    if len(col):
        fx, fy = X - PAD, col.max() + PAD + 150 - PAD
        break
fruit = {"stemX": int(fx), "stemY": int(fy)}

# ---------------------------------------------------------------- 줄기 중심선(세로 글씨용)
trunk = []
for y in range(380, 760, 10):
    row = np.nonzero(m1[y + PAD, PAD + 200:PAD + 420])[0]
    if len(row):
        # 줄기를 포함하는 연속 구간(중앙 298 주변)
        xs_ = row + 200
        seg = xs_[np.abs(xs_ - 298) < 90]
        trunk.append([y, int(seg.min()), int(seg.max())])

bbox = cv2.boundingRect(sm)
data = {
    "outline": outline_d,
    "bark": bark_d,
    "knots": knots_d,
    "fruit": fruit,
    "trunk": trunk,
    "bbox": [bbox[0] // SS - PAD, bbox[1] // SS - PAD, bbox[2] // SS, bbox[3] // SS],
}
OUT.write_text("window.TREE_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n", encoding="utf-8")
print("outline", len(outline_d), "bark", len(bark_d), "bbox", data["bbox"], "fruit", fruit)

if "--preview" in sys.argv:
    pv = sys.argv[sys.argv.index("--preview") + 1]
    vis = cv2.cvtColor(mask1, cv2.COLOR_GRAY2BGR)
    cv2.imwrite(pv, vis)
