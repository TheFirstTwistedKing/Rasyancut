(() => {
  "use strict";

  const D = window.TREE_DATA;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  // OS의 "동작 줄이기" 설정과 무관하게 애니메이션을 항상 재생한다.
  // 필요하면 <html data-reduce-motion="true"> 로 직접 끌 수 있다.
  const reduced = document.documentElement.dataset.reduceMotion === "true";

  if (!D) return;

  // ── 나무 데이터 주입 ─────────────────────────────────────────
  $("tree-outline").setAttribute("d", D.outline);
  $("tree-bark").setAttribute("d", D.bark);
  $("tree-knots").setAttribute("d", D.knots);
  $("tree-outline-lite").setAttribute("d", D.outlineLite);

  // ── 기둥 위 세로 라틴어: 글자는 눕히지 않고 똑바로, 위에서 아래로 쌓는다 ──
  const trunkText = $("trunk-text");
  const WORDS = ["ARBOR", "SEPHIROTH"];
  const TRUNK_X = 297, PITCH = 17;
  const letters = [...WORDS[0], null, ...WORDS[1]];         // null = 단어 사이 빈칸
  const startY = 586 - ((letters.length - 1) * PITCH) / 2;
  letters.forEach((ch, i) => {
    if (ch === null) return;
    const t = document.createElementNS(NS, "tspan");
    t.setAttribute("x", TRUNK_X);
    t.setAttribute("y", (startY + i * PITCH).toFixed(1));
    t.textContent = ch;
    trunkText.appendChild(t);
  });
  trunkText.setAttribute("aria-label", WORDS.join(" "));

  // ── 열매: 가지 끝 아랫면에서 늘어뜨린다. 열매마다 색이 다르고(로딩 화면 이미지의 색), 위치·빛의 박자도 다르다 ──
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mixHex = (a, b, t) => {
    const A = hex2rgb(a), B = hex2rgb(b);
    return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };
  /** 기본색 하나에서 고리·빛무리에 쓰는 색들을 뽑는다 (바깥은 기본색, 중심으로 갈수록 흰색에 가까워진다) */
  const palette = (base) => ({
    c1: base, c2: mixHex(base, "#ffffff", .28), c3: mixHex(base, "#ffffff", .62),
    cb: mixHex(base, "#ffffff", .5), cr: mixHex(base, "#ffffff", .58), cc: mixHex(base, "#ffffff", .9),
  });
  const PAL_01 = { c1: "#eeff6b", c2: "#f4ff86", c3: "#fbffc8", cb: "#f8ffa0", cr: "#f8ffb4", cc: "#fffff0" };   // 처음 열매(네온 연노랑)

  // anchor: 가지 밑면의 점 (나무 윤곽에서 열매가 들어갈 빈 공간이 있는 곳을 계산해 골랐다)
  const FRUIT_DEFS = [
    { id: "01", anchor: [D.fruit.stemX, D.fruit.stemY], pal: PAL_01, phase: 0 },
    { id: "02", anchor: [521, 314], pal: palette("#ff2e3c"), phase: -1.7 },   // 붉은 일식
    { id: "03", anchor: [160, 333], pal: palette("#ffa31a"), phase: -3.1 },   // 금빛 태양
    { id: "04", anchor: [80, 284],  pal: palette("#3f86ff"), phase: -0.8 },   // 푸른 등대
    { id: "05", anchor: [616, 352], pal: palette("#ffd93d"), phase: -2.4 },   // 금빛 별
    { id: "06", anchor: [379, 407], pal: palette("#b26bff"), phase: -3.9 },   // 보라 손
    { id: "07", anchor: [205, 450], pal: palette("#e8efff"), phase: -1.2 },   // 흰 테두리의 검은 별
  ];

  const gradHTML = ({ id, pal: p }) => `
    <radialGradient id="bloom-${id}">
      <stop offset="0"   stop-color="#ffffff" stop-opacity=".9"/>
      <stop offset=".08" stop-color="${p.cc}" stop-opacity=".7"/>
      <stop offset=".16" stop-color="${p.cb}" stop-opacity=".42"/>
      <stop offset=".3"  stop-color="${p.c1}" stop-opacity=".2"/>
      <stop offset=".5"  stop-color="${p.c1}" stop-opacity=".075"/>
      <stop offset=".75" stop-color="${p.c1}" stop-opacity=".02"/>
      <stop offset="1"   stop-color="${p.c1}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="core-${id}">
      <stop offset="0"  stop-color="#ffffff" stop-opacity="1"/>
      <stop offset=".3" stop-color="${p.cc}" stop-opacity=".75"/>
      <stop offset=".7" stop-color="${p.c2}" stop-opacity=".12"/>
      <stop offset="1"  stop-color="${p.c2}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="flare-${id}">
      <stop offset="0"   stop-color="#ffffff" stop-opacity=".95"/>
      <stop offset=".35" stop-color="${p.c2}" stop-opacity=".35"/>
      <stop offset="1"   stop-color="${p.c1}" stop-opacity="0"/>
    </radialGradient>`;

  const FRUIT_SCALE = 0.8;                       // 나무에 달린 열매의 크기 (확대했을 때의 크기는 그대로)
  const STAR = "M0 -50Q8.5 -8.5 50 0Q8.5 8.5 0 50Q-8.5 8.5 -50 0Q-8.5 -8.5 0 -50Z";
  const unitHTML = ({ id, pal: p, phase, pos, anchor, swing, amp }) => `
    <g class="fruit-unit" data-id="${id}" style="--f1:${p.c1};--f2:${p.c2};--f3:${p.c3};--ph:${phase}s;--ax:${anchor[0]}px;--ay:${anchor[1]}px;--sw:${swing}s;--sa:${amp}deg">
      <g class="stem"></g>
      <g class="fruit" role="button" tabindex="0" aria-label="세피로트의 열매 ${id}" transform="translate(${pos.x} ${pos.y}) scale(${FRUIT_SCALE})">
        <g class="ripples" aria-hidden="true"></g>
        <g class="bounce">
          <g class="bloom" aria-hidden="true"><circle r="160" fill="url(#bloom-${id})"/></g>
          <g class="flares" aria-hidden="true">
            <ellipse rx="170" ry="2.4" fill="url(#flare-${id})"/>
            <ellipse rx="2" ry="84" fill="url(#flare-${id})" opacity=".75"/>
            <ellipse rx="64" ry="1.4" fill="url(#flare-${id})" opacity=".7" transform="rotate(32)"/>
            <ellipse rx="64" ry="1.4" fill="url(#flare-${id})" opacity=".7" transform="rotate(-32)"/>
          </g>
          <circle r="22" fill="url(#core-${id})" class="core"/>
          <g class="ring" fill="none" aria-hidden="true">
            <circle r="22" stroke="${p.c1}" stroke-width="7" opacity=".5" filter="url(#glow-soft)"/>
            <circle r="22" stroke="${p.c1}" stroke-width="4"/>
            <circle r="22" stroke="${p.cr}" stroke-width="2.6"/>
            <circle r="22" stroke="#ffffff" stroke-width="1.3"/>
          </g>
          <g class="orbit" aria-hidden="true">
            <circle r="34" fill="none" stroke="${p.c2}" stroke-width="1" stroke-dasharray="1.5 7" vector-effect="non-scaling-stroke" opacity=".8"/>
          </g>
          <g class="star" aria-hidden="true">
            <path d="${STAR}" fill="none" stroke="${p.c1}" stroke-width="3.2" opacity=".35" filter="url(#glow-soft)" stroke-linejoin="round"/>
            <path d="${STAR}" fill="none" stroke="${p.c2}" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="${STAR}" fill="none" stroke="#ffffff" stroke-width=".6" stroke-linejoin="round"/>
            <g class="star-dots">
              ${[[0, -50], [50, 0], [0, 50], [-50, 0]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="url(#core-${id})"/><circle cx="${x}" cy="${y}" r="1.8" fill="#fff"/>`).join("")}
            </g>
          </g>
          <g class="dust" aria-hidden="true"></g>
        </g>
        <circle class="hit" r="46" fill="transparent"/>
      </g>
    </g>`;

  const fruitList = FRUIT_DEFS.map((f) => {
    const S = { x: f.anchor[0], y: f.anchor[1] };
    // 열매마다 흔들리는 박자·폭이 조금씩 다르다 (모두 같이 흔들리면 인공적으로 보인다)
    const k = Number(f.id) - 1;
    return { ...f, S, pos: { x: S.x + 4, y: S.y + 62 }, swing: (5.4 + (k * 0.83) % 2.3).toFixed(2), amp: (2.4 + (k * 0.37) % 1.2).toFixed(2) };
  });
  $("tree").querySelector("defs").insertAdjacentHTML("beforeend", fruitList.map(gradHTML).join(""));
  $("fruit-group").insertAdjacentHTML("beforeend", fruitList.map(unitHTML).join(""));

  fruitList.forEach((f) => {
    const unit = $("fruit-group").querySelector(`.fruit-unit[data-id="${f.id}"]`);
    f.unit = unit; f.node = unit.querySelector(".fruit");
    const { S, pos: F, pal: p } = f;
    const stemD = `M${S.x} ${S.y - 3} C${S.x + 1} ${S.y + 26} ${F.x + 6} ${F.y - 46 * FRUIT_SCALE} ${F.x} ${F.y - 22 * FRUIT_SCALE}`;
    [
      [p.c1, 5, ".45", "url(#glow-soft)"],
      [p.c2, 2.4, "1", null],
      [p.c3, 1.5, "1", null],
      ["#ffffff", .7, "1", null],
    ].forEach(([stroke, w, op, filter]) => {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", stemD);
      path.setAttribute("stroke", stroke);
      path.setAttribute("stroke-width", w);
      path.setAttribute("opacity", op);
      if (filter) path.setAttribute("filter", filter);
      unit.querySelector(".stem").appendChild(path);
    });
    // 열매 주변에 떠오르는 빛 알갱이
    const dust = unit.querySelector(".dust");
    for (let i = 0; i < 5; i++) {
      const c = document.createElementNS(NS, "circle");
      const ang = Math.random() * Math.PI * 2;
      const rad = 14 + Math.random() * 20;
      c.setAttribute("cx", (Math.cos(ang) * rad).toFixed(1));
      c.setAttribute("cy", (Math.sin(ang) * rad).toFixed(1));
      c.setAttribute("r", (0.5 + Math.random() * 0.9).toFixed(2));
      c.style.setProperty("--d", (5 + Math.random() * 5).toFixed(1) + "s");
      c.style.setProperty("--delay", (-Math.random() * 8).toFixed(1) + "s");
      c.style.setProperty("--dx", ((Math.random() - 0.5) * 26).toFixed(0) + "px");
      c.style.setProperty("--dy", (-(46 + Math.random() * 60)).toFixed(0) + "px");
      dust.appendChild(c);
    }
  });

  // ── 세로로 긴 화면(모바일): 오른쪽 열매의 빛이 잘리지 않게 시야를 넓힌다 ──
  const svg = $("tree");
  const baseVB = () => (window.innerWidth / window.innerHeight < 0.8
    ? [-24, -30, 724, 870] : [10, -30, 660, 870]);
  const svgFruits = $("tree-fruits");
  // 열매 레이어는 나무와 항상 같은 시야를 쓴다 (카메라 이동 중에도 viewBox 가 바뀔 때마다 따라간다)
  new MutationObserver(() => svgFruits.setAttribute("viewBox", svg.getAttribute("viewBox")))
    .observe(svg, { attributes: true, attributeFilter: ["viewBox"] });
  /** 바람에 기우는 중심(나무 뿌리)이 화면의 어디인지 계산해 두 레이어에 알려 준다 */
  const setSwayOrigin = () => {
    const box = $("tree-box"), W = box.clientWidth, H = box.clientHeight;      // 기울기가 적용되지 않은 레이아웃 크기
    const [vx, vy, vw, vh] = baseVB();
    if (!W || !H) return;
    const s = Math.min(W / vw, H / vh);
    const o = { "--ox": ((W - vw * s) / 2 + (298 - vx) * s).toFixed(1) + "px", "--oy": ((H - vh * s) / 2 + (806 - vy) * s).toFixed(1) + "px" };
    [svg, svgFruits].forEach((el) => Object.entries(o).forEach(([k, v]) => el.style.setProperty(k, v)));
  };
  const fitView = () => {
    if (camMode !== "idle") return;
    svg.setAttribute("viewBox", baseVB().join(" "));
    setSwayOrigin();
  };
  let camMode = "idle";          // idle | zooming | open
  fitView();
  window.addEventListener("resize", () => { fitView(); if (camMode === "open") onResizeOpen(); });

  // ── 등장: 뿌리에서 가지 끝까지 자라듯 켜진다 ────────────────
  // 켜지는 경계(마스크)와 스캔선은 CSS 변수·transform 만 바꾼다 → 나무 자체는 다시 그려지지 않아 끊기지 않는다
  const VIEW_TOP = -30, VIEW_H = 870;
  const front = $("reveal-front");
  const travel = VIEW_H * 1.12;                  // 경계(번짐 포함)가 화면 위로 완전히 빠지는 거리
  const frontStartY = VIEW_TOP + VIEW_H + 52;       // 경계의 중앙(svg 단위)
  const FEATHER = 52;                               // 경계가 번지는 폭의 절반(svg 단위)

  const label = $("trunk-label");
  const fruitGroup = $("fruit-group");

  /** 켜지는 경계를 svg 단위 y 에서 화면 px 로 바꿔 적용 */
  const place = (ySvg, opacity) => {
    const box = $("tree-box"), W = box.clientWidth, H = box.clientHeight;
    const [vx, vy, vw, vh] = baseVB();
    const s = Math.min(W / vw, H / vh), oy = (H - vh * s) / 2;
    const fy = oy + (ySvg - vy) * s;
    svg.style.setProperty("--fy", fy.toFixed(1) + "px");
    svg.style.setProperty("--ff", (FEATHER * s).toFixed(1) + "px");
    front.style.transform = `translateY(${fy.toFixed(1)}px)`;
    front.style.opacity = opacity;
  };

  const finish = () => {
    svg.classList.remove("revealing");              // 등장이 끝나면 마스크는 필요 없다(렌더 비용 절감)
    front.style.opacity = 0;
    label.classList.add("on");
    svgFruits.classList.add("on");
    // 열매가 떠오르는 페이드(1.2초)가 끝난 뒤에 바람·열매 빛 같은 상시 애니메이션을 시작한다 (겹치면 그 순간 끊긴다)
    setTimeout(() => $("stage").classList.add("alive"), reduced ? 0 : 900);
  };

  if (reduced) {
    finish();
  } else {
    const DUR = 3400;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    let t0 = 0, labelOn = false, fruitOn = false;
    place(frontStartY, 0);
    const tick = (now) => {
      if (!t0) t0 = now;                            // 첫 프레임(처음 그리기가 가장 무겁다)이 끝난 시점부터 시간을 잰다
      const t = Math.min(1, (now - t0) / DUR);
      const e = ease(t);
      place(frontStartY - travel * e, t < 0.04 ? t / 0.04 : t > 0.93 ? (1 - t) / 0.07 : 1);
      if (!labelOn && t > 0.55) { label.classList.add("on"); labelOn = true; }
      if (!fruitOn && t > 0.82) { svgFruits.classList.add("on"); fruitOn = true; }
      if (t < 1) requestAnimationFrame(tick); else finish();
    };
    requestAnimationFrame(() => requestAnimationFrame(tick));
    window.addEventListener("resize", () => { if (svg.classList.contains("revealing")) place(frontStartY, 0); });
  }

  // ── 화면 전환 ───────────────────────────────────────────────
  const overlay = $("transition");
  const slats = $("slats");
  const SLATS = 9;
  for (let i = 0; i < SLATS; i++) {
    const s = document.createElement("i");
    s.style.setProperty("--i", i);
    slats.appendChild(s);
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

  const Transition = {
    busy: false,
    /** 슬랫이 닫힌 뒤(onClosed) 실행 → 다시 열린다. 반환: Promise */
    async play(onClosed) {
      if (this.busy) return;
      this.busy = true;
      overlay.classList.remove("opening");
      overlay.classList.add("active");
      void overlay.offsetWidth;
      overlay.classList.add("closed");
      await wait(500 + SLATS * 45 + 700);
      if (onClosed) await onClosed();
      overlay.classList.add("opening");
      overlay.classList.remove("closed");
      await wait(500 + SLATS * 45 + 150);
      overlay.classList.remove("opening", "active");
      this.busy = false;
    },
  };
  window.RasyancutTransition = Transition;   // 이후 화면(인트로 등)에서 재사용

  // ── 효과음 ─────────────────────────────────────────────────
  // 지연 없이 재생되도록 Web Audio 로 미리 디코딩해 둔다. (브라우저 정책상 첫 클릭/키 입력 뒤에 준비됨)
  // fetch 가 막히는 환경(파일을 직접 연 경우 등)에서는 일반 Audio 로 대신 재생한다.
  const Sfx = (() => {
    const URL_ = "assets/sfx/zoom-in.wav?v=1";   // 소리를 바꾸면 v 숫자를 올려 캐시를 갱신
    let ctx = null, buf = null, raw = null;
    const fallback = new Audio(URL_);
    fallback.preload = "auto";
    if (location.protocol !== "file:") {       // 파일을 직접 연 경우 fetch 는 브라우저가 막으므로 요청하지 않는다
      fetch(URL_).then((r) => r.arrayBuffer()).then((a) => { raw = a; }).catch(() => {});
    }

    const unlock = async () => {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
        }
        if (ctx.state === "suspended") await ctx.resume();
        if (!buf && raw) buf = await ctx.decodeAudioData(raw.slice(0));
      } catch (_) { /* 실패하면 fallback 사용 */ }
    };
    ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
      window.addEventListener(ev, unlock, { passive: true }));

    const DEFAULT_VOL = 0.17;                 // 효과음 기본 볼륨 (0~1). 더 작게/크게는 이 값만 바꾼다
    const play = (volume = DEFAULT_VOL) => {
      if (ctx && buf && ctx.state === "running") {
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buf;
        gain.gain.value = volume;
        src.connect(gain).connect(ctx.destination);
        src.start();
        return;
      }
      try {
        const a = fallback.cloneNode();
        a.volume = volume;
        a.play().catch(() => {});
      } catch (_) { /* 무음으로 넘어간다 */ }
    };
    // 효과음 파일을 주소로 불러 두었다가 거리에 따라 크기·먹먹함·좌우 위치를 바꿔 재생한다 (맵의 번개 소리 등)
    const bufs = {};
    const load = (url) => {
      if (!ctx || bufs[url]) return;
      bufs[url] = fetch(url).then((r) => r.arrayBuffer()).then((a) => ctx.decodeAudioData(a)).catch(() => null);
    };
    const playAt = (url, { volume = 1, pan = 0, cutoff = 20000, rate = 1 } = {}) => {
      if (!ctx || ctx.state !== "running") return;
      if (!bufs[url]) { load(url); return; }           // 처음 한 번은 불러오는 동안 건너뛴다 (preload 로 미리 불러 두면 바로 난다)
      bufs[url].then((buf) => {
        if (!buf) return;
        const src = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        src.buffer = buf; src.playbackRate.value = rate; g.gain.value = volume;
        f.type = "lowpass"; f.frequency.value = cutoff;
        let node = src.connect(f).connect(g);
        if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); node = node.connect(p); }
        node.connect(ctx.destination);
        src.start();
      });
    };
    const preload = (urls) => urls.forEach(load);
    return { play, unlock, playAt, preload };
  })();
  window.RasyancutSfx = Sfx;               // 이후 화면에서도 같은 소리를 재사용

  // ── 배경음악 ───────────────────────────────────────────────
  // 브라우저는 사용자의 첫 클릭/키 입력 전에는 소리를 낼 수 없다.
  // 그래서 첫 입력 때 서서히 커지며 시작하고, 오른쪽 위 버튼으로 끄고 켤 수 있다. (선택은 기억됨)
  const Bgm = (() => {
    // 곡마다 밑바탕에 깔리는 정도(vol)를 따로 둔다 (효과음 0.8 대비 약 -12dB). 더 크게/작게는 이 값만 바꾼다
    //   vanguard 는 원곡이 main 보다 약 2dB 작아서 그만큼 올려 비슷하게 들리게 맞췄다
    const TRACKS = {
      main:     { src: "assets/audio/bgm.mp3", vol: 0.2 },
      vanguard: { src: "assets/audio/bgm-vanguard.mp3", vol: 0.26 },      // 라시안컷 : 뱅가드 입장 후
    };
    let trackName = "main";
    const curVol = () => TRACKS[trackName].vol;
    const KEY = "rasyancut.bgm";
    const el = new Audio(TRACKS.main.src);
    el.loop = true;
    el.preload = "auto";
    const AC = window.AudioContext || window.webkitAudioContext;
    // 파일을 직접 연 경우(file://)에는 WebAudio 로 흘리면 무음이 되므로 요소 볼륨으로 조절한다
    const viaCtx = !!AC && location.protocol !== "file:";
    let ctx = null, gain = null, want = true, playing = false, level = 0, fadeRaf = 0, wasPlaying = false;
    try { want = localStorage.getItem(KEY) !== "off"; } catch (_) { /* 저장소 사용 불가 */ }
    const btn = $("bgm-toggle");

    const render = () => {
      btn.classList.toggle("on", playing);
      btn.classList.toggle("muted", !want);
      btn.setAttribute("aria-pressed", String(want));
      btn.setAttribute("aria-label", want ? "배경음악 끄기" : "배경음악 켜기");
    };
    const save = () => { try { localStorage.setItem(KEY, want ? "on" : "off"); } catch (_) { /* 무시 */ } };
    const setLevel = (v) => {
      level = v;
      if (gain) gain.gain.value = v; else el.volume = Math.min(1, Math.max(0, v));
    };
    const ramp = (to, ms) => new Promise((resolve) => {
      cancelAnimationFrame(fadeRaf);
      const from = level, t0 = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        setLevel(from + (to - from) * k * k * (3 - 2 * k));
        if (k < 1) fadeRaf = requestAnimationFrame(tick); else resolve();
      };
      fadeRaf = requestAnimationFrame(tick);
    });

    let starting = false;
    const start = async () => {
      if (!want || playing || starting) return;
      starting = true;
      try {
        if (viaCtx && !ctx) {
          ctx = new AC();
          gain = ctx.createGain();
          gain.gain.value = 0;
          ctx.createMediaElementSource(el).connect(gain).connect(ctx.destination);
        }
        if (ctx && ctx.state === "suspended") await ctx.resume();
        if (level === 0) setLevel(0);
        await el.play();
        playing = true;
        render();
        ramp(curVol(), 5500);                 // 아주 천천히 스며들듯 시작
      } catch (_) { /* 사용자 입력이 아직 없으면 실패 → 다음 입력 때 다시 시도 */ }
      finally { starting = false; }
    };
    const stop = async () => {
      want = false; save(); render();
      await ramp(0, 600);
      if (!want) { el.pause(); playing = false; render(); }
    };
    const toggle = () => { if (want) stop(); else { want = true; save(); render(); start(); } };

    btn.addEventListener("click", () => { if (want && !playing) start(); else toggle(); });

    // 첫 사용자 입력에서 시작 (버튼 자신을 누른 경우는 버튼 쪽에서 처리)
    const gestureStart = (e) => {
      if (e.target && e.target.closest && e.target.closest("#bgm-toggle")) return;
      start().then(() => {
        if (playing) ["click", "keydown", "pointerup", "touchend"].forEach((ev) => window.removeEventListener(ev, gestureStart, true));
      });
    };
    ["click", "keydown", "pointerup", "touchend"].forEach((ev) => window.addEventListener(ev, gestureStart, true));

    // 탭이 가려지면 멈추고, 돌아오면 이어서
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { wasPlaying = playing && want; if (wasPlaying) el.pause(); }
      else if (wasPlaying && want) { el.play().catch(() => {}); wasPlaying = false; }
    });

    /** 효과음이 울릴 때 잠깐 낮췄다가 되돌린다 */
    const duck = () => {
      if (!playing || !want) return;
      ramp(curVol() * 0.5, 160).then(() => setTimeout(() => { if (want) ramp(curVol(), 2200); }, 450));
    };

    /** 곡 바꾸기: 지금 곡이 서서히 사라지고 새 곡이 스며든다. 재생 중이 아니면(꺼 둔 경우 등) 다음 재생 때 그 곡으로 시작 */
    let switching = 0;
    const setTrack = async (name, outMs = 1400, inMs = 4000) => {
      if (!TRACKS[name] || name === trackName) return;
      trackName = name;
      const id = ++switching;
      if (!playing || !want) { el.src = TRACKS[name].src; return; }
      await ramp(0, outMs);
      if (id !== switching) return;
      el.src = TRACKS[name].src;
      try { await el.play(); } catch (_) { /* 재생이 막히면 다음 입력 때 */ }
      if (id === switching && want) ramp(curVol(), inMs);
    };

    render();                                  // 시작은 첫 사용자 입력에서 (그 전에는 브라우저가 막는다)
    /** 음악을 서서히 줄여 끈다 (켜짐/꺼짐 설정은 건드리지 않는다. 연출용) */
    const fadeOut = (ms) => { if (playing) return ramp(0, ms); };
    return { start, stop, toggle, duck, setTrack, fadeOut, track: () => trackName };
  })();
  window.RasyancutBgm = Bgm;

  // ── 열매 상호작용 ───────────────────────────────────────────
  // 열매 설명 데이터. (내용은 임시 문구)
  //   target: 입장 시 이동할 주소 (없으면 전환 연출만 재생)   locked: 아직 들어갈 곳이 없는 열매
  const FRUITS = {
    "01": {
      kicker: "FRUIT · 01",
      title: "라시안컷 : 뱅가드",
      desc: "라시안컷 : 뱅가드. 솔스티스가 관리하고 있는 성소다.",
      target: null,
      loading: "loading-4.webp",                 // 비슷한 색(연노랑)의 금빛 별
    },
  };
  // 열매 색과 비슷한 로딩 이미지 (입장할 때 그 이미지만 뜬다)
  const LOADING_OF = { "02": "loading-1.webp", "03": "loading-2.webp", "04": "loading-3.webp", "05": "loading-4.webp", "06": "loading-5.webp", "07": "loading-6.webp" };
  fruitList.slice(1).forEach((f) => {
    FRUITS[f.id] = { kicker: `FRUIT · ${f.id}`, title: `열매 ${f.id}`, desc: "아직 이야기가 정해지지 않은 열매입니다.", target: null, loading: LOADING_OF[f.id] };   // 입장할 곳은 아직 없어서 임시로 같은 맵으로 들어간다
  });
  FRUITS["02"].mapVariant = "red";                 // 붉은 열매: 더 큰 붉은 맵 (붉은 소용돌이·검붉은 기류·불안정한 틈)
  FRUITS["02"].title = "라시안컷 : 적월";
  FRUITS["02"].desc = "라시안컷 : 적월, 멸망을 직시하는 허무의 왕좌.";
  let CURRENT = "01";
  let active = fruitList[0];

  // 부드러운 스프링: 올리면 천천히 부풀며 살짝 튀어 오르고, 떼면 출렁이며 제자리로 (열매마다 따로 움직인다)
  const NS_ = "http://www.w3.org/2000/svg";
  const K = 64, C = 8.6;                       // 약한 강성·적당한 감쇠 → 느리고 부드러운 출렁임
  const makeFx = (node) => {
    const bounceG = node.querySelector(".bounce");
    const ripples = node.querySelector(".ripples");
    const sp = { s: 1, v: 0, y: 0, vy: 0, ts: 1, ty: 0, raf: 0, last: 0 };
    const render = () => { bounceG.style.transform = `translateY(${sp.y.toFixed(3)}px) scale(${sp.s.toFixed(4)})`; };
    const step = (now) => {
      const dt = Math.min(0.032, (now - sp.last) / 1000 || 0.016);
      sp.last = now;
      sp.v += (-K * (sp.s - sp.ts) - C * sp.v) * dt;
      sp.s += sp.v * dt;
      sp.vy += (-K * (sp.y - sp.ty) - C * sp.vy) * dt;
      sp.y += sp.vy * dt;
      render();
      const rest = Math.abs(sp.s - sp.ts) < 0.0004 && Math.abs(sp.v) < 0.004 &&
                   Math.abs(sp.y - sp.ty) < 0.01 && Math.abs(sp.vy) < 0.05;
      if (rest) { sp.s = sp.ts; sp.y = sp.ty; render(); sp.raf = 0; }
      else sp.raf = requestAnimationFrame(step);
    };
    const kick = (ts, ty, vs, vy) => {
      sp.ts = ts; sp.ty = ty; sp.v += vs; sp.vy += vy;
      if (reduced) { sp.s = ts; sp.y = ty; render(); return; }
      if (!sp.raf) { sp.last = performance.now(); sp.raf = requestAnimationFrame(step); }
    };
    // 파동: 커서가 올라가 있는 동안 일정 간격으로 퍼져 나감 (끝난 파동은 스스로 사라짐)
    const spawnRipple = () => {
      if (reduced) return;
      ["soft", ""].forEach((cls) => {
        const c = document.createElementNS(NS_, "circle");
        c.setAttribute("r", 22);
        c.setAttribute("class", cls ? "ripple " + cls : "ripple");
        c.addEventListener("animationend", () => c.remove());
        ripples.appendChild(c);
      });
    };
    let rippleTimer = 0;
    const startWaves = () => { if (rippleTimer) return; spawnRipple(); rippleTimer = setInterval(spawnRipple, 900); };
    const stopWaves = () => { clearInterval(rippleTimer); rippleTimer = 0; };
    return { kick, spawnRipple, startWaves, stopWaves,
             hoverIn() { kick(1.14, -2, 0.35, -26); startWaves(); },
             hoverOut() { kick(1, 0, -0.1, 8); stopWaves(); } };
  };

  // ── 카메라: viewBox 를 애니메이션해 열매 쪽으로 확대 ─────────────
  const stage = $("stage");
  const panel = $("panel");
  const sheetMQ = window.matchMedia("(max-width: 760px), (max-aspect-ratio: 1/1)");   // 모바일: 아래에서 올라오는 시트
  let FRUIT = { x: active.pos.x, y: active.pos.y };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const boxSize = () => { const r = svg.getBoundingClientRect(); return { W: r.width, H: r.height }; };
  const camFromVB = ([x, y, w, h]) => {
    const { W, H } = boxSize();
    return { s: Math.min(W / w, H / h), cx: x + w / 2, cy: y + h / 2 };
  };
  const applyCam = (c) => {
    const { W, H } = boxSize();
    const w = W / c.s, h = H / c.s;
    svg.setAttribute("viewBox", `${(c.cx - w / 2).toFixed(3)} ${(c.cy - h / 2).toFixed(3)} ${w.toFixed(3)} ${h.toFixed(3)}`);
  };
  /** 열매가 화면의 (px, py) 에 보이도록 하는 카메라 */
  const camFor = (s, px, py) => {
    const { W, H } = boxSize();
    return { s, cx: FRUIT.x - (px - W / 2) / s, cy: FRUIT.y - (py - H / 2) / s };
  };
  const zoomTarget = () => {
    const { W, H } = boxSize();
    const sheet = sheetMQ.matches;
    const diameter = Math.min(Math.min(W, H) * (sheet ? 0.34 : 0.36), 320);
    const s = diameter / (44 * FRUIT_SCALE);                  // 링 지름 = 44 단위 × 열매 크기
    return sheet ? { s, px: W * 0.5, py: H * 0.27 } : { s, px: W * 0.31, py: H * 0.5 };
  };
  const screenOf = (c) => {
    const { W, H } = boxSize();
    return { px: (FRUIT.x - c.cx) * c.s + W / 2, py: (FRUIT.y - c.cy) * c.s + H / 2 };
  };

  let camRaf = 0;
  /** 현재 카메라 → 목표 카메라. 열매의 화면 위치는 직선, 배율은 지수적으로 보간해 매끄럽게 */
  const flyTo = (target, ms) => new Promise((resolve) => {
    cancelAnimationFrame(camRaf);
    const from = camFromVB(svg.getAttribute("viewBox").split(" ").map(Number));
    const p0 = screenOf(from);
    const p1 = screenOf(target);
    if (reduced || ms <= 0) { applyCam(target); resolve(); return; }
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      const e = ease(t);
      const s = from.s * Math.pow(target.s / from.s, e);
      const px = p0.px + (p1.px - p0.px) * e;
      const py = p0.py + (p1.py - p0.py) * e;
      applyCam(camFor(s, px, py));
      if (t < 1) camRaf = requestAnimationFrame(tick);
      else { applyCam(target); resolve(); }
    };
    camRaf = requestAnimationFrame(tick);
  });

  // ── 설명창 ─────────────────────────────────────────────────
  const el = { kicker: $("panel-kicker"), title: $("panel-title"), desc: $("panel-desc"),
               enter: $("btn-enter"), back: $("btn-back"), close: $("panel-close") };
  const typeInto = (node, text, perChar) => new Promise((resolve) => {
    node.textContent = "";
    node.dataset.cancel = "0";
    if (reduced) { node.textContent = text; resolve(); return; }
    const t0 = performance.now();
    const tick = (now) => {
      if (node.dataset.cancel === "1") { resolve(); return; }
      const n = Math.min(text.length, Math.floor((now - t0) / perChar));
      node.textContent = text.slice(0, n);
      if (n < text.length) requestAnimationFrame(tick); else resolve();
    };
    requestAnimationFrame(tick);
  });
  let fillId = 0;
  const cancelTyping = () => {
    fillId++;
    [el.kicker, el.title, el.desc].forEach((n) => { n.dataset.cancel = "1"; });
  };
  const fillPanel = () => {
    const f = FRUITS[CURRENT];
    const id = ++fillId;
    [el.kicker, el.title, el.desc].forEach((n) => { n.dataset.cancel = "0"; n.textContent = ""; });
    const later = (ms, fn) => setTimeout(() => { if (id === fillId) fn(); }, reduced ? 0 : ms);
    later(0,   () => typeInto(el.kicker, f.kicker, 28));
    later(220, () => typeInto(el.title, f.title, 70));
    later(520, () => typeInto(el.desc, f.desc, 16));
  };

  let busyCam = false;
  /** 설명창을 열매의 색으로 물들인다 */
  const themePanel = (f) => {
    const L = FRUITS[f.id];
    panel.style.setProperty("--neon", f.pal.c1);
    panel.style.setProperty("--neon-soft", f.pal.c2);
    panel.style.setProperty("--neon-rgb", hex2rgb(f.pal.c1).join(", "));
    panel.style.setProperty("--neon-soft-rgb", hex2rgb(f.pal.c2).join(", "));
    el.enter.disabled = !!L.locked;
    el.enter.querySelector(".btn-label").textContent = L.locked ? "준비 중" : "입장";
  };

  const openFruit = async (f) => {
    if (camMode !== "idle" || busyCam) return;
    busyCam = true;
    active = f; CURRENT = f.id; FRUIT = { x: f.pos.x, y: f.pos.y };
    fruitList.forEach((o) => o.unit.classList.toggle("active", o === f));
    themePanel(f);
    camMode = "zooming";
    Sfx.play();                                   // 화면이 열매 안으로 빨려 들어가는 소리 (확대 연출 1.5초에 맞춰 도착할 때 울림)
    Bgm.duck();                                   // 배경음악을 잠깐 낮춰 효과음이 돋보이게
    stage.classList.add("lite", "zoomed", "zooming");   // lite: 확대 중에는 가벼운 나무로 교체
    active.fx.startWaves();
    const tgt = zoomTarget();
    const done = flyTo(camFor(tgt.s, tgt.px, tgt.py), 1500);
    // 확대가 어느 정도 진행되면 설명창이 나타난다
    await wait(780);
    panel.removeAttribute("inert");
    panel.setAttribute("aria-hidden", "false");
    panel.classList.add("open");
    fillPanel();
    await done;
    stage.classList.remove("zooming");
    stage.classList.add("deep");                  // 확대가 끝나면 나무는 완전히 숨겨 부드럽게 유지
    camMode = "open";
    busyCam = false;
    (el.enter.disabled ? el.close : el.enter).focus({ preventScroll: true });
  };

  const closeFruit = async () => {
    if (camMode !== "open" || busyCam) return;
    busyCam = true;
    cancelTyping();
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    panel.setAttribute("inert", "");
    stage.classList.remove("deep");
    const lite = $("tree-lite");                  // 되돌아올 때 단순 나무가 서서히 나타나도록
    lite.style.transition = "none";
    lite.style.opacity = "0";
    void stage.offsetWidth;
    lite.style.transition = "opacity 1s ease";
    lite.style.opacity = "";
    setTimeout(() => { lite.style.transition = ""; }, 1100);
    stage.classList.remove("zoomed");
    stage.classList.add("zooming");
    active.fx.stopWaves();
    camMode = "zooming";
    const b = camFromVB(baseVB());
    await flyTo(b, 1250);
    camMode = "idle";
    stage.classList.remove("zooming");
    fitView();
    // 단순 나무 → 원래 나무로 부드럽게 교체
    const body = $("tree-body");
    body.style.transition = "none";
    body.style.opacity = "0";
    stage.classList.remove("lite");
    void body.getBoundingClientRect();
    body.style.transition = "opacity .7s ease";
    body.style.opacity = "";
    setTimeout(() => { body.style.transition = ""; }, 800);
    busyCam = false;
    fruitList.forEach((o) => o.unit.classList.remove("active"));
    active.node.focus({ preventScroll: true });
  };

  const onResizeOpen = () => {
    const tgt = zoomTarget();
    applyCam(camFor(tgt.s, tgt.px, tgt.py));
  };

  fruitList.forEach((f) => {
    const node = f.node, fx = (f.fx = makeFx(node));
    node.addEventListener("pointerenter", fx.hoverIn);
    node.addEventListener("pointerleave", fx.hoverOut);
    node.addEventListener("focus", () => { if (node.matches(":focus-visible")) fx.hoverIn(); });
    node.addEventListener("blur", fx.hoverOut);
    node.addEventListener("pointerdown", () => { if (camMode === "idle") { fx.kick(0.96, 1, -0.3, 10); fx.spawnRipple(); } });
    node.addEventListener("pointerup", () => { if (camMode === "idle") fx.kick(1.14, -2, 0.2, -14); });
    node.addEventListener("click", () => openFruit(f));
    node.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFruit(f); }
    });
  });
  el.close.addEventListener("click", closeFruit);
  el.back.addEventListener("click", closeFruit);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.body.classList.contains("map-open")) { const ex = document.getElementById("map-exit"); if (ex) ex.click(); return; }   // 맵에서는 Esc 로 나가기
    closeFruit();
  });
  // 창 바깥(빈 곳)을 눌러도 닫힌다
  stage.addEventListener("click", (e) => {
    if (camMode === "open" && !panel.contains(e.target) && !e.target.closest(".fruit")) closeFruit();
  });
  // 입장: 로딩 화면(무작위 이미지, 오른쪽 아래 로딩 표시)이 페이드인 → 라시안컷 맵 준비 → 페이드아웃
  const MapView = window.RasyancutMap, Loading = window.RasyancutLoading;
  el.enter.addEventListener("click", async () => {
    const target = FRUITS[CURRENT].target;
    if (FRUITS[CURRENT].locked) return;
    if (target) { Transition.play(() => { window.location.href = target; }); return; }   // 주소가 정해진 열매는 그대로 이동
    if (!MapView || !Loading || Loading.isBusy()) return;
    Bgm.setTrack(FRUITS[CURRENT].bgm || "vanguard");      // 입장하면 맵의 음악으로 (뱅가드·적월 모두 뱅가드 곡. 열매에 bgm 을 지정하면 그 곡)
    MapView.setVariant(FRUITS[CURRENT].mapVariant || "vanguard");      // 열매에 따라 열 맵을 고른다
    await Loading.run(async () => {
      await MapView.prepare();
      return { ready: () => MapView.show() };
    }, { file: FRUITS[CURRENT].loading });
    const ex = document.getElementById("map-exit");
    if (ex) ex.focus({ preventScroll: true });
  });
  // 맵에서 나오기: 입장할 때와 같은 로딩 화면(같은 열매의 이미지)이 뜨고, 그 아래에서 맵이 닫혀 열매 설명창으로 복귀
  const mapExit = document.getElementById("map-exit");
  if (mapExit) mapExit.addEventListener("click", async () => {
    if (!MapView || !Loading || Loading.isBusy() || (MapView.isLocked && MapView.isLocked())) return;
    Bgm.setTrack("main");                         // 나오면 원래 음악으로
    await Loading.run(async () => ({ ready: () => MapView.hide() }), { file: FRUITS[CURRENT].loading });
    el.enter.focus({ preventScroll: true });
  });
})();
