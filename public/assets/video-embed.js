// Shared inline video embedding - one place that knows how to turn a
// recording/clip URL (a locally uploaded file, YouTube, Vimeo, Google
// Drive, or some other external link) into a playable embed, so every
// surface that lists videos (library, lesson chat, dashboard, tutor
// dashboard) plays them in place instead of navigating away to a raw file
// or a new tab.
(function () {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  // heightClass lets each caller size the embed for its own layout
  // (library cards vs. a modal), defaulting to a sensible modal size.
  function embedHtml(url, title, heightClass) {
    const safeUrl = String(url || '');
    const heightCls = heightClass || 'w-full h-[60vh]';
    const directVideo = /(\.(mp4|webm|ogg|mov|m4v|m3u8)(?:[?#]|$)|\/uploads\/)/i.test(safeUrl);
    if (directVideo) {
      return `<video src="${escapeHtml(safeUrl)}" class="${heightCls} bg-black" controls autoplay preload="metadata"></video>`;
    }
    const youtube = safeUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/i);
    if (youtube) {
      const playerUrl = `https://www.youtube-nocookie.com/embed/${youtube[1]}?autoplay=1`;
      return `<iframe src="${escapeHtml(playerUrl)}" title="${escapeHtml(title || 'Video')}" class="${heightCls} bg-black" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    }
    const vimeo = safeUrl.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeo) {
      const playerUrl = `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
      return `<iframe src="${escapeHtml(playerUrl)}" title="${escapeHtml(title || 'Video')}" class="${heightCls} bg-black" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
    }
    const googleDrive = safeUrl.match(/drive\.google\.com\/file\/d\/([\w-]+)/i) || safeUrl.match(/drive\.google\.com\/uc\?id=([\w-]+)/i);
    if (googleDrive) {
      const playerUrl = `https://drive.google.com/file/d/${googleDrive[1]}/preview`;
      return `<iframe src="${escapeHtml(playerUrl)}" title="${escapeHtml(title || 'Video')}" class="${heightCls} bg-black" allow="autoplay; fullscreen" allowfullscreen loading="lazy"></iframe>`;
    }
    return `
      <div class="${heightCls} bg-gradient-to-br from-stone-100 to-red-50 border border-dashed border-red-200 flex items-center justify-center px-4 text-center">
        <div>
          <i class="fa-solid fa-link text-2xl text-primary-red mb-3"></i>
          <p class="text-sm font-semibold text-gray-700 mb-2">External link</p>
          <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center px-3 py-2 rounded-lg bg-primary-red text-white text-xs font-semibold">Open media source</a>
        </div>
      </div>
    `;
  }

  let modalEl = null;
  function ensureModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement('div');
    modalEl.id = 'mt-video-modal';
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    modalEl.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;background:rgba(17,17,17,.78);padding:20px;';
    modalEl.innerHTML = `
      <div style="width:min(880px,100%);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <p id="mt-video-modal-title" style="color:#fff;font-weight:700;font-size:14px;margin:0;"></p>
          <button type="button" id="mt-video-modal-close" style="border:none;background:rgba(255,255,255,.12);color:#fff;width:32px;height:32px;border-radius:999px;cursor:pointer;font-size:14px;">&times;</button>
        </div>
        <div id="mt-video-modal-body" style="border-radius:12px;overflow:hidden;background:#000;"></div>
      </div>
    `;
    document.body.appendChild(modalEl);
    const close = () => { modalEl.style.display = 'none'; document.getElementById('mt-video-modal-body').innerHTML = ''; };
    modalEl.addEventListener('click', (e) => { if (e.target === modalEl) close(); });
    document.getElementById('mt-video-modal-close').addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalEl.style.display !== 'none') close(); });
    return modalEl;
  }

  function openModal(url, title) {
    const modal = ensureModal();
    document.getElementById('mt-video-modal-title').textContent = title || 'Video';
    document.getElementById('mt-video-modal-body').innerHTML = embedHtml(url, title, 'w-full h-[60vh]');
    modal.style.display = 'flex';
  }

  window.MTVideo = { embedHtml, openModal };
})();
