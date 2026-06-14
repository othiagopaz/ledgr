interface EnvelopeBarProps {
  allocated: number;
  realized: number;
  pending: number;
  pacedAllocation: number;
  /**
   * 'spend' (Expenses/Allocations): draining toward the cap is neutral, going
   * over is bad. 'income': filling toward the target is good (we want realized
   * to reach allocated).
   */
  variant: 'spend' | 'income';
  /**
   * Whether pending counts (combined / "Actual + Planned" view). In that mode
   * planned is treated as already completed — it merges into the single solid
   * fill. The bar never distinguishes planned from realized; the P toggle does.
   */
  includePending: boolean;
}

/**
 * Horizontal two-state bar: a single solid fill = what counts in the current
 * P mode (realized in "actual"; realized + pending in "actual + planned"),
 * over an empty `free` track, plus a thin pace marker at paced_allocation.
 *
 * Overflow (consumed > allocated) bleeds into the alert color for spend
 * envelopes. For income, a full/exceeded bar is "good" and stays green; the
 * data is uniform, only the color class flips by `variant`.
 */
export default function EnvelopeBar({
  allocated,
  realized,
  pending,
  pacedAllocation,
  variant,
  includePending,
}: EnvelopeBarProps) {
  // In "actual + planned", planned is treated as done — fold it into the fill.
  const consumed = realized + (includePending ? pending : 0);
  // Denominator: the larger of allocation or what's consumed, so overflow is
  // visible within the same track width.
  const denom = Math.max(allocated, consumed, 0.01);

  const fillPct = Math.max(0, Math.min(100, (consumed / denom) * 100));

  // Overflow is only an alert for spending. For income, exceeding the target
  // is good — it keeps the green 'income' fill (full bar = good).
  const overflow = variant === 'spend' && consumed > allocated && allocated > 0;
  const pacePct =
    allocated > 0
      ? Math.max(0, Math.min(100, (pacedAllocation / denom) * 100))
      : 0;
  const showPace = variant === 'spend' && pacedAllocation > 0 && pacedAllocation < allocated;

  const fillClass = overflow
    ? 'envelope-bar-fill over'
    : `envelope-bar-fill ${variant}`;

  return (
    <div
      className="envelope-bar"
      role="img"
      aria-label={`${Math.round(fillPct)}% consumed`}
    >
      <div className={fillClass} style={{ width: `${fillPct}%` }} />
      {showPace && (
        <div className="envelope-bar-pace" style={{ left: `${pacePct}%` }} />
      )}
    </div>
  );
}
