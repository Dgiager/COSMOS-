'use strict';
const APP_KEY='cosmos-v2';
const ACTIVE_KEY='cosmos-active-profile';
const GUEST_ID='guest';
const $=q=>document.querySelector(q);
const $$=q=>[...document.querySelectorAll(q)];
const rad=x=>x*Math.PI/180;
const deg=x=>x*180/Math.PI;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const today=()=>new Date().toISOString().slice(0,10);

const defaultProfile=(id,name,email='',pin='')=>({id,name,email,pin,xp:0,dust:0,discoveries:[],daily:{date:'',done:[]},totalChallenges:0,usedGPS:false,location:null,created:Date.now()});
let store=loadStore();
let activeId=localStorage.getItem(ACTIVE_KEY)||'';
let profile=null;
let loc=null;
let visible=[];
let selected=null;
let pendingProfileId='';
let zoom=1;
let catalogOffset=0;

function loadStore(){try{return JSON.parse(localStorage.getItem(APP_KEY))||{profiles:{}}}catch{return{profiles:{}}}}
function saveStore(){localStorage.setItem(APP_KEY,JSON.stringify(store));if(activeId)localStorage.setItem(ACTIVE_KEY,activeId)}
function findObj(id){return objects.find(o=>o.id===id)}
function openModal(id){$('#'+id).classList.remove('hidden')}
function closeModal(id){$('#'+id).classList.add('hidden')}
function toast(text){const t=$('#toast');t.textContent=text;t.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.classList.remove('show'),2600)}
function hashPin(pin){let h=2166136261;for(const c of pin){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return String(h>>>0)}
function currentRank(xp){let current=ranks[0],next=null;for(let i=0;i<ranks.length;i++){if(xp>=ranks[i][1])current=ranks[i];else{next=ranks[i];break}}return{current,next}}
function unlockedBadges(p){return badgeDefs.filter(b=>b.test(p))}
function ensureDaily(p){if(p.daily.date!==today())p.daily={date:today(),done:[]}}

function startAs(id){
  activeId=id;
  if(id===GUEST_ID)localStorage.removeItem(ACTIVE_KEY);
  profile=id===GUEST_ID?defaultProfile(GUEST_ID,'Guest Explorer'):store.profiles[id];
  ensureDaily(profile);
  if(id!==GUEST_ID)saveStore();
  loc=profile.location;
  $('#hero').classList.add('hidden');
  $('#dash').classList.remove('hidden');
  $('#rankPill').textContent=profile.name;
  renderAll();
  if(!loc)openModal('locationModal');
}

function renderAll(){ensureDaily(profile);renderStats();renderBadges();renderCatalog();renderMissions();if(loc)renderSky()}
function renderStats(){
  const r=currentRank(profile.xp);
  $('#rank').textContent=r.current[0];
  $('#rankPill').textContent=profile.name+' · '+r.current[0];
  $('#xp').textContent=profile.xp+' XP';
  $('#dust').textContent=profile.dust+' ✦';
  $('#badgeCount').textContent=unlockedBadges(profile).length+'/'+badgeDefs.length;
  const pct=r.next?((profile.xp-r.current[1])/(r.next[1]-r.current[1]))*100:100;
  $('#rankBar').style.width=clamp(pct,0,100)+'%';
}

function renderBadges(){
  const unlocked=new Set(unlockedBadges(profile).map(b=>b.id));
  $('#badgeGrid').innerHTML=badgeDefs.map(b=>`<div class="badge ${unlocked.has(b.id)?'':'locked'}"><div class="seal">${b.icon}</div><strong>${b.name}</strong><small>${b.desc}</small></div>`).join('');
}

function renderCatalog(){
  const ordered=[...objects.slice(catalogOffset),...objects.slice(0,catalogOffset)].slice(0,6);
  $('#objectGrid').innerHTML=ordered.map(o=>`<button class="object" data-object="${o.id}"><span class="emoji">${o.emoji}</span><strong>${o.name}</strong><small>${o.sub}</small></button>`).join('');
  $$('.object').forEach(b=>b.onclick=()=>openExplorer(b.dataset.object));
}

function daySeed(){return Number(today().replaceAll('-',''))}
function dailyChallenges(){
  const stars=visible.filter(v=>v.object.kind==='Star');
  const first=stars[daySeed()%Math.max(1,stars.length)]?.object||objects[daySeed()%6];
  const galaxy=objects.filter(o=>o.kind==='Galaxy')[daySeed()%6];
  return[
    {id:'inspect-'+first.id,icon:'🔭',title:'Inspect '+first.name,desc:'Open the zoom explorer and log this object.',reward:35,xp:40,object:first.id},
    {id:'galaxy-'+galaxy.id,icon:'🌀',title:'Visit '+galaxy.name,desc:'Zoom into today’s featured galaxy and log it.',reward:50,xp:55,object:galaxy.id},
    {id:'sky-refresh',icon:'🧭',title:'Survey your sky',desc:'Refresh the live sky dome and study the visible targets.',reward:20,xp:25,action:'refresh'}
  ];
}

function renderMissions(){
  const list=dailyChallenges();
  $('#challengeDate').textContent=new Date().toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric'});
  $('#missions').innerHTML=list.map(m=>{const done=profile.daily.done.includes(m.id);return `<div class="mission ${done?'done':''}"><div class="missiontop"><div class="missionicon">${m.icon}</div><div><h3>${m.title}</h3><p>${m.desc}</p></div></div><div class="missionfoot"><span class="reward">+${m.reward} Stardust · +${m.xp} XP</span><button class="btn small complete" data-mission="${m.id}" ${done?'disabled':''}>${done?'Completed':'Open'}</button></div></div>`}).join('');
  $$('.complete').forEach(btn=>btn.onclick=()=>{const m=list.find(x=>x.id===btn.dataset.mission);if(m.object)openExplorer(m.object);else if(m.action==='refresh'){renderSky();completeMission(m.id,m.reward,m.xp)}});
}

function completeMission(id,dust,xp){
  if(profile.daily.done.includes(id))return;
  profile.daily.done.push(id);profile.dust+=dust;profile.xp+=xp;profile.totalChallenges++;
  persist();renderAll();toast('Challenge complete: +'+dust+' Stardust and +'+xp+' XP');
}

function persist(){if(activeId!==GUEST_ID){store.profiles[activeId]=profile;saveStore()}}
function julianDate(d=new Date()){return d.getTime()/86400000+2440587.5}
function localSidereal(lon){const jd=julianDate(),t=(jd-2451545)/36525;let gst=280.46061837+360.98564736629*(jd-2451545)+.000387933*t*t-t*t*t/38710000;return((gst+lon)%360+360)%360}
function altAz(o,latitude,longitude){
  const lst=localSidereal(longitude),ha=rad(((lst-o.ra*15+540)%360)-180),lat=rad(latitude),dec=rad(o.dec);
  const alt=Math.asin(Math.sin(dec)*Math.sin(lat)+Math.cos(dec)*Math.cos(lat)*Math.cos(ha));
  const az=Math.atan2(-Math.sin(ha)*Math.cos(dec),Math.sin(dec)*Math.cos(lat)-Math.cos(dec)*Math.sin(lat)*Math.cos(ha));
  return{alt:deg(alt),az:(deg(az)+360)%360};
}
function direction(az){return['N','NE','E','SE','S','SW','W','NW'][Math.round(az/45)%8]}

function renderSky(){
  if(!loc)return;
  $('#place').textContent=loc.name;
  $('#summary').textContent=loc.note+' · '+loc.lat.toFixed(2)+'°, '+loc.lon.toFixed(2)+'°';
  visible=objects.filter(o=>o.kind==='Star').map(o=>({object:o,...altAz(o,loc.lat,loc.lon)})).filter(x=>x.alt>-8).sort((a,b)=>b.alt-a.alt);
  $('#visibleCount').textContent=visible.length+' targets';
  const sky=$('#sky');sky.querySelectorAll('.star').forEach(s=>s.remove());
  visible.forEach(v=>{
    const r=(90-clamp(v.alt,0,90))/90*46,theta=rad(v.az-90),x=50+r*Math.cos(theta),y=50+r*Math.sin(theta),size=clamp(8-v.object.mag,4,10);
    const b=document.createElement('button');b.className='star';b.style.left=x+'%';b.style.top=y+'%';b.style.color=v.object.style==='starRed'?'#ff9d86':v.object.style==='starGold'?'#ffe29a':'#ddecff';b.innerHTML=`<i style="width:${size}px;height:${size}px"></i><b>${v.object.name}</b>`;b.onclick=()=>{openExplorer(v.object.id);$('#detail').textContent=`${v.object.name}: ${direction(v.az)}, ${Math.max(0,v.alt).toFixed(0)}° above horizon.`};sky.appendChild(b);
  });
  renderMissions();
}

function openExplorer(id){
  selected=findObj(id);if(!selected)return;zoom=1;$('#zoomSlider').value='1';
  $('#objectKind').textContent=selected.kind.toUpperCase();$('#objectName').textContent=selected.name;$('#objectSubtitle').textContent=selected.sub;$('#objectDescription').textContent=selected.desc;
  $('#objectFacts').innerHTML=`<div class="fact"><span>DISTANCE</span><strong>${selected.distance}</strong></div><div class="fact"><span>SIZE</span><strong>${selected.size}</strong></div><div class="fact"><span>MAGNITUDE</span><strong>${selected.mag}</strong></div><div class="fact"><span>${selected.kind==='Star'?'TEMPERATURE':'DETAIL'}</span><strong>${selected.detail}</strong></div>`;
  const logged=profile.discoveries.includes(selected.id);$('#logDiscovery').disabled=logged;$('#logDiscovery').textContent=logged?'Discovery logged':'Log discovery';$('#objectReward').textContent=logged?'Already in your exploration record.':'Earn 20 Stardust and 30 XP for your first logged inspection.';
  updateZoom();openModal('explorerModal');
}

function updateZoom(){zoom=Number($('#zoomSlider').value);$('#zoomLabel').textContent=zoom.toFixed(1)+'×';drawObject()}
function drawObject(){
  const canvas=$('#objectCanvas'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
  const g=ctx.createRadialGradient(w/2,h/2,10,w/2,h/2,w*.7);g.addColorStop(0,'#142a68');g.addColorStop(1,'#01030b');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  const seed=selected.id.split('').reduce((a,c)=>a+c.charCodeAt(0),0);for(let i=0;i<120;i++){const x=(Math.sin(seed*i*12.9898)*43758.5453%1+1)%1*w,y=(Math.sin((seed+i)*78.233)*12345.67%1+1)%1*h,s=(i%7===0?2:1);ctx.fillStyle='rgba(255,255,255,'+(0.25+(i%5)/10)+')';ctx.fillRect(x,y,s,s)}
  ctx.save();ctx.translate(w/2,h/2);ctx.scale(zoom,zoom);
  if(selected.kind==='Star')drawStar(ctx,selected);else drawGalaxy(ctx,selected);ctx.restore();
}
function drawStar(ctx,o){
  const color=o.style==='starRed'?'#ff7d5e':o.style==='starGold'?'#ffd66e':'#cde8ff';
  const glow=ctx.createRadialGradient(0,0,4,0,0,95);glow.addColorStop(0,'#fff');glow.addColorStop(.12,color);glow.addColorStop(.5,color+'77');glow.addColorStop(1,'transparent');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,100,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle=color+'88';for(let i=0;i<12;i++){ctx.rotate(Math.PI/6);ctx.beginPath();ctx.moveTo(18,0);ctx.lineTo(145+(i%3)*20,0);ctx.stroke()}
}
function drawGalaxy(ctx,o){
  ctx.globalCompositeOperation='lighter';ctx.rotate(o.style==='edge'?.15:.45);const arms=o.style==='edge'?2:4;
  for(let a=0;a<arms;a++){ctx.rotate(Math.PI*2/arms);for(let i=0;i<180;i++){const t=i/18,r=5+i*.8,x=Math.cos(t)*r,y=Math.sin(t)*r*.43;ctx.fillStyle=`rgba(${170+i%70},${190+i%55},255,${.18+i/1200})`;ctx.beginPath();ctx.arc(x,y,1.5+(i%4)/3,0,Math.PI*2);ctx.fill()}}
  const core=ctx.createRadialGradient(0,0,2,0,0,55);core.addColorStop(0,'#fff7d4');core.addColorStop(.2,'#ffd58a');core.addColorStop(1,'transparent');ctx.fillStyle=core;ctx.beginPath();ctx.arc(0,0,60,0,Math.PI*2);ctx.fill();
  if(o.style==='dust'||o.style==='edge'){ctx.globalCompositeOperation='source-over';ctx.strokeStyle='rgba(10,7,18,.8)';ctx.lineWidth=16;ctx.beginPath();ctx.moveTo(-130,15);ctx.lineTo(130,-15);ctx.stroke()}ctx.globalCompositeOperation='source-over';
}

function logDiscovery(){
  if(profile.discoveries.includes(selected.id))return;
  profile.discoveries.push(selected.id);profile.dust+=20;profile.xp+=30;persist();
  const relevant=dailyChallenges().filter(m=>m.object===selected.id&&!profile.daily.done.includes(m.id));relevant.forEach(m=>completeMission(m.id,m.reward,m.xp));
  renderAll();$('#logDiscovery').disabled=true;$('#logDiscovery').textContent='Discovery logged';toast(selected.name+' added to your cosmic record');
}

function setLocation(name,note,lat,lon,gps=false){loc={name,note,lat,lon};profile.location=loc;if(gps)profile.usedGPS=true;persist();closeModal('locationModal');renderAll();toast('Expedition sky set to '+name)}
function renderCities(){$('#cityList').innerHTML=cities.map((c,i)=>`<button class="profilepick" data-city="${i}"><div class="avatar">⌖</div><div class="profilemeta"><strong>${c[0]}</strong><small>${c[1]}</small></div><span>›</span></button>`).join('');$$('[data-city]').forEach(b=>b.onclick=()=>{const c=cities[Number(b.dataset.city)];setLocation(c[0],c[1],c[2],c[3])})}

function renderProfiles(){
  const profiles=Object.values(store.profiles);$('#noProfiles').classList.toggle('hidden',profiles.length>0);
  $('#profileList').innerHTML=profiles.map(p=>`<div class="profilepick"><div class="avatar">${p.name.charAt(0).toUpperCase()}</div><div class="profilemeta"><strong>${p.name}</strong><small>${currentRank(p.xp).current[0]} · ${p.xp} XP</small></div><button class="btn small" data-signin="${p.id}">Sign in</button></div>`).join('');
  $$('[data-signin]').forEach(b=>b.onclick=()=>{pendingProfileId=b.dataset.signin;$('#pinTitle').textContent='Sign in as '+store.profiles[pendingProfileId].name;$('#loginPin').value='';closeModal('accountModal');openModal('pinModal')});
}
function createProfile(){
  const name=$('#newName').value.trim(),email=$('#newEmail').value.trim(),pin=$('#newPin').value.trim();
  if(name.length<2)return toast('Enter an explorer name');if(!/^\d{4}$/.test(pin))return toast('PIN must be exactly four digits');
  const id='p'+Date.now().toString(36);store.profiles[id]=defaultProfile(id,name,email,hashPin(pin));activeId=id;saveStore();closeModal('accountModal');startAs(id);toast('Profile created for '+name);
}
function login(){const p=store.profiles[pendingProfileId];if(!p)return;if(hashPin($('#loginPin').value)!==p.pin)return toast('Incorrect PIN');closeModal('pinModal');startAs(p.id);toast('Welcome back, '+p.name)}

$('#startBtn').onclick=()=>{renderProfiles();openModal('accountModal')};
$('#guestBtn').onclick=()=>startAs(GUEST_ID);
$('#accountBtn').onclick=()=>{renderProfiles();openModal('accountModal')};
$('#rankPill').onclick=()=>{renderProfiles();openModal('accountModal')};
$('#createProfile').onclick=createProfile;$('#loginProfile').onclick=login;
$$('.closex').forEach(b=>b.onclick=()=>closeModal(b.dataset.close));
$$('.tab').forEach(tab=>tab.onclick=()=>{$$('.tab').forEach(t=>t.classList.remove('active'));tab.classList.add('active');$('#signinPanel').classList.toggle('hidden',tab.dataset.tab!=='signin');$('#createPanel').classList.toggle('hidden',tab.dataset.tab!=='create')});
$('#changeLocation').onclick=()=>openModal('locationModal');
$('#refreshSky').onclick=()=>{renderSky();const m=dailyChallenges().find(x=>x.action==='refresh');completeMission(m.id,m.reward,m.xp)};
$('#useLocation').onclick=()=>{if(!navigator.geolocation)return toast('Location is not available in this browser');navigator.geolocation.getCurrentPosition(p=>setLocation('Current Location','Live device sky',p.coords.latitude,p.coords.longitude,true),()=>toast('Location permission was not granted'),{enableHighAccuracy:false,timeout:10000})};
$('#shuffleObjects').onclick=()=>{catalogOffset=(catalogOffset+5)%objects.length;renderCatalog()};
$('#zoomSlider').oninput=updateZoom;$('#zoomIn').onclick=()=>{$('#zoomSlider').value=clamp(Number($('#zoomSlider').value)+.5,1,8);updateZoom()};$('#zoomOut').onclick=()=>{$('#zoomSlider').value=clamp(Number($('#zoomSlider').value)-.5,1,8);updateZoom()};$('#logDiscovery').onclick=logDiscovery;
renderCities();
if(activeId&&store.profiles[activeId])startAs(activeId);
