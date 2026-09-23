// Site-wide scroll reveal: content blocks start slightly narrower and
// expand to their normal width as they enter the viewport while scrolling.
// Injected on every page (see the bulk <script> tag added before </body>)
// rather than requiring each page's markup to opt in - this codebase's 49
// public pages don't share one consistent section/wrapper class, so the
// target elements are picked generically at runtime instead of via a
// fixed selector (see pickTargets below).
(function () {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function isChrome(el) {
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'NOSCRIPT' || tag === 'META') return true;
    var cs = window.getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'sticky') return true;
    if (cs.display === 'none' || cs.visibility === 'hidden') return true;
    var rect = el.getBoundingClientRect();
    if (rect.height < 24) return true;
    return false;
  }

  // Most pages wrap their real content in one or two nested container divs
  // (a <main>, a ".wrap", a page-level div) before the actual sections -
  // animating that single outer wrapper as one block would just play once
  // at the top of the page instead of section-by-section as you scroll, so
  // this walks down through any single, multi-child wrapper to find the
  // real list of content blocks.
  function pickTargets() {
    var root = document.querySelector('main') || document.body;
    for (var i = 0; i < 4; i++) {
      var kids = Array.prototype.filter.call(root.children, function (el) { return !isChrome(el); });
      if (kids.length === 1 && kids[0].children.length > 1) {
        root = kids[0];
      } else {
        break;
      }
    }
    return Array.prototype.filter.call(root.children, function (el) { return !isChrome(el); });
  }

  function start() {
    var targets = pickTargets();
    if (!targets.length) return;

    var STYLE_ID = 'mt-scroll-reveal-style';
    if (!document.getElementById(STYLE_ID)) {
      var style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent =
        '.mt-reveal{opacity:0;scale:.94 1;transition:opacity .75s cubic-bezier(.22,.61,.36,1),scale .75s cubic-bezier(.22,.61,.36,1);will-change:opacity,scale;}' +
        '.mt-reveal.mt-reveal-in{opacity:1;scale:1 1;}';
      document.head.appendChild(style);
    }

    var wayCardIndex = 0;
    document.querySelectorAll('.ways-section .way-card').forEach(function (card) {
      if (targets.indexOf(card) === -1) targets.push(card);
    });

    targets.forEach(function (el, i) {
      el.classList.add('mt-reveal');
      if (el.matches('.ways-section .way-card')) {
        el.style.transitionDelay = (wayCardIndex++ * 90) + 'ms';
      } else {
        el.style.transitionDelay = Math.min(i * 40, 200) + 'ms';
      }
    });

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('mt-reveal-in');
        } else {
          entry.target.classList.remove('mt-reveal-in');
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    targets.forEach(function (el) { observer.observe(el); });

    // Anything already on screen at load (the hero, above the fold on a
    // short page) should just be visible immediately, not wait on a
    // scroll event that may never come.
    requestAnimationFrame(function () {
      targets.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          el.classList.add('mt-reveal-in');
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
