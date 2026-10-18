import { splitIntoBars } from './transcriber-core.js';
import { pitchSpelling } from './live-score-core.js';

const escapeXml = value => String(value).replace(/[<>&"']/g, char => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));

export function musicXml(events, {clef='treble',key=null,bpm=120,title='Untitled score'}={}) {
  const types={1:'eighth',2:'quarter',4:'half',8:'whole'};
  const measures=splitIntoBars(events).map((bar,index)=>{
    const attributes=index===0 ? `<attributes><divisions>2</divisions><key><fifths>${key?.fifths||0}</fifths><mode>${key?.id.endsWith('m')?'minor':'major'}</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>${clef==='bass'?'F':'G'}</sign><line>${clef==='bass'?4:2}</line></clef></attributes><direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${bpm}</per-minute></metronome></direction-type><sound tempo="${bpm}"/></direction>` : '';
    const notes=bar.map(event=>{
      const pitch=pitchSpelling(event.midi,key);
      const notation=pitch ? `<pitch><step>${pitch.step}</step>${pitch.accidental?`<alter>${pitch.accidental==='#'?1:-1}</alter>`:''}<octave>${pitch.octave}</octave></pitch>` : '<rest/>';
      const ties=`${event.tieStop?'<tie type="stop"/>':''}${event.tieStart?'<tie type="start"/>':''}`;
      const tied=event.tieStart||event.tieStop ? `<notations>${event.tieStop?'<tied type="stop"/>':''}${event.tieStart?'<tied type="start"/>':''}</notations>` : '';
      return `<note>${notation}<duration>${event.slots}</duration>${ties}<type>${types[event.slots]}</type>${tied}</note>`;
    }).join('');
    return `<measure number="${index+1}">${attributes}${notes}</measure>`;
  }).join('');
  return `<?xml version="1.0" encoding="utf-8"?>\n<score-partwise version="4.0"><work><work-title>${escapeXml(title)}</work-title></work><identification><creator type="software">Mozart Techniques</creator></identification><part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list><part id="P1">${measures}</part></score-partwise>`;
}

export async function scoreImage(notation, {title,bpm,key,width,height}) {
  // Render VexFlow directly to Canvas using the document's loaded music fonts.
  // SVG-as-image rasterisation can discard those fonts and export tofu boxes.
  const scale=Math.min(2,8192/(height+95)),canvas=document.createElement('canvas');
  canvas.width=Math.round(width*scale);canvas.height=Math.round((height+95)*scale);
  const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
  ctx.fillStyle='white';ctx.fillRect(0,0,width,height+95);ctx.fillStyle='#16131b';
  ctx.font='21px sans-serif';ctx.fillText(title,14,30,width-28);
  ctx.font='12px sans-serif';ctx.fillText(`Mozart Techniques · 4/4 · BPM ${bpm}${key?' · '+key.label:''}`,14,58,width-28);
  ctx.drawImage(notation,0,85,width,height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Could not create the score image. Try MusicXML instead.');
  return blob;
}
