/** Convert a 0-1 score to a hex color (red → yellow → green). */
export function scoreToColor(score: number): string {
  const s = Math.max(0, Math.min(1, score));
  let r: number;
  let g: number;
  if (s < 0.5) {
    const t = s / 0.5;
    r = 204;
    g = Math.round(34 + t * 170);
  } else {
    const t = (s - 0.5) / 0.5;
    r = Math.round(204 - t * 170);
    g = 204;
  }
  return "#" + r.toString(16).padStart(2, "0") + g.toString(16).padStart(2, "0") + "22";
}
