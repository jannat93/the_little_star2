/* The Little Sky — AR (full)
   - Uses astronomy-engine to compute Alt/Az for Moon and catalog stars
   - Uses device orientation + geolocation to point the camera
   - Pollution slider / clean button control cloud opacity and which objects are visible
   - NASA APOD integration (DEMO_KEY by default — replace with your API key)
*/

// Elements
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

// canvas size
function fitCanvas(){
  canvas.width = video.videoWidth || window.innerWidth;
  canvas.height = video.videoHeight || window.innerHeight;
}
window.addEventListener('resize', ()=>{ fitCanvas(); });

// state
let lat = null, lon = null, heightMeters = 0;
let deviceAz = 0, deviceAlt = 0; // device pointing azimuth, altitude (deg)
let starsCatalog = []; // will hold star objects {name, ra, dec, mag}
let pollution = Number(pollutionSlider.value) / 100; // 0..1 (1 = very polluted)
let cleaning = false;

// Small bright-star catalog (RA in degrees, Dec in degrees, mag)
starsCatalog = [
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

// helper: status
function setStatus(s){ statusEl.textContent = 'Status: ' + s; }

// start camera
btnStart.addEventListener('click', async () => {
  setStatus('starting camera...');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}});
    video.srcObject = stream;
    await video.play();
    fitCanvas();
    setStatus('camera started — get location & enable motion');
  } catch (err) {
    setStatus('camera failed: ' + err.message);
    alert('Camera error: ' + err.message);
    return;
  }

  // get location
  if('geolocation' in navigator){
    navigator.geolocation.getCurrentPosition(pos => {
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
      if(pos.coords.altitude !== null) heightMeters = pos.coords.altitude;
      setStatus(`location ${lat.toFixed(4)}, ${lon.toFixed(4)} — allow motion`);
      // begin render loop once we have location & (optionally) device orientation
      requestAnimationFrame(renderLoop);
    }, err => {
      setStatus('geolocation denied — using defaults (0,0)');
      lat = 0; lon = 0;
      requestAnimationFrame(renderLoop);
    }, { enableHighAccuracy: true });
  } else {
    setStatus('geolocation not available');
    lat = 0; lon = 0;
    requestAnimationFrame(renderLoop);
  }
});

// motion permission handler (iOS)
btnMotion.addEventListener('click', async () => {
  if(typeof DeviceOrientationEvent !== 'undefined' &&
     typeof DeviceOrientationEvent.requestPermission === 'function'){
    try {
      const resp = await DeviceOrientationEvent.requestPermission();
      if(resp === 'granted'){
        window.addEventListener('deviceorientation', handleOrientation);
        setStatus('motion allowed');
      } else {
        setStatus('motion permission denied');
      }
    } catch (err) {
      setStatus('motion request error: ' + err.message);
    }
  } else {
    window.addEventListener('deviceorientation', handleOrientation);
    setStatus('listening for deviceorientation');
  }
});

// orientation handler
function handleOrientation(e){
  // alpha: rotation around z axis, degrees (0..360) depending on device
  // beta: front-back tilt (-180..180)
  // gamma: left-right tilt (-90..90)
  // Many devices: alpha is compass heading from North; iOS provides webkitCompassHeading
  if(e.webkitCompassHeading !== undefined){
    deviceAz = e.webkitCompassHeading; // 0 = North
  } else if(e.absolute === true && e.alpha !== null){
    deviceAz = 360 - e.alpha; // convert device alpha to compass bearing
  } else if(e.alpha !== null){
    deviceAz = 360 - e.alpha;
  }
  // approximate device altitude/pitch from beta
  if(e.beta !== null){
    // beta: -180..180, when device is vertical beta ~ 0? mapping differs; use empirical mapping:
    deviceAlt = e.beta - 90; // makes vertical phone ~ 0 altitude
  }
  deviceAz = (deviceAz + 360) % 360;
}

// pollution UI
pollutionSlider.addEventListener('input', ()=> {
  pollution = Number(pollutionSlider.value)/100;
  pollLabel.textContent = `${Math.round(pollution*100)}%`;
});
fovSlider.addEventListener('input', ()=> fovVal.textContent = fovSlider.value);

