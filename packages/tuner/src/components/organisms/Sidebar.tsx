import { Checkbox } from "../atoms/Checkbox.js";
import { Select } from "../atoms/Select.js";
import { Button } from "../atoms/Button.js";
import { CollapsibleSection } from "../molecules/CollapsibleSection.js";
import { SliderGroup } from "../molecules/SliderGroup.js";
import { DistanceButtonGrid } from "../molecules/DistanceButtonGrid.js";
import { Slider } from "../atoms/Slider.js";

const ALL_CORRIDOR_TYPES = [
  "trail", "path", "neighborhood", "rural-road", "collector", "arterial", "mixed",
] as const;

const WEIGHT_SLIDERS = [
  { key: "flow", label: "flow", min: 0, max: 1, step: 0.01 },
  { key: "safety", label: "safety", min: 0, max: 1, step: 0.01 },
  { key: "surface", label: "surface", min: 0, max: 1, step: 0.01 },
  { key: "character", label: "character", min: 0, max: 1, step: 0.01 },
  { key: "scenic", label: "scenic", min: 0, max: 1, step: 0.01 },
  { key: "elevation", label: "elevation", min: 0, max: 1, step: 0.01 },
];

const FLOW_SLIDERS = [
  { key: "lengthLogDenominator", label: "Length log denom", min: 50, max: 2000, step: 10 },
  { key: "lengthLogNumerator", label: "Length log numer", min: 1000, max: 50000, step: 100 },
  { key: "stopDecayRate", label: "Stop decay rate", min: 0, max: 1, step: 0.01 },
  { key: "lengthBlend", label: "Length blend", min: 0, max: 1, step: 0.01 },
];

const SAFETY_SLIDERS = [
  { key: "bicycleInfra", label: "bicycleInfra", min: 0, max: 1, step: 0.01 },
  { key: "pedestrianPath", label: "pedestrianPath", min: 0, max: 1, step: 0.01 },
  { key: "separation", label: "separation", min: 0, max: 1, step: 0.01 },
  { key: "speedLimit", label: "speedLimit", min: 0, max: 1, step: 0.01 },
  { key: "roadClass", label: "roadClass", min: 0, max: 1, step: 0.01 },
  { key: "trafficCalming", label: "trafficCalming", min: 0, max: 1, step: 0.01 },
];

const CHARACTER_SLIDERS = [
  { key: "trail", label: "trail", min: 0, max: 1, step: 0.01 },
  { key: "path", label: "path", min: 0, max: 1, step: 0.01 },
  { key: "neighborhood", label: "neighborhood", min: 0, max: 1, step: 0.01 },
  { key: "rural-road", label: "rural-road", min: 0, max: 1, step: 0.01 },
  { key: "collector", label: "collector", min: 0, max: 1, step: 0.01 },
  { key: "arterial", label: "arterial", min: 0, max: 1, step: 0.01 },
  { key: "mixed", label: "mixed", min: 0, max: 1, step: 0.01 },
];

const SURFACE_SLIDERS = [
  { key: "paved", label: "paved", min: 0, max: 1, step: 0.01 },
  { key: "unpaved", label: "unpaved", min: 0, max: 1, step: 0.01 },
  { key: "unknown", label: "unknown", min: 0, max: 1, step: 0.01 },
];

const ELEVATION_SLIDERS = [
  { key: "flatPenaltyRate", label: "Flat penalty rate", min: 0, max: 20, step: 0.5 },
  { key: "rollingIdealHilliness", label: "Rolling ideal", min: 0, max: 1, step: 0.01 },
  { key: "rollingWidth", label: "Rolling width", min: 0.01, max: 1, step: 0.01 },
  { key: "hillyBonusRate", label: "Hilly bonus rate", min: 0, max: 20, step: 0.5 },
  { key: "maxGradePenaltyThreshold", label: "Max grade thresh", min: 0, max: 40, step: 1 },
  { key: "gradeSensitivity", label: "Grade sensitivity", min: 0, max: 20, step: 0.5 },
];

const HILL_PREFERENCE_OPTIONS = [
  { value: "any", label: "any" },
  { value: "flat", label: "flat" },
  { value: "rolling", label: "rolling" },
  { value: "hilly", label: "hilly" },
];

interface ScoringParams {
  weights: Record<string, number>;
  flow: Record<string, number>;
  safety: Record<string, number>;
  characterScores: Record<string, number>;
  surfaceScores: Record<string, number>;
  crossingDecayRate: number;
  surfaceConfidenceMinFactor: number;
  scenicBoost: number;
  elevation: Record<string, unknown>;
}

