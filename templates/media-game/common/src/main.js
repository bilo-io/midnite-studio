// A blank Midnite game: no engine, no build step. Replace this with your game.
// Midnite Studio runs index.html in a sandbox and reads everything this file
// prints with console.log, so log what you want the agent (and you) to see.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = canvas.clientWidth * devicePixelRatio;
  canvas.height = canvas.clientHeight * devicePixelRatio;
}
addEventListener('resize', resize);
resize();

function frame(time) {
  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const size = Math.min(canvas.width, canvas.height) * 0.2;
  const x = canvas.width / 2 + Math.cos(time / 700) * size;
  const y = canvas.height / 2 + Math.sin(time / 700) * size;
  ctx.fillStyle = '#6ea8ff';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.3, 0, Math.PI * 2);
  ctx.fill();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

console.log('midnite-ready');
