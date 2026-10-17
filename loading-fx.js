/* 로딩 화면 이미지 효과 (WebGL2 프래그먼트 셰이더)
 *
 *  window.RasyancutLoadingFx.start(img, mode, variant) → 효과를 켰으면 true (img 대신 캔버스에 그림)
 *  window.RasyancutLoadingFx.stop()
 *
 *  mode 1 : 검붉은 연기·구름이 옆으로 퍼지며 일식을 살짝 가린다
 *  mode 2 : 이글거리는 태양 (variant 0 = 태양, 1 = 금빛 별)
 *  mode 3 : 푸른빛이 번지고 퍼져 나간다
 *  mode 5 : 보랏빛으로 부패해 가는 문양
 *  mode 6 : 흰 테두리 뒤에서 커다란 빛이 발광한다
 *
 *  이미지는 mip 체인으로 올려서 textureLod 로 번짐(블룸)을 싸게 만든다.
 *  WebGL2 를 못 쓰거나 텍스처 업로드가 막히면(file:// 등) false 를 돌려주고, 호출한 쪽이 CSS 효과로 대신한다.
 */
(() => {
  "use strict";

  const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

  const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform vec2 uCenter;      // 이미지 중심 (캔버스 픽셀, 아래쪽 기준)
uniform vec2 uSize;        // 이미지 표시 크기 (캔버스 픽셀)
uniform float uT;          // 초
uniform float uVar;
uniform vec2 uTexSize;
out vec4 oc;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
const mat2 ROT = mat2(0.8, -0.6, 0.6, 0.8);
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vn(p); p = ROT * p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
float fbm3(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++) { s += a * vn(p); p = ROT * p * 2.02 + vec2(1.7, 9.2); a *= 0.5; }
  return s;
}
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }

const float PAD = 0.35;                      // 텍스처에 둘러 둔 투명 여백 (이미지 크기 대비, 한쪽)
vec2 gAsp;                                   // 이미지 크기 / 긴 변
vec2 p2uv(vec2 p) { return vec2(p.x / gAsp.x, -p.y / gAsp.y) / (1.0 + 2.0 * PAD) + 0.5; }
vec4 T(vec2 uv, float lod) {
  vec2 e = smoothstep(vec2(0.0), vec2(0.02), uv) * smoothstep(vec2(0.0), vec2(0.02), 1.0 - uv);
  vec4 c;
  if (lod < 3.5) {
    c = textureLod(uTex, uv, lod);
  } else {
    // 낮은 해상도 mip 는 쌍선형만으로는 네모난 블록이 보여서, 비스듬히 어긋난 네 점을 평균한다
    vec2 o = 0.85 * exp2(lod) / uTexSize;
    c = 0.25 * (textureLod(uTex, uv + vec2(o.x, o.y * 0.4), lod) + textureLod(uTex, uv + vec2(-o.x * 0.4, o.y), lod)
              + textureLod(uTex, uv + vec2(-o.x, -o.y * 0.4), lod) + textureLod(uTex, uv + vec2(o.x * 0.4, -o.y), lod));
  }
  return c * e.x * e.y;
}

// 떠다니는 알갱이 (불씨 · 먼지 · 포자)
float motes(vec2 p, float scale, vec2 vel, float seed) {
  vec2 g = p * scale + vel * uT;
  vec2 id = floor(g), f = fract(g) - 0.5;
  float h = hash(id + seed);
  vec2 off = (vec2(hash(id + seed + 1.7), hash(id + seed + 3.1)) - 0.5) * 0.55;
  off += vec2(sin(uT * 1.3 + h * 6.28) * 0.12, cos(uT * 1.1 + h * 9.0) * 0.08);
  float d = length(f - off);
  float tw = 0.5 + 0.5 * sin(uT * (2.0 + h * 3.0) + h * 40.0);
  return step(0.80, h) * (1.0 - smoothstep(0.0, 0.075, d)) * tw;
}

