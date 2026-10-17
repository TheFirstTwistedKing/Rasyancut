/* 라시안컷 맵
 *
 *  - 원형 맵(지름 192000). 최고속도로 끝에서 끝까지 약 96초, 가속하면 약 32초
 *  - 중앙: 성역의 경계 / 곳곳: 찢어진 차원의 틈 관문 259개 + 특별한 틈 2(쌍둥이의 틈, 버려진 차원의 틈)
 *  - 맵 밖으로 나가면 화면이 불타 재가 되고, 성역(맵 가운데)에서 다시 태어난다
 *  - 쌍둥이의 틈(페이스리아와 오비투아리바): 연노랑·검정 소용돌이 하나 + 사실적인 빛, 가장 큼
 *  - 버려진 차원의 틈: 비스듬히 갈라진 붉은 균열. 안쪽에서 소용돌이가 일렁이고 글리치가 걸리며, 붉은 번개(+소리)와 검은 기운이 뿜어져 나온다. 눌러도 아무 일도 없다
 *  - 조작: 드래그(관성) · 휠/핀치 확대 · 방향키/WASD(Shift 가속) · 터치 조이스틱(+가속 버튼) · 미니맵
 *
 *  window.RasyancutMap = { prepare(onProgress), show(), hide(), isOpen() }
 */
