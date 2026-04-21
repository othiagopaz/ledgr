interface LedgrSymbolProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Ledgr symbol — L2 variant: an L-frame holding two ledger rows and a
 * focus cell. Exported as an SVG so it scales cleanly and picks up
 * `currentColor` from its container. Default color is the Midnight 800
 * accent via the `color` inline style fallback.
 */
export function LedgrSymbol({ size = 16, color = "currentColor", className }: LedgrSymbolProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Ledgr"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0, color }}
    >
      {/* L stem */}
      <rect x="2" y="2" width="2.25" height="12" fill="currentColor" rx="0.3" />
      {/* L base */}
      <rect x="2" y="11.75" width="12" height="2.25" fill="currentColor" rx="0.3" />
      {/* row 1 */}
      <rect x="5.75" y="3.75" width="8" height="1.5" fill="currentColor" rx="0.3" />
      {/* row 2 */}
      <rect x="5.75" y="7" width="5.5" height="1.5" fill="currentColor" rx="0.3" />
      {/* focus cell */}
      <rect x="12" y="6.4" width="2" height="2.75" fill="currentColor" rx="0.4" />
    </svg>
  );
}

/** Symbol + "ledgr" wordmark, used in the app header and anywhere else
 *  the full brand lockup is appropriate. */
export function LedgrLockup({ size = 16, color, className }: LedgrSymbolProps) {
  const fontSize = Math.round(size * 1.1);
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.375),
        color: color || "var(--color-accent)",
        lineHeight: 1,
      }}
    >
      <LedgrSymbol size={size} />
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          fontSize,
          letterSpacing: "-0.02em",
        }}
      >
        ledgr
      </span>
    </span>
  );
}
