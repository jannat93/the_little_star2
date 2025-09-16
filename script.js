const video = document.getElementById("camera");
const canvas = document.getElementById("sky-overlay");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let cloudOpacity = 0.8;

// === Load real NASA star field image ===
const starImg = new Image();
starImg.crossOrigin = "anonymous"; 
// Example NASA star field photo (you can change this later)
starImg.src = "https://apod.nasa.gov/apod/image/1901/OrionDeep_HaLRGBpugh1024.jpg";

// === CAMERA START ===
document.getElementById("start-btn").addEventListener("click", async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = stream;
  } catch (err) {
    alert("Camera access denied: " + err.message);
  }
  drawSky();
});

// === DRAW SKY ===
function drawSky() {
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw real NASA star image as background
    if (starImg.complete) {
      ctx.drawImage(starImg, 0, 0, canvas.width, canvas.height);
    }

    // Draw Moon
    ctx.beginPath();
    ctx.arc(canvas.width - 100, 100, 40, 0, Math.PI * 2);
    ctx.fillStyle = "lightyellow";
    ctx.shadowColor = "white";
    ctx.shadowBlur = 25;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Cloud overlay fading
    if (cloudOpacity > 0) {
      ctx.fillStyle = `rgba(200,200,200,${cloudOpacity})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      cloudOpacity -= 0.0015;
    }

    requestAnimationFrame(animate);
  }
  animate();
}

// === NASA API (Astronomy Picture of the Day) ===
const nasaBtn = document.getElementById("nasa-btn");
const nasaTitle = document.getElementById("nasa-title");
const nasaImage = document.getElementById("nasa-image");
const nasaDesc = document.getElementById("nasa-desc");
const nasaInfo = document.getElementById("nasa-info");

// Replace with your own NASA API key (get it free from api.nasa.gov)
const NASA_API_KEY = "DEMO_KEY";  
const NASA_APOD_URL = `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`;

nasaBtn.addEventListener("click", async () => {
  try {
    const response = await fetch(NASA_APOD_URL);
    const data = await response.json();

    nasaTitle.textContent = data.title;
    nasaImage.src = data.url;
    nasaDesc.textContent = data.explanation;
    nasaInfo.style.display = "block";
  } catch (err) {
    alert("Failed to load NASA image: " + err.message);
  }
});
