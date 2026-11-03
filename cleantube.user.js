// ==UserScript==
// @name         클린튜브 (휴대폰용) - 광고 건너뛰기·백그라운드 재생
// @namespace    cleantube
// @version      1.1.0
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

  // 화면 꺼짐/탭 전환 이벤트를 유튜브가 받기 전에 차단
  const block = (e) => e.stopImmediatePropagation();
  for (const t of ['visibilitychange', 'webkitvisibilitychange']) {
    window.addEventListener(t, block, true);
    document.addEventListener(t, block, true);
  }

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
