// "Performance" nav dropdown - the first dropdown menu item in this site's
// nav (every other nav item is a flat link). Desktop opens on hover/focus
// via pure CSS; touch devices have no reliable :hover, so a click toggles
// an .open class instead. Self-contained (styles injected here) so it
// drops into any page's nav regardless of whether that page also loads
// Tailwind, matching the /assets/nav-auth.js drop-in pattern.
(function () {
  const STYLE_ID = 'mt-perf-nav-style';
  // Must match mobile-nav.js's own MOBILE_BREAKPOINT - these are
  // independent drop-in scripts with no way to share a value.
  const MOBILE_BREAKPOINT = 1240;

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

      /* Inside an open mobile slide-down nav, stack full-width like sibling
         links. This breakpoint (1240px) must match mobile-nav.js's own
         MOBILE_BREAKPOINT constant - they're independent drop-in scripts
         with no way to share a value, so it's a manually-kept-in-sync
         number in both places. It was previously 768px while mobile-nav.js
         used 1024/1240px, so on any viewport in between, the hamburger nav
         was open but this dropdown still used its desktop (position:
         absolute, hidden-until-hover) styles - which is why the submenu
         rendered empty/invisible instead of stacking under its toggle. */
      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        .mt-mobile-nav-open .mt-perf-dropdown { display: block; width: 100%; }
        /* Matches mobile-nav.js's own ".mt-mobile-nav-open a/button" row
           styling exactly (full width, same padding/border/colors) so this
           toggle reads as just another nav row, and its divider line is the
           same length as every sibling link's - not a real <hr>, but a
           border-bottom, which is what "the hr line" refers to here. */
        .mt-mobile-nav-open .mt-perf-dropdown-toggle {
          display: flex !important; align-items: center !important; justify-content: space-between !important;
          gap: 12px; width: 100%; box-sizing: border-box;
          padding: 15px 4px !important; margin: 0 !important;
          border-bottom: 1px solid #F1EBDF;
          color: #17130F !important; font-size: 1rem !important; font-weight: 600 !important;
        }
        .mt-mobile-nav-open .mt-perf-dropdown.mt-perf-open .mt-perf-dropdown-toggle i { transform: rotate(180deg); }
        /* !important on every property here, not just the ones that looked
           contested: ".mt-perf-dropdown.mt-perf-open .mt-perf-dropdown-menu"
           (the desktop open-state rule, 4 classes = higher specificity than
           this 2-class selector) sets transform: translateX(-50%) - that
           rule matches regardless of viewport (both mobile and desktop
           dropdowns share the .mt-perf-open class), so on mobile its
           translateX kept winning over this rule's "transform: none" and
           dragging the whole menu sideways off-screen even though display
           and position here were correctly applying. Proven with an actual
           headless-Chrome run of this exact page (getComputedStyle showed
           transform still resolving to translateX(-167.5px) before this
           fix) - not guessed from reading the CSS again. */
        .mt-mobile-nav-open .mt-perf-dropdown-menu {
          position: static !important; transform: none !important; box-shadow: none !important; border: none !important;
          opacity: 1 !important; visibility: visible !important; display: none; padding: 0 !important; margin: 0 !important;
        }
        .mt-mobile-nav-open .mt-perf-dropdown.mt-perf-open .mt-perf-dropdown-menu { display: block; }
        /* No left-indent here (unlike the old 16px) - the border-bottom
           these inherit from mobile-nav.js's ".mt-mobile-nav-open a" rule
           now spans the exact same width as every other nav row's. */
        .mt-mobile-nav-open .mt-perf-dropdown-menu a { padding-left: 24px !important; }
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
      const closeMenu = (d) => {
        d.classList.remove('mt-perf-open');
        const menu = d.querySelector('[data-mt-perf-menu]');
        if (menu) menu.style.display = '';
      };

      toggle.addEventListener('click', (e) => {
        // Touch devices (no real :hover) rely on this click-toggle; devices
        // with real hover already opened the menu on hover, so a click
        // there just follows through as a normal link-less button (no href).
        e.preventDefault();
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('mt-perf-open');
        document.querySelectorAll('.mt-perf-dropdown.mt-perf-open').forEach(closeMenu);
        if (isOpen) return;
        dropdown.classList.add('mt-perf-open');
        // Below the mobile-nav collapse breakpoint this menu stacks inline
        // under its toggle instead of floating. That stacked state relied
        // purely on CSS class selectors matching mobile-nav.js's own broad
        // ".mt-mobile-nav-open a/button/div" rules, which kept getting
        // reported as still not showing - rather than keep chasing a
        // specificity/cascade issue blind, force it directly here: the
        // single thing that actually determines whether it's visible.
        const menu = dropdown.querySelector('[data-mt-perf-menu]');
        if (menu && window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches) {
          menu.style.display = 'block';
        }
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.mt-perf-dropdown')) {
        document.querySelectorAll('.mt-perf-dropdown.mt-perf-open').forEach((d) => {
          d.classList.remove('mt-perf-open');
          const menu = d.querySelector('[data-mt-perf-menu]');
          if (menu) menu.style.display = '';
        });
      }
    });
    // Crossing the breakpoint while a menu is open (rotating a tablet, or
    // resizing a browser window) would otherwise leave a stale inline
    // display:block behind on the now-desktop layout, or vice versa.
    window.addEventListener('resize', () => {
      document.querySelectorAll('.mt-perf-dropdown.mt-perf-open [data-mt-perf-menu]').forEach((menu) => {
        menu.style.display = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches ? 'block' : '';
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
