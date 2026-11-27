(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- counters ---------- */
  function count(el) {
    var to = +el.dataset.to, t0 = null, dur = 1400;
    if (reduce) { el.textContent = to; return; }
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(to * e);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  /* ---------- static mode for screenshots (?shot) ---------- */
  if (/[?&]shot/.test(location.search)) {
    reduce = true;
    document.querySelectorAll('.rv, .et-hero, .bar').forEach(function (el) { el.classList.add('in'); });
    document.querySelectorAll('.count').forEach(function (el) { el.textContent = el.dataset.to; });
  }

  /* ---------- reveal ---------- */
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      (function (t) { setTimeout(function () { t.style.transitionDelay = '0s'; }, 1600); })(e.target);
      e.target.querySelectorAll('.count').forEach(count);
      if (e.target.classList.contains('count')) count(e.target);
      io.unobserve(e.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -6% 0px' });
  document.querySelectorAll('.rv, .et-hero').forEach(function (el) { io.observe(el); });

  /* ---------- nav: hide on scroll down, dark over dark sections ---------- */
  /* ---------- old business-card QR notice ---------- */
  (function () {
    var rn = document.getElementById('renamed'); if (!rn) return;
    var old = /netlify\.app$/i.test(location.hostname) || /[?&]from=creant/.test(location.search);
    var seen = false; try { seen = sessionStorage.getItem('rn') === '1'; } catch (e) {}
    if (old && !seen) { rn.hidden = false; }
    rn.querySelector('button').addEventListener('click', function () { rn.hidden = true; try { sessionStorage.setItem('rn', '1'); } catch (e) {} });
  })();

  var nav = document.getElementById('nav'), lastY = 0;
  var darks = [document.getElementById('eternia'), document.getElementById('contact'), document.querySelector('.other-card')];
  function onScroll() {
    var y = window.scrollY;
    nav.classList.toggle('hide', y > lastY && y > 300);
    lastY = y;
    var mid = 36, dark = false;
    darks.forEach(function (s) { if (!s) return; var r = s.getBoundingClientRect(); if (r.top < mid && r.bottom > mid) dark = true; });
    nav.classList.toggle('dark', dark);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- magnetic / springy hover ---------- */
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.mag').forEach(function (el) {
      var big = el.offsetWidth > 240;
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        var x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
        el.style.transform = big
          ? 'perspective(800px) rotateX(' + (-y * 5) + 'deg) rotateY(' + (x * 6) + 'deg) translateY(-4px)'
          : 'translate(' + x * 10 + 'px,' + y * 8 + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ---------- language ---------- */
  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-en]'));
  nodes.forEach(function (n) { n.dataset.ko = n.innerHTML; });
  var btn = document.getElementById('langBtn');
  function setLang(l) {
    document.documentElement.lang = l;
    nodes.forEach(function (n) { n.innerHTML = l === 'en' ? n.dataset.en : n.dataset.ko; });
    var s = btn.querySelectorAll('span');
    s[0].classList.toggle('on', l === 'ko'); s[1].classList.toggle('on', l === 'en');
  }
  btn.addEventListener('click', function () {
    var l = document.documentElement.lang === 'en' ? 'ko' : 'en';
    setLang(l);
    try { sessionStorage.setItem('lang', l); } catch (e) {}
  });
  /* 자동 언어: 휴대폰(브라우저) 언어가 한국어면 한국어, 그 밖은 영어.
     같은 방문 중 직접 바꾼 언어는 유지. */
  var saved = null;
  try { saved = sessionStorage.getItem('lang'); } catch (e) {}
  var langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
  var initial = saved || (/^ko/i.test(langs[0] || '') ? 'ko' : 'en');
  if (/[?&]lang=en/.test(location.search)) initial = 'en';
  if (/[?&]lang=ko/.test(location.search)) initial = 'ko';
  if (initial === 'en') setLang('en');

  /* ---------- vCard ---------- */
  document.getElementById('vcard').addEventListener('click', function () {
    var v = [
      'BEGIN:VCARD', 'VERSION:3.0',
      'N:Kim;Hajin;;;', 'FN:김하진 (Hajin Kim)',
      'ORG:Somer Studio', 'TITLE:Founder',
      'TEL;TYPE=CELL:+821053900386', 'EMAIL:hchis.hj@gmail.com',
      'URL:https://somer-studio.com/', 'END:VCARD'
    ].join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([v], { type: 'text/vcard;charset=utf-8' }));
    a.download = 'HajinKim.vcf';
    document.body.appendChild(a); a.click(); a.remove();
  });
})();

/* ---------- carousel (auto-advance) + lightbox ---------- */
(function () {
  'use strict';
  var lb = document.getElementById('lb');
  if (!lb) return;
  var lbImg = lb.querySelector('img'), lbCap = lb.querySelector('figcaption');
  var group = [], idx = 0;
  function show(i) {
    idx = (i + group.length) % group.length;
    var f = group[idx], im = f.querySelector('img'), cap = f.querySelector('figcaption');
    lbImg.src = im.currentSrc || im.src; lbImg.alt = im.alt;
    lbImg.style.animation = 'none'; void lbImg.offsetWidth; lbImg.style.animation = '';
    lbCap.textContent = cap ? cap.textContent : im.alt;
  }
  function open(list, i) { group = list; lb.hidden = false; document.body.style.overflow = 'hidden'; show(i); }
  function close() { lb.hidden = true; document.body.style.overflow = ''; }
  lb.querySelector('.lb-x').addEventListener('click', close);
  lb.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); show(idx - 1); });
  lb.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); show(idx + 1); });
  lb.addEventListener('click', function (e) { if (e.target === lb) close(); });
  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
  });
  var sx = 0;
  lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) { var dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1)); });

  // every photo figure (galleries + carousel) opens the lightbox within its own group
  document.querySelectorAll('.cs-track, .gallery, .apps').forEach(function (g) {
    var figs = Array.prototype.slice.call(g.querySelectorAll('figure'));
    figs.forEach(function (f, i) {
      f.classList.add('zoomable');
      f.addEventListener('click', function () { open(figs, i); });
    });
  });

  // auto-advancing carousel
  document.querySelectorAll('.carousel').forEach(function (c) {
    var track = c.querySelector('.cs-track'), items = track.querySelectorAll('.cs-item');
    var count = c.querySelector('.cs-count b'), delay = +c.dataset.auto || 3200, cur = 0, timer = null, paused = false;
    function go(i) {
      cur = (i + items.length) % items.length;
      track.scrollTo({ left: items[cur].offsetLeft - track.offsetLeft, behavior: 'smooth' });
      count.textContent = cur + 1;
    }
    function tick() { if (!paused && lb.hidden && !document.hidden) go(cur + 1); }
    function start() { stop(); timer = setInterval(tick, delay); }
    function stop() { if (timer) clearInterval(timer); }
    c.querySelector('.next').addEventListener('click', function () { go(cur + 1); start(); });
    c.querySelector('.prev').addEventListener('click', function () { go(cur - 1); start(); });
    c.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse') paused = true; });
    c.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') paused = false; });
    track.addEventListener('scroll', function () {
      var best = 0, d = 1e9;
      items.forEach(function (it, i) { var x = Math.abs(it.offsetLeft - track.offsetLeft - track.scrollLeft); if (x < d) { d = x; best = i; } });
      cur = best; count.textContent = cur + 1;
    }, { passive: true });
    var io2 = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) start(); else stop(); }); });
    io2.observe(c);
  });
})();
