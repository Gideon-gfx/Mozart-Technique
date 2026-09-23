(() => {
  const nav = document.querySelector('.site-nav');
  const bar = nav?.querySelector('.site-nav-inner');
  if (!bar) return;
  const drawer = document.createElement('dialog');
  drawer.id = 'performer-drawer'; drawer.className = 'performer-drawer';
  drawer.setAttribute('aria-labelledby', 'performer-drawer-title');
  drawer.innerHTML = '<header><h2 id="performer-drawer-title">Performer menu</h2><button type="button" aria-label="Close performer menu">×</button></header><nav aria-label="Performer navigation"><a href="/become-performer">Become a Performer</a><a href="/find-performer#request-form-card">Request a Performer</a><a href="/performance-requests">My Requests</a><a href="/find-performer">Find a Performer</a></nav>';
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'performer-menu-toggle';
  toggle.innerHTML = '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
  toggle.setAttribute('aria-label', 'Toggle navigation menu');
  const siteMenu = document.createElement('nav');
  siteMenu.id = 'performer-site-menu'; siteMenu.className = 'performer-site-menu'; siteMenu.hidden = true;
  siteMenu.setAttribute('aria-label', 'Site navigation');
  for (const [label, href] of [['Home','/home'],['Find a Tutor','/find-tutor'],['Become a Tutor','/become-tutor'],['Sponsors','/become-sponsor'],['About','/about'],['Store','/store'],['Become a Performer','/become-performer'],['Find a Performer','/find-performer'],['Contact','/contact'],['Search','/search']]) {
    const link = document.createElement('a'); link.textContent = label; link.href = href; siteMenu.append(link);
  }
  function closeSiteMenu() { siteMenu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  toggle.setAttribute('aria-controls', siteMenu.id); toggle.setAttribute('aria-expanded', 'false');
  toggle.onclick = () => { siteMenu.hidden = !siteMenu.hidden; toggle.setAttribute('aria-expanded', String(!siteMenu.hidden)); };
  siteMenu.addEventListener('click', event => { if (event.target.closest('a')) closeSiteMenu(); });
  document.addEventListener('click', event => { if (!siteMenu.contains(event.target) && !toggle.contains(event.target)) closeSiteMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !siteMenu.hidden) { closeSiteMenu(); toggle.focus(); } });
  window.matchMedia('(max-width: 800px)').addEventListener('change', event => { if (!event.matches) closeSiteMenu(); });
  nav.append(siteMenu);
  const pageToggle = document.createElement('button');
  pageToggle.type = 'button'; pageToggle.className = 'performer-page-menu';
  pageToggle.innerHTML = '<i class="fa-solid fa-table-columns" aria-hidden="true"></i> Performer menu';
  const triggers = [pageToggle];
  let previousOverflow = '', opener;
  let closing = false;
  function closeDrawer(after) {
    if (!drawer.open || closing) return;
    closing = true; drawer.classList.add('closing');
    const finish = () => { drawer.close(); drawer.classList.remove('closing'); closing = false; if (after) after(); };
    setTimeout(finish, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 270);
  }
  drawer.addEventListener('cancel', event => { event.preventDefault(); closeDrawer(); });
  function sync(open) { triggers.forEach(button => button.setAttribute('aria-expanded', String(open))); }
  triggers.forEach(button => {
    button.setAttribute('aria-controls', drawer.id); button.setAttribute('aria-haspopup', 'dialog');
    button.onclick = () => { opener = button; previousOverflow = document.body.style.overflow; drawer.showModal(); document.body.style.overflow = 'hidden'; sync(true); };
  });
  drawer.querySelector('button').onclick = () => closeDrawer();
  drawer.addEventListener('click', event => {
    if (event.target === drawer) {
      const box = drawer.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDrawer();
    }
    const link = event.target.closest('a');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); closeDrawer(() => { location.href = link.href; }); }
  });
  drawer.addEventListener('close', () => { document.body.style.overflow = previousOverflow; sync(false); opener?.focus(); });
  window.matchMedia('(max-width: 800px)').addEventListener('change', event => { if (!event.matches && drawer.open) drawer.close(); });
  bar.append(toggle); nav.after(pageToggle, drawer); sync(false);
})();
