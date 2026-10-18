(function () {
  'use strict';
  window.MozartTeachingTools = {
    open(options = {}) {
      if (document.getElementById('mozart-teaching-dialog')) return;
      const previousFocus = document.activeElement;
      const dialog = document.createElement('dialog');
      dialog.id = 'mozart-teaching-dialog';
      const label = options.role === 'student' ? 'Student tools' : 'Teaching tools';
      dialog.setAttribute('aria-label', label);
      Object.assign(dialog.style, { width: 'min(1360px, 96vw)', height: 'min(1000px, 94dvh)', padding: '0', border: '1px solid #e7dfd3', borderRadius: '22px', overflow: 'hidden', boxShadow: '0 30px 70px rgba(23,19,15,0.35)' });
      const body = document.createElement('div');
      Object.assign(body.style, { display: 'flex', flexDirection: 'column', height: '100%' });
      const close = document.createElement('button');
      close.type = 'button'; close.textContent = '← Back to chat';
      Object.assign(close.style, {
        padding: '14px',
        background: 'linear-gradient(135deg, #c41822, #ff3342)',
        color: '#fff',
        border: '0',
        cursor: 'pointer',
        fontWeight: '700',
        fontFamily: '"Science Gothic", sans-serif',
        fontSize: '14px',
        letterSpacing: '0.01em',
      });
      const frame = document.createElement('iframe');
      frame.src = `/teaching-tools/index.html?role=${options.role === 'student' ? 'student' : 'teacher'}`; frame.title = `Mozart ${label.toLowerCase()}`;
      frame.allow = 'camera; microphone; midi; fullscreen';
      frame.allowFullscreen = true;
      Object.assign(frame.style, { border: '0', width: '100%', flex: '1', minHeight: '0' });
      body.append(close, frame); dialog.append(body); document.body.append(dialog);
      close.onclick = () => dialog.close();
      const onMessage = (event) => { if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'mozart-close-tools') dialog.close(); };
      window.addEventListener('message', onMessage);
      dialog.addEventListener('close', () => { window.removeEventListener('message', onMessage); frame.src = 'about:blank'; dialog.remove(); previousFocus?.focus(); }, { once: true });
      dialog.showModal();
    }
  };
})();
