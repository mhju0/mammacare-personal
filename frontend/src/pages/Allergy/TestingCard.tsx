import { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { listSymptomChecks, type IngredientTestingResponse, type SymptomCheckResponse } from "../../api/allergy";
import { IngredientIcon } from "../../components/IngredientIcon";
import { StatusChip } from "../../components/ui/status-chip";
import {
  TIME_MILESTONES,
  getElapsedHours,
  getProgressPercentage,
  getCurrentMilestone,
  buildMilestoneMap,
} from "./types";
import { MilestonePopup, RecordModal, EditTestingModal, DeleteConfirmModal } from "./TestingModals";

interface TestingCardProps {
  item: IngredientTestingResponse;
  token: string;
  onRefresh: () => void;
}

function getAppProgress(hours: number): number {
  const n = TIME_MILESTONES.length;
  if (hours <= 0) return 0;
  if (hours >= TIME_MILESTONES[n - 1].hours) return 100;
  if (hours < TIME_MILESTONES[0].hours) return 0;
  for (let i = 0; i < n - 1; i++) {
    const curr = TIME_MILESTONES[i].hours;
    const next = TIME_MILESTONES[i + 1].hours;
    if (hours >= curr && hours < next) {
      const fraction = (hours - curr) / (next - curr);
      return TIME_MILESTONES[i].appPosition + fraction * (TIME_MILESTONES[i + 1].appPosition - TIME_MILESTONES[i].appPosition);
    }
  }
  return 100;
}

export function TestingCard({ item, token, onRefresh }: TestingCardProps) {
  const isApp = Capacitor.isNativePlatform();
  const elapsedHours = getElapsedHours(item.test_start_date);
  const progress = getProgressPercentage(elapsedHours);
  const appProgress = isApp ? getAppProgress(elapsedHours) : progress;
  const currentMilestone = getCurrentMilestone(elapsedHours);

  const [checks, setChecks] = useState<SymptomCheckResponse[]>([]);
  const [selectedMilestoneIdx, setSelectedMilestoneIdx] = useState<number | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const fetchChecks = useCallback(async () => {
    try {
      const data = await listSymptomChecks(item.id, token);
      setChecks(data);
    } catch {
      // 실패해도 빈 목록 유지
    }
  }, [item.id, token]);

  useEffect(() => {
    fetchChecks();
  }, [fetchChecks]);

  const milestoneMap = buildMilestoneMap(checks, item.test_start_date);

  const handleMilestoneClick = (idx: number) => {
    if (idx > currentMilestone) return;
    setSelectedMilestoneIdx(idx);
  };

  const getMilestoneDotColor = (idx: number) => {
    if (idx > currentMilestone) return "bg-muted-foreground/30";
    const assigned = milestoneMap.get(idx) ?? [];
    if (assigned.length === 0) return "bg-testing-fg";
    return assigned.some((c) => c.has_reaction) ? "bg-destructive" : "bg-safe-fg";
  };

  const getMilestoneLabelColor = (idx: number) => {
    if (idx > currentMilestone) return "text-muted-foreground";
    const assigned = milestoneMap.get(idx) ?? [];
    if (assigned.length === 0) return "text-testing-fg";
    return assigned.some((c) => c.has_reaction) ? "text-destructive" : "text-safe-fg";
  };

  return (
    <div className="p-5 bg-background border border-border rounded-3xl">
      <div className={`flex justify-between gap-3 mb-4 ${isApp ? "items-start" : "items-center"}`}>
        <div className="flex items-center gap-3">
          <IngredientIcon name={item.ingredient_name} emoji={item.ingredient_emoji} className="w-8 h-8 sm:w-9 sm:h-9" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base">{item.ingredient_name}</span>
              <StatusChip status="testing" />
            </div>
            {isApp ? (
              <>
                <div className="text-xs font-semibold text-muted-foreground whitespace-nowrap">진행률: {progress.toFixed(1)}%</div>
                <div className="text-xs font-semibold text-muted-foreground whitespace-nowrap">({elapsedHours.toFixed(1)}시간 경과)</div>
              </>
            ) : (
              <div className="text-sm font-semibold text-muted-foreground">
                진행률: {progress.toFixed(1)}% ({elapsedHours.toFixed(1)}시간 경과)
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowDelete(true)}
            className="p-2 rounded-xl border border-border hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            title="삭제"
          >
            <Trash2 size={18} />
          </button>
          <button
            onClick={() => setShowRecord(true)}
            className={`flex items-center gap-1 px-3 py-1 rounded-3xl ${isApp ? "text-sm" : "text-base"} text-primary-foreground
            bg-[#FEF5CC] hover:opacity-70 font-semibold transition-colors`}
          >
            반응 기록하기
          </button>
        </div>
      </div>

      {/* 타임라인 */}
      <div className="relative mb-2">
        {isApp ? (
          <div className="grid h-8 grid-cols-9 mb-2">
            {TIME_MILESTONES.map((milestone, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <button
                  onClick={() => handleMilestoneClick(i)}
                  disabled={i > currentMilestone}
                  className={`w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full transition-all ${getMilestoneDotColor(i)} ${
                    i <= currentMilestone ? "hover:scale-125 cursor-pointer" : "cursor-default"
                  }`}
                  title={i <= currentMilestone ? `${milestone.label} 기록 보기` : "아직 도달하지 않음"}
                />
                <div className={`text-[9px] sm:text-xs font-semibold whitespace-nowrap ${getMilestoneLabelColor(i)}`}>
                  {milestone.label}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="relative h-12 mb-2">
            {TIME_MILESTONES.map((milestone, i) => {
              const isFirst = i === 0;
              const isLast = i === TIME_MILESTONES.length - 1;
              const transform = isFirst
                ? "translateX(0)"
                : isLast
                ? "translateX(-100%)"
                : "translateX(-50%)";
              return (
                <div
                  key={i}
                  className="absolute bottom-0 flex flex-col items-center gap-1"
                  style={{ left: `${milestone.position}%`, transform }}
                >
                  <button
                    onClick={() => handleMilestoneClick(i)}
                    disabled={i > currentMilestone}
                    className={`w-3.5 h-3.5 rounded-full transition-all ${getMilestoneDotColor(i)} ${
                      i <= currentMilestone ? "hover:scale-125 cursor-pointer" : "cursor-default"
                    }`}
                    title={i <= currentMilestone ? `${milestone.label} 기록 보기` : "아직 도달하지 않음"}
                  />
                  <div className={`text-[10px] sm:text-xs font-semibold whitespace-nowrap ${getMilestoneLabelColor(i)}`}>
                    {milestone.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div
          className="h-2 bg-[#FEF5CC] rounded-full overflow-hidden"
          style={isApp ? { marginInline: `${100 / (TIME_MILESTONES.length * 2)}%` } : undefined}
        >
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${appProgress}%` }}
          />
        </div>
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-3 mt-3 text-[0.89rem] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-safe-fg" />
          <span>이상 없음</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <span>반응 있음</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-muted-foreground/30" />
          <span>미기록</span>
        </div>
      </div>

      {selectedMilestoneIdx !== null && (
        <MilestonePopup
          milestone={TIME_MILESTONES[selectedMilestoneIdx]}
          checks={milestoneMap.get(selectedMilestoneIdx) ?? []}
          startDate={item.test_start_date}
          elapsedHours={elapsedHours}
          onClose={() => setSelectedMilestoneIdx(null)}
        />
      )}

      {showRecord && (
        <RecordModal
          item={item}
          token={token}
          onClose={() => setShowRecord(false)}
          onSaved={() => { fetchChecks(); onRefresh(); }}
        />
      )}

      {showEdit && (
        <EditTestingModal
          item={item}
          token={token}
          onClose={() => setShowEdit(false)}
          onSaved={onRefresh}
        />
      )}

      {showDelete && (
        <DeleteConfirmModal
          item={item}
          token={token}
          onClose={() => setShowDelete(false)}
          onDeleted={onRefresh}
        />
      )}
    </div>
  );
}