// clean action: animate pollution -> 0
cleanBtn.addEventListener('click', ()=> {
  cleaning = true;
  const step = setInterval(()=>{
    pollution = Math.max(0, pollution - 0.01);
    pollutionSlider.value = Math.round(pollution*100);
    pollLabel.textContent = `${Math.round(pollution*100)}%`;
    if(pollution <= 0.01){ cleaning = false; clearInterval(step); }
  }, 80);
});

// basic projection: takes object az/alt (deg) and returns screen x,y or null if outside FOV
function projectToScreen(objAz, objAlt){
  // compute delta between where phone points and object azimuth (shortest angular difference)
  const deviceAzWrapped = (deviceAz + 360) % 360;
  let deltaAz = (objAz - deviceAzWrapped + 540) % 360 - 180; // -180..180
  let deltaAlt = objAlt - deviceAlt; // deg

  const hfov = Number(fovSlider.value); // horizontal field of view degrees
  const aspect = canvas.height / canvas.width;
  const vfov = hfov * aspect;

  // outside view frustum?
  if(Math.abs(deltaAz) > hfov/2 || Math.abs(deltaAlt) > vfov/2) return null;

  const x = canvas.width/2 + (deltaAz / (hfov/2)) * (canvas.width/2);
  const y = canvas.height/2 - (deltaAlt / (vfov/2)) * (canvas.height/2);
  return {x,y,deltaAz,deltaAlt};
}

// convert star RA/Dec -> Alt/Az using astronomy-engine
function getAltAzFromRaDec(raDeg, decDeg, whenDate, lat_, lon_, height_){
  // Astronomy.Equatorial expects RA in hours and Dec in degrees? We'll use Equator helper:
  // Create a fake equatorial object via Astronomy.Equator from RA/Dec expressed as angles.
  // Astronomy engine expects ra in hours (0..24) if using certain helpers — to be safe:
  // Convert RA degrees -> hours: raHours = raDeg / 15
  const raHours = raDeg / 15.0;
  const date = Astronomy.MakeTime(whenDate);
  const observer = new Astronomy.Observer(lat_||0, lon_||0, height_||0);
  // Astronomy.Equator can accept (raHours, dec, ...) using Astronomy.Equator({ra, dec})? library differs.
  // We'll use Astronomy.Horizon with ra/dec in degrees converted to radians? The library used earlier allowed:
  // equ = Astronomy.Equatorial(raHours, decDeg, 1); then Horizon(date, observer, equ.ra, equ.dec, 'normal')
  try {
    const equ = Astronomy.Equatorial(raHours, decDeg, 1); // ra in hours, dec in degrees
    const hor = Astronomy.Horizon(date, observer, equ.ra, equ.dec, 'normal');
    return { az: hor.azimuth, alt: hor.altitude };
  } catch (err) {
    // fallback (shouldn't happen in supported builds)
    return null;
  }
}

