/* 로딩 화면
 *  - 첨부 이미지 중 하나를 무작위로(직전과 같은 것은 피해서) 페이드인
 *  - 오른쪽 아래에서 빙글빙글 도는 로딩 표시
 *  - 세로 화면에서는 화면을 가로로 눕혀서 보여 준다 (가능하면 가로 고정도 시도)
 *  - 일이 끝나면 페이드아웃
 *
 *  window.RasyancutLoading.run(task) : task() 가 끝나고 최소 표시 시간이 지나면 닫힌다.
 */
(() => {
  "use strict";

  const IMAGES = [
    { file: "loading-1.jpg", bg: "#1c140e", ink: "#eeff6b" },
    { file: "loading-2.jpg", bg: "#000000", ink: "#eeff6b" },
    { file: "loading-3.jpg", bg: "#000000", ink: "#eeff6b" },
    { file: "loading-4.jpg", bg: "#000000", ink: "#eeff6b" },
    { file: "loading-5.jpg", bg: "#1f1f1f", ink: "#eeff6b" },
    { file: "loading-6.jpg", bg: "#ffffff", ink: "#111111" },
    { file: "loading-7.jpg", bg: "#efefef", ink: "#111111" },
    { file: "loading-8.jpg", bg: "#9db4ca", ink: "#111111" },
  ];
  const DIR = "assets/loading/";
  const FADE_IN = 800, FADE_OUT = 900;
  const MIN_SHOW = 3200;                       // 이미지를 충분히 볼 수 있는 최소 표시 시간(ms)
  const KEY = "rasyancut.loading.last";

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  let busy = false;

  function pick() {
    let last = -1;
    try { last = parseInt(sessionStorage.getItem(KEY), 10); } catch (_) { /* 무시 */ }
    let i;
    do { i = Math.floor(Math.random() * IMAGES.length); } while (IMAGES.length > 1 && i === last);
    try { sessionStorage.setItem(KEY, String(i)); } catch (_) { /* 무시 */ }
    return IMAGES[i];
  }

  async function lockLandscape() {
    try {
      if (screen.orientation && screen.orientation.lock) { await screen.orientation.lock("landscape"); return true; }
    } catch (_) { /* 대부분의 브라우저는 전체화면이 아니면 거부 → CSS 가로 회전으로 대체 */ }
    return false;
  }
  function unlock() { try { screen.orientation && screen.orientation.unlock && screen.orientation.unlock(); } catch (_) { /* 무시 */ } }

  async function run(task) {
    if (busy) return;
    busy = true;
    const root = document.getElementById("loading");
    const img = document.getElementById("loading-img");
    const meta = pick();
    root.style.setProperty("--lbg", meta.bg);
    root.style.setProperty("--ink", meta.ink);
    const bgEl = document.getElementById("loading-bg");
    bgEl.src = DIR + meta.file;
    bgEl.style.opacity = meta.ink === "#111111" ? "0.9" : "0";   // 밝은 이미지만 여백을 번진 배경으로 채우고, 어두운 이미지는 단색
    img.src = DIR + meta.file;
    try { await img.decode(); } catch (_) { /* 디코드 실패해도 진행 */ }
    // 애니메이션(확대) 재시작
    img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";

    lockLandscape();
    root.removeAttribute("inert"); root.setAttribute("aria-hidden", "false");
    root.classList.add("show");
    await wait(FADE_IN);

    const t0 = performance.now();
    let result;
    try { result = await task(); } catch (e) { console.error(e); }
    const left = MIN_SHOW - (performance.now() - t0);
    if (left > 0) await wait(left);
    if (result && typeof result.ready === "function") { result.ready(); await wait(220); }   // 지도를 아래에 먼저 띄운다

    root.classList.remove("show");
    await wait(FADE_OUT);
    root.setAttribute("aria-hidden", "true"); root.setAttribute("inert", "");
    unlock();
    busy = false;
  }

  window.RasyancutLoading = { run, isBusy: () => busy };
})();
