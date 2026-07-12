import { cn } from "../../components/ui/utils";

// Buckets mirror the chip precedence in the page: "caution" collapses both the
// caution and reaction chips (the 주의 pill), matching the Dashboard traffic-light
// count. "not-started" = ingredients with no testing row (미테스트).
export type IngredientFilterKey = "all" | "safe" | "testing" | "caution" | "not-started";

export interface FilterPill {
  key: IngredientFilterKey;
  label: string;
  count: number;
}

export function StatusFilterPills({
  pills,
  active,
  onSelect,
}: {
  pills: FilterPill[];
  active: IngredientFilterKey;
  onSelect: (key: IngredientFilterKey) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {pills.map((pill) => {
        const isActive = pill.key === active;
        return (
          <button
            key={pill.key}
            type="button"
            onClick={() => onSelect(pill.key)}
            aria-pressed={isActive}
            className={cn(
              "shrink-0 rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap transition-colors",
              isActive
                ? "bg-warm-brand text-warm-brand-fg"
                : "bg-warm-surface-soft text-warm-fg hover:bg-warm-surface-soft/70",
            )}
          >
            {pill.label}{" "}
            <span
              className={cn(
                "tabular-nums",
                isActive ? "text-warm-brand-fg/80" : "text-warm-fg-muted",
              )}
            >
              {pill.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
