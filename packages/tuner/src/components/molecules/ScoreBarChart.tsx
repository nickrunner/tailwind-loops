import { ScoreBar } from "../atoms/ScoreBar.js";

interface ScoreBarChartProps {
  scores: {
    overall?: number;
    flow?: number;
    safety?: number;
    surface?: number;
    character?: number;
    scenic?: number;
    elevation?: number;
  };
}

const DIMENSIONS = [
  { key: "overall", label: "Overall" },
  { key: "flow", label: "Flow" },
  { key: "safety", label: "Safety" },
  { key: "surface", label: "Surface" },
  { key: "character", label: "Character" },
  { key: "scenic", label: "Scenic" },
  { key: "elevation", label: "Elevation" },
] as const;

export function ScoreBarChart({ scores }: ScoreBarChartProps) {
  return (
    <>
      {DIMENSIONS.map((d) => (
        <ScoreBar
          key={d.key}
          label={d.label}
          value={scores[d.key] ?? 0}
        />
      ))}
    </>
  );
}