(() => {
  "use strict";

  // ───────────────────────── 상수 ─────────────────────────
  // 원형 맵: 반지름 96000(지름 192000 = 이전 16000의 12배). 원점(0,0) = 성역의 중심
  const R_MAP = 96000;
  const WORLD = R_MAP * 2;
  const CX = 0, CY = 0;
  const MAX_SPEED = 2000;                            // 세계 단위/초 (끝에서 끝까지 최고속도로 약 96초)
  const BOOST = 3;                                   // 가속(Shift / 가속 버튼) 배율 → 끝에서 끝까지 약 32초
  const SANCT_R = 1000;                              // 성역의 경계 반지름
  const Z_MIN = 0.04, Z_MAX = 1.5;
  const NORMAL_GATES = 259;                          // + 특별한 틈 2 (idx 0: 쌍둥이의 틈 → rifts[12], idx 1: 버려진 틈 → rifts[13])
  const SPECIAL = [
    { name: "페이스리아와 오비투아리바의 차원의 틈", x: 34000, y: -21000, kind: "twin", scale: 2.6, rot: -0.05 },       // 쌍둥이의 틈: 소용돌이는 하나, 누르면 홈페이지로
    { name: "버려진 차원의 틈", x: -41000, y: 29000, kind: "abandoned", scale: 2.0, rot: 0.08 },                          // 눌러도 아무 일 없다
  ];
  const ABN = 13;                                    // 버려진 틈의 스프라이트 번호
  const NEON = "#eeff6b", NEON_SOFT = "#f4ff86", NEON_PALE = "#fbffc8";

  // 일반 관문의 빛깔(채도 낮은 차가운 빛 위주 — 특별 관문의 연노랑과 구분)
  const TINTS = [
    { rim: "#e8f3ff", glow: "150,200,255" },
    { rim: "#b9f0ff", glow: "110,220,255" },
    { rim: "#d9ccff", glow: "170,140,255" },
    { rim: "#ffe0a8", glow: "255,190,110" },
    { rim: "#ffb3a6", glow: "255,100,90" },
    { rim: "#f6f2e6", glow: "240,236,220" },
  ];

  // ───────────────────────── 난수(고정 시드: 맵은 늘 같다) ─────────────────────────
  const rng32 = (seed) => () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const hash2 = (x, y, s) => {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  // ───────────────────────── 스프라이트 ─────────────────────────
  /** 차원이 양옆으로 찢긴 상처: 위아래가 뾰족한 틈이 좌우로 벌어지고, 입술(가장자리)이 말려 올라가며,
   *  실밥 같은 가닥이 삐져나오고, 주변 공간에 금이 퍼진다. 속은 빛이 닿지 않는 깊은 어둠. */
  function makeWound(seed, tint, S, o) {
    const r = rng32(seed);
    const u = S / 512;
    const cx = S / 2, cy = S / 2, hh = S * o.hh, hwMax = S * o.hw;
    const mkN = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(r() * 2 - 1); return (t) => { const x = t * (n - 1), i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f); return a[i] * (1 - s) + a[Math.min(n - 1, i + 1)] * s; }; };
    const mkSide = () => ({ n: [mkN(9), mkN(34), mkN(130)], sp: Array.from({ length: o.big ? 11 : 6 }, () => ({ t: 0.08 + r() * 0.84, a: S * (0.014 + r() * 0.045) * (o.big ? 1.5 : 1), w: 0.012 + r() * 0.03 })) });
    const L = mkSide(), R = mkSide(), L2 = mkSide(), R2 = mkSide();
    const lean = mkN(5);
    const half = (t, sd, grow) => {
      const base = hwMax * Math.pow(Math.sin(Math.PI * t), 0.72);
      let v = base * Math.max(0.15, 1 + sd.n[0](t) * 0.28 + sd.n[1](t) * 0.17 + sd.n[2](t) * 0.08);
      for (const s of sd.sp) { const d = Math.abs(t - s.t); if (d < s.w) v += s.a * (1 - d / s.w) * Math.sin(Math.PI * t); }
      return Math.min(S * 0.46, v * (1 + grow) + (grow ? S * 0.012 * Math.sin(Math.PI * t) : 0));   // 캔버스 밖으로 잘리지 않게
    };
    const N = o.big ? 340 : 230;
    const build = (sdR, sdL, grow) => {
      const pts = [];
      for (let k = 0; k <= N; k++) { const t = k / N; pts.push([cx + lean(t) * S * 0.035 + half(t, sdR, grow), cy - hh + 2 * hh * t]); }
      for (let k = N; k >= 0; k--) { const t = k / N; pts.push([cx + lean(t) * S * 0.035 - half(t, sdL, grow), cy - hh + 2 * hh * t]); }
      return pts;
    };
    const pts = build(R, L, 0), pts2 = build(R2, L2, 0.07);
    const mkPath = (p) => { const pa = new Path2D(); p.forEach(([x, y], i) => (i ? pa.lineTo(x, y) : pa.moveTo(x, y))); pa.closePath(); return pa; };
    const path = mkPath(pts), path2 = mkPath(pts2);

    const c = mk(S, S), g = c.getContext("2d");
    g.lineJoin = "round"; g.lineCap = "round";
    const gl = tint.glow, rim = tint.rim;

    // 1) 주변 공간에 퍼지는 금(유리가 깨지듯 가지치며 가늘어짐)
    g.strokeStyle = rim;
    const crack = (x, y, ang, len, w, a, depth) => {
      let px = x, py = y; const segs = Math.max(3, (len / (S * 0.022)) | 0);
      for (let i = 0; i < segs; i++) {
        ang += (r() - 0.5) * 0.75;
        const l = len / segs * (0.7 + r() * 0.6), nx = px + Math.cos(ang) * l, ny = py + Math.sin(ang) * l, f = 1 - i / segs;
        g.globalAlpha = a * f; g.lineWidth = Math.max(0.5, w * (0.4 + 0.6 * f));
        g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        if (depth < 2 && r() < 0.22) crack(nx, ny, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * 0.45 * f, w * 0.7, a * 0.8, depth + 1);
        px = nx; py = ny;
      }
    };
    const nCr = o.big ? 30 : 15;
    for (let i = 0; i < nCr; i++) {
      const k = (r() * N) | 0, side = r() < 0.5, t = k / N;
      const x = cx + lean(t) * S * 0.035 + (side ? 1 : -1) * half(t, side ? R : L, 0), y = cy - hh + 2 * hh * t;
      crack(x, y, (side ? 0 : Math.PI) + (r() - 0.5) * 1.1, S * (0.07 + r() * 0.2) * (o.big ? 1.3 : 1), (0.9 + r() * 1.4) * u * 1.6, 0.35 + r() * 0.35, 0);
    }
    for (const ty of [-1, 1]) for (let i = 0; i < (o.big ? 5 : 3); i++) crack(cx, cy + ty * hh, ty * Math.PI / 2 + (r() - 0.5) * 1.0, S * (0.06 + r() * 0.14), 1.6 * u, 0.5, 0);
    g.globalAlpha = 1;

    // 2) 바깥으로 번지는 빛
    g.save();
    g.shadowColor = `rgba(${gl},0.9)`; g.shadowBlur = S * 0.09; g.fillStyle = `rgba(${gl},0.38)`; g.fill(path);
    g.shadowColor = `rgba(${gl},0.95)`; g.shadowBlur = S * 0.035; g.fillStyle = rim; g.globalAlpha = 0.5; g.fill(path);
    g.restore();
    // 3) 벗겨진 바깥 막(한 겹 더 큰 찢김)
    g.save(); g.fillStyle = `rgba(${gl},0.10)`; g.fill(path2); g.strokeStyle = rim; g.globalAlpha = 0.35; g.lineWidth = 1.1 * u; g.stroke(path2); g.restore();
    // 4) 입술: 두꺼운 가장자리 → 밝은 능선 (안쪽 절반은 아래의 검정이 덮는다)
    g.save();
    g.strokeStyle = `rgba(${gl},0.5)`; g.lineWidth = S * 0.032; g.stroke(path);
    g.strokeStyle = rim; g.globalAlpha = 0.9; g.lineWidth = S * 0.012; g.stroke(path);
    g.restore();
    // 5) 속: 빛이 닿지 않는 깊은 어둠
    g.fillStyle = "#000"; g.fill(path);
    g.save(); g.clip(path);
    let gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(hh, hwMax));
    gr.addColorStop(0, `rgba(${gl},0.16)`); gr.addColorStop(0.55, `rgba(${gl},0.05)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    if (!o.big) {
      for (let i = 0; i < 10; i++) {                       // 안쪽 연기·성운
        const px = cx + (r() - 0.5) * hwMax * 1.6, py = cy + (r() - 0.5) * hh * 1.5, rad = S * (0.08 + r() * 0.13);
        const q = g.createRadialGradient(px, py, 0, px, py, rad), warm = r() < 0.5;
        q.addColorStop(0, warm ? `rgba(${gl},0.12)` : "rgba(200,212,235,0.1)"); q.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = q; g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
      for (let i = 0; i < 46; i++) {                        // 멀리 보이는 별빛(다른 차원)
        g.globalAlpha = 0.25 + r() * 0.7; g.fillStyle = r() < 0.2 ? rim : "#fff";
        const sz = (0.5 + r() * r() * 1.4) * u; g.fillRect(cx + (r() - 0.5) * hwMax * 1.9, cy + (r() - 0.5) * hh * 1.9, sz, sz);
      }
      g.globalAlpha = 1;
    }
    g.strokeStyle = "rgba(0,0,0,0.92)"; g.lineWidth = S * 0.06; g.shadowColor = "#000"; g.shadowBlur = S * 0.05; g.stroke(path);   // 입술이 드리우는 그림자
    g.shadowBlur = 0;
    const outer = mk(S, S), og = outer.getContext("2d");
    og.fillStyle = rim; og.fillRect(0, 0, S, S); og.globalCompositeOperation = "destination-out"; og.fillStyle = "#000"; og.fill(path);
    g.shadowColor = `rgba(${gl},0.8)`; g.shadowBlur = S * 0.022; g.globalAlpha = 0.7; g.drawImage(outer, 0, 0);
    g.restore();
    // 6) 가장자리의 가는 실밥(찢어진 천처럼 삐져나온 가닥)
    g.globalAlpha = 1; g.strokeStyle = rim;
    const fibers = o.big ? 340 : 190;
    for (let i = 0; i < fibers; i++) {
      const j = (r() * pts.length) | 0, p0 = pts[j], p1 = pts[(j + 1) % pts.length], pm = pts[(j + pts.length - 1) % pts.length];
      const tx = p1[0] - pm[0], ty = p1[1] - pm[1], tl = Math.hypot(tx, ty) || 1;
      let nx = ty / tl, ny = -tx / tl; if ((p0[0] - cx) * nx + (p0[1] - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const ang = Math.atan2(ny, nx) + (r() - 0.5) * 1.5, len = S * (0.01 + r() * r() * 0.055), bend = (r() - 0.5) * len * 0.8;
      g.globalAlpha = 0.18 + r() * 0.65; g.lineWidth = (0.6 + r() * 1.0) * u;
      g.beginPath(); g.moveTo(p0[0], p0[1]);
      g.quadraticCurveTo(p0[0] + Math.cos(ang) * len * 0.5 - Math.sin(ang) * bend, p0[1] + Math.sin(ang) * len * 0.5 + Math.cos(ang) * bend, p0[0] + Math.cos(ang) * len, p0[1] + Math.sin(ang) * len);
      g.stroke();
    }
    g.globalAlpha = 1;
    
    return { c, S, pts, cx, cy, hw: hwMax * 1.12, hh: hh * 1.02, big: !!o.big, vc: [[cx, cy]], vr: (o.big ? 0.46 : 0.2) * S };
  }


  /** 버려진 차원의 틈: 세로 상처(makeWound)나 대칭적인 모양과 달리, 한쪽으로 길게 비스듬히 갈라진 파단면.
   *  중심선이 구불구불 휘고 한쪽에 불룩한 부분이 있는 비대칭 윤곽, 프랙털로 부서진 날카로운 가장자리, 끝에서 길게 이어지는 금,
   *  가장자리에서 떨어져 나온 얇은 파편 — 유리나 암석이 실제로 쪼개질 때의 모양을 따른다. */
  function makeBrokenRift(seed, tint, S) {
    const r = rng32(seed), u = S / 512, cx = S / 2, cy = S / 2, gl = tint.glow, rim = tint.rim;
    const ax = -0.4, L = S * 0.38, Wmax = S * 0.19;                      // 기울기(약 -23°), 반 길이, 최대 반폭
    const ca = Math.cos(ax), sa = Math.sin(ax);
    const mkN = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(r() * 2 - 1); return (t) => { const x = t * (n - 1), i = Math.floor(x), f = x - i, q = f * f * (3 - 2 * f); return a[i] * (1 - q) + a[Math.min(n - 1, i + 1)] * q; }; };
    const wander = mkN(6), wTop = mkN(7), wBot = mkN(7);
    // 축 좌표(t: 0~1, n: 축에 수직) → 캔버스
    const P = (t, n) => { const x = (t - 0.5) * 2 * L, y = n + wander(t) * S * 0.055; return [cx + x * ca - y * sa, cy + x * sa + y * ca]; };
    const prof = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.72)), 0.8);       // 한쪽(t≈0.4)이 불룩하고 양 끝은 날카롭게 모인다
    const frac = (a, b, depth, amp) => {                                              // 중점 변위: 곧은 직선 조각들이 꺾이며 부서진 가장자리
      if (depth === 0) return [];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, o = (r() - 0.5) * 2 * amp * l;
      m[0] += -dy / l * o; m[1] += dx / l * o;
      return [...frac(a, m, depth - 1, amp * 0.78), m, ...frac(m, b, depth - 1, amp * 0.78)];
    };
    const edge = (sgn, wn) => {
      const ctl = []; const K = 9;
      for (let k = 0; k <= K; k++) { const t = k / K; ctl.push(P(t, sgn * Wmax * prof(t) * (0.7 + 0.5 * (wn(t) * 0.5 + 0.5) + (k % 2 ? -0.12 : 0.12) * r()))); }
      const out = [ctl[0]];
      for (let k = 0; k < K; k++) { out.push(...frac(ctl[k], ctl[k + 1], 4, 0.36), ctl[k + 1]); }
      return out;
    };
    const top = edge(-1, wTop), bot = edge(1, wBot);
    const pts = [...top, ...bot.slice(0, -1).reverse()];
    let mx = 0, my = 0; pts.forEach(([x, y]) => { mx = Math.max(mx, Math.abs(x - cx)); my = Math.max(my, Math.abs(y - cy)); });
    const path = new Path2D(); pts.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath();

    const c = mk(S, S), g = c.getContext("2d");
    g.lineJoin = "miter"; g.lineCap = "butt"; g.miterLimit = 5;
    // 1) 금: 양 끝에서 길게 이어지고, 가장자리에서 몇 가닥 곁으로 뻗는다 (사방으로 퍼지지 않는다)
    g.strokeStyle = rim;
    const crack = (x, y, ang, len, w, a, depth) => {
      let px = x, py = y; const segs = 3 + ((r() * 3) | 0);
      for (let i = 0; i < segs; i++) {
        ang += (r() - 0.5) * 0.45; const l = len / segs * (0.7 + r() * 0.6), nx = px + Math.cos(ang) * l, ny = py + Math.sin(ang) * l, f = 1 - i / segs;
        g.globalAlpha = a * f; g.lineWidth = Math.max(0.5, w * (0.35 + 0.65 * f)); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        if (depth < 2 && r() < 0.3) crack(nx, ny, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), len * 0.4 * f, w * 0.7, a * 0.8, depth + 1);
        px = nx; py = ny;
      }
    };
    for (const [t, dir] of [[0, Math.PI], [1, 0]]) { const [x, y] = P(t, 0); for (let i = 0; i < 2; i++) crack(x, y, ax + dir + (r() - 0.5) * 0.35, S * (0.09 + r() * 0.12), (1.3 + r()) * u * 1.6, 0.6, 0); }
    for (let i = 0; i < 9; i++) {
      const p = pts[(r() * pts.length) | 0], a0 = Math.atan2(p[1] - cy, p[0] - cx) + (r() - 0.5) * 0.9;
      crack(p[0], p[1], a0, S * (0.04 + r() * 0.09), (0.8 + r() * 0.9) * u * 1.6, 0.3 + r() * 0.3, 1);
    }
    g.globalAlpha = 1;
    // 2) 번지는 빛
    g.save(); g.shadowColor = `rgba(${gl},0.9)`; g.shadowBlur = S * 0.08; g.fillStyle = `rgba(${gl},0.34)`; g.fill(path);
    g.shadowBlur = S * 0.03; g.fillStyle = rim; g.globalAlpha = 0.4; g.fill(path); g.restore();
    // 3) 입술: 날카롭게 꺾인 두꺼운 가장자리 → 밝은 능선
    g.save(); g.strokeStyle = `rgba(${gl},0.5)`; g.lineWidth = S * 0.026; g.stroke(path);
    g.strokeStyle = rim; g.globalAlpha = 0.9; g.lineWidth = S * 0.009; g.stroke(path); g.restore();
    // 4) 속: 깊은 어둠
    g.fillStyle = "#000"; g.fill(path);
    g.save(); g.clip(path);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(mx, my));
    gr.addColorStop(0, `rgba(${gl},0.16)`); gr.addColorStop(0.55, `rgba(${gl},0.05)`); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(0,0,0,0.92)"; g.lineWidth = S * 0.05; g.shadowColor = "#000"; g.shadowBlur = S * 0.04; g.stroke(path);
    g.restore();
    // 5) 가장자리에서 떨어져 나온 얇은 파편 (축 방향으로 길쭉하게)
    g.shadowBlur = 0;
    for (let i = 0; i < 8; i++) {
      const p = pts[(r() * pts.length) | 0], off = S * (0.025 + r() * 0.06), a0 = Math.atan2(p[1] - cy, p[0] - cx);
      const x = p[0] + Math.cos(a0) * off, y = p[1] + Math.sin(a0) * off; if (Math.abs(x - cx) > S * 0.47 || Math.abs(y - cy) > S * 0.47) continue;
      const len = S * (0.014 + r() * r() * 0.05), wd = len * (0.18 + r() * 0.2), rot = ax + (r() - 0.5) * 0.7;
      g.save(); g.translate(x, y); g.rotate(rot); g.beginPath(); g.moveTo(len, 0); g.lineTo(-len * 0.25, wd); g.lineTo(-len, -wd * 0.3); g.lineTo(-len * 0.2, -wd); g.closePath();
      g.shadowColor = `rgba(${gl},0.8)`; g.shadowBlur = S * 0.018; g.fillStyle = "#020003"; g.fill(); g.shadowBlur = 0;
      g.strokeStyle = rim; g.globalAlpha = 0.5 + r() * 0.4; g.lineWidth = Math.max(0.8, wd * 0.25); g.stroke(); g.restore();
    }
    g.globalAlpha = 1;
    return { c, S, pts, cx, cy, ax, L, W: Wmax, hw: mx * 1.1, hh: my * 1.1, big: true, vc: [[cx, cy]], vr: 0.4 * S };
  }

  function makeGlow(rgb) {
    const c = mk(256, 256), g = c.getContext("2d");
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, `rgba(${rgb},0.85)`); gr.addColorStop(0.12, `rgba(${rgb},0.5)`);
    gr.addColorStop(0.32, `rgba(${rgb},0.2)`); gr.addColorStop(0.6, `rgba(${rgb},0.06)`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return c;
  }

  /** 역제곱 감쇠에 가깝게 중심이 아주 밝고 바깥으로 빠르게 어두워지는 번짐(중심 alpha 1 기준) */
  function makeBloom(c0, c1) {
    const S = 512, c = mk(S, S), g = c.getContext("2d");
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, `rgba(${c0},1)`); gr.addColorStop(0.1, `rgba(${c0},0.55)`);
    gr.addColorStop(0.3, `rgba(${c1},0.2)`); gr.addColorStop(0.65, `rgba(${c1},0.05)`); gr.addColorStop(1, `rgba(${c1},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return c;
  }
  /** 가늘고 길이가 제각각인 빛줄기를 구워 둔 텍스처 (서로 다른 시드 둘을 반대로 돌려 일렁임을 만든다) */
  function makeRays(seed) {
    const S = 1024, c = mk(S, S), g = c.getContext("2d"), r = rng32(seed * 91);
    g.translate(S / 2, S / 2);
    const n = 26;
    for (let i = 0; i < n; i++) {
      const hA = r(), hB = r();
      const a = i / n * Math.PI * 2 + (hA - 0.5) * 0.2, w = 0.006 + 0.014 * hA * hA, len = S / 2 * (0.4 + 0.6 * hB), al = 0.07 + 0.13 * hB;
      const lg = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      lg.addColorStop(0, `rgba(255,250,205,${al})`); lg.addColorStop(1, "rgba(238,255,107,0)");
      g.fillStyle = lg; g.beginPath();
      g.moveTo(Math.cos(a - w * 0.25) * 14, Math.sin(a - w * 0.25) * 14);
      g.lineTo(Math.cos(a - w) * len, Math.sin(a - w) * len); g.lineTo(Math.cos(a + w) * len, Math.sin(a + w) * len);
      g.lineTo(Math.cos(a + w * 0.25) * 14, Math.sin(a + w * 0.25) * 14); g.closePath(); g.fill();
    }
    return c;
  }

  function makeNebula(rgb) {
    const c = mk(256, 256), g = c.getContext("2d");
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, `rgba(${rgb},0.5)`); gr.addColorStop(0.5, `rgba(${rgb},0.18)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return c;
  }


  // ───────────────────────── 소용돌이(WebGL 셰이더) ─────────────────────────
  // 터널 좌표(깊이 = 1/r)로 중심을 향해 빨려 드는 흐름을 만들고, 도메인 워핑 fbm 난류 + 가는 빛 가닥 + 뜨거운 중심으로 실제 가스 소용돌이처럼 그린다.
  const VORTEX_VS = "attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }";
  const VORTEX_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;
uniform float uTime, uDir, uSeed, uOff, uRs;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p, float per){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(vec2(mod(i.x, per), i.y)), b = hash(vec2(mod(i.x + 1.0, per), i.y));
  float c = hash(vec2(mod(i.x, per), i.y + 1.0)), d = hash(vec2(mod(i.x + 1.0, per), i.y + 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm5(vec2 p, float per){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * vnoise(p, per); p = p * 2.0 + 3.7; per *= 2.0; a *= 0.5; }
  return v;
}
float fbm4(vec2 p, float per){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p, per); p = p * 2.0 + 3.7; per *= 2.0; a *= 0.5; }
  return v;
}
// 소용돌이 하나(pl: 소용돌이 중심 기준 좌표, 가장자리 근처에서 길이 1). 톤 매핑 전의 색을 돌려준다.
vec3 vortex(vec2 pl, float dir, float seed){
  float r = length(pl), ang = atan(pl.y, pl.x);
  float u = ang / 6.2831853 + 0.5;
  const float P = 6.0;
  float dA = 0.5 / (r + 0.07);
  float flowA = uTime * 0.5 * dir;
  float uA = u + uTime * 0.16 * dir + dA * 0.26;
  vec2 qA = vec2(uA * P, dA * 1.25 - flowA);
  float a1 = fbm4(qA + vec2(seed, 0.0), P);
  float a2 = fbm5(vec2(qA.x + a1 * 2.4, qA.y + a1 * 1.6) + vec2(5.2, 1.3 + seed), P);
  float armsA = 0.5 + 0.5 * sin((uA * 3.0 + dA * 0.9 + a2 * 1.7) * 6.2831853);
  float densA = smoothstep(0.32, 0.8, armsA * 0.6 + a2 * 0.64);
  float fine = fbm4(vec2(qA.x * 4.0 + a2 * 3.0, qA.y * 3.2 - flowA * 0.6), P * 4.0);
  densA *= 0.7 + 0.6 * fine;
  float rid = 1.0 - abs(2.0 * fbm4(vec2(qA.x * 2.0 + a2 * 3.0, qA.y * 1.6 - flowA * 0.4), P * 2.0) - 1.0);
  rid = pow(max(rid, 0.0), 5.0);
  float dB = dA * 0.6 + 3.1;
  float uB = u - uTime * 0.09 * dir - dB * 0.2;
  vec2 qB = vec2(uB * P, dB * 1.1 - uTime * 0.26 * dir);
  float b1 = fbm4(qB + vec2(seed * 1.7, 3.3), P);
  float densB = smoothstep(0.4, 0.88, b1 * 1.15);
  float glow = 1.0 / (1.0 + r * r * 16.0);
  float side = 0.82 + 0.3 * sin(ang + uTime * 0.3 * dir + seed);
  float inten = (densA * (0.42 + 1.15 * rid) + densA * densA * 0.55) * (0.3 + 1.5 * glow) * side;
  inten += densB * (1.0 - densA) * 0.3 * (0.35 + 1.3 * glow);
  inten *= (1.0 - smoothstep(0.3, 1.22, r));
  inten = pow(max(inten, 0.0), 1.18);
  vec3 col = vec3(0.0);
  col = mix(col, vec3(0.55, 0.46, 0.04), smoothstep(0.06, 0.4, inten));
  col = mix(col, vec3(0.95, 1.0, 0.42), smoothstep(0.28, 0.8, inten));
  col = mix(col, vec3(1.0, 0.99, 0.86), smoothstep(0.85, 1.5, inten));
  vec2 ec = vec2(uA * P * 3.0, dA * 2.75 - flowA * 2.2);
  vec2 ci = floor(ec), cf = fract(ec) - 0.5;
  ci.x = mod(ci.x, P * 3.0);
  float eh = hash(ci + seed);
  vec2 eo = vec2(hash(ci + 7.1), hash(ci + 3.3)) - 0.5;
  float ember = step(0.9, eh) * (1.0 - smoothstep(0.0, 0.14, length((cf - eo * 0.6) * vec2(1.0, 0.42))));
  col += vec3(1.0, 0.97, 0.7) * ember * (0.5 + 1.6 * glow) * (1.0 - smoothstep(0.2, 1.1, r));
  col += vec3(1.0, 0.97, 0.78) * exp(-r * 8.0);
  col += vec3(1.0) * exp(-r * 30.0) * 2.0;
  return col;
}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  vec3 col = vortex(p / uRs, uDir, uSeed);        // 소용돌이는 하나
  col = 1.0 - exp(-col * 1.45);
  col += (hash(gl_FragCoord.xy) - 0.5) / 200.0;
  gl_FragColor = vec4(col, 1.0);
}`;

  // ───────────────────────── 대체 소용돌이(WebGL 없음): 같은 수식을 JS 로 한 번 구워 두고 회전·겹침으로 움직임을 만든다 ─────────────────────────
  const jfract = (v) => v - Math.floor(v);
  const jhash = (x, y) => { let px = jfract(x * 123.34), py = jfract(y * 456.21); const d = px * (px + 45.32) + py * (py + 45.32); px += d; py += d; return jfract(px * py); };
  const jmod = (a, b) => ((a % b) + b) % b;
  const jvnoise = (x, y, per) => {
    const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = jhash(jmod(ix, per), iy), b = jhash(jmod(ix + 1, per), iy), c = jhash(jmod(ix, per), iy + 1), d = jhash(jmod(ix + 1, per), iy + 1);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  };
  const jfbm = (x, y, per, oct) => { let v = 0, a = 0.5; for (let i = 0; i < oct; i++) { v += a * jvnoise(x, y, per); x = x * 2 + 3.7; y = y * 2 + 3.7; per *= 2; a *= 0.5; } return v; };
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix3 = (c0, c1, t) => [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];

  /** 셰이더와 같은 수식(t=0)으로 S×S 소용돌이 질감을 굽는다. 행 단위로 양보하며 진행 */
  async function bakeSwirl(S, seed) {
    const c = mk(S, S), g = c.getContext("2d"), img = g.createImageData(S, S), px = img.data;
    const P = 6;
    for (let j = 0; j < S; j++) {
      for (let i = 0; i < S; i++) {
        const x = i / (S - 1) * 2 - 1, y = (S - 1 - j) / (S - 1) * 2 - 1;
        const r = Math.hypot(x, y), ang = Math.atan2(y, x), u = ang / 6.2831853 + 0.5;
        const dA = 0.5 / (r + 0.07), uA = u + dA * 0.26;
        const qx = uA * P, qy = dA * 1.25;
        const a1 = jfbm(qx + seed, qy, P, 4);
        const a2 = jfbm(qx + a1 * 2.4 + 5.2, qy + a1 * 1.6 + 1.3 + seed, P, 5);
        const arms = 0.5 + 0.5 * Math.sin((uA * 3 + dA * 0.9 + a2 * 1.7) * 6.2831853);
        let dens = sstep(0.32, 0.8, arms * 0.6 + a2 * 0.64);
        const fine = jfbm(qx * 4 + a2 * 3, qy * 3.2, P * 4, 4);
        dens *= 0.7 + 0.6 * fine;
        let rid = 1 - Math.abs(2 * jfbm(qx * 2 + a2 * 3, qy * 1.6, P * 2, 4) - 1); rid = Math.pow(rid, 5);
        const dB = dA * 0.6 + 3.1, uB = u - dB * 0.2;
        const b1 = jfbm(uB * P + seed * 1.7, dB * 1.1 + 3.3, P, 4);
        const densB = sstep(0.4, 0.88, b1 * 1.15);
        const glow = 1 / (1 + r * r * 16), side = 0.82 + 0.3 * Math.sin(ang + seed);
        let inten = (dens * (0.42 + 1.15 * rid) + dens * dens * 0.55) * (0.3 + 1.5 * glow) * side;
        inten += densB * (1 - dens) * 0.3 * (0.35 + 1.3 * glow);
        inten *= sstep(1.22, 0.3, r);
        inten = Math.pow(Math.max(inten, 0), 1.18);
        let col = [0, 0, 0];
        col = mix3(col, [0.55, 0.46, 0.04], sstep(0.06, 0.4, inten));
        col = mix3(col, [0.95, 1.0, 0.42], sstep(0.28, 0.8, inten));
        col = mix3(col, [1.0, 0.99, 0.86], sstep(0.85, 1.5, inten));
        const core = Math.exp(-r * 8), eye = Math.exp(-r * 30) * 2;
        const o = (j * S + i) * 4;
        px[o] = 255 * (1 - Math.exp(-(col[0] + core + eye) * 1.45));
        px[o + 1] = 255 * (1 - Math.exp(-(col[1] + core * 0.97 + eye) * 1.45));
        px[o + 2] = 255 * (1 - Math.exp(-(col[2] + core * 0.78 + eye) * 1.45));
        px[o + 3] = 255;
      }
      if (j % 12 === 11) await tick();
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const bakes = [], bakeBusy = [];

  let vgl = null;
  const VORTEX_MAX = window.matchMedia && window.matchMedia("(pointer: coarse)").matches ? 768 : 1024;   // 화면 픽셀에 맞춰 선명하게(상한)
  let vq = 1, emaDt = 16, vortexDrawn = false;     // 소용돌이 해상도 배율(느린 기기에서 자동으로 낮춤)
  function initVortexGL() {
    try {
      const cv = document.createElement("canvas"); cv.width = cv.height = 1024;
      const gl = cv.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
      if (!gl) return;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VORTEX_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, VORTEX_FS));
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); vgl = null; });   // 손실되면 벡터 방식으로 대체
      vgl = { cv, gl, uTime: gl.getUniformLocation(prog, "uTime"), uDir: gl.getUniformLocation(prog, "uDir"), uSeed: gl.getUniformLocation(prog, "uSeed"), uOff: gl.getUniformLocation(prog, "uOff"), uRs: gl.getUniformLocation(prog, "uRs") };
    } catch (e) { console.warn("vortex shader unavailable, using vector fallback", e); vgl = null; }
  }
  /** R×R 픽셀로 소용돌이를 그린다. 결과는 vgl.cv 의 좌하단 R×R 영역 */
  function renderVortex(R, t, dir, seed, off, rs) {
    const { gl } = vgl;
    gl.viewport(0, 0, R, R);
    gl.uniform1f(vgl.uTime, t); gl.uniform1f(vgl.uDir, dir); gl.uniform1f(vgl.uSeed, seed); gl.uniform1f(vgl.uOff, off); gl.uniform1f(vgl.uRs, rs);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ───────────────────────── 세계 구성 ─────────────────────────
  let gates = [], specials = [], rifts = [], glows = [], nebulaSprites = [], miniStatic = null;
  let bloomTex = {}, raysTex = null;
  let prepared = false, vglTried = false;

  function buildGates() {
    const r = rng32(20261015);
    const pts = [];
    const polar = (rad, ang) => [CX + Math.cos(ang) * rad, CY + Math.sin(ang) * rad];
    // 관문이 몰려 있는 구역(군집): 원 안 곳곳에 흩어 놓는다
    const centers = [];
    for (let i = 0; i < 16; i++) centers.push(polar(R_MAP * (0.14 + 0.72 * Math.sqrt(r())), r() * Math.PI * 2));
    const rim = R_MAP - 1800, tooCloseSpecial = 2200;
    const rnd = () => 0.4 + 0.75 * Math.pow(r(), 1.2);      // 크기가 전부 제각각(0.4~1.15) + 가로세로 비율도 각각
    let guard = 0;
    while (pts.length < NORMAL_GATES && guard++ < 200000) {
      let x, y;
      const pick = r();
      if (pts.length < 10) { [x, y] = polar(3200 + r() * 4200, r() * Math.PI * 2); }          // 처음 들어와도 몇 개는 보이게: 성역 가까이
      else if (pick < 0.58) {                                                                    // 군집
        const c = centers[(r() * centers.length) | 0];
        x = c[0] + (r() + r() + r() - 1.5) * 4600; y = c[1] + (r() + r() + r() - 1.5) * 4600;
      } else { [x, y] = polar(R_MAP * 0.96 * Math.sqrt(r()), r() * Math.PI * 2); }              // 원 전체에 고르게
      const dC = Math.hypot(x - CX, y - CY);
      if (dC > rim || dC < SANCT_R + 1700) continue;
      if (SPECIAL.some((s) => Math.hypot(x - s.x, y - s.y) < tooCloseSpecial)) continue;
      const sc = rnd(), sx = sc * (0.78 + 0.5 * r()), sy = sc * (0.85 + 0.35 * r());
      const rad = 205 * Math.max(sx, sy);
      if (pts.some((p) => Math.hypot(x - p[0], y - p[1]) < (rad + p[4]) * 0.85 + 130)) continue;   // 크기에 맞춘 간격
      pts.push([x, y, sx, sy, rad]);
    }
    gates = pts.map((p, i) => ({
      x: p[0], y: p[1], sx: p[2], sy: p[3], scale: Math.max(p[2], p[3]), rot: (r() - 0.5) * 0.8, v: (r() * 12) | 0,
      phase: r() * 6.28, flip: r() < 0.5 ? -1 : 1, i,
    }));
    specials = SPECIAL.map((s, i) => ({ ...s, idx: i, phase: i * 2.1 }));   // 특별한 틈은 어느 관문보다 크다
  }

  async function prepare(onProgress) {
    if (prepared) { onProgress && onProgress(1); return; }
    const total = 12 + 2 + 6 + 4 + 2;
    let done = 0;
    const step = async () => { done++; onProgress && onProgress(done / total); await tick(); };
    buildGates(); await step();
    for (let i = 0; i < 12; i++) {
      const rr = rng32(500 + i * 17);
      rifts.push(makeWound(1000 + i * 37, TINTS[i % 6], 512, { hw: 0.13 + rr() * 0.1, hh: 0.37 + rr() * 0.08, big: false })); await step();
    }
    rifts.push(makeWound(777, { rim: NEON_PALE, glow: "238,255,107" }, 768, { hw: 0.33, hh: 0.40, big: true }));      // [12] 쌍둥이의 틈
    rifts.push(makeBrokenRift(4242, { rim: "#ffb8ae", glow: "255,50,40" }, 768)); await step();                        // [13] 버려진 붉은 틈: 비스듬히 갈라진 균열(세로 상처와 모양이 다르다)
    await step();
    rifts.forEach((sp) => {                       // 멀리서 볼 때는 작게 줄여 둔 이미지를 쓴다(큰 이미지를 축소해 그리는 비용 제거)
      const half = (src, s) => { const c = mk(s, s); const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, s, s); return c; };
      const m256 = half(sp.c, Math.round(sp.S / 2)), m128 = half(m256, Math.round(sp.S / 4));
      sp.mips = [m128, m256];
    });
    TINTS.forEach((t) => glows.push(makeGlow(t.glow)));
    await step();
    glows.push(makeGlow("238,255,107"), makeGlow("255,244,190")); await step();
    nebulaSprites = ["70,90,170", "110,70,175", "40,120,135", "205,185,80"].map(makeNebula); await step();
    await step();
    bloomTex.cool = makeBloom("255,250,215", "238,255,107");
    bloomTex.hot = makeBloom("255,255,240", "244,255,134");
    bloomTex.core = makeBloom("255,255,245", "255,252,200");
    raysTex = [makeRays(1), makeRays(2)];
    if (!vgl && !vglTried) { vglTried = true; initVortexGL(); }
    if (!vgl && !bakes[0]) bakes[0] = await bakeSwirl(384, 1.7);
    redBloom = { cool: makeBloom("255,205,195", "255,48,38"), hot: makeBloom("255,238,230", "255,92,70"), core: makeBloom("255,252,248", "255,185,165") };
    if (window.RasyancutSfx && window.RasyancutSfx.preload) window.RasyancutSfx.preload([...BOLT_SFX, AWAKEN_SFX]);      // 번개 소리를 미리 불러 둔다
    initRiftGL();
    buildMiniStatic(); await step();
    if (document.fonts && document.fonts.load) {
      try { await Promise.race([document.fonts.load('700 20px "Noto Serif KR"', "페이스리아의 차원의 틈"), new Promise((res) => setTimeout(res, 1500))]); } catch (_) { /* 기본 글꼴 */ }
    }
    await step();
    prepared = true;
    onProgress && onProgress(1);
  }

  // ───────────────────────── 카메라/입력 ─────────────────────────
  const cam = { x: CX, y: CY, z: 0.4 };
  const vel = { x: 0, y: 0 };
  let tween = null;
  let open = false, raf = 0, last = 0, t0 = 0;
  let cw = 0, ch = 0, dpr = 1;
  const keys = new Set();
  const stick = { x: 0, y: 0, id: null };
  const pointers = new Map();
  let dragging = false, dragVel = { x: 0, y: 0 }, lastMove = 0, pinchD = 0;
  let boostHeld = false;
  let burn = null;                                   // 불타 재가 되는 연출 진행 상태
  let portal = null;                                 // 차원의 틈으로 들어가는 연출 진행 상태
  let tap = null;                                    // 눌렀다 뗀(드래그 아닌) 입력 판정용

  const el = {};
  const getEls = () => {
    el.screen = document.getElementById("map-screen");
    el.canvas = document.getElementById("map-canvas");
    el.mini = document.getElementById("minimap");
    el.coords = document.getElementById("map-coords");
    el.stick = document.getElementById("joystick");
    el.exit = document.getElementById("map-exit");
    el.zin = document.getElementById("zoom-in");
    el.zout = document.getElementById("zoom-out");
    el.home = document.getElementById("map-home");
    el.boost = document.getElementById("boost");
    el.burn = document.getElementById("burn-canvas");
    el.fire = document.getElementById("fire-canvas");
    el.portal = document.getElementById("portal-canvas");
    el.toast = document.getElementById("map-toast");
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = el.canvas.clientWidth; ch = el.canvas.clientHeight;
    el.canvas.width = Math.floor(cw * dpr); el.canvas.height = Math.floor(ch * dpr);
    const m = el.mini;
    const s = m.clientWidth || 160;
    m.width = Math.floor(s * dpr); m.height = Math.floor(s * dpr);
  }

  function zoomAt(factor, sx, sy) {
    const nz = clamp(cam.z * factor, Z_MIN, Z_MAX);
    const wx = cam.x + (sx - cw / 2) / cam.z, wy = cam.y + (sy - ch / 2) / cam.z;
    cam.z = nz;
    cam.x = wx - (sx - cw / 2) / nz; cam.y = wy - (sy - ch / 2) / nz;
  }

  function bindInput() {
    const c = el.canvas;
    c.addEventListener("pointerdown", (e) => {
      if (burn || portal || awaken) return;
      c.setPointerCapture(e.pointerId);
      const first = pointers.size === 0;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tap = first ? { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 } : null;
      tween = null;
      if (pointers.size === 1) { dragging = true; dragVel = { x: 0, y: 0 }; vel.x = vel.y = 0; lastMove = performance.now(); }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); dragging = false; }
      c.classList.add("grabbing");
    });
    c.addEventListener("pointermove", (e) => {
      if (burn || portal || awaken) return;
      if (!pointers.size) c.style.cursor = hitSpecial(e.clientX, e.clientY) || hitEye(e.clientX, e.clientY) ? "pointer" : "";      // 차원의 틈·뜬 눈 위에서는 손가락 커서
      const p = pointers.get(e.pointerId); if (!p) return;
      if (tap && tap.id === e.pointerId) tap.moved = Math.max(tap.moved, Math.hypot(e.clientX - tap.x, e.clientY - tap.y));
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchD > 0) zoomAt(d / pinchD, (a.x + b.x) / 2, (a.y + b.y) / 2);
        pinchD = d; return;
      }
      if (!dragging) return;
      const now = performance.now(), dt = Math.max(1, now - lastMove) / 1000; lastMove = now;
      cam.x -= dx / cam.z; cam.y -= dy / cam.z;
      const vx = -dx / cam.z / dt, vy = -dy / cam.z / dt;
      dragVel.x = dragVel.x * 0.6 + vx * 0.4; dragVel.y = dragVel.y * 0.6 + vy * 0.4;
    });
    const end = (e) => {
      const wasTap = !!tap && tap.id === e.pointerId && e.type === "pointerup" && tap.moved < 10 && performance.now() - tap.t < 650;
      tap = null;
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        if (wasTap && !burn && !portal && !awaken) {
          const sp = hitSpecial(e.clientX, e.clientY);
          if (sp) startPortal(sp, performance.now());
          else { const eg = hitEye(e.clientX, e.clientY); if (eg) startAwaken(eg, performance.now()); }          // 뜬 눈을 누르면 성역이 깨어난다
        }
        c.classList.remove("grabbing");
        if (dragging) {
          const idle = performance.now() - lastMove;
          if (idle < 90) { vel.x = clamp(dragVel.x, -MAX_SPEED * 1.5, MAX_SPEED * 1.5); vel.y = clamp(dragVel.y, -MAX_SPEED * 1.5, MAX_SPEED * 1.5); }
        }
        dragging = false; pinchD = 0;
      } else if (pointers.size === 1) { dragging = true; dragVel = { x: 0, y: 0 }; lastMove = performance.now(); pinchD = 0; }
    };
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    c.addEventListener("wheel", (e) => { e.preventDefault(); if (burn || portal || awaken) return; zoomAt(Math.exp(-e.deltaY * 0.0014), e.clientX, e.clientY); }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (!open || burn || portal || awaken) return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { keys.add(k); tween = null; e.preventDefault(); }
      if (k === "shift") keys.add("shift");
      if (k === "+" || k === "=") zoomAt(1.25, cw / 2, ch / 2);
      if (k === "-" || k === "_") zoomAt(0.8, cw / 2, ch / 2);
    });
    window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => keys.clear());

    // 터치 조이스틱
    const s = el.stick, knob = s.querySelector(".knob");
    const R = 46;
    const upd = (e) => {
      const r = s.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      const l = Math.hypot(dx, dy); if (l > R) { dx = dx / l * R; dy = dy / l * R; }
      stick.x = dx / R; stick.y = dy / R;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    s.addEventListener("pointerdown", (e) => { if (burn || portal || awaken) return; s.setPointerCapture(e.pointerId); stick.id = e.pointerId; tween = null; upd(e); e.stopPropagation(); });
    s.addEventListener("pointermove", (e) => { if (stick.id === e.pointerId) upd(e); });
    const sEnd = (e) => { if (stick.id !== e.pointerId) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ""; };
    s.addEventListener("pointerup", sEnd); s.addEventListener("pointercancel", sEnd);

    // 가속 버튼(터치): 누르고 있는 동안 3배 속도
    const bEnd = () => { boostHeld = false; el.boost.classList.remove("held"); };
    el.boost.addEventListener("pointerdown", (e) => { if (burn || portal || awaken) return; e.stopPropagation(); el.boost.setPointerCapture(e.pointerId); boostHeld = true; el.boost.classList.add("held"); });
    el.boost.addEventListener("pointerup", bEnd); el.boost.addEventListener("pointercancel", bEnd);

    // 버튼
    el.zin.addEventListener("click", () => zoomAt(1.4, cw / 2, ch / 2));
    el.zout.addEventListener("click", () => zoomAt(1 / 1.4, cw / 2, ch / 2));
    el.home.addEventListener("click", () => flyTo(CX, CY, 0.4, 1400));

    // 미니맵: 누르거나 끌면 그 위치로
    const mm = el.mini;
    const jump = (e, smooth) => {
      if (burn || portal || awaken) return;
      const r = mm.getBoundingClientRect();
      let wx = (clamp((e.clientX - r.left) / r.width, 0, 1) - 0.5) * WORLD, wy = (clamp((e.clientY - r.top) / r.height, 0, 1) - 0.5) * WORLD;
      const dm = Math.hypot(wx, wy); if (dm > R_MAP * 0.985) { wx *= R_MAP * 0.985 / dm; wy *= R_MAP * 0.985 / dm; }   // 경계 밖으로는 이동하지 않는다
      if (smooth) flyTo(wx, wy, cam.z, 1100); else { tween = null; cam.x = wx; cam.y = wy; vel.x = vel.y = 0; }
    };
    let mmDown = false;
    mm.addEventListener("pointerdown", (e) => { mm.setPointerCapture(e.pointerId); mmDown = true; jump(e, true); e.stopPropagation(); });
    mm.addEventListener("pointermove", (e) => { if (mmDown && e.buttons) jump(e, false); });
    mm.addEventListener("pointerup", () => { mmDown = false; });
    window.addEventListener("resize", () => { if (open) resize(); });
  }

  function flyTo(x, y, z, ms) {
    tween = { fx: cam.x, fy: cam.y, fz: cam.z, tx: x, ty: y, tz: z, t0: performance.now(), ms };
    vel.x = vel.y = 0;
  }

  function update(dt, now) {
    if (portal) tween = null;
    if (tween) {
      const k = clamp((now - tween.t0) / tween.ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
      cam.x = tween.fx + (tween.tx - tween.fx) * e; cam.y = tween.fy + (tween.ty - tween.fy) * e;
      cam.z = Math.exp(Math.log(tween.fz) + (Math.log(tween.tz) - Math.log(tween.fz)) * e);
      if (k >= 1) tween = null;
    } else if (!dragging && !burn && !portal && !awaken) {
      let ix = stick.x, iy = stick.y;
      if (keys.has("arrowleft") || keys.has("a")) ix -= 1;
      if (keys.has("arrowright") || keys.has("d")) ix += 1;
      if (keys.has("arrowup") || keys.has("w")) iy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) iy += 1;
      const l = Math.hypot(ix, iy), top = MAX_SPEED * (boostHeld || keys.has("shift") ? BOOST : 1);
      if (l > 0.04) {
        if (l > 1) { ix /= l; iy /= l; }
        const k = 1 - Math.exp(-dt / 0.22);
        vel.x += (ix * top - vel.x) * k; vel.y += (iy * top - vel.y) * k;
      } else {
        const f = Math.exp(-dt / 0.55); vel.x *= f; vel.y *= f;
        if (Math.abs(vel.x) < 4 && Math.abs(vel.y) < 4) vel.x = vel.y = 0;
      }
      cam.x += vel.x * dt; cam.y += vel.y * dt;
    }
    // 맵 밖으로 나가려 하면 불타 재가 된다
    if (!burn && !portal && !awaken && Math.hypot(cam.x - CX, cam.y - CY) >= R_MAP) startBurn(now);
  }

  // ───────────────────────── 그리기 ─────────────────────────
  let ctx = null;

  function drawStars(t) {
    // 시차가 다른 별 3겹 (화면 공간 타일)
    const layers = [{ f: 0.12, tile: 520, n: 7, sz: 1.0, a: 0.5 }, { f: 0.3, tile: 430, n: 6, sz: 1.5, a: 0.65 }, { f: 0.6, tile: 360, n: 4, sz: 2.0, a: 0.8 }];
    layers.forEach((L, li) => {
      const ox = -cam.x * cam.z * L.f, oy = -cam.y * cam.z * L.f;
      const i0 = Math.floor((-ox) / L.tile) - 1, j0 = Math.floor((-oy) / L.tile) - 1;
      const i1 = Math.ceil((cw - ox) / L.tile), j1 = Math.ceil((ch - oy) / L.tile);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        for (let n = 0; n < L.n; n++) {
          const hx = hash2(i, j, n * 3 + li * 11), hy = hash2(i, j, n * 3 + 1 + li * 11), hs = hash2(i, j, n * 3 + 2 + li * 11);
          const x = ox + (i + hx) * L.tile, y = oy + (j + hy) * L.tile;
          if (x < -4 || y < -4 || x > cw + 4 || y > ch + 4) continue;
          const tw = 0.6 + 0.4 * Math.sin(t * (0.8 + hs * 1.8) + hs * 40);
          ctx.globalAlpha = L.a * tw * (0.35 + hs * 0.65);
          ctx.fillStyle = hs > 0.82 ? NEON_PALE : "#cfd8ff";
          const s = L.sz * (0.6 + hs * 0.8);
          ctx.fillRect(x, y, s, s);
        }
      }
    });
    ctx.globalAlpha = 1;
  }

  function drawGridAndEdge(t) {
    // 세계 좌표 격자(희미): 500단위(가까이서만) / 2000단위 굵게. 원점은 성역의 중심
    const z = cam.z;
    const vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    const minor = z > 0.3 ? 500 : 0, major = z > 0.08 ? 2000 : 8000;
    ctx.lineWidth = 1 / z;
    for (const [step, alpha] of [[minor, 0.045], [major, 0.11]]) {
      if (!step) continue;
      ctx.strokeStyle = `rgba(238,255,107,${alpha})`;
      ctx.beginPath();
      for (let x = Math.ceil(vx0 / step) * step; x <= vx1; x += step) { ctx.moveTo(x, vy0); ctx.lineTo(x, vy1); }
      for (let y = Math.ceil(vy0 / step) * step; y <= vy1; y += step) { ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); }
      ctx.stroke();
    }
    if (!fireGL) drawFireRing(t);
  }

  /** 맵의 경계: 불타는 고리. 경계 밖은 검붉게 가라앉고, 불길이 혀처럼 일렁이며 불씨가 날린다 */
  function drawFireRing(t) {
    const z = cam.z, dC = Math.hypot(cam.x - CX, cam.y - CY), viewR = Math.hypot(cw, ch) / 2 / z;
    if (Math.abs(dC - R_MAP) > viewR + 800) return;
    const px = (n) => n / z;
    const vx0 = cam.x - cw / 2 / z - 20, vy0 = cam.y - ch / 2 / z - 20, vw = cw / z + 40, vh = ch / z + 40;
    ctx.save();
    ctx.beginPath(); ctx.rect(vx0, vy0, vw, vh); ctx.arc(CX, CY, R_MAP, 0, Math.PI * 2, true);       // 경계 바깥만
    ctx.fillStyle = "rgba(16,2,2,0.9)"; ctx.fill();
    ctx.globalCompositeOperation = "lighter";
    const fl = 0.85 + 0.15 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 9.3);
    for (const [w, a, c] of [[130, 0.05, "255,50,10"], [58, 0.1, "255,85,15"], [22, 0.2, "255,135,30"]]) {
      ctx.strokeStyle = `rgba(${c},${a * fl})`; ctx.lineWidth = px(w); ctx.beginPath(); ctx.arc(CX, CY, R_MAP, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255,228,160,0.95)"; ctx.lineWidth = px(2.5); ctx.beginPath(); ctx.arc(CX, CY, R_MAP, 0, Math.PI * 2); ctx.stroke();
    // 화염의 혀
    const ang0 = Math.atan2(cam.y - CY, cam.x - CX), half = Math.min(Math.PI, viewR / R_MAP * 1.1 + 0.02);
    const spacing = px(34), da = spacing / R_MAP;
    const i0 = Math.floor((ang0 - half) / da), i1 = Math.ceil((ang0 + half) / da);
    ctx.globalCompositeOperation = "lighter";
    for (let i = i0; i <= i1; i++) {
      const h1 = hash2(i, 0, 81), h2 = hash2(i, 0, 82), a = i * da, nx = Math.cos(a), ny = Math.sin(a);
      const hgt = px(60 + 170 * h1) * (0.55 + 0.45 * Math.sin(t * (4 + h2 * 5) + h1 * 40)), w = px(14 + 22 * h2), sway = Math.sin(t * 2.5 + h1 * 20) * px(10);
      const bx = CX + nx * R_MAP, by = CY + ny * R_MAP, tx = bx + nx * hgt - ny * sway, ty = by + ny * hgt + nx * sway;
      const g = ctx.createLinearGradient(bx, by, tx, ty);
      g.addColorStop(0, "rgba(255,200,80,0.55)"); g.addColorStop(0.5, "rgba(255,95,20,0.3)"); g.addColorStop(1, "rgba(120,10,0,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(bx - ny * w, by + nx * w);
      ctx.quadraticCurveTo(bx + nx * hgt * 0.5 - ny * w * 0.4, by + ny * hgt * 0.5 + nx * w * 0.4, tx, ty);
      ctx.quadraticCurveTo(bx + nx * hgt * 0.5 + ny * w * 0.4, by + ny * hgt * 0.5 - nx * w * 0.4, bx + ny * w, by - nx * w);
      ctx.closePath(); ctx.fill();
    }
    // 불씨
    for (let i = 0; i < 46; i++) {
      const a = ang0 + (hash2(i, 0, 91) - 0.5) * 2 * half, f = (t * (0.12 + 0.2 * hash2(i, 0, 92)) + hash2(i, 0, 93)) % 1;
      const r = R_MAP + f * px(260 + 220 * hash2(i, 0, 94)), sz = px(1.6 + 2.2 * hash2(i, 0, 95));
      ctx.globalAlpha = Math.sin(Math.PI * f) * 0.9; ctx.fillStyle = hash2(i, 0, 96) < 0.4 ? "#ffd27a" : "#ff7a2a";
      ctx.fillRect(CX + Math.cos(a) * r + Math.sin(t * 2 + i) * px(6), CY + Math.sin(a) * r, sz, sz);
    }
    ctx.restore();
  }

  // ───────────────────────── 맵의 공기: 맵 전체에 빛이 위에서 흘러내리고, 어둠이 아래에서 올라간다 ─────────────────────────
  // 화면에 붙은 효과가 아니라 월드 좌표에 그린다: 지도를 끌거나 확대하면 빛줄기·어둠도 지도와 함께 움직인다.
  // 월드를 가로 칸으로 나누고 칸마다 해시로 빛줄기를 정해, 세로로 되풀이되는 줄기가 각자 다른 속도로 흘러내린다 (보이는 칸만 그린다).
  let atmosTex = null;
  function makeAtmosTex() {
    // 빛줄기: 위(꼬리)는 투명 → 아래(머리)로 갈수록 밝아지고 맨 끝은 하얀 방울. 가로는 가운데가 진한 가우시안
    const sw = 32, sh = 512, sc = mk(sw, sh), sg = sc.getContext("2d"), id = sg.createImageData(sw, sh);
    for (let y = 0; y < sh; y++) {
      const v = y / (sh - 1);
      const body = Math.pow(v, 1.5) * (v < 0.93 ? 1 : Math.max(0, 1 - (v - 0.93) / 0.07)) * 0.9 + (v > 0.9 && v < 0.99 ? 0.6 * Math.exp(-Math.pow((v - 0.955) / 0.022, 2)) : 0);
      for (let x = 0; x < sw; x++) {
        const hx = Math.exp(-Math.pow((x - sw / 2 + 0.5) / (sw * 0.2), 2));
        const a = clamp(body * hx, 0, 1), k = (y * sw + x) * 4, wh = clamp((v - 0.8) * 5, 0, 1);       // 머리 쪽은 하얗게
        id.data[k] = 244 + 11 * wh; id.data[k + 1] = 255; id.data[k + 2] = 150 + 85 * wh; id.data[k + 3] = Math.round(a * 255);
      }
    }
    sg.putImageData(id, 0, 0);
    // 넓고 옅은 빛의 장막
    const vw = 96, vh = 256, vc = mk(vw, vh), vg = vc.getContext("2d"), vd = vg.createImageData(vw, vh);
    for (let y = 0; y < vh; y++) for (let x = 0; x < vw; x++) {
      const v = y / (vh - 1), hx = Math.exp(-Math.pow((x - vw / 2 + 0.5) / (vw * 0.28), 2)), k = (y * vw + x) * 4;
      vd.data[k] = 244; vd.data[k + 1] = 255; vd.data[k + 2] = 170; vd.data[k + 3] = Math.round(clamp(Math.pow(v, 1.4) * Math.sin(Math.PI * Math.min(1, v * 1.02)) * hx, 0, 1) * 255);
    }
    vg.putImageData(vd, 0, 0);
    // 검은 연기: 겹친 여러 덩이. 배경이 거의 검정이라 그냥은 안 보이므로, 덩이 뒤에서 새어 나오는 아주 희미한 빛 테두리(역광)를 먼저 깔고
    // 그 위에 짙은 연기 몸통을 올려 검은 윤곽이 드러나게 한다. 마지막에 둥글게 지워 텍스처 가장자리(네모 경계)가 남지 않게 한다
    const ms = 256, mc = mk(ms, ms), mg = mc.getContext("2d"), r = rng32(77), lobes = [];
    for (let i = 0; i < 11; i++) lobes.push([ms * (0.32 + 0.36 * r()), ms * (0.32 + 0.36 * r()), ms * (0.11 + 0.1 * r())]);
    for (const [x, y, rad] of lobes) {
      const g = mg.createRadialGradient(x, y, rad * 0.5, x, y, rad * 1.45);
      g.addColorStop(0, "rgba(200,208,160,0)"); g.addColorStop(0.55, "rgba(200,208,160,0.05)"); g.addColorStop(0.8, "rgba(205,212,165,0.1)"); g.addColorStop(1, "rgba(200,208,160,0)");
      mg.fillStyle = g; mg.fillRect(0, 0, ms, ms);
    }
    for (const [x, y, rad] of lobes) {
      const g = mg.createRadialGradient(x, y, 0, x, y, rad * 1.1);
      g.addColorStop(0, "rgba(0,0,6,0.92)"); g.addColorStop(0.6, "rgba(0,0,6,0.55)"); g.addColorStop(1, "rgba(0,0,6,0)");
      mg.fillStyle = g; mg.fillRect(0, 0, ms, ms);
    }
    mg.globalCompositeOperation = "destination-in";
    const fade = mg.createRadialGradient(ms / 2, ms / 2, ms * 0.28, ms / 2, ms / 2, ms * 0.5);
    fade.addColorStop(0, "rgba(255,255,255,1)"); fade.addColorStop(1, "rgba(255,255,255,0)");
    mg.fillStyle = fade; mg.fillRect(0, 0, ms, ms);
    mg.globalCompositeOperation = "source-over";
    atmosTex = { streak: sc, veil: vc, mist: mc };
  }

  // 빛은 맵 위쪽 끝에서 가운데로 흘러내리고, 검은 연기는 아래쪽 끝에서 가운데로 피어오른다. 둘은 맵 가운데(y = 0)에서 만나 사라진다.
  const MEET_BAND = 9000;          // 가운데 선 위로 이만큼 구간에서 빛이 서서히 옅어져 사라진다

  /** 빛줄기 한 개를 그린다. 위쪽 끝 y0 ~ 머리 yh. 가운데 선(y = 0)에 다가갈수록 조각조각 옅어지다 사라진다 */
  function drawFadingStreak(tex, cx, w, y0, yh, a) {
    if (y0 >= 0) return;
    const L = yh - y0, sh = tex.height, sw = tex.width, yA = -MEET_BAND;
    if (yh <= yA) { ctx.globalAlpha = a; ctx.drawImage(tex, cx - w / 2, y0, w, L); return; }
    if (y0 < yA) { const h1 = yA - y0; ctx.globalAlpha = a; ctx.drawImage(tex, 0, 0, sw, sh * h1 / L, cx - w / 2, y0, w, h1); }
    const ys = Math.max(y0, yA), ye = Math.min(yh, 0), N = 7, step = (ye - ys) / N;
    for (let s = 0; s < N; s++) {
      const ya = ys + s * step, kk = ((ya + step / 2) - yA) / MEET_BAND;
      ctx.globalAlpha = a * Math.pow(1 - kk, 1.6);
      if (ctx.globalAlpha < 0.01) continue;
      ctx.drawImage(tex, 0, sh * (ya - y0) / L, sw, sh * step / L, cx - w / 2, ya, w, step);
    }
  }

  /** 위에서 아래로 흘러내리는 빛 (월드 좌표) */
  function drawLightFlow(t) {
    if (!atmosTex) makeAtmosTex();
    const z = cam.z, vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    if (vy0 > 0) return;                                           // 화면이 전부 가운데 선 아래쪽이면 빛은 없다
    const Wc = 380, P = 5200, far = z < 0.12;
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R_MAP, 0, Math.PI * 2); ctx.clip();         // 맵 원 안에서만
    ctx.globalCompositeOperation = "lighter";
    const i0 = Math.floor(vx0 / Wc) - 1, i1 = Math.floor(vx1 / Wc) + 1;
    const draw = (tex, i, n, wMin, wVar, lenMul, vMin, vVar, aMin, aVar, seed) => {
      const hx = hash2(i, n, seed), hw = hash2(i, n, seed + 1), hl = hash2(i, n, seed + 2), hv = hash2(i, n, seed + 3), hp = hash2(i, n, seed + 4), ha = hash2(i, n, seed + 5);
      const cx = (i + hx) * Wc, w = Math.max((wMin + wVar * hw), 2.6 / z), L = P * lenMul * (0.7 + 0.7 * hl), Pn = P * (0.9 + 0.5 * hp) * lenMul;
      const v = vMin + vVar * hv, base = (((t * v + hp * 7919) % Pn) + Pn) % Pn;
      const a = (aMin + aVar * ha) * (0.78 + 0.22 * Math.sin(t * (0.5 + hv) + hp * 40));
      if (Math.abs(cx) > R_MAP + 600) return;
      for (let k = Math.ceil((vy0 - base) / Pn); k <= Math.floor((Math.min(vy1, 0) + L - base) / Pn); k++) {
        const yh = base + k * Pn;
        drawFadingStreak(tex, cx, w, yh - L, yh, a);
      }
    };
    // 거대한 빛기둥: 폭 수천·길이 수만 단위로 아주 느리게 흘러내린다 (듬성듬성)
    const Wg = 9000, Pg = 30000, g0 = Math.floor(vx0 / Wg) - 1, g1 = Math.floor(vx1 / Wg) + 1;
    for (let i = g0; i <= g1; i++) {
      if (hash2(i, 9, 501) > 0.8) continue;
      const hx = hash2(i, 9, 502), hw = hash2(i, 9, 503), hl = hash2(i, 9, 504), hv = hash2(i, 9, 505), hp = hash2(i, 9, 506), ha = hash2(i, 9, 507);
      const cx = (i + hx) * Wg, w = Math.max(3400 + 5200 * hw, 3 / z), L = 14000 + 13000 * hl, Pn = Pg * (0.9 + 0.5 * hp);
      const base = (((t * (55 + 60 * hv) + hp * 12011) % Pn) + Pn) % Pn;
      if (Math.abs(cx) > R_MAP + 1500) continue;
      const a = (0.32 + 0.22 * ha) * (0.8 + 0.2 * Math.sin(t * 0.3 + hp * 30));
      for (let k = Math.ceil((vy0 - base) / Pn); k <= Math.floor((Math.min(vy1, 0) + L - base) / Pn); k++) {
        const yh = base + k * Pn;
        drawFadingStreak(atmosTex.streak, cx, w, yh - L, yh, a);
      }
    }
    for (let i = i0; i <= i1; i++) {
      draw(atmosTex.streak, i, 0, 70, 110, 0.9, 170, 190, 0.5, 0.45, 301);          // 가는 빛줄기 (칸마다 하나)
      if (!far) draw(atmosTex.streak, i, 1, 140, 200, 1.2, 120, 150, 0.42, 0.4, 311);   // 조금 굵고 긴 빛줄기
      if (i % 3 === 0) draw(atmosTex.veil, i, 2, 650, 900, 1.6, 70, 90, 0.2, 0.16, 321);  // 넓고 옅은 빛의 장막
    }
    ctx.restore();
  }

  /** 아래에서 위로 피어오르는 검은 연기 (월드 좌표). 맵 아래쪽 끝에서 올라와 가운데(y = 0)에 닿을 즈음 옅어져 사라진다 */
  function drawMist(t) {
    if (!atmosTex) makeAtmosTex();
    const z = cam.z, vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    if (vy1 < 0) return;                                           // 화면이 전부 가운데 선 위쪽이면 연기는 없다
    const Cm = 2400, Pm = 8000;
    const i0 = Math.floor(vx0 / Cm) - 1, i1 = Math.floor(vx1 / Cm) + 1;
    ctx.save();
    ctx.beginPath(); ctx.arc(CX, CY, R_MAP, 0, Math.PI * 2); ctx.clip();         // 맵 원 안에서만
    for (let i = i0; i <= i1; i++) {
      for (let n = 0; n < 2; n++) {                                // 칸마다 두 덩이: 겹쳐서 연기가 짙고 불규칙해진다
        const sd = 400 + n * 20;
        const hx = hash2(i, n, sd + 1), hs = hash2(i, n, sd + 2), hv = hash2(i, n, sd + 3), hp = hash2(i, n, sd + 4), ha = hash2(i, n, sd + 5), hq = hash2(i, n, sd + 6);
        const s0 = 3000 + 3000 * hs, v = 140 + 170 * hv, Pn = Pm * (0.9 + 0.5 * hq);
        const cx = (i + hx) * Cm + Math.sin(t * 0.11 + hp * 30) * 420, base = (((hp * Pn - t * v) % Pn) + Pn) % Pn;   // 위로(y 가 줄어드는 쪽) 흐른다
        if (Math.abs(cx) > R_MAP + 800) continue;
        for (let k = Math.ceil((Math.max(vy0, 0) - s0 * 1.4 - base) / Pn); k <= Math.floor((vy1 + s0 * 1.4 - base) / Pn); k++) {
          const yc = base + k * Pn;
          if (yc < 0 || yc > R_MAP) continue;
          const s = s0 * (0.75 + 0.8 * (1 - yc / R_MAP));         // 올라갈수록 퍼지며 커진다
          const meet = Math.min(1, yc / 9000);                     // 가운데에 가까울수록 옅어져 사라진다
          ctx.globalAlpha = (0.7 + 0.28 * ha) * meet * meet * (3 - 2 * meet);
          if (ctx.globalAlpha < 0.01) continue;
          ctx.drawImage(atmosTex.mist, cx - s / 2, yc - s / 2, s, s);
        }
      }
    }
    ctx.restore();
  }

  // ───────────────────────── 버려진 차원의 틈 ─────────────────────────
  // 비스듬히 갈라진 붉은 균열(눌러도 아무 일 없음)에서 치는 붉은 번개와 스파크, 뿜어져 나오는 검은 기운
  const bolts = [], sparks = [];
  let nextBoltT = 2, boltFlash = 0, redBloom = null;
  const abnSp = () => specials.find((x) => x.kind === "abandoned");

  // ── 번개
  function riftSpot(s) {                                            // 틈 중심과 크기 (월드)
    const sp = rifts[ABN], S = sp.S, k = s.scale, u = (sp.vc[0][0] - S / 2) * k, v = (sp.vc[0][1] - S / 2) * k;
    return { x: s.x + u * Math.cos(s.rot) - v * Math.sin(s.rot), y: s.y + u * Math.sin(s.rot) + v * Math.cos(s.rot), hw: sp.hw * k, hh: sp.hh * k };
  }
  function boltPath(x0, y0, x1, y1, depth, disp) {
    let pts = [[x0, y0], [x1, y1]];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        const o = (Math.random() - 0.5) * disp;
        next.push(a, [(a[0] + b[0]) / 2 - dy / l * o, (a[1] + b[1]) / 2 + dx / l * o]);
      }
      next.push(pts[pts.length - 1]); pts = next; disp *= 0.52;
    }
    return pts;
  }
  // 번개 소리: 틈에 가까울수록 크고 또렷하며(멀면 작고 먹먹하다), 틈이 화면의 어느 쪽에 있느냐에 따라 좌우에서 난다
  const BOLT_SFX = ["assets/sfx/lightning-1.wav?v=2", "assets/sfx/lightning-2.wav?v=2", "assets/sfx/lightning-3.wav?v=2", "assets/sfx/lightning-4.wav?v=2"];      // 쾅-쿵 / 쿵…쾅-쿵 / 쿵-쾅-쿵-쾅 / 멀리서 구르는 천둥
  let lastBoltSfx = -1;
  function playBoltSound(sp) {
    const sfx = window.RasyancutSfx; if (!sfx || !sfx.playAt) return;
    const D = Math.hypot(sp.x - cam.x, sp.y - cam.y), near = clamp(1 - D / 12000, 0, 1);      // 12000 칸 안에서 들리고, 가까울수록 커진다
    if (near <= 0.01) return;
    let k; do { k = (Math.random() * BOLT_SFX.length) | 0; } while (k === lastBoltSfx && BOLT_SFX.length > 1); lastBoltSfx = k;
    const zoom = 0.75 + 0.25 * Math.min(1, cam.z / 0.5);                                      // 많이 확대해서 볼수록 조금 더 크게
    sfx.playAt(BOLT_SFX[k], { volume: 0.32 * Math.pow(near, 1.7) * zoom, pan: clamp((sp.x - cam.x) * cam.z / (cw / 2), -1, 1) * 0.75, cutoff: 600 + 12000 * near * near, rate: 0.93 + Math.random() * 0.14 });
  }
  function spawnBolt(s, t) {
    const sp = riftSpot(s);
    const ox = sp.x + (Math.random() - 0.5) * sp.hw * 0.7, oy = sp.y + (Math.random() - 0.5) * sp.hh * 0.9;
    const ang = Math.random() * Math.PI * 2, len = 1100 + Math.random() * 2600;
    const ex = ox + Math.cos(ang) * len, ey = oy + Math.sin(ang) * len;
    const paths = [{ pts: boltPath(ox, oy, ex, ey, 6, len * 0.2), w: 1 }];
    const main = paths[0].pts, nb = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < nb; i++) {                                // 곁가지
      const p = main[(main.length * (0.2 + 0.6 * Math.random())) | 0], ba = ang + (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.6), bl = len * (0.22 + Math.random() * 0.3);
      paths.push({ pts: boltPath(p[0], p[1], p[0] + Math.cos(ba) * bl, p[1] + Math.sin(ba) * bl, 5, bl * 0.22), w: 0.5 });
    }
    bolts.push({ paths, born: t, life: 0.3 + Math.random() * 0.32, seed: Math.random() * 100, x0: ox, y0: oy, x1: ex, y1: ey });
    playBoltSound(sp); boltFlash = Math.min(1.4, boltFlash + 0.9); smokeHeavy = Math.min(1.5, smokeHeavy + 0.7);
    const burst = (x, y, n, sp0) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = sp0 * (0.25 + Math.random()); sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: 0.25 + Math.random() * 0.6 }); } };
    burst(ox, oy, 14, 2600); burst(ex, ey, 26, 3300);              // 나올 때마다 스파크: 틈에서 한 번, 번개가 닿는 곳에서 한 번
    for (const p of paths) if (p.w < 1 && Math.random() < 0.7) burst(p.pts[p.pts.length - 1][0], p.pts[p.pts.length - 1][1], 6, 1800);
  }
  function updateLightning(t, dt) {
    const s = abnSp(); if (!s) return;
    boltFlash *= Math.exp(-dt * 6);
    const sp = riftSpot(s), viewR = Math.hypot(cw, ch) / 2 / cam.z;
    if (t >= nextBoltT) {
      if (Math.hypot(sp.x - cam.x, sp.y - cam.y) < viewR + 5500) {
        spawnBolt(s, t);
        if (Math.random() < 0.35) setTimeout(() => { if (open && abnSp()) spawnBolt(abnSp(), t + 0.14); }, 140);   // 가끔 연달아 친다
      }
      nextBoltT = t + 0.55 + Math.random() * 1.9;
    }
    for (let i = bolts.length - 1; i >= 0; i--) if (t - bolts[i].born > bolts[i].life) bolts.splice(i, 1);
    const drag = Math.exp(-dt * 2.6);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.age += dt;
      if (p.age > p.life) { sparks.splice(i, 1); continue; }
      p.vx *= drag; p.vy *= drag; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
  }
  function drawLightning(t, z) {
    if (!bolts.length && !sparks.length) return;
    ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const b of bolts) {
      const age = t - b.born, f0 = Math.pow(1 - age / b.life, 1.3);
      const f = f0 * (0.55 + 0.45 * (Math.sin(age * 95 + b.seed) > -0.15 ? 1 : 0.3));       // 번쩍이며 다시 치는 듯한 깜박임
      // 번개가 닿는 곳과 틈 쪽에 번지는 붉은 빛
      for (const [x, y, rad, a] of [[b.x0, b.y0, 900, 0.5], [b.x1, b.y1, 1300, 0.45]]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(255,90,70,${a * f})`); g.addColorStop(1, "rgba(255,30,20,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
      }
      for (const [wpx, col, a] of [[16, "255,40,30", 0.13], [6.5, "255,85,60", 0.4], [2.2, "255,226,216", 0.97]]) {
        for (const p of b.paths) {
          ctx.strokeStyle = `rgba(${col},${a * f})`; ctx.lineWidth = Math.max(wpx * p.w / z, wpx * p.w * 0.08);
          ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        }
      }
    }
    for (const p of sparks) {                                       // 스파크: 빠르게 튀어 나가 식으며 붉어지는 짧은 불꽃
      const f = 1 - p.age / p.life, tl = 0.045;
      ctx.strokeStyle = `rgba(255,${Math.round(70 + 150 * f * f)},${Math.round(40 + 120 * f * f * f)},${0.9 * f})`;
      ctx.lineWidth = (1.1 + 1.6 * f) / z;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * tl, p.y - p.vy * tl); ctx.stroke();
    }
    ctx.restore();
  }


  // ── 버려진 틈에서 우수수 뿜어져 나오는 검은 기운: 뭉게뭉게 번지는 연기 · 빠르게 뻗는 검은 촉수 · 튀어 나가는 검은 파편
  const smoke = [];
  let smokeTex = null, smokeAcc = 0, smokeGush = 0, smokeNext = 1.5, smokeHeavy = 0, smokeVis = 0;   // smokeVis: 셰이더로 넘기는 세기(부드럽게 따라가게 한다)
  function makeSmokeTex() {
    const N = 192, c = mk(N, N), g = c.getContext("2d");
    const lobes = [[0, 0, 0.5], [0.2, 0.08, 0.34], [-0.22, 0.05, 0.32], [0.04, -0.2, 0.3], [-0.06, 0.22, 0.3], [0.26, -0.14, 0.24], [-0.27, -0.12, 0.24]];
    for (const [ox, oy, rr] of lobes) {
      const x = N / 2 + ox * N * 0.62, y = N / 2 + oy * N * 0.62, rad = rr * N * 0.92;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(3,0,4,0.95)"); gr.addColorStop(0.5, "rgba(4,0,6,0.62)"); gr.addColorStop(1, "rgba(4,0,6,0)");
      g.fillStyle = gr; g.fillRect(0, 0, N, N);
    }
    const r2 = mk(N, N), h = r2.getContext("2d");                      // 가장자리에 스미는 검붉은 빛
    const hr = h.createRadialGradient(N / 2, N / 2, N * 0.14, N / 2, N / 2, N / 2);
    hr.addColorStop(0, "rgba(160,10,24,0)"); hr.addColorStop(0.62, "rgba(190,16,30,0.5)"); hr.addColorStop(1, "rgba(140,0,14,0)");
    h.fillStyle = hr; h.fillRect(0, 0, N, N);
    return { body: c, rim: r2 };
  }

  // 틈에서 흘러나오는 검은 연기를 한 장의 셰이더로 그린다: 도메인 워핑한 노이즈를 바깥으로 흘려 보내 유체처럼 굽이치는 결을 만들고,
  // 틈 쪽을 향한 면에는 붉은 림 라이트, 연기 속에는 안쪽 빛이 비쳐 번진다 (이미지: 어둠 속에서 붉은 빛을 머금은 검은 연기)
  const SMOKE_FS = `
precision highp float;
uniform float uT, uGush, uSeed, uAng;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float smokeD(vec2 q){
  float r = length(q);
  vec2 dir = q / (r + 0.02);
  vec2 w = vec2(fbm(q * 0.45 + vec2(uSeed, -uT * 0.07)), fbm(q * 0.45 + vec2(5.2 + uSeed, 1.3) + uT * 0.06)) - 0.5;
  vec2 a = q + w * 3.0;                                              // 굽이치는 흐름
  vec2 vel = dir * 0.85 + vec2(-dir.y, dir.x) * 0.3 + w * 1.6;              // 바깥으로 흐르며 살짝 소용돌이친다
  float ph0 = fract(uT * 0.17), ph1 = fract(uT * 0.17 + 0.5), cr = abs(2.0 * ph0 - 1.0);   // 플로우맵: 늘어지지 않고 계속 흘러나간다
  vec2 s0 = a - vel * ph0 * 4.2, s1 = a - vel * ph1 * 4.2 + 7.3;
  float n = mix(fbm(s0 * 0.6), fbm(s1 * 0.6), cr);
  float fil = 1.0 - abs(2.0 * mix(fbm(s0 * 1.25 + 3.0), fbm(s1 * 1.25 + 3.0), cr) - 1.0);   // 가느다란 연기 올
  float d = n * 0.85 + 0.4 * pow(max(fil, 0.0), 2.0) - 0.06 * r;
  float pulse = 0.5 + 0.5 * sin(r * 2.2 - uT * 3.0 + n * 5.0);       // 우수수 — 덩어리째 밀려 나오는 파동
  d += (pulse - 0.5) * 0.2 + 0.1 * uGush;
  float dens = smoothstep(0.5, 0.86, d);
  dens *= 1.0 - smoothstep(3.0, 7.6, r);                             // 멀어질수록 흩어진다
  return dens * smoothstep(0.0, 0.5, r + 0.25);
}
void main(){
  vec2 p0 = (vUv * 2.0 - 1.0) * 8.0;
  float ca = cos(uAng), sa = sin(uAng);
  vec2 p = vec2(p0.x * ca + p0.y * sa, -p0.x * sa + p0.y * ca) * vec2(0.62, 1.25);   // 균열의 방향을 따라 길쭉하게 퍼진다
  float r = length(p);
  float d = smokeD(p);
  float dIn = smokeD(p - normalize(p + 1e-3) * 0.11);                // 틈 쪽으로 조금 떨어진 곳의 농도
  float rim = clamp((d - dIn) * 2.2, 0.0, 1.0) * d;                  // 틈을 향한 면만 붉게 빛난다
  float lit = 1.0 / (1.0 + r * 0.45);
  vec3 col = vec3(1.0, 0.12, 0.07) * rim * (0.1 + 0.45 * lit);
  col += vec3(0.3, 0.015, 0.035) * d * exp(-r * 0.6) * 0.5;           // 연기 속으로 스며든 붉은 빛
  float edge = 1.0 - smoothstep(0.82, 1.0, length(vUv * 2.0 - 1.0));
  float alpha = clamp(d * 1.05, 0.0, 1.0) * edge;
  gl_FragColor = vec4(col * edge, alpha);
}`;
  let smokeGL = null, smokeGLTried = false;
  function initSmokeGL() {
    smokeGLTried = true;
    try {
      const cv = document.createElement("canvas"); cv.width = cv.height = window.innerWidth < 760 ? 416 : 576;
      const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
      if (!gl) return;
      const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VORTEX_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, SMOKE_FS));
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      smokeGL = { cv, gl, uT: gl.getUniformLocation(prog, "uT"), uGush: gl.getUniformLocation(prog, "uGush"), uSeed: gl.getUniformLocation(prog, "uSeed"), uAng: gl.getUniformLocation(prog, "uAng") };
    } catch (e) { smokeGL = null; console.warn("검은 연기(WebGL) 사용 불가 → 입자로 대체:", e.message); }
  }
  function drawSmokeGL(s, t) {
    const sp = riftSpot(s), U = sp.hw, { gl, cv } = smokeGL;
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform1f(smokeGL.uT, t); gl.uniform1f(smokeGL.uGush, smokeVis); gl.uniform1f(smokeGL.uSeed, s.phase * 3.0); gl.uniform1f(smokeGL.uAng, -(s.rot + (rifts[ABN].ax || 0)));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.globalAlpha = 1; ctx.drawImage(cv, sp.x - U * 8, sp.y - U * 8, U * 16, U * 16);
  }

  function emitSmoke(s, n, boost) {
    const sp = riftSpot(s), cr = Math.cos(s.rot), sr = Math.sin(s.rot), U = sp.hw;
    for (let i = 0; i < n; i++) {
      const lx = (Math.random() - 0.5) * sp.hw * 1.1, ly = (Math.random() - 0.5) * sp.hh * 1.4;
      const la = Math.atan2(ly / sp.hh, lx / sp.hw) + (Math.random() - 0.5) * 1.5 + s.rot;
      const kind = smokeGL ? 0.95 : Math.random();                       // 셰이더가 연기를 그리면 파편만 입자로
      const sx = sp.x + lx * cr - ly * sr, sy = sp.y + lx * sr + ly * cr;
      if (kind < 0.66) {                                                // 뭉게뭉게 번지는 검은 연기
        const v = U * (0.9 + Math.random() * 2.6) * boost;
        smoke.push({ k: 0, x: sx, y: sy, vx: Math.cos(la) * v, vy: Math.sin(la) * v, age: 0, life: 3.2 + Math.random() * 3.6, r0: U * (0.3 + Math.random() * 0.45), r1: U * (1.4 + Math.random() * 2.2), rot: Math.random() * 6.3, spin: (Math.random() - 0.5) * 0.8, ph: Math.random() * 6.3, a: 0.7 + Math.random() * 0.3 });
      } else if (kind < 0.88) {                                         // 길게 뻗어 나가는 검은 촉수
        const v = U * (2.2 + Math.random() * 3.2) * boost;
        smoke.push({ k: 1, x: sx, y: sy, vx: Math.cos(la) * v, vy: Math.sin(la) * v, age: 0, life: 0.9 + Math.random() * 1.4, w: U * (0.05 + Math.random() * 0.1), ph: Math.random() * 6.3, a: 0.9 });
      } else {                                                          // 튀어 나가는 검은 파편
        const v = U * (1.2 + Math.random() * 3.6) * boost;
        smoke.push({ k: 2, x: sx, y: sy, vx: Math.cos(la) * v, vy: Math.sin(la) * v, age: 0, life: 1.2 + Math.random() * 2.2, w: U * (0.03 + Math.random() * 0.06), rot: Math.random() * 6.3, spin: (Math.random() - 0.5) * 9, ph: Math.random() * 6.3, a: 1 });
      }
    }
  }
  function updateSmoke(t, dt) {
    const s = abnSp(); if (!s) { smoke.length = 0; return; }
    dt = Math.min(dt, 0.06);
    smokeGush = Math.max(smokeGush, boltFlash * 0.9) * Math.exp(-dt * 1.5);
    smokeHeavy *= Math.exp(-dt * 2.2);
    const tgt = Math.min(1, smokeGush * 0.8 + smokeHeavy * 0.6);
    smokeVis += (tgt - smokeVis) * (1 - Math.exp(-dt * (tgt > smokeVis ? 3.5 : 1.4)));        // 번개가 쳐도 연기가 툭 튀지 않고 서서히 짙어졌다 가라앉는다
    const sp = riftSpot(s), viewR = Math.hypot(cw, ch) / 2 / cam.z;
    const near = Math.hypot(sp.x - cam.x, sp.y - cam.y) < viewR + 16000;
    if (near) {
      const pulse = 0.65 + 0.35 * Math.sin(t * 1.3) * Math.sin(t * 0.47 + 1.0);        // 들숨/날숨처럼 세기가 오르내린다
      smokeAcc += dt * (30 + 50 * pulse + 90 * smokeGush + 120 * smokeHeavy) * (smokeGL ? 0.3 : 1);
      const n = Math.floor(smokeAcc); smokeAcc -= n;
      if (n) emitSmoke(s, Math.min(n, 12), 1 + 0.5 * smokeGush);
      if (t >= smokeNext) { smokeHeavy = 1; emitSmoke(s, smokeGL ? 10 : 26, 1.5); smokeNext = t + 1.6 + Math.random() * 2.6; }   // 가끔 한꺼번에 우수수 뿜어낸다
    }
    for (let i = smoke.length - 1; i >= 0; i--) {
      const p = smoke[i]; p.age += dt;
      if (p.age >= p.life) { smoke.splice(i, 1); continue; }
      const drag = Math.exp(-dt * (p.k === 0 ? 0.5 : p.k === 1 ? 1.2 : 0.6));
      const w = Math.sin(t * 1.7 + p.ph * 3.0) * 0.6 + Math.sin(t * 0.9 + p.ph) * 0.4;        // 소용돌이치듯 굽는다
      const curl = (p.k === 0 ? 0.9 : 1.6) * w * dt;
      const cx = Math.cos(curl), cy = Math.sin(curl), nvx = p.vx * cx - p.vy * cy, nvy = p.vx * cy + p.vy * cx;
      p.vx = nvx * drag; p.vy = nvy * drag; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k !== 1) p.rot += p.spin * dt;
    }
    if (smoke.length > 480) smoke.splice(0, smoke.length - 480);
  }
  function drawSmoke(t, z) {
    const sA = abnSp(); if (!sA) return;
    { const q = riftSpot(sA); if (Math.hypot(q.x - cam.x, q.y - cam.y) > Math.hypot(cw, ch) / 2 / cam.z + q.hw * 9) return; }      // 멀리 있으면 그리지 않는다
    if (!smokeGLTried) initSmokeGL();
    if (!smokeGL && !smokeTex) smokeTex = makeSmokeTex();
    if (!smokeTex) smokeTex = makeSmokeTex();
    const { body, rim } = smokeTex;
    ctx.save();
    // 1) 검붉은 가장자리 빛: 까만 연기가 어둠 속에서도 윤곽으로 읽히게 한다
    ctx.globalCompositeOperation = "lighter";
    const s0 = abnSp();
    if (s0 && redBloom) {                                                // 틈 주변에 번진 검붉은 안개: 이게 있어야 까만 기운이 윤곽으로 보인다
      const sp = riftSpot(s0);
      ctx.globalAlpha = 0.55; ctx.drawImage(redBloom.cool, sp.x - sp.hw * 8, sp.y - sp.hw * 8, sp.hw * 16, sp.hw * 16);
      ctx.globalAlpha = 0.26; ctx.drawImage(redBloom.hot, sp.x - sp.hw * 5, sp.y - sp.hw * 5, sp.hw * 10, sp.hw * 10);
    }
    for (const p of smoke) {
      if (p.k !== 0) continue;
      const f = p.age / p.life, env = Math.min(1, f / 0.1) * Math.pow(1 - f, 1.3), r = p.r0 + (p.r1 - p.r0) * Math.pow(f, 0.7);
      ctx.globalAlpha = 0.2 * env * p.a; ctx.drawImage(rim, p.x - r * 1.35, p.y - r * 1.35, r * 2.7, r * 2.7);
    }
    // 2) 검은 몸통
    ctx.globalCompositeOperation = "source-over";
    if (smokeGL && s0) drawSmokeGL(s0, t);
    for (const p of smoke) {
      const f = p.age / p.life;
      if (p.k === 0) {
        const env = Math.min(1, f / 0.1) * Math.pow(1 - f, 1.1), r = p.r0 + (p.r1 - p.r0) * Math.pow(f, 0.7);
        ctx.globalAlpha = 0.95 * env * p.a;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(body, -r * 1.1, -r * 1.1, r * 2.2, r * 2.2); ctx.restore();
      } else if (p.k === 1) {                                           // 끝이 가늘어지며 휘어 뻗는 검은 촉수
        const env = Math.min(1, f / 0.06) * (1 - f), tl = 0.7, ww = p.w * (1 - f * 0.4) * 1.4;
        const hx = p.x, hy = p.y, tx = p.x - p.vx * tl, ty = p.y - p.vy * tl, L = Math.hypot(tx - hx, ty - hy) || 1, nx = -(ty - hy) / L, ny = (tx - hx) / L;
        const bend = Math.sin(t * 5 + p.ph * 3) * L * 0.22;
        ctx.globalAlpha = 0.95 * env; ctx.fillStyle = "#020003";
        ctx.beginPath(); ctx.moveTo(hx + nx * ww, hy + ny * ww);
        ctx.quadraticCurveTo((hx + tx) / 2 + nx * (ww * 0.7 + bend), (hy + ty) / 2 + ny * (ww * 0.7 + bend), tx + nx * bend * 1.4, ty + ny * bend * 1.4);
        ctx.quadraticCurveTo((hx + tx) / 2 - nx * (ww * 0.7 - bend), (hy + ty) / 2 - ny * (ww * 0.7 - bend), hx - nx * ww, hy - ny * ww);
        ctx.arc(hx, hy, ww, Math.atan2(-ny, -nx), Math.atan2(ny, nx), true); ctx.fill();
      } else {
        const env = Math.min(1, f / 0.05) * (1 - f * f), w = p.w;
        ctx.globalAlpha = 0.95 * env; ctx.fillStyle = "#030004"; ctx.strokeStyle = `rgba(190,34,40,${0.4 * env})`; ctx.lineWidth = Math.max(w * 0.1, 0.7 / z);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.moveTo(w * 2.2, 0); ctx.lineTo(-w * 0.5, w * 0.5); ctx.lineTo(-w * 2.0, -w * 0.12); ctx.lineTo(-w * 0.3, -w * 0.42); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    ctx.restore();
  }

  // ── 버려진 틈 안쪽의 일렁이는 소용돌이 + 틈 모습의 글리치 (한 장의 셰이더로 그린다)
  const RIFT_FS = `
precision highp float;
uniform sampler2D uSpr, uMask;
uniform vec2 uRegion0, uRegionSize, uC, uHalf, uDir;
uniform float uS, uT, uG, uFlash, uSeed;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
vec4 scene(vec2 uv){
  vec2 px = uRegion0 + vec2(uv.x, 1.0 - uv.y) * uRegionSize;
  vec2 suv = px / uS;
  vec4 spr = texture2D(uSpr, suv);
  float mk = texture2D(uMask, suv).r * step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 v0 = px - uC;
  vec2 p = vec2(dot(v0, uDir), dot(v0, vec2(-uDir.y, uDir.x))) / uHalf;                // 소용돌이가 균열의 방향을 따라 길게 놓인다
  // 일렁임: 소용돌이 좌표를 천천히 출렁이는 노이즈로 휘고, 반지름이 숨 쉬듯 흔들린다
  vec2 w = vec2(fbm(p * 1.6 + vec2(0.0, uT * 0.35)), fbm(p * 1.6 + vec2(5.2, 1.3) - uT * 0.3)) - 0.5;
  vec2 q = p + 0.38 * w + 0.05 * vec2(sin(p.y * 7.0 + uT * 3.0), cos(p.x * 6.0 - uT * 2.6));
  float rr = length(q) * (1.0 + 0.07 * sin(atan(q.y, q.x) * 3.0 + uT * 2.1) + 0.04 * sin(atan(q.y, q.x) * 5.0 - uT * 3.3)) + 1e-3;
  float aa = atan(q.y, q.x);
  float depth = 0.55 / (rr + 0.12);                                // 중심으로 빨려 들어가는 깊이
  float tw = aa + depth * 1.5 - uT * 0.9;                          // 깊을수록 더 비틀리는 나선
  vec2 c = vec2(cos(tw), sin(tw));
  float n1 = fbm(c * 1.9 + vec2(depth * 0.9, -uT * 0.5));
  float n2 = fbm(c * 4.4 - vec2(depth * 1.6, uT * 0.7) + 3.1);
  float arms = 0.5 + 0.5 * sin(4.0 * tw + n1 * 3.5);
  float body = smoothstep(0.25, 0.85, n1 * 0.7 + n2 * 0.5) * (0.45 + 0.55 * arms);
  float edge = smoothstep(0.5, 1.05, rr);
  float core = exp(-rr * rr * 26.0);
  vec3 col = vec3(0.03, 0.0, 0.008);
  col += vec3(0.58, 0.03, 0.05) * body * 1.15 * (0.35 + 0.9 * (1.0 - edge));
  col += vec3(1.0, 0.3, 0.14) * pow(max(body, 0.0), 2.0) * arms * 1.25;
  col += vec3(1.0, 0.55, 0.4) * core * (0.7 + 0.3 * sin(uT * 6.0) + uFlash);
  col += vec3(1.0, 0.92, 0.88) * exp(-rr * rr * 160.0) * 1.0;
  col += vec3(0.8, 0.1, 0.1) * pow(max(n2, 0.0), 5.0) * 0.8 * (1.0 - edge);   // 소용돌이 속에서 번득이는 불씨
  vec3 outc = spr.rgb + col * mk;                                 // 틈 그림의 어두운 속(불투명한 검정) 위에 소용돌이를 더해 얹는다
  return vec4(outc, max(mk, spr.a));
}
void main(){
  vec2 uv = vUv;
  float g = uG;
  // 글리치: 가로줄이 옆으로 밀리고, 큰 블록이 통째로 어긋나고, 가끔 화면이 말리며, RGB 가 갈라진다
  float tk = floor(uT * mix(8.0, 32.0, g)), row = floor(uv.y * mix(14.0, 64.0, g));
  float sl = step(1.0 - (0.07 + 0.55 * g), hash(vec2(row, tk + uSeed))) * (hash(vec2(row, tk + 9.0)) - 0.5) * 0.4 * g;
  vec2 bl = floor(uv * vec2(5.0, 7.0));
  vec2 boff = step(1.0 - 0.14 * g, hash(bl + tk * 3.7 + uSeed)) * (vec2(hash(bl + 1.7), hash(bl + 8.3)) - 0.5) * 0.34 * g;
  float roll = g * g * step(0.82, hash(vec2(tk, 5.0 + uSeed))) * 0.18 * fract(uT * 1.7);
  vec2 u2 = vec2(uv.x + sl + boff.x, fract(uv.y + roll) + boff.y);
  float ab = 0.004 + 0.034 * g * hash(vec2(tk, 2.0 + uSeed));
  vec4 a, b, c;
  if (g > 0.03) { a = scene(u2 + vec2(ab, 0.0)); b = scene(u2); c = scene(u2 - vec2(ab, 0.0)); }
  else { b = scene(u2); a = b; c = b; }
  vec3 col = vec3(a.r, 0.5 * (b.g + c.g) + 0.25 * a.r * g, c.b + 0.55 * c.r * g);     // 어긋난 복사본이 푸른 가장자리로 남는다
  float alpha = max(max(a.a, b.a), c.a);
  col *= 0.9 + 0.1 * sin(vUv.y * 340.0);                                               // 주사선
  float nz = hash(gl_FragCoord.xy + fract(uT) * 91.0);
  col = mix(col, vec3(nz) * alpha, g * g * 0.22);                                      // 지지직 노이즈
  col += vec3(0.7, 0.55, 0.55) * step(1.0 - 0.05 * g, hash(vec2(row, tk + 3.0 + uSeed))) * (0.4 + nz) * alpha;   // 하얀 노이즈 띠
  float lost = step(1.0 - 0.2 * g * g, hash(vec2(tk, 7.0 + uSeed)));                   // 신호가 끊긴 프레임
  col *= mix(1.0, 0.1, lost); alpha *= mix(1.0, 0.35, lost);
  gl_FragColor = vec4(min(col, vec3(1.0)), clamp(alpha, 0.0, 1.0));
}`;
  let riftGL = null, riftGLTried = false;
  function initRiftGL() {
    const sp = rifts[ABN]; if (!sp) return;
    try {
      if (!riftGL && !riftGLTried) {
        riftGLTried = true;
        const cv = document.createElement("canvas");
        const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
        if (!gl) return;
        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, VORTEX_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, RIFT_FS));
        gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
        gl.useProgram(prog);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        const U = {}; ["uSpr", "uMask", "uRegion0", "uRegionSize", "uC", "uHalf", "uDir", "uS", "uT", "uG", "uFlash", "uSeed"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
        riftGL = { cv, gl, U, tex: [] };
      }
      if (!riftGL) return;
      const { gl } = riftGL, S = sp.S;
      // 틈 모양(다각형)을 흰색으로 채운 마스크: 이 안쪽에만 소용돌이가 보인다
      const mk0 = mk(S, S), mg = mk0.getContext("2d"); mg.fillStyle = "#fff"; mg.beginPath();
      sp.pts.forEach(([u, v], i) => (i ? mg.lineTo(u, v) : mg.moveTo(u, v))); mg.closePath(); mg.fill();
      const up = (canvas, unit) => {
        if (riftGL.tex[unit]) gl.deleteTexture(riftGL.tex[unit]);
        const tx = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        riftGL.tex[unit] = tx;
      };
      up(sp.c, 0); up(mk0, 1);
      // 틈이 차지하는 영역(스프라이트 좌표)만 그린다
      const cx = sp.vc[0][0], cy = sp.vc[0][1], rx0 = Math.max(0, cx - sp.hw * 1.3), ry0 = Math.max(0, cy - sp.hh * 1.25);
      const rw = Math.min(S - rx0, sp.hw * 2.6), rh = Math.min(S - ry0, sp.hh * 2.5);
      riftGL.region = { x: rx0, y: ry0, w: rw, h: rh, cx, cy, hw: sp.hw, hh: sp.hh, half: sp.L ? [sp.L * 1.0, sp.W * 1.35] : [sp.hw, sp.hh], dir: sp.L ? [Math.cos(sp.ax), Math.sin(sp.ax)] : [1, 0] };
      riftGL.cv.width = window.innerWidth < 760 ? 288 : 384; riftGL.cv.height = Math.max(64, Math.round(riftGL.cv.width * rh / rw));
    } catch (e) { riftGL = null; console.warn("불안정한 틈(WebGL) 사용 불가 → 2D 로 대체:", e.message); }
  }
  const riftG = { next: 1.2, t0: -9, dur: 0, amp: 0 };       // 글리치 발작 상태

  function drawUnstableRift(s, t, z) {
    const sp = rifts[ABN]; if (!sp || !redBloom) return;
    const S = sp.S, k = s.scale, sz = S * k, W = (u, v) => [(u - S / 2) * k, (v - S / 2) * k];
    const [vx, vy] = W(sp.vc[0][0], sp.vc[0][1]);
    const base = 0.8 + 0.2 * Math.sin(t * 2.1 + s.phase);
    const unstable = 0.82 + 0.2 * Math.sin(t * 17 + s.phase) * Math.sin(t * 4.3) + (Math.random() - 0.5) * 0.12;      // 불안정하게 깜박인다
    const flick = clamp(base * unstable + boltFlash * 0.7, 0.3, 1.7);
    const j = 7 * (0.4 + boltFlash);
    ctx.save(); ctx.translate(s.x + (Math.random() - 0.5) * j, s.y + (Math.random() - 0.5) * j); ctx.rotate(s.rot + (Math.random() - 0.5) * 0.005 * (0.4 + boltFlash));
    ctx.globalCompositeOperation = "lighter";
    const bl = (tex, x, y, rad, a) => { ctx.globalAlpha = Math.min(1, a * flick); ctx.drawImage(tex, x - rad, y - rad, rad * 2, rad * 2); };
    bl(redBloom.cool, vx, vy, sz * 1.25, 0.26); bl(redBloom.hot, vx, vy, sz * 0.8, 0.34); bl(redBloom.core, vx, vy, sz * 0.4, 0.3 + 0.3 * boltFlash);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    const spx = sz * z * dpr;
    // 글리치 발작: 불규칙하게 찾아와 잠깐 심하게 일그러지고, 번개가 칠 때도 더 심해진다
    if (t >= riftG.next) { riftG.t0 = t; riftG.dur = 0.12 + Math.random() * 0.45; riftG.amp = 0.45 + Math.random() * 0.55; riftG.next = t + 0.5 + Math.random() * 1.8; }
    const burst = t - riftG.t0 < riftG.dur ? riftG.amp * (0.6 + 0.4 * Math.sin((t - riftG.t0) * 70)) : 0;
    const glitch = clamp(0.05 + burst + boltFlash * 0.45, 0, 1);
    if (riftGL && spx > 45) {
      const { gl, cv, U, region: R } = riftGL;
      gl.viewport(0, 0, cv.width, cv.height);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, riftGL.tex[0]); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, riftGL.tex[1]);
      gl.uniform1i(U.uSpr, 0); gl.uniform1i(U.uMask, 1);
      gl.uniform2f(U.uRegion0, R.x, R.y); gl.uniform2f(U.uRegionSize, R.w, R.h); gl.uniform2f(U.uC, R.cx, R.cy); gl.uniform2f(U.uHalf, R.half[0], R.half[1]); gl.uniform2f(U.uDir, R.dir[0], R.dir[1]);
      gl.uniform1f(U.uS, S); gl.uniform1f(U.uT, t); gl.uniform1f(U.uG, glitch); gl.uniform1f(U.uFlash, boltFlash * 0.8); gl.uniform1f(U.uSeed, s.phase * 7.0);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      ctx.drawImage(cv, (R.x - S / 2) * k, (R.y - S / 2) * k, R.w * k, R.h * k);
    } else {
      ctx.drawImage(spx < S / 4 * 1.1 ? sp.mips[0] : spx < S / 2 * 1.1 ? sp.mips[1] : sp.c, -sz / 2, -sz / 2, sz, sz);
      if (spx > 45) {                                                  // WebGL 없음: 틈 안쪽에 붉은 에너지를 2D 로 일렁이게
        ctx.save();
        ctx.beginPath(); sp.pts.forEach(([u, v], i) => { const [x, y] = W(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.clip();
        ctx.fillStyle = "#000"; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < 6; i++) {
          const a = t * (0.7 + i * 0.27) + i * 1.9, x = vx + Math.cos(a) * sp.hw * k * 0.42, y = vy + Math.sin(a * 1.3) * sp.hh * k * 0.5, rad = sp.hw * k * (0.55 + 0.22 * Math.sin(t * 3.1 + i));
          const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(255,${70 + 40 * (i % 2)},50,${0.34 * flick})`); g.addColorStop(1, "rgba(120,0,10,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill();
        }
        ctx.restore();
      }
    }
    ctx.rotate(-s.rot);
    const fs = Math.max(18 / z, 30);
    ctx.globalCompositeOperation = "source-over"; ctx.textAlign = "center"; ctx.shadowColor = "#ff3a2a"; ctx.shadowBlur = 16; ctx.fillStyle = "#ffd9d2";
    ctx.font = `700 ${fs}px "Noto Serif KR", serif`;
    ctx.fillText(s.name, 0, sp.hh * k + fs * 1.5);
    ctx.restore();
  }


  // ───────────────────────── 눈 · 성역의 각성 ─────────────────────────
  // 작고 많은 차원의 틈(관문) 안쪽에 3초마다 눈이 떠서 2초 동안 머문다. 뜬 눈을 누르면:
  //   ① 카메라가 성역으로 날아가고  ② 성역의 경계가 폭발하며  ③ 빛(위)과 어둠(아래)이 폭발한 자리로 모여들고  ④ 붉은 소용돌이가 피어난다.
  const EYE_PERIOD = 3, EYE_OPEN = 2, EYE_K = 0.68;
  let eyeChance = 1;                                                       // 관문 하나가 3초 주기마다 눈을 뜰 확률 (1 = 모든 주기에 뜬다. 낮추려면 이 값만 바꾼다)                                   // 3초마다 뜨고 2초 동안 유지
  const eyeOpenAmt = (g, t) => {
    const x = t + g.phase / 6.2832 * EYE_PERIOD, cyc = Math.floor(x / EYE_PERIOD), u = x - cyc * EYE_PERIOD;   // 관문마다 주기의 시작 시각이 다르다
    if (u >= EYE_OPEN || hash2(g.i, cyc, 91) >= eyeChance) return 0;     // 주기마다 eyeChance 확률로 눈이 뜬다
    return smooth01(0, 0.34, u) * (1 - smooth01(EYE_OPEN - 0.3, EYE_OPEN, u));
  };
  const EW = 320, EH = 200;
  const eyePath = (g, k, keep) => {                                     // 눈꺼풀이 만드는 아몬드 모양. k: 0(감김)~1(활짝). keep: 앞서 만든 경로에 이어 붙인다
    const cy = EH / 2;
    if (!keep) g.beginPath();
    g.moveTo(12, cy);
    g.bezierCurveTo(EW * 0.27, cy - 124 * k, EW * 0.73, cy - 124 * k, EW - 12, cy);
    g.bezierCurveTo(EW * 0.73, cy + 106 * k, EW * 0.27, cy + 106 * k, 12, cy); g.closePath();
  };
  let eyeTex = null;
  function makeEyeTex() {
    const r = rng32(9091), cx = EW / 2, cy = EH / 2;
    // 1) 공막: 안쪽은 따뜻하게 빛나고 가장자리로 갈수록 붉게 가라앉으며, 가는 핏줄이 홍채 쪽으로 뻗는다
    const sclera = mk(EW, EH), sg = sclera.getContext("2d");
    let gr = sg.createRadialGradient(cx, cy, 6, cx, cy, 175);
    gr.addColorStop(0, "rgb(255,250,222)"); gr.addColorStop(0.42, "rgb(252,232,172)"); gr.addColorStop(0.78, "rgb(196,126,76)"); gr.addColorStop(1, "rgb(84,30,24)");
    sg.fillStyle = gr; sg.fillRect(0, 0, EW, EH);
    sg.lineCap = "round";
    for (let i = 0; i < 34; i++) {
      const left = r() < 0.5, side = r();
      let x = left ? 16 + r() * 24 : EW - 16 - r() * 24, y = cy + (r() - 0.5) * 70;
      if (side < 0.35) { x = 70 + r() * 180; y = cy + (r() < 0.5 ? -1 : 1) * (62 + r() * 24) * Math.sin(Math.PI * (x / EW)); }
      const tx = cx + (r() - 0.5) * 120, ty = cy + (r() - 0.5) * 70;
      const w = 0.7 + r() * 1.3;
      const vein = (x0, y0, x1, y1, lw, a, d) => {
        const mx = (x0 + x1) / 2 + (r() - 0.5) * 26, my = (y0 + y1) / 2 + (r() - 0.5) * 26;
        sg.strokeStyle = `rgba(190,26,28,${a})`; sg.lineWidth = lw;
        sg.beginPath(); sg.moveTo(x0, y0); sg.quadraticCurveTo(mx, my, x1, y1); sg.stroke();
        if (d < 2 && r() < 0.7) vein(mx, my, mx + (x1 - mx) * 0.7 + (r() - 0.5) * 36, my + (y1 - my) * 0.7 + (r() - 0.5) * 36, lw * 0.6, a * 0.8, d + 1);
      };
      vein(x, y, tx, ty, w, 0.22 + r() * 0.3, 0);
    }
    // 2) 홍채: 방사형 섬유, 가운데 고리, 어두운 가장자리, 세로로 찢어진 동공, 젖은 반사광
    const iris = mk(EW, EH), ig = iris.getContext("2d"), Ri = 68;
    gr = ig.createRadialGradient(cx, cy, 6, cx, cy, Ri);
    gr.addColorStop(0, "#ffd45c"); gr.addColorStop(0.34, "#f5a01e"); gr.addColorStop(0.68, "#cc4c10"); gr.addColorStop(0.9, "#6c1608"); gr.addColorStop(1, "#2a0804");
    ig.fillStyle = gr; ig.beginPath(); ig.arc(cx, cy, Ri, 0, 7); ig.fill();
    ig.save(); ig.beginPath(); ig.arc(cx, cy, Ri, 0, 7); ig.clip(); ig.lineCap = "round";
    for (let i = 0; i < 340; i++) {
      const a = r() * 6.2832, r0 = Ri * (0.18 + r() * 0.26), r1 = Ri * (0.62 + r() * 0.38), lit = r() < 0.55;
      ig.strokeStyle = lit ? `rgba(255,232,150,${0.05 + r() * 0.26})` : `rgba(58,8,0,${0.1 + r() * 0.32})`; ig.lineWidth = 0.6 + r() * 1.5;
      ig.beginPath(); ig.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ig.lineTo(cx + Math.cos(a + (r() - 0.5) * 0.05) * r1, cy + Math.sin(a + (r() - 0.5) * 0.05) * r1); ig.stroke();
    }
    ig.strokeStyle = "rgba(255,240,170,0.35)"; ig.lineWidth = 2; ig.beginPath();                    // 동공을 둘러싼 불규칙한 고리
    for (let i = 0; i <= 90; i++) { const a = i / 90 * 6.2832, rr = Ri * (0.42 + 0.05 * Math.sin(a * 7 + 1) + 0.03 * (r() - 0.5)); i ? ig.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : ig.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
    ig.stroke();
    gr = ig.createRadialGradient(cx, cy, Ri * 0.74, cx, cy, Ri);
    gr.addColorStop(0, "rgba(20,2,0,0)"); gr.addColorStop(1, "rgba(14,1,0,0.92)"); ig.fillStyle = gr; ig.fillRect(0, 0, EW, EH);   // 홍채 가장자리(윤부)
    ig.restore();
    ig.shadowColor = "rgba(255,150,40,0.7)"; ig.shadowBlur = 8; ig.fillStyle = "#050000";               // 세로 동공
    ig.beginPath(); ig.ellipse(cx, cy, 9.5, 48, 0, 0, 7); ig.fill(); ig.shadowBlur = 0;
    gr = ig.createRadialGradient(cx - 24, cy - 28, 0, cx - 24, cy - 28, 26); gr.addColorStop(0, "rgba(255,255,255,0.8)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    ig.fillStyle = gr; ig.beginPath(); ig.arc(cx - 24, cy - 28, 26, 0, 7); ig.fill();                    // 젖은 반사광
    ig.fillStyle = "rgba(255,255,255,0.96)"; ig.beginPath(); ig.ellipse(cx - 19, cy - 31, 6.5, 4, -0.5, 0, 7); ig.fill();
    ig.fillStyle = "rgba(255,236,206,0.42)"; ig.beginPath(); ig.ellipse(cx + 25, cy + 24, 8, 4.5, 0.6, 0, 7); ig.fill();
    // 3) 눈꺼풀 안쪽의 그림자: 위쪽이 더 짙고, 가장자리가 눈을 감싼다
    const shade = mk(EW, EH), hg = shade.getContext("2d");
    hg.shadowColor = "rgba(0,0,0,0.95)"; hg.shadowBlur = 30; hg.fillStyle = "#000";
    hg.beginPath(); hg.rect(-120, -120, EW + 240, EH + 240); eyePath(hg, 1, true); hg.fill("evenodd"); hg.shadowBlur = 0;
    hg.save(); eyePath(hg, 1); hg.clip();
    gr = hg.createLinearGradient(0, 0, 0, EH); gr.addColorStop(0, "rgba(0,0,0,0.62)"); gr.addColorStop(0.42, "rgba(0,0,0,0.05)"); gr.addColorStop(1, "rgba(0,0,0,0.3)");
    hg.fillStyle = gr; hg.fillRect(0, 0, EW, EH); hg.restore();
    // 눈 주변으로 번지는 빛
    const glow = mk(256, 256), lg = glow.getContext("2d");
    gr = lg.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, "rgba(255,226,150,0.55)"); gr.addColorStop(0.3, "rgba(255,160,70,0.22)"); gr.addColorStop(0.65, "rgba(220,60,40,0.07)"); gr.addColorStop(1, "rgba(180,20,20,0)");
    lg.fillStyle = gr; lg.fillRect(0, 0, 256, 256);
    eyeTex = { sclera, iris, shade, glow };
  }
  /** 관문 안쪽에 눈을 그린다 (관문의 그림 좌표계: 원점 = 틈의 중심). oa: 뜬 정도 0~1, boost: 각성 때 번쩍임 */
  function drawEye(g, sp, t, oa, boost) {
    if (!eyeTex) makeEyeTex();
    const sm = (g.sx + g.sy) / 2, ew = sp.hw * EYE_K;
    ctx.save();
    ctx.scale(sm / (g.flip * g.sx), sm / g.sy);                           // 관문이 가로·세로로 늘어나도 눈은 찌그러지지 않게
    const k = 2 * ew / EW;
    ctx.scale(k, k); ctx.translate(-EW / 2, -EH / 2);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = Math.min(1, (0.55 + 0.45 * boost) * oa);
    ctx.drawImage(eyeTex.glow, EW / 2 - EW * 1.05, EH / 2 - EW * 1.05, EW * 2.1, EW * 2.1);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    // 눈동자는 보는 사람(화면 한가운데)을 따라간다
    let gx = cam.x - g.x, gy = cam.y - g.y; const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
    const cr = Math.cos(-g.rot), sr = Math.sin(-g.rot), lx = (gx * cr - gy * sr) * g.flip, ly = gx * sr + gy * cr;
    const wob = 1 + 0.05 * Math.sin(t * 2.3 + g.phase);
    eyePath(ctx, Math.max(0.02, oa * wob)); ctx.save(); ctx.clip();
    ctx.drawImage(eyeTex.sclera, 0, 0);
    ctx.drawImage(eyeTex.iris, lx * 34, ly * 15);
    ctx.drawImage(eyeTex.shade, 0, 0);
    ctx.restore();
    ctx.lineJoin = "round";
    eyePath(ctx, Math.max(0.02, oa * wob)); ctx.strokeStyle = "rgba(10,0,0,0.95)"; ctx.lineWidth = 8; ctx.stroke();    // 속눈썹선처럼 짙은 눈꺼풀 가장자리
    ctx.strokeStyle = `rgba(255,205,150,${0.5 * oa})`; ctx.lineWidth = 1.6; ctx.stroke();                                // 젖은 가장자리의 하이라이트
    ctx.restore();
  }
  const eyeWorldR = (g, sp) => sp.hw * EYE_K * (g.sx + g.sy) / 2;
  /** 화면 좌표가 뜬 눈 위인가 (눈이 작게 보여도 누를 수 있도록 최소 크기 보장) */
  function hitEye(clientX, clientY) {
    if (!open || !gates.length) return null;
    const rc = el.canvas.getBoundingClientRect(), t = (performance.now() - t0) / 1000;
    const wx = cam.x + (clientX - rc.left - cw / 2) / cam.z, wy = cam.y + (clientY - rc.top - ch / 2) / cam.z;
    let best = null, bd = 1e18;
    for (const g of gates) {
      const sp = rifts[g.v], rad = Math.max(eyeWorldR(g, sp) * 1.05, 16 / cam.z), dx = wx - g.x, dy = wy - g.y, d = dx * dx + dy * dy;
      if (d > rad * rad || d >= bd) continue;
      if (eyeOpenAmt(g, t) < 0.4) continue;
      best = g; bd = d;
    }
    return best;
  }

  // ── 각성 연출의 상태
  let awaken = null;                    // 진행 중인 연출 {start, gate, flew, boomed, pushed, ignited, ...}
  let awakened = false;                 // 붉은 소용돌이가 생겼는가 (맵을 닫으면 처음 상태로)
  let spinAcc = 0, shakeAmp = 0;
  const phoneView = () => cw < 760;                                       // 좁은 화면(휴대폰)
  const awkZoom = (z) => z * (phoneView() ? 0.6 : 1);                      // 휴대폰은 화면이 작아 같은 배율이면 경계가 화면을 넘쳐 터지는 모습이 안 보이므로 더 멀리서 본다
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { /* 진동 미지원 */ } };   // 진동(안드로이드 등)
  const AWK = { fly: 0.35, flyMs: 2650, boom: 3.0, conv0: 3.4, conv1: 7.0, ignite: 7.25, done: 9.9 };
  const awx = { debris: [], waves: [], puffs: [], sparks: [], stars: [], bolts: [], flash: 0 };
  const awxClear = () => { awx.debris.length = awx.waves.length = awx.puffs.length = awx.sparks.length = awx.stars.length = awx.bolts.length = 0; };
  const AWAKEN_SFX = "assets/sfx/awaken.wav?v=2";
  function startAwaken(g, now) {
    if (awaken || burn || portal) return;
    awaken = { start: now, gate: g, flew: false, boomed: false, pushed: false, ignited: false, q: 0 };
    awxClear();
    keys.clear(); vel.x = vel.y = 0; dragging = false; pointers.clear(); stick.x = stick.y = 0;
    const sfx = window.RasyancutSfx; if (sfx && sfx.playAt) sfx.playAt(AWAKEN_SFX, { volume: 0.6 });
    const bgm = window.RasyancutBgm; if (bgm && bgm.duck) bgm.duck();
  }
  /** 파편 하나의 모양: 불규칙한 바위, 길쭉한 쪼가리, 삼각형, 곡선 띠(깨진 경계 조각), 뾰족하게 갈라진 덩어리 — 매번 다르다. S: 크기(월드 단위) */
  function shardShape(S, rnd) {
    const k = rnd(), pts = [];
    if (k < 0.30) {                                                    // 불규칙한 바위
      const n = 4 + ((rnd() * 6) | 0), ax = 0.55 + rnd() * 0.9, ay = 0.45 + rnd() * 0.8;
      let a = rnd() * 6.2832; const step = 6.2832 / n;
      for (let i = 0; i < n; i++) { const r = S * (0.42 + rnd() * 0.58); pts.push([Math.cos(a) * r * ax, Math.sin(a) * r * ay]); a += step * (0.6 + rnd() * 0.8); }
    } else if (k < 0.52) {                                             // 길쭉한 쪼가리
      const L = S * (1.5 + rnd() * 2.2), W = S * (0.1 + rnd() * 0.16), sk = (rnd() - 0.5) * W * 2;
      pts.push([L, sk * 0.3], [L * 0.1, W], [-L * 0.8, W * 0.4 + sk], [-L, -sk * 0.4], [-L * 0.2, -W]);
    } else if (k < 0.68) {                                             // 삼각형
      for (let i = 0; i < 3; i++) { const a = i * 2.0944 + (rnd() - 0.5) * 1.1, r = S * (0.55 + rnd() * 0.6); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    } else if (k < 0.86) {                                             // 곡선 띠: 깨진 성역 경계의 한 조각
      const rho = S * (1.6 + rnd() * 1.8), span = 0.45 + rnd() * 0.7, th = S * (0.18 + rnd() * 0.3), m = 5 + ((rnd() * 4) | 0);
      for (let i = 0; i <= m; i++) { const a = -span / 2 + span * i / m; pts.push([Math.cos(a) * (rho + th * (0.7 + rnd() * 0.6)) - rho, Math.sin(a) * (rho + th * 0.5)]); }
      for (let i = m; i >= 0; i--) { const a = -span / 2 + span * i / m; pts.push([Math.cos(a) * (rho - th * (0.7 + rnd() * 0.6)) - rho, Math.sin(a) * (rho - th * 0.5)]); }
    } else {                                                           // 뾰족하게 갈라진 덩어리
      const n = 5 + ((rnd() * 4) | 0);
      for (let i = 0; i < n * 2; i++) { const a = i * 3.1416 / n + (rnd() - 0.5) * 0.3, r = S * (i % 2 ? 0.3 + rnd() * 0.25 : 0.8 + rnd() * 0.5); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    }
    return pts;
  }
  function explodeSanctuary() {
    const R = SANCT_R, rnd = Math.random;
    for (const [delay, speed, w] of [[0, 3600, 560], [0.1, 2600, 380], [0.24, 1800, 280], [0.45, 1100, 220]]) awx.waves.push({ born: 0, delay, speed, w, life: 2.4 });
    for (let i = 0; i < 210; i++) {                                    // 모양도 크기도 제각각인 파편: 작은 부스러기가 많고 거대한 덩어리가 드물게 섞인다
      const a = rnd() * 6.2832, S = clamp(9 * Math.exp(Math.pow(rnd(), 0.8) * 3.35), 8, 250), big = S / 250;
      const sp = (800 + rnd() * 2800) * (1.25 - 0.75 * big), tang = (rnd() - 0.5) * 520;
      awx.debris.push({
        x: Math.cos(a) * (R + rnd() * 50), y: Math.sin(a) * (R + rnd() * 50), vx: Math.cos(a) * sp - Math.sin(a) * tang, vy: Math.sin(a) * sp + Math.cos(a) * tang,
        shape: shardShape(S, rnd), S, rot: rnd() * 6.2832, spin: (rnd() - 0.5) * (9 - 7 * big), tilt: rnd() * 6.2832, tiltSp: (rnd() - 0.5) * (7 - 5 * big),
        age: 0, life: 1.8 + rnd() * 2.2 + big * 1.4, hot: 0.6 + rnd() * 0.4, tint: rnd(),
      });
    }
    for (let i = 0; i < 240; i++) { const a = rnd() * 6.2832, sp = 1500 + rnd() * 4200; awx.sparks.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.5 + rnd() * 1.0 }); }
    for (let i = 0; i < 40; i++) {                                     // 폭발이 일으킨 검은 먼지구름
      const a = rnd() * 6.2832, sp = 280 + rnd() * 700;
      awx.puffs.push({ x: Math.cos(a) * R * 0.95, y: Math.sin(a) * R * 0.95, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 2.8 + rnd() * 1.8, r0: 150 + rnd() * 160, r1: 800 + rnd() * 1300, rot: rnd() * 6.2832, spin: (rnd() - 0.5) * 0.5 });
    }
    for (let i = 0; i < 700; i++) {                                    // 빅뱅: 한 점에서 사방으로 쏟아지는 별빛(광속 잔상)
      const a = rnd() * 6.2832, sp = 1800 + Math.pow(rnd(), 1.6) * 16000, c = rnd();
      awx.stars.push({ x: Math.cos(a) * R * 0.2 * rnd(), y: Math.sin(a) * R * 0.2 * rnd(), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 1.3 + rnd() * 2.1, w: 0.7 + rnd() * 1.8, c });
    }
    awx.flash = 1; shakeAmp = phoneView() ? 38 : 30;
  }
  /** 빛과 어둠이 모여드는 동안 사방에서 중심으로 꽂히는 번개: 위쪽에서는 하얗게 빛나는 번개, 아래쪽에서는 붉게 타는 검은 번개 */
  function spawnConvBolt(ta, conv) {
    const R = SANCT_R, rnd = Math.random, light = rnd() < 0.5;
    const a = light ? -rnd() * Math.PI : rnd() * Math.PI, r0 = R * (3.2 + rnd() * 3.8), r1 = R * (0.18 + rnd() * 0.7), a1 = a + (rnd() - 0.5) * 0.9 + 0.5;
    const x0 = Math.cos(a) * r0, y0 = Math.sin(a) * r0, x1 = Math.cos(a1) * r1, y1 = Math.sin(a1) * r1, len = Math.hypot(x1 - x0, y1 - y0);
    const paths = [{ pts: boltPath(x0, y0, x1, y1, 6, len * 0.22), w: 1 }], main = paths[0].pts;
    for (let k = 0, nb = 2 + ((rnd() * 3) | 0); k < nb; k++) {
      const p = main[(main.length * (0.15 + 0.7 * rnd())) | 0], ba = Math.atan2(y1 - y0, x1 - x0) + (rnd() < 0.5 ? -1 : 1) * (0.35 + rnd() * 0.7), bl = len * (0.15 + rnd() * 0.3);
      paths.push({ pts: boltPath(p[0], p[1], p[0] + Math.cos(ba) * bl, p[1] + Math.sin(ba) * bl, 5, bl * 0.22), w: 0.5 });
    }
    awx.bolts.push({ paths, born: ta, life: 0.24 + rnd() * 0.3, light, seed: rnd() * 100, x1, y1 });
    for (let k = 0; k < 9; k++) { const b = rnd() * 6.2832, sp = 500 + rnd() * 1500; awx.sparks.push({ x: x1, y: y1, vx: Math.cos(b) * sp, vy: Math.sin(b) * sp, age: 0, life: 0.3 + rnd() * 0.5 }); }
    const sfx = window.RasyancutSfx;
    if (sfx && sfx.playAt && ta - (awaken.lastSnd || -9) > 0.5 && rnd() < 0.8) {                      // 쿵·쾅
      awaken.lastSnd = ta; buzz(18); sfx.playAt(BOLT_SFX[(rnd() * BOLT_SFX.length) | 0], { volume: 0.16 + 0.22 * conv, pan: (rnd() - 0.5) * 0.9, cutoff: 9000, rate: 0.9 + rnd() * 0.2 });
    }
  }
  function updateAwaken(now, dt) {
    shakeAmp *= Math.exp(-dt * 2.4);
    if (!awaken) return;
    const ta = awaken.hold != null ? awaken.hold : (now - awaken.start) / 1000;      // hold: 테스트용으로 연출 시각을 고정
    if (awaken.hold != null) dt = 0;
    awaken.ta = ta;
    if (!awaken.flew && ta >= AWK.fly) { awaken.flew = true; flyTo(CX, CY, awkZoom(0.2), AWK.flyMs); }          // 성역으로 날아간다
    if (!awaken.boomed && ta >= AWK.boom) {
      awaken.boomed = true; explodeSanctuary();
      flyTo(CX, CY, awkZoom(phoneView() ? 0.12 : 0.15), 260);                                    // 터지는 순간 카메라가 확 물러나 충격파가 퍼지는 것이 보인다
      buzz([70, 25, 140, 30, 260, 40, 90]);
    }
    if (!awaken.pushed && ta >= AWK.boom + 0.5) { awaken.pushed = true; flyTo(CX, CY, awkZoom(0.27), 4200); }  // 모여드는 동안 천천히 다가간다
    if (!awaken.ignited && ta >= AWK.ignite) { awaken.ignited = true; awakened = true; shakeAmp = Math.max(shakeAmp, 15); buzz([50, 40, 120, 40, 50]); awx.flash = 0.8; const bgm = window.RasyancutBgm; if (bgm && bgm.duck) bgm.duck(); }
    if (ta >= AWK.conv0 && ta < AWK.conv1 - 0.15) {                                                      // 수렴하는 동안 번개가 점점 잦아진다
      const conv = clamp((ta - AWK.conv0) / (AWK.conv1 - AWK.conv0), 0, 1);
      if (awaken.nextBolt == null) awaken.nextBolt = ta;
      let guard = 0;
      while (ta >= awaken.nextBolt && guard++ < 4) { spawnConvBolt(ta, conv); awaken.nextBolt += (0.5 + Math.random()) / (2.4 + 11 * conv); }
    }
    for (const w of awx.waves) w.born += dt;
    for (let i = awx.debris.length - 1; i >= 0; i--) {
      const p = awx.debris[i]; p.age += dt; if (p.age > p.life) { awx.debris.splice(i, 1); continue; }
      const d = Math.exp(-dt * (0.7 + 0.5 * (1 - p.S / 250))); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; p.tilt += p.tiltSp * dt;
    }
    for (let i = awx.sparks.length - 1; i >= 0; i--) {
      const p = awx.sparks[i]; p.age += dt; if (p.age > p.life) { awx.sparks.splice(i, 1); continue; }
      const d = Math.exp(-dt * 1.6); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = awx.stars.length - 1; i >= 0; i--) {
      const p = awx.stars[i]; p.age += dt; if (p.age > p.life) { awx.stars.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    for (let i = awx.bolts.length - 1; i >= 0; i--) if (ta - awx.bolts[i].born > awx.bolts[i].life) awx.bolts.splice(i, 1);
    for (let i = awx.puffs.length - 1; i >= 0; i--) {
      const p = awx.puffs[i]; p.age += dt; if (p.age > p.life) { awx.puffs.splice(i, 1); continue; }
      const d = Math.exp(-dt * 0.9); p.vx *= d; p.vy *= d; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
    }
    awx.flash *= Math.exp(-dt * 4.2);
    if (ta >= AWK.done) { awaken = null; awxClear(); }
  }
  /** 성역 경계(노랑) 그림의 투명도: 폭발로 사라졌다가 붉은 소용돌이가 피어난 뒤 약하게 되돌아온다 */
  function sanctAlpha() {
    if (!awaken) return awakened ? 0.55 : 1;
    const ta = awaken.ta || 0;
    if (ta < AWK.boom) return 1;
    if (ta < AWK.ignite + 0.4) return 0;
    return 0.55 * smooth01(AWK.ignite + 0.4, AWK.ignite + 2.6, ta);
  }
  /** 붉은 빛(성역 한가운데)이 어느 정도 켜졌나 */
  const redOnAmt = () => awaken ? smooth01(AWK.ignite, AWK.ignite + 1.8, awaken.ta || 0) : (awakened ? 1 : 0);

  // ── 빛(위)과 어둠(아래)이 모여들고 붉은 소용돌이가 피어나는 화면 공간 셰이더 (화면 해상도에 맞춰 그려 선명하다)
  const AWAKEN_FS = `
precision highp float;
uniform vec2 uView, uCam;
uniform float uZ, uT, uSpin, uConv, uConvOn, uImplode, uReveal, uRedOn, uIgn, uWhite, uBang;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float sq(float x){ return x * x; }
void main(){
  vec2 px = vec2(vUv.x * uView.x, (1.0 - vUv.y) * uView.y);
  vec2 rel = uCam + (px - 0.5 * uView) / uZ;                      // 성역 중심 기준 월드 좌표(y 는 아래로)
  float dist = length(rel);
  float rho = dist / 1000.0;                                       // 성역 반지름 단위
  float a = atan(rel.y, rel.x + 1e-5);
  vec3 col = vec3(0.0); float alpha = 0.0;

  // ── 0. 빅뱅: 성역 경계가 터지는 순간 한 점에서 불덩이가 폭발적으로 부풀어 오르고(백열 → 황금 → 주황 → 자줏빛으로 식는다), 충격 껍질과 사방으로 뻗는 빛줄기, 렌즈 십자 섬광이 번진다
  if (uBang >= 0.0) {
    float ab = uBang;
    float Rb = 0.5 + 8.5 * (1.0 - exp(-ab * 1.25));
    float fade = exp(-ab * 0.55);
    vec2 pc = vec2(cos(a), sin(a));
    float pl = fbm(pc * 1.6 + vec2(rho * 0.55 - ab * 1.1, ab * 0.35));
    float pl2 = fbm(pc * 3.4 - vec2(rho * 0.9, ab * 0.8) + 4.0);
    float d = rho / Rb + (pl - 0.5) * 0.55 + (pl2 - 0.5) * 0.2;
    float body = 1.0 - smoothstep(0.3, 1.0, d);
    float heat = clamp(1.3 - d * 1.55 + (pl - 0.5) * 0.55, 0.0, 1.2);
    vec3 hc = mix(vec3(0.45, 0.06, 0.28), vec3(1.0, 0.35, 0.08), smoothstep(0.0, 0.35, heat));
    hc = mix(hc, vec3(1.0, 0.82, 0.32), smoothstep(0.35, 0.7, heat));
    hc = mix(hc, vec3(1.0, 1.0, 0.94), smoothstep(0.7, 1.05, heat));
    col += hc * body * (0.45 + 1.25 * heat) * (0.4 + 1.2 * pl2) * fade * 1.15;
    float shell = exp(-sq((rho - Rb * 1.08) / (0.16 + 0.12 * ab))) * (1.0 - smoothstep(0.0, 4.0, ab));
    col += mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.95, 0.85), 0.45) * shell * 1.5;
    float rn = vnoise(pc * 6.0 + 11.0) * 0.65 + vnoise(pc * 17.0 + 3.0 + ab * 0.3) * 0.35;
    float rays = sq(smoothstep(0.52, 0.9, rn)) * exp(-rho / (Rb * 1.5 + 1.0)) * smoothstep(0.0, 0.2, ab) * fade;
    col += vec3(1.0, 0.93, 0.7) * rays * 1.5;
    float fx = exp(-sq(rel.y / (36.0 + 70.0 * ab))) * exp(-abs(rel.x) / 3200.0) * fade;
    float fy = exp(-sq(rel.x / (26.0 + 40.0 * ab))) * exp(-abs(rel.y) / 1800.0) * fade;
    col += vec3(1.0, 0.9, 0.6) * (fx * 0.75 + fy * 0.4);
    col += vec3(1.0) * exp(-sq(rho / (0.5 + 0.4 * ab))) * 1.5 * exp(-ab * 1.6);
  }

  // ── A. 빛과 어둠의 수렴: 위쪽에서 온 빛과 아래쪽에서 온 어둠이 소용돌이치며 중심으로 감겨 든다
  if (uConvOn > 0.001) {
    float rr = max(rho, 0.03), lg = log(rr);
    float spinT = uT * (0.5 + 2.2 * uConv);
    float N = 7.0, kk = 1.35;
    float u1 = a * N / 6.2831853 + kk * lg + spinT;
    float u2 = a * 19.0 / 6.2831853 + 2.1 * lg + spinT * 1.7 + 3.0;
    float s1 = abs(fract(u1) - 0.5) * 2.0, s2 = abs(fract(u2) - 0.5) * 2.0;
    float strand = exp(-sq(s1) * 4.2) * 1.0 + exp(-sq(s2) * 8.0) * 0.7;
    float flowN = fbm(vec2(lg * 3.2 + uT * 1.4 * (0.6 + uConv), u1 * 0.8));
    float breakup = smoothstep(0.18, 0.5, flowN);
    float rout = mix(9.0, 2.6, pow(clamp(uConv, 0.0, 1.0), 1.2));
    float envR = 1.0 - smoothstep(rout * 0.55, rout, rr);
    float inner = smoothstep(0.22, 1.05, rr);
    float gain = 1.0 + 3.2 / (rr + 0.5);
    float stream = strand * breakup * envR * inner * gain * uConvOn;
    float ao = a + 6.2831853 / N * kk * (lg - 1.9459);              // 이 팔이 바깥(ρ=7)에서 출발한 각도
    float lightMix = smoothstep(-0.25, 0.25, -sin(ao));             // 위(화면 위쪽)에서 온 팔은 빛, 아래에서 온 팔은 어둠
    vec3 lightCol = mix(vec3(1.0, 0.92, 0.52), vec3(1.0, 1.0, 0.92), smoothstep(2.4, 0.4, rr));
    float lightA = stream * lightMix, darkA = stream * (1.0 - lightMix);
    // 중심: 모일수록 커지는 빛과 어둠의 소용돌이 (태극처럼 맞물려 돈다)
    float coreR = mix(0.28, 1.15, uConv) * (1.0 - 0.92 * uImplode);
    float cr = rr / max(coreR, 0.02), disc = exp(-sq(cr) * 1.5);
    float yy = smoothstep(-0.25, 0.25, sin(a * 2.0 + 3.2 * log(rr + 0.12) - uT * (5.0 + 9.0 * uConv)));
    lightA += disc * yy * (1.2 + 2.0 * uConv) * uConvOn;
    darkA += disc * (1.0 - yy) * 1.2 * uConvOn;
    float bloom = exp(-sq(rr) * 0.3) * uConvOn * (0.18 + 0.5 * uConv);
    float dk = clamp(darkA * 1.9, 0.0, 0.97);
    col = (col + lightCol * (lightA * 2.5 + bloom) + vec3(0.30, 0.0, 0.06) * dk * 0.35) * (1.0 - dk * 0.7);      // 빅뱅의 불덩이 위에 겹쳐 얹는다
    alpha = dk;
    col += vec3(1.0, 0.98, 0.9) * uWhite * exp(-sq(rr) * 0.5);       // 한 점으로 무너지는 순간의 섬광
  }

  // ── B. 붉은 소용돌이: 성역 경계를 감싸며 안쪽부터 번져 나간다
  if (uRedOn > 0.001) {
    float RR = 5.4, r = rho / RR, uRi = 1.04 / RR;
    if (r < 1.0) {
      float lr = log(max(r, 0.001));
      float spin = uSpin * (0.28 + 0.9 * (1.0 - r));
      float ph = a - spin + lr * 2.3;
      vec2 c = vec2(cos(ph), sin(ph));
      float n1 = fbm(c * 1.7 + vec2(lr * 3.0, uT * 0.1));
      float n2 = fbm(c * 4.3 - vec2(lr * 5.5, uT * 0.18) + 3.7);
      float arms = 0.5 + 0.5 * sin(5.0 * ph + n1 * 3.2);
      float body = smoothstep(0.22, 0.85, n1 * 0.7 + n2 * 0.5) * (0.5 + 0.5 * arms);
      float mask = smoothstep(uRi * 0.97, uRi * 1.12, r) * (1.0 - smoothstep(0.55, 1.0, r));
      float hot = exp(-sq((r - uRi * 1.1) / 0.03));
      float ember = pow(max(n2, 0.0), 4.5) * mask;
      float bt = uT * 2.4;
      float beat = clamp(pow(max(0.0, sin(bt)), 8.0) + 0.65 * pow(max(0.0, sin(bt - 0.7)), 10.0), 0.0, 1.0);
      float wp = fract(uT * 0.38), wr = uRi + wp * (0.85 - uRi);
      float wave = exp(-sq((r - wr) / 0.05)) * (1.0 - wp) * mask;
      float vn = fbm(c * 3.4 + vec2(lr * 4.5, uT * 0.05));
      float vein = smoothstep(0.90, 0.985, 1.0 - abs(2.0 * vn - 1.0)) * mask;
      vec3 rc = vec3(0.50, 0.025, 0.045) * body * 1.25;
      rc += vec3(1.0, 0.2, 0.09) * pow(max(body, 0.0), 2.0) * arms * 0.95;
      rc += vec3(1.0, 0.5, 0.32) * (hot * (0.7 + 0.6 * n2) + ember * 0.9);
      rc += vec3(0.95, 0.22, 0.14) * vein * (0.3 + 0.9 * beat);
      rc *= 1.0 + 0.15 * beat * mask;
      rc -= vec3(0.5, 0.08, 0.1) * wave * 0.9;
      rc += vec3(1.0, 0.25, 0.2) * wave * 0.35;
      float ra = clamp(mask * (0.3 + 0.8 * body) + hot * 0.85 + wave * 0.3, 0.0, 1.0);
      rc *= clamp(mask + hot, 0.0, 1.0);
      // 안쪽에서 바깥으로 번져 나가는 가장자리 + 점화 순간의 붉은 충격파
      float edgeR = mix(uRi * 1.05, 1.06, uReveal);
      float rv = 1.0 - smoothstep(edgeR - 0.12, edgeR, r + (n2 - 0.5) * 0.06);
      float front = exp(-sq((r - edgeR + 0.03) / 0.035)) * uIgn * (1.0 - uReveal * 0.5);
      rc = rc * rv + vec3(1.0, 0.45, 0.35) * front * 1.4;
      ra = max(ra * rv, clamp(front, 0.0, 1.0) * 0.9);
      rc *= uRedOn; ra *= uRedOn;
      col = rc + col * (1.0 - ra); alpha = ra + alpha * (1.0 - ra);
    }
  }
  gl_FragColor = vec4(col, alpha);
}`;
  let awGL = null, awGLTried = false, awEma = 16, awQ = 0.72;
  function initAwakenGL() {
    awGLTried = true;
    try {
      const cv = document.createElement("canvas"); cv.width = cv.height = 16;
      const gl = cv.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
      if (!gl) return;
      const sh = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VORTEX_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, AWAKEN_FS));
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = {}; ["uView", "uCam", "uZ", "uT", "uSpin", "uConv", "uConvOn", "uImplode", "uReveal", "uRedOn", "uIgn", "uWhite", "uBang"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      cv.addEventListener("webglcontextlost", (e) => { e.preventDefault(); awGL = null; });
      awGL = { cv, gl, U };
    } catch (e) { awGL = null; console.warn("각성 연출(WebGL) 사용 불가 → 2D 로 대체:", e.message); }
  }
  /** 화면 전체에 한 장으로 그려 월드 그림 위(성역 아래)에 얹는다 */
  function drawAwakenGL(t, dt) {
    const ta = awaken ? (awaken.ta || 0) : 0;
    const convOn = awaken && ta >= AWK.conv0 - 0.6 && ta < AWK.ignite + 0.05
      ? smooth01(AWK.conv0 - 0.6, AWK.conv0 + 0.5, ta)  : 0;
    const conv = awaken ? clamp((ta - AWK.conv0) / (AWK.conv1 - AWK.conv0), 0, 1) : 0;
    const implode = awaken ? smooth01(AWK.conv1, AWK.ignite, ta) : 0;
    const redOn = redOnAmt(), reveal = awaken ? smooth01(AWK.ignite, AWK.ignite + 2.3, ta) : (awakened ? 1 : 0);
    const ign = awaken && ta >= AWK.ignite ? Math.exp(-(ta - AWK.ignite) / 1.5) : 0;
    const white = awaken ? smooth01(AWK.conv1 - 0.25, AWK.conv1 + 0.2, ta) * (1 - smooth01(AWK.ignite - 0.03, AWK.ignite + 0.2, ta)) * 1.1 : 0;
    const bang = awaken && ta >= AWK.boom && ta < AWK.boom + 6.5 ? ta - AWK.boom : -1;
    if (convOn <= 0.001 && redOn <= 0.001 && bang < 0) return;
    const z = cam.z, viewR = Math.hypot(cw, ch) / 2 / z;
    if (convOn <= 0.001 && bang < 0 && Math.hypot(cam.x - CX, cam.y - CY) > SANCT_R * 5.4 + viewR) return;       // 붉은 소용돌이가 화면에 안 걸리면 건너뛴다
    if (!awGLTried) initAwakenGL();
    if (!awGL) return;
    spinAcc += dt * (1 + 2.5 * (1 - reveal));
    awEma += (dt * 1000 - awEma) * 0.06;                                           // 느리면 해상도를 낮추고, 여유가 생기면 되돌린다
    if (awEma > 42 && awQ > 0.42) awQ = Math.max(0.42, awQ * 0.97); else if (awEma < 26 && awQ < 0.85) awQ = Math.min(0.85, awQ * 1.01);
    const q = window.innerWidth < 760 ? Math.min(awQ, 0.7) : awQ;
    const w = Math.max(2, Math.round(cw * q)), h = Math.max(2, Math.round(ch * q));
    const { gl, cv, U } = awGL;
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uView, cw, ch); gl.uniform2f(U.uCam, cam.x - CX, cam.y - CY); gl.uniform1f(U.uZ, z); gl.uniform1f(U.uT, t); gl.uniform1f(U.uSpin, spinAcc);
    gl.uniform1f(U.uConv, conv); gl.uniform1f(U.uConvOn, convOn); gl.uniform1f(U.uImplode, implode); gl.uniform1f(U.uReveal, reveal);
    gl.uniform1f(U.uRedOn, redOn); gl.uniform1f(U.uIgn, ign); gl.uniform1f(U.uWhite, white); gl.uniform1f(U.uBang, bang);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cv, 0, 0, cw, ch);
    ctx.restore();
  }
  /** 성역 한가운데의 눈부신 붉은 빛 (별이 가려질 만큼 밝다) */
  let redRad = null;
  function makeRedRadiance() {
    const S = 768, glow = (stops) => {
      const c = mk(S, S), g = c.getContext("2d"), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, S, S); return c;
    };
    const halo = glow([[0, "rgba(255,40,30,0.5)"], [0.06, "rgba(240,30,28,0.34)"], [0.16, "rgba(190,14,24,0.18)"], [0.34, "rgba(130,6,16,0.08)"], [0.6, "rgba(90,2,10,0.025)"], [1, "rgba(70,0,8,0)"]]);
    const mid = glow([[0, "rgba(255,110,90,0.8)"], [0.08, "rgba(255,70,55,0.6)"], [0.2, "rgba(220,28,34,0.34)"], [0.42, "rgba(150,10,22,0.14)"], [0.7, "rgba(100,3,12,0.04)"], [1, "rgba(80,0,10,0)"]]);
    const core = glow([[0, "rgba(255,246,240,1)"], [0.07, "rgba(255,200,185,0.92)"], [0.18, "rgba(255,110,90,0.62)"], [0.38, "rgba(225,36,40,0.27)"], [0.68, "rgba(150,8,22,0.07)"], [1, "rgba(110,0,14,0)"]]);
    const rays = (seed, n) => {
      const c = mk(1024, 1024), g = c.getContext("2d"), r = rng32(seed);
      g.translate(512, 512); g.globalCompositeOperation = "lighter";
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, len = 230 + 280 * Math.pow(r(), 0.7), wd = 0.004 + 0.016 * r() * r(), al = 0.25 + 0.55 * r();
        const gr = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
        gr.addColorStop(0, `rgba(255,170,150,${al})`); gr.addColorStop(0.3, `rgba(255,60,50,${al * 0.55})`); gr.addColorStop(1, "rgba(150,0,16,0)");
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0);
        g.lineTo(Math.cos(a - wd) * len, Math.sin(a - wd) * len); g.lineTo(Math.cos(a + wd) * len, Math.sin(a + wd) * len); g.closePath(); g.fill();
      }
      return c;
    };
    const fl = mk(1024, 64), fg = fl.getContext("2d");
    fg.translate(512, 32); fg.scale(1, 0.07);
    const fgr = fg.createRadialGradient(0, 0, 0, 0, 0, 512);
    fgr.addColorStop(0, "rgba(255,225,215,0.95)"); fgr.addColorStop(0.12, "rgba(255,90,72,0.6)"); fgr.addColorStop(0.45, "rgba(200,20,32,0.2)"); fgr.addColorStop(1, "rgba(120,0,14,0)");
    fg.fillStyle = fgr; fg.fillRect(-512, -512, 1024, 1024);
    return { halo, mid, core, rays: [rays(41, 34), rays(87, 26)], flare: fl };
  }
  function drawRedRadiance(t) {
    const amt = redOnAmt(); if (amt <= 0.003) return;
    const z = cam.z, R = SANCT_R, viewR = Math.hypot(cw, ch) / 2 / z;
    if (Math.hypot(cam.x - CX, cam.y - CY) > R * 17 + viewR) return;
    if (!redRad) redRad = makeRedRadiance();
    const pulse = (0.88 + 0.12 * Math.sin(t * 1.15) + 0.04 * Math.sin(t * 3.7 + 1.3) + 0.025 * Math.sin(t * 9.1)) * amt;
    const rd = redRad;
    ctx.save(); ctx.translate(CX, CY); ctx.globalCompositeOperation = "lighter";
    const bl = (tex, rad, a) => { ctx.globalAlpha = Math.min(1, a * pulse); ctx.drawImage(tex, -rad, -rad, rad * 2, rad * 2); };
    bl(rd.halo, R * 12, 0.9);
    bl(rd.mid, R * 5.2, 0.85);
    ctx.save(); ctx.rotate(t * 0.035); bl(rd.rays[0], R * 15, 0.7); ctx.restore();
    ctx.save(); ctx.rotate(-t * 0.024 + 1.1); bl(rd.rays[1], R * 11, 0.55); ctx.restore();
    ctx.globalAlpha = 0.55 * pulse; ctx.drawImage(rd.flare, -R * 9, -R * 0.6, R * 18, R * 1.2);
    ctx.save(); ctx.rotate(Math.PI / 2); ctx.globalAlpha = 0.3 * pulse; ctx.drawImage(rd.flare, -R * 5, -R * 0.42, R * 10, R * 0.84); ctx.restore();
    bl(rd.core, R * 2.3, 1);
    ctx.restore();
  }
  /** 폭발이 일으킨 검은 먼지구름: 빛줄기보다 아래에 깔린다 */
  function drawAwakenPuffs() {
    if (!awaken || !awx.puffs.length) return;
    if (!smokeTex) smokeTex = makeSmokeTex();
    ctx.save(); ctx.translate(CX, CY);
    for (const p of awx.puffs) {
      const f = p.age / p.life, env = Math.min(1, f / 0.08) * Math.pow(1 - f, 1.4), r = p.r0 + (p.r1 - p.r0) * Math.pow(f, 0.6);
      ctx.globalAlpha = 0.6 * env; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.drawImage(smokeTex.body, -r, -r, r * 2, r * 2); ctx.restore();
    }
    ctx.restore();
  }
  /** 성역 경계의 폭발: 빅뱅의 별빛 · 충격파 · 모양이 제각각인 파편 · 불꽃, 그리고 모여드는 빛과 어둠에 꽂히는 번개 (월드 좌표) */
  function drawAwakenBlast(t) {
    if (!awaken || !awaken.boomed) return;
    const z = cam.z, R = SANCT_R, px = 1 / z, ta = awaken.ta;
    ctx.save(); ctx.translate(CX, CY);
    ctx.globalCompositeOperation = "lighter";
    const age = ta - AWK.boom;
    if (age < 0.9) {                                                                  // 폭발 중심의 섬광
      const a = Math.pow(1 - age / 0.9, 1.5), rad = R * (1.8 + 3.4 * age);
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, `rgba(255,255,246,${a})`); gr.addColorStop(0.3, `rgba(255,238,150,${0.6 * a})`); gr.addColorStop(1, "rgba(255,220,100,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rad, 0, 7); ctx.fill();
    }
    ctx.lineCap = "round";
    for (const p of awx.stars) {                                                      // 빅뱅의 별빛: 광속 잔상처럼 길게 늘어난 빛줄기
      const f = 1 - p.age / p.life, a = f * Math.min(1, p.age / 0.05), L = 0.05 + 0.04 * (1 - f);
      ctx.strokeStyle = p.c < 0.55 ? `rgba(255,250,232,${0.85 * a})` : p.c < 0.8 ? `rgba(190,215,255,${0.8 * a})` : `rgba(255,214,140,${0.8 * a})`;
      ctx.lineWidth = p.w * px * (0.6 + f); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * L, p.y - p.vy * L); ctx.stroke();
    }
    for (const w of awx.waves) {                                                      // 퍼져 나가는 충격파 고리
      const a0 = w.born - w.delay; if (a0 <= 0 || a0 > w.life) continue;
      const rr = R + w.speed * (1 - Math.exp(-a0 * 1.7)) / 1.7, k = Math.pow(1 - a0 / w.life, 1.6), th = w.w * (0.3 + 0.45 * a0);
      const gr = ctx.createRadialGradient(0, 0, Math.max(0, rr - th * 2.6), 0, 0, rr + th * 0.3);
      gr.addColorStop(0, "rgba(255,226,120,0)"); gr.addColorStop(0.72, `rgba(255,222,120,${0.1 * k})`); gr.addColorStop(0.94, `rgba(255,252,226,${0.95 * k})`); gr.addColorStop(1, "rgba(255,255,255,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rr + th * 0.3, 0, 7); ctx.fill();
    }
    // 번개: 위쪽은 하얗게 빛나는 번개, 아래쪽은 붉은 테두리가 타오르는 검은 번개
    for (const b of awx.bolts) {
      const ba = ta - b.born, f0 = Math.pow(1 - ba / b.life, 1.3), f = f0 * (0.55 + 0.45 * (Math.sin(ba * 95 + b.seed) > -0.15 ? 1 : 0.3));
      const rg = ctx.createRadialGradient(b.x1, b.y1, 0, b.x1, b.y1, 520); rg.addColorStop(0, b.light ? `rgba(255,244,180,${0.5 * f})` : `rgba(255,50,50,${0.3 * f})`); rg.addColorStop(1, "rgba(255,200,100,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(b.x1, b.y1, 520, 0, 7); ctx.fill();
      const layers = b.light ? [[18, "255,226,110", 0.14], [7, "255,244,170", 0.45], [2.4, "255,255,246", 0.98]] : [[22, "170,10,30", 0.16], [9, "230,30,40", 0.42]];
      for (const [wpx, col, a] of layers) for (const p of b.paths) {
        ctx.strokeStyle = `rgba(${col},${a * f})`; ctx.lineWidth = Math.max(wpx * p.w * px, wpx * p.w * 0.08 * px * z * 1.0);
        ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
    for (const b of awx.bolts) {                                                      // 검은 번개의 몸통 (붉은 빛 위에 얹는다)
      if (b.light) continue;
      const ba = ta - b.born, f = Math.pow(1 - ba / b.life, 1.3) * (0.55 + 0.45 * (Math.sin(ba * 95 + b.seed) > -0.15 ? 1 : 0.3));
      for (const [wpx, col, a] of [[6.5, "0,0,0", 0.97], [1.3, "255,90,90", 0.8]]) for (const p of b.paths) {
        ctx.strokeStyle = `rgba(${col},${a * f})`; ctx.lineWidth = Math.max(wpx * p.w * px, 0.8 * px);
        ctx.beginPath(); p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
    }
    // 파편: 크기·모양이 제각각. 식어 가며 달궈진 가장자리만 빛나고, 3차원으로 뒹굴 듯 납작해졌다 펴진다
    ctx.lineJoin = "round";
    for (const p of awx.debris) {
      const f = p.age / p.life, a = Math.pow(1 - f, 1.1) * (f < 0.05 ? f / 0.05 : 1), heat = Math.pow(1 - f, 0.8) * p.hot, sy = Math.max(0.22, Math.abs(Math.cos(p.tilt)));
      const path = new Path2D(); p.shape.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath();
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, sy);
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.3 * a * heat; ctx.strokeStyle = p.tint < 0.5 ? "rgb(255,196,96)" : "rgb(255,150,90)"; ctx.lineWidth = Math.max(p.S * 0.22, 3 * px); ctx.stroke(path);   // 달궈진 번짐
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = a;
      const hh = heat * heat; ctx.fillStyle = `rgb(${(34 + 205 * hh) | 0},${(22 + 150 * hh * heat) | 0},${(20 + 70 * hh * hh) | 0})`; ctx.fill(path);                                  // 몸통: 막 터진 조각만 달궈져 있고 식으면 그을린 검붉은 돌이 된다
      ctx.globalAlpha = a * 0.45; ctx.fillStyle = `rgba(255,${(190 + 60 * heat) | 0},${(120 + 90 * heat) | 0},${0.42 * hh + 0.08})`; ctx.save(); ctx.scale(0.55, 0.55); ctx.translate(-p.S * 0.06, -p.S * 0.05); ctx.fill(path); ctx.restore();   // 면의 하이라이트
      ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = a * (0.35 + 0.65 * heat); ctx.strokeStyle = `rgba(255,${(236 + 19 * heat) | 0},${(180 + 60 * heat) | 0},1)`; ctx.lineWidth = Math.max(p.S * 0.045, 1.2 * px); ctx.stroke(path);       // 달궈진 가장자리
      ctx.restore();
    }
    ctx.globalCompositeOperation = "lighter";
    for (const p of awx.sparks) {                                                     // 튀는 불꽃
      const f = 1 - p.age / p.life;
      ctx.strokeStyle = `rgba(255,${(150 + 100 * f) | 0},${(60 + 110 * f * f) | 0},${0.9 * f})`; ctx.lineWidth = (1.2 + 1.6 * f) * px;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
    }
    ctx.restore();
  }
  /** 화면 전체에 번쩍이는 효과: 눈이 깨어날 때의 붉은 맥동, 폭발·붕괴·점화의 섬광 */
  function drawAwakenOverlay() {
    if (!awaken) return;
    const ta = awaken.ta || 0;
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ta < 1.2) {
      const a = 0.4 * Math.sin(Math.PI * Math.min(1, ta / 1.2)) ** 1.5;
      const gr = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.2, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.62); gr.addColorStop(0, "rgba(120,0,10,0)"); gr.addColorStop(1, `rgba(150,0,14,${a})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch);
    }
    if (ta >= AWK.boom && ta < AWK.boom + 2.2) {                                          // 빅뱅의 백색 섬광 → 황금빛 잔광
      const a = ta < AWK.boom + 0.07 ? 1 : Math.exp(-(ta - AWK.boom - 0.07) / 0.15); ctx.fillStyle = `rgba(255,252,226,${a})`; ctx.fillRect(0, 0, cw, ch);
      const g2 = 0.16 * Math.exp(-(ta - AWK.boom) / 0.8); ctx.fillStyle = `rgba(255,205,110,${g2})`; ctx.fillRect(0, 0, cw, ch);
    }
    if (ta >= AWK.conv1 - 0.1 && ta < AWK.ignite) {                                    // 한 점으로 무너지는 순간: 화면 가장자리가 어두워진다
      const k = smooth01(AWK.conv1 - 0.1, AWK.ignite, ta), gr = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, Math.hypot(cw, ch) * 0.6);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.5, `rgba(0,0,0,${0.55 * k})`); gr.addColorStop(1, `rgba(0,0,0,${0.9 * k})`); ctx.fillStyle = gr; ctx.fillRect(0, 0, cw, ch);
    }
    if (ta >= AWK.ignite && ta < AWK.ignite + 1.4) { const a = 0.7 * Math.exp(-(ta - AWK.ignite) / 0.28); ctx.fillStyle = `rgba(255,150,130,${a})`; ctx.fillRect(0, 0, cw, ch); }
    ctx.restore();
  }
  /** 클릭한 눈은 깨어나는 순간 활짝 뜨고 붉게 번쩍인다 */
  const awakenEyeBoost = (g) => {
    if (!awaken || awaken.gate !== g) return 0;
    const ta = awaken.ta || 0; return ta < 1.6 ? 1 - smooth01(0.8, 1.6, ta) : 0;
  };

  // ── 맵의 위쪽은 연노랑, 아래쪽은 검정
  function drawSkyGround() {
    const z = cam.z, vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    const R = R_MAP, pos = (y) => clamp((y + R) / (2 * R), 0, 1);
    const g = ctx.createLinearGradient(0, -R, 0, R);
    g.addColorStop(0, "rgba(238,242,170,0.84)"); g.addColorStop(pos(-0.5 * R), "rgba(238,242,170,0.8)");
    g.addColorStop(pos(-15000), "rgba(238,242,170,0.46)"); g.addColorStop(pos(-3000), "rgba(238,242,170,0.1)"); g.addColorStop(pos(0), "rgba(238,242,170,0)");
    g.addColorStop(pos(0) + 1e-6, "rgba(0,0,0,0)"); g.addColorStop(pos(7000), "rgba(0,0,0,0.95)"); g.addColorStop(1, "rgba(0,0,0,0.98)");
    ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, R_MAP * 1.003, 0, 7); ctx.clip();
    ctx.fillStyle = g; ctx.fillRect(vx0 - 4, vy0 - 4, vx1 - vx0 + 8, vy1 - vy0 + 8);
    ctx.restore();
  }

  function drawNebula() {
    // 세계가 매우 크므로 타일(7000 단위)마다 해시로 성운 덩어리 1~2개를 만들어, 보이는 타일만 그린다
    const z = cam.z, T = 7000;
    const vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    const i0 = Math.floor((vx0 - 3500) / T), i1 = Math.floor((vx1 + 3500) / T), j0 = Math.floor((vy0 - 3500) / T), j1 = Math.floor((vy1 + 3500) / T);
    ctx.globalCompositeOperation = "lighter";
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const nblob = hash2(i, j, 1) < 0.5 ? 1 : 2;
      for (let n = 0; n < nblob; n++) {
        const x = (i + hash2(i, j, 10 + n)) * T, y = (j + hash2(i, j, 20 + n)) * T, s = 2600 + hash2(i, j, 30 + n) * 3600;
        if (Math.hypot(x, y) > R_MAP + 3000) continue;
        const near = Math.hypot(x, y) < 6000, k = near && hash2(i, j, 40 + n) < 0.6 ? 3 : (hash2(i, j, 50 + n) * 3) | 0;
        ctx.globalAlpha = 0.035 + hash2(i, j, 60 + n) * 0.06;
        ctx.drawImage(nebulaSprites[k], x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  function drawSanctuary(t) {
    const z = cam.z, R = SANCT_R;
    const vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    if (CX + R * 1.5 < vx0 || CX - R * 1.5 > vx1 || CY + R * 1.5 < vy0 || CY - R * 1.5 > vy1) return;
    const px = (n) => n / z;
    ctx.save(); ctx.translate(CX, CY);
    // 성역 안쪽의 은은한 빛(바닥)
    let gr = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 1.05);
    gr.addColorStop(0, "rgba(238,255,107,0.10)"); gr.addColorStop(0.6, "rgba(238,255,107,0.05)"); gr.addColorStop(1, "rgba(238,255,107,0.0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, R * 1.05, 0, 7); ctx.fill();
    // 동심원·방사선
    ctx.strokeStyle = "rgba(244,255,134,0.16)"; ctx.lineWidth = px(1);
    [0.22, 0.45, 0.72].forEach((k) => { ctx.beginPath(); ctx.arc(0, 0, R * k, 0, 7); ctx.stroke(); });
    ctx.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6 + t * 0.02; ctx.moveTo(Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22); ctx.lineTo(Math.cos(a) * R * 0.97, Math.sin(a) * R * 0.97); } ctx.stroke();
    // 경계 벽: 넓은 번짐 + 선
    ctx.globalCompositeOperation = "lighter";
    for (const [w, a] of [[46, 0.05], [22, 0.09], [9, 0.2]]) { ctx.strokeStyle = `rgba(238,255,107,${a})`; ctx.lineWidth = px(w); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); }
    ctx.globalCompositeOperation = "source-over";
    const pulse = 0.85 + 0.15 * Math.sin(t * 1.3);
    ctx.strokeStyle = `rgba(251,255,200,${0.9 * pulse})`; ctx.lineWidth = px(3.2); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.95)"; ctx.lineWidth = px(1.2); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke();
    // 회전하는 점선 고리 둘
    ctx.strokeStyle = "rgba(244,255,134,0.55)"; ctx.lineWidth = px(2);
    ctx.setLineDash([px(14), px(18)]); ctx.lineDashOffset = -t * 30 / z; ctx.beginPath(); ctx.arc(0, 0, R + 46, 0, 7); ctx.stroke();
    ctx.setLineDash([px(4), px(10)]); ctx.lineDashOffset = t * 40 / z; ctx.beginPath(); ctx.arc(0, 0, R - 56, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    // 눈금
    ctx.strokeStyle = "rgba(244,255,134,0.5)"; ctx.lineWidth = px(1.2); ctx.beginPath();
    for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2, l = i % 8 === 0 ? 34 : 14; ctx.moveTo(Math.cos(a) * (R + 78), Math.sin(a) * (R + 78)); ctx.lineTo(Math.cos(a) * (R + 78 + l), Math.sin(a) * (R + 78 + l)); }
    ctx.stroke();
    // 여덟 개의 기둥(마름모) + 번쩍임
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4, x = Math.cos(a) * R, y = Math.sin(a) * R, s = 16 + (i % 2 ? 0 : 7);
      ctx.save(); ctx.translate(x, y); ctx.rotate(a + Math.PI / 4);
      ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(238,255,107,${0.16 + 0.1 * Math.sin(t * 2 + i)})`;
      ctx.beginPath(); ctx.arc(0, 0, s * 3.2, 0, 7); ctx.fill(); ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#fffff0"; ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.62, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.62, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    // 중앙 문장: 네 꼭짓점 별 + 고리
    ctx.save(); ctx.rotate(t * 0.06);
    ctx.globalCompositeOperation = "lighter";
    gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 260);
    gr.addColorStop(0, "rgba(255,255,240,0.55)"); gr.addColorStop(0.2, "rgba(244,255,134,0.22)"); gr.addColorStop(1, "rgba(238,255,107,0)");
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 260, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(251,255,200,0.9)"; ctx.lineWidth = px(2.4);
    ctx.beginPath(); ctx.arc(0, 0, 64, 0, 7); ctx.stroke();
    ctx.beginPath(); const sR = 150, c0 = 18;
    ctx.moveTo(0, -sR); ctx.quadraticCurveTo(c0, -c0, sR, 0); ctx.quadraticCurveTo(c0, c0, 0, sR); ctx.quadraticCurveTo(-c0, c0, -sR, 0); ctx.quadraticCurveTo(-c0, -c0, 0, -sR);
    ctx.closePath();                                          // 닫지 않으면 시작점(꼭대기)만 이음새가 없어 뭉툭해진다
    ctx.lineJoin = "miter"; ctx.miterLimit = 24;               // 네 꼭짓점 모두 끝까지 뾰족하게
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
    // 라벨
    const fs = Math.max(15 / z, 26);
    ctx.font = `700 ${fs}px "Noto Serif KR", serif`; ctx.textAlign = "center"; ctx.fillStyle = "rgba(251,255,200,0.9)";
    ctx.shadowColor = NEON; ctx.shadowBlur = 14;
    ctx.fillText("성역의 경계", 0, -R - 150 - fs * 0.3);
    ctx.restore();
  }

  function drawGate(g, t) {
    const sp = rifts[g.v], big = sp.S * g.scale;
    const flick = 0.82 + 0.18 * Math.sin(t * 1.6 + g.phase) + 0.07 * Math.sin(t * 5.1 + g.phase * 2.3);
    ctx.save(); ctx.translate(g.x, g.y);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5 * flick;
    const R = big * 1.15; ctx.drawImage(glows[g.v % 6], -R, -R, R * 2, R * 2);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.rotate(g.rot); ctx.scale(g.flip * g.sx, g.sy);          // 가로·세로를 따로 늘려 관문마다 모양과 크기가 다르다
    const pxs = sp.S * Math.max(g.sx, g.sy) * cam.z * dpr;
    ctx.drawImage(pxs < sp.S / 4 * 1.1 ? sp.mips[0] : pxs < sp.S / 2 * 1.1 ? sp.mips[1] : sp.c, -sp.S / 2, -sp.S / 2, sp.S, sp.S);
    const boost = awakenEyeBoost(g), oa = boost > 0 ? Math.max(eyeOpenAmt(g, t), boost) : eyeOpenAmt(g, t);
    if (oa > 0.02 && eyeWorldR(g, sp) * 2 * cam.z > 10) drawEye(g, sp, t, oa, boost);           // 틈 안쪽에 눈이 뜬다
    ctx.restore();
  }

  /** 소용돌이 중심으로 빨려 드는 빛: 광속 잔상처럼 늘어나는 꼬리 달린 빛줄기 + 미세한 먼지 (점이 아니라 궤적으로 그린다) */
  function drawInflow(cx, cy, dir, R0, t, seed, z) {
    ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    const px = 1 / z;                                         // 화면 1px 에 해당하는 세계 길이
    const n = 40, SEG = 9;
    for (let i = 0; i < n; i++) {
      const ph = hash2(i, seed, 31), spd = 0.07 + hash2(i, seed, 32) * 0.13;
      const f = (t * spd + ph) % 1;                            // 0: 멀리서 출발 → 1: 중심에 닿는다
      const th0 = hash2(i, seed, 33) * 6.2832, wid = (0.7 + hash2(i, seed, 34) * 1.5) * px;
      const bright = 0.35 + 0.65 * hash2(i, seed, 35);
      const trail = 0.05 + 0.13 * f * f + 0.03 * hash2(i, seed, 36);   // 중심에 가까울수록 빨라져 꼬리가 길어진다
      const pos = (ff) => { const r = R0 * Math.pow(1 - ff, 1.75) + R0 * 0.05, th = th0 + dir * (ff * 3.9 + ff * ff * 2.8); return [cx + Math.cos(th) * r, cy + Math.sin(th) * r]; };
      const fade = Math.sin(Math.PI * Math.min(1, f * 1.04)) * (f > 0.9 ? (1 - f) * 10 : 1);
      if (fade <= 0.01) continue;
      let prev = pos(Math.max(0, f - trail));
      for (let k = 1; k <= SEG; k++) {
        const q = k / SEG, cur = pos(Math.max(0, f - trail * (1 - q)));
        const a = Math.pow(q, 1.7) * fade * bright * 0.85;
        const heat = clamp(f * 1.2, 0, 1);                      // 멀리서는 연노랑, 중심에서는 백열
        ctx.strokeStyle = `rgba(255,${(236 + 19 * heat) | 0},${(150 + 85 * heat) | 0},${a})`;
        ctx.lineWidth = wid * (0.25 + 1.1 * q) * (0.7 + 0.9 * f);
        ctx.beginPath(); ctx.moveTo(prev[0], prev[1]); ctx.lineTo(cur[0], cur[1]); ctx.stroke();
        prev = cur;
      }
    }
    // 아주 작은 먼지: 천천히 소용돌이를 따라 도는 미세한 빛 알갱이
    for (let i = 0; i < 70; i++) {
      const rr = R0 * (0.25 + 0.9 * hash2(i, seed, 41)), th = hash2(i, seed, 42) * 6.2832 + dir * t * (0.15 + 0.5 / (1 + rr / R0));
      const tw = 0.4 + 0.6 * Math.sin(t * (1 + hash2(i, seed, 43) * 2) + i);
      ctx.globalAlpha = 0.1 + 0.35 * hash2(i, seed, 44) * tw;
      ctx.fillStyle = "#fffbe0";
      const s = (0.5 + hash2(i, seed, 45) * 0.8) * px;
      ctx.fillRect(cx + Math.cos(th) * rr, cy + Math.sin(th) * rr, s, s);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }

  function drawSpecial(s, t, z) {
    const sp = rifts[12], S = sp.S, k = s.scale, sz = S * k;
    const flick = 0.9 + 0.1 * Math.sin(t * 1.9 + s.phase) + 0.04 * Math.sin(t * 7.3 + s.phase);
    const W = (u, v) => [(u - S / 2) * k, (v - S / 2) * k];
    const [vx, vy] = W(sp.vc[0][0], sp.vc[0][1]);
    const vrW = sp.vr * k;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);

    // ── 사실적인 빛: 틈 전체의 낮은 번짐 → 소용돌이의 번짐과 핵 → 빛줄기·렌즈 광선 ──
    ctx.globalCompositeOperation = "lighter";
    const bl = (tex, x, y, rad, a) => { ctx.globalAlpha = Math.min(1, a * flick); ctx.drawImage(tex, x - rad, y - rad, rad * 2, rad * 2); };
    bl(bloomTex.cool, 0, 0, sz * 1.3, 0.17);
    bl(bloomTex.hot, vx, vy, vrW * 2.5, 0.4); bl(bloomTex.core, vx, vy, vrW * 0.95, 0.52);
    const rr = sz * 1.25;
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(t * 0.03 + s.phase); ctx.globalAlpha = 0.85 * flick; ctx.drawImage(raysTex[0], -rr, -rr, rr * 2, rr * 2); ctx.restore();
    ctx.save(); ctx.translate(vx, vy); ctx.rotate(-t * 0.021 - s.phase); ctx.globalAlpha = 0.6 * flick; ctx.drawImage(raysTex[1], -rr, -rr, rr * 2, rr * 2); ctx.restore();
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 1.5);
    hg.addColorStop(0, `rgba(255,255,235,${0.45 * flick})`); hg.addColorStop(0.3, `rgba(244,255,134,${0.14 * flick})`); hg.addColorStop(1, "rgba(238,255,107,0)");
    ctx.save(); ctx.translate(vx, vy); ctx.scale(1, 0.016); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, sz * 1.5, 0, 7); ctx.fill(); ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";

    // ── 틈 본체 ──
    const spx = sz * z * dpr;
    ctx.drawImage(spx < S / 4 * 1.1 ? sp.mips[0] : spx < S / 2 * 1.1 ? sp.mips[1] : sp.c, -sz / 2, -sz / 2, sz, sz);
    if (spx > 45) {
      ctx.save();
      ctx.beginPath(); sp.pts.forEach(([u, v], i) => { const [x, y] = W(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.clip();
      ctx.fillStyle = "#000"; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      const halfS = Math.max(sp.hw, sp.hh) * 1.06, half = halfS * k;     // 틈 전체를 덮는 정사각형
      if (vgl) {
        const R = clamp(Math.round(half * 2 * z * dpr * vq), 64, VORTEX_MAX);
        vortexDrawn = true;
        // 소용돌이 중심이 틈 중심과 같다고 보고 정사각형 중앙에 그린다 (uRs: 정사각형 대비 소용돌이 반지름)
        renderVortex(R, t, 1, 1.7, 0, sp.vr / halfS);
        ctx.drawImage(vgl.cv, 0, vgl.cv.height - R, R, R, vx - half, vy - half, half * 2, half * 2);
      } else {
        // WebGL 없음/손실: 구워 둔 질감을 서로 다른 속도로 돌려 겹쳐 흐름을 흉내 낸다
        if (!bakes[0] && !bakeBusy[0]) { bakeBusy[0] = true; bakeSwirl(256, 1.7).then((c) => { bakes[0] = c; }); }
        const bk = bakes[0];
        if (bk) {
          const h1 = vrW * 1.25, h2 = h1 * 1.18;
          ctx.save(); ctx.translate(vx, vy); ctx.globalCompositeOperation = "lighter";
          ctx.save(); ctx.rotate(t * 0.32); ctx.drawImage(bk, -h1, -h1, h1 * 2, h1 * 2); ctx.restore();
          ctx.globalAlpha = 0.42;
          ctx.save(); ctx.rotate(-t * 0.21 + 1.3); ctx.drawImage(bk, -h2, -h2, h2 * 2, h2 * 2); ctx.restore();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.restore();
        }
      }
      ctx.globalCompositeOperation = "lighter";
      const cg = ctx.createRadialGradient(vx, vy, 0, vx, vy, vrW * 0.34);
      cg.addColorStop(0, `rgba(255,255,255,${flick})`); cg.addColorStop(0.35, "rgba(255,252,200,0.7)"); cg.addColorStop(1, "rgba(238,255,107,0)");
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(vx, vy, vrW * 0.34, 0, 7); ctx.fill();
      ctx.restore();
    }
    // ── 소용돌이로 빨려 드는 빛 (소용돌이 하나) ──
    drawInflow(vx, vy, 1, vrW * 2.3, t, 11, z);

    // 이름표
    ctx.rotate(-s.rot);
    const fs = Math.max(18 / z, 30);
    ctx.textAlign = "center"; ctx.shadowColor = NEON; ctx.shadowBlur = 16; ctx.fillStyle = NEON_PALE;
    ctx.font = `700 ${fs}px "Noto Serif KR", serif`;
    ctx.fillText(s.name, 0, sp.hh * k + fs * 1.5);
    ctx.shadowBlur = 8; ctx.globalAlpha = 0.7; ctx.fillStyle = NEON_SOFT;
    ctx.font = `300 ${fs * 0.55}px "Noto Sans KR", sans-serif`;
    ctx.fillText("눌러서 들어가기", 0, sp.hh * k + fs * 2.45);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawEdgeMarkers(t) {
    // 화면 밖의 특별 관문을 가리키는 방향 표시
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const inset = 52;
    specials.forEach((s) => {
      const sx = (s.x - cam.x) * cam.z + cw / 2, sy = (s.y - cam.y) * cam.z + ch / 2;
      const m = 90 * cam.z + 20;
      if (sx > -m && sx < cw + m && sy > -m && sy < ch + m) return;
      const dx = sx - cw / 2, dy = sy - ch / 2, a = Math.atan2(dy, dx);
      const k = Math.min((cw / 2 - inset) / Math.abs(Math.cos(a) || 1e-6), (ch / 2 - inset) / Math.abs(Math.sin(a) || 1e-6));
      let x = cw / 2 + Math.cos(a) * k, y = ch / 2 + Math.sin(a) * k;
      // HUD(오른쪽 아래 미니맵·확대 버튼, 왼쪽 위 제목, 오른쪽 위 음악 버튼)를 피한다
      const mini = (el.mini.clientWidth || 176) + 34;
      if (x > cw - 70 && y > ch - (mini + 150)) y = ch - (mini + 160);
      if (x < 270 && y < 100) y = 108;
      if (x > cw - 100 && y < 72) y = 80;
      const dist = Math.hypot(s.x - cam.x, s.y - cam.y) / 1000;
      ctx.save(); ctx.translate(x, y);
      ctx.globalCompositeOperation = "lighter";
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, 34); gr.addColorStop(0, "rgba(238,255,107,0.5)"); gr.addColorStop(1, "rgba(238,255,107,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, 34, 0, 7); ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.rotate(a); ctx.fillStyle = NEON_PALE; ctx.shadowColor = NEON; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, 7); ctx.lineTo(-2, 0); ctx.lineTo(-6, -7); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.font = '700 13px "Noto Serif KR", serif'; ctx.fillStyle = NEON_PALE; ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
      const lab = `${s.name}  ${dist.toFixed(1)}k`;
      const tw = ctx.measureText(lab).width;
      const lx = clamp(x - Math.cos(a) * 34 - (Math.cos(a) > 0 ? tw : 0) - (Math.abs(Math.cos(a)) < 0.3 ? tw / 2 : 0), 8, cw - tw - 8);
      const ly = clamp(y - Math.sin(a) * 28 + 4, 20, ch - 14);
      ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(0,0,0,0.78)"; ctx.strokeText(lab, lx, ly);        // 연노랑 배경 위에서도 읽히도록 어두운 윤곽
      ctx.fillText(lab, lx, ly);
      ctx.restore();
    });
    ctx.restore();
  }

  function drawAxisLabels() {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '500 10px "Cinzel", serif'; ctx.fillStyle = "rgba(244,255,134,0.55)"; ctx.strokeStyle = "rgba(0,0,0,0.7)"; ctx.lineWidth = 3; ctx.lineJoin = "round";
    const z = cam.z, step = z > 0.08 ? 2000 : 8000, f = (v) => `${v > 0 ? "+" : ""}${v / 1000}`;
    const lbl = (txt, x, y) => { ctx.strokeText(txt, x, y); ctx.fillText(txt, x, y); };
    for (let x = Math.ceil((cam.x - cw / 2 / z) / step) * step; x <= cam.x + cw / 2 / z; x += step) lbl(`X ${f(x)}`, (x - cam.x) * z + cw / 2 + 4, ch - 8);
    for (let y = Math.ceil((cam.y - ch / 2 / z) / step) * step; y <= cam.y + ch / 2 / z; y += step) lbl(`Y ${f(y)}`, 8, (y - cam.y) * z + ch / 2 - 4);
    ctx.restore();
  }

  function buildMiniStatic() {
    const S = 220, c = mk(S, S), g = c.getContext("2d"), k = S / WORLD, h = S / 2;
    g.beginPath(); g.arc(h, h, h - 1, 0, 7); g.fillStyle = "rgba(2,3,10,0.92)"; g.fill();
    g.save(); g.beginPath(); g.arc(h, h, h - 1, 0, 7); g.clip();
    { const sg = g.createLinearGradient(0, 0, 0, S);                                       // 위쪽은 연노랑, 아래쪽은 검정
      sg.addColorStop(0, "rgba(238,242,170,0.55)"); sg.addColorStop(0.46, "rgba(238,242,170,0.08)"); sg.addColorStop(0.5, "rgba(0,0,0,0)"); sg.addColorStop(0.58, "rgba(0,0,0,0.85)"); sg.addColorStop(1, "rgba(0,0,0,0.95)");
      g.fillStyle = sg; g.fillRect(0, 0, S, S); }
    g.strokeStyle = "rgba(238,255,107,0.09)"; g.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((q) => { g.beginPath(); g.arc(h, h, (h - 1) * q, 0, 7); g.stroke(); });
    g.beginPath(); g.moveTo(h, 0); g.lineTo(h, S); g.moveTo(0, h); g.lineTo(S, h); g.stroke();
    g.strokeStyle = "rgba(251,255,200,0.9)"; g.lineWidth = 1.2; g.beginPath(); g.arc(h, h, Math.max(2, SANCT_R * k), 0, 7); g.stroke();
    gates.forEach((p) => { const t = TINTS[p.v % 6]; g.fillStyle = t.rim; g.globalAlpha = 0.85; g.fillRect(h + p.x * k - 0.9, h + p.y * k - 0.9, 1.8, 1.8); });
    g.globalAlpha = 1; g.restore();
    g.strokeStyle = "rgba(255,130,40,0.95)"; g.lineWidth = 2; g.shadowColor = "rgba(255,90,10,0.9)"; g.shadowBlur = 6; g.beginPath(); g.arc(h, h, h - 2, 0, 7); g.stroke();
    miniStatic = c;
  }

  function drawMini(t) {
    const m = el.mini, mg = m.getContext("2d"), S = m.width, h = S / 2;
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, S, S);
    mg.drawImage(miniStatic, 0, 0, S, S);
    const k = S / WORLD;
    specials.forEach((s) => {                                // 특별한 틈 (쌍둥이의 틈은 연노랑, 버려진 틈은 붉게)
      const p = 0.5 + 0.5 * Math.sin(t * 2.4 + s.phase), x = h + s.x * k, y = h + s.y * k;
      const gr = mg.createRadialGradient(x, y, 0, x, y, 10 * dpr), red = s.kind === "abandoned";
      gr.addColorStop(0, red ? "rgba(255,225,220,0.9)" : "rgba(255,255,230,0.9)"); gr.addColorStop(0.3, red ? `rgba(255,70,56,${0.45 + p * 0.3})` : `rgba(238,255,107,${0.45 + p * 0.3})`); gr.addColorStop(1, red ? "rgba(255,50,40,0)" : "rgba(238,255,107,0)");
      mg.fillStyle = gr; mg.beginPath(); mg.arc(x, y, 10 * dpr, 0, 7); mg.fill();
      mg.fillStyle = "#fff"; mg.beginPath(); mg.arc(x, y, 1.8 * dpr, 0, 7); mg.fill();
    });
    // 현재 시야(맵이 매우 커서 작은 상자 + 십자로 표시)
    const vw = Math.max(cw / cam.z * k, 6 * dpr), vh = Math.max(ch / cam.z * k, 6 * dpr), x = h + cam.x * k, y = h + cam.y * k;
    mg.strokeStyle = "#fbffc8"; mg.lineWidth = 1.4 * dpr; mg.shadowColor = NEON; mg.shadowBlur = 6 * dpr;
    mg.strokeRect(x - vw / 2, y - vh / 2, vw, vh);
    mg.beginPath(); mg.moveTo(x - vw / 2 - 5 * dpr, y); mg.lineTo(x + vw / 2 + 5 * dpr, y); mg.moveTo(x, y - vh / 2 - 5 * dpr); mg.lineTo(x, y + vh / 2 + 5 * dpr); mg.stroke();
    mg.shadowBlur = 0;
  }

  const SKIP = new Set();
  let hudT = 0;
  function frame(now) {
    if (!open) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.12, (now - last) / 1000 || 0.016); last = now;
    const t = (now - t0) / 1000;
    // 소용돌이가 보이는 동안 프레임이 느려지면 소용돌이 해상도를 낮추고, 여유가 생기면 천천히 되돌린다
    emaDt += (dt * 1000 - emaDt) * 0.08;
    if (vortexDrawn) {
      if (emaDt > 48 && vq > 0.75) vq = Math.max(0.75, vq * 0.97);      // 아주 느릴 때만, 조금만 낮춘다
      else if (emaDt < 30 && vq < 1) vq = Math.min(1, vq * 1.02);
    }
    vortexDrawn = false;
    update(dt, now);
    updateAwaken(now, dt);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#02030a"; ctx.fillRect(0, 0, cw, ch);
    if (!SKIP.has('stars')) drawStars(t);
    // 세계 좌표계
    const shx = shakeAmp > 0.3 ? (Math.random() - 0.5) * shakeAmp : 0, shy = shakeAmp > 0.3 ? (Math.random() - 0.5) * shakeAmp : 0;      // 폭발의 진동
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (cw / 2 - cam.x * cam.z + shx), dpr * (ch / 2 - cam.y * cam.z + shy));
    if (!SKIP.has('nebula')) drawNebula();
    if (!SKIP.has('sky')) drawSkyGround();
    if (!SKIP.has('grid')) drawGridAndEdge(t);
    if (!SKIP.has('sanct')) {
      drawAwakenPuffs();
      drawAwakenGL(t, dt);                                  // 빛과 어둠의 수렴 · 붉은 소용돌이 (화면 공간)
      ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (cw / 2 - cam.x * cam.z + shx), dpr * (ch / 2 - cam.y * cam.z + shy));
      drawRedRadiance(t);
      const sa = sanctAlpha();
      if (sa > 0.01) { ctx.save(); ctx.globalAlpha = sa; drawSanctuary(t); ctx.restore(); }
    }
    if (!SKIP.has('atmos')) drawLightFlow(t);

    const z = cam.z, vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    if (!SKIP.has('gates')) for (const g of gates) {
      const e = rifts[g.v].S * g.scale * 1.5;
      if (g.x + e < vx0 || g.x - e > vx1 || g.y + e < vy0 || g.y - e > vy1) continue;
      drawGate(g, t);
    }
    if (!SKIP.has('specials')) for (const s of specials) {
      const e = rifts[12 + s.idx].S * s.scale * 3.6;
      if (s.x + e < vx0 || s.x - e > vx1 || s.y + e < vy0 || s.y - e > vy1) continue;
      if (s.kind !== "abandoned") drawSpecial(s, t, z);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    if (!SKIP.has('atmos')) drawMist(t);
    // 버려진 틈은 뱅가드의 어두운 안개에 가려지지 않도록 안개 위에 그린다: 뿜어져 나오는 검은 기운 → 틈 → 번개
    if (!SKIP.has('specials')) {
      updateSmoke(t, dt); drawSmoke(t, z);
      const sa = abnSp();
      if (sa) {
        const e = rifts[ABN].S * sa.scale * 3.6;
        if (!(sa.x + e < vx0 || sa.x - e > vx1 || sa.y + e < vy0 || sa.y - e > vy1)) drawUnstableRift(sa, t, z);
        ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
      }
    }
    updateLightning(t, dt); drawLightning(t, z);
    drawAwakenBlast(t);
    // 화면 공간 요소
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawAwakenOverlay();
    // 경계 밖 사선 무늬
    if (!SKIP.has('hud')) { drawAxisLabels(); drawEdgeMarkers(t); }
    if (!SKIP.has('mini')) drawMini(t);
    updateFire(t);
    updatePortal(now);
    updateBurn(now, Math.hypot(cam.x - CX, cam.y - CY));
    hudT += dt;
    if (hudT > 0.12) {
      hudT = 0;
      const dC = Math.hypot(cam.x - CX, cam.y - CY), sg = (v) => `${v < 0 ? "-" : "+"}${Math.abs(Math.round(v)).toString().padStart(5, "0")}`;
      el.coords.textContent = `X ${sg(cam.x)}  Y ${sg(cam.y)}  ·  성역까지 ${(dC / 1000).toFixed(1)}k  ·  경계까지 ${Math.max(0, (R_MAP - dC) / 1000).toFixed(1)}k`;
    }
  }

    // ───────────────────────── 맵 경계의 불길 (WebGL2) ─────────────────────────
  // 경계(원) 둘레를 따라 각도 방향으로 끊김 없이 이어지는(주기적) 노이즈로 불꽃의 혀·연기·불씨·갈라진 용암 땅을 그린다.
  // 난수는 정수 해시라서 아주 큰 좌표(둘레 60만 단위)에서도 깨지지 않는다.
  const FIRE_VS = "#version 300 es\nin vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }";
  const FIRE_FS = `#version 300 es
precision highp float; precision highp int;
uniform vec2 uRes, uView, uCam;
uniform float uZ, uT, uR, uN, uH;
out vec4 oc;
uint ih(uvec2 p){ uint h = p.x * 1597334673u ^ p.y * 3812015801u; h ^= h >> 15; h *= 2246822519u; h ^= h >> 13; h *= 3266489917u; h ^= h >> 16; return h; }
float hv(ivec2 c){ return float(ih(uvec2(c)) & 16777215u) / 16777216.0; }
float pn(vec2 p, float per){            // x 방향으로 per 칸마다 되풀이되는 값 노이즈
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  int x0 = int(mod(i.x, per)), x1 = int(mod(i.x + 1.0, per)), y0 = int(i.y), y1 = y0 + 1;
  return mix(mix(hv(ivec2(x0, y0)), hv(ivec2(x1, y0)), f.x), mix(hv(ivec2(x0, y1)), hv(ivec2(x1, y1)), f.x), f.y);
}
float fbmP(vec2 p, float per){ float a = 0.5, s = 0.0; for (int k = 0; k < 5; k++){ s += a * pn(p, per); p = vec2(p.x * 2.0, p.y * 2.0 + 3.7); per *= 2.0; a *= 0.5; } return s; }
float fbm3(vec2 p, float per){ float a = 0.5, s = 0.0; for (int k = 0; k < 3; k++){ s += a * pn(p, per); p = vec2(p.x * 2.0, p.y * 2.0 + 3.7); per *= 2.0; a *= 0.5; } return s; }
vec3 fireCol(float f){
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.42, 0.025, 0.0), smoothstep(0.0, 0.26, f));
  c = mix(c, vec3(0.98, 0.30, 0.02), smoothstep(0.20, 0.55, f));
  c = mix(c, vec3(1.0, 0.76, 0.20), smoothstep(0.48, 0.88, f));
  c = mix(c, vec3(1.0, 0.96, 0.76), smoothstep(0.84, 1.30, f));
  return c;
}
// 위로(경계 바깥으로) 솟는 불씨
float ember(float x, float per, float s, float cell, float seed, float rad){
  vec2 g = vec2(x * (251.0 / cell), s / cell - uT * 0.55);
  vec2 id = floor(g), fr = fract(g);
  float pp = per * (251.0 / cell);
  ivec2 c = ivec2(int(mod(id.x, pp)), int(id.y) + int(seed));
  float h = hv(c); if (h < 0.78) return 0.0;
  vec2 off = vec2(hv(c + ivec2(7, 3)), hv(c + ivec2(2, 9))) * 0.6 + 0.2;
  off.x += 0.16 * sin(uT * 1.7 + h * 40.0);
  float d = length(fr - off);
  float tw = 0.55 + 0.45 * sin(uT * (3.0 + h * 5.0) + h * 60.0);
  return smoothstep(rad, 0.0, d) * tw;
}
void main(){
  vec2 frag = gl_FragCoord.xy / uRes;
  vec2 scr = (frag - 0.5) * uView;
  vec2 w = uCam + vec2(scr.x, -scr.y) / uZ;
  float r = length(w), s = r - uR;                         // s > 0 : 경계 바깥
  if (s < -uH * 3.2) { oc = vec4(0.0); return; }
  float ang = atan(w.y, w.x);
  float x = (ang / 6.28318530718 + 0.5) * uN;
  float flick = 0.9 + 0.1 * sin(uT * 3.1) + 0.05 * sin(uT * 8.7);

  // 혀마다 다른 높이
  float hl = 0.6 * pn(vec2(x / 16.0, uT * 0.22 + 7.0), uN / 16.0) + 0.4 * pn(vec2(x / 6.0, uT * 0.5 + 2.0), uN / 6.0);
  float Hloc = uH * (0.6 + 1.1 * hl);
  // 위로 솟으며 소용돌이치는 불꽃결 (도메인 워프)
  vec2 q = vec2(x, (s - uT * 260.0) / 420.0);
  vec2 wq = vec2(fbm3(q * 0.5, uN * 0.5), fbm3(q * 0.5 + vec2(0.0, 5.2), uN * 0.5)) - 0.5;
  float d = fbmP(q + 1.8 * wq, uN);

  float fall = s >= 0.0 ? 1.0 - s / Hloc : exp(s / (0.22 * uH));
  float dd = clamp((d - 0.5) * 2.4 + 0.5, 0.0, 1.0);          // 대비를 키워 불꽃의 혀가 갈라지게
  float I = max(dd + fall * 1.15 - 0.74, 0.0) * 1.35;
  if (s < 0.0) I *= clamp(fall * 2.2, 0.0, 1.0);
  float core = exp(-pow(abs(s / max(11.0, 2.6 / uZ)), 2.0));        // 경계선 자체의 달아오른 심지
  I = I + core * (0.4 + 0.5 * d);
  I *= flick;

  vec3 col = vec3(0.0); float a = 0.0;
  // ① 경계 바깥 땅: 검붉게 식은 땅 + 갈라진 틈으로 비치는 용암빛
  if (s > 0.0) {
    vec2 c1 = w / 1500.0, c2 = w / 380.0;
    float rg = 1.0 - abs(2.0 * fbm3(c1, 4096.0) - 1.0), rg2 = 1.0 - abs(2.0 * fbm3(c2, 4096.0) - 1.0);
    float crack = smoothstep(0.90, 0.985, rg) + 0.7 * smoothstep(0.93, 0.99, rg2);
    float near = 0.18 + 0.82 * exp(-s / 3500.0);
    vec3 ground = vec3(0.055, 0.009, 0.007);
    col = ground * 0.9; a = 0.9;
    col += vec3(1.0, 0.28, 0.04) * crack * near * (0.6 + 0.4 * sin(uT * 1.6 + rg * 9.0)) * 0.4;
  }
  // ② 연기: 불길 위로 올라가 흩어진다
  float sm = smoothstep(0.38, 0.78, fbmP(vec2(x * 0.35, (s - uT * 130.0) / 900.0) + vec2(0.0, 9.1), uN * 0.35));
  float smA = sm * smoothstep(0.25 * uH, 0.9 * uH, s) * exp(-max(s, 0.0) / (3.2 * uH)) * 0.6;
  vec3 smC = vec3(0.045, 0.028, 0.026) + vec3(0.55, 0.17, 0.05) * exp(-max(s, 0.0) / uH) * 0.18;
  col = col * (1.0 - smA) + smC * smA; a = a + smA * (1.0 - a);
  // ③ 불꽃
  float fa = smoothstep(0.03, 0.42, I);
  vec3 fc = fireCol(I) * (0.78 + 0.5 * d);
  col = col * (1.0 - fa) + fc * fa; a = a + fa * (1.0 - a);
  // ④ 번지는 빛 (경계 안쪽 맵에도 주홍빛이 번진다)
  float gl = exp(-abs(s) / (0.9 * uH)) * flick;
  col += vec3(1.0, 0.36, 0.07) * gl * 0.20; a = max(a, gl * 0.05);
  // ⑤ 불씨
  float e = ember(x, uN, s, 251.0, 1.0, max(0.012, 1.7 / (251.0 * uZ)))
          + ember(x, uN, s, 125.0, 5.0, max(0.016, 1.5 / (125.0 * uZ)))
          + 0.8 * ember(x, uN, s, 520.0, 9.0, max(0.010, 2.2 / (520.0 * uZ)));
  float eF = smoothstep(-0.2 * uH, 0.1 * uH, s) * (1.0 - smoothstep(0.8 * uH, 2.6 * uH, s));
  col += vec3(1.0, 0.62, 0.18) * e * eF * 1.5; a = max(a, clamp(e * eF, 0.0, 1.0));
  // 부드러운 어깨 + 디더
  vec3 hi = max(col - 0.85, 0.0); col = min(col, 0.85) + 0.15 * (1.0 - exp(-hi * 5.0));
  col += (float(ih(uvec2(gl_FragCoord.xy) + uvec2(uint(uT * 60.0), 3u)) & 255u) / 255.0 - 0.5) / 255.0;
  oc = vec4(max(col, 0.0), clamp(a, 0.0, 1.0));
}`;
  let fireGL = null;
  function initFire() {
    try {
      const gl = el.fire.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) throw new Error("no webgl2");
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, FIRE_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FIRE_FS));
      gl.bindAttribLocation(prog, 0, "aPos");
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const U = {}; ["uRes", "uView", "uCam", "uZ", "uT", "uR", "uN", "uH"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      fireGL = { gl, U };
    } catch (e) { fireGL = null; console.warn("경계 불길(WebGL2) 사용 불가 → 2D로 대체:", e.message); }
  }
  /** 경계가 화면에 걸릴 때만 그린다 (해상도는 0.8배) */
  function updateFire(t) {
    if (!fireGL) return;
    const z = cam.z, dC = Math.hypot(cam.x - CX, cam.y - CY), viewR = Math.hypot(cw, ch) / 2 / z;
    const H = Math.max(520, 60 / z);
    const vis = Math.abs(dC - R_MAP) < viewR + H * 3.2 + 400;
    el.fire.classList.toggle("on", vis);
    if (!vis) return;
    const w = Math.max(2, Math.floor(cw * 0.8)), h = Math.max(2, Math.floor(ch * 0.8));
    if (el.fire.width !== w || el.fire.height !== h) { el.fire.width = w; el.fire.height = h; }
    const { gl, U } = fireGL;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h); gl.uniform2f(U.uView, cw, ch); gl.uniform2f(U.uCam, cam.x - CX, cam.y - CY);
    gl.uniform1f(U.uZ, z); gl.uniform1f(U.uT, t); gl.uniform1f(U.uR, R_MAP); gl.uniform1f(U.uN, 2400); gl.uniform1f(U.uH, H);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ───────────────────────── 차원의 틈으로 들어가기: 빨려 들어가 포탈을 타고 → 화면이 지지직거리다 → 꺼지고 → 홈페이지로 ─────────────────────────
  const PORTAL_URL = "https://thefirsttwistedking.github.io/Rasyancut-homepage/";
  const PT = { fly: 2700, tunnel: 2900, off: 1200, hold: 800 };      // ms: 빨려 듦 / 포탈 이동(글리치 심화) / 화면 꺼짐 / 검은 화면
  const PORTAL_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes, uCenter;
