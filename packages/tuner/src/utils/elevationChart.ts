/** Draw an elevation profile chart onto a canvas element. */
export function drawElevationChart(
  canvas: HTMLCanvasElement,
  profile: number[],
  lengthKm: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  const pad = { top: 12, right: 8, bottom: 16, left: 32 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const minElev = Math.min(...profile);
  const maxElev = Math.max(...profile);
  const elevRange = maxElev - minElev || 1;
  const yMin = minElev - elevRange * 0.1;
  const yMax = maxElev + elevRange * 0.1;
  const yRange = yMax - yMin;

  const xStep = plotW / (profile.length - 1);

  // Filled area
  ctx.beginPath();
  ctx.moveTo(pad.left, pad.top + plotH);
  for (let i = 0; i < profile.length; i++) {
    const x = pad.left + i * xStep;
    const y = pad.top + plotH - ((profile[i]! - yMin) / yRange) * plotH;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(pad.left + plotW, pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 255, 255, 0.15)";
  ctx.fill();

  // Line
  ctx.beginPath();
  for (let i = 0; i < profile.length; i++) {
    const x = pad.left + i * xStep;
    const y = pad.top + plotH - ((profile[i]! - yMin) / yRange) * plotH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#00ffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Y-axis labels
  ctx.fillStyle = "#999";
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  ctx.fillText(Math.round(maxElev) + "m", pad.left - 3, pad.top + 8);
  ctx.fillText(Math.round(minElev) + "m", pad.left - 3, pad.top + plotH);

  // X-axis label
  ctx.textAlign = "center";
  ctx.fillText((lengthKm ?? 0) + " km", pad.left + plotW / 2, h - 2);
}
