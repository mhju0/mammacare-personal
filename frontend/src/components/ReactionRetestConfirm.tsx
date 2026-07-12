import { AlertTriangle } from "lucide-react";

/**
 * Reaction-retest consent gate. A medical-safety dialog shown before re-testing an
 * ingredient that previously reacted (or is a confirmed allergen): re-introducing a
 * known allergen at home is risky and starting a new test wipes the prior reaction
 * records. Extracted verbatim from the Allergy screen so both the Allergy and
 * Ingredients screens share one source of truth — do not reimplement or vary the copy.
 * Cancel is the visual primary (safer default); "다시 테스트 시작" is the destructive action.
 */
export function ReactionRetestConfirm({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4">
      <div className="bg-card border border-border rounded-3xl p-6 w-[340px] shadow-2xl flex flex-col gap-4">
        <div className="flex items-center gap-2 rounded-2xl bg-reaction-bg text-reaction-fg px-3 py-2 font-bold text-base">
          <AlertTriangle size={18} className="shrink-0" />
          이전에 알레르기 반응이 있던 재료예요
        </div>
        <div className="flex flex-col gap-3 text-sm text-foreground leading-relaxed">
          <p>
            다시 도입하기 전에 소아과 전문의와 상담하시길 권해요. 확정된 알레르겐을 집에서 다시 먹이는 건 위험할 수 있어요.
          </p>
          <p>
            다시 테스트를 시작하면{" "}
            <span className="font-bold text-reaction-fg">이전 반응 기록(증상·사진)은 삭제되고</span>, 새 관찰이 처음부터 시작돼요.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onCancel}
            className="w-full py-3 rounded-full bg-[image:var(--action-soft-bg)]
            hover:bg-[image:var(--action-soft-bg-hover)]
            text-primary-foreground font-bold text-base transition-opacity"
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            className="w-full py-3 rounded-full bg-reaction-bg text-reaction-fg border border-reaction-fg/30
            font-bold text-base hover:bg-reaction-bg/80 transition-opacity"
          >
            다시 테스트 시작
          </button>
        </div>
      </div>
    </div>
  );
}
