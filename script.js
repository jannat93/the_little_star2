const video = document.getElementById("camera");
const canvas = document.getElementById("sky-overlay");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let cloudOpacity = 0.8;

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

    // Stars
    for (let i = 0; i < 150; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const size = Math.random() * 2 + 0.5;
      const twinkle = Math.random() * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, size + twinkle, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
    }

    // Moon (simple circle)
    ctx.beginPath();
    ctx.arc(canvas.width - 100, 100, 40, 0, Math.PI * 2);
    ctx.fillStyle = "lightyellow";
    ctx.fill();

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

// === NASA API ===
const nasaBtn = document.getElementById("nasa-btn");
const nasaTitle = document.getElementById("nasa-title");
const nasaImage = document.getElementById("nasa-image");
const nasaDesc = document.getElementById("nasa-desc");
const nasaInfo = document.getElementById("nasa-info");

// Replace with your own NASA API key (get it free from api.nasa.gov)
const NASA_API_KEY = "PYXsvSeHJbwMEqQ1RGeittsd7gfSxKvGu5DCr4mT";  
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
