const DISTANCE_BUCKETS: [number, number][] = [
  [0, 10], [10, 20], [20, 30], [30, 40], [40, 50],
  [50, 60], [60, 70], [70, 80], [80, 90], [90, 100],
  [100, 125], [125, 150], [150, 175], [175, 200],
];

interface DistanceButtonGridProps {
  activeBucket: [number, number] | null;
  onSelect: (minMiles: number, maxMiles: number) => void;
}

export function DistanceButtonGrid({ activeBucket, onSelect }: DistanceButtonGridProps) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
      {DISTANCE_BUCKETS.map(([lo, hi]) => {
        const isActive =
          activeBucket != null && activeBucket[0] === lo && activeBucket[1] === hi;
        return (
          <button
            key={`${lo}-${hi}`}
            className={`dist-btn${isActive ? " active" : ""}`}
            title={`${lo}-${hi} mi loop`}
            onClick={() => onSelect(lo, hi)}
          >
            {lo}-{hi}
          </button>
        );
      })}
    </div>
  );
}
