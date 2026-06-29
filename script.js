
document.addEventListener('DOMContentLoaded',()=>{
  const toc = document.getElementById('toc');
  const btn = document.getElementById('toc-toggle');
  btn.addEventListener('click',()=>{
    const nowCollapsed = toc.classList.toggle('collapsed');
    const expanded = !toc.classList.contains('collapsed');
    btn.setAttribute('aria-expanded', String(expanded));
    // change icon
    btn.textContent = expanded ? '✕' : '☰';
    // add class to body so main margin can animate with sidebar
    if(expanded) document.body.classList.add('toc-open'); else document.body.classList.remove('toc-open');
  });

  // Map hotspot interactions
  const hotspots = document.querySelectorAll('.hotspot');
  const info = document.getElementById('map-info');
  const infoTitle = info.querySelector('h3');
  const infoDesc = info.querySelector('p');

  function clearActive(){
    hotspots.forEach(h=>h.classList.remove('active'));
  }

  hotspots.forEach(h=>{
    h.addEventListener('click', ()=>{
      clearActive();
      h.classList.add('active');
      const title = h.dataset.title || '이름 없음';
      const desc = h.dataset.desc || '';
      infoTitle.textContent = title;
      infoDesc.textContent = desc;
    });
    // touch support: same as click
    h.addEventListener('touchstart', (e)=>{
      e.preventDefault();
      h.click();
    }, {passive:false});
  });
});
