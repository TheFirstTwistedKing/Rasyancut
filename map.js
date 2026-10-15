/* 라시안컷 맵
 *
 *  - 세계 크기 16000 × 16000. 최고 속도로 끝에서 끝까지 약 8초 (CROSS_SECONDS)
 *  - 중앙: 성역의 경계 / 곳곳: 찢어진 차원의 틈 관문 260개(일반 258 + 특별 2)
 *  - 특별 관문(페이스라이, 오비투아리바): 연노랑·검정 소용돌이 + 사실적인 빛, 일반 관문보다 큼
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
  const NORMAL_GATES = 258;                          // + 특별 2 = 260
  const SPECIAL = [
    { name: "페이스라이",   x: 11900, y: 4100 },
    { name: "오비투아리바", x: 4000,  y: 11800 },
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
  /** 찢어진 차원의 틈: 직사각형이 어긋나 붙은 각진 균열 + 가장자리 빛 + 터럭 */
  function makeRift(seed, tint, S, big) {
    const r = rng32(seed);
    const rects = [];
    const k = big ? 1.12 : 1;
    const cw = S * (0.27 + r() * 0.14) * k, ch = S * (0.31 + r() * 0.17) * k;
    rects.push([S / 2 - cw / 2, S / 2 - ch / 2, cw, ch]);
    const place = (b, side, th, len) => {
      let x, y, w, h;
      if (side === 0)      { w = len; h = th; x = b[0] + r() * b[2] - w / 2; y = b[1] - h * (0.45 + r() * 0.55); }
      else if (side === 1) { w = len; h = th; x = b[0] + r() * b[2] - w / 2; y = b[1] + b[3] - h * (r() * 0.55); }
      else if (side === 2) { w = th; h = len; x = b[0] - w * (0.45 + r() * 0.55); y = b[1] + r() * b[3] - h / 2; }
      else                 { w = th; h = len; x = b[0] + b[2] - w * (r() * 0.55); y = b[1] + r() * b[3] - h / 2; }
      x = clamp(x, S * 0.08, S * 0.92 - w); y = clamp(y, S * 0.08, S * 0.92 - h);
      rects.push([x, y, w, h]);
    };
    // 가장자리를 계단처럼 뜯어낸 톱니(찢어진 결)
    const teeth = (big ? 30 : 20) + ((r() * 8) | 0);
    for (let i = 0; i < teeth; i++) {
      const base = i < 8 ? rects[0] : rects[(r() * rects.length) | 0];
      place(base, (r() * 4) | 0, S * (0.016 + r() * 0.04), S * (0.04 + r() * 0.1));
    }
    // 실루엣을 깨는 큰 날개 몇 개
    const wings = big ? 4 : 3;
    for (let i = 0; i < wings; i++) place(rects[0], (r() * 4) | 0, S * (0.05 + r() * 0.04), S * (0.15 + r() * 0.13));
    const c = mk(S, S), g = c.getContext("2d");
    const grow = S * 0.006;
    // 바깥으로 번지는 빛 + 가장자리(밝은 테두리)
    g.save();
    g.shadowColor = `rgba(${tint.glow},0.55)`; g.shadowBlur = S * 0.12;
    g.fillStyle = `rgba(${tint.glow},0.35)`;
    rects.forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
    g.shadowColor = `rgba(${tint.glow},0.95)`; g.shadowBlur = S * 0.045;
    g.fillStyle = tint.rim;
    rects.forEach(([x, y, w, h]) => g.fillRect(x - grow, y - grow, w + 2 * grow, h + 2 * grow));
    g.restore();
    // 속은 검정(균열 너머의 어둠)
    g.fillStyle = "#000";
    rects.forEach(([x, y, w, h]) => g.fillRect(x, y, w, h));
    // 안쪽 연기 + 안쪽으로 새는 빛
    g.save();
    g.beginPath(); rects.forEach(([x, y, w, h]) => g.rect(x, y, w, h)); g.clip();
    if (!big) {
      for (let i = 0; i < 9; i++) {
        const px = S * (0.25 + r() * 0.5), py = S * (0.25 + r() * 0.5), rad = S * (0.08 + r() * 0.12);
        const gr = g.createRadialGradient(px, py, 0, px, py, rad);
        gr.addColorStop(0, "rgba(190,205,230,0.2)"); gr.addColorStop(1, "rgba(190,205,230,0)");
        g.fillStyle = gr; g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
      }
    }
    // 합집합의 바깥 모양을 반전해 만든 틀의 그림자를 안쪽에만 떨어뜨려, 경계를 따라 안쪽으로 새는 빛을 만든다
    const outer = mk(S, S), og = outer.getContext("2d");
    og.fillStyle = tint.rim; og.fillRect(0, 0, S, S);
    og.globalCompositeOperation = "destination-out"; og.fillStyle = "#000";
    rects.forEach(([x, y, w, h]) => og.fillRect(x, y, w, h));
    g.shadowColor = `rgba(${tint.glow},0.85)`; g.shadowBlur = S * 0.034;
    g.drawImage(outer, 0, 0);
    g.restore();
    // 가장자리에서 뻗는 가는 터럭(빛이 새는 결)
    const ms = 3, mw = Math.floor(S / ms);
    const mc = mk(mw, mw), mg = mc.getContext("2d");
    mg.fillStyle = "#000";
    rects.forEach(([x, y, w, h]) => mg.fillRect(x / ms, y / ms, w / ms, h / ms));
    const d = mg.getImageData(0, 0, mw, mw).data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < mw && y < mw && d[(y * mw + x) * 4 + 3] > 128;
    g.lineWidth = Math.max(1, S / 384 * 1.0);
    g.strokeStyle = tint.rim;
    for (let y = 0; y < mw; y++) {
      for (let x = 0; x < mw; x++) {
        if (!solid(x, y)) continue;
        const px = x * ms + r() * ms, py = y * ms;
        if (!solid(x, y - 1) && r() < 0.6) { g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - S * (0.008 + r() * 0.03)); g.stroke(); }
        if (!solid(x, y + 1) && r() < 0.6) { g.globalAlpha = 0.25 + r() * 0.6; g.beginPath(); g.moveTo(px, py + ms); g.lineTo(px, py + ms + S * (0.008 + r() * 0.03)); g.stroke(); }
        if (!solid(x - 1, y) && r() < 0.18) { g.globalAlpha = 0.2 + r() * 0.5; g.beginPath(); g.moveTo(x * ms, py); g.lineTo(x * ms - S * (0.006 + r() * 0.022), py); g.stroke(); }
        if (!solid(x + 1, y) && r() < 0.18) { g.globalAlpha = 0.2 + r() * 0.5; g.beginPath(); g.moveTo(x * ms + ms, py); g.lineTo(x * ms + ms + S * (0.006 + r() * 0.022), py); g.stroke(); }
      }
    }
    g.globalAlpha = 1;
    // 소용돌이 중심·반지름
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    rects.forEach(([x, y, w, h]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); });
    return { c, S, rects, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rad: Math.max(x1 - x0, y1 - y0) / 2 };
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
    const minD = 560, margin = 560, tooCloseSpecial = 900;
    let guard = 0;
    while (pts.length < NORMAL_GATES && guard++ < 60000) {
      let x, y;
      if (r() < 0.42) {
        const c = centers[(r() * centers.length) | 0];
        x = c[0] + (r() + r() + r() - 1.5) * 2000; y = c[1] + (r() + r() + r() - 1.5) * 2000;
      } else { x = margin + r() * (WORLD - 2 * margin); y = margin + r() * (WORLD - 2 * margin); }
      if (x < margin || y < margin || x > WORLD - margin || y > WORLD - margin) continue;
      if (Math.hypot(x - CX, y - CY) < SANCT_R + 700) continue;
      if (SPECIAL.some((s) => Math.hypot(x - s.x, y - s.y) < tooCloseSpecial)) continue;
      if (pts.some((p) => Math.hypot(x - p[0], y - p[1]) < minD)) continue;
      pts.push([x, y]);
    }
    gates = pts.map((p, i) => ({
      x: p[0], y: p[1], rot: (r() - 0.5) * 0.6, scale: 0.62 + r() * 0.34, v: (r() * 12) | 0,
      phase: r() * 6.28, flip: r() < 0.5 ? -1 : 1,
    }));
    specials = SPECIAL.map((s, i) => ({ ...s, idx: i, scale: 1.0, phase: i * 2.1, rot: i ? 0.12 : -0.1 }));
  }

  async function prepare(onProgress) {
    if (prepared) { onProgress && onProgress(1); return; }
    const total = 12 + 2 + 6 + 4 + 2;
    let done = 0;
    const step = async () => { done++; onProgress && onProgress(done / total); await tick(); };
    buildGates(); await step();
    for (let i = 0; i < 12; i++) { rifts.push(makeRift(1000 + i * 37, TINTS[i % 6], 512, false)); await step(); }
    for (let i = 0; i < 2; i++) {
      rifts.push(makeRift(777 + i * 211, { rim: NEON_PALE, glow: "238,255,107" }, 640, true)); await step();
    }
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
    buildMiniStatic(); await step();
    if (document.fonts && document.fonts.load) {
      try { await Promise.race([document.fonts.load('700 20px "Noto Serif KR"', "페이스라이"), new Promise((res) => setTimeout(res, 1500))]); } catch (_) { /* 기본 글꼴 */ }
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
    const sp = rifts[g.v], sz = sp.S * g.scale;
    const flick = 0.82 + 0.18 * Math.sin(t * 1.6 + g.phase) + 0.07 * Math.sin(t * 5.1 + g.phase * 2.3);
    ctx.save(); ctx.translate(g.x, g.y);
    ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5 * flick;
    const R = sz * 1.45; ctx.drawImage(glows[g.v % 6], -R, -R, R * 2, R * 2);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    ctx.rotate(g.rot); ctx.scale(g.flip, 1);
    const pxs = sz * cam.z * dpr;
    ctx.drawImage(pxs < sp.S / 4 * 1.1 ? sp.mips[0] : pxs < sp.S / 2 * 1.1 ? sp.mips[1] : sp.c, -sz / 2, -sz / 2, sz, sz);
    ctx.restore();
  }

  function drawSpecial(s, t, z) {
    const sp = rifts[12 + s.idx], sz = sp.S * s.scale, k = s.scale;
    const flick = 0.9 + 0.1 * Math.sin(t * 1.9 + s.phase) + 0.04 * Math.sin(t * 7.3 + s.phase);
    ctx.save(); ctx.translate(s.x, s.y);
    // ── 사실적인 빛: 거대한 번짐 → 중간 번짐 → 핵 (역제곱 감쇠에 가깝게) ──
    ctx.globalCompositeOperation = "lighter";
    const bl = (tex, rad, a) => { ctx.globalAlpha = Math.min(1, a * flick); ctx.drawImage(tex, -rad, -rad, rad * 2, rad * 2); };
    bl(bloomTex.cool, sz * 2.8, 0.16);
    bl(bloomTex.hot, sz * 1.5, 0.42);
    bl(bloomTex.core, sz * 0.62, 0.55);
    // 빛줄기(갓 레이): 구워 둔 두 겹을 서로 반대로 천천히 돌려 일렁이게
    const rr = sz * 2.7;
    ctx.save(); ctx.rotate(t * 0.035 + s.phase); ctx.globalAlpha = 0.9 * flick; ctx.drawImage(raysTex[0], -rr, -rr, rr * 2, rr * 2); ctx.restore();
    ctx.save(); ctx.rotate(-t * 0.022 - s.phase); ctx.globalAlpha = 0.7 * flick; ctx.drawImage(raysTex[1], -rr, -rr, rr * 2, rr * 2); ctx.restore();
    ctx.globalAlpha = 1;
    // 가로로 길게 번지는 렌즈 광선
    const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, sz * 4);
    hg.addColorStop(0, `rgba(255,255,235,${0.5 * flick})`); hg.addColorStop(0.3, `rgba(244,255,134,${0.14 * flick})`); hg.addColorStop(1, "rgba(238,255,107,0)");
    ctx.save(); ctx.scale(1, 0.018); ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(0, 0, sz * 4, 0, 7); ctx.fill(); ctx.restore();
    ctx.globalCompositeOperation = "source-over";

    // ── 틈 본체 + 소용돌이 ──
    ctx.rotate(s.rot);
    const spx = sz * z * dpr;
    ctx.drawImage(spx < sp.S / 4 * 1.1 ? sp.mips[0] : spx < sp.S / 2 * 1.1 ? sp.mips[1] : sp.c, -sz / 2, -sz / 2, sz, sz);
    if (spx > 45) {
    ctx.save();
    ctx.beginPath();
    sp.rects.forEach(([x, y, w, h]) => ctx.rect((x - sp.S / 2) * k, (y - sp.S / 2) * k, w * k, h * k));
    ctx.clip();
    ctx.fillStyle = "#000"; ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
    const vx = (sp.cx - sp.S / 2) * k, vy = (sp.cy - sp.S / 2) * k, vr = sp.rad * k * 1.25;
    ctx.translate(vx, vy);
    const rot = t * 0.7 * (s.idx ? -1 : 1);
    const arms = 6;
    const ag = ctx.createRadialGradient(0, 0, 0, 0, 0, vr);
    ag.addColorStop(0, "#ffffff"); ag.addColorStop(0.1, "#fffbd0"); ag.addColorStop(0.3, "#f4ff86"); ag.addColorStop(0.65, "#d6c93f"); ag.addColorStop(1, "rgba(120,100,10,0.85)");
    ctx.fillStyle = ag;
    for (let a = 0; a < arms; a++) {
      const off = a / arms * Math.PI * 2;
      ctx.beginPath();
      const steps = 34;
      for (let i = 0; i <= steps; i++) {
        const q = i / steps, rr = vr * (0.04 + 0.96 * q), th = rot + off + 3.4 * Math.log(0.12 + q) * -1;
        const hw = (0.55 - 0.3 * q) * (Math.PI / arms);
        const x = Math.cos(th + hw) * rr, y = Math.sin(th + hw) * rr;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const q = i / steps, rr = vr * (0.04 + 0.96 * q), th = rot + off + 3.4 * Math.log(0.12 + q) * -1;
        const hw = (0.55 - 0.3 * q) * (Math.PI / arms);
        ctx.lineTo(Math.cos(th - hw) * rr, Math.sin(th - hw) * rr);
      }
      ctx.closePath(); ctx.fill();
    }
    // 중심: 하얀 핵
    ctx.globalCompositeOperation = "lighter";
    const cg = ctx.createRadialGradient(0, 0, 0, 0, 0, vr * 0.34);
    cg.addColorStop(0, `rgba(255,255,255,${flick})`); cg.addColorStop(0.35, "rgba(255,252,200,0.7)"); cg.addColorStop(1, "rgba(238,255,107,0)");
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, vr * 0.34, 0, 7); ctx.fill();
    ctx.restore();
    }

    // ── 빨려 들어가는 빛 알갱이 ──
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 38; i++) {
      const ph = hash2(i, s.idx, 21), sp2 = 0.12 + hash2(i, s.idx, 22) * 0.16;
      const f = (t * sp2 + ph) % 1, rr = sz * (1.9 * (1 - f) + 0.12);
      const th = hash2(i, s.idx, 23) * 6.28 + f * 4.2 * (s.idx ? -1 : 1);
      ctx.globalAlpha = Math.sin(f * Math.PI) * 0.9;
      ctx.fillStyle = "#fffbd0";
      const ps = (1.2 + hash2(i, s.idx, 24) * 2.2) / z * 0.9 + 1.2;
      ctx.beginPath(); ctx.arc(Math.cos(th) * rr, Math.sin(th) * rr, ps, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    // 이름표
    const fs = Math.max(18 / z, 30);
    ctx.rotate(-s.rot);
    ctx.font = `700 ${fs}px "Noto Serif KR", serif`; ctx.textAlign = "center";
    ctx.shadowColor = NEON; ctx.shadowBlur = 16; ctx.fillStyle = NEON_PALE;
    ctx.fillText(s.name, 0, sz * 0.62 + fs);
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
    _debug: { SKIP, cam, gates: () => gates, specials: () => specials, WORLD, MAX_SPEED, SANCT_R, flyTo },
  };
})();
