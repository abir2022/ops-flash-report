export function DateSelector({
  days,
  value,
  onChange,
}: {
  days: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const min = days.length ? days[days.length - 1] : undefined;
  const max = days.length ? days[0] : undefined;

  return (
    <div className="date-selector">
      <span className="ds-label">Report date</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Report date"
      />
    </div>
  );
}