// ── 1. 검붉은 연기와 구름 ─────────────────────────────────────────────
vec3 fx1(vec2 p, vec2 uv, float g) {
  vec2 w = vec2(fbm3(p * 3.0 + vec2(0.0, uT * 0.05)), fbm3(p * 3.0 + vec2(5.2, 1.3) - uT * 0.04)) - 0.5;
  vec3 col = T(uv + w * 0.012, 0.0).rgb;
  col += T(uv, 3.0).rgb * (0.30 + 0.12 * sin(uT * 1.3));
  float spread = smoothstep(0.0, 4.5, uT);
  float lit = exp(-length(p) * 1.7);
  float ax = abs(p.x);
  for (int i = 2; i >= 0; i--) {
    float fi = float(i);
    float sc = 1.5 + fi * 0.8;
    float sp = 0.03 + fi * 0.028;
    float env = exp(-pow(ax / (0.26 + 0.62 * spread + 0.14 * fi), 1.7))
              * exp(-pow(abs(p.y) / (0.14 + 0.06 * fi + 0.05 * spread), 2.0));
    if (env < 0.012) continue;
    vec2 q = vec2(ax * sc - uT * sp * (1.0 + 1.2 * spread), p.y * sc * 1.7 + fi * 7.3);
    float lightD = 0.5;
    if (i < 2) {
      vec2 wq = vec2(fbm3(q * 0.9 + vec2(0.0, uT * 0.03)), fbm3(q * 0.9 + vec2(9.1, -uT * 0.025)));
      q += 1.8 * (wq - 0.5);
    }
    float d = fbm(q);
    if (i < 2) lightD = fbm3(q + vec2(0.16, -0.13));
    float dens = smoothstep(0.30, 0.72, d) * env;
    float light = clamp((d - lightD) * 3.5 + 0.5, 0.0, 1.0);
    vec3 dark = vec3(0.022, 0.0, 0.004);
    vec3 smokeCol = mix(dark, vec3(0.62, 0.07, 0.06), clamp(lit * 1.6, 0.0, 1.0) * (0.30 + 0.70 * light))
                  + vec3(0.26, 0.12, 0.11) * light * (0.35 + 0.65 * lit);
    col = mix(col, smokeCol, dens * 0.85 * g);
    col += vec3(0.50, 0.04, 0.04) * dens * lit * 0.32 * g;
  }
  return col;
}

// ── 2. 이글거리는 태양 / 금빛 별 ───────────────────────────────────────
vec3 fx2(vec2 p, vec2 uv, float g) {
  float V = uVar;
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  float breath = 1.0 + 0.10 * sin(uT * 2.2) + 0.12 * (fbm3(vec2(uT * 1.1, 3.0)) - 0.5);
  vec2 sh = vec2(fbm3(p * 6.0 + vec2(0.0, -uT * 1.1)), fbm3(p * 6.0 + vec2(4.1, -uT * 0.9) + 7.0)) - 0.5;
  vec4 im = T(uv + sh * 0.014 * (1.0 + V), 0.0);
  vec3 tA = mix(vec3(1.0, 0.78, 0.32), vec3(1.0, 0.88, 0.50), V);
  vec3 tB = mix(vec3(1.0, 0.24, 0.02), vec3(1.0, 0.58, 0.10), V);
  vec3 col = im.rgb * (0.94 + 0.2 * (breath - 1.0) * 3.0);
  col += T(uv, 2.5).rgb * tA * 0.34 * breath;
  col += T(uv, 4.5).rgb * tB * 0.85 * breath;
  col += T(uv, 6.0).rgb * tB * 1.00;
  // 실루엣이 바깥으로 번져 타오르는 불꽃 혀
  float n = 0.62 * fbm(dir * 6.0 + vec2(r * 4.5 - uT * 1.5, 0.0)) + 0.38 * fbm3(dir * 13.0 + vec2(r * 7.0 - uT * 2.3, 5.0));
  float reach = mix(0.090, 0.115, V) * (1.0 + 0.25 * sin(uT * 1.7));
  vec3 fl = vec3(0.0);
  for (int i = 1; i <= 10; i++) {
    float s = float(i) / 10.0;
    float len = reach * s * (0.25 + 1.7 * n);
    vec4 sm = T(p2uv(p - dir * len), 1.0);
    fl += mix(tA, tB, s) * sm.a * (1.0 - s) * 0.24;
  }
  col += fl * (1.0 - im.a * 0.85) * g;
  // 불씨
  float e = motes(p, 9.0, vec2(0.0, -0.9), 1.0) + 0.7 * motes(p, 17.0, vec2(0.15, -1.4), 7.0);
  col += mix(vec3(1.0, 0.6, 0.15), vec3(1.0, 0.85, 0.4), V) * e * exp(-r * 1.6) * 1.4 * g;
  return col;
}

