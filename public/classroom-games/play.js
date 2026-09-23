(() => {
  const el=id=>document.getElementById(id),id=new URLSearchParams(location.search).get('game');
  let level,index,score,correct,streak,q,timer,deadline,answered;
  function stop(){clearInterval(timer);}
  function stats(){el('stats').textContent=`Question ${index+1}/12 · ${score} points · Streak ${streak}${deadline?' · '+Math.max(0,Math.ceil((deadline-Date.now())/1000))+'s':''}`;}
  function answer(value){
    if(answered)return;answered=true;stop();const ok=value===q.answer;
    if(ok){correct++;streak++;score+=100+Math.min(streak-1,5)*10;}else streak=0;
    el('options').querySelectorAll('button').forEach(b=>{b.disabled=true;if(b.textContent===q.answer)b.classList.add('correct');else if(b.textContent===value)b.classList.add('incorrect');});
    el('feedback').textContent=`${ok?'Correct!':value===null?'Time is up.':'Not quite.'} Answer: ${q.answer}. ${q.explanation}`;el('next').hidden=false;stats();
  }
  function next(){
    stop();if(index===12){el('round').hidden=true;el('result').hidden=false;el('result').replaceChildren();const title=document.createElement('h2');title.textContent=`${correct}/12 correct — ${score} points`;const again=document.createElement('button');again.textContent='Play again';again.onclick=()=>{el('result').hidden=true;el('setup').hidden=false;};el('result').append(title,again);return;}
    q=MozartInstrumentGames.question(id,level);answered=false;el('question').textContent=q.prompt;el('progress').value=index;el('feedback').textContent='';el('next').hidden=true;el('options').replaceChildren();
    q.options.forEach(value=>{const b=document.createElement('button');b.textContent=value;b.onclick=()=>answer(value);el('options').append(b);});
    deadline=el('timed').checked?Date.now()+([0,45000,30000,20000][level]):null;stats();if(deadline)timer=setInterval(()=>{stats();if(Date.now()>=deadline)answer(null);},200);
  }
  el('next').onclick=()=>{index++;next();};el('start').disabled=true;
  el('start').onclick=()=>{level=Number(el('level').value);index=score=correct=streak=0;el('setup').hidden=true;el('round').hidden=false;next();};
  fetch('catalog.json').then(r=>r.json()).then(items=>{const game=items.find(g=>g.id===id);if(!game){el('description').textContent='Choose a game from your organization classroom.';return;}el('title').textContent=game.title;el('description').textContent=game.description;el('start').disabled=false;}).catch(()=>{el('description').textContent='Could not load this game. Please reload.';});
  window.addEventListener('pagehide',stop);
})();
