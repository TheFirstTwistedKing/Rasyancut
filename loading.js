/* 로딩 화면
 *  - 첨부 이미지 중 하나를 무작위로(직전과 같은 것은 피해서) 페이드인
 *  - 검은 배경, 이미지는 작게(WebGL 효과로 애니메이션), 오른쪽 아래에서 빙글빙글 도는 로딩 표시
 *  - 일이 끝나면 페이드아웃
 *
 *  window.RasyancutLoading.run(task) : task() 가 끝나고 최소 표시 시간이 지나면 닫힌다.
 */
(() => {
  "use strict";

  // 효과(애니메이션)를 만든 이미지만 쓴다. mode 는 loading-fx.js 의 효과 번호, variant 는 같은 효과의 변형.
  const IMAGES = [
    { file: "loading-1.webp", mode: 1 },                // 붉은 일식: 검붉은 연기와 구름
    { file: "loading-2.webp", mode: 2, variant: 0 },     // 금빛 태양: 이글거림
    { file: "loading-3.webp", mode: 3 },                 // 푸른 등대: 번지는 푸른빛
    { file: "loading-4.webp", mode: 2, variant: 1 },     // 금빛 별: 태양과 같은 이글거림
    { file: "loading-5.webp", mode: 5 },                 // 보라 손: 부패
    { file: "loading-6.webp", mode: 6 },                 // 검은 별: 뒤에서 커다랗게 발광
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


  async function run(task) {
    if (busy) return;
    busy = true;
    const root = document.getElementById("loading");
    const img = document.getElementById("loading-img");
    const item = pick();
    img.src = DIR + item.file;
    try { await img.decode(); } catch (_) { /* 디코드 실패해도 진행 */ }
    // 애니메이션(확대) 재시작
    img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";
    // WebGL 효과를 켜면 이미지는 캔버스가 대신 그린다. 못 켜면 CSS 효과(data-fx)로 대체
    const fx = window.RasyancutLoadingFx;
    const fxOn = !!(fx && fx.start(img, item.mode, item.variant));
    img.classList.toggle("fx-off", fxOn);
    img.dataset.fx = fxOn ? "" : String(item.mode) + (item.variant ? "b" : "");

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
    if (fx) fx.stop();
    busy = false;
  }

  window.RasyancutLoading = { run, isBusy: () => busy };
})();