// ── 3. 푸른빛이 퍼진다 ────────────────────────────────────────────────
vec3 fx3(vec2 p, vec2 uv, float g) {
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  float grow = smoothstep(0.0, 2.2, uT);
  float br = 1.0 + 0.14 * sin(uT * 1.7) + 0.08 * sin(uT * 2.9 + 1.0);
  vec4 im = T(uv, 0.0);
  vec3 col = im.rgb * (0.92 + 0.08 * br);
  col += T(uv, 2.0).rgb * vec3(0.30, 0.55, 1.0) * 0.28 * br;
  col += T(uv, 4.0).rgb * vec3(0.10, 0.40, 1.0) * 0.75 * br * grow;
  col += T(uv, 5.8).rgb * vec3(0.05, 0.25, 1.0) * 1.35 * br * grow;
  // 빛줄기
  vec2 rd = rot(dir, uT * 0.04);
  float shaft = fbm(rd * 2.6 + vec2(uT * 0.05, 0.0));
  shaft = pow(smoothstep(0.35, 0.85, shaft), 2.0);
  col += vec3(0.15, 0.45, 1.0) * shaft * exp(-max(r - 0.28, 0.0) * 3.2) * smoothstep(0.1, 0.3, r) * 0.55 * grow * g;
  // 바깥으로 번지는 푸른 안개
  float mist = smoothstep(0.30, 0.82, fbm(dir * 2.2 + vec2(r * 3.0 - uT * 0.22, uT * 0.02)));
  col += vec3(0.08, 0.30, 0.90) * mist * exp(-r * 2.6) * 0.55 * grow * g;
  // 퍼져 나가는 빛의 물결
  for (int k = 0; k < 2; k++) {
    float ph = fract(uT * 0.17 + float(k) * 0.5);
    float rr = 0.40 + ph * 0.62;
    float amp = (1.0 - ph) * (1.0 - ph) * smoothstep(0.0, 0.1, ph);
    float ring = exp(-pow(abs((r - rr) / (0.04 + 0.07 * ph)), 2.0));
    col += vec3(0.25, 0.60, 1.0) * ring * amp * 0.55 * (0.55 + 0.45 * fbm3(dir * 4.0 + uT * 0.1)) * g;
  }
  float e = motes(p, 11.0, vec2(0.0, -0.35), 2.0) + 0.6 * motes(p, 20.0, vec2(0.05, -0.55), 9.0);
  col += vec3(0.55, 0.82, 1.0) * e * exp(-r * 1.4) * 1.2 * g;
  return col;
}

// ── 5. 보랏빛 부패 ────────────────────────────────────────────────────
vec3 fx5(vec2 p, vec2 uv, float g) {
  float r = length(p);
  float decay = 0.30 + 0.55 * smoothstep(0.0, 6.0, uT) + 0.05 * sin(uT * 0.9);
  float drip = fbm3(vec2(p.x * 9.0, uT * 0.04)) * decay * 0.05;
  vec2 uvd = uv - vec2(0.0, drip * smoothstep(-0.2, 0.3, -p.y + 0.15));
  vec4 im = T(uvd, 0.0);
  float dens = T(uv, 3.0).a;
  float near = smoothstep(0.01, 0.10, T(uv, 2.5).a);
  float n1 = fbm(uv * 7.0 + vec2(0.0, uT * 0.03));
  float n2 = fbm3(uv * 19.0 + vec2(3.1, -uT * 0.05));
  float keep = n1 * 0.72 + n2 * 0.28 + dens * 0.62;
  float th = 0.40 + 0.30 * decay;
  float m = smoothstep(th - 0.025, th + 0.025, keep);
  float front = (1.0 - smoothstep(0.0, 0.075, abs(keep - th))) * near;
  vec3 col = im.rgb * m;
  // 썩은 얼룩
  float blot = fbm(uv * 10.0 + vec2(uT * 0.02, 4.0));
  col = mix(col, col * vec3(0.55, 0.30, 0.78) * 0.85, smoothstep(0.38, 0.72, blot) * decay * m);
  // 부패 경계에서 번지는 독성 보라빛
  col += front * vec3(0.70, 0.14, 1.0) * 1.25 * g;
  col += T(uv, 3.5).rgb * vec3(0.55, 0.15, 0.95) * (0.35 + 0.1 * sin(uT * 1.4)) * g;
  // 퍼지는 독기(안개)
  float haze = smoothstep(0.30, 0.80, fbm(p * 2.8 + vec2(uT * 0.05, -uT * 0.07)));
  col += vec3(0.30, 0.07, 0.50) * haze * T(uv, 5.5).a * 0.9 * g;
  // 위로 올라가는 포자, 아래로 떨어지는 재
  float sp = motes(p, 10.0, vec2(0.0, -0.25), 3.0) + 0.6 * motes(p, 19.0, vec2(0.04, -0.4), 11.0);
  float ash = motes(p, 8.0, vec2(0.02, 0.35), 5.0);
  col += vec3(0.75, 0.35, 1.0) * sp * exp(-r * 1.3) * 1.1 * g;
  col += vec3(0.28, 0.10, 0.40) * ash * exp(-r * 1.1) * 1.2 * g;
  return col;
}

