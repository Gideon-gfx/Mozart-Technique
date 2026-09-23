export function pose({ panel, action, status }) {
  panel(`<h2>Dance · Pose tracking</h2><p>Track dancers together with coloured skeletons. Keep everyone's whole body visible. Colours are detections, not permanent identities.</p><div class="row"><label>Maximum people <select id="pose-people"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label><label>Performance <select id="pose-quality"><option value="480">Fast (recommended)</option><option value="640">More detail</option></select></label></div><p>Choose settings before starting. More dancers require more processing. Fast mode reduces frame size; processing runs separately from the page.</p><div class="pose-view" id="pose-view"><div class="pose-picture"><video id="pose-video" muted playsinline></video><canvas id="pose-overlay"></canvas></div><button id="pose-fullscreen">Fullscreen camera</button></div><p id="pose-result" role="status">Camera off</p><div class="row"><button id="pose-start">Load model & start camera</button><button id="pose-stop">Stop camera</button></div><p>Starting downloads Google's model and requests camera permission. Frames stay on this device. Requires HTTPS/localhost. Not medical advice.</p>`);
  const $=id=>document.getElementById(id), video=$('pose-video'), canvas=$('pose-overlay'), view=$('pose-view'), output=$('pose-result'), ctx=canvas.getContext('2d');
  let worker,stream,frame,token=0,busy=false,lastTime=-1,edges=[],count=0,sampledAt=0,backend='',oldOverflow='';
  function exitExpanded(){view.classList.remove('pose-expanded');document.body.style.overflow=oldOverflow;$('pose-fullscreen').textContent='Fullscreen camera';}
  function fullscreenChanged(){$('pose-fullscreen').textContent=document.fullscreenElement===view?'Exit fullscreen':'Fullscreen camera';}
  action('pose-fullscreen',async()=>{if(document.fullscreenElement===view){await document.exitFullscreen();return;}if(view.classList.contains('pose-expanded')){exitExpanded();return;}if(view.requestFullscreen){try{await view.requestFullscreen();return;}catch{}}oldOverflow=document.body.style.overflow;document.body.style.overflow='hidden';view.classList.add('pose-expanded');$('pose-fullscreen').textContent='Exit fullscreen';});
  const escape=e=>{if(e.key==='Escape'&&view.classList.contains('pose-expanded'))exitExpanded();};
  document.addEventListener('fullscreenchange',fullscreenChanged);document.addEventListener('keydown',escape);
  function stop(){token++;cancelAnimationFrame(frame);worker?.terminate();worker=null;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;busy=false;ctx.clearRect(0,0,canvas.width,canvas.height);output.textContent='Camera off';for(const id of ['pose-start','pose-people','pose-quality'])$(id).disabled=false;}
  action('pose-start',()=>{
    stop();const current=token,width=Number($('pose-quality').value);for(const id of ['pose-start','pose-people','pose-quality'])$(id).disabled=true;output.textContent='Loading pose model…';
    const fail=message=>{if(current===token){stop();status(message);}};
    try{
      worker=new Worker(new URL('./pose-worker.js',location.href));
      worker.onerror=()=>fail('Pose worker could not load. Refresh and check browser support.');
      worker.onmessage=async({data})=>{
        if(current!==token)return;
        if(data.type==='error'){fail(`Pose tracking stopped: ${data.message}`);return;}
        if(data.type==='ready'){
          backend=data.backend;edges=data.connections;output.textContent='Waiting for camera permission…';
          try{
            const incoming=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:width},height:{ideal:width*0.75},frameRate:{ideal:30}},audio:false});
            if(current!==token){incoming.getTracks().forEach(t=>t.stop());return;}stream=incoming;video.srcObject=stream;await video.play();if(current!==token)return;
            view.style.setProperty('--pose-ratio',video.videoWidth/video.videoHeight);lastTime=-1;count=0;sampledAt=performance.now();
            async function tick(){if(current!==token)return;frame=requestAnimationFrame(tick);if(busy||video.readyState<2||lastTime===video.currentTime)return;busy=true;lastTime=video.currentTime;try{const bitmap=await createImageBitmap(video,{resizeWidth:width,resizeHeight:Math.round(width*video.videoHeight/video.videoWidth)});if(current!==token){bitmap.close();return;}worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);}catch(error){fail(`Camera frame unavailable: ${error.message}`);}}tick();
          }catch(error){fail(`Camera unavailable: ${error.message}. Allow camera access in browser settings.`);}
        }else if(data.type==='result'){
          busy=false;if(canvas.width!==video.videoWidth||canvas.height!==video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight;}ctx.clearRect(0,0,canvas.width,canvas.height);
          data.landmarks.forEach((points,i)=>{ctx.strokeStyle=ctx.fillStyle=['#4be4ad','#ffcd56','#67c8ff','#ff83ba'][i%4];ctx.lineWidth=3;for(const edge of edges){const a=points[edge.start],b=points[edge.end];if(a.visibility<0.5||b.visibility<0.5)continue;ctx.beginPath();ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height);ctx.stroke();}for(const p of points){if(p.visibility<0.5)continue;ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,3,0,Math.PI*2);ctx.fill();}});
          count++;output.textContent=`${data.landmarks.length} people detected · ${Math.round(count/Math.max((performance.now()-sampledAt)/1000,0.1))} tracking FPS · ${backend}`;
        }
      };
      worker.postMessage({type:'init',people:Number($('pose-people').value),wasm:new URL('./vision-wasm',location.href).href,model:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'});
    }catch(error){fail(`Pose tracking unavailable: ${error.message}`);}
  });action('pose-stop',stop);
  return()=>{stop();document.removeEventListener('fullscreenchange',fullscreenChanged);document.removeEventListener('keydown',escape);if(document.fullscreenElement===view)document.exitFullscreen().catch(()=>{});if(view.classList.contains('pose-expanded'))exitExpanded();};
}
