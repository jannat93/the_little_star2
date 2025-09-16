const video = document.getElementById('cam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const btnStart = document.getElementById('btnStart');
const btnMotion = document.getElementById('btnMotion');
const statusEl = document.getElementById('status');
const pollutionSlider = document.getElementById('pollution');
const pollLabel = document.getElementById('pollLabel');
const cleanBtn = document.getElementById('cleanBtn');
const fovSlider = document.getElementById('fov');
const fovVal = document.getElementById('fovVal');
const nasaBtn = document.getElementById('btnNASA');
const nasaCard = document.getElementById('nasaCard');
const nasaTitle = document.getElementById('nasaTitle');
const nasaImage = document.getElementById('nasaImage');
const nasaDesc = document.getElementById('nasaDesc');
const closeNasa = document.getElementById('closeNasa');

let lat=0, lon=0, heightMeters=0;
let deviceAz=0, deviceAlt=0;
let pollution = 0.5, cleaning=false;

// Canvas
function fitCanvas(){
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// Small bright stars catalog (RA in degrees)
const starsCatalog = [
  {name:'Sirius', ra:101.2875, dec:-16.7161, mag:-1.46},
  {name:'Canopus', ra:95.9879, dec:-52.6957, mag:-0.74},
  {name:'Arcturus', ra:213.9154, dec:19.1825, mag:-0.05},
  {name:'Vega', ra:279.2347, dec:38.7837, mag:0.03},
  {name:'Capella', ra:79.1723, dec:45.9979, mag:0.08},
  {name:'Rigel', ra:78.6345, dec:-8.2016, mag:0.12},
  {name:'Procyon', ra:114.8255, dec:5.2250, mag:0.34},
  {name:'Betelgeuse', ra:88.7929, dec:7.4071, mag:0.42},
  {name:'Altair', ra:297.6958, dec:8.8683, mag:0.77}
];

// Status helper
function setStatus(s){ statusEl.textContent = 'Status: ' + s; }

// Camera
btnStart.addEventListener('click', async ()=>{
  setStatus('Starting camera...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    video.srcObject = stream;
    await video.play();
    setStatus('Camera started — getting location...');
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(pos=>{
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
        if(pos.coords.altitude!==null) heightMeters = pos.coords.altitude;
        setStatus(`Location: ${lat.toFixed(2)}, ${lon.toFixed(2)} — allow motion`);
        requestAnimationFrame(renderLoop);
      }, ()=> requestAnimationFrame(renderLoop), {enableHighAccuracy:true});
    } else {
      requestAnimationFrame(renderLoop);
    }
  } catch(err){ alert(err.message); setStatus('Camera failed'); }
});

// Motion
btnMotion.addEventListener('click', async ()=>{
  if(typeof DeviceOrientationEvent !== 'undefined' &&
     typeof DeviceOrientationEvent.requestPermission === 'function'){
    const resp = await DeviceOrientationEvent.requestPermission();
    if(resp==='granted') window.addEventListener('deviceorientation', handleOrientation);
  } else window.addEventListener('deviceorientation', handleOrientation);
});

function handleOrientation(e){
  if(e.webkitCompassHeading!==undefined) deviceAz=e.webkitCompassHeading;
  else if(e.alpha!==null) deviceAz = 360 - e.alpha;
  if(e.beta!==null) deviceAlt = e.beta - 90;
  deviceAz = (deviceAz+360)%360;
}

// Pollution/FOV
pollutionSlider.addEventListener('input', ()=> { pollution=pollutionSlider.value/100; pollLabel.textContent=`${pollutionSlider.value}%`; });
fovSlider.addEventListener('input', ()=> fovVal.textContent=fovSlider.value);
cleanBtn.addEventListener('click', ()=>{
  cleaning=true;
  const step = setInterval(()=>{
    pollution=Math.max(0,pollution-0.01);
    pollutionSlider.value=Math.round(pollution*100);
    pollLabel.textContent=`${Math.round(pollution*100)}%`;
    if(pollution<=0.01){ cleaning=false; clearInterval(step);}
  },80);
});

// Projection
function projectToScreen(objAz,objAlt){
  let deltaAz = (objAz-deviceAz+540)%360-180;
  let deltaAlt = objAlt-deviceAlt;
  const hfov=Number(fovSlider.value);
  const aspect=canvas.height/canvas.width;
  const vfov=hfov*aspect;
  if(Math.abs(deltaAz)>hfov/2 || Math.abs(deltaAlt)>vfov/2) return null;
  const x=canvas.width/2 + (deltaAz/(hfov/2))*(canvas.width/2);
  const y=canvas.height/2 - (deltaAlt/(vfov/2))*(canvas.height/2);
  return {x,y,deltaAz,deltaAlt};
}

// RA/Dec -> Alt/Az
function getAltAzFromRaDec(raDeg,decDeg,date,lat_,lon_,height_){
  try{
    const raH=raDeg/15;
    const obs = new Astronomy.Observer(lat_,lon_,height_);
    const eq = Astronomy.Equatorial(raH,decDeg,1);
    const hor = Astronomy.Horizon(Astronomy.MakeTime(date), obs, eq.ra, eq.dec,'normal');
    return {az:hor.azimuth, alt:hor.altitude};
  }catch{return null;}
}

// Render loop
function renderLoop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const now = new Date();

  // Moon
  let moonPos=null;
  try{
    const mEq = Astronomy.Equator('Moon', Astronomy.MakeTime(now), new Astronomy.Observer(lat,lon,heightMeters), true, true);
    const mHor = Astronomy.Horizon(Astronomy.MakeTime(now), new Astronomy.Observer(lat,lon,heightMeters), mEq.ra,mEq.dec,'normal');
    moonPos={az:mHor.azimuth, alt:mHor.altitude};
  }catch{}

  // Draw stars
  starsCatalog.forEach(st=>{
    const pos = getAltAzFromRaDec(st.ra,st.dec,now,lat,lon,heightMeters);
    if(!pos||pos.alt<=0) return;
    const screen=projectToScreen(pos.az,pos.alt);
    if(!screen) return;
    const baseVis=Math.max(0,1-(st.mag+1)/7);
    const opacity=Math.max(0.1,Math.min(1,baseVis*(1-pollution)));
    ctx.beginPath();
    const size=Math.max(1.2,4-st.mag);
    ctx.fillStyle=`rgba(255,255,255,${opacity})`;
    ctx.arc(screen.x,screen.y,size,0,Math.PI*2);
    ctx.fill();
  });

  // Draw Moon
  if(moonPos && moonPos.alt>0){
    const screenMoon=projectToScreen(moonPos.az,moonPos.alt);
    if(screenMoon){
      const moonOpacity = Math.max(0.4,1-pollution*0.5);
      ctx.beginPath();
      ctx.fillStyle=`rgba(255,245,200,${moonOpacity})`;
      ctx.arc(screenMoon.x,screenMoon.y,25,0,Math.PI*2);
      ctx.fill();
    }
  }

  // Center reticle
  ctx.strokeStyle='rgba(255,255,255,0.08)';
  ctx.lineWidth=1;
  ctx.beginPath();
  ctx.arc(canvas.width/2,canvas.height/2,6,0,Math.PI*2);
  ctx.stroke();

  // Pollution overlay
  const cloudAlpha=Math.min(0.85,pollution*0.9);
  if(cloudAlpha>0.02){
    const g=ctx.createRadialGradient(canvas.width/2,canvas.height/2,Math.min(canvas.width,canvas.height)*0.1,
      canvas.width/2,canvas.height/2,Math.max(canvas.width,canvas.height));
    g.addColorStop(0, `rgba(180,180,200,${cloudAlpha*0.3})`);
    g.addColorStop(1, `rgba(30,30,40,${cloudAlpha*0.9})`);
    ctx.fillStyle=g;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  setStatus(`lat:${lat.toFixed(2)}, lon:${lon.toFixed(2)} | Az:${Math.round(deviceAz)}° Alt:${Math.round(deviceAlt)}° | Pollution:${Math.round(pollution*100)}%`);
  requestAnimationFrame(renderLoop);
}

// NASA APOD
const NASA_API_KEY='DEMO_KEY';
const APOD_URL=`https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`;
nasaBtn.addEventListener('click', async ()=>{
  try{
    const r=await fetch(APOD_URL);
    const j=await r.json();
    nasaTitle.textContent=j.title||'NASA APOD';
    nasaImage.src=j.url||'';
    nasaDesc.textContent=j.explanation||'';
    nasaCard.style.display='block';
  }catch(e){ alert(e.message);}
});
closeNasa.addEventListener('click', ()=> nasaCard.style.display='none');
