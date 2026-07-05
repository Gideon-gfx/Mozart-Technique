// Adds a hamburger toggle for the header nav links on small screens.
// Works across pages regardless of whether the nav uses Tailwind's
// "hidden md:flex" pattern or home.html's plain-CSS ".nav-links" class.
(function () {
  const STYLE_ID = 'mt-mobile-nav-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .mt-mobile-toggle {
        display: none;
        background: none;
        border: none;
        font-size: 1.4rem;
        line-height: 1;
        cursor: pointer;
        color: #c41822;
        padding: .25rem .5rem;
        margin-left: .5rem;
      }
      @media (max-width: 768px) {
        .mt-mobile-toggle { display: inline-flex; align-items: center; }
      }
      .mt-mobile-nav-open {
        display: flex !important;
        flex-direction: column !important;
        align-items: flex-start !important;
        gap: 1rem !important;
        position: absolute;
        top: 100%;
        left: 0;
        width: 100%;
        background: #fff;
        padding: 1.25rem 1.5rem 1.5rem;
        box-shadow: 0 12px 24px rgba(0,0,0,.14);
        z-index: 60;
        margin: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  function findNavContainer() {
    const all = document.querySelectorAll('header *');
    for (const el of all) {
      const cl = el.classList;
      if (cl.contains('nav-links')) return el;
      if (cl.contains('hidden') && Array.from(cl).some((c) => c.indexOf('md:flex') === 0)) return el;
    }
    return null;
  }

  function init() {
    const nav = findNavContainer();
    if (!nav || nav.dataset.mtMobileWired) return;
    nav.dataset.mtMobileWired = 'true';

    injectStyle();

    const header = nav.closest('header');
    if (header && getComputedStyle(header).position === 'static') {
      header.style.position = 'relative';
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mt-mobile-toggle';
    toggle.setAttribute('aria-label', 'Toggle navigation menu');
    toggle.innerHTML = '<i class="fa-solid fa-bars"></i>';

    nav.parentNode.insertBefore(toggle, nav);

    toggle.addEventListener('click', () => {
      const isOpen = nav.classList.toggle('mt-mobile-nav-open');
      nav.classList.toggle('hidden', !isOpen);
      toggle.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
