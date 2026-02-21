import { useRef, useEffect } from "react";
import { drawElevationChart } from "../../utils/elevationChart.js";

interface ElevationChartProps {
  profile: number[];
  lengthKm: number;
  width?: number;
  height?: number;
}

export function ElevationChart({
  profile,
  lengthKm,
  width = 260,
  height = 100,
}: ElevationChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || profile.length < 2) return;
    canvas.width = width;
    canvas.height = height;
    drawElevationChart(canvas, profile, lengthKm);
  }, [profile, lengthKm, width, height]);

  return <canvas ref={canvasRef} style={{ width, height, display: "block" }} />;
}
