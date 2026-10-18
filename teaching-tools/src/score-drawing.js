// A drawn notehead is snapped to a staff pitch; it becomes real notation,
// not an unplayable ink layer. This is placement, not handwriting OCR.
export function staffMidi(y,staff){
  const steps=staff.clef==='bass'?[43,45,47,48,50,52,53]:[64,65,67,69,71,72,74];
  const step=Math.round((staff.bottom-y)/(staff.spacing/2));
  const octave=Math.floor(step/7),index=((step%7)+7)%7;
  return Math.max(36,Math.min(95,steps[index]+12*octave));
}
export function placeScoreNote(events,start,midi,slots){
  start=Math.max(0,Math.round(start));if(start+slots>512)throw new Error('Maximum 64 bars per score.');
  const before=[],after=[];let cursor=0;
  const append=(target,pitch,length)=>{while(length>0){const size=[8,4,2,1].find(n=>n<=length);target.push({midi:pitch,slots:size});length-=size;}};
  for(const note of events){const end=cursor+note.slots;if(cursor<start)append(before,note.midi,Math.min(end,start)-cursor);if(end>start+slots)append(after,note.midi,end-Math.max(cursor,start+slots));cursor=end;}
  if(cursor<start)append(before,null,start-cursor);
  return [...before,{midi,slots},...after];
}
export function attachScoreDrawing(svg,{enabled,staves,commit}){
  let points=[],ink=null,pointer=null;
  const point=event=>{const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;return p.matrixTransform(svg.getScreenCTM().inverse());};
  svg.style.touchAction=enabled?'none':'pan-y';
  svg.dataset.drawStaves=JSON.stringify(staves);
  if(!enabled)return;
  const surface=document.createElementNS('http://www.w3.org/2000/svg','rect');
  surface.setAttribute('width','100%');surface.setAttribute('height','100%');surface.setAttribute('fill','transparent');surface.setAttribute('pointer-events','all');svg.prepend(surface);
  svg.onpointerdown=event=>{if(!event.isPrimary||event.button>0)return;event.preventDefault();event.stopPropagation();pointer=event.pointerId;svg.setPointerCapture(pointer);points=[point(event)];ink=document.createElementNS('http://www.w3.org/2000/svg','polyline');ink.setAttribute('fill','none');ink.setAttribute('stroke','#c60035');ink.setAttribute('stroke-width','3');ink.setAttribute('stroke-linecap','round');svg.append(ink);};
  svg.onpointermove=event=>{if(event.pointerId!==pointer)return;event.preventDefault();points.push(point(event));ink?.setAttribute('points',points.map(p=>`${p.x},${p.y}`).join(' '));};
  const clear=()=>{ink?.remove();ink=null;pointer=null;points=[];};
  svg.onpointercancel=clear;
  svg.onpointerup=event=>{if(event.pointerId!==pointer)return;event.preventDefault();event.stopPropagation();const head=points.slice(0,12),x=head.reduce((sum,p)=>sum+p.x,0)/head.length,y=head.reduce((sum,p)=>sum+p.y,0)/head.length;const staff=staves.filter(s=>x>=s.x&&x<=s.x+s.width).sort((a,b)=>Math.abs(a.bottom-20-y)-Math.abs(b.bottom-20-y))[0];clear();if(staff&&Math.abs(staff.bottom-20-y)<90)commit({midi:staffMidi(y,staff),x,y,staff});};
  // A pointer gesture must not also open the normal note-inspection action.
  svg.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();},true);
}
