import Konva from 'konva';

// Coordinates remain in a 720x420 stage regardless of screen size.
export function formation({ panel, action, status, saveFile }) {
  panel(`<h2>Dance · Stage formations</h2><p>Drag dancers to arrange your stage. Save a cue, move them, then save another cue to plan their paths. Drafts stay on this device.</p>
    <label>Dancer name <input id="dancer-name" maxlength="40" placeholder="Dancer name"></label>
    <div class="row"><button id="dancer-add">Add dancer</button><button id="dancer-remove" class="secondary">Remove selected</button></div>
    <div id="formation-canvas" aria-label="Stage formation canvas"></div>
    <label>Selected dancer <select id="dancer-select"><option value="">Choose a dancer</option></select></label>
    <div class="row"><label>X (0–720)<input id="dancer-x" type="number" min="0" max="720"></label><label>Y (0–420)<input id="dancer-y" type="number" min="0" max="420"></label><button id="dancer-position">Move dancer</button></div>
    <label>Cue name <input id="cue-name" maxlength="60" placeholder="Opening formation"></label>
    <div class="row"><button id="cue-save">Save cue</button><button id="formation-export" class="secondary">Export plan</button></div>
    <label>Saved cues <select id="cue-select"><option value="">Choose a cue</option></select></label><button id="cue-load" class="secondary">Load cue</button><p id="formation-summary" role="status"></p>`);
  const $ = id => document.getElementById(id);
  let dancers = [], cues = [], selected = '', nextId = 1;
  try {
    const draft = JSON.parse(localStorage.getItem('mozart-formations-v1') || 'null');
    if (draft && Array.isArray(draft.dancers) && Array.isArray(draft.cues)) {
      dancers = draft.dancers; cues = draft.cues; nextId = draft.nextId || 1;
    }
  } catch { status('Saved draft unavailable. You can create a new formation.'); }
  const stage = new Konva.Stage({ container: 'formation-canvas', width: 720, height: 420 });
  const layer = new Konva.Layer(); stage.add(layer);
  function persist() {
    try { localStorage.setItem('mozart-formations-v1', JSON.stringify({ dancers, cues, nextId })); }
    catch { status('Device storage is full or unavailable. Export your plan before leaving.'); }
  }
  function fields() {
    const dancer = dancers.find(d => d.id === selected);
    $('dancer-select').value = selected;
    $('dancer-x').value = dancer ? Math.round(dancer.x) : '';
    $('dancer-y').value = dancer ? Math.round(dancer.y) : '';
  }
  function draw() {
    layer.destroyChildren();
    layer.add(new Konva.Rect({ width: 720, height: 420, fill: '#f9f5f2', stroke: '#cbbfb9' }));
    for (let x = 60; x < 720; x += 60) layer.add(new Konva.Line({ points: [x,0,x,420], stroke: '#e7dfd9' }));
    for (let y = 60; y < 420; y += 60) layer.add(new Konva.Line({ points: [0,y,720,y], stroke: '#e7dfd9' }));
    layer.add(new Konva.Text({ text: 'AUDIENCE / FRONT', x: 270, y: 400, fontSize: 16, fill: '#65554c' }));
    for (const dancer of dancers) {
      const points = cues.flatMap(c => { const d = c.dancers.find(v => v.id === dancer.id); return d ? [d.x,d.y] : []; });
      if (points.length >= 4) layer.add(new Konva.Arrow({ points, stroke: '#a5223280', fill: '#a52232', strokeWidth: 2, dash: [5,5] }));
      const group = new Konva.Group({ x: dancer.x, y: dancer.y, draggable: true });
      group.add(new Konva.Circle({ radius: 19, fill: dancer.id === selected ? '#174d75' : '#a52232' }));
      group.add(new Konva.Text({ text: dancer.name, x: -55, y: 24, width: 110, align: 'center', fill: '#29232b', fontSize: 15 }));
      group.on('click tap', () => { selected = dancer.id; fields(); draw(); });
      group.on('dragend', () => {
        dancer.x = Math.max(20, Math.min(700, group.x())); dancer.y = Math.max(20, Math.min(370, group.y()));
        selected = dancer.id; persist(); fields(); draw();
      });
      layer.add(group);
    }
    layer.draw();
    $('formation-summary').textContent = `${dancers.length} dancers · ${cues.length} saved cues`;
  }
  function lists() {
    $('dancer-select').replaceChildren(new Option('Choose a dancer', ''), ...dancers.map(d => new Option(d.name, d.id)));
    $('cue-select').replaceChildren(new Option('Choose a cue', ''), ...cues.map((c,i) => new Option(c.name, String(i))));
    fields(); draw();
  }
  action('dancer-add', () => {
    const name = $('dancer-name').value.trim();
    if (!name) throw new Error('Enter a dancer name first.');
    if (dancers.length >= 40) throw new Error('A plan supports up to 40 dancers.');
    selected = String(nextId++); dancers.push({ id: selected, name, x: 360, y: 210 });
    $('dancer-name').value = ''; persist(); lists();
  });
  $('dancer-select').onchange = () => { selected = $('dancer-select').value; fields(); draw(); };
  action('dancer-position', () => {
    const d = dancers.find(v => v.id === selected), x = Number($('dancer-x').value), y = Number($('dancer-y').value);
    if (!d || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 720 || y < 0 || y > 420) throw new Error('Select a dancer and enter coordinates within the stage.');
    d.x = x; d.y = y; persist(); draw();
  });
  action('dancer-remove', () => { dancers = dancers.filter(d => d.id !== selected); selected = ''; persist(); lists(); });
  action('cue-save', () => {
    if (!dancers.length) throw new Error('Add at least one dancer first.');
    if (cues.length >= 100) throw new Error('Export this plan before creating another; maximum 100 cues.');
    cues.push({ name: $('cue-name').value.trim() || `Cue ${cues.length + 1}`, dancers: structuredClone(dancers) });
    $('cue-name').value = ''; persist(); lists();
  });
  action('cue-load', () => {
    if ($('cue-select').value === '') throw new Error('Select a saved cue first.');
    dancers = structuredClone(cues[Number($('cue-select').value)].dancers); selected = ''; persist(); lists();
  });
  action('formation-export', () => saveFile(new Blob([JSON.stringify({ dancers, cues }, null, 2)], { type: 'text/plain' }), 'mozart-stage-plan.txt'));
  const resize = new ResizeObserver(() => {
    const width = Math.min(720, $('formation-canvas').clientWidth);
    stage.width(width); stage.height(width * 420 / 720); stage.scale({ x: width / 720, y: width / 720 });
  });
  resize.observe($('formation-canvas')); lists();
  return () => { resize.disconnect(); stage.destroy(); };
}