// ── 6. 흰 테두리 뒤의 커다란 발광 ──────────────────────────────────────
vec3 fx6(vec2 p, vec2 uv, float g) {
  float r = length(p);
  vec2 dir = p / max(r, 1e-4);
  float grow = smoothstep(0.0, 2.0, uT);
  float br = 1.0 + 0.16 * sin(uT * 1.5) + 0.09 * sin(uT * 2.7 + 2.0) + 0.10 * (fbm3(vec2(uT * 0.8, 1.0)) - 0.5);
  vec4 im = T(uv, 0.0);
  float a1 = T(uv, 2.5).a, a2 = T(uv, 4.5).a, a3 = T(uv, 6.0).a;
  float glow = (a1 * 0.40 + a2 * 0.80 + a3 * 1.10) * br * (0.4 + 0.6 * grow);
  float r1 = fbm(rot(dir, uT * 0.07) * 3.0 + vec2(uT * 0.08, 0.0));
  float r2 = fbm(rot(dir, -uT * 0.05) * 6.5 + vec2(5.0, uT * 0.1));
  float rays = pow(smoothstep(0.30, 0.90, r1), 2.2) * 0.9 + pow(smoothstep(0.35, 0.90, r2), 2.0) * 0.5;
  glow += rays * exp(-r * 1.7) * smoothstep(0.05, 0.35, r) * br * grow * 0.9;
  vec3 lightCol = mix(vec3(1.0, 0.96, 0.88), vec3(0.80, 0.90, 1.0), smoothstep(0.2, 0.9, r));
  vec3 col = im.rgb + lightCol * glow * (1.0 - im.a);
  col += lightCol * glow * 0.14 * im.a;
  float e = motes(p, 12.0, vec2(0.0, -0.18), 4.0) + 0.6 * motes(p, 22.0, vec2(0.03, -0.3), 13.0);
  col += vec3(1.0, 0.97, 0.90) * e * exp(-r * 1.2) * 1.0 * g * grow;
  return col;
}

