(function () {
  'use strict';
  let map, pins, routeLayer, origin, mode='', request=0, controller;
  const panel=document.getElementById('tutor-map-panel'), status=document.getElementById('tutor-map-status');
  const say=text=>{status.textContent=text;};
  function avatar(tutor){
    const frame=document.createElement('span');
    frame.style.cssText='display:inline-flex;width:44px;height:44px;flex-shrink:0;border:3px solid white;border-radius:50%;background:#b42335;color:white;align-items:center;justify-content:center;overflow:hidden;box-shadow:0 2px 8px #0004;font:bold 16px sans-serif';
    const fallback=document.createElement('img');fallback.src='/assets/tutor-map-person.svg';fallback.alt='Profile photo unavailable';fallback.style.cssText='width:100%;height:100%;object-fit:cover';frame.append(fallback);
    if(tutor.photoUrl){
      try{
        const url=new URL(tutor.photoUrl,window.location.origin);
        if(['http:','https:'].includes(url.protocol)){
          const img=document.createElement('img');img.alt=tutor.name||'Tutor';
          img.style.cssText='width:100%;height:100%;object-fit:cover';
          img.onload=()=>frame.replaceChildren(img);
          img.src=url.href;
        }
      }catch{/* Keep initials when the profile image URL is invalid. */}
    }
    return frame;
  }
  // One plain "<area/city>, <state>, <country>" line - every part of the
  // location on file, just joined into one string instead of separate
  // labeled rows, and with no "not saved yet" caveat or legacy fallback.
  function locationDetails(tutor){
    const details=document.createElement('div');details.style.cssText='margin:8px 0;line-height:1.6';
    const location=tutor.location||{};
    const city=location.city || (tutor.city && !tutor.city.includes(',') ? tutor.city : null);
    const parts=[location.area || city,location.state,location.country].filter(Boolean);
    const row=document.createElement('div');
    row.textContent=parts.filter((part,index)=>parts.findIndex(value=>value.trim().toLowerCase()===part.trim().toLowerCase())===index).join(', ') || 'Location not provided';
    details.append(row);
    return details;
  }
  function clearRoute(){request++;controller?.abort();if(routeLayer){map.removeLayer(routeLayer);routeLayer=null;}}
  function init(){
    if(map)return true;
    if(!window.L){say('Map could not load. You can still browse the tutor list.');return false;}
    map=L.map('tutor-discovery-map').setView([0,0],2);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
    pins=L.layerGroup().addTo(map);return true;
  }
  async function routeTo(tutor, output, permission, road=false){
    clearRoute();const version=request;
    const report=text=>{output.textContent=text;};
    if(!window.ReactNativeWebView){
      try {
        const response=await fetch('/api/profile/map-origin',{cache:'no-store'});
        const data=await response.json();
        if(version!==request)return;
        origin=response.ok && data.location ? [data.location.lat,data.location.lng] : null;
      } catch { if(version!==request)return; origin=null; }
    }
    if(!origin){report('No saved location is available. Sign in and update your profile location to calculate distance.');return;}
    const destination=[tutor.mapLocation.lat,tutor.mapLocation.lng];
    const direct=(map.distance(origin,destination)/1000).toFixed(1);
    if(!road){
      report(`${direct} km apart in a straight line from your saved location${tutor.mapLocation.approximate ? ' to the tutor’s approximate area' : ''}.`);
      permission.hidden=false;
      return;
    }
    permission.hidden=true;
    const from=mode==='physical'?destination:origin,to=mode==='physical'?origin:destination;
    controller=new AbortController();const routeController=controller;const timer=setTimeout(()=>routeController.abort(),15000);
    report('Calculating road distance…');
    try{
      const response=await fetch(`https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`,{signal:controller.signal});
      const data=await response.json();if(version!==request)return;
      if(!response.ok||data.code!=='Ok'||!data.routes?.length)throw new Error('No driving route');
      const route=data.routes[0];routeLayer=L.geoJSON(route.geometry,{style:{color:'#b42335',weight:5}}).addTo(map);map.fitBounds(routeLayer.getBounds(),{padding:[28,28],maxZoom:13});
      report(`${tutor.name}: ${(route.distance/1000).toFixed(1)} km by road, about ${Math.round(route.duration/60)} minutes from your saved location. ${tutor.mapLocation.approximate ? 'Tutor destination is approximate.' : ''} Not live traffic.`);
    }catch{if(version===request){report(`Road route unavailable. ${direct} km apart in a straight line—not road distance.`);permission.hidden=false;}}
    finally{clearTimeout(timer);}
  }
  function show(tutors,nextMode){
    mode=nextMode;panel.hidden=!['physical','studio'].includes(mode);clearRoute();
    if(panel.hidden)return;if(!init())return;map.invalidateSize();pins.clearLayers();
    const located=tutors.filter(t=>t.mapLocation && Number.isFinite(t.mapLocation.lat)&&Number.isFinite(t.mapLocation.lng));
    const groups=new Map();for(const tutor of located){const key=`${tutor.mapLocation.lat},${tutor.mapLocation.lng}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(tutor);}
    for(const siblings of groups.values()){
      for(const [siblingIndex,singleTutor] of siblings.entries()){
      const group=[singleTutor];
      const popup=document.createElement('div');popup.style.maxHeight='260px';popup.style.overflowY='auto';
      if(group.length>1){const shared=document.createElement('p');shared.textContent=`${group.length} tutors share this approximate map area. Choose a tutor below; these are not exact addresses.`;popup.append(shared);}
      for(const tutor of group){const item=document.createElement('section'),name=document.createElement('strong'),details=document.createElement('p'),profile=document.createElement('a'),route=document.createElement('button');
        item.style.cssText='padding:12px 0;border-bottom:1px solid #e5e7eb';
        const heading=document.createElement('div');heading.style.cssText='display:flex;align-items:center;gap:10px';
        name.textContent=tutor.name;heading.append(avatar(tutor),name);details.textContent=(tutor.categories||[]).join(', ');
        profile.textContent='View profile';profile.href='/tutor/'+String(tutor.name||'').toLowerCase().trim().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
        profile.onclick=event=>{if(window.ReactNativeWebView){event.preventDefault();window.ReactNativeWebView.postMessage(JSON.stringify({type:'tutor-profile',id:tutor.id}));}};
        const output=document.createElement('p'),permission=document.createElement('button');output.setAttribute('role','status');
        permission.type='button';permission.hidden=true;permission.textContent='Calculate road route — share coordinates with OSRM';permission.style.cssText='white-space:normal;padding:8px;max-width:100%';
        permission.onclick=()=>routeTo(tutor,output,permission,true);
        route.type='button';route.textContent='Show route distance';route.style.cssText='display:block;margin:10px 0;padding:8px;background:#b42335;color:white;border-radius:6px';route.onclick=()=>routeTo(tutor,output,permission);item.append(heading,locationDetails(tutor),details,profile,route,output,permission);popup.append(item);}
      const marker=document.createElement('div');marker.style.cssText='position:relative;width:48px;height:58px';
      const shell=document.createElement('div');shell.style.cssText='position:absolute;width:44px;height:44px;background:#2477cd;border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 5px #0005';
      const face=avatar(group[0]);face.style.cssText+=';position:absolute;left:4px;top:4px;width:34px;height:34px;border:0;transform:rotate(45deg);box-shadow:none';shell.append(face);marker.append(shell);
      if(group.length>1){const count=document.createElement('span');count.textContent=String(group.length);count.style.cssText='position:absolute;right:-6px;top:-6px;background:#b42335;color:white;border:2px solid white;border-radius:14px;padding:2px 5px;font:bold 12px sans-serif';marker.append(count);}
      const label=`${singleTutor.name} — ${singleTutor.mapLocation.approximate ? 'approximate area' : 'shared teaching location'}`;
      const offset=(siblingIndex-(siblings.length-1)/2)*50;
      if(siblings.length>1){const note=document.createElement('p');note.textContent='Pin icons are spread apart because these tutors share the same saved map point.';popup.prepend(note);}
      const accuracy=document.createElement('small');accuracy.textContent=singleTutor.mapLocation.approximate?'Approximate area (exact sharing is off).':'Exact teaching location shared by this tutor.';popup.prepend(accuracy);
      L.marker([singleTutor.mapLocation.lat,singleTutor.mapLocation.lng],{icon:L.divIcon({html:marker,className:'tutor-photo-marker',iconSize:[48,58],iconAnchor:[24-offset,58],popupAnchor:[offset,-58]}),title:label,alt:label}).bindPopup(popup).addTo(pins);
      }
    }
    if(located.length)map.fitBounds(located.map(t=>[t.mapLocation.lat,t.mapLocation.lng]),{padding:[30,30],maxZoom:11});
    say('');
  }
  window.addEventListener('mozart:tutor-map',event=>show(event.detail.tutors||[],event.detail.mode));
  window.addEventListener('mozart:map-origin',event=>{
    const point=event.detail;
    origin=point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat)<=90 && Math.abs(point.lng)<=180 ? [point.lat,point.lng] : null;
    clearRoute();
  });
  // Hide immediately on mode changes rather than waiting for the roster request.
  document.getElementById('lesson-tabs').addEventListener('click',event=>{const tab=event.target.closest('[data-type]');if(tab){clearRoute();panel.hidden=!['physical','studio'].includes(tab.dataset.type);}});
})();
