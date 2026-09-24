// Photographic turntable: real garment detail, twelve views, no invented mesh.
// All gesture state is local. Color/size inquiries remain in main.js.
export function initDressViewer({ dress }) {
  const host = document.querySelector('.viewer');
  if (!host) return;
  const image = host.querySelector('.viewer-image');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const isLian = dress.id === 'lian';
  const anchors = { 0: 'front', 90: 'right', 180: 'back', 270: 'left' };
  const sequence = isLian ? Array.from({ length: 12 }, (_, i) => {
    const angle = i * 30;
    return { angle, src: `images/lian-${anchors[angle] || String(angle).padStart(3, '0')}.jpg`, ready: angle === 0 };
  }) : [{ angle: 0, src: `images/dress-${dress.id}.jpg`, ready: true }];
  host.classList.add('viewer-realistic');
  host.setAttribute('aria-roledescription', 'عارض صور متعدد الزوايا');
  host.querySelector('.viewer-caption').textContent = isLian ? 'استكشفي الفستان · 360°' : 'استكشفي التفاصيل';
  const backdrop = document.createElement('div');
  backdrop.className = 'viewer-backdrop'; backdrop.setAttribute('aria-hidden', 'true');
  host.prepend(backdrop);
  const second = image.cloneNode(); second.removeAttribute('id');
  second.className = 'viewer-image viewer-crossfade'; second.alt = ''; second.setAttribute('aria-hidden', 'true');
  image.after(second);
  const toolbar = document.createElement('div'); toolbar.className = 'turntable-toolbar';
  toolbar.innerHTML = `${isLian ? '<button type="button" class="turntable-play" aria-label="تشغيل الدوران التلقائي" aria-pressed="false"><span aria-hidden="true">▷</span><span class="play-label">دوران تلقائي</span></button>' : ''}<span class="zoom-readout" aria-live="off">100%</span><span class="view-quality">تفاصيل عالية الدقة</span>`;
  host.after(toolbar);
  const orbitBar = document.createElement('div'); orbitBar.className = 'orbit-bar';
  if (isLian) {
    orbitBar.innerHTML = '<div class="orbit-heading"><span>زاوية الرؤية</span><output id="orbit-value">أمام · 0°</output></div><input class="orbit-slider" type="range" min="0" max="360" step="1" value="0" dir="ltr" aria-label="زاوية دوران الفستان" aria-valuetext="أمام، 0 درجة"><div class="orbit-markers" aria-hidden="true"><span>أمام</span><span>أيمن</span><span>خلف</span><span>أيسر</span><span>أمام</span></div>';
    toolbar.after(orbitBar);
  }
  const hint = document.createElement('div'); hint.className = 'viewer-gesture-hint';
  hint.innerHTML = isLian ? '<span aria-hidden="true">↔</span> اسحبي بهدوء لاستكشاف كل زاوية' : 'كبّري الصورة لاستكشاف التفاصيل';
  host.append(hint);
  const loadState = document.createElement('span'); loadState.className = 'turntable-load';
  loadState.setAttribute('role', 'status'); loadState.textContent = isLian ? 'تحميل زوايا الفستان…' : '';
  toolbar.append(loadState);
  const slider = orbitBar.querySelector('input'); const play = toolbar.querySelector('.turntable-play');
  const angleLabel = host.querySelector('#viewer-angle');
  let angle = 0, targetAngle = 0, zoom = 1, targetZoom = 1, x = 0, y = 0, targetX = 0, targetY = 0;
  let velocity = 0, auto = isLian && !motion.matches, detail = false, pan = false;
  let visible = true, destroyed = false, raf = 0, lastTime = 0, lastDrag = 0;
  let dragging = false, pinchDistance = 0, pinchStartZoom = 1, sourceA = '', sourceB = '';
  const pointers = new Map(); const disposers = [];
  const on = (target, type, handler, options) => { target.addEventListener(type, handler, options); disposers.push(() => target.removeEventListener(type, handler, options)); };
  const normalize = value => (value % 360 + 360) % 360;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const nameOf = value => ['أمام', 'جانب أيمن', 'خلف', 'جانب أيسر'][Math.round(normalize(value) / 90) % 4];
  function playState() {
    if (!play) return;
    play.setAttribute('aria-pressed', String(auto));
    play.setAttribute('aria-label', auto ? 'إيقاف الدوران التلقائي' : 'تشغيل الدوران التلقائي');
    play.querySelector('span').textContent = auto ? 'Ⅱ' : '▷';
    play.querySelector('.play-label').textContent = auto ? 'إيقاف الدوران' : 'دوران تلقائي';
  }
  function stop() { auto = false; velocity = 0; host.classList.add('viewer-touched'); playState(); }
  function requestFrame() { if (!raf && visible && !document.hidden && !destroyed) raf = requestAnimationFrame(frame); }
  function bounds() {
    // Keep the whole image recoverable: no dragging beyond the zoomed image edges.
    const width=host.clientWidth,height=host.clientHeight;
    const ratio=(image.naturalWidth||2)/(image.naturalHeight||3);
    const fitWidth=Math.min(width,height*ratio),fitHeight=fitWidth/ratio;
    const maxX = Math.max(0, (fitWidth * zoom - width) / 2);
    const maxY = Math.max(0, (fitHeight * zoom - height) / 2);
    targetX = clamp(targetX, -maxX, maxX); targetY = clamp(targetY, -maxY, maxY);
  }
  function setZoom(value) { stop(); targetZoom = clamp(value, 1, 4); if (targetZoom === 1) targetX = targetY = 0; requestFrame(); }
  function showAngle(value, smooth = true) {
    detail = false;
    const current = normalize(angle), delta = ((value - current + 540) % 360) - 180;
    targetAngle = angle + delta;
    if (!smooth || motion.matches) { angle = targetAngle = value; }
    requestFrame();
  }
  function render() {
    const value = normalize(angle);
    const ready = sequence.filter(item => item.ready);
    if (!ready.length) return;
    let a = ready[0], b = ready[0], mix = 0;
    if (detail) {
      a = b = { src: 'images/lian-detail.jpg' };
    } else if (ready.length > 1) {
      const idx = ready.findLastIndex(item => item.angle <= value);
      a = ready[Math.max(0, idx)]; b = ready[(Math.max(0, idx) + 1) % ready.length];
      const span = (b.angle - a.angle + 360) % 360;
      const fraction = (value - a.angle + 360) % 360 / Math.max(1, span);
      // Brief optical dissolve around each switch, avoiding a double silhouette.
      mix = clamp((fraction - .46) / .08, 0, 1);
      mix = mix * mix * (3 - 2 * mix);
      if (motion.matches) mix = fraction < .5 ? 0 : 1;
    }
    if (sourceA !== a.src) { image.src = a.src; sourceA = a.src; }
    if (sourceB !== b.src) { second.src = b.src; sourceB = b.src; }
    second.style.opacity = String(mix);
    const active = mix < .5 ? a.src : b.src;
    backdrop.style.backgroundImage = `url("${active}")`;
    const transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${zoom.toFixed(4)})`;
    image.style.transform = transform; second.style.transform = transform;
    image.alt = `فستان ${dress.name} — ${detail ? 'تفاصيل الدانتيل' : nameOf(value)}`;
    toolbar.querySelector('.zoom-readout').textContent = `${Math.round(zoom * 100)}%`;
    host.classList.toggle('viewer-zoomed', zoom > 1.05);
    host.classList.toggle('viewer-panning', pan || zoom > 1.05);
    if (isLian) {
      const rounded = Math.round(value) % 360;
      slider.value = String(Math.abs(angle - 360) < .02 ? 360 : rounded); slider.disabled = detail;
      slider.setAttribute('aria-valuetext', `${nameOf(value)}، ${rounded} درجة`);
      orbitBar.querySelector('output').textContent = detail ? 'تفاصيل الدانتيل' : `${nameOf(value)} · ${rounded}°`;
      angleLabel.textContent = detail ? 'تفاصيل الدانتيل' : `${rounded}° · ${nameOf(value)}`;
      document.querySelectorAll('[data-angle]').forEach(button => {
        const activeThumb = detail ? button.dataset.angle === 'detail' : button.dataset.angle === anchors[(Math.round(value / 90) * 90) % 360];
        button.classList.toggle('active', activeThumb); button.setAttribute('aria-pressed', String(activeThumb));
      });
      host.querySelectorAll('.hotspot').forEach(button => { button.hidden = detail || zoom > 1.05 || (value > 8 && value < 352); });
    }
  }
  function frame(now) {
    raf = 0; if (destroyed || !visible || document.hidden) return;
    const dt = Math.min(40, lastTime ? now - lastTime : 16); lastTime = now;
    if (auto && !detail && sequence.filter(item => item.ready).length > 1) targetAngle += dt * .009;
    if (!dragging && !auto && !motion.matches && Math.abs(velocity) > .001) { targetAngle += velocity * dt; velocity *= Math.exp(-dt / 190); }
    const easing = motion.matches ? 1 : 1 - Math.exp(-dt / (dragging ? 40 : 95));
    angle += (targetAngle - angle) * easing; zoom += (targetZoom - zoom) * easing;
    bounds(); x += (targetX - x) * easing; y += (targetY - y) * easing;
    render();
    const moving = Math.abs(targetAngle - angle) > .03 || Math.abs(targetZoom - zoom) > .001 || Math.abs(targetX - x) > .1 || Math.abs(targetY - y) > .1 || Math.abs(velocity) > .001;
    if (auto || moving) requestFrame();
  }
  async function loadFrames() {
    const pending = [...sequence.filter(item => anchors[item.angle]), ...sequence.filter(item => !anchors[item.angle])];
    let cursor = 0;
    async function worker() {
      while (cursor < pending.length && !destroyed) {
        const item = pending[cursor++];
        const probe = new Image(); probe.decoding = 'async'; probe.src = item.src;
        try { await probe.decode(); item.ready = true; } catch { item.ready = false; }
        if (destroyed) return;
        const loaded = sequence.filter(item => item.ready).length;
        loadState.textContent = `${loaded} ${loaded < 11 ? 'زوايا تصوير' : 'زاوية تصوير'}`;
        requestFrame();
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    const loaded = sequence.filter(item => item.ready).length;
    if (loaded < 2 && isLian) { auto = false; play.disabled = true; loadState.textContent = 'تعذر تحميل بقية الزوايا'; playState(); }
  }
  function distance() { const [a, b] = [...pointers.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; }
  on(host, 'pointerdown', event => {
    if (event.target.closest('button')) { stop(); return; }
    stop(); dragging = true; host.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastDrag = performance.now();
    if (pointers.size === 2) { pinchDistance = distance(); pinchStartZoom = targetZoom; }
  });
  on(host, 'pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const old = pointers.get(event.pointerId), now = performance.now();
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) { targetZoom = clamp(pinchStartZoom * distance() / Math.max(1, pinchDistance), 1, 4); velocity = 0; }
    else if (pan || targetZoom > 1.05) { targetX += event.clientX - old.x; targetY += event.clientY - old.y; velocity = 0; }
    else if (isLian && !detail) {
      const delta = (event.clientX - old.x) * 360 / Math.max(300, host.clientWidth * 1.45);
      targetAngle += delta;
      velocity = clamp(delta / Math.max(8, now - lastDrag), -.6, .6);
    }
    lastDrag = now; requestFrame();
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinchDistance = 0;
    if (!pointers.size) { dragging = false; if (performance.now() - lastDrag > 100) velocity = 0; requestFrame(); }
  }
  on(host, 'pointerup', release); on(host, 'pointercancel', event => { velocity = 0; release(event); });
  on(host, 'lostpointercapture', release);
  on(host, 'dblclick', event => { if (!event.target.closest('button')) setZoom(targetZoom > 1.1 ? 1 : 2.3); });
  on(host, 'wheel', event => { if (!event.ctrlKey && !event.metaKey) return; event.preventDefault(); setZoom(targetZoom - event.deltaY * .006); }, { passive: false });
  on(host, 'keydown', event => {
    if (event.target.closest('button')) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); stop(); showAngle(normalize(angle + (event.key === 'ArrowLeft' ? 30 : -30))); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); setZoom(targetZoom + .35); }
    if (event.key === '-') { event.preventDefault(); setZoom(targetZoom - .35); }
    if (event.key === 'Home') { event.preventDefault(); reset(); }
  });
  if (slider) on(slider, 'input', () => { stop(); detail = false; targetAngle = angle = Number(slider.value); requestFrame(); });
  if (play) on(play, 'click', () => { auto = !auto; detail = false; velocity = 0; playState(); requestFrame(); });
  function reset() { stop(); detail = false; pan = false; zoom = targetZoom = 1; x = y = targetX = targetY = 0; angle = targetAngle = 0; host.querySelector('[data-viewer="pan"]').setAttribute('aria-pressed', 'false'); requestFrame(); }
  function exitFullscreenFallback() { host.classList.remove('fullscreen-fallback'); document.body.classList.remove('viewer-fullscreen-open'); }
  on(document, 'keydown', event => { if (event.key === 'Escape') exitFullscreenFallback(); });
  host.querySelectorAll('[data-viewer]').forEach(button => on(button, 'click', async () => {
    stop();
    const action = button.dataset.viewer;
    if (action === 'zoom' || action === 'plus') setZoom(targetZoom + .35);
    if (action === 'minus') setZoom(targetZoom - .35);
    if (action === 'reset') reset();
    if (action === 'pan') { pan = !pan; button.setAttribute('aria-pressed', String(pan)); if (pan && targetZoom < 1.5) targetZoom = 1.6; requestFrame(); }
    if (action === 'fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (host.classList.contains('fullscreen-fallback')) exitFullscreenFallback();
        else if (host.requestFullscreen) await host.requestFullscreen();
        else { host.classList.add('fullscreen-fallback'); document.body.classList.add('viewer-fullscreen-open'); }
      } catch { host.classList.add('fullscreen-fallback'); document.body.classList.add('viewer-fullscreen-open'); }
      requestFrame();
    }
  }));
  document.querySelectorAll('[data-angle]').forEach(button => on(button, 'click', () => {
    stop(); targetZoom = 1; targetX = targetY = 0;
    if (button.dataset.angle === 'detail') { detail = true; requestFrame(); }
    else showAngle(Number(Object.keys(anchors).find(key => anchors[key] === button.dataset.angle)), false);
  }));
  on(motion, 'change', () => { if (motion.matches) stop(); requestFrame(); });
  on(document, 'visibilitychange', () => { cancelAnimationFrame(raf); raf = 0; lastTime = 0; if (!document.hidden) requestFrame(); });
  const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; if (visible) { lastTime = 0; requestFrame(); } else { cancelAnimationFrame(raf); raf = 0; } }, { threshold: .05 });
  observer.observe(host);
  const resize = new ResizeObserver(() => { bounds(); requestFrame(); }); resize.observe(host);
  on(window, 'pagehide', event => { cancelAnimationFrame(raf); raf = 0; if(event.persisted) return; destroyed = true; observer.disconnect(); resize.disconnect(); disposers.forEach(dispose => dispose()); });
  on(window, 'pageshow', event => { if(event.persisted){lastTime=0;requestFrame();} });
  playState(); render(); requestFrame(); if (isLian) loadFrames();
}
