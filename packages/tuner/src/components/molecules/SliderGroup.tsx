import { Slider } from "../atoms/Slider.js";

interface SliderDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
}

interface SliderGroupProps {
  sliders: SliderDef[];
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
}

export function SliderGroup({ sliders, values, onChange }: SliderGroupProps) {
  return (
    <>
      {sliders.map((def) => (
        <Slider
          key={def.key}
          label={def.label}
          value={values[def.key] ?? 0}
          min={def.min}
          max={def.max}
          step={def.step}
          onChange={(v) => onChange(def.key, v)}
        />
      ))}
    </>
  );
}
