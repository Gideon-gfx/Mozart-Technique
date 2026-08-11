// Adds a hamburger toggle for the header nav links on small screens, and
// hides the "Mozart Technique" wordmark next to the logo on phone widths
// (the logo mark alone stays visible). Works across pages regardless of
// whether the nav uses Tailwind's "hidden md:flex" pattern or home.html's
// plain-CSS ".nav-links" class.
(function () {
  const STYLE_ID = 'mt-mobile-nav-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 768px) {
        .mt-brand-text { display: none !important; }
      }
      .mt-mobile-nav-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mt-mobile-toggle {
        display: none;
        align-items: center;
        justify-content: center;
        width: 42px;
        height: 42px;
        flex-shrink: 0;
        background: none;
        border: none;
        border-radius: 10px;
        font-size: 1.15rem;
        line-height: 1;
        cursor: pointer;
        color: #A3121A;
        margin-left: .35rem;
        transition: background-color .15s ease;
      }
      .mt-mobile-toggle:hover { background: rgba(163,18,26,.08); }
      @media (max-width: 768px) {
        .mt-mobile-toggle { display: inline-flex; }
      }
      .mt-mobile-nav-open {
        display: flex !important;
        flex-direction: column !important;
        align-items: stretch !important;
        gap: 0 !important;
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        width: 100%;
        background: #FFFFFF;
        padding: 8px 20px 20px;
        box-shadow: 0 18px 36px rgba(23,19,15,.16);
        border-top: 1px solid #EFE7D8;
        z-index: 60;
        margin: 0 !important;
        max-height: calc(100vh - 76px);
        overflow-y: auto;
        animation: mtNavDrop .16s ease;
      }
      @keyframes mtNavDrop {
        from { opacity: 0; transform: translateY(-8px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .mt-mobile-nav-open > a,
      .mt-mobile-nav-open > button,
      .mt-mobile-nav-open > div {
        width: 100% !important;
        box-sizing: border-box;
      }
      .mt-mobile-nav-open a {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        width: 100%;
        padding: 15px 4px !important;
        margin: 0 !important;
        border-bottom: 1px solid #F1EBDF;
        color: #17130F !important;
        font-size: 1rem !important;
        font-weight: 600 !important;
        text-decoration: none !important;
      }
      .mt-mobile-nav-open a i {
        width: 20px;
        text-align: center;
        color: #A3121A;
        font-size: 1rem;
        flex-shrink: 0;
      }
      .mt-mobile-nav-open a:hover { color: #A3121A !important; }
      .mt-mobile-nav-open button {
        display: flex !important;
        align-items: center !important;
        gap: 12px !important;
        justify-content: flex-start !important;
        width: 100%;
        padding: 15px 4px !important;
        margin: 10px 0 0 !important;
        border: none;
        border-top: 1px solid #F1EBDF;
        border-radius: 0 !important;
        background: none !important;
        color: #17130F !important;
        font-size: 1rem !important;
        font-weight: 600 !important;
        box-shadow: none !important;
      }
      .mt-mobile-nav-open button i { color: #A3121A; width: 20px; text-align: center; }
      .mt-mobile-nav-open > div:not(.hidden) {
        padding: 10px 4px;
        border-bottom: 1px solid #F1EBDF;
      }
    `;
    document.head.appendChild(style);
  }

  // Hides the "Mozart Technique" text that sits beside the logo image in
  // the header, on phone widths, leaving just the round logo mark. Handles
  // both markup shapes used across the site: a dedicated <span> next to the
  // <img> (Tailwind pages), and a bare trailing text node inside the same
  // <a> as the <img> (home.html / about.html's plain-CSS header).
  function markBrandText() {
    const logos = document.querySelectorAll('header img[src*="mozartLogo" i], header img[alt*="Mozart" i]');
    logos.forEach((img) => {
      let sib = img.nextSibling;
      while (sib) {
        if (sib.nodeType === 1) {
          if (/Mozart Technique/i.test(sib.textContent || '')) {
            sib.classList.add('mt-brand-text');
          }
          break;
        }
        if (sib.nodeType === 3 && sib.textContent.trim()) {
          const span = document.createElement('span');
          span.className = 'mt-brand-text';
          span.textContent = sib.textContent;
          sib.parentNode.replaceChild(span, sib);
          break;
        }
        sib = sib.nextSibling;
      }
    });
  }

  // Icon-only links/buttons (e.g. a lone search or bell icon) get their
  // `title` shown as a visible label once they're stacked in the dropdown,
  // so every row reads clearly instead of just an unlabeled glyph.
  function labelIconOnlyItems(nav) {
    nav.querySelectorAll('a, button').forEach((el) => {
      const iconOnly = el.querySelector('i') && el.textContent.trim() === '';
      if (iconOnly && el.title && !el.querySelector('.mt-icon-label')) {
        const label = document.createElement('span');
        label.className = 'mt-icon-label';
        label.textContent = el.title;
        el.appendChild(label);
      }
    });
  }

  function findNavContainer() {
    // Deliberately NOT a bare "nav" selector: on several pages the actual
    // links live in a specific sub-container (.nav-links, or a Tailwind
    // "hidden md:flex" div) nested inside a wider <nav> that also holds the
    // logo and #auth-state. Matching the outer <nav> instead of that inner
    // container was the actual bug behind "hamburger doesn't work on some
    // pages" - it grabbed the wrong element (logo included), and then broke
    // outright when it tried to reposition #auth-state, which isn't really
    // a direct child of what it thought was the nav's parent.
    const navLinks = document.querySelector('header .nav-links, .nav-links');
    if (navLinks) return navLinks;

    const all = document.querySelectorAll('header *');
    for (const el of all) {
      const cl = el.classList;
      if (cl.contains('hidden') && Array.from(cl).some((c) => c.indexOf('md:flex') === 0)) return el;
    }
    return null;
  }

  function ensureHomeLogoLinks() {
    document.querySelectorAll('.logo').forEach((logo) => {
      const links = logo.querySelectorAll('a');
      if (links.length) {
        links.forEach((link) => { link.href = '/home'; });
        return;
      }
      const children = Array.from(logo.childNodes);
      if (!children.length) return;
      const link = document.createElement('a');
      link.href = '/home';
      link.style.display = 'inline-flex';
      link.style.alignItems = 'center';
      link.style.gap = '0.45rem';
      children.forEach((child) => link.appendChild(child));
      logo.appendChild(link);
    });
  }

  function closeNav(nav, toggle) {
    nav.classList.remove('mt-mobile-nav-open');
    nav.classList.add('hidden');
    toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';
  }

  // Some pages ship their own hamburger markup (a #mobile-nav-toggle button
  // plus a #mobile-nav panel) but never wired up a click handler, so the
  // button did nothing. Adopt that markup where it exists instead of
  // injecting a second, competing toggle next to a dead one.
  function wireExistingToggle() {
    const toggle = document.getElementById('mobile-nav-toggle');
    const panel = document.getElementById('mobile-nav');
    if (!toggle || !panel || toggle.dataset.mtMobileWired) return false;
    toggle.dataset.mtMobileWired = 'true';

    const setOpen = (open) => {
      panel.classList.toggle('hidden', !open);
      toggle.innerHTML = open
        ? '<i class="fa-solid fa-xmark text-xl"></i>'
        : '<i class="fa-solid fa-bars text-xl"></i>';
    };

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(panel.classList.contains('hidden'));
    });
    panel.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('click', (e) => {
      if (panel.classList.contains('hidden')) return;
      if (panel.contains(e.target) || toggle.contains(e.target)) return;
      setOpen(false);
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && !panel.classList.contains('hidden')) setOpen(false);
    });
    return true;
  }

  function init() {
    injectStyle();
    markBrandText();
    ensureHomeLogoLinks();

    // A page-provided toggle wins; injecting our own on top of it is what
    // produced two hamburgers (one dead) on the tutor pages.
    if (wireExistingToggle()) return;

    const nav = findNavContainer();
    if (!nav || nav.dataset.mtMobileWired) return;
    nav.dataset.mtMobileWired = 'true';

    const header = nav.closest('header');
    if (header && getComputedStyle(header).position === 'static') {
      header.style.position = 'relative';
    }

    labelIconOnlyItems(nav);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mt-mobile-toggle';
    toggle.setAttribute('aria-label', 'Toggle navigation menu');
    toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';

    // Group the toggle with #auth-state (login button / avatar) so the two
    // sit together at the far right edge, instead of the toggle landing
    // wherever nav-links happens to be in the DOM (which, once nav-links is
    // hidden at mobile widths, left it stranded alone in the middle of the
    // header row via justify-content: space-between).
    // #auth-state is a direct sibling of the link container on some layouts
    // but nested *inside* it on others (Tailwind's "hidden md:flex" nav wraps
    // the links and the avatar together). Only pull it out into the right-hand
    // group when it's actually a child of the same parent - calling
    // insertBefore with a non-child reference node throws a NotFoundError,
    // which previously killed this whole script and left those pages with no
    // hamburger at all. When it's nested, the toggle just goes at the end of
    // the header row, which is the same visual result.
    const parent = nav.parentNode;
    const authState = parent.querySelector('#auth-state');
    const rightGroup = document.createElement('div');
    rightGroup.className = 'mt-mobile-nav-right';
    if (authState && authState.parentNode === parent) {
      parent.insertBefore(rightGroup, authState);
      rightGroup.appendChild(authState);
    } else {
      parent.appendChild(rightGroup);
    }
    rightGroup.appendChild(toggle);

    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('mt-mobile-nav-open');
      nav.classList.toggle('hidden', !isOpen);
      toggle.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    });

    nav.addEventListener('click', (e) => {
      if (e.target.closest('a')) closeNav(nav, toggle);
    });

    document.addEventListener('click', (e) => {
      if (!nav.classList.contains('mt-mobile-nav-open')) return;
      if (nav.contains(e.target) || toggle.contains(e.target)) return;
      closeNav(nav, toggle);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768 && nav.classList.contains('mt-mobile-nav-open')) {
        closeNav(nav, toggle);
      }
    });

    ensureHomeLogoLinks();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
