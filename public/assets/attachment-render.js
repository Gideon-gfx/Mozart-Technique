(() => {
  if (document.getElementById('mt-attachment-style')) return;
  const style = document.createElement('style'); style.id = 'mt-attachment-style';
  style.textContent = `.mt-attachment{display:block;margin-top:7px;text-decoration:none;color:inherit;max-width:260px}.mt-attachment img{display:block;max-width:100%;max-height:210px;object-fit:cover;border-radius:10px;border:1px solid #ffffff55}.mt-document{display:flex;align-items:center;gap:9px;padding:10px;background:#fff;border:1px solid #e1d8d1;border-radius:11px;color:#28201d;box-shadow:0 2px 7px #2b130e14}.mt-document .mt-doc-icon{width:30px;height:37px;border-radius:5px;background:#c41822;color:#fff;display:grid;place-items:center;font-size:10px;font-weight:800}.mt-document span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;font-size:12px}.mt-document small{display:block;color:#756d68;font-size:10px;margin-top:3px}.user-message .mt-document{background:#fff8f8}.mt-pdf-frame{display:block;width:260px;height:225px;border:0;border-radius:10px;background:#fff;margin-top:7px}`;
  document.head.append(style);
  const render = () => document.querySelectorAll('.message a:not([data-mt-file]), .mozart-ai-panel main p a:not([data-mt-file])').forEach((link) => {
    const href = link.href || ''; const name = link.textContent.replace(/^📎\s*/, '').trim() || 'Attachment';
    if (!href || !/\/uploads\/chat\//.test(href)) return;
    link.dataset.mtFile = '1'; const lower = (name + href).toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp)(?:[?#]|$)/.test(lower)) { link.innerHTML = `<img src="${href}" alt="${name}">`; link.className = 'mt-attachment'; link.target = '_blank'; return; }
    if (/\.pdf(?:[?#]|$)/.test(lower)) { link.className = 'mt-attachment'; link.innerHTML = `<div class="mt-document"><div class="mt-doc-icon">PDF</div><div><span>${name}</span><small>Open PDF document</small></div></div>`; link.target = '_blank'; return; }
    link.className = 'mt-attachment'; link.innerHTML = `<div class="mt-document"><div class="mt-doc-icon">FILE</div><div><span>${name}</span><small>Open attachment</small></div></div>`; link.target = '_blank';
  });
  new MutationObserver(render).observe(document.documentElement, { childList: true, subtree: true }); render();
})();
