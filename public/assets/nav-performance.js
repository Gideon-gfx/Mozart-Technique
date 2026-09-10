// "Performance" nav dropdown - the first dropdown menu item in this site's
// nav (every other nav item is a flat link). Desktop opens on hover/focus
// via pure CSS; touch devices have no reliable :hover, so a click toggles
// an .open class instead. Self-contained (styles injected here) so it
// drops into any page's nav regardless of whether that page also loads
// Tailwind, matching the /assets/nav-auth.js drop-in pattern.
(function () {
  const STYLE_ID = 'mt-perf-nav-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mt-perf-dropdown { position: relative; display: inline-block; }
      .mt-perf-dropdown-toggle {
        font: inherit; color: inherit; background: none; border: none; cursor: pointer;
        display: inline-flex; align-items: center; gap: 6px; padding: 0;
      }
      .mt-perf-dropdown-toggle:hover { color: #cc0000; }
      .mt-perf-dropdown-toggle i { font-size: .72em; transition: transform .15s ease; }
      .mt-perf-dropdown-menu {
        position: absolute; top: calc(100% + 14px); left: 50%; transform: translateX(-50%);
        min-width: 190px; background: #fff; border-radius: 12px;
        box-shadow: 0 16px 36px rgba(0,0,0,.16); border: 1px solid rgba(0,0,0,.06);
        padding: 8px; z-index: 200;
        opacity: 0; visibility: hidden; transform: translateX(-50%) translateY(-6px);
        transition: opacity .15s ease, transform .15s ease, visibility .15s ease;
      }
      .mt-perf-dropdown-menu a {
        display: block; padding: 9px 12px; border-radius: 8px; font-size: .88rem; font-weight: 600;
        color: #1F2937; text-decoration: none; white-space: nowrap;
      }
      .mt-perf-dropdown-menu a:hover { background: #f5f5f5; color: #cc0000; }

      @media (hover: hover) {
        .mt-perf-dropdown:hover .mt-perf-dropdown-menu,
        .mt-perf-dropdown:focus-within .mt-perf-dropdown-menu {
          opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);
        }
        .mt-perf-dropdown:hover .mt-perf-dropdown-toggle i,
        .mt-perf-dropdown:focus-within .mt-perf-dropdown-toggle i { transform: rotate(180deg); }
      }
      .mt-perf-dropdown.mt-perf-open .mt-perf-dropdown-menu {
        opacity: 1; visibility: visible; transform: translateX(-50%) translateY(0);
      }
      .mt-perf-dropdown.mt-perf-open .mt-perf-dropdown-toggle i { transform: rotate(180deg); }

      /* Inside an open mobile slide-down nav, stack full-width like sibling links. */
      @media (max-width: 768px) {
        .mt-mobile-nav-open .mt-perf-dropdown { display: block; width: 100%; }
        .mt-mobile-nav-open .mt-perf-dropdown-menu {
          position: static; transform: none; box-shadow: none; border: none; opacity: 1;
          visibility: visible; display: none; padding: 0 0 0 16px; margin-top: 4px;
        }
        .mt-mobile-nav-open .mt-perf-dropdown.mt-perf-open .mt-perf-dropdown-menu { display: block; }
      }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectStyle();
    document.querySelectorAll('[data-mt-perf-dropdown]').forEach((dropdown) => {
      const toggle = dropdown.querySelector('[data-mt-perf-toggle]');
      if (!toggle || toggle.dataset.bound) return;
      toggle.dataset.bound = 'true';

      // `font: inherit` only pulls from this <div>'s own parent, but most
      // nav CSS on this site styles font-size/weight on the sibling <a>
      // tags specifically (e.g. ".nav-links a"), which a <button> never
      // matches by inheritance alone. Copying a sibling link's computed
      // style makes this drop-in match whichever page's nav it's in,
      // without needing to know that page's CSS ahead of time.
      const siblingLink = dropdown.parentElement && dropdown.parentElement.querySelector('a');
      if (siblingLink) {
        const computed = window.getComputedStyle(siblingLink);
        ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'textTransform'].forEach((prop) => {
          toggle.style[prop] = computed[prop];
        });
      }
      toggle.addEventListener('click', (e) => {
        // Touch devices (no real :hover) rely on this click-toggle; devices
        // with real hover already opened the menu on hover, so a click
        // there just follows through as a normal link-less button (no href).
        e.preventDefault();
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('mt-perf-open');
        document.querySelectorAll('.mt-perf-dropdown.mt-perf-open').forEach((d) => d.classList.remove('mt-perf-open'));
        if (!isOpen) dropdown.classList.add('mt-perf-open');
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.mt-perf-dropdown')) {
        document.querySelectorAll('.mt-perf-dropdown.mt-perf-open').forEach((d) => d.classList.remove('mt-perf-open'));
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