void main() {
  float L = max(uSize.x, uSize.y);
  gAsp = uSize / L;
  vec2 p = (gl_FragCoord.xy - uCenter) / L;
  vec2 uv = p2uv(p);
  float g = smoothstep(0.0, 1.3, uT);
  vec3 col;
#if MODE == 1
  col = fx1(p, uv, g);
#elif MODE == 2
  col = fx2(p, uv, g);
#elif MODE == 3
  col = fx3(p, uv, g);
#elif MODE == 5
  col = fx5(p, uv, g);
#else
  col = fx6(p, uv, g);
#endif
  // 부드러운 어깨(1 넘는 부분만 눌러 준다) + 디더
  vec3 hi = max(col - 0.8, 0.0);
  col = min(col, 0.8) + 0.2 * (1.0 - exp(-hi * 5.0));
  col += (hash(gl_FragCoord.xy + fract(uT)) - 0.5) / 255.0;
  oc = vec4(max(col, 0.0), 1.0);
}`;

  let gl = null, canvas = null, buf = null, tex = null;
  const progs = {};
  let raf = 0, cur = null, t0 = 0, frozen = null;

  function ensure() {
    canvas = document.getElementById("loading-fx");
    if (!canvas) return false;
    if (gl) return true;
    try { gl = canvas.getContext("webgl2", { alpha: false, antialias: false, powerPreference: "high-performance" }); } catch (_) { gl = null; }
    if (!gl) return false;
    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    return true;
  }

  function program(mode) {
    if (progs[mode] !== undefined) return progs[mode];
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, "#version 300 es\n#define MODE " + mode + "\n" + FRAG);
    if (!vs || !fs) return (progs[mode] = null);
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "a");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(p)); return (progs[mode] = null); }
    p.u = {};
    for (const n of ["uTex", "uCenter", "uSize", "uT", "uVar", "uTexSize"]) p.u[n] = gl.getUniformLocation(p, n);
    return (progs[mode] = p);
  }

  // CSS(.loading-img)와 같은 상자에 이미지를 contain 으로 맞추고, 느린 확대(1 → 1.05)도 똑같이 따라간다
  function layout(t) {
    const frame = canvas.parentElement;
    const W = frame.clientWidth, H = frame.clientHeight;
    const wide = window.matchMedia("(min-width: 900px) and (orientation: landscape)").matches;
    const box = wide ? { l: .28, t: .18, w: .44, h: .64 } : { l: .18, t: .22, w: .64, h: .56 };
    const bw = W * box.w, bh = H * box.h;
    const s = Math.min(bw / cur.iw, bh / cur.ih);
    const x = Math.min(t / 12, 1), zoom = 1 + 0.05 * (1 - (1 - x) * (1 - x));
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(2.0e6 / (W * H)));
    const cw = Math.max(1, Math.round(W * dpr)), ch = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    return {
      cx: (W * (box.l + box.w / 2)) * dpr,
      cy: ch - (H * (box.t + box.h / 2)) * dpr,
      sw: cur.iw * s * zoom * dpr,
      sh: cur.ih * s * zoom * dpr,
    };
  }

  function draw(now) {
    if (!cur) return;
    const t = frozen !== null ? frozen : (now - t0) / 1000;
    const L = layout(t);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(cur.prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(cur.prog.u.uTex, 0);
    gl.uniform2f(cur.prog.u.uCenter, L.cx, L.cy);
    gl.uniform2f(cur.prog.u.uSize, L.sw, L.sh);
    gl.uniform2f(cur.prog.u.uTexSize, cur.tw, cur.th);
    gl.uniform1f(cur.prog.u.uT, t);
    gl.uniform1f(cur.prog.u.uVar, cur.variant);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function loop(now) {
    if (!cur) return;
    if (frozen === null) draw(now);
    raf = requestAnimationFrame(loop);
  }

  function start(img, mode, variant) {
    stop();
    if (!ensure()) return false;
    const prog = program(mode);
    if (!prog) return false;
    const m = 0.35, pw = Math.round(img.naturalWidth * (1 + 2 * m)), ph = Math.round(img.naturalHeight * (1 + 2 * m));
    try {
      if (tex) gl.deleteTexture(tex);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      const pc = document.createElement("canvas"); pc.width = pw; pc.height = ph;
      pc.getContext("2d").drawImage(img, Math.round(img.naturalWidth * m), Math.round(img.naturalHeight * m));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pc);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    } catch (e) { console.warn("로딩 효과: 텍스처 업로드 실패 → CSS로 대체", e); return false; }
    cur = { prog, variant: variant || 0, iw: img.naturalWidth, ih: img.naturalHeight, tw: pw, th: ph };
    t0 = performance.now();
    canvas.classList.add("on");
    draw(t0);
    raf = requestAnimationFrame(loop);
    return true;
  }

  function stop() {
    cancelAnimationFrame(raf); raf = 0; cur = null; frozen = null;
    if (canvas) canvas.classList.remove("on");
  }

  window.RasyancutLoadingFx = {
    start, stop,
    _freeze(t) { frozen = t; if (cur) draw(0); },   // 테스트용: 시간을 고정해서 한 프레임만 그린다
  };
})();
