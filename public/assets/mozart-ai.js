(() => {
  const attachmentScript = document.createElement('script'); attachmentScript.src = '/assets/attachment-render.js'; document.head.appendChild(attachmentScript);
  if (/^\/(?:messages\/)?chat(?:\/|$)/.test(location.pathname)) return;
  const host = document.createElement('section'); host.className = 'mozart-ai-widget';
  host.innerHTML = `<button class="mozart-ai-open" aria-label="Open Live Support">♬ <span>Live support</span></button><section class="mozart-ai-panel" aria-hidden="true"><header><div><b>Mozart Live Support</b><small>Message the Mozart Techniques support team</small></div><div class="ai-header-actions"><button class="ai-close" aria-label="Close support chat">×</button></div></header><main></main><div class="ai-file-preview" hidden></div><form><label class="ai-attach" title="Attach a file" aria-label="Attach a file">＋<input type="file" hidden></label><input class="ai-text" maxlength="1600" placeholder="Write a message…" aria-label="Message live support"><button type="submit">Send</button></form></section>`;
  document.body.append(host);
  const open = host.querySelector('.mozart-ai-open'), panel = host.querySelector('.mozart-ai-panel'), close = host.querySelector('.ai-close'), main = host.querySelector('main'), form = host.querySelector('form'), input = host.querySelector('.ai-text'), picker = host.querySelector('input[type=file]'), preview = host.querySelector('.ai-file-preview');
  let messages = [], supportThread = null, selectedFile = null, selectedObjectUrl = null;
  const esc = (value) => String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const isImage = (file) => /^image\//.test((file && file.type) || '');
  const isPdf = (file) => /pdf$/i.test((file && file.type) || '') || /\.pdf$/i.test((file && file.name) || '');
  function attachment(file) {
    const url = esc(file.url), name = esc(file.name || 'Attachment');
    if (isImage(file)) return `<a class="ai-image-attachment" data-mt-file="1" href="${url}" target="_blank" rel="noopener" aria-label="Open image"><img src="${url}" alt="Attached image"></a>`;
    if (/^video\//.test(file.type || '')) return `<video class="chat-media" controls src="${url}"></video>`;
    if (/^audio\//.test(file.type || '')) return `<audio class="chat-media" controls src="${url}"></audio>`;
    const icon = isPdf(file) ? 'PDF' : 'FILE', label = isPdf(file) ? 'Open PDF' : 'Open file';
    return `<a class="ai-document-attachment" data-mt-file="1" href="${url}" target="_blank" rel="noopener"><span class="ai-document-icon">${icon}</span><span class="ai-document-copy"><strong>${name}</strong><small>${label}</small></span></a>`;
  }
  function draw() {
    const agentName = (supportThread && supportThread.assignedAgentName) || 'Live support';
    main.innerHTML = messages.length ? messages.map((message) => `<p class="${message.sender === 'user' ? 'user-message' : 'ai-message'}"><b>${message.sender === 'user' ? 'You' : esc(agentName)}</b><br>${message.attachment ? attachment(message.attachment) : esc(message.text)}</p>`).join('') : '<p class="ai-message">Hello! Send a message and a Mozart Techniques support agent will reply here.</p>';
    main.scrollTop = main.scrollHeight;
  }
  async function refresh() { try { const response = await fetch('/api/mozart-ai/thread'); if (!response.ok) return; const data = await response.json(); supportThread = data.thread; messages = data.thread.messages || []; draw(); } catch (_) {} }
  function clearSelectedFile() { picker.value = ''; selectedFile = null; preview.hidden = true; preview.innerHTML = ''; if (selectedObjectUrl) URL.revokeObjectURL(selectedObjectUrl); selectedObjectUrl = null; }
  function showSelectedFile(file) {
    clearSelectedFile(); selectedFile = file; selectedObjectUrl = isImage(file) ? URL.createObjectURL(file) : null; preview.hidden = false;
    preview.innerHTML = isImage(file) ? `<button type="button" class="ai-selected-image" aria-label="Choose another image"><img src="${selectedObjectUrl}" alt="Selected image preview"></button><button type="button" class="ai-file-cancel" aria-label="Remove attachment">×</button>` : `<button type="button" class="ai-selected-document" aria-label="Choose another file"><span>${isPdf(file) ? 'PDF' : 'FILE'}</span><strong>${esc(file.name)}</strong><small>Ready to send</small></button><button type="button" class="ai-file-cancel" aria-label="Remove attachment">×</button>`;
    preview.querySelector('.ai-file-cancel').onclick = clearSelectedFile; preview.querySelector('button:not(.ai-file-cancel)').onclick = () => picker.click();
  }
  async function sendAttachment() {
    if (!selectedFile) return false; const payload = new FormData(); payload.append('file', selectedFile);
    try { const response = await fetch('/api/mozart-ai/attachment', { method: 'POST', body: payload }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to upload file.'); clearSelectedFile(); await refresh(); return true; } catch (error) { alert(error.message || 'Unable to upload file.'); return false; }
  }
  const show = (state) => { host.classList.toggle('open', state); panel.setAttribute('aria-hidden', String(!state)); if (state) { refresh(); input.focus(); } };
  open.onclick = () => show(!host.classList.contains('open')); close.onclick = () => show(false);
  form.onsubmit = async (event) => {
    event.preventDefault(); if (selectedFile) { await sendAttachment(); return; }
    const text = input.value.trim(); if (!text) return; input.value = ''; messages.push({ id: `local-${Date.now()}`, sender: 'user', text }); draw();
    try { const response = await fetch('/api/mozart-ai/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }); const data = await response.json(); if (response.status === 401) throw new Error('Please sign in first.'); if (!response.ok) throw new Error(data.error || 'Unable to send your message.'); await refresh(); } catch (error) { messages.push({ id: `error-${Date.now()}`, sender: 'assistant', text: error.message || 'Unable to send your message.' }); draw(); }
  };
  picker.onchange = () => { const file = picker.files[0]; if (file) showSelectedFile(file); };
  setInterval(() => { if (host.classList.contains('open')) refresh(); }, 10000);
  if (new URLSearchParams(location.search).get('open-live-support') === '1') setTimeout(() => show(true), 250);
})();
