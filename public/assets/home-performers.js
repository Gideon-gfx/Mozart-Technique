(function () {
  'use strict';
  async function load() {
    const grid = document.getElementById('home-performer-grid');
    const status = document.getElementById('home-performer-status');
    if (!grid || !status) return;
    try {
      const response = await fetch('/api/performers');
      if (!response.ok) throw new Error('Unable to load performers');
      const data = await response.json();
      if (!data.success || !Array.isArray(data.performers)) throw new Error('Invalid performer response');
      grid.replaceChildren();
      for (const performer of data.performers.slice(0, 4)) {
        const card = document.createElement('a');
        card.className = 'home-performer-card';
        card.href = '/performers/' + encodeURIComponent(performer.id);
        const image = document.createElement('img');
        image.loading = 'lazy'; image.alt = performer.name || 'Performer';
        let photo = '/mozartLogo.jpg';
        try {
          const candidate = new URL(performer.photoUrl || photo, location.origin);
          if (['http:', 'https:'].includes(candidate.protocol)) photo = candidate.href;
        } catch { /* Keep the local fallback. */ }
        image.src = photo;
        image.onerror = () => { image.onerror = null; image.src = '/mozartLogo.jpg'; };
        const name = document.createElement('h4'); name.textContent = performer.name || 'Performer';
        const detail = document.createElement('p');
        detail.textContent = [Array.isArray(performer.categories) ? performer.categories.join(', ') : '', performer.city].filter(Boolean).join(' · ');
        const link = document.createElement('span'); link.textContent = 'View performer →';
        card.append(image, name, detail, link); grid.append(card);
      }
      status.hidden = data.performers.length > 0;
      status.textContent = data.performers.length ? '' : 'New performers are joining soon — check back shortly.';
    } catch {
      status.hidden = false;
      status.textContent = 'Performer previews are unavailable right now. Browse the full performer list below.';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
