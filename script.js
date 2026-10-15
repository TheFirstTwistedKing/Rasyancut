(() => {
  "use strict";

  const D = window.TREE_DATA;
  const $ = (id) => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!D) return;

  // ── 나무 데이터 주입 ─────────────────────────────────────────
  $("tree-outline").setAttribute("d", D.outline);
  $("tree-bark").setAttribute("d", D.bark);
  $("tree-knots").setAttribute("d", D.knots);

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
  const fitView = () => {
    const tall = window.innerWidth / window.innerHeight < 0.8;
    svg.setAttribute("viewBox", tall ? "-24 -30 724 870" : "10 -30 660 870");
  };
  fitView();
  window.addEventListener("resize", fitView);

  // ── 등장: 뿌리에서 가지 끝까지 자라듯 드러남 ────────────────
  const VIEW_TOP = -30, VIEW_H = 870;
  const revealRect = $("reveal-rect");
  const front = $("reveal-front");
  const travel = VIEW_H * 1.12;                  // 페더 끝이 화면 위로 완전히 빠지는 거리
  const frontStartY = VIEW_TOP + VIEW_H + 52;       // 페더 띠의 중앙

  const label = $("trunk-label");
  const fruitGroup = $("fruit-group");

  const finish = () => {
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

  // ── 열매 상호작용 ───────────────────────────────────────────
  const fruit = $("fruit");
  const activate = () => {
    // 이동할 화면이 정해지면 data-target 에 주소를 넣으면 된다.
    const target = fruit.dataset.target;
    Transition.play(() => { if (target) window.location.href = target; });
  };
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
  fruit.addEventListener("focus", hoverIn);
  fruit.addEventListener("blur", hoverOut);
  fruit.addEventListener("pointerdown", () => { kick(0.96, 1, -0.3, 10); spawnRipple(); });
  fruit.addEventListener("pointerup", () => kick(1.14, -2, 0.2, -14));

  fruit.addEventListener("click", activate);
  fruit.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(); }
  });
})();
