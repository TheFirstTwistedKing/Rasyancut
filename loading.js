/* 로딩 화면
 *  - 첨부 이미지 중 하나를 무작위로(직전과 같은 것은 피해서) 페이드인
 *  - 검은 배경 + 화면 가장자리의 연노랑 선, 이미지는 작게, 오른쪽 아래에서 빙글빙글 도는 로딩 표시
 *  - 일이 끝나면 페이드아웃
 *
 *  window.RasyancutLoading.run(task) : task() 가 끝나고 최소 표시 시간이 지나면 닫힌다.
 */
(() => {
  "use strict";

  const IMAGES = [
    "loading-1.webp",
    "loading-2.webp",
    "loading-3.webp",
    "loading-4.webp",
    "loading-5.webp",
    "loading-6.webp",
    "loading-7.webp",
    "loading-8.webp",
    "loading-9.webp",
    "loading-10.webp",
    "loading-11.webp",
    "loading-12.webp",
    "loading-13.webp",
    "loading-14.webp",
    "loading-15.webp",
    "loading-16.webp",
    "loading-17.webp",
    "loading-18.webp",
    "loading-19.webp",
    "loading-20.webp",
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
    const file = pick();
    img.src = DIR + file;
    try { await img.decode(); } catch (_) { /* 디코드 실패해도 진행 */ }
    // 애니메이션(확대) 재시작
    img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";

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
    busy = false;
  }

  window.RasyancutLoading = { run, isBusy: () => busy };
})();
