import { GameStatus, TrajectoryPoint } from '../types';

const W = 1080;
const H = 1440;

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (!image.width || !image.height) return;
  const scale = Math.max(width / image.width, height / image.height);
  const sw = width / scale;
  const sh = height / scale;
  const sx = (image.width - sw) / 2;
  const sy = (image.height - sh) / 2;
  ctx.save();
  roundedRect(ctx, x, y, width, height, 18);
  ctx.clip();
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
}

function drawLineChart(
  ctx: CanvasRenderingContext2D,
  points: TrajectoryPoint[],
  x: number,
  y: number,
  width: number,
  height: number,
  mode: 'trajectory' | 'roll'
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = y + (height * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, gy);
    ctx.lineTo(x + width, gy);
    ctx.stroke();
  }

  if (points.length < 2) {
    ctx.fillStyle = '#8998ad';
    ctx.font = '18px Inter, Arial, sans-serif';
    ctx.fillText('Trajectory data unavailable for this run.', x + 8, y + height / 2);
    ctx.restore();
    return;
  }

  const values = mode === 'trajectory' ? points.map((p) => p.y) : points.map((p) => (p.angle * 180) / Math.PI);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = Math.max(1, maxValue - minValue);

  ctx.beginPath();
  points.forEach((point, index) => {
    const px = x + (index / (points.length - 1)) * width;
    const value = mode === 'trajectory' ? point.y : (point.angle * 180) / Math.PI;
    const py = y + height - ((value - minValue) / range) * height;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = mode === 'trajectory' ? '#7dd3fc' : '#fb7185';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = mode === 'trajectory' ? 'rgba(125, 211, 252, 0.45)' : 'rgba(251, 113, 133, 0.4)';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.restore();
}

export async function exportFlightReport(
  status: GameStatus,
  snapshot: HTMLCanvasElement | null = null
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create the flight report canvas.');

  const metrics = status.metrics;
  const trajectory = metrics.trajectory ?? [];
  const clean = metrics.landedClean;
  const now = new Date();

  // Night-blue base with a restrained red/cyan light bloom.
  ctx.fillStyle = '#050811';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(820, 140, 20, 820, 140, 620);
  glow.addColorStop(0, 'rgba(255, 42, 66, 0.24)');
  glow.addColorStop(1, 'rgba(5, 8, 17, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, 700);

  ctx.strokeStyle = '#24344b';
  ctx.lineWidth = 2;
  roundedRect(ctx, 34, 34, W - 68, H - 68, 24);
  ctx.stroke();

  ctx.fillStyle = '#ff405c';
  ctx.font = '700 24px Inter, Arial, sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText('ROADSTER LOOP', 72, 94);
  ctx.fillStyle = '#c5d2e2';
  ctx.font = '500 16px Inter, Arial, sans-serif';
  ctx.fillText('NIGHT RUN  /  FLIGHT TEST REPORT', 72, 126);
  ctx.fillStyle = '#7d8da5';
  ctx.font = '14px Inter, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(now.toLocaleString(), W - 72, 94);
  ctx.textAlign = 'left';

  ctx.fillStyle = clean ? '#34d399' : '#ff5268';
  ctx.font = '800 46px Inter, Arial, sans-serif';
  ctx.fillText(clean ? 'CLEAN LANDING' : 'WIPEOUT', 72, 198);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 74px Inter, Arial, sans-serif';
  ctx.fillText(metrics.score.toLocaleString('en-US'), 72, 278);
  ctx.fillStyle = '#8493a9';
  ctx.font = '16px Inter, Arial, sans-serif';
  ctx.fillText('FINAL SCORE', 76, 309);

  // Actual final frame from the WebGL canvas, when capture was available.
  const imageX = 72;
  const imageY = 345;
  const imageW = 936;
  const imageH = 300;
  roundedRect(ctx, imageX, imageY, imageW, imageH, 18);
  ctx.fillStyle = '#0b1422';
  ctx.fill();
  if (snapshot && snapshot.width > 0 && snapshot.height > 0) {
    fitImage(ctx, snapshot, imageX, imageY, imageW, imageH);
  } else {
    ctx.fillStyle = '#8291a7';
    ctx.font = '18px Inter, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Gameplay snapshot unavailable', W / 2, imageY + imageH / 2);
    ctx.textAlign = 'left';
  }

  const statItems = [
    ['REACTION', `${(metrics.reactionMs / 1000).toFixed(3)} s`],
    ['RAMP SPEED', `${metrics.rampSpeedMph} mph`],
    ['PEAK G', `${metrics.peakG.toFixed(1)} g`],
    ['MAX ALTITUDE', `${metrics.maxAltitudeFt} ft`],
    ['AIRTIME', `${metrics.airtimeSec.toFixed(1)} s`],
    ['TOUCHDOWN', `${metrics.touchdownSpeedFtS} ft/s`],
    ['FLIPS', `${metrics.flips}`],
    ['RINGS', `${metrics.ringsCollected} / ${metrics.totalRings}`],
  ];

  const statY = 680;
  const statW = 450;
  const statH = 84;
  statItems.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = 72 + col * 486;
    const y = statY + row * 96;
    roundedRect(ctx, x, y, statW, statH, 12);
    ctx.fillStyle = '#0b1422';
    ctx.fill();
    ctx.strokeStyle = '#1d2d42';
    ctx.stroke();
    ctx.fillStyle = '#8292a9';
    ctx.font = '14px Inter, Arial, sans-serif';
    ctx.fillText(label, x + 20, y + 30);
    ctx.fillStyle = '#f4f7fb';
    ctx.font = '700 26px Inter, Arial, sans-serif';
    ctx.fillText(value, x + 20, y + 62);
  });

  ctx.fillStyle = '#e5edf7';
  ctx.font = '700 18px Inter, Arial, sans-serif';
  ctx.fillText('FLIGHT TRAJECTORY  /  ALTITUDE', 72, 1102);
  drawLineChart(ctx, trajectory, 80, 1120, 920, 104, 'trajectory');

  ctx.fillStyle = '#e5edf7';
  ctx.font = '700 18px Inter, Arial, sans-serif';
  ctx.fillText('ROLL / PITCH TRACE', 72, 1268);
  drawLineChart(ctx, trajectory, 80, 1285, 920, 72, 'roll');

  ctx.fillStyle = '#718198';
  ctx.font = '13px Inter, Arial, sans-serif';
  ctx.fillText('Unofficial fan project. Not affiliated with or endorsed by Tesla.', 72, 1390);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result);
      else reject(new Error('The browser could not encode the flight report PNG.'));
    }, 'image/png');
  });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `roadster-loop-flight-report-${metrics.score}.png`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