uniform float uT, uTravel, uEnter, uGlitch, uOff, uFlight;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float fbm3(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
float fbm2(vec2 p){ return 0.667 * vnoise(p) + 0.333 * vnoise(p * 2.03 + vec2(1.7, 9.2)); }

// 소용돌이 속(웜홀): 연노랑 가스 필라멘트가 나선으로 휘감기고, 검은 팔이 빛을 삼키며, 끝의 하얀 빛으로 쏟아져 들어간다
vec3 tunnel(vec2 uv){
  float asp = uRes.x / uRes.y;
  vec2 p = (uv - uCenter) * vec2(asp, 1.0) * 2.0;
  float r = length(p) + 1e-3, a = atan(p.y, p.x);
  float depth = 0.42 / (r + 0.05);                 // 중심에 가까울수록 멀리
  float zz = depth + uTravel;                      // 앞으로 나아가는 거리
  float tw = a + depth * 0.85 + uT * 0.45;         // 깊이에 따라 비틀리는 나선
  vec2 c = vec2(cos(tw), sin(tw));                 // 각도 이음매 없이 노이즈를 읽는다
  float n1 = fbm(c * 2.1 + vec2(zz * 0.5, zz * 0.18));
  float n2 = fbm3(c * 4.3 - vec2(zz * 0.85, -zz * 0.35) + 7.3);
  float fil = pow(smoothstep(0.30, 0.82, n1 * 0.62 + n2 * 0.52), 1.5);
  float arm = 0.35 + 0.65 * smoothstep(0.25, 0.75, fbm2(c * 1.3 + vec2(zz * 0.3, 3.0)));
  float seg = 0.5 + 0.5 * sin(zz * 4.5 + n1 * 3.0);
  float band = smoothstep(0.85, 1.0, seg) * 0.4;   // 터널 이음매 띠
  float cells = 72.0, ang = (a / 6.2832 + 0.5) * cells;
  float h = hash(vec2(floor(ang), 3.1));
  float sz = fract(zz * (0.25 + h * 0.5) + h * 7.0);
  float streak = step(0.84, h) * (1.0 - smoothstep(0.0, 0.1, abs(fract(ang) - 0.5))) * smoothstep(0.0, 0.05, sz) * (1.0 - smoothstep(0.05, 0.30, sz)) * smoothstep(0.08, 0.5, r);
  float far = (1.0 - smoothstep(0.1, 1.3, r));
  vec3 col = vec3(0.93, 1.0, 0.42) * fil * arm * (0.3 + 1.3 * far);
  col += vec3(1.0, 0.96, 0.7) * band * far;
  col += vec3(1.0, 0.97, 0.8) * streak * (0.6 + 1.2 * uFlight);
  col += vec3(1.0, 0.98, 0.88) * (exp(-r * r * 6.0) * 1.6 + exp(-r * 2.2) * 0.35);
  col *= (1.0 - smoothstep(0.4, 1.9, r)) * 0.5 + 0.5;
  return col;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  float ko = uOff, g = uGlitch;
  // 화면 꺼짐(브라운관): 세로로 찌그러져 가는 선이 되었다가 점으로 줄며 사라진다
  float hh = mix(1.0, 0.004, smoothstep(0.0, 0.55, ko));
  float ww = mix(1.0, 0.0, smoothstep(0.55, 1.0, ko));
  vec2 q = vec2((uv.x - 0.5) / max(ww, 0.0005) + 0.5, (uv.y - 0.5) / hh + 0.5);
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0) * step(0.0005, ww);
  vec3 col = vec3(0.0); float alpha = 1.0;
  if (inside > 0.5) {
    float rt = floor(uT * mix(5.0, 26.0, g));
    float rows = mix(10.0, 70.0, g), row = floor(q.y * rows);
    float rn = hash(vec2(row, rt));
    float shift = step(1.0 - (0.06 + 0.5 * g), rn) * (hash(vec2(row, rt + 9.0)) - 0.5) * 0.3 * g * step(0.02, g);   // 가로줄이 옆으로 밀림
    float roll = g * g * step(0.75, hash(vec2(rt, 1.0))) * 0.2 * fract(uT * 1.3);                                  // 화면이 위아래로 말림
    vec2 u2 = vec2(q.x + shift, fract(q.y + roll));
    float ab = 0.003 + 0.035 * g * hash(vec2(rt, 2.0));                                                           // RGB 어긋남
    if (g > 0.02) { vec3 ca = tunnel(u2 + vec2(ab, 0.0)), cb = tunnel(u2 - vec2(ab, 0.0)); col = vec3(ca.r, 0.5 * (ca.g + cb.g), cb.b); } else col = tunnel(u2);   // 두 번만 읽어 RGB 를 어긋나게
    col *= 0.88 + 0.12 * sin(uv.y * uRes.y * 1.5);                                                                // 주사선
    float nz = hash(gl_FragCoord.xy + fract(uT) * 100.0);
    col = mix(col, vec3(nz), g * g * 0.30);                                                                       // 지지직 노이즈
    col += step(1.0 - 0.04 * g, hash(vec2(row, rt + 3.0))) * vec3(0.6) * (0.4 + nz);                              // 하얀 노이즈 띠
    col *= 1.0 + (hash(vec2(rt, 5.0)) - 0.5) * 0.5 * g;                                                           // 밝기 떨림
    col *= mix(1.0, 0.08, step(1.0 - 0.16 * g * g, hash(vec2(rt, 7.0))));                                         // 신호가 잠깐 끊김
    col *= 1.0 + 2.2 * smoothstep(0.05, 0.55, ko);                                                                // 꺼질 때 번쩍이는 인광
    // 소용돌이에서 퍼져 나가는 문: 처음에는 소용돌이 주변부터 화면을 덮는다
    vec2 pc = (uv - uCenter) * vec2(asp, 1.0) * 2.0; float rr = length(pc);
    float R = uEnter * 2.9;
    alpha = ko > 0.0 ? 1.0 : 1.0 - smoothstep(R - 0.3, R, rr);
    float ring = exp(-pow(abs((rr - R) / 0.08), 2.0)) * (1.0 - step(0.999, uEnter));
    col = col * alpha + vec3(1.0, 0.96, 0.7) * ring * 1.3;
    alpha = max(alpha, ring);
  } else {
    // 꺼지는 선·점의 빛
    float line = exp(-abs(uv.y - 0.5) / 0.012) * exp(-pow(abs(uv.x - 0.5) / (ww * 0.5 + 0.003), 4.0));
    col = vec3(1.0, 0.98, 0.9) * line * smoothstep(0.1, 0.5, ko) * (1.0 - smoothstep(0.9, 1.0, ko)) * 1.6;
  }
  vec3 hi = max(col - 0.85, 0.0); col = min(col, 0.85) + 0.15 * (1.0 - exp(-hi * 5.0));
  col += (hash(gl_FragCoord.xy + 7.7) - 0.5) / 255.0;
  gl_FragColor = vec4(min(col, vec3(1.0)), clamp(alpha, 0.0, 1.0));
}`;
  let portalGL = null, portal2d = null, portalQ = 0.7, portalEma = 16;
  function initPortal() {
    const c = el.portal;
    try {
      const gl = c.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) throw new Error("no webgl");
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VORTEX_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, PORTAL_FS));
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = {}; ["uRes", "uCenter", "uT", "uTravel", "uEnter", "uGlitch", "uOff", "uFlight"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      portalGL = { gl, U };
    } catch (e) {
      portalGL = null; console.warn("포탈 연출(WebGL) 사용 불가 → 단순한 연출로 대체:", e.message);
      // WebGL 컨텍스트가 이미 붙은 캔버스는 2D 로 못 쓴다 → 같은 자리에 새 캔버스를 둔다
      const fresh = c.cloneNode(false); c.replaceWith(fresh); el.portal = fresh;
    }
  }

  /** 쌍둥이의 틈 소용돌이 중심의 월드 좌표 (틈이 약간 기울어져 있다) */
  function vortexWorld(s) {
    const sp = rifts[12 + s.idx] || rifts[12]; if (!sp) return null;
    const S = sp.S, k = s.scale, u = (sp.vc[0][0] - S / 2) * k, v = (sp.vc[0][1] - S / 2) * k;
    return { x: s.x + u * Math.cos(s.rot) - v * Math.sin(s.rot), y: s.y + u * Math.sin(s.rot) + v * Math.cos(s.rot), r: sp.vr * k };
  }
  /** 화면 좌표가 쌍둥이의 틈 소용돌이 위인가 (너무 작게 보여도 누를 수 있도록 최소 크기 보장) */
  function hitSpecial(clientX, clientY) {
    if (!open || !rifts.length) return null;
    const rc = el.canvas.getBoundingClientRect();
    const wx = cam.x + (clientX - rc.left - cw / 2) / cam.z, wy = cam.y + (clientY - rc.top - ch / 2) / cam.z;
    for (const s of specials) {
      if (s.kind === "abandoned") continue;                      // 버려진 틈은 눌러도 아무 일도 없다
      const vw = vortexWorld(s); if (!vw) continue;
      if (Math.hypot(wx - vw.x, wy - vw.y) <= Math.max(vw.r * 1.25, 36 / cam.z)) return s;
    }
    return null;
  }

  // 효과음: 빨려 드는 바람 → 진입의 쿵 → 점점 거칠어지는 지지직 → 전원이 꺼지는 소리 (WebAudio 로 그 자리에서 합성)
  function portalSound() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    let a; try { a = new AC(); } catch (_) { return; }
    if (a.resume) a.resume();
    const t0 = a.currentTime + 0.03, tun = (PT.fly + PT.tunnel) / 1000, end = tun + PT.off / 1000;
    const master = a.createGain(); master.gain.value = 0.42; master.connect(a.destination);
    const nb = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => { const s = a.createBufferSource(); s.buffer = nb; s.loop = true; return s; };
    // 1) 포탈이 빨아들이는 바람: 대역통과 노이즈가 점점 높아지며 커진다
    { const s = noise(), f = a.createBiquadFilter(), g = a.createGain();
      f.type = "bandpass"; f.Q.value = 1.1; f.frequency.setValueAtTime(160, t0); f.frequency.exponentialRampToValueAtTime(5200, t0 + tun);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.6, t0 + tun * 0.8); g.gain.linearRampToValueAtTime(0.0001, t0 + tun + 0.04);
      s.connect(f).connect(g).connect(master); s.start(t0); s.stop(t0 + tun + 0.1); }
    // 2) 저음 드론: 틈 속의 거대한 울림, 점점 올라간다
    for (const [type, f0, f1, vol] of [["sawtooth", 52, 118, 0.16], ["sine", 40, 78, 0.3]]) {
      const o = a.createOscillator(), lp = a.createBiquadFilter(), g = a.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + tun);
      lp.type = "lowpass"; lp.frequency.setValueAtTime(240, t0); lp.frequency.exponentialRampToValueAtTime(1800, t0 + tun);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 1.4); g.gain.setValueAtTime(vol, t0 + tun - 0.1); g.gain.linearRampToValueAtTime(0.0001, t0 + tun + 0.05);
      o.connect(lp).connect(g).connect(master); o.start(t0); o.stop(t0 + tun + 0.1);
    }
    // 3) 틈에 빨려 드는 순간의 쿵
    { const o = a.createOscillator(), g = a.createGain(), tt = t0 + PT.fly * 0.62 / 1000;
      o.type = "sine"; o.frequency.setValueAtTime(96, tt); o.frequency.exponentialRampToValueAtTime(34, tt + 0.7);
      g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.9, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.85);
      o.connect(g).connect(master); o.start(tt); o.stop(tt + 0.9); }
    // 4) 지지직: 점점 잦고 거칠어지는 짧은 잡음·전기 튀는 소리
    for (let tt = 1.8; tt < tun; ) {
      const prog = (tt - 1.8) / (tun - 1.8), s = noise(), f = a.createBiquadFilter(), g = a.createGain(), dur = 0.025 + Math.random() * (0.03 + 0.07 * prog);
      f.type = Math.random() < 0.5 ? "highpass" : "bandpass"; f.frequency.value = 800 + Math.random() * 5500; f.Q.value = 2 + Math.random() * 6;
      g.gain.setValueAtTime(0.0001, t0 + tt); g.gain.exponentialRampToValueAtTime(0.1 + 0.55 * prog, t0 + tt + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + tt + dur);
      s.connect(f).connect(g).connect(master); s.start(t0 + tt, Math.random()); s.stop(t0 + tt + dur + 0.02);
      if (Math.random() < 0.35 * prog) {                     // 가끔 거친 전자음 한 번
        const o = a.createOscillator(), og = a.createGain(); o.type = "square"; o.frequency.value = 90 + Math.random() * 600;
        og.gain.setValueAtTime(0.0001, t0 + tt); og.gain.exponentialRampToValueAtTime(0.05 + 0.1 * prog, t0 + tt + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t0 + tt + dur * 0.8);
        o.connect(og).connect(master); o.start(t0 + tt); o.stop(t0 + tt + dur);
      }
      tt += Math.max(0.035, (0.26 - 0.22 * prog) * (0.4 + Math.random()));
    }
    // 5) 전원이 꺼지는 소리: 높은 음이 뚝 떨어지고, 쿵, 마지막 틱
    { const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.setValueAtTime(1700, t0 + tun); o.frequency.exponentialRampToValueAtTime(34, t0 + tun + 0.5);
      g.gain.setValueAtTime(0.0001, t0 + tun); g.gain.exponentialRampToValueAtTime(0.5, t0 + tun + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + tun + 0.55);
      o.connect(g).connect(master); o.start(t0 + tun); o.stop(t0 + tun + 0.6);
      const s = noise(), f = a.createBiquadFilter(), ng = a.createGain();
      f.type = "lowpass"; f.frequency.value = 1400;
      ng.gain.setValueAtTime(0.0001, t0 + tun); ng.gain.exponentialRampToValueAtTime(0.7, t0 + tun + 0.01); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + tun + 0.2);
      s.connect(f).connect(ng).connect(master); s.start(t0 + tun); s.stop(t0 + tun + 0.25);
      const o2 = a.createOscillator(), g2 = a.createGain(); o2.type = "triangle"; o2.frequency.value = 2600;
      g2.gain.setValueAtTime(0.0001, t0 + end - 0.05); g2.gain.exponentialRampToValueAtTime(0.25, t0 + end - 0.045); g2.gain.exponentialRampToValueAtTime(0.0001, t0 + end);
      o2.connect(g2).connect(master); o2.start(t0 + end - 0.05); o2.stop(t0 + end + 0.02); }
    setTimeout(() => { try { a.close(); } catch (_) { /* 무시 */ } }, (end + PT.hold / 1000 + 1.5) * 1000);
  }

  function startPortal(s, now) {
    if (portal || burn || !open) return;
    const vw = vortexWorld(s); if (!vw) return;
    const z1 = clamp(2.2 * Math.max(cw, ch) / (2 * vw.r), 0.3, 6);               // 소용돌이가 화면을 가득 채우고도 넘치는 배율
    portal = { t0: now, from: { x: cam.x, y: cam.y, z: cam.z }, tgt: vw, z1, travel: 0, last: now, done: false };
    vel.x = vel.y = 0; tween = null; keys.clear(); stick.x = stick.y = 0; dragging = false; pointers.clear(); boostHeld = false; tap = null;
    el.boost.classList.remove("held"); el.canvas.style.cursor = "";
    el.screen.classList.add("portaling");
    showToast("차원의 틈이 당신을 삼킵니다…");
    setTimeout(() => el.toast.classList.remove("on"), 2600);
    portalSound();
    if (window.RasyancutBgm && window.RasyancutBgm.fadeOut) window.RasyancutBgm.fadeOut((PT.fly + PT.tunnel) * 0.9);
  }
  function endPortal() {
    portal = null; el.portal.classList.remove("on"); el.screen.classList.remove("portaling"); el.toast.classList.remove("on");
    const lk = document.getElementById("portal-link"); if (lk) lk.classList.remove("on");
  }
  const smooth01 = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function updatePortal(now) {
    if (!portal) return;
    const fixed = portal.fixed;                                   // 테스트용: 시간을 고정해 한 장면만 그린다
    const tp = fixed != null ? fixed : now - portal.t0, dt = Math.min(0.1, (now - portal.last) / 1000); portal.last = now;
    const T1 = PT.fly, T2 = PT.fly + PT.tunnel, T3 = T2 + PT.off, T4 = T3 + PT.hold;
    // 카메라: 소용돌이 중심으로 빨려 들어가듯 점점 빨리 확대 (매 프레임 식으로 구하므로 흔들림이 쌓이지 않는다)
    const sh = smooth01(1200, T2, tp) * 7;                         // 점점 커지는 화면 떨림(px)
    let bx, by, bz;
    if (tp < T1) {
      const k = tp / T1, ep = 1 - Math.pow(1 - k, 3), ez = Math.pow(k, 2.1);
      bx = portal.from.x + (portal.tgt.x - portal.from.x) * ep; by = portal.from.y + (portal.tgt.y - portal.from.y) * ep;
      bz = Math.exp(Math.log(portal.from.z) + (Math.log(portal.z1) - Math.log(portal.from.z)) * ez);
    } else { bx = portal.tgt.x; by = portal.tgt.y; bz = portal.z1 * Math.exp(0.3 * (tp - T1) / 1000); }
    cam.z = bz; cam.x = bx + (Math.random() - 0.5) * sh / bz; cam.y = by + (Math.random() - 0.5) * sh / bz;

    const flight = clamp(tp / T1, 0, 1);
    const enter = tp < T1 ? smooth01(0.3, 0.92, flight) : 1;
    const glitch = Math.pow(clamp((tp - 1800) / (T2 - 1800), 0, 1), 1.35) * 0.97;
    const offK = tp > T2 ? clamp((tp - T2) / PT.off, 0, 1) : 0;
    if (fixed != null) portal.travel = 7 * tp / 1000; else portal.travel += dt * (2.4 + 15 * Math.pow(smooth01(0, T2, tp), 1.4));
    const sx = ((portal.tgt.x - cam.x) * cam.z + cw / 2) / cw, sy = 1 - ((portal.tgt.y - cam.y) * cam.z + ch / 2) / ch;
    const on = tp > 150;
    el.portal.classList.toggle("on", on);
    // 프레임이 느려지면 포탈 해상도를 낮춘다 (약한 기기에서도 끊기지 않게)
    portalEma += (dt * 1000 - portalEma) * 0.15;
    if (portalEma > 45 && portalQ > 0.3) portalQ = Math.max(0.3, portalQ * 0.9);
    const w = Math.max(2, Math.floor(cw * portalQ)), h = Math.max(2, Math.floor(ch * portalQ));
    if (el.portal.width !== w || el.portal.height !== h) { el.portal.width = w; el.portal.height = h; }
    if (on) {
      if (portalGL) {
        const { gl, U } = portalGL;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(U.uRes, w, h); gl.uniform2f(U.uCenter, sx, sy);
        gl.uniform1f(U.uT, tp / 1000); gl.uniform1f(U.uTravel, portal.travel); gl.uniform1f(U.uEnter, enter);
        gl.uniform1f(U.uGlitch, glitch); gl.uniform1f(U.uOff, offK * offK * (3 - 2 * offK)); gl.uniform1f(U.uFlight, flight);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      } else {
        // WebGL 없음: 소용돌이 쪽에서 번지는 밝은 빛 → 가로줄이 튀는 지지직 → 검은 화면
        if (!portal2d) portal2d = el.portal.getContext("2d");
        const g = portal2d; g.clearRect(0, 0, w, h);
        const R = Math.hypot(w, h) * enter * 1.2;
        if (R > 1) { const gr = g.createRadialGradient(sx * w, (1 - sy) * h, 0, sx * w, (1 - sy) * h, R); gr.addColorStop(0, "rgba(255,250,210,1)"); gr.addColorStop(0.5, "rgba(238,255,107,0.85)"); gr.addColorStop(1, "rgba(0,0,0,0.0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
        if (tp > T1) { g.fillStyle = `rgba(0,0,0,${clamp((tp - T1) / 800, 0, 0.6)})`; g.fillRect(0, 0, w, h); }
        for (let i = 0; i < glitch * 18; i++) { g.fillStyle = `rgba(255,255,230,${Math.random() * 0.6})`; g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 5 * glitch); }
        if (tp > T2) { g.fillStyle = `rgba(0,0,0,${clamp((tp - T2) / PT.off, 0, 1)})`; g.fillRect(0, 0, w, h); }
      }
    }
    if (tp >= T4 && !portal.done && fixed == null) {
      portal.done = true;
      try { window.location.href = PORTAL_URL; } catch (_) { /* 아래 링크로 대신한다 */ }
      // 브라우저가 이동을 막았거나 늦어지면, 검은 화면에서 직접 누를 수 있는 링크를 보여 준다
      setTimeout(() => {
        if (!portal || !open) return;
        const a = document.getElementById("portal-link");
        if (a) { a.href = PORTAL_URL; a.classList.add("on"); }
      }, 3000);
    }
  }
  // 뒤로 가기로 돌아왔을 때(캐시된 화면이 까맣게 남아 있을 수 있음) 깨끗하게 다시 불러온다
  window.addEventListener("pageshow", (e) => { if (e.persisted && portal && portal.done) location.reload(); });

  // ───────────────────────── 맵 밖으로 나가면: 불타오르고 → 재가 되고 → 성역 한가운데서 다시 태어난다 ─────────────────────────
  const BURN_T = { fire: 2700, ash: 1700, reborn: 2900 };      // ms
  const BURN_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime, uFire, uAsh, uReborn, uHeat;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = p * 2.0 + 1.7; a *= 0.5; } return v; }
vec3 fireCol(float f){
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.45, 0.03, 0.0), smoothstep(0.0, 0.28, f));
  c = mix(c, vec3(1.0, 0.34, 0.02), smoothstep(0.22, 0.58, f));
  c = mix(c, vec3(1.0, 0.8, 0.22), smoothstep(0.5, 0.88, f));
  c = mix(c, vec3(1.0, 0.97, 0.78), smoothstep(0.86, 1.25, f));
  return c;
}
float flakes(vec2 uv, float t, float dens, float dir){
  vec2 g = uv * vec2(30.0, 17.0) + vec2(0.0, t * dir * 1.4);
  vec2 id = floor(g), fr = fract(g) - 0.5;
  float h = hash(id); if (h < dens) return 0.0;
  vec2 off = vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5; off.x += sin(t * 2.0 + h * 30.0) * 0.25;
  return (1.0 - smoothstep(0.0, 0.13, length(fr - off * 0.7))) * (0.4 + 0.6 * hash(id + 1.3));
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float asp = uRes.x / uRes.y;
  vec2 pp = vec2(uv.x * asp, uv.y);
  vec2 p = (uv - 0.5) * vec2(asp, 1.0) * 2.0;
  float ed = min(min(uv.x * asp, (1.0 - uv.x) * asp), min(uv.y, 1.0 - uv.y));
  vec2 q = vec2(uv.x * asp * 4.6, uv.y * 2.3 - uTime * 2.1);
  float n = fbm(q + vec2(0.0, fbm(q * 1.6 + uTime * 0.35) * 1.3));

  // 경계에 다가갈 때: 화면 가장자리가 달아오른다
  float hv = uHeat * smoothstep(0.075 + 0.05 * n, 0.0, ed + (n - 0.5) * 0.05);
  vec3 heatC = fireCol(clamp(hv * 0.8 + 0.12, 0.0, 0.72)) * hv * 0.3;

  // ── 종이가 타는 화면 ─────────────────────────────────────────────
  // 점화 시각 T: 가장자리에서 안쪽으로, 종이 섬유·두께 얼룩 때문에 들쭉날쭉 번진다 (작을수록 먼저 탄다)
  float edn = ed / (0.5 * min(asp, 1.0));
  float nLow = fbm(pp * 2.2 + 3.1), nMid = fbm(pp * 7.0 + 11.0), nHi = fbm(pp * 26.0 + 5.0);
  float fiber = vnoise(vec2(pp.x * 90.0, pp.y * 6.0));
  float T = edn * 0.95 + (nLow - 0.5) * 0.55 + (nMid - 0.5) * 0.16 + (nHi - 0.5) * 0.05 + (fiber - 0.5) * 0.012;
  float act = smoothstep(0.0, 0.04, uFire);
  float F = uFire * 1.62 - 0.12;                    // 불붙은 선의 위치
  float dt = F - T;                                 // > 0 : 이미 탄 곳, < 0 : 아직 타지 않은 곳
  float burnt = smoothstep(-0.004, 0.004, dt) * act;
  float behind = max(dt, 0.0), ahead = max(-dt, 0.0);
  float fadeE = 1.0 - uAsh;

  // 탄 자리: 선 바로 뒤는 눈부시게 달아오른 숯, 더 뒤는 검은 숯 속에서 불씨가 벌레처럼 꿈틀댄다
  float pat = smoothstep(0.38, 0.85, fbm(pp * 36.0 + vec2(uTime * 0.3, -uTime * 0.9)));
  float band = exp(-behind / 0.014);
  float tail = exp(-behind / 0.075) * pat;
  float glow = (band * 1.1 + tail * 0.85) * fadeE;
  vec3 emberC = fireCol(clamp(glow, 0.0, 1.3)) * glow;
  vec3 black = vec3(0.012, 0.009, 0.009) + vec3(0.025) * nMid * nMid;
  vec3 cb = black + emberC;
  float fall = flakes(pp, uTime, 0.90, -1.0) * (0.35 + 0.65 * burnt);
  cb += vec3(0.30, 0.27, 0.25) * fall * smoothstep(0.0, 0.25, behind) * 0.5 * act;      // 흩날리는 재 조각

  // 아직 안 탄 곳: 열을 먹어 누렇게 그을리고, 불붙기 직전엔 까맣게 말려 들어간다
  float scor = (1.0 - smoothstep(0.0, 0.17, ahead)) * act;
  float chr = (1.0 - smoothstep(0.0, 0.03, ahead)) * act;
  float aS = clamp(scor * 0.6 * (0.6 + 0.4 * nMid), 0.0, 1.0);
  vec3 c = vec3(0.17, 0.075, 0.02) * aS; float a = aS;
  float aC = clamp(chr * 0.85, 0.0, 1.0);
  c = c * (1.0 - aC) + vec3(0.03, 0.012, 0.004) * aC; a = a + aC * (1.0 - a);
  // 불붙은 선 앞쪽에서 일렁이는 작은 불꽃
  float fq = fbm(vec2(pp.x * 13.0, pp.y * 6.0 - uTime * 3.2) + fbm(pp * 9.0 + uTime * 0.6) * 1.2);
  float fl = exp(-ahead / (0.016 + 0.04 * fq)) * (0.4 + 1.3 * fq) * (1.0 - burnt) * act * fadeE;
  c += fireCol(clamp(fl, 0.0, 1.3)) * fl * 1.3; a = max(a, clamp(fl, 0.0, 1.0));
  // 열을 받아 가장자리부터 갈색·주황으로 달아오르는 종이
  float warm = exp(-ahead / 0.035) * (0.55 + 0.45 * nMid) * act * fadeE * (1.0 - burnt);
  c += vec3(0.55, 0.20, 0.04) * warm * 0.42; a = max(a, warm * 0.35);

  c = mix(c, cb, burnt); a = mix(a, 1.0, burnt);
  // 불붙은 선 자체: 가늘고 하얗게 타는 불씨 줄
  float line = exp(-pow(abs(dt / 0.007), 2.0)) * act * fadeE;
  c += vec3(1.0, 0.86, 0.5) * line * 1.3; a = max(a, clamp(line, 0.0, 1.0));
  // 선 근처에서 튀어 오르는 불똥
  float sp = flakes(pp * 1.3 + 4.0, uTime, 0.90, 1.0) * exp(-abs(dt) / 0.14) * act * fadeE;
  c += vec3(1.0, 0.6, 0.15) * sp * 1.4; a = max(a, clamp(sp, 0.0, 1.0));

  vec3 outc = c + heatC * (1.0 - a);
  float outa = clamp(a + hv * 0.6 * (1.0 - a), 0.0, 1.0);

  // 다시 태어남: 중앙에서 빛이 퍼지며 검은 화면을 걷어낸다
  float rr = length(p);
  float edgeN = (n - 0.5) * 0.35;
  float Rv = uReborn * 2.7;
  float rv = uReborn > 0.0001 ? smoothstep(Rv - 0.12, Rv + 0.12, rr + edgeN) : 1.0;
  float ring = exp(-pow(abs((rr + edgeN - Rv) / 0.08), 2.0)) * smoothstep(0.0, 0.08, uReborn) * (1.0 - smoothstep(0.9, 1.0, uReborn));
  outc = outc * rv + vec3(1.0, 0.93, 0.7) * ring * 1.6;
  outa = max(outa * rv, ring * 0.9);
  float flash = exp(-uReborn * 4.5) * step(0.0001, uReborn) * exp(-rr * 2.0);
  outc += vec3(1.0, 0.97, 0.85) * flash * 1.5; outa = max(outa, flash);
  gl_FragColor = vec4(min(outc, vec3(1.0)), clamp(outa, 0.0, 1.0));
}`;
  let burnGL = null, burn2d = null;
  function initBurn() {
    const c = el.burn;
    try {
      const gl = c.getContext("webgl", { alpha: true, premultipliedAlpha: true, antialias: false });
      if (!gl) throw new Error("no webgl");
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VORTEX_VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, BURN_FS));
      gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "aPos"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = {}; ["uRes", "uTime", "uFire", "uAsh", "uReborn", "uHeat"].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      burnGL = { gl, U };
    } catch (e) {
      burnGL = null;
      try { burn2d = c.getContext("2d"); } catch (_) { burn2d = null; }
    }
  }
  const easeIO = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

  function showToast(text) {
    el.toast.textContent = text; el.toast.classList.add("on");
  }
  function startBurn(now) {
    if (burn) return;
    burn = { t0: now, reset: false, stage: 0 };
    vel.x = vel.y = 0; tween = null; keys.clear(); stick.x = stick.y = 0; dragging = false; pointers.clear(); boostHeld = false;
    el.boost.classList.remove("held");
    el.screen.classList.add("burning");
  }
  function endBurn() {
    burn = null; el.toast.classList.remove("on"); el.screen.classList.remove("burning");
  }
  function rebirth() {
    cam.x = CX; cam.y = CY; cam.z = 1.1; vel.x = vel.y = 0;
    flyTo(CX, CY, clamp(Math.min(cw, ch) / (SANCT_R * 4.4), 0.1, 0.42), 2800);
    showToast("성역에서 다시 태어납니다");
  }

  function updateBurn(now, dC) {
    let fire = 0, ash = 0, reb = 0;
    let heat = clamp((dC - R_MAP * 0.86) / (R_MAP * 0.14), 0, 1); heat = heat * heat * (3 - 2 * heat);
    if (burn) {
      const tb = now - burn.t0, A = BURN_T.fire, B = A + BURN_T.ash, C = B + BURN_T.reborn;
      heat = 0;
      if (tb < A) fire = Math.pow(tb / A, 1.25);
      else if (tb < B) {
        fire = 1; ash = (tb - A) / BURN_T.ash;
        if (burn.stage < 1) { burn.stage = 1; showToast("불길이 모든 것을 삼켰습니다…"); }
      } else {
        fire = 1; ash = 1;
        if (!burn.reset) { burn.reset = true; rebirth(); }
        reb = Math.min(1, (tb - B) / BURN_T.reborn);
      }
      if (tb >= C) endBurn();
    }
    const on = !!burn || heat > 0.01;
    el.burn.classList.toggle("on", on);
    if (!on) return;
    // 해상도는 절반으로(불꽃은 부드러워 충분하고 비용이 크게 줄어든다)
    const w = Math.max(2, Math.floor(cw * 0.5)), h = Math.max(2, Math.floor(ch * 0.5));
    if (el.burn.width !== w || el.burn.height !== h) { el.burn.width = w; el.burn.height = h; }
    const tt = (now - t0) / 1000;
    if (burnGL) {
      const { gl, U } = burnGL;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h); gl.uniform1f(U.uTime, tt); gl.uniform1f(U.uFire, fire); gl.uniform1f(U.uAsh, ash); gl.uniform1f(U.uReborn, reb); gl.uniform1f(U.uHeat, heat);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (burn2d) {
      // WebGL 없음: 가장자리에서 번지는 붉은 불빛 → 재 → 중앙에서 퍼지는 빛으로 단순화
      const g = burn2d; g.clearRect(0, 0, w, h);
      const R = Math.hypot(w, h) / 2;
      const hot = Math.max(heat * 0.8, fire * (1 - ash));
      if (hot > 0.01) {
        const gr = g.createRadialGradient(w / 2, h / 2, R * (1 - 0.9 * Math.max(fire, heat * 0.4)), w / 2, h / 2, R);
        gr.addColorStop(0, "rgba(255,80,10,0)"); gr.addColorStop(0.55, `rgba(255,110,20,${0.55 * hot})`); gr.addColorStop(1, `rgba(255,220,120,${0.95 * hot})`);
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
      if (ash > 0) { g.fillStyle = `rgba(6,5,5,${Math.min(1, ash * 1.6)})`; g.fillRect(0, 0, w, h); }
      if (reb > 0) {
        g.save(); g.globalCompositeOperation = "destination-out";
        const rr = reb * R * 1.05; const gr = g.createRadialGradient(w / 2, h / 2, Math.max(0, rr - R * 0.2), w / 2, h / 2, rr + 1);
        gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore();
        g.strokeStyle = `rgba(255,240,190,${0.9 * (1 - reb)})`; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, reb * R * 1.05, 0, 7); g.stroke();
      }
    }
  }

  // ───────────────────────── 공개 API ─────────────────────────
  function init() {
    getEls();
    ctx = el.canvas.getContext("2d", { alpha: false });
    bindInput();
    initFire();
    initBurn();
    initPortal();
  }

  function show() {
    if (open) return;
    open = true;
    el.screen.classList.add("open"); el.screen.removeAttribute("inert"); el.screen.setAttribute("aria-hidden", "false");
    document.body.classList.add("map-open");
    resize();
    awaken = null; awakened = false; shakeAmp = 0;
    cam.x = CX; cam.y = CY; cam.z = 1.0; vel.x = vel.y = 0;
    flyTo(CX, CY, clamp(Math.min(cw, ch) / (SANCT_R * 4.4), 0.1, 0.42), 2600);
    last = performance.now(); t0 = last;
    raf = requestAnimationFrame(frame);
  }
  function hide() {
    open = false; cancelAnimationFrame(raf);
    el.screen.classList.remove("open"); el.screen.setAttribute("inert", ""); el.screen.setAttribute("aria-hidden", "true");
    document.body.classList.remove("map-open");
    awaken = null; awakened = false; shakeAmp = 0; spinAcc = 0; awxClear();      // 각성한 성역은 맵을 닫으면 처음으로 돌아간다
    keys.clear(); pointers.clear(); dragging = false; burn = null; if (portal) endPortal(); el.burn.classList.remove("on"); el.fire.classList.remove("on"); el.toast.classList.remove("on"); el.screen.classList.remove("burning");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.RasyancutMap = {
    prepare, show, hide, isOpen: () => open, isLocked: () => !!portal || !!awaken,
    _debug: { setEyeChance: (c) => { eyeChance = c; }, getAwaken: () => awaken, isAwakened: () => awakened, startAwaken: (g) => startAwaken(g || gates[0], performance.now()), hitEye, eyeOpenAmt, awakenHold: (target) => { const a = awaken; if (!a) return; a.hold = null; for (let k = a.ta || 0; k < target; k += 1 / 45) updateAwaken(a.start + k * 1000, 1 / 45); a.hold = target; updateAwaken(performance.now(), 0.0001); }, awakenSeek: (sec) => { if (awaken) awaken.start -= sec * 1000; }, setAwakenQ: (q) => { awQ = q; awEma = 16; }, SKIP, getVq: () => vq, cam, gates: () => gates, specials: () => specials, WORLD, R_MAP, MAX_SPEED, SANCT_R, flyTo, getBurn: () => burn, startBurn: () => startBurn(performance.now()), startPortal: () => startPortal(specials[0], performance.now()), setPortalQ: (q) => { portalQ = q; }, freezePortal: (ms) => { if (portal) portal.fixed = ms; }, hitSpecial, vortexWorld: () => vortexWorld(specials[0]), PT, forceRiftGlitch: (on) => { if (on) { riftG.t0 = -1; riftG.dur = 1e9; riftG.amp = 0.9; riftG.next = 1e9; } else { riftG.dur = 0; riftG.next = 0; } } },
  };
})();
