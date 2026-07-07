import { useState, useEffect, useRef } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { AuthImage } from "../../components/AuthImage";
import { AlertTriangle, CheckCircle, X, ChevronDown, ChevronUp, Camera, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { TimeDropdown } from "../Schedule/TimeDropdown";
import {
  listSymptomChecks,
  createSymptomCheck,
  deleteSymptomCheck,
  uploadSymptomPhoto,
  updateTesting,
  deleteTesting,
  type IngredientTestingResponse,
  type SymptomCheckResponse,
  type TestStatus,
} from "../../api/allergy";
import { listIngredients, type IngredientResponse } from "../../api/ingredients";
import { IngredientIcon } from "../../components/IngredientIcon";
import { SYMPTOM_PRESETS, SEVERITY_OPTIONS, parseCheckedAt } from "./types";

// ── 상태 메타 ─────────────────────────────────────────────────────────────────

export const STATUS_META: Record<TestStatus, { label: string; className: string }> = {
  testing: { label: "테스트 중", className: "bg-white text-primary-foreground font-medium" },
  completed_safe: { label: "안전 통과", className: "bg-white text-[#347D57] font-medium" },
  completed_reaction: { label: "반응 있음", className: "bg-white text-destructive font-medium" },
};

// ── 단일 체크 기록 렌더링 ──────────────────────────────────────────────────────

function CheckRecord({ check, onDelete }: { check: SymptomCheckResponse; onDelete?: () => Promise<void> }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete();
      setConfirmDelete(false);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="rounded-3xl">
      <div className="text-sm font-medium mb-1 flex items-center justify-between">
        <span className="flex items-center gap-0.5">
          <ChevronRight size={14} /> 기록 시각: {parseCheckedAt(check.checked_at).toLocaleString("ko-KR")}
        </span>
        {onDelete && (
          confirmDelete ? (
            <div className="flex items-center gap-1 flex-shrink-0 ml-1">
              <button
                onClick={() => {
                  setConfirmDelete(false);
                  setDeleteError("");
                }}
                disabled={deleting}
                className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-muted transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 transition-colors"
              >
                {deleting ? "삭제 중" : "삭제"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1 ml-1 flex-shrink-0 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 size={13} />
            </button>
          )
        )}
      </div>
      {deleteError && (
        <div className="mb-3 px-3 py-2 bg-destructive/10 border border-destructive/30 rounded-xl text-xs text-destructive font-semibold">
          {deleteError}
        </div>
      )}
      {check.has_reaction ? (
        <>
          <div className="flex items-center gap-2 rounded-3xl mb-4">
            <AlertTriangle size={14} className="text-destructive flex-shrink-0" />
            <span className="text-sm font-semibold text-destructive">반응이 기록되었습니다</span>
          </div>
          {check.description && (
            <div className="text-sm text-foreground mb-3 p-3 bg-muted/30 rounded-xl">
              {check.description}
            </div>
          )}
          {check.symptom_items.length > 0 && (
            <div className="mb-3">
              <div className="text-sm font-medium mb-1 flex items-center">
                <ChevronRight size={14} /> 증상 목록</div>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {check.symptom_items.map((item) => {
                  const severityLabel = SEVERITY_OPTIONS.find((s) => s.value === item.severity)?.label;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-1 px-2 py-0.5 bg-destructive/10 
                      rounded-full text-sm font-semibold"
                    >
                      <span>{item.symptom_type}</span>
                      {severityLabel && <span className="text-muted-foreground font-normal">({severityLabel})</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {check.symptom_photos.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {check.symptom_photos.map((photo) => (
                <AuthImage
                  key={photo.id}
                  src={photo.photo_url}
                  alt="증상 사진"
                  className="w-16 h-16 object-cover rounded-xl border border-border"
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#A8D5BA]/20 border border-[#A8D5BA]/50 rounded-xl">
          <CheckCircle size={14} className="text-safe-fg flex-shrink-0" />
          <span className="text-sm font-semibold text-safe-fg">이상 없음</span>
        </div>
      )}
    </div>
  );
}

// ── 타임라인 체크포인트 팝업 ──────────────────────────────────────────────────

interface MilestonePopupProps {
  milestone: { label: string; hours: number };
  checks: SymptomCheckResponse[];
  startDate: string;
  elapsedHours: number;
  onClose: () => void;
}

export function MilestonePopup({ milestone, checks, startDate, elapsedHours, onClose }: MilestonePopupProps) {
  useBodyScrollLock();
  const isUnreached = elapsedHours < milestone.hours;
  const milestoneTime = new Date(new Date(startDate).getTime() + milestone.hours * 3600 * 1000);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-3xl p-6 w-full max-w-sm shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-base">{milestone.label} 체크포인트</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
        <div className="text-xs text-muted-foreground mb-4">
          기준 시간: {milestoneTime.toLocaleString("ko-KR")}
        </div>

        {isUnreached ? (
          <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
            <div className="text-4xl">⏳</div>
            <p className="text-sm text-center">아직 이 시간대에 도달하지 않았습니다</p>
          </div>
        ) : checks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
            <div className="text-4xl">📭</div>
            <p className="text-sm text-center">이 시간대에 기록된 내용이 없습니다</p>
          </div>
        ) : (
          <div>
            {checks.map((check) => (
              <CheckRecord key={check.id} check={check} />
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// ── 재료 테스트 이력 팝업 ─────────────────────────────────────────────────────

interface IngredientHistoryPopupProps {
  ingredientId: number;
  ingredientName: string;
  ingredientEmoji: string | null;
  allTestings: IngredientTestingResponse[];
  token: string;
  onClose: () => void;
}

export function IngredientHistoryPopup({
  ingredientId,
  ingredientName,
  ingredientEmoji,
  allTestings,
  token,
  onClose,
}: IngredientHistoryPopupProps) {
  useBodyScrollLock();
  const relevant = [...allTestings]
    .filter((t) => t.ingredient_id === ingredientId)
    .sort((a, b) => (b.test_start_date > a.test_start_date ? 1 : -1));


  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [checksMap, setChecksMap] = useState<Map<string, SymptomCheckResponse[]>>(new Map());
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleToggle = async (testing: IngredientTestingResponse) => {
    if (expandedId === testing.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(testing.id);
    if (checksMap.has(testing.id)) return;
    setLoadingId(testing.id);
    try {
      const data = await listSymptomChecks(testing.id, token);
      setChecksMap((prev) => new Map(prev).set(testing.id, data));
    } catch {
      setChecksMap((prev) => new Map(prev).set(testing.id, []));
    } finally {
      setLoadingId(null);
    }
  };

  const handleDeleteCheck = async (testingId: string, checkId: string) => {
    await deleteSymptomCheck(checkId, token);
    setChecksMap((prev) => {
      const updated = new Map(prev);
      updated.set(testingId, (updated.get(testingId) ?? []).filter((c) => c.id !== checkId));
      return updated;
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-3xl px-5 py-3 w-full max-w-sm shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            <IngredientIcon name={ingredientName} emoji={ingredientEmoji} className="w-5 h-5 sm:w-6 sm:h-6" />
            <h3 className="font-bold text-base">'{ingredientName}' 테스트 이력</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-2 pr-0.5">
          {relevant.length === 0 ? (
            <div className="text-center py-7 -mt-2 text-muted-foreground text-base">이력이 없습니다</div>
          ) : (
            relevant.map((t) => {
              const meta = t.test_status
                ? STATUS_META[t.test_status]
                : { label: "예약", className: "bg-muted text-muted-foreground" };
              const isExpanded = expandedId === t.id;
              const isLoading = loadingId === t.id;
              const checks = checksMap.get(t.id) ?? [];

              return (
                <div key={t.id} className="rounded-3xl overflow-hidden">
                  <button
                    className="w-full flex items-center rounded-full gap-3 px-2 py-2 hover:bg-muted/50 transition-colors text-left mb-3"
                    onClick={() => handleToggle(t)}
                  >
                    <span className={`px-2.5 rounded-full text-base font-bold flex-shrink-0 ${meta.className}`}>
                      {meta.label}
                    </span>
                    <div className="flex-1 min-w-0 text-base">
                      {new Date(t.test_start_date).toLocaleDateString("ko-KR")}
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="flex-shrink-0 mr-2" /> : <ChevronDown size={14} className="flex-shrink-0 mr-2" />}
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4">
                      {isLoading ? (
                        <div className="text-center py-2 text-muted-foreground text-base">불러오는 중</div>
                      ) : checks.length === 0 ? (
                        <div className="text-center py-2 text-muted-foreground text-base">
                          기록된 증상 체크가 없습니다
                        </div>
                      ) : (
                        <div className="pt-3">
                          {checks.map((check, idx) => (
                            <div key={check.id}>
                              {idx > 0 && <hr className="border-border my-3" />}
                              <CheckRecord
                                check={check}
                                onDelete={() => handleDeleteCheck(t.id, check.id)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

// ── 기록하기 팝업 ─────────────────────────────────────────────────────────────

interface RecordModalProps {
  item: IngredientTestingResponse;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

export function RecordModal({ item, token, onClose, onSaved }: RecordModalProps) {
  useBodyScrollLock();
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);

  const [checkedAt, setCheckedAt] = useState(localNow);
  const [hasReaction, setHasReaction] = useState<boolean | null>(null);
  const [reactionOpen, setReactionOpen] = useState(false);
  const [selectedSymptoms, setSelectedSymptoms] = useState<{ type: string; severity: string }[]>([]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showReactionConfirm, setShowReactionConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerStep, setPickerStep] = useState<"month" | "day" | null>(null);

  const dateParts = checkedAt.split("T")[0].split("-").map(Number);
  const timeParts = (checkedAt.split("T")[1] ?? "00:00").split(":").map(Number);

  const updateDate = (y: number, m: number, d: number) => {
    const time = checkedAt.split("T")[1] ?? "00:00";
    setCheckedAt(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${time}`);
  };

  const updateTime = (h: number, min: number) => {
    const date = checkedAt.split("T")[0];
    setCheckedAt(`${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  };

  const toggleSymptom = (type: string) => {
    setSelectedSymptoms((prev) =>
      prev.find((s) => s.type === type)
        ? prev.filter((s) => s.type !== type)
        : [...prev, { type, severity: "mild" }],
    );
  };

  const setSeverity = (type: string, severity: string) => {
    setSelectedSymptoms((prev) =>
      prev.map((s) => (s.type === type ? { ...s, severity } : s)),
    );
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setPhotos((prev) => [...prev, ...files].slice(0, 3));
    e.target.value = "";
  };

  const handleSave = async () => {
    if (hasReaction === null) {
      setError("이상 없음 또는 반응 기록 중 하나를 선택해주세요.");
      return;
    }
    if (hasReaction && selectedSymptoms.length === 0) {
      setError("반응 기록 시 증상을 하나 이상 선택해주세요.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const checkedAtUtc = new Date(checkedAt).toISOString();
      const check = await createSymptomCheck(
        item.id,
        {
          checked_at: checkedAtUtc,
          has_reaction: hasReaction,
          description: description.trim() || undefined,
          symptom_items: hasReaction
            ? selectedSymptoms.map((s) => ({ symptom_type: s.type, severity: s.severity }))
            : [],
        },
        token,
      );
      for (let i = 0; i < photos.length; i++) {
        await uploadSymptomPhoto(check.id, photos[i], i, token);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (hasReaction === true) {
      if (selectedSymptoms.length === 0) {
        setError("반응 기록 시 증상을 하나 이상 선택해주세요.");
        return;
      }
      setError("");
      setShowReactionConfirm(true);
      return;
    }
    handleSave();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-3xl pl-5 pr-3 py-5 w-full max-w-sm shadow-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 font-bold text-base">
              <IngredientIcon name={item.ingredient_name} emoji={item.ingredient_emoji} className="w-5 h-5 sm:w-6 sm:h-6" /> {item.ingredient_name}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 py-2 pr-2">
        <div className="mb-4">
          <label className="text-sm font-semibold text-muted-foreground mb-1.5 block">기록 일시</label>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 overflow-hidden">
              <span className="px-2.5 py-1 text-sm font-semibold text-foreground">{dateParts[0]}년</span>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button type="button" onClick={() => setPickerStep("month")}
                className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">
                {dateParts[1]}월
              </button>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button type="button" onClick={() => setPickerStep("day")}
                className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">
                {dateParts[2]}일
              </button>
            </div>
            <TimeDropdown
              value={timeParts[0]}
              onChange={(h) => updateTime(h, timeParts[1])}
              length={24}
              suffix="시"
              className="!text-sm !py-1 !pl-2 !pr-1 !w-[68px] !justify-between"
            />
            <TimeDropdown
              value={timeParts[1]}
              onChange={(m) => updateTime(timeParts[0], m)}
              length={12}
              step={5}
              suffix="분"
              className="!text-sm !py-1 !pl-2 !pr-1 !w-[68px] !justify-between"
            />
          </div>

          {pickerStep && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4">
              <div className="bg-card rounded-3xl p-5 w-72 shadow-xl border border-border">
                {pickerStep === "month" && (
                  <>
                    <div className="text-sm font-bold mb-4 text-center text-foreground">기록 날짜</div>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <button key={m} type="button"
                          onClick={() => { updateDate(dateParts[0], m, dateParts[2]); setPickerStep("day"); }}
                          className={`py-2 rounded-xl text-sm font-semibold transition-colors ${
                            m === dateParts[1] ? "bg-[#C5E5FA] text-primary-foreground" : "hover:bg-[#C5E5FA]/20 text-foreground"
                          }`}>
                          {m}월
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {pickerStep === "day" && (
                  <>
                    <div className="relative flex items-center mb-4">
                      <button type="button" onClick={() => setPickerStep("month")}
                        className="absolute left-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <ChevronLeft size={13} /> 월
                      </button>
                      <span className="w-full text-center text-sm font-bold text-foreground">
                        {dateParts[0]}년 {dateParts[1]}월
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: new Date(dateParts[0], dateParts[1], 0).getDate() }, (_, i) => i + 1).map((d) => (
                        <button key={d} type="button"
                          onClick={() => { updateDate(dateParts[0], dateParts[1], d); setPickerStep(null); }}
                          className={`aspect-square text-xs rounded-lg transition-colors flex items-center justify-center ${
                            d === dateParts[2] ? "bg-[#C5E5FA] text-primary-foreground font-bold" : "hover:bg-[#C5E5FA]/20 text-foreground"
                          }`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button type="button" onClick={() => setPickerStep(null)}
                  className="w-full mt-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  취소
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mb-3">
          <label className="text-sm font-semibold text-muted-foreground mb-2 block">상태 선택</label>
          <div className="flex gap-2">
            <button
              onClick={() => { setHasReaction(false); setReactionOpen(false); setSelectedSymptoms([]); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-3xl text-sm font-bold border-2 transition-all ${
                hasReaction === false
                  ? "bg-[image:var(--card-wash-green-bg)] border-[#A8D5BA] text-[#2D5F3F]"
                  : "bg-muted/50 border-border text-muted-foreground hover:border-[#9AC6AF]/50"
              }`}
            >
              <CheckCircle size={18}/> 이상 없음
            </button>
            <button
              onClick={() => { setHasReaction(true); setReactionOpen(true); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-3xl text-sm font-bold border-2 transition-all ${
                hasReaction === true
                  ? "bg-[image:var(--card-wash-red-bg)] border-[#F8AC95] text-destructive"
                  : "bg-muted/50 border-border text-muted-foreground hover:border-[#F8AC95]/50"
              }`}
            >
              <AlertTriangle size={18}/> 반응 기록
            </button>
          </div>
        </div>

        {reactionOpen && (
        <div className="space-y-2 mb-3">
          {SYMPTOM_PRESETS.map((preset) => {
            const selected = selectedSymptoms.find((s) => s.type === preset.type);
            return (
              <div
                key={preset.type}
                className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-full border-2 text-sm font-semibold transition-all ${
                  selected
                    ? "bg-[image:var(--card-wash-red-bg)] border-[#F8AC95] text-destructive"
                    : "border-border text-muted-foreground hover:border-[#F8AC95]/50"
                }`}
              >
                {/* 증상 이름 */}
                <button
                  onClick={() => toggleSymptom(preset.type)}
                  className="flex-1 min-w-0 flex items-center gap-1 text-left"
                >
                  {selected && (
                    <CheckCircle size={16} className="text-destructive flex-shrink-0" />
                  )}
                  <span className="truncate">{preset.type}</span>
                </button>

                {/* 같은 행 우측 정렬 심각도 버튼 */}
                {selected && (
                  <div className="flex flex-shrink-0">
                    {SEVERITY_OPTIONS.map((sev) => (
                      <button
                        key={sev.value}
                        onClick={() => setSeverity(preset.type, sev.value)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          selected.severity === sev.value
                            ? "bg-[#F08667] text-white border-[#F08667]"
                            : "border-border hover:border-[#F08667]/50"
                        }`}
                      >
                        {sev.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

        {hasReaction !== null && (
          <div className="mb-4">
            <label className="text-sm font-semibold text-muted-foreground mb-1.5 block">메모</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="추가 메모를 입력하세요..."
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] resize-none"
            />
          </div>
        )}

        {hasReaction && (
          <div className="mb-4">
            <label className="text-sm font-semibold text-muted-foreground mb-1.5 block">사진 첨부 (최대 3장)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePhotoChange}
              className="hidden"
            />
            <div className="flex gap-2 flex-wrap">
              {photos.map((file, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(file)}
                    alt="첨부 사진"
                    className="w-16 h-16 object-cover rounded-xl border border-border"
                  />
                  <button
                    onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              {photos.length < 3 && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-primary flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                >
                  <Camera size={20} />
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mb-3 px-4 py-2.5 bg-destructive/10 border border-destructive/30 rounded-xl text-sm text-destructive font-semibold">
            {error}
          </div>
        )}
        </div>

        <div className="flex gap-2 flex-shrink-0 mt-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-border text-base
              font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSaveClick}
            disabled={saving || hasReaction === null}
            className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
          >
            {saving ? "저장 중" : "저장하기"}
          </button>
        </div>
      </div>

      {showReactionConfirm && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4"
          onClick={() => setShowReactionConfirm(false)}
        >
          <div
            className="bg-card border border-border rounded-3xl px-5 py-3 w-full max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-bold text-base">반응으로 기록할까요?</h3>
              <button
                onClick={() => setShowReactionConfirm(false)}
                className="p-1.5 rounded-full hover:bg-muted"
              >
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>
            <p className="text-sm mb-8 leading-relaxed">
              반응을 기록하면 이 재료의 테스트가 즉시 종료되고 '반응' 재료로 분류돼요.
              호흡곤란, 반복 구토, 전신 두드러기, 축 처짐이 있다면 즉시 진료를 받아 주세요.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowReactionConfirm(false)}
                className="flex-1 py-3 rounded-full border border-border text-base
                  font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setShowReactionConfirm(false);
                  handleSave();
                }}
                disabled={saving}
                className="flex-1 py-3 rounded-full bg-destructive text-white text-base font-bold
                    hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                {saving ? "저장 중" : "반응 기록하기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 테스트 변경 팝업 ──────────────────────────────────────────────────────────

interface EditTestingModalProps {
  item: IngredientTestingResponse;
  token: string;
  onClose: () => void;
  onSaved: () => void;
}

export function EditTestingModal({ item, token, onClose, onSaved }: EditTestingModalProps) {
  useBodyScrollLock();
  const toLocal = (isoStr: string) => {
    const d = new Date(isoStr);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const [selectedIngredient, setSelectedIngredient] = useState<IngredientResponse | null>({
    id: item.ingredient_id,
    name: item.ingredient_name,
    emoji: item.ingredient_emoji,
    recommended_month: null,
  });
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [searchResults, setSearchResults] = useState<IngredientResponse[]>([]);
  const [startDate, setStartDate] = useState(toLocal(item.test_start_date));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editPickerStep, setEditPickerStep] = useState<"month" | "day" | null>(null);

  const editDateParts = startDate.split("T")[0].split("-").map(Number);
  const editTimeParts = (startDate.split("T")[1] ?? "00:00").split(":").map(Number);

  const updateEditDate = (y: number, m: number, d: number) => {
    const time = startDate.split("T")[1] ?? "00:00";
    setStartDate(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${time}`);
  };

  const updateEditTime = (h: number, min: number) => {
    const date = startDate.split("T")[0];
    setStartDate(`${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`);
  };

  useEffect(() => {
    if (!ingredientSearch.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await listIngredients({ search: ingredientSearch });
        setSearchResults(results.slice(0, 5));
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ingredientSearch]);

  const handleSave = async () => {
    if (!selectedIngredient) { setError("재료를 선택해주세요."); return; }
    setSaving(true);
    setError("");
    try {
      const payload: { ingredient_id?: number; test_start_date?: string } = {};
      if (selectedIngredient.id !== item.ingredient_id) {
        payload.ingredient_id = selectedIngredient.id;
      }
      const newStartUtc = new Date(startDate).toISOString();
      if (newStartUtc !== new Date(item.test_start_date).toISOString()) {
        payload.test_start_date = newStartUtc;
      }
      if (Object.keys(payload).length > 0) {
        await updateTesting(item.id, payload, token);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "수정에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-3xl px-5 py-3 w-full max-w-[54vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base">현재 진행 중인 테스트 변경</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>

        <div className="mb-4">
          <label className="text-sm font-semibold text-muted-foreground mb-1.5 block">재료</label>
          {selectedIngredient ? (
            <div className="flex items-center gap-3 px-3 py-2 rounded-full border border-primary/30
            bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_100%)]">
              <IngredientIcon name={selectedIngredient.name} emoji={selectedIngredient.emoji} className="w-6 h-6 sm:w-7 sm:h-7" />
              <span className="font-semibold text-lg flex-1">{selectedIngredient.name}</span>
              <button
                onClick={() => { setSelectedIngredient(null); setIngredientSearch(""); }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={ingredientSearch}
                onChange={(e) => { setIngredientSearch(e.target.value); setError(""); }}
                placeholder="재료 이름 검색"
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm mb-2"
              />
              {searchResults.length > 0 && (
                <div className="border border-border rounded-xl overflow-hidden">
                  {searchResults.map((ing) => (
                    <button
                      key={ing.id}
                      onClick={() => { setSelectedIngredient(ing); setSearchResults([]); setIngredientSearch(""); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted text-sm text-left border-b border-border last:border-b-0"
                    >
                      <IngredientIcon name={ing.name} emoji={ing.emoji} className="w-4 h-4 sm:w-5 sm:h-5" />
                      <span className="font-semibold">{ing.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="mb-4">
          <label className="text-sm font-semibold text-muted-foreground mb-1.5 block">테스트 시작 일시</label>
          <div className="flex items-center gap-2 flex-wrap ">
            <div className="flex items-center rounded-xl border border-[#C5E5FA] bg-[#FAFAFA]/80 overflow-hidden">
              <span className="px-2.5 py-1 text-sm font-semibold text-foreground">{editDateParts[0]}년</span>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button type="button" onClick={() => setEditPickerStep("month")}
                className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">
                {editDateParts[1]}월
              </button>
              <span className="w-px self-stretch bg-[#C5E5FA]" />
              <button type="button" onClick={() => setEditPickerStep("day")}
                className="px-2.5 py-1 text-sm font-semibold hover:bg-[#EBF7FF] transition-colors">
                {editDateParts[2]}일
              </button>
            </div>
            <TimeDropdown
              value={editTimeParts[0]}
              onChange={(h) => updateEditTime(h, editTimeParts[1])}
              length={24}
              suffix="시"
              className="!text-sm !py-1 !pl-2 !pr-1 !w-[68px] !justify-between"
            />
            <TimeDropdown
              value={editTimeParts[1]}
              onChange={(m) => updateEditTime(editTimeParts[0], m)}
              length={12}
              step={5}
              suffix="분"
              className="!text-sm !py-1 !pl-2 !pr-1 !w-[68px] !justify-between"
            />
          </div>

          {editPickerStep && (
            <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center px-4">
              <div className="bg-card rounded-3xl p-5 w-72 shadow-xl border border-border">
                {editPickerStep === "month" && (
                  <>
                    <div className="text-sm font-bold mb-4 text-center text-foreground">시작 날짜</div>
                    <div className="grid grid-cols-4 gap-2">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <button key={m} type="button"
                          onClick={() => { updateEditDate(editDateParts[0], m, editDateParts[2]); setEditPickerStep("day"); }}
                          className={`py-2 rounded-xl text-sm font-semibold transition-colors ${
                            m === editDateParts[1] ? "bg-[#C5E5FA] text-primary-foreground" : "hover:bg-[#C5E5FA]/20 text-foreground"
                          }`}>
                          {m}월
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {editPickerStep === "day" && (
                  <>
                    <div className="relative flex items-center mb-4">
                      <button type="button" onClick={() => setEditPickerStep("month")}
                        className="absolute left-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        <ChevronLeft size={13} /> 월
                      </button>
                      <span className="w-full text-center text-sm font-bold text-foreground">
                        {editDateParts[0]}년 {editDateParts[1]}월
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: new Date(editDateParts[0], editDateParts[1], 0).getDate() }, (_, i) => i + 1).map((d) => (
                        <button key={d} type="button"
                          onClick={() => { updateEditDate(editDateParts[0], editDateParts[1], d); setEditPickerStep(null); }}
                          className={`aspect-square text-xs rounded-lg transition-colors flex items-center justify-center ${
                            d === editDateParts[2] ? "bg-[#C5E5FA] text-primary-foreground font-bold" : "hover:bg-[#C5E5FA]/20 text-foreground"
                          }`}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <button type="button" onClick={() => setEditPickerStep(null)}
                  className="w-full mt-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  취소
                </button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-2 text-center">
            시작 시간 변경 시 종료 시간(72시간 후)도 자동 조정됩니다.
          </p>
        </div>

        {error && (
          <div className="mb-3 px-4 py-2.5 bg-destructive/10 border border-destructive/30 
          rounded-3xl text-sm text-destructive font-semibold">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-border text-base
              font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !selectedIngredient}
            className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
          >
            {saving ? "저장 중" : "저장하기"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 테스트 삭제 확인 팝업 ─────────────────────────────────────────────────────

interface DeleteConfirmModalProps {
  item: IngredientTestingResponse;
  token: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteConfirmModal({ item, token, onClose, onDeleted }: DeleteConfirmModalProps) {
  useBodyScrollLock();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await deleteTesting(item.id, token, true);
      onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-3xl px-5 py-3 w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-base">테스트 종료</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
          </button>
        </div>
        <p className="text-lg mb-8 text-center">
          테스트 진행을 종료하시겠습니까?<br />
          종료 시 <span className="font-semibold">테스트 적용 일정을 삭제</span> 합니다.
        </p>
        {error && (
          <div className="mb-3 px-4 py-2.5 bg-destructive/10 border border-destructive/30 rounded-3xl text-sm text-destructive font-semibold">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border border-border text-base
              font-semibold hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-colors"
          >
            돌아가기
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex-1 py-3 rounded-full text-primary-foreground text-base font-bold 
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#DBF2FF_50%,#D1EDFF_100%)] 
                hover:bg-[radial-gradient(ellipse_at_center,#D4EEFF_0%,#DBF2FF_100%)] transition-opacity disabled:opacity-40"
          >
            {deleting ? "삭제 중" : "삭제하기"}
          </button>
        </div>
      </div>
    </div>
  );
}
