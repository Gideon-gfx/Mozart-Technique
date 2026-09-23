// Shared chat controller - the same bubbles, composer, attachment menu,
// reactions, replies, date separators and mobile gestures built for the 1:1
// lesson chat (public/chat.html), lifted into a reusable form so every other
// chat surface (group chat, org chat) stops being a separate, partial,
// inconsistent implementation. A host page calls ChatKit.mount(root, config)
// once; config supplies the REST calls (each surface's underlying routes
// differ) and everything else - rendering, popovers, gestures - is shared.
(function () {
  const REACTION_EMOJI = ['👍', '❤️', '😂', '😢', '🙏'];
  const EMOJI = ['😀','😃','😄','😁','😊','🙂','😉','😍','🥰','😘','😎','🤩','🤔','🙃','😅','😂','🤣','🥲','😢','😭','😤','😳','🥳','🤗','🙌','👏','👍','👎','🙏','💪','👋','🤝','❤️','🧡','💛','💚','💙','💜','🔥','✨','⭐','🎵','🎶','🎹','🎸','🥁','🎤','🎧','🎻','🎺','🎷','📀','⏰','✅','❌','❓','❗','💯','🎉','🎊','📝','📚'];

  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }
  function linkifyHtml(text) {
    const safe = escapeHtml(String(text || ''));
    return safe.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi, (match) => {
      const href = match.startsWith('http') ? match : `https://${match}`;
      return `<a href="${escapeHtml(href)}" class="underline decoration-inherit hover:opacity-80">${escapeHtml(match)}</a>`;
    });
  }
  function dateLabel(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const sameDay = (a, b) => a.toDateString() === b.toDateString();
    if (sameDay(date, today)) return 'Today';
    if (sameDay(date, yesterday)) return 'Yesterday';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
  }

  function mount(root, config) {
    const cfg = Object.assign({
      isGroup: false, allowLocation: false, library: null,
      uploadUrl: '/api/chat/upload', pollMs: 15000,
      onAlert: (message) => { console.warn(message); },
    }, config);

    root.innerHTML = `
      <div class="ck-root">
        <div class="ck-body" data-ck-body></div>
        <div class="ck-reply-banner" hidden data-ck-reply-banner>
          <div class="ck-reply-body"><span class="ck-reply-name" data-ck-reply-name></span><span class="ck-reply-text" data-ck-reply-text></span></div>
          <button type="button" data-ck-cancel-reply title="Cancel reply"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="ck-edit-banner" hidden data-ck-edit-banner>
          <span><i class="fa-solid fa-pen mr-1"></i> Editing message</span>
          <button type="button" data-ck-cancel-edit title="Cancel edit"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <form class="ck-composer" data-ck-form>
          <button type="button" class="ck-composer-icon" data-ck-clip-btn title="Attach"><i class="fa-solid fa-paperclip"></i></button>
          <div class="ck-composer-bar">
            <textarea class="ck-composer-input" rows="1" placeholder="Message" data-ck-input></textarea>
            <button type="button" class="ck-composer-icon" data-ck-emoji-btn title="Emoji"><i class="fa-regular fa-face-smile"></i></button>
          </div>
          <button type="submit" class="ck-composer-send" data-ck-send-btn title="Hold to record a voice note"><i class="fa-solid fa-microphone" data-ck-send-icon></i></button>
          <input type="file" hidden data-ck-doc-input accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.csv,.zip">
          <input type="file" hidden data-ck-media-input accept="image/*,video/*">
          <input type="file" hidden data-ck-audio-input accept="audio/*">
          <input type="file" hidden data-ck-camera-input accept="image/*" capture="environment">
        </form>
        <div class="ck-clip-menu" hidden data-ck-clip-menu>
          <button type="button" data-clip="doc"><i class="fa-regular fa-file-lines"></i> Documents</button>
          <button type="button" data-clip="media"><i class="fa-regular fa-image"></i> Photos &amp; Videos</button>
          <button type="button" data-clip="camera"><i class="fa-solid fa-camera"></i> Camera</button>
          <button type="button" data-clip="audio"><i class="fa-solid fa-music"></i> Audio</button>
          <button type="button" data-clip="teaching-tools"><i class="fa-solid fa-chalkboard-user"></i> Teaching Tools</button>
          <button type="button" data-clip="library" class="${cfg.library ? '' : 'hidden'}"><i class="fa-solid fa-photo-film"></i> ${cfg.library ? escapeHtml(cfg.library.label || 'Library') : ''}</button>
          <button type="button" data-clip="poll"><i class="fa-solid fa-square-poll-vertical"></i> Poll</button>
          <button type="button" data-clip="location" class="${cfg.allowLocation ? '' : 'hidden'}"><i class="fa-solid fa-location-dot"></i> Location</button>
        </div>
        <div class="ck-emoji-panel" hidden data-ck-emoji-panel></div>
        <div class="ck-attach-preview" hidden data-ck-attach-preview></div>
        <div class="ck-recording-bar" hidden data-ck-recording-bar>
          <span class="ck-rec-dot"></span><span>Recording <span data-ck-rec-time>0:00</span></span>
          <button type="button" class="ck-rec-cancel" data-ck-rec-cancel>Cancel</button>
          <button type="button" class="ck-rec-send" data-ck-rec-send>Send</button>
        </div>
      </div>
    `;

    const popoverHost = document.createElement('div');
    popoverHost.innerHTML = `
      <div class="ck-popover" id="ck-msg-menu-${cfg.instanceId}" hidden>
        <button type="button" data-action="reply"><i class="fa-solid fa-reply"></i> Reply</button>
        <button type="button" data-action="copy"><i class="fa-regular fa-copy"></i> Copy</button>
        <button type="button" data-action="share"><i class="fa-solid fa-share-nodes"></i> Share</button>
        <button type="button" data-action="pin"><i class="fa-solid fa-thumbtack"></i> <span data-pin-label>Pin</span></button>
        <button type="button" data-action="edit" class="mine-only"><i class="fa-solid fa-pen"></i> Edit</button>
        <button type="button" data-action="delete" class="danger"><i class="fa-solid fa-trash"></i> Delete</button>
      </div>
      <div class="ck-react-picker" id="ck-react-picker-${cfg.instanceId}" hidden>${REACTION_EMOJI.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
      <div class="ck-popover" id="ck-delete-popover-${cfg.instanceId}" hidden>
        <button type="button" data-delete="me">Delete for me</button>
        <button type="button" data-delete="everyone" data-delete-everyone>Delete for everyone</button>
        <p class="ck-hint" data-delete-hint></p>
      </div>
      <div class="ck-poll-backdrop" id="ck-poll-backdrop-${cfg.instanceId}" hidden>
        <div class="ck-poll-modal">
          <h3>Create a poll</h3>
          <input type="text" data-poll-question placeholder="Ask a question" maxlength="200">
          <div data-poll-options></div>
          <button type="button" class="ck-poll-add-option" data-poll-add-option>+ Add option</button>
          <div class="ck-poll-actions">
            <button type="button" class="ck-poll-cancel" data-poll-cancel>Cancel</button>
            <button type="button" class="ck-poll-submit" data-poll-submit>Send poll</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(popoverHost);

    const el = (sel) => root.querySelector(sel);
    const body = el('[data-ck-body]');
    const form = el('[data-ck-form]');
    const input = el('[data-ck-input]');
    const sendBtn = el('[data-ck-send-btn]');
    const sendIcon = el('[data-ck-send-icon]');
    const clipMenu = el('[data-ck-clip-menu]');
    const emojiPanel = el('[data-ck-emoji-panel]');
    const attachPreview = el('[data-ck-attach-preview]');
    const recordingBar = el('[data-ck-recording-bar]');
    const msgMenu = popoverHost.querySelector(`#ck-msg-menu-${cfg.instanceId}`);
    const reactPicker = popoverHost.querySelector(`#ck-react-picker-${cfg.instanceId}`);
    const deletePopover = popoverHost.querySelector(`#ck-delete-popover-${cfg.instanceId}`);
    const pollBackdrop = popoverHost.querySelector(`#ck-poll-backdrop-${cfg.instanceId}`);

    let currentMessages = [];
    let lastSignature = '';
    let editingMessageId = null;
    let replyingToId = null;
    let openMenuMessageId = null;
    let reactPickerMessageId = null;
    let deletePopoverMessageId = null;
    let pendingAttachment = null;

    const EDIT_WINDOW_MS = 30 * 60 * 1000;
    const DELETE_EVERYONE_WINDOW_MS = 10 * 60 * 1000;
    function messageAgeMs(m) { return Date.now() - new Date(m.createdAt).getTime(); }
    function findMessage(id) { return currentMessages.find((m) => String(m.id) === String(id)); }
    function isMine(m) { return m.senderId === cfg.me.id; }
    function recipientHasSeen(m) {
      // Only meaningful for a strict 2-party thread - org/group conversations
      // fall back to "seen by anyone else" via whatever readBy fields the
      // message carries (matches server.js's orgMessageSeenByOthers).
      const fields = Object.keys(m).filter((k) => k.startsWith('readBy'));
      const senderField = m.senderRole ? `readBy${m.senderRole[0].toUpperCase()}${m.senderRole.slice(1)}` : (m.senderType ? `readBy${m.senderType[0].toUpperCase()}${m.senderType.slice(1)}` : null);
      return fields.filter((f) => f !== senderField).some((f) => Boolean(m[f]));
    }

    function quoteSnippet(m) {
      if (!m) return 'Original message unavailable';
      if (m.deleted) return 'This message was deleted';
      if (m.text) return m.text;
      if (m.attachment) return ({ image: 'Photo', video: 'Video', audio: 'Voice note' }[m.attachment.kind] || m.attachment.name || 'Attachment');
      if (m.poll) return `Poll: ${m.poll.question}`;
      if (m.location) return 'Location';
      return 'Message';
    }

    function reactionsHtml(m) {
      const reactions = m.reactions || [];
      if (!reactions.length) return '';
      const byEmoji = {};
      reactions.forEach((r) => { byEmoji[r.emoji] = (byEmoji[r.emoji] || 0) + 1; });
      return `<div class="ck-reactions">${Object.entries(byEmoji).map(([emoji, count]) => `<span class="ck-reaction-pill">${emoji}${count > 1 ? `<span class="count">${count}</span>` : ''}</span>`).join('')}</div>`;
    }

    function pollHtml(m) {
      if (!m.poll) return '';
      const votes = m.poll.votes || [];
      const total = votes.length;
      const myVote = votes.find((v) => v.userId === cfg.me.id);
      return `<div class="ck-poll-block" data-poll-id="${m.id}">
        <p class="ck-poll-question">${escapeHtml(m.poll.question)}</p>
        ${m.poll.options.map((option) => {
          const optionVotes = votes.filter((v) => v.optionId === option.id).length;
          const pct = total ? Math.round((optionVotes / total) * 100) : 0;
          const voted = myVote && myVote.optionId === option.id;
          return `<div class="ck-poll-option${voted ? ' voted' : ''}" data-poll-option="${option.id}" data-message-id="${m.id}"><div class="ck-poll-bar" style="width:${pct}%"></div><span class="ck-poll-option-label"><span>${voted ? '<i class="fa-solid fa-check mr-1"></i>' : ''}${escapeHtml(option.text)}</span><span>${pct}%</span></span></div>`;
        }).join('')}
        <p class="ck-poll-meta">${total} vote${total === 1 ? '' : 's'}</p>
      </div>`;
    }

    function locationHtml(m) {
      if (!m.location) return '';
      const { lat, lng } = m.location;
      const bbox = `${lng - 0.01},${lat - 0.008},${lng + 0.01},${lat + 0.008}`;
      return `<a class="ck-loc-block" href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}" target="_blank" rel="noopener">
        <iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${lat},${lng}&layer=mapnik" loading="lazy"></iframe>
        <span><i class="fa-solid fa-location-dot mr-1"></i>Open in Maps</span>
      </a>`;
    }

    function bubbleHtml(m) {
      const mine = isMine(m);
      if (m.deleted) {
        return `<div class="ck-row ${mine ? 'justify-end' : 'justify-start'}" data-id="${m.id}"><div class="ck-bubble ${mine ? 'mine' : 'theirs'}" style="opacity:.65;font-style:italic;"><i class="fa-solid fa-ban mr-1"></i>This message was deleted</div></div>`;
      }
      const replyTo = m.replyToId ? findMessage(m.replyToId) : null;
      const quoteHtml = m.replyToId ? `<div class="ck-quote" data-goto="${m.replyToId}"><span class="ck-quote-name">${escapeHtml(replyTo && isMine(replyTo) ? 'You' : (replyTo ? (replyTo.senderName || 'Them') : ''))}</span><span class="ck-quote-text">${escapeHtml(quoteSnippet(replyTo))}</span></div>` : '';
      const a = m.attachment;
      let attachmentHtml = '';
      if (a) {
        const url = escapeHtml(a.url);
        const name = escapeHtml(a.name || 'file');
        if (a.kind === 'image') attachmentHtml = `<a href="${url}" target="_blank"><img src="${url}" alt="${name}" class="ck-att-img"></a>`;
        else if (a.kind === 'video') attachmentHtml = `<video src="${url}" controls preload="metadata" class="ck-att-video"></video>`;
        else if (a.kind === 'audio') attachmentHtml = `<audio src="${url}" controls preload="metadata" class="ck-att-audio"></audio>`;
        else attachmentHtml = `<a href="${url}" download class="ck-att-file">${'<i class="fa-regular fa-file-lines"></i>'}${name}</a>`;
      }
      const stamp = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const editedTag = m.editedAt ? '<span class="ck-edited-tag">(edited)</span>' : '';
      const pinBadge = m.pinned ? '<i class="fa-solid fa-thumbtack ck-pin-badge"></i>' : '';
      const senderLabel = (!mine && cfg.isGroup && m.senderName) ? `<span class="ck-sender">${escapeHtml(m.senderName)}</span>` : '';
      const trigger = `<button type="button" class="ck-trigger" data-msg-trigger data-id="${m.id}" aria-label="Message options"><i class="fa-solid fa-ellipsis-vertical"></i></button>`;
      const reactTrigger = `<button type="button" class="ck-react-trigger" data-react-trigger data-id="${m.id}" aria-label="React"><i class="fa-regular fa-face-smile"></i></button>`;
      const hasBody = m.text || attachmentHtml || m.poll || m.location;
      const bubble = `<div class="ck-bubble ${mine ? 'mine' : 'theirs'}" data-bubble>
        ${senderLabel}${quoteHtml}${attachmentHtml}${pollHtml(m)}${locationHtml(m)}
        ${m.text ? `<p class="whitespace-pre-wrap">${pinBadge}${linkifyHtml(m.text)}${editedTag}<span class="ck-stamp">${stamp}</span></p>` : hasBody ? `<span class="ck-stamp" style="float:none;top:0;display:block;margin:2px 0 0">${pinBadge}${editedTag} ${stamp}</span>` : ''}
        ${reactionsHtml(m)}
      </div>`;
      return `<div class="ck-row ${mine ? 'justify-end' : 'justify-start'}" data-id="${m.id}">
        <span class="ck-swipe-icon"><i class="fa-solid fa-reply"></i></span>
        ${mine ? trigger + reactTrigger + bubble : bubble + reactTrigger + trigger}
      </div>`;
    }

    function renderList(messages) {
      let html = '';
      let lastDateKey = null;
      messages.forEach((m) => {
        const dateKey = new Date(m.createdAt).toDateString();
        if (dateKey !== lastDateKey) { html += `<div class="ck-date-sep"><span>${dateLabel(m.createdAt)}</span></div>`; lastDateKey = dateKey; }
        html += bubbleHtml(m);
      });
      return html;
    }

    function positionPopover(popoverEl, anchorRect, width, height) {
      let left = anchorRect.left;
      let top = anchorRect.bottom + 6;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (top + height > window.innerHeight - 8) top = anchorRect.top - height - 6;
      popoverEl.style.left = `${Math.max(8, left)}px`;
      popoverEl.style.top = `${Math.max(8, top)}px`;
    }

    function closeMsgMenu() { msgMenu.hidden = true; openMenuMessageId = null; }
    function closeReactPicker() { reactPicker.hidden = true; reactPickerMessageId = null; }
    function closeDeletePopover() { deletePopover.hidden = true; deletePopoverMessageId = null; }
    function closeClipMenu() { clipMenu.hidden = true; }
    function closeAllPopovers() { closeMsgMenu(); closeReactPicker(); closeDeletePopover(); closeClipMenu(); }

    function openMenuForMessage(id, anchorRect) {
      const m = findMessage(id);
      if (!m || m.deleted) return;
      openMenuMessageId = id;
      const mine = isMine(m);
      msgMenu.querySelectorAll('.mine-only').forEach((btn) => btn.classList.toggle('hidden', !mine));
      const editBtn = msgMenu.querySelector('[data-action="edit"]');
      if (editBtn) editBtn.classList.toggle('hidden', !mine || messageAgeMs(m) > EDIT_WINDOW_MS);
      msgMenu.querySelector('[data-pin-label]').textContent = m.pinned ? 'Unpin' : 'Pin';
      positionPopover(msgMenu, anchorRect, 190, 230);
      msgMenu.hidden = false;
    }
    function openReactPicker(id, anchorRect) {
      const m = findMessage(id);
      if (!m || m.deleted) return;
      reactPickerMessageId = id;
      const mine = (m.reactions || []).find((r) => r.userId === cfg.me.id);
      reactPicker.querySelectorAll('button').forEach((btn) => btn.classList.toggle('active', Boolean(mine) && mine.emoji === btn.dataset.emoji));
      positionPopover(reactPicker, anchorRect, 210, 40);
      reactPicker.hidden = false;
    }
    function openDeletePopover(id, anchorRect) {
      const m = findMessage(id);
      if (!m) return;
      deletePopoverMessageId = id;
      const mine = isMine(m);
      const seen = recipientHasSeen(m);
      const tooOld = messageAgeMs(m) > DELETE_EVERYONE_WINDOW_MS;
      const everyoneBtn = deletePopover.querySelector('[data-delete-everyone]');
      everyoneBtn.disabled = !mine || seen || tooOld;
      deletePopover.querySelector('[data-delete-hint]').textContent = !mine
        ? 'Only the sender can delete this for everyone.'
        : tooOld ? 'This message is more than 10 minutes old, so this can only be deleted for you.'
        : seen ? 'Already seen, so this can only be deleted for you.' : 'Deleting for everyone removes it for both of you.';
      positionPopover(deletePopover, anchorRect, 208, 96);
      deletePopover.hidden = false;
    }
    function openClipMenuAt() {
      closeAllPopovers();
      const rect = el('[data-ck-clip-btn]').getBoundingClientRect();
      clipMenu.style.left = `${Math.max(8, rect.left)}px`;
      clipMenu.hidden = false;
      clipMenu.style.maxHeight = `${Math.max(120, window.innerHeight - 24)}px`;
      clipMenu.style.overflowY = 'auto';
      clipMenu.style.top = `${Math.max(8, rect.top - clipMenu.offsetHeight - 8)}px`;
    }

    async function refresh(scroll) {
      const data = await cfg.api.list();
      if (!data || !data.success) return;
      const visible = (data.messages || []).filter((m) => !(m.deletedForUserIds || []).includes(cfg.me.id));
      currentMessages = visible;
      const signature = visible.map((m) => `${m.id}:${m.text}:${m.deleted ? 1 : 0}:${m.pinned ? 1 : 0}:${m.editedAt || ''}:${(m.reactions || []).map((r) => r.userId + r.emoji).join(',')}:${m.poll ? m.poll.votes.length : ''}`).join('|');
      if (signature === lastSignature) return;
      lastSignature = signature;
      body.innerHTML = visible.length ? renderList(visible) : '<p class="text-center text-gray-400 text-sm py-10">No messages yet - say hello!</p>';
      if (scroll !== false) body.scrollTop = body.scrollHeight;
      if (cfg.onMessages) cfg.onMessages(visible);
    }

    function startEditing(id) {
      const m = findMessage(id);
      if (!m) return;
      editingMessageId = id;
      input.value = m.text || '';
      autoGrow();
      refreshSendButton();
      el('[data-ck-edit-banner]').hidden = false;
      input.focus();
    }
    function cancelEditing() {
      editingMessageId = null; input.value = ''; autoGrow(); refreshSendButton();
      el('[data-ck-edit-banner]').hidden = true;
    }
    function startReplying(id) {
      const m = findMessage(id);
      if (!m || m.deleted) return;
      replyingToId = id;
      el('[data-ck-reply-name]').textContent = isMine(m) ? 'You' : (m.senderName || 'Them');
      el('[data-ck-reply-text]').textContent = quoteSnippet(m);
      el('[data-ck-reply-banner]').hidden = false;
      input.focus();
    }
    function cancelReplying() { replyingToId = null; el('[data-ck-reply-banner]').hidden = true; }

    function refreshSendButton() {
      const hasContent = Boolean(input.value.trim()) || Boolean(pendingAttachment);
      sendIcon.className = hasContent ? 'fa-solid fa-paper-plane' : 'fa-solid fa-microphone';
      sendBtn.title = hasContent ? 'Send' : 'Record a voice note';
    }
    function autoGrow() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 96)}px`; }
    function showAttachPreview() {
      if (!pendingAttachment) { attachPreview.hidden = true; attachPreview.innerHTML = ''; return; }
      const thumb = pendingAttachment.kind === 'image' ? `<img src="${escapeHtml(pendingAttachment.url)}" alt="">` : `<i class="fa-solid ${pendingAttachment.kind === 'video' ? 'fa-film' : pendingAttachment.kind === 'audio' ? 'fa-microphone' : 'fa-file-lines'} text-gray-400"></i>`;
      attachPreview.innerHTML = `${thumb}<span>${escapeHtml(pendingAttachment.name || 'Attachment')}</span><button type="button" class="ck-drop" title="Remove attachment"><i class="fa-solid fa-xmark"></i></button>`;
      attachPreview.hidden = false;
      attachPreview.querySelector('.ck-drop').addEventListener('click', () => { pendingAttachment = null; showAttachPreview(); refreshSendButton(); });
    }
    async function uploadFile(file) {
      if (!file) return;
      const fd = new FormData(); fd.append('file', file);
      try {
        const res = await fetch(cfg.uploadUrl, { method: 'POST', body: fd });
        const data = await res.json();
        if (!data.success) return cfg.onAlert(data.error || 'Upload failed.', 'error');
        pendingAttachment = data.attachment;
        showAttachPreview(); refreshSendButton();
      } catch { cfg.onAlert('Upload failed.', 'error'); }
    }

    // --- Wiring ---------------------------------------------------------
    input.addEventListener('input', () => { refreshSendButton(); autoGrow(); });
    el('[data-ck-cancel-edit]').addEventListener('click', cancelEditing);
    el('[data-ck-cancel-reply]').addEventListener('click', cancelReplying);

    [['[data-ck-doc-input]'], ['[data-ck-media-input]'], ['[data-ck-audio-input]']].forEach(([sel]) => {
      const picker = el(sel);
      picker.addEventListener('change', () => { uploadFile(picker.files[0]); picker.value = ''; });
    });
    el('[data-ck-camera-input]').addEventListener('change', (e) => { uploadFile(e.target.files[0]); e.target.value = ''; });

    el('[data-ck-clip-btn]').addEventListener('click', (e) => { e.stopPropagation(); clipMenu.hidden ? openClipMenuAt() : closeClipMenu(); });
    document.addEventListener('click', (e) => { if (!clipMenu.hidden && !e.target.closest('[data-ck-clip-menu]') && !e.target.closest('[data-ck-clip-btn]') && !clipMenu.contains(e.target)) closeClipMenu(); });
    clipMenu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-clip]');
      if (!btn) return;
      closeClipMenu();
      const clip = btn.dataset.clip;
      if (clip === 'teaching-tools') { if (window.MozartTeachingTools) window.MozartTeachingTools.open(); else cfg.onAlert('Teaching tools are not loaded on this page. Please refresh.', 'error'); return; }
      if (clip === 'doc') el('[data-ck-doc-input]').click();
      else if (clip === 'media') el('[data-ck-media-input]').click();
      else if (clip === 'audio') el('[data-ck-audio-input]').click();
      else if (clip === 'camera') el('[data-ck-camera-input]').click();
      else if (clip === 'library' && cfg.library) cfg.library.onOpen();
      else if (clip === 'poll') openPollModal();
      else if (clip === 'location') shareLocation();
    });

    const emojiBtn = el('[data-ck-emoji-btn]');
    emojiPanel.innerHTML = EMOJI.map((e) => `<button type="button">${e}</button>`).join('');
    emojiPanel.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const pos = input.selectionStart ?? input.value.length;
      input.value = input.value.slice(0, pos) + btn.textContent + input.value.slice(input.selectionEnd ?? pos);
      input.focus(); input.selectionStart = input.selectionEnd = pos + btn.textContent.length;
      refreshSendButton(); autoGrow();
    });
    emojiBtn.addEventListener('click', (e) => { e.stopPropagation(); emojiPanel.hidden = !emojiPanel.hidden; });
    document.addEventListener('click', (e) => { if (!emojiPanel.hidden && !emojiPanel.contains(e.target) && !e.target.closest('[data-ck-emoji-btn]')) emojiPanel.hidden = true; });

    // Voice notes
    let recorder = null, recChunks = [], recTimer = null, recSeconds = 0;
    async function startRecording() {
      if (!navigator.mediaDevices || !window.MediaRecorder) return cfg.onAlert('Voice notes are not supported in this browser.', 'error');
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return cfg.onAlert('Microphone permission is needed for voice notes.', 'error'); }
      recChunks = [];
      recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
      recorder.onstop = () => stream.getTracks().forEach((t) => t.stop());
      recorder.start();
      recSeconds = 0;
      el('[data-ck-rec-time]').textContent = '0:00';
      recordingBar.hidden = false;
      sendBtn.classList.add('recording');
      recTimer = setInterval(() => { recSeconds += 1; const m = Math.floor(recSeconds / 60); const s = String(recSeconds % 60).padStart(2, '0'); el('[data-ck-rec-time]').textContent = `${m}:${s}`; }, 1000);
    }
    function stopRecordingUI() { clearInterval(recTimer); recordingBar.hidden = true; sendBtn.classList.remove('recording'); }
    async function finishRecording(send) {
      if (!recorder) return;
      const done = new Promise((resolve) => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.stop(); await done; stopRecordingUI();
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'audio/webm' });
      recorder = null;
      if (!send || !blob.size) return;
      const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
      await uploadFile(new File([blob], `voice-note.${ext}`, { type: blob.type }));
      form.requestSubmit();
    }
    el('[data-ck-rec-cancel]').addEventListener('click', () => finishRecording(false));
    el('[data-ck-rec-send]').addEventListener('click', () => finishRecording(true));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (editingMessageId) {
        if (!text) return cfg.onAlert('Message text is required.', 'error');
        const res = await cfg.api.edit(editingMessageId, text);
        if (res && res.success) { cancelEditing(); refresh(false); } else cfg.onAlert((res && res.error) || 'Could not save the edit.', 'error');
        return;
      }
      if (!text && !pendingAttachment) { if (recorder) return finishRecording(true); return startRecording(); }
      const res = await cfg.api.send({ text, attachment: pendingAttachment, replyToId: replyingToId || undefined });
      if (res && res.success) {
        input.value = ''; input.style.height = 'auto'; pendingAttachment = null;
        cancelReplying(); showAttachPreview(); refreshSendButton(); emojiPanel.hidden = true;
        refresh();
      } else cfg.onAlert((res && res.error) || 'Could not send message.', 'error');
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });

    // Message menu / reactions / delete popover click handling
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-msg-trigger]');
      if (trigger && root.contains(trigger)) {
        e.stopPropagation();
        const id = trigger.dataset.id;
        if (openMenuMessageId === id && !msgMenu.hidden) { closeMsgMenu(); return; }
        closeReactPicker(); closeDeletePopover();
        openMenuForMessage(id, trigger.getBoundingClientRect());
        return;
      }
      const reactTrigger = e.target.closest('[data-react-trigger]');
      if (reactTrigger && root.contains(reactTrigger)) {
        e.stopPropagation();
        const id = reactTrigger.dataset.id;
        if (reactPickerMessageId === id && !reactPicker.hidden) { closeReactPicker(); return; }
        closeMsgMenu(); closeDeletePopover();
        openReactPicker(id, reactTrigger.getBoundingClientRect());
        return;
      }
      const quote = e.target.closest('.ck-quote');
      if (quote && root.contains(quote) && quote.dataset.goto) {
        const row = body.querySelector(`.ck-row[data-id="${quote.dataset.goto}"]`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (!e.target.closest(`#ck-msg-menu-${cfg.instanceId}`)) closeMsgMenu();
      if (!e.target.closest(`#ck-react-picker-${cfg.instanceId}`)) closeReactPicker();
      if (!e.target.closest(`#ck-delete-popover-${cfg.instanceId}`)) closeDeletePopover();
    });
    body.addEventListener('scroll', closeAllPopovers);

    reactPicker.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-emoji]');
      if (!btn) return;
      const id = reactPickerMessageId;
      closeReactPicker();
      if (!id) return;
      const res = await cfg.api.react(id, btn.dataset.emoji);
      if (!res || !res.success) return cfg.onAlert((res && res.error) || 'Could not react.', 'error');
      refresh(false);
    });

    deletePopover.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-delete]');
      if (!btn || btn.disabled) return;
      const id = deletePopoverMessageId;
      const mode = btn.dataset.delete;
      closeDeletePopover();
      if (!id) return;
      const res = await cfg.api.del(id, mode);
      if (!res || !res.success) return cfg.onAlert((res && res.error) || 'Could not delete message.', 'error');
      if (editingMessageId === id) cancelEditing();
      refresh(false);
    });

    msgMenu.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      // The "delete" action below opens a NEW popover as a side effect -
      // without stopping this click here, it bubbles up to the
      // document-level handler that closes any popover the click didn't
      // land inside, immediately undoing the open.
      e.stopPropagation();
      const id = openMenuMessageId;
      const m = findMessage(id);
      closeMsgMenu();
      if (!m) return;
      const action = btn.dataset.action;
      if (action === 'reply') startReplying(id);
      else if (action === 'copy') { try { await navigator.clipboard.writeText(m.text || ''); cfg.onAlert('Message copied.', 'success'); } catch { cfg.onAlert('Could not copy message.', 'error'); } }
      else if (action === 'share') {
        if (navigator.share) { try { await navigator.share({ text: m.text || '' }); } catch { /* cancelled */ } }
        else { try { await navigator.clipboard.writeText(m.text || ''); cfg.onAlert('Copied - paste it anywhere to share.', 'success'); } catch { cfg.onAlert('Could not share message.', 'error'); } }
      } else if (action === 'pin') { const res = await cfg.api.pin(id); if (!res || !res.success) return cfg.onAlert((res && res.error) || 'Could not update pin.', 'error'); refresh(false); }
      else if (action === 'edit') startEditing(id);
      else if (action === 'delete') {
        const trigger = body.querySelector(`.ck-row[data-id="${id}"] [data-msg-trigger]`);
        const rect = trigger ? trigger.getBoundingClientRect() : null;
        const anchor = rect && (rect.width || rect.height) ? rect : { left: window.innerWidth / 2 - 100, right: window.innerWidth / 2 - 100, top: window.innerHeight / 2, bottom: window.innerHeight / 2 };
        openDeletePopover(id, anchor);
      }
    });

    // Poll
    function pollOptionRowHtml(value) { return `<div style="display:flex;align-items:center;gap:6px"><input type="text" class="ck-poll-option-input" maxlength="80" value="${value ? escapeHtml(value) : ''}" placeholder="Option"></div>`; }
    function openPollModal() {
      pollBackdrop.querySelector('[data-poll-question]').value = '';
      pollBackdrop.querySelector('[data-poll-options]').innerHTML = pollOptionRowHtml('') + pollOptionRowHtml('');
      pollBackdrop.hidden = false;
    }
    pollBackdrop.querySelector('[data-poll-cancel]').addEventListener('click', () => { pollBackdrop.hidden = true; });
    pollBackdrop.addEventListener('click', (e) => { if (e.target === pollBackdrop) pollBackdrop.hidden = true; });
    pollBackdrop.querySelector('[data-poll-add-option]').addEventListener('click', () => {
      const list = pollBackdrop.querySelector('[data-poll-options]');
      if (list.children.length >= 6) return cfg.onAlert('A poll can have up to 6 options.', 'info');
      list.insertAdjacentHTML('beforeend', pollOptionRowHtml(''));
    });
    pollBackdrop.querySelector('[data-poll-submit]').addEventListener('click', async () => {
      const question = pollBackdrop.querySelector('[data-poll-question]').value.trim();
      const options = [...pollBackdrop.querySelectorAll('.ck-poll-option-input')].map((i) => i.value.trim()).filter(Boolean);
      if (!question || options.length < 2) return cfg.onAlert('Add a question and at least 2 options.', 'error');
      pollBackdrop.hidden = true;
      const res = await cfg.api.send({ poll: { question, options }, replyToId: replyingToId || undefined });
      if (!res || !res.success) return cfg.onAlert((res && res.error) || 'Could not send poll.', 'error');
      cancelReplying(); refresh();
    });
    body.addEventListener('click', async (e) => {
      const option = e.target.closest('.ck-poll-option');
      if (!option) return;
      const res = await cfg.api.vote(option.dataset.messageId, Number(option.dataset.pollOption));
      if (!res || !res.success) return cfg.onAlert((res && res.error) || 'Could not vote.', 'error');
      refresh(false);
    });

    function shareLocation() {
      if (!navigator.geolocation) return cfg.onAlert('Location is not supported in this browser.', 'error');
      cfg.onAlert('Getting your location…', 'info');
      navigator.geolocation.getCurrentPosition(async (position) => {
        const res = await cfg.api.send({ location: { lat: position.coords.latitude, lng: position.coords.longitude }, replyToId: replyingToId || undefined });
        if (!res || !res.success) return cfg.onAlert((res && res.error) || 'Could not share location.', 'error');
        cancelReplying(); refresh();
      }, () => cfg.onAlert('Could not get your location. Check location permission.', 'error'));
    }

    // Mobile: long-press opens the combined popover, swipe-right replies.
    let longPressTimer = null;
    let swipeStartX = null, swipeRow = null, swipeBubble = null, swipeIcon = null, swipeTriggered = false;
    body.addEventListener('touchstart', (e) => {
      const row = e.target.closest('.ck-row');
      if (!row) return;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        const touch = e.touches[0];
        const point = { left: touch.clientX, right: touch.clientX, top: touch.clientY, bottom: touch.clientY };
        openMenuForMessage(row.dataset.id, point);
        openReactPicker(row.dataset.id, { left: point.left, right: point.left, top: point.top - 190, bottom: point.top - 190 });
        if (navigator.vibrate) navigator.vibrate(15);
      }, 500);
      swipeRow = row; swipeBubble = row.querySelector('[data-bubble]'); swipeIcon = row.querySelector('.ck-swipe-icon');
      swipeStartX = e.touches[0].clientX; swipeTriggered = false;
    }, { passive: true });
    body.addEventListener('touchmove', (e) => {
      clearTimeout(longPressTimer);
      if (swipeStartX == null || !swipeBubble) return;
      const dx = e.touches[0].clientX - swipeStartX;
      const clamped = Math.max(0, Math.min(dx, 70));
      if (clamped > 8) {
        swipeBubble.classList.add('no-transition');
        swipeBubble.style.transform = `translateX(${clamped}px)`;
        if (swipeIcon) swipeIcon.style.opacity = String(Math.min(1, clamped / 55));
        swipeTriggered = clamped > 55;
      }
    }, { passive: true });
    body.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);
      if (swipeBubble) { swipeBubble.classList.remove('no-transition'); swipeBubble.style.transform = ''; }
      if (swipeIcon) swipeIcon.style.opacity = '0';
      if (swipeTriggered && swipeRow) startReplying(swipeRow.dataset.id);
      swipeStartX = null; swipeBubble = null; swipeIcon = null; swipeRow = null; swipeTriggered = false;
    });
    body.addEventListener('contextmenu', (e) => { if (e.target.closest('.ck-row')) e.preventDefault(); });
    window.addEventListener('scroll', closeAllPopovers, true);

    refreshSendButton();
    refresh();
    const pollTimer = setInterval(() => refresh(), cfg.pollMs);

    return {
      refresh,
      destroy() { clearInterval(pollTimer); popoverHost.remove(); },
    };
  }

  let instanceCounter = 0;
  window.ChatKit = {
    mount(root, config) {
      instanceCounter += 1;
      return mount(root, Object.assign({ instanceId: instanceCounter }, config));
    },
  };
})();
