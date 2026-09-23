(function(root){
  const names=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const note=m=>names[((m%12)+12)%12]+(Math.floor(m/12)-1);
  function question(id,level=1,random=Math.random){
    const pick=items=>items[Math.floor(random()*items.length)];
    let prompt,answer,explanation,options;
    if(id==='piano'){
      const root=pick([48,50,52,53,55,57,59]),quality=pick(level===1?['major','minor']:['major','minor','diminished','augmented']);
      const intervals={major:[0,4,7],minor:[0,3,7],diminished:[0,3,6],augmented:[0,4,8]}[quality];
      const inversion=quality==='augmented'?0:Math.floor(random()*(level===1?1:3));
      const pitches=intervals.map(n=>n+root);for(let i=0;i<inversion;i++)pitches.push(pitches.shift()+12);
      const positions=['root position','first inversion','second inversion'];
      prompt=`Keyboard pitches, lowest to highest: ${pitches.map(note).join(' → ')}. Identify the chord quality and position${quality==='augmented'?' (treat '+note(root)+' as the root)':''}.`;
      answer=`${quality}, ${positions[inversion]}`;
      options=['major','minor','diminished','augmented'].flatMap(q=>positions.map(p=>`${q}, ${p}`));
      explanation=`The root is ${note(root)}; its semitone pattern is ${intervals.join(', ')}. The lowest pitch is ${note(pitches[0])}.`;
    } else if(id==='drums'){
      const meter=pick(level===1?[4]:level===2?[3,4,6]:[5,7,9,12]);
      const denominator=meter>=5?8:4,unit=level===1?8:16,total=meter*unit/denominator;
      const occupied=1+Math.floor(random()*(total-1));answer=String(total-occupied);
      prompt=`Bar: ${meter}/${denominator}. Your groove fills ${occupied} ${unit===8?'eighth':'sixteenth'}-note slots (including rests). How many more equal slots finish this bar?`;
      options=Array.from({length:total+3},(_,i)=>String(i));explanation=`A ${meter}/${denominator} bar contains ${meter} × ${unit}/${denominator} = ${total} slots. ${total} − ${occupied} = ${answer}.`;
    } else {
      let midi;
      if(id==='trumpet'||id==='saxophone'){
        const alto=id==='saxophone'&&(level===1||random()<.5),shift=id==='trumpet'?2:alto?9:14;
        const written=pick([60,62,64,65,67,69,71,72])+(level===3?pick([-1,0,1]):0),reverse=level===3&&random()<.5;
        midi=reverse?written:written-shift;
        prompt=`${id==='trumpet'?'B-flat trumpet':alto?'E-flat alto saxophone':'B-flat tenor saxophone'}: ${reverse?'concert':'written'} pitch ${note(reverse?written-shift:written)}. What is the ${reverse?'written':'concert'} pitch?`;
        explanation=`This instrument sounds ${shift} semitones below written pitch. ${reverse?'Add':'Subtract'} ${shift} semitones, including the octave.`;
      } else {
        const tunings={guitar:[40,45,50,55,59,64],bass:[28,33,38,43],violin:[55,62,69,76],cello:[36,43,50,57]};
        const strings=tunings[id];if(!strings)throw Error('Unknown game');
        const open=pick(strings),steps=Math.floor(random()*(level===1?5:level===2?13:20));
        const capo=id==='guitar'&&level===3?pick([1,2,3,4]):0,interval=id==='bass'&&level>1?pick([0,3,4,7]):0;
        midi=open+steps+capo+interval;
        prompt=`${id}: open string ${note(open)}. ${id==='guitar'||id==='bass'?`Fret ${steps}${capo?`, measured above capo ${capo}`:''}`:`Raise the pitch by ${steps} semitones (not finger numbers)`}.${interval?` Then move up ${interval} semitones for the next groove note.`:''} Which pitch sounds?`;
        explanation=`${note(open)} + ${steps}${capo?' + '+capo+' (capo)':''}${interval?' + '+interval+' (interval)':''} semitones = ${note(midi)}. Sharps may have enharmonic flat names.`;
      }
      answer=note(midi);options=[midi,midi-12,midi+12,midi-2,midi+2,midi+1,midi-1].map(note);
    }
    const distractors=[...new Set(options)].filter(o=>o!==answer).sort(()=>random()-.5).slice(0,level===3?5:3);
    return {prompt,answer,explanation,options:[answer,...distractors].sort(()=>random()-.5)};
  }
  const api={question,note};if(typeof module!=='undefined')module.exports=api;else root.MozartInstrumentGames=api;
})(typeof window!=='undefined'?window:this);
