const RANGES = [
  { key: "all", label: "All" },
  { key: "A-C", label: "A–C", start: "A", end: "C" },
  { key: "D-G", label: "D–G", start: "D", end: "G" },
  { key: "H-L", label: "H–L", start: "H", end: "L" },
  { key: "M-R", label: "M–R", start: "M", end: "R" },
  { key: "S-Z", label: "S–Z", start: "S", end: "Z" },
];

export function alphaRangeMatch(value, rangeKey = "all") {
  if (!rangeKey || rangeKey === "all") return true;

  const range = RANGES.find((entry) => entry.key === rangeKey);
  if (!range) return true;

  const text = String(value || "").trim().toUpperCase();
  const first = text.match(/[A-Z]/)?.[0];
  if (!first) return false;

  return first >= range.start && first <= range.end;
}

export default function NfosAlphaBand({
  value = "all",
  onChange,
  label = "Browse alphabetically",
  className = "",
}) {
  return (
    <div className={`nfos-alpha-filter ${className}`.trim()}>
      <span className="nfos-alpha-filter-label">{label}</span>
      <div className="nfos-alpha-band" role="group" aria-label={label}>
        {RANGES.map((range) => (
          <button
            key={range.key}
            type="button"
            className={`nfos-alpha-chip ${value === range.key ? "active" : ""}`}
            aria-pressed={value === range.key}
            onClick={() => onChange?.(range.key)}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );
}