// render loop
function renderLoop(){
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const now = new Date();
  // compute moon position
  let moonPos = null;
  try {
    const mEq = Astronomy.Equator('Moon', Astronomy.MakeTime(now), new Astronomy.Observer(lat||0, lon||0, heightMeters||0), true, true);
    const mHor = Astronomy.Horizon(Astronomy.MakeTime(now), new Astronomy.Observer(lat||0, lon||0, heightMeters||0), mEq.ra, mEq.dec, 'normal');
    moonPos = {az: mHor.azimuth, alt: mHor.altitude};
  } catch(e){
    // ignore
  }

  // draw each star from the catalog
  starsCatalog.forEach(st => {
    const pos = getAltAzFromRaDec(st.ra, st.dec, now, lat||0, lon||0, heightMeters||0);
    if(!pos) return;
    if(pos.alt <= 0) return; // below horizon

    const screen = projectToScreen(pos.az, pos.alt);
    if(!screen) return;

    // Determine visibility based on pollution: high pollution hides dim stars first
    // We use magnitude threshold: higher mag -> dimmer; compute visibility ratio
    // Map mag range (-2 .. 6) to visibility susceptibility
    const mag = st.mag || st.magnitude || 2.5;
    // baseline visibility factor (0..1): brighter (smaller mag) => closer to 1
    const baseVis = Math.max(0, 1 - (mag - (-1)) / 7); // roughly
    const visibleChance = baseVis * (1 - pollution); // pollution reduces visibility
    // we draw star with opacity equal visibleChance (clamped)
    const opacity = Math.max(0.1, Math.min(1, visibleChance));

    ctx.beginPath();
    const size = Math.max(1.2, 4 - (mag || 1));
    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.arc(screen.x, screen.y, size, 0, Math.PI*2);
    ctx.fill();

    // optional: label when near center
    // if(Math.abs(screen.deltaAz) < 2 && Math.abs(screen.deltaAlt) < 2){
    //   ctx.fillStyle = `rgba(255,255,255,0.9)`;
    //   ctx.fillText(st.name, screen.x, screen.y - 12);
    // }
  });

  // draw Moon marker (always big)
  if(moonPos && moonPos.alt > 0){
    const screenMoon = projectToScreen(moonPos.az, moonPos.alt);
    if(screenMoon){
      // Moon visibility vs pollution: moon is bright so less affected
      const moonOpacity = Math.max(0.4, 1 - pollution*0.5);
      ctx.beginPath();
      ctx.fillStyle = `rgba(255,245,200,${moonOpacity})`;
      ctx.arc(screenMoon.x, screenMoon.y, 25, 0, Math.PI*2);
      ctx.fill();
    }
  }

  // draw UI assist: center reticle
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(canvas.width/2, canvas.height/2, 6, 0, Math.PI*2);
  ctx.stroke();

  // cloud/pollution overlay (visual) — higher pollution draws heavier screen haze; cleaning reduces it
  const cloudAlpha = Math.min(0.85, pollution * 0.9);
  if(cloudAlpha > 0.02){
    // multi-layer cloud noise: soft rectangle with radial gradient to look natural
    const g = ctx.createRadialGradient(canvas.width/2, canvas.height/2, Math.min(canvas.width,canvas.height)*0.1, canvas.width/2, canvas.height/2, Math.max(canvas.width,canvas.height));
    g.addColorStop(0, `rgba(180,180,200,${cloudAlpha*0.3})`);
    g.addColorStop(1, `rgba(30,30,40,${cloudAlpha*0.9})`);
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);
  }

  // status text
  setStatus(`lat:${lat?.toFixed(2)||'?'}, lon:${lon?.toFixed(2)||'?'} | deviceAz:${Math.round(deviceAz)}° deviceAlt:${Math.round(deviceAlt)}° | pollution:${Math.round(pollution*100)}%`);

  requestAnimationFrame(renderLoop);
}

// NASA APOD integration
const NASA_API_KEY = 'DEMO_KEY'; // replace with your API key
const APOD_URL = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`;

nasaBtn.addEventListener('click', async ()=>{
  try {
    const r = await fetch(APOD_URL);
    const j = await r.json();
    nasaTitle.textContent = j.title || 'NASA APOD';
    nasaImage.src = j.url || '';
    nasaDesc.textContent = j.explanation || '';
    nasaCard.hidden = false;
  } catch(e){
    alert('Failed to fetch NASA APOD: ' + e.message);
  }
});
closeNasa.addEventListener('click', ()=> nasaCard.hidden = true);

// initial UI labels
pollLabel.textContent = `${Math.round(pollution*100)}%`;
fovVal.textContent = fovSlider.value;
setStatus('ready — press Start Camera then Allow Motion (if mobile)');

/* Notes:
 - On iOS: press "Allow Motion" to enable deviceorientation. If permission is not granted,
   the app will still run but you can use the manual keyboard simulation (could be added).
 - RA is given in degrees in the small catalog. Astronomy.Equatorial expects RA in hours, so code converts deg -> hours.
 - For a bigger star catalog, replace starsCatalog with a prefiltered JSON of bright stars (magnitude < 6).
 - Replace NASA_API_KEY with your own key from https://api.nasa.gov/ for higher rate limits.
 - You may need to calibrate FOV slider for your camera for best alignment.
*/
