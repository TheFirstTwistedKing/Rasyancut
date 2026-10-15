/* 라시안컷 맵
 *
 *  - 세계 크기 16000 × 16000. 최고 속도로 끝에서 끝까지 약 8초 (CROSS_SECONDS)
 *  - 중앙: 성역의 경계 / 곳곳: 찢어진 차원의 틈 관문 260개(일반 258 + 특별 2)
 *  - 특별 관문(페이스리아의 차원의 틈, 오비투아리바의 차원의 틈): 연노랑·검정 소용돌이 + 사실적인 빛, 일반 관문보다 큼
 *  - 조작: 드래그(관성) · 휠/핀치 확대 · 방향키/WASD · 터치 조이스틱 · 미니맵 클릭
 *
 *  window.RasyancutMap = { prepare(onProgress), show(), hide(), isOpen() }
 */
(() => {
  "use strict";

  // ───────────────────────── 상수 ─────────────────────────
  const WORLD = 16000;
  const CX = WORLD / 2, CY = WORLD / 2;
  const CROSS_SECONDS = 8;
  const MAX_SPEED = WORLD / CROSS_SECONDS;          // 세계 단위/초 (끝에서 끝까지 8초)
  const SANCT_R = 1000;                              // 성역의 경계 반지름
  const Z_MIN = 0.1, Z_MAX = 1.5;
  const NORMAL_GATES = 259;                          // + 쌍둥이의 차원의 틈 1 = 260
  const SPECIAL = [
    { name: "페이스리아와 오비투아리바의 차원의 틈", x: 11900, y: 4100 },   // 쌍둥이: 한 틈 안에 두 소용돌이
  ];
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
    const vo = o.big ? 0.18 * S : 0;
    return { c, S, pts, cx, cy, hw: hwMax * 1.12, hh: hh * 1.02, big: !!o.big, vc: [[cx - vo, cy], [cx + vo, cy]], vr: 0.235 * S };
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
  rid = pow(rid, 5.0);
  float dB = dA * 0.6 + 3.1;
  float uB = u - uTime * 0.09 * dir - dB * 0.2;
  vec2 qB = vec2(uB * P, dB * 1.1 - uTime * 0.26 * dir);
  float b1 = fbm4(qB + vec2(seed * 1.7, 3.3), P);
  float densB = smoothstep(0.4, 0.88, b1 * 1.15);
  float glow = 1.0 / (1.0 + r * r * 16.0);
  float side = 0.82 + 0.3 * sin(ang + uTime * 0.3 * dir + seed);
  float inten = (densA * (0.42 + 1.15 * rid) + densA * densA * 0.55) * (0.3 + 1.5 * glow) * side;
  inten += densB * (1.0 - densA) * 0.3 * (0.35 + 1.3 * glow);
  inten *= smoothstep(1.22, 0.3, r);
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
  float ember = step(0.9, eh) * smoothstep(0.14, 0.0, length((cf - eo * 0.6) * vec2(1.0, 0.42)));
  col += vec3(1.0, 0.97, 0.7) * ember * (0.5 + 1.6 * glow) * smoothstep(1.1, 0.2, r);
  col += vec3(1.0, 0.97, 0.78) * exp(-r * 8.0);
  col += vec3(1.0) * exp(-r * 30.0) * 2.0;
  return col;
}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  vec2 p1 = (p - vec2(-uOff, 0.0)) / uRs, p2 = (p - vec2(uOff, 0.0)) / uRs;
  vec3 col = vec3(0.0);
  if (dot(p1, p1) < 1.6) col += vortex(p1, uDir, uSeed);
  if (dot(p2, p2) < 1.6) col += vortex(p2, -uDir, uSeed * 1.7 + 3.3);
  // 두 소용돌이를 잇는 빛의 다리(쌍둥이의 결속): 한쪽에서 다른 쪽으로 흐르는 가스 가닥
  float bx = abs(p.x) / max(uOff, 0.001);
  float bn = fbm4(vec2(p.x * 7.0 + uTime * 0.7 * uDir, p.y * 11.0) + uSeed, 1000.0);
  float bridge = exp(-pow(p.y / (0.07 + 0.05 * bn), 2.0)) * smoothstep(1.05, 0.15, bx);
  col += vec3(0.95, 1.0, 0.5) * bridge * (0.25 + 0.7 * bn) * 0.6;
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
  let gates = [], specials = [], rifts = [], glows = [], nebulaSprites = [], blobs = [], miniStatic = null;
  let nebulaTex = null, bloomTex = {}, raysTex = null;
  const NEB = 1024;
  let prepared = false;

  function buildGates() {
    const r = rng32(20261015);
    const pts = [];
    const centers = [];
    for (let i = 0; i < 9; i++) {                       // 관문이 몰려 있는 구역
      const a = r() * Math.PI * 2, d = 2600 + r() * 5200;
      centers.push([CX + Math.cos(a) * d, CY + Math.sin(a) * d]);
    }
    const margin = 640, tooCloseSpecial = 1500;
    // 크기가 전부 제각각: 작은 것(0.4)부터 큰 것(1.3)까지 연속적으로 흩어지고, 가로·세로 비율도 관문마다 다르다
    const rnd = () => 0.4 + 0.75 * Math.pow(r(), 1.2);
    let guard = 0;
    while (pts.length < NORMAL_GATES && guard++ < 90000) {
      let x, y;
      if (r() < 0.42) {
        const c = centers[(r() * centers.length) | 0];
        x = c[0] + (r() + r() + r() - 1.5) * 2000; y = c[1] + (r() + r() + r() - 1.5) * 2000;
      } else { x = margin + r() * (WORLD - 2 * margin); y = margin + r() * (WORLD - 2 * margin); }
      if (x < margin || y < margin || x > WORLD - margin || y > WORLD - margin) continue;
      if (Math.hypot(x - CX, y - CY) < SANCT_R + 800) continue;
      if (SPECIAL.some((s) => Math.hypot(x - s.x, y - s.y) < tooCloseSpecial)) continue;
      const sc = rnd(), sx = sc * (0.78 + 0.5 * r()), sy = sc * (0.85 + 0.35 * r());
      const rad = 205 * Math.max(sx, sy);                    // 이 관문이 차지하는 대략의 반지름
      if (pts.some((p) => Math.hypot(x - p[0], y - p[1]) < (rad + p[4]) * 0.85 + 130)) continue;   // 크기에 맞춘 간격
      pts.push([x, y, sx, sy, rad]);
    }
    gates = pts.map((p) => ({
      x: p[0], y: p[1], sx: p[2], sy: p[3], scale: Math.max(p[2], p[3]), rot: (r() - 0.5) * 0.8, v: (r() * 12) | 0,
      phase: r() * 6.28, flip: r() < 0.5 ? -1 : 1,
    }));
    specials = SPECIAL.map((s, i) => ({ ...s, idx: i, scale: 1.6, phase: i * 2.1, rot: -0.05 }));   // 쌍둥이 틈은 어느 관문보다 크다
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
    rifts.push(makeWound(777, { rim: NEON_PALE, glow: "238,255,107" }, 768, { hw: 0.38, hh: 0.31, big: true })); await step();
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
    const r = rng32(99);
    for (let i = 0; i < 70; i++) {
      const warm = Math.hypot(0, 0) || 0;
      const x = r() * WORLD, y = r() * WORLD;
      const near = Math.hypot(x - CX, y - CY) < 3600;
      blobs.push({ x, y, s: 2200 + r() * 3800, a: 0.035 + r() * 0.06, k: near && r() < 0.6 ? 3 : (r() * 3) | 0 });
    }
    await step();
    nebulaTex = mk(NEB, NEB);
    {
      const ng = nebulaTex.getContext("2d"), k = NEB / WORLD;
      ng.globalCompositeOperation = "lighter";
      blobs.forEach((bl) => { ng.globalAlpha = Math.min(1, bl.a * 1.15); const s = bl.s * k; ng.drawImage(nebulaSprites[bl.k], bl.x * k - s / 2, bl.y * k - s / 2, s, s); });
    }
    bloomTex.cool = makeBloom("255,250,215", "238,255,107");
    bloomTex.hot = makeBloom("255,255,240", "244,255,134");
    bloomTex.core = makeBloom("255,255,245", "255,252,200");
    raysTex = [makeRays(1), makeRays(2)];
    initVortexGL();
    if (!vgl) { for (let i = 0; i < 2; i++) bakes[i] = await bakeSwirl(384, i * 7.3 + 1.7); }
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
      c.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tween = null;
      if (pointers.size === 1) { dragging = true; dragVel = { x: 0, y: 0 }; vel.x = vel.y = 0; lastMove = performance.now(); }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); dragging = false; }
      c.classList.add("grabbing");
    });
    c.addEventListener("pointermove", (e) => {
      const p = pointers.get(e.pointerId); if (!p) return;
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
      pointers.delete(e.pointerId);
      if (pointers.size === 0) {
        c.classList.remove("grabbing");
        if (dragging) {
          const idle = performance.now() - lastMove;
          if (idle < 90) { vel.x = clamp(dragVel.x, -MAX_SPEED, MAX_SPEED); vel.y = clamp(dragVel.y, -MAX_SPEED, MAX_SPEED); }
        }
        dragging = false; pinchD = 0;
      } else if (pointers.size === 1) { dragging = true; dragVel = { x: 0, y: 0 }; lastMove = performance.now(); pinchD = 0; }
    };
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
    c.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0014), e.clientX, e.clientY); }, { passive: false });

    window.addEventListener("keydown", (e) => {
      if (!open) return;
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) { keys.add(k); tween = null; e.preventDefault(); }
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
    s.addEventListener("pointerdown", (e) => { s.setPointerCapture(e.pointerId); stick.id = e.pointerId; tween = null; upd(e); e.stopPropagation(); });
    s.addEventListener("pointermove", (e) => { if (stick.id === e.pointerId) upd(e); });
    const sEnd = (e) => { if (stick.id !== e.pointerId) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ""; };
    s.addEventListener("pointerup", sEnd); s.addEventListener("pointercancel", sEnd);

    // 버튼
    el.zin.addEventListener("click", () => zoomAt(1.4, cw / 2, ch / 2));
    el.zout.addEventListener("click", () => zoomAt(1 / 1.4, cw / 2, ch / 2));
    el.home.addEventListener("click", () => flyTo(CX, CY, 0.4, 1400));

    // 미니맵: 누르거나 끌면 그 위치로
    const mm = el.mini;
    const jump = (e, smooth) => {
      const r = mm.getBoundingClientRect();
      const wx = clamp((e.clientX - r.left) / r.width, 0, 1) * WORLD, wy = clamp((e.clientY - r.top) / r.height, 0, 1) * WORLD;
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
    if (tween) {
      const k = clamp((now - tween.t0) / tween.ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
      cam.x = tween.fx + (tween.tx - tween.fx) * e; cam.y = tween.fy + (tween.ty - tween.fy) * e;
      cam.z = Math.exp(Math.log(tween.fz) + (Math.log(tween.tz) - Math.log(tween.fz)) * e);
      if (k >= 1) tween = null;
    } else if (!dragging) {
      let ix = stick.x, iy = stick.y;
      if (keys.has("arrowleft") || keys.has("a")) ix -= 1;
      if (keys.has("arrowright") || keys.has("d")) ix += 1;
      if (keys.has("arrowup") || keys.has("w")) iy -= 1;
      if (keys.has("arrowdown") || keys.has("s")) iy += 1;
      const l = Math.hypot(ix, iy);
      if (l > 0.04) {
        if (l > 1) { ix /= l; iy /= l; }
        const k = 1 - Math.exp(-dt / 0.22);
        vel.x += (ix * MAX_SPEED - vel.x) * k; vel.y += (iy * MAX_SPEED - vel.y) * k;
      } else {
        const f = Math.exp(-dt / 0.55); vel.x *= f; vel.y *= f;
        if (Math.abs(vel.x) < 4 && Math.abs(vel.y) < 4) vel.x = vel.y = 0;
      }
      cam.x += vel.x * dt; cam.y += vel.y * dt;
    }
    if (cam.x < 0) { cam.x = 0; vel.x = 0; } if (cam.x > WORLD) { cam.x = WORLD; vel.x = 0; }
    if (cam.y < 0) { cam.y = 0; vel.y = 0; } if (cam.y > WORLD) { cam.y = WORLD; vel.y = 0; }
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
    // 세계 좌표 격자(희미) + 2000단위마다 굵게, 가장자리 경계
    const z = cam.z;
    const vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    const minor = z > 0.3 ? 500 : 0, major = 2000;
    ctx.lineWidth = 1 / z;
    for (const [step, alpha] of [[minor, 0.045], [major, 0.11]]) {
      if (!step) continue;
      ctx.strokeStyle = `rgba(238,255,107,${alpha})`;
      ctx.beginPath();
      for (let x = Math.max(0, Math.ceil(vx0 / step) * step); x <= Math.min(WORLD, vx1); x += step) { ctx.moveTo(x, Math.max(0, vy0)); ctx.lineTo(x, Math.min(WORLD, vy1)); }
      for (let y = Math.max(0, Math.ceil(vy0 / step) * step); y <= Math.min(WORLD, vy1); y += step) { ctx.moveTo(Math.max(0, vx0), y); ctx.lineTo(Math.min(WORLD, vx1), y); }
      ctx.stroke();
    }
    // 세계 경계
    ctx.save();
    ctx.shadowColor = NEON; ctx.shadowBlur = 24;
    ctx.strokeStyle = "rgba(244,255,134,0.75)"; ctx.lineWidth = 2.5 / z;
    ctx.strokeRect(0, 0, WORLD, WORLD);
    ctx.restore();
  }

  function drawNebula() {
    // 미리 구워 둔 세계 전체 성운 한 장에서 보이는 부분만 그린다 (대형 이미지를 매 프레임 겹쳐 그리던 비용 제거)
    const z = cam.z, k = NEB / WORLD;
    const ax0 = Math.max(0, cam.x - cw / 2 / z), ay0 = Math.max(0, cam.y - ch / 2 / z);
    const ax1 = Math.min(WORLD, cam.x + cw / 2 / z), ay1 = Math.min(WORLD, cam.y + ch / 2 / z);
    if (ax1 <= ax0 || ay1 <= ay0) return;
    ctx.globalCompositeOperation = "lighter";
    ctx.drawImage(nebulaTex, ax0 * k, ay0 * k, (ax1 - ax0) * k, (ay1 - ay0) * k, ax0, ay0, ax1 - ax0, ay1 - ay0);
    ctx.globalCompositeOperation = "source-over";
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
    const [lx, ly] = W(sp.vc[0][0], sp.vc[0][1]), [rx, ry] = W(sp.vc[1][0], sp.vc[1][1]);
    const vrW = sp.vr * k;
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);

    // ── 사실적인 빛: 틈 전체의 낮은 번짐 → 두 소용돌이 각각의 번짐과 핵 → 두 곳에서 뻗는 빛줄기·렌즈 광선 ──
    ctx.globalCompositeOperation = "lighter";
    const bl = (tex, x, y, rad, a) => { ctx.globalAlpha = Math.min(1, a * flick); ctx.drawImage(tex, x - rad, y - rad, rad * 2, rad * 2); };
    bl(bloomTex.cool, 0, 0, sz * 1.5, 0.17);
    for (const [x, y] of [[lx, ly], [rx, ry]]) { bl(bloomTex.hot, x, y, vrW * 2.6, 0.38); bl(bloomTex.core, x, y, vrW * 1.0, 0.5); }
    const rr = sz * 1.35;
    for (const [x, y, dir] of [[lx, ly, 1], [rx, ry, -1]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.03 * dir + s.phase); ctx.globalAlpha = 0.8 * flick; ctx.drawImage(raysTex[dir > 0 ? 0 : 1], -rr, -rr, rr * 2, rr * 2); ctx.restore();
    }
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 1.6);
    hg.addColorStop(0, `rgba(255,255,235,${0.45 * flick})`); hg.addColorStop(0.3, `rgba(244,255,134,${0.14 * flick})`); hg.addColorStop(1, "rgba(238,255,107,0)");
    ctx.save(); ctx.scale(1, 0.016); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, sz * 1.6, 0, 7); ctx.fill(); ctx.restore();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";

    // ── 틈 본체 ──
    const spx = sz * z * dpr;
    ctx.drawImage(spx < S / 4 * 1.1 ? sp.mips[0] : spx < S / 2 * 1.1 ? sp.mips[1] : sp.c, -sz / 2, -sz / 2, sz, sz);
    if (spx > 45) {
      ctx.save();
      ctx.beginPath(); sp.pts.forEach(([u, v], i) => { const [x, y] = W(u, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.clip();
      ctx.fillStyle = "#000"; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
      const halfS = Math.max(sp.hw, sp.hh) * 1.06, half = halfS * k;   // 틈 전체를 덮는 정사각형
      if (vgl) {
        const R = clamp(Math.round(half * 2 * z * dpr * vq), 64, VORTEX_MAX);
        vortexDrawn = true;
        renderVortex(R, t, 1, 1.7, (sp.vc[1][0] - sp.cx) / halfS, sp.vr / halfS);
        ctx.drawImage(vgl.cv, 0, vgl.cv.height - R, R, R, -half, -half, half * 2, half * 2);
      } else {
        // WebGL 없음/손실: 구워 둔 질감을 서로 다른 속도로 돌려 겹쳐 흐름을 흉내 낸다 (쌍둥이는 서로 반대로 돈다)
        for (let j = 0; j < 2; j++) {
          if (!bakes[j] && !bakeBusy[j]) { bakeBusy[j] = true; bakeSwirl(256, j * 7.3 + 1.7).then((c) => { bakes[j] = c; }); }
          const bk = bakes[j]; if (!bk) continue;
          const [x, y] = j ? [rx, ry] : [lx, ly], dv = j ? -1 : 1, h1 = vrW * 1.25, h2 = h1 * 1.18;
          ctx.save(); ctx.translate(x, y);
          ctx.globalCompositeOperation = "lighter";      // 검은 모서리가 이웃 소용돌이를 가리지 않도록 가산 합성
          ctx.save(); ctx.rotate(t * 0.32 * dv); ctx.drawImage(bk, -h1, -h1, h1 * 2, h1 * 2); ctx.restore();
          ctx.globalAlpha = 0.42;
          ctx.save(); ctx.rotate(-t * 0.21 * dv + 1.3); ctx.drawImage(bk, -h2, -h2, h2 * 2, h2 * 2); ctx.restore();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
          ctx.restore();
        }
      }
      ctx.globalCompositeOperation = "lighter";
      for (const [x, y] of [[lx, ly], [rx, ry]]) {
        const cg = ctx.createRadialGradient(x, y, 0, x, y, vrW * 0.34);
        cg.addColorStop(0, `rgba(255,255,255,${flick})`); cg.addColorStop(0.35, "rgba(255,252,200,0.7)"); cg.addColorStop(1, "rgba(238,255,107,0)");
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, vrW * 0.34, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    // ── 두 소용돌이로 빨려 드는 빛 ──
    drawInflow(lx, ly, 1, vrW * 2.3, t, 11, z);
    drawInflow(rx, ry, -1, vrW * 2.3, t, 23, z);

    // 이름표 (두 소용돌이 아래 이름, 아래쪽에 전체 이름)
    ctx.rotate(-s.rot);
    const fs = Math.max(18 / z, 30), sub = Math.max(13 / z, 22);
    ctx.textAlign = "center";
    ctx.shadowColor = NEON; ctx.shadowBlur = 14; ctx.fillStyle = NEON_PALE;
    ctx.font = `700 ${sub}px "Noto Serif KR", serif`;
    ctx.fillText("페이스리아", lx, sp.hh * k + sub * 1.7); ctx.fillText("오비투아리바", rx, sp.hh * k + sub * 1.7);
    ctx.font = `700 ${fs}px "Noto Serif KR", serif`;
    ctx.fillText(s.name, 0, sp.hh * k + sub * 1.7 + fs * 1.5);
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
      ctx.fillText(lab, lx, ly);
      ctx.restore();
    });
    ctx.restore();
  }

  function drawAxisLabels() {
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '500 10px "Cinzel", serif'; ctx.fillStyle = "rgba(244,255,134,0.4)";
    const z = cam.z;
    for (let x = Math.ceil((cam.x - cw / 2 / z) / 2000) * 2000; x <= cam.x + cw / 2 / z; x += 2000) {
      if (x < 0 || x > WORLD) continue; ctx.fillText(`X ${x / 1000}`, (x - cam.x) * z + cw / 2 + 4, ch - 8);
    }
    for (let y = Math.ceil((cam.y - ch / 2 / z) / 2000) * 2000; y <= cam.y + ch / 2 / z; y += 2000) {
      if (y < 0 || y > WORLD) continue; ctx.fillText(`Y ${y / 1000}`, 8, (y - cam.y) * z + ch / 2 - 4);
    }
    ctx.restore();
  }

  function buildMiniStatic() {
    const S = 220, c = mk(S, S), g = c.getContext("2d"), k = S / WORLD;
    g.fillStyle = "rgba(2,3,10,0.9)"; g.fillRect(0, 0, S, S);
    g.strokeStyle = "rgba(238,255,107,0.08)"; g.lineWidth = 1; g.beginPath();
    for (let i = 1; i < 8; i++) { g.moveTo(i * S / 8, 0); g.lineTo(i * S / 8, S); g.moveTo(0, i * S / 8); g.lineTo(S, i * S / 8); }
    g.stroke();
    g.strokeStyle = "rgba(251,255,200,0.9)"; g.lineWidth = 1.2; g.beginPath(); g.arc(S / 2, S / 2, SANCT_R * k, 0, 7); g.stroke();
    gates.forEach((p, i) => { const t = TINTS[p.v % 6]; g.fillStyle = t.rim; g.globalAlpha = 0.85; g.fillRect(p.x * k - 0.9, p.y * k - 0.9, 1.8, 1.8); });
    g.globalAlpha = 1;
    miniStatic = c;
  }

  function drawMini(t) {
    const m = el.mini, mg = m.getContext("2d"), S = m.width;
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.clearRect(0, 0, S, S);
    mg.drawImage(miniStatic, 0, 0, S, S);
    const k = S / WORLD;
    // 특별 관문
    specials.forEach((s) => {
      const p = 0.5 + 0.5 * Math.sin(t * 2.4 + s.phase);
      const gr = mg.createRadialGradient(s.x * k, s.y * k, 0, s.x * k, s.y * k, 10 * dpr);
      gr.addColorStop(0, `rgba(255,255,230,${0.9})`); gr.addColorStop(0.3, `rgba(238,255,107,${0.45 + p * 0.3})`); gr.addColorStop(1, "rgba(238,255,107,0)");
      mg.fillStyle = gr; mg.beginPath(); mg.arc(s.x * k, s.y * k, 10 * dpr, 0, 7); mg.fill();
      mg.fillStyle = "#fff"; mg.beginPath(); mg.arc(s.x * k, s.y * k, 1.8 * dpr, 0, 7); mg.fill();
    });
    // 현재 시야
    const vw = cw / cam.z * k, vh = ch / cam.z * k;
    mg.strokeStyle = "#fbffc8"; mg.lineWidth = 1.4 * dpr; mg.shadowColor = NEON; mg.shadowBlur = 6 * dpr;
    mg.strokeRect(cam.x * k - vw / 2, cam.y * k - vh / 2, vw, vh);
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

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#02030a"; ctx.fillRect(0, 0, cw, ch);
    if (!SKIP.has('stars')) drawStars(t);
    // 세계 좌표계
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, dpr * (cw / 2 - cam.x * cam.z), dpr * (ch / 2 - cam.y * cam.z));
    if (!SKIP.has('nebula')) drawNebula();
    if (!SKIP.has('grid')) drawGridAndEdge(t);
    if (!SKIP.has('sanct')) drawSanctuary(t);

    const z = cam.z, vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;
    if (!SKIP.has('gates')) for (const g of gates) {
      const e = rifts[g.v].S * g.scale * 1.5;
      if (g.x + e < vx0 || g.x - e > vx1 || g.y + e < vy0 || g.y - e > vy1) continue;
      drawGate(g, t);
    }
    if (!SKIP.has('specials')) for (const s of specials) {
      const e = rifts[12 + s.idx].S * s.scale * 3.6;
      if (s.x + e < vx0 || s.x - e > vx1 || s.y + e < vy0 || s.y - e > vy1) continue;
      drawSpecial(s, t, z);
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    // 화면 공간 요소
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 경계 밖 사선 무늬
    if (!SKIP.has('hud')) { drawOutside(); drawAxisLabels(); drawEdgeMarkers(t); }
    if (!SKIP.has('mini')) drawMini(t);
    hudT += dt;
    if (hudT > 0.12) {
      hudT = 0;
      const dC = Math.hypot(cam.x - CX, cam.y - CY);
      el.coords.textContent = `X ${Math.round(cam.x).toString().padStart(5, "0")}  Y ${Math.round(cam.y).toString().padStart(5, "0")}  ·  성역까지 ${(dC / 1000).toFixed(1)}k`;
    }
  }

  function drawOutside() {
    // 세계 밖 영역: 화면 공간에서 사선 무늬
    const z = cam.z;
    const x0 = (0 - cam.x) * z + cw / 2, y0 = (0 - cam.y) * z + ch / 2, x1 = (WORLD - cam.x) * z + cw / 2, y1 = (WORLD - cam.y) * z + ch / 2;
    if (x0 <= 0 && y0 <= 0 && x1 >= cw && y1 >= ch) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip("evenodd");
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = "rgba(238,255,107,0.09)"; ctx.lineWidth = 7;
    ctx.beginPath();
    for (let k = -ch; k < cw + ch; k += 26) { ctx.moveTo(k, 0); ctx.lineTo(k - ch, ch); }
    ctx.stroke();
    ctx.restore();
  }

  // ───────────────────────── 공개 API ─────────────────────────
  function init() {
    getEls();
    ctx = el.canvas.getContext("2d", { alpha: false });
    bindInput();
  }

  function show() {
    if (open) return;
    open = true;
    el.screen.classList.add("open"); el.screen.removeAttribute("inert"); el.screen.setAttribute("aria-hidden", "false");
    document.body.classList.add("map-open");
    resize();
    cam.x = CX; cam.y = CY; cam.z = 1.0; vel.x = vel.y = 0;
    flyTo(CX, CY, clamp(Math.min(cw, ch) / (SANCT_R * 2.7), 0.14, 0.42), 2600);
    last = performance.now(); t0 = last;
    raf = requestAnimationFrame(frame);
  }
  function hide() {
    open = false; cancelAnimationFrame(raf);
    el.screen.classList.remove("open"); el.screen.setAttribute("inert", ""); el.screen.setAttribute("aria-hidden", "true");
    document.body.classList.remove("map-open");
    keys.clear(); pointers.clear(); dragging = false;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  window.RasyancutMap = {
    prepare, show, hide, isOpen: () => open,
    _debug: { SKIP, getVq: () => vq, cam, gates: () => gates, specials: () => specials, WORLD, MAX_SPEED, SANCT_R, flyTo },
  };
})();
