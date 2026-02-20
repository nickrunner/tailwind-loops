import { scoreToColor } from "../../utils/colors.js";

interface ScoreBarProps {
  label: string;
  value: number;
  maxValue?: number;
}

export function ScoreBar({ label, value, maxValue = 1 }: ScoreBarProps) {
  const pct = Math.round((value / maxValue) * 100);
  const color = scoreToColor(value / maxValue);

  return (
    <div>
      <span
        className="bar"
        style={{ width: `${pct}px`, background: color }}
      />
      {label}: {value.toFixed(3)}
    </div>
  );
}
