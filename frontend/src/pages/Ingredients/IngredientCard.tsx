import { StatusChip, type ChipStatus } from "../../components/ui/status-chip";
import { IngredientIcon } from "../../components/IngredientIcon";
import type { IngredientResponse } from "../../api/ingredients";

// Korean status label for the card's aria-label. Mirrors the visible StatusChip
// label so screen-reader and sighted users hear/see the same state.
const CHIP_LABEL: Record<ChipStatus, string> = {
  safe: "안전",
  testing: "테스트중",
  reaction: "반응",
  caution: "주의",
  "not-started": "미시작",
};

/**
 * Presentational ingredient card. Owns no data or derivation — the page passes the
 * already-derived chip status and the tap handler. Status is conveyed by icon + text
 * (StatusChip) and the card aria-label, never color alone.
 */
export function IngredientCard({
  ingredient,
  chip,
  starting,
  disabled,
  onStart,
}: {
  ingredient: IngredientResponse;
  chip: ChipStatus;
  starting: boolean;
  disabled: boolean;
  onStart: (ingredient: IngredientResponse) => void;
}) {
  const monthLabel =
    ingredient.recommended_month != null ? `${ingredient.recommended_month}개월~` : null;

  return (
    <button
      type="button"
      onClick={() => onStart(ingredient)}
      disabled={disabled}
      aria-label={`${ingredient.name}, ${CHIP_LABEL[chip]}`}
      className="flex flex-col gap-3 rounded-3xl bg-warm-surface p-4 text-left shadow-warm transition-colors hover:bg-warm-surface-soft/40 disabled:pointer-events-none disabled:opacity-60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-warm-surface-soft">
          <IngredientIcon name={ingredient.name} emoji={ingredient.emoji} className="h-9 w-9" />
        </span>
        <StatusChip status={chip} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-bold text-warm-fg">{ingredient.name}</p>
        {monthLabel && (
          <p className="mt-0.5 text-xs font-medium text-warm-fg-muted">{monthLabel}</p>
        )}
      </div>
      {starting && (
        <span className="text-xs font-semibold text-warm-brand">시작하는 중…</span>
      )}
    </button>
  );
}
