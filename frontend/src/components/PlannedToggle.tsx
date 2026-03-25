import { useAppStore } from "../stores/appStore";

export default function PlannedToggle() {
  const viewMode = useAppStore((s) => s.viewMode);
  const toggleViewMode = useAppStore((s) => s.toggleViewMode);
  const isPlanned = viewMode === "combined";

  return (
    <button
      className={`planned-toggle ${isPlanned ? "planned-toggle-on" : "planned-toggle-off"}`}
      onClick={toggleViewMode}
      title={`${isPlanned ? "Showing actual + planned" : "Showing actual only"} (P to toggle)`}
    >
      <span className="planned-toggle-icon">{isPlanned ? "\u25CF" : "\u25CB"}</span>
      <span className="planned-toggle-label">{isPlanned ? "Actual + Planned" : "Actual"}</span>
    </button>
  );
}
