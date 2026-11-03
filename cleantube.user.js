// ==UserScript==
// @name         클린튜브 (휴대폰용) - 광고 건너뛰기·백그라운드 재생
// @namespace    cleantube
// @version      1.4.0
// @description  유튜브 동영상 광고 자동 건너뛰기, 화면 광고 숨김, 화면 꺼도 계속 재생
// @match        *://www.youtube.com/*
// @match        *://m.youtube.com/*
// @match        *://music.youtube.com/*
// @run-at       document-start
// @inject-into  auto
// @grant        unsafeWindow
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/aturboth-spec/cleantube/main/cleantube.user.js
// @downloadURL  https://raw.githubusercontent.com/aturboth-spec/cleantube/main/cleantube.user.js
// ==/UserScript==

// 유튜브는 보안 정책(CSP) 때문에 페이지에 직접 넣는 방식이 막힌다.
// 그래서 'auto'로 두고, 격리된 환경에서 실행돼도 페이지 객체를 바꿀 수 있게 작성했다.
(() => {
  'use strict';

  // 실제 페이지의 window/document (격리 환경이면 unsafeWindow가 페이지 쪽)
  const PW = (typeof unsafeWindow === 'object' && unsafeWindow) ? unsafeWindow : window;
  const PD = PW.document;

  // ── 1. 백그라운드 재생: 페이지가 항상 '보이는 상태'라고 믿게 함 ──
  const pin = (prop, value) => {
    try { Object.defineProperty(PD, prop, { value, configurable: true }); } catch (e) { /* 무시 */ }
  };
  pin('hidden', false);
  pin('visibilityState', 'visible');
  pin('webkitHidden', false);
  pin('webkitVisibilityState', 'visible');

  // 실제 화면 상태(위장 전 원래 값)
  const hidDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  const realHidden = () => { try { return hidDesc.get.call(document); } catch (e) { return false; } };
  let hiddenAt = 0;
  let onVis = () => {};

  // 화면 꺼짐/탭 전환/포커스 잃음 이벤트를 유튜브가 받기 전에 차단
  const block = (e) => {
    if (e.type !== 'blur') {
      if (realHidden()) hiddenAt = Date.now();
      try { onVis(); } catch (err) { /* 무시 */ }
    }
    e.stopImmediatePropagation();
  };
  for (const t of ['visibilitychange', 'webkitvisibilitychange']) {
    window.addEventListener(t, block, true);
    document.addEventListener(t, block, true);
  }
  window.addEventListener('blur', (e) => { if (e.target === window || e.target === document) block(e); }, true);

  // 화면이 꺼진 직후(3초 이내) 자동으로 멈춘 경우에만 다시 재생.
  // 잠금화면에서 직접 일시정지한 경우(3초 이후)는 그대로 둔다.
  document.addEventListener('pause', (e) => {
    const v = e.target;
    if (!(v instanceof HTMLMediaElement) || v.ended) return;
    if (realHidden() && Date.now() - hiddenAt < 3000) {
      setTimeout(() => { try { const r = v.play(); if (r && r.catch) r.catch(() => {}); } catch (err) { /* 무시 */ } }, 150);
    }
  }, true);

  // 화면이 안 보일 때(다른 앱 전환·화면 꺼짐) 유튜브가 스스로 거는 일시정지 명령을 무시.
  // 사용자가 직접 누른 일시정지(화면 터치, 잠금화면·알림창 버튼)는 그대로 통과.
  let lastUser = 0;
  const markUser = () => { lastUser = Date.now(); };
  for (const t of ['pointerdown', 'touchstart', 'mousedown', 'keydown']) {
    window.addEventListener(t, markUser, true);
  }
  const install = (obj, name, fn) => {
    try {
      if (typeof exportFunction === 'function' && PW !== window) exportFunction(fn, obj, { defineAs: name });
      else obj[name] = fn;
    } catch (e) { /* 무시 */ }
  };
  const nativePause = HTMLMediaElement.prototype.pause;
  const diag = { blocked: 0, userPause: 0, systemPause: 0, firstAt: 0 };
  let lastAllowed = 0;
  install(PW.HTMLMediaElement.prototype, 'pause', function () {
    if (realHidden() && Date.now() - lastUser > 1500) { // 유튜브의 자동 일시정지 → 무시
      diag.blocked++;
      return;
    }
    lastAllowed = Date.now();
    return nativePause.call(this);
  });

  // [진단] 안 보이는 동안 멈춘 원인 기록: 스크립트(유튜브·사용자) 경유인지, 브라우저·안드로이드가 직접 멈췄는지
  document.addEventListener('pause', (e) => {
    if (!(e.target instanceof HTMLVideoElement) || e.target.ended || !realHidden()) return;
    if (Date.now() - lastAllowed < 800) diag.userPause++;
    else diag.systemPause++;
    if (!diag.firstAt) diag.firstAt = Math.round((Date.now() - hiddenAt) / 1000);
  }, true);
  const report = () => {
    if (!diag.blocked && !diag.userPause && !diag.systemPause) return;
    const msg = `클린튜브 진단 · 유튜브 정지 명령 차단 ${diag.blocked}회 · ` +
      (diag.systemPause ? `브라우저/안드로이드가 직접 정지 ${diag.systemPause}회 (전환 ${diag.firstAt}초 후)`
        : diag.userPause ? `직접 누른 정지 ${diag.userPause}회` : '정지 없음');
    diag.blocked = diag.userPause = diag.systemPause = diag.firstAt = 0;
    try {
      const box = document.createElement('div');
      box.textContent = msg;
      box.style.cssText = 'position:fixed;left:8px;right:8px;bottom:70px;z-index:2147483647;background:#1b2333;color:#fff;' +
        'font:14px/1.5 sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.35)';
      (document.body || document.documentElement).appendChild(box);
      setTimeout(() => box.remove(), 15000);
      box.addEventListener('click', () => box.remove());
    } catch (e) { /* 무시 */ }
  };
  // 잠금화면·알림창 버튼 → 유튜브 처리기 실행 전에 '사용자 조작'으로 표시
  try {
    const ms = PW.navigator.mediaSession;
    if (ms && typeof ms.setActionHandler === 'function') {
      const origSet = ms.setActionHandler;
      const proto = PW.MediaSession ? PW.MediaSession.prototype : ms;
      install(proto, 'setActionHandler', function (action, handler) {
        let h = handler;
        if (typeof handler === 'function') {
          const w = function (details) { markUser(); return handler(details); };
          h = (typeof exportFunction === 'function' && PW !== window) ? exportFunction(w, PW) : w;
        }
        return origSet.call(this, action, h);
      });
    }
  } catch (e) { /* 무시 */ }

  // Firefox는 화면이 꺼지고 10초 뒤 영상 처리를 멈춰(절전) 소리까지 끊긴다.
  // 영상을 작은 캔버스에 한 번 그리면 Firefox가 이 절전을 해제한다.
  const cv = document.createElement('canvas');
  cv.width = 2; cv.height = 2;
  let g = null;
  try { g = cv.getContext('2d'); } catch (e) { /* 무시 */ }
  const keepAwake = (v) => {
    if (!g || !(v instanceof HTMLVideoElement) || v.readyState < 2) return;
    try { g.drawImage(v, 0, 0, 2, 2); } catch (e) { /* 무시 */ }
  };
  document.addEventListener('playing', (e) => keepAwake(e.target), true);
  document.addEventListener('loadeddata', (e) => keepAwake(e.target), true);
  // 화면이 안 보이게 되는 순간 한 번 더 그리고, 다시 보이면 진단 결과 표시 (block()에서 호출)
  onVis = () => {
    if (realHidden()) document.querySelectorAll('video').forEach((v) => { if (!v.paused) keepAwake(v); });
    else setTimeout(report, 500);
  };

  // "계속 시청하시겠습니까?" 일시정지 방지
  setInterval(() => { try { PW._lact = Date.now(); } catch (e) { /* 무시 */ } }, 30000);

  // ── 2. 화면 광고 숨김 ──
  const CSS = `
#masthead-ad, #player-ads,
ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-banner-promo-renderer,
ytd-statement-banner-renderer, ytd-display-ad-renderer, ytd-promoted-sparkles-web-renderer,
ytd-promoted-video-renderer, ytd-compact-promoted-video-renderer, ytd-action-companion-ad-renderer,
ytd-player-legacy-desktop-watch-ads-renderer, ytd-merch-shelf-renderer,
ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
ytd-reel-video-renderer:has(ytd-ad-slot-renderer),
.ytp-ad-overlay-container, .ytp-ad-image-overlay,
ad-slot-renderer, ytm-promoted-sparkles-web-renderer, ytm-promoted-video-renderer,
ytm-companion-ad-renderer, ytm-promoted-sparkles-text-search-renderer,
ytm-rich-item-renderer:has(ad-slot-renderer),
ytm-item-section-renderer:has(ad-slot-renderer) { display: none !important; }`;
  if (typeof GM_addStyle === 'function') {
    GM_addStyle(CSS);
  } else {
    const s = document.createElement('style');
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }

  // ── 3. 동영상 광고 자동 건너뛰기 ──
  const SKIP = [
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.ytp-ad-skip-button-container button',
    'button[id^="skip-button"]',
    '[class*="ytp-ad-skip"] button'
  ].join(',');

  let inAd = false, prevMuted = false, prevRate = 1;

  function tick() {
    const p = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    const v = p && p.querySelector('video');
    if (!p || !v) return;

    const ad = p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting');
    if (ad) {
      if (!inAd) {
        inAd = true;
        prevMuted = v.muted;
        prevRate = v.playbackRate === 16 ? 1 : v.playbackRate;
      }
      if (!v.muted) v.muted = true;
      if (v.playbackRate !== 16) v.playbackRate = 16;
      const b = p.querySelector(SKIP) || document.querySelector(SKIP);
      if (b) b.click();
    } else if (inAd) {
      inAd = false;
      v.muted = prevMuted;
      v.playbackRate = prevRate;
    }
    document.querySelectorAll('.ytp-ad-overlay-close-button').forEach((b) => b.click());
  }
  setInterval(tick, 200);
})();