interface SidebarProps {
  params: ScoringParams;
  onParamChange: (path: string, value: number | string) => void;
  visibleTypes: Record<string, boolean>;
  onVisibleTypesChange: (type: string, visible: boolean) => void;
  showNetwork: boolean;
  onShowNetworkChange: (show: boolean) => void;
  showConnectors: boolean;
  onShowConnectorsChange: (show: boolean) => void;
  activeBucket: [number, number] | null;
  isGenerating: boolean;
  onSelectBucket: (minMiles: number, maxMiles: number) => void;
  onGenerate: () => void;
  onReset: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onClearCache: () => void;
}

export function Sidebar({
  params,
  onParamChange,
  visibleTypes,
  onVisibleTypesChange,
  showNetwork,
  onShowNetworkChange,
  showConnectors,
  onShowConnectorsChange,
  activeBucket,
  isGenerating,
  onSelectBucket,
  onGenerate,
  onReset,
  onSave,
  onSaveAs,
  onClearCache,
}: SidebarProps) {
  return (
    <div className="sidebar">
      <Checkbox
        label="Show Corridor Network"
        checked={showNetwork}
        onChange={onShowNetworkChange}
        bold
      />
      <Checkbox
        label="Show Connectors"
        checked={showConnectors}
        onChange={onShowConnectorsChange}
        bold
      />

      <h2>Corridor Types</h2>
      {ALL_CORRIDOR_TYPES.map((t) => (
        <Checkbox
          key={t}
          label={t}
          checked={visibleTypes[t] !== false}
          onChange={(v) => onVisibleTypesChange(t, v)}
        />
      ))}

      <h2>Dimension Weights</h2>
      <SliderGroup
        sliders={WEIGHT_SLIDERS}
        values={params.weights}
        onChange={(key, value) => onParamChange(`weights.${key}`, value)}
      />

      <CollapsibleSection title="Flow Params">
        <SliderGroup
          sliders={FLOW_SLIDERS}
          values={params.flow}
          onChange={(key, value) => onParamChange(`flow.${key}`, value)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Safety Sub-Weights">
        <SliderGroup
          sliders={SAFETY_SLIDERS}
          values={params.safety}
          onChange={(key, value) => onParamChange(`safety.${key}`, value)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Character Scores">
        <SliderGroup
          sliders={CHARACTER_SLIDERS}
          values={params.characterScores}
          onChange={(key, value) => onParamChange(`characterScores.${key}`, value)}
        />
        <Slider
          label="Crossing decay"
          value={params.crossingDecayRate}
          min={0}
          max={0.3}
          step={0.005}
          onChange={(v) => onParamChange("crossingDecayRate", v)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Surface Scores">
        <SliderGroup
          sliders={SURFACE_SLIDERS}
          values={params.surfaceScores}
          onChange={(key, value) => onParamChange(`surfaceScores.${key}`, value)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Scenic Params">
        <Slider
          label="Scenic boost"
          value={params.scenicBoost}
          min={0}
          max={3}
          step={0.01}
          onChange={(v) => onParamChange("scenicBoost", v)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Elevation Params">
        <div className="slider-row">
          <label>Hill preference</label>
          <Select
            value={(params.elevation["hillPreference"] as string) ?? "any"}
            options={HILL_PREFERENCE_OPTIONS}
            onChange={(v) => onParamChange("elevation.hillPreference", v)}
          />
        </div>
        <SliderGroup
          sliders={ELEVATION_SLIDERS}
          values={params.elevation as Record<string, number>}
          onChange={(key, value) => onParamChange(`elevation.${key}`, value)}
        />
      </CollapsibleSection>

      <CollapsibleSection title="Surface Confidence">
        <Slider
          label="Min factor"
          value={params.surfaceConfidenceMinFactor}
          min={0}
          max={1}
          step={0.01}
          onChange={(v) => onParamChange("surfaceConfidenceMinFactor", v)}
        />
      </CollapsibleSection>

      <h2>Generate Route</h2>
      <DistanceButtonGrid
        activeBucket={activeBucket}
        onSelect={onSelectBucket}
      />
      <Button
        label={isGenerating ? "Generating..." : activeBucket ? `Generate ${activeBucket[0]}-${activeBucket[1]} mi` : "Select distance"}
        variant="primary"
        onClick={onGenerate}
        disabled={!activeBucket || isGenerating}
      />

      <Button label="Reset Defaults" onClick={onReset} />
      <Button label="Save" variant="save" onClick={onSave} />
      <Button label="Save as New Profile" variant="save-as" onClick={onSaveAs} />
      <Button label="Clear Network Cache" variant="danger" onClick={onClearCache} />
    </div>
  );
}
