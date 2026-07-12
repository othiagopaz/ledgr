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

  // The bar measures ONE thing everywhere: how much of the PLAN you executed,
  // `|realized| / |allocated|`. It reads the same in every section and for both
  // signs — a 100% bar means "did exactly what I planned":
  //   • spend  1000 plan,  700 done → 70%
  //   • income 3000 plan, 3000 got  → 100%
  //   • contribution 6000 plan, 4000 in  → 67%
  //   • withdrawal −26k plan, −26k out   → 100%
  // Going past the plan overflows past 100% and flips to the alert colour
  // (overspent / over-contributed / over-withdrew) — actionable in any section.
  const allocatedMag = Math.abs(allocated);
  const consumedMag = Math.abs(consumed);

  // A negative allocation is a planned WITHDRAWAL (investment → cash) — money
  // coming back in. It gets its own colour so it reads as cash-in, not out.
  const isWithdrawal = allocated < 0;
  // No plan (ghost): nothing to measure against — show a full neutral bar.
  const noPlan = allocatedMag < 0.005;

  const ratio = noPlan ? 1 : consumedMag / allocatedMag;
  const fillPct = Math.max(0, Math.min(100, ratio * 100));
  const overflow = ratio > 1.0001; // executed more than planned, any section

  // Pace marker (spend only): where you "should" be by today, as a % of plan.
  const pacePct =
    !isWithdrawal && allocatedMag > 0.005
      ? Math.max(0, Math.min(100, (pacedAllocation / allocatedMag) * 100))
      : 0;
  const showPace =
    variant === 'spend' && !isWithdrawal && pacedAllocation > 0 && pacedAllocation < allocatedMag;

  const fillClass = noPlan
    ? 'envelope-bar-fill ghost'
    : overflow
      ? 'envelope-bar-fill over'
      : isWithdrawal
        ? 'envelope-bar-fill withdrawal'
        : `envelope-bar-fill ${variant}`;

  return (
    <div
      className="envelope-bar"
      role="img"
      aria-label={`${Math.round(ratio * 100)}% of plan`}
    >
      <div className={fillClass} style={{ width: `${fillPct}%` }} />
      {showPace && (
        <div className="envelope-bar-pace" style={{ left: `${pacePct}%` }} />
      )}
    </div>
  );
}
