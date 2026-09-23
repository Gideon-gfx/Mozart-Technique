import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision';

export function pose({panel, action, status}) {
  panel(`<h2>Dance · Pose tracking</h2><p>Start downloads Google's pose model, then asks for camera access. Frames are processed on this device, not uploaded or recorded. Allow space around you and keep your whole body visible.</p><div class="pose-view"><video id="pose-video" muted playsinline></video><canvas id="pose-overlay"></canvas></div><p id="pose-result" role="status">Camera off</p><div class="row"><button id="pose-start">Load model & start camera</button><button id="pose-stop">Stop camera</button></div><p>Landmarks are an approximate teaching aid, not medical or injury-prevention advice. Requires HTTPS or localhost and camera permission. Mobile WebViews may require opening this page in your browser.</p>`);
  const video=document.getElementById('pose-video'), canvas=document.getElementById('pose-overlay'), output=document.getElementById('pose-result'), start=document.getElementById('pose-start');
  const ctx=canvas.getContext('2d'); let detector, stream, frame, token=0, lastTime=-1;
  function stop(){token++;cancelAnimationFrame(frame);stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;detector?.close();detector=null;ctx.clearRect(0,0,canvas.width,canvas.height);output.textContent='Camera off';start.disabled=false;}
  action('pose-start',async()=>{
    stop();const current=token;start.disabled=true;output.textContent='Loading pose model…';
    try{
      const files=await FilesetResolver.forVisionTasks('./vision-wasm');
      if(current!==token)return;
      const loaded=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'},runningMode:'VIDEO',numPoses:1});
      if(current!==token){loaded.close();return;}detector=loaded;output.textContent='Waiting for camera permission…';
      const incoming=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
      if(current!==token){incoming.getTracks().forEach(t=>t.stop());return;}stream=incoming;video.srcObject=stream;await video.play();if(current!==token)return;lastTime=-1;
      function tick(){
        if(current!==token)return;
        try{
          if(video.readyState>=2 && video.currentTime!==lastTime){
            lastTime=video.currentTime;canvas.width=video.videoWidth;canvas.height=video.videoHeight;
            const result=detector.detectForVideo(video,performance.now());ctx.clearRect(0,0,canvas.width,canvas.height);
            const points=result.landmarks[0];output.textContent=points?'Tracking body landmarks':'No body found. Step back and improve lighting.';
            if(points){ctx.strokeStyle='#4be4ad';ctx.lineWidth=3;for(const edge of PoseLandmarker.POSE_CONNECTIONS){const a=points[edge.start],b=points[edge.end];if(a.visibility<0.5||b.visibility<0.5)continue;ctx.beginPath();ctx.moveTo(a.x*canvas.width,a.y*canvas.height);ctx.lineTo(b.x*canvas.width,b.y*canvas.height);ctx.stroke();}ctx.fillStyle='#fff';for(const p of points){if(p.visibility<0.5)continue;ctx.beginPath();ctx.arc(p.x*canvas.width,p.y*canvas.height,4,0,Math.PI*2);ctx.fill();}}
          }
          frame=requestAnimationFrame(tick);
        }catch(error){stop();status(`Pose tracking stopped: ${error.message}`);}
      }tick();
    }catch(error){if(current===token){stop();status(`Could not start pose tracking: ${error.message}. Check camera permission and model-download connectivity.`);}}
  });action('pose-stop',stop);return stop;
}
