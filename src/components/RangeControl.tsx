import type { ReactNode } from 'react';

type RangeControlProps = {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (value: number) => void;
  lowLabel: string;
  highLabel: string;
};

export default function RangeControl({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
  lowLabel,
  highLabel,
}: RangeControlProps) {
  return (
    <label className="control">
      <div className="control-title">
        <span>{label}</span>
        <output>{value}</output>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="range-labels">
        <span>{lowLabel}</span>
        <span>{highLabel}</span>
      </div>
    </label>
  );
}
