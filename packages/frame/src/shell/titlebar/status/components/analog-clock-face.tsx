export function AnalogClockFace({
  date,
  className,
}: {
  date: Date;
  className?: string;
}) {
  const s = date.getSeconds();
  const m = date.getMinutes();
  const h = date.getHours() % 12;
  const secDeg = s * 6;
  const minDeg = m * 6 + s * 0.1;
  const hourDeg = h * 30 + m * 0.5;

  return (
    <svg
      viewBox="0 0 100 100"
      className={`h-full w-auto ${className ?? ''}`}
      role="img"
      aria-label="Analogue clock"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth="2.5" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line
          key={i}
          x1="50"
          y1="8"
          x2="50"
          y2={i % 3 === 0 ? '14' : '11'}
          stroke="currentColor"
          strokeOpacity={0.6}
          strokeWidth={i % 3 === 0 ? 2 : 1}
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      {/* hour */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="28"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        transform={`rotate(${hourDeg} 50 50)`}
      />
      {/* minute */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        transform={`rotate(${minDeg} 50 50)`}
      />
      {/* second */}
      <line
        x1="50"
        y1="54"
        x2="50"
        y2="14"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        transform={`rotate(${secDeg} 50 50)`}
      />
      <circle cx="50" cy="50" r="2.5" fill="hsl(var(--primary))" />
    </svg>
  );
}
