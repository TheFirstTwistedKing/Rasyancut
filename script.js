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

  // ── 열매: 오른쪽 긴 가지 끝쪽 아랫면에서 늘어뜨림 ────────────
  const S = { x: D.fruit.stemX, y: D.fruit.stemY };
  const F = { x: S.x + 4, y: S.y + 62 };
  $("fruit").setAttribute("transform", `translate(${F.x} ${F.y})`);

  const stemD = `M${S.x} ${S.y - 3} C${S.x + 1} ${S.y + 26} ${F.x + 6} ${F.y - 46} ${F.x} ${F.y - 22}`;
  const stem = $("stem");
  [
    ["#eeff6b", 5, ".45", "url(#glow-soft)"],
    ["#f4ff86", 2.4, "1", null],
    ["#fbffc8", 1.5, "1", null],
    ["#ffffff", .7, "1", null],
  ].forEach(([stroke, w, op, filter]) => {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", stemD);
    p.setAttribute("stroke", stroke);
    p.setAttribute("stroke-width", w);
    p.setAttribute("opacity", op);
    if (filter) p.setAttribute("filter", filter);
    stem.appendChild(p);
  });

  // 열매 주변에 떠오르는 빛 알갱이
  const dust = document.querySelector(".dust");
  for (let i = 0; i < 9; i++) {
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

  // ── 세로로 긴 화면(모바일): 오른쪽 열매의 빛이 잘리지 않게 시야를 넓힌다 ──
  const svg = $("tree");
  const baseVB = () => (window.innerWidth / window.innerHeight < 0.8
    ? [-24, -30, 724, 870] : [10, -30, 660, 870]);
  const fitView = () => {
    if (camMode !== "idle") return;
    svg.setAttribute("viewBox", baseVB().join(" "));
  };
  let camMode = "idle";          // idle | zooming | open
  fitView();
  window.addEventListener("resize", () => { fitView(); if (camMode === "open") onResizeOpen(); });

  // ── 등장: 뿌리에서 가지 끝까지 자라듯 드러남 ────────────────
  const VIEW_TOP = -30, VIEW_H = 870;
  const revealRect = $("reveal-rect");
  const front = $("reveal-front");
  const travel = VIEW_H * 1.12;                  // 페더 끝이 화면 위로 완전히 빠지는 거리
  const frontStartY = VIEW_TOP + VIEW_H + 52;       // 페더 띠의 중앙

  const label = $("trunk-label");
  const fruitGroup = $("fruit-group");

  const finish = () => {
    $("tree-body").removeAttribute("mask");        // 등장이 끝나면 마스크는 필요 없다(렌더 비용 절감)
    revealRect.setAttribute("y", VIEW_TOP - travel);
    front.setAttribute("opacity", 0);
    label.classList.add("on");
    fruitGroup.classList.add("on");
  };

  if (reduced) {
    finish();
  } else {
    const DUR = 3400;
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const t0 = performance.now();
    let labelOn = false, fruitOn = false;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / DUR);
      const e = ease(t);
      revealRect.setAttribute("y", VIEW_TOP - travel * e);
      front.setAttribute("y", frontStartY - travel * e);
      front.setAttribute("opacity", t < 0.04 ? t / 0.04 : t > 0.93 ? (1 - t) / 0.07 : 1);
      if (!labelOn && t > 0.55) { label.classList.add("on"); labelOn = true; }
      if (!fruitOn && t > 0.82) { fruitGroup.classList.add("on"); fruitOn = true; }
      if (t < 1) requestAnimationFrame(tick); else finish();
    };
    revealRect.setAttribute("y", VIEW_TOP);
    requestAnimationFrame(tick);
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
    const URL_ = "assets/sfx/relic-awaken.wav?v=3";   // 소리를 바꾸면 v 숫자를 올려 캐시를 갱신
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
    return { play, unlock };
  })();
  window.RasyancutSfx = Sfx;               // 이후 화면에서도 같은 소리를 재사용

  // ── 배경음악 ───────────────────────────────────────────────
  // 브라우저는 사용자의 첫 클릭/키 입력 전에는 소리를 낼 수 없다.
  // 그래서 첫 입력 때 서서히 커지며 시작하고, 오른쪽 위 버튼으로 끄고 켤 수 있다. (선택은 기억됨)
  const Bgm = (() => {
    const SRC = "assets/audio/bgm.mp3";
    const VOL = 0.2;                           // 밑바탕에 깔리는 정도 (효과음 0.8 대비 약 -12dB). 더 크게/작게는 이 값만 바꾼다
    const KEY = "rasyancut.bgm";
    const el = new Audio(SRC);
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
        ramp(VOL, 5500);                      // 아주 천천히 스며들듯 시작
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
      ramp(VOL * 0.5, 160).then(() => setTimeout(() => { if (want) ramp(VOL, 2200); }, 450));
    };

    render();                                  // 시작은 첫 사용자 입력에서 (그 전에는 브라우저가 막는다)
    return { start, stop, toggle, duck };
  })();
  window.RasyancutBgm = Bgm;

  // ── 열매 상호작용 ───────────────────────────────────────────
  const fruit = $("fruit");

  // 열매 설명 데이터. 열매가 늘어나면 항목을 추가한다. (내용은 임시 문구)
  //   target: 입장 시 이동할 주소 (없으면 전환 연출만 재생)
  const FRUITS = {
    "01": {
      kicker: "FRUIT · 01",
      title: "라시안컷 : 뱅가드",
      desc: "라시안컷 : 뱅가드. 솔스티스가 관리하고 있는 성소다.",
      target: null,
    },
  };
  const CURRENT = "01";

  // 부드러운 스프링: 올리면 천천히 부풀며 살짝 튀어 오르고, 떼면 출렁이며 제자리로
  const bounceG = fruit.querySelector(".bounce");
  const ripples = fruit.querySelector(".ripples");
  const sp = { s: 1, v: 0, y: 0, vy: 0, ts: 1, ty: 0, raf: 0, last: 0 };
  const K = 64, C = 8.6;                       // 약한 강성·적당한 감쇠 → 느리고 부드러운 출렁임

  const render = () => {
    bounceG.style.transform = `translateY(${sp.y.toFixed(3)}px) scale(${sp.s.toFixed(4)})`;
  };
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
  const NS_ = "http://www.w3.org/2000/svg";
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
  const startWaves = () => {
    if (rippleTimer) return;
    spawnRipple();
    rippleTimer = setInterval(spawnRipple, 900);
  };
  const stopWaves = () => { clearInterval(rippleTimer); rippleTimer = 0; };

  const hoverIn = () => { kick(1.14, -2, 0.35, -26); startWaves(); };
  const hoverOut = () => { kick(1, 0, -0.1, 8); stopWaves(); };
  fruit.addEventListener("pointerenter", hoverIn);
  fruit.addEventListener("pointerleave", hoverOut);
  fruit.addEventListener("focus", () => { if (fruit.matches(":focus-visible")) hoverIn(); });
  fruit.addEventListener("blur", hoverOut);
  fruit.addEventListener("pointerdown", () => { if (camMode === "idle") { kick(0.96, 1, -0.3, 10); spawnRipple(); } });
  fruit.addEventListener("pointerup", () => { if (camMode === "idle") kick(1.14, -2, 0.2, -14); });

  // ── 카메라: viewBox 를 애니메이션해 열매 쪽으로 확대 ─────────────
  const stage = $("stage");
  const panel = $("panel");
  const sheetMQ = window.matchMedia("(max-width: 760px), (max-aspect-ratio: 1/1)");   // 모바일: 아래에서 올라오는 시트
  const FRUIT = { x: F.x, y: F.y };
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
    const s = diameter / 44;                                  // 링 지름 = 44 단위
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
  const openFruit = async () => {
    if (camMode !== "idle" || busyCam) return;
    busyCam = true;
    camMode = "zooming";
    Sfx.play();                                   // 유물이 깨어나는 소리
    Bgm.duck();                                   // 배경음악을 잠깐 낮춰 효과음이 돋보이게
    stage.classList.add("lite", "zoomed", "zooming");   // lite: 확대 중에는 가벼운 나무로 교체
    startWaves();
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
    el.enter.focus({ preventScroll: true });
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
    stopWaves();
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
    fruit.focus({ preventScroll: true });
  };

  const onResizeOpen = () => {
    const tgt = zoomTarget();
    applyCam(camFor(tgt.s, tgt.px, tgt.py));
  };

  fruit.addEventListener("click", openFruit);
  fruit.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFruit(); }
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
    if (camMode === "open" && !panel.contains(e.target) && !fruit.contains(e.target)) closeFruit();
  });
  // 입장: 로딩 화면(무작위 이미지, 오른쪽 아래 로딩 표시)이 페이드인 → 라시안컷 맵 준비 → 페이드아웃
  const MapView = window.RasyancutMap, Loading = window.RasyancutLoading;
  el.enter.addEventListener("click", async () => {
    const target = FRUITS[CURRENT].target;
    if (target) { Transition.play(() => { window.location.href = target; }); return; }   // 주소가 정해진 열매는 그대로 이동
    if (!MapView || !Loading || Loading.isBusy()) return;
    await Loading.run(async () => {
      await MapView.prepare();
      return { ready: () => MapView.show() };
    });
    const ex = document.getElementById("map-exit");
    if (ex) ex.focus({ preventScroll: true });
  });
  // 맵에서 나오기: 기존 전환 연출(슬랫 + 아이콘) 후 열매 설명창으로 복귀
  const mapExit = document.getElementById("map-exit");
  if (mapExit) mapExit.addEventListener("click", () => {
    Transition.play(() => { MapView.hide(); });
    setTimeout(() => el.enter.focus({ preventScroll: true }), 1800);
  });
})();
