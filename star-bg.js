// Animated Star Background for GymSupps Home Page
// Theme: Dark, elegant, slightly futuristic with soft shimmering stars

const canvas = document.getElementById('star-bg');
const ctx = canvas.getContext('2d');

// Color palette for stars
const STAR_COLORS = [
  'rgba(255,255,255,',      // soft white
  'rgba(216,180,248,',      // lavender
  'rgba(163,191,250,'       // light blue
];

// Responsive canvas sizing
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Star properties
const STAR_COUNT = window.innerWidth > 900 ? 50 : 35; // more on desktop
const STAR_MIN_RADIUS = 2;
const STAR_MAX_RADIUS = 40;
const STAR_MIN_ALPHA = 0.05;
const STAR_MAX_ALPHA = 0.3;
const STAR_TWINKLE_SPEED = 0.012 + Math.random() * 0.008;

function randomBetween(a, b) {
  return a + Math.random() * (b - a);
}

// Star class
class Star {
  constructor() {
    this.reset();
  }
  reset() {
    this.x = Math.random() * canvas.width;
    this.y = Math.random() * canvas.height;
    this.radius = randomBetween(STAR_MIN_RADIUS, STAR_MAX_RADIUS);
    this.color = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    this.alpha = randomBetween(STAR_MIN_ALPHA, STAR_MAX_ALPHA);
    this.twinkle = Math.random() * Math.PI * 2;
    this.twinkleSpeed = randomBetween(0.008, 0.018);
    this.life = 0;
    this.maxLife = randomBetween(3, 7); // seconds
  }
  update(dt) {
    this.twinkle += this.twinkleSpeed * dt;
    // Glow in and out
    this.life += dt * 0.00001;
    if (this.life > this.maxLife) {
      this.reset();
      this.life = 0;
    }
  }
  draw(ctx) {
    // Twinkle alpha
    const twinkleAlpha = this.alpha + Math.sin(this.twinkle) * 0.18;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius + Math.abs(Math.sin(this.twinkle) * 0.5), 0, Math.PI * 2);
    ctx.closePath();
    ctx.shadowColor = this.color + (twinkleAlpha * 0.7) + ')';
    ctx.shadowBlur = 12 + this.radius * 4;
    ctx.fillStyle = this.color + twinkleAlpha + ')';
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// Create stars
let stars = [];
function createStars() {
  stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push(new Star());
  }
}
createStars();
window.addEventListener('resize', () => {
  resizeCanvas();
  createStars();
});

// Animation loop
let lastTime = 0;
function animate(time) {
  const dt = (time - lastTime) / 30; // normalize to ~60fps
  lastTime = time;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let star of stars) {
    star.update(dt);
    star.draw(ctx);
  }
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

// --- End of animated star background --- 