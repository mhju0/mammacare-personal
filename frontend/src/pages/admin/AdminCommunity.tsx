import { useState, useEffect, useCallback } from "react";
import { useBodyScrollLock } from "../../hooks/useBodyScrollLock";
import { useNavigate } from "react-router";
import { useApp } from "../../context/AppContext";
import {
  Trash2, XCircle, CheckCircle,
  Plus, X, Edit3, ChevronDown, Bell,
} from "lucide-react";
import {
  listCategoriesApi,
  listPostsApi,
  createPostApi,
  updatePostApi,
  deletePostApi,
} from "../../api/community";
import type { CommunityCategory, CommunityPost } from "../../api/community";
import { apiFetch } from "../../api/client";
import {
  getAdminInquiries,
  replyAdminInquiry,
  updateAdminUser,
  type AdminInquiryItem,
} from "../../api/admin";

// ─── 관리자 전용 API 타입 ─────────────────────────────────────────────────────

interface AdminPostItem {
  id: string;
  category_name: string;
  title: string;
  nickname: string;
  author_id: string;
  author_nickname: string;
  is_anonymous: boolean;
  is_notice: boolean;
  is_deleted: boolean;
  like_count: number;
  comment_count: number;
  created_at: string;
}

interface AdminReportItem {
  id: string;
  post_id: string | null;
  post_title: string | null;
  post_author_id: string | null;
  post_author_nickname: string | null;
  comment_id: string | null;
  comment_content: string | null;
  reporter_nickname: string;
  reason: string;
  is_handled: boolean;
  created_at: string;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
  });
}

export default function AdminCommunity() {
  const { user, token, authLoading } = useApp();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"notices" | "reports" | "posts" | "inquiries">("notices");

  const PAGE_SIZE = 20;

  // ─── 공지 관리 상태 ──────────────────────────────────────────────────────────
  const [notices, setNotices] = useState<CommunityPost[]>([]);
  const [noticeCategories, setNoticeCategories] = useState<CommunityCategory[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(false);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [editingNotice, setEditingNotice] = useState<CommunityPost | null>(null);
  const [noticeForm, setNoticeForm] = useState({ title: "", content: "" });
  const [noticeSkip, setNoticeSkip] = useState(0);
  const [noticeHasMore, setNoticeHasMore] = useState(false);

  // ─── 신고 관리 상태 ──────────────────────────────────────────────────────────
  const [reports, setReports] = useState<AdminReportItem[]>([]);
  const [reportTotal, setReportTotal] = useState(0);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportFilter, setReportFilter] = useState<"pending" | "all">("pending");
  const [reportSkip, setReportSkip] = useState(0);
  const [reportSubTab, setReportSubTab] = useState<"post" | "comment">("post");
  const [pendingPostReportCount, setPendingPostReportCount] = useState(0);
  const [pendingCommentReportCount, setPendingCommentReportCount] = useState(0);

  // ─── 게시글 관리 상태 ────────────────────────────────────────────────────────
  const [allPosts, setAllPosts] = useState<AdminPostItem[]>([]);
  const [postTotal, setPostTotal] = useState(0);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [postSkip, setPostSkip] = useState(0);

  // ─── 문의 관리 상태 ──────────────────────────────────────────────────────────
  const [inquiries, setInquiries] = useState<AdminInquiryItem[]>([]);
  const [inquiryTotal, setInquiryTotal] = useState(0);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [inquiryFilter, setInquiryFilter] = useState<"" | "pending" | "answered">("");
  const [inquirySkip, setInquirySkip] = useState(0);
  const [expandedInquiry, setExpandedInquiry] = useState<string | null>(null);

  useBodyScrollLock(showNoticeModal || !!editingNotice);

  useEffect(() => {
    if (!authLoading && !user?.isAdmin) navigate("/login");
  }, [authLoading, user, navigate]);

  // ─── 공지 카테고리 + 공지 목록 로드 ──────────────────────────────────────────
  const fetchNotices = useCallback(async (skip = 0) => {
    if (!token) return;
    setLoadingNotices(true);
    try {
      const cats = await listCategoriesApi(token);
      setNoticeCategories(cats);
      const noticeCat = cats.find((c) => c.is_admin_only);
      if (noticeCat) {
        const data = await listPostsApi({ category_id: noticeCat.id, limit: PAGE_SIZE, skip }, token);
        setNotices(data);
        setNoticeHasMore(data.length >= PAGE_SIZE);
      }
    } catch {}
    finally { setLoadingNotices(false); }
  }, [token]);

  // ─── 대기 중 신고 수 로드 (메인 탭 뱃지용) ──────────────────────────────────
  const fetchPendingCounts = useCallback(async () => {
    if (!token) return;
    try {
      const [postData, commentData] = await Promise.all([
        apiFetch<{ reports: AdminReportItem[]; total: number }>(
          `/admin/community/reports?handled=false&limit=1&report_type=post`, {}, token,
        ),
        apiFetch<{ reports: AdminReportItem[]; total: number }>(
          `/admin/community/reports?handled=false&limit=1&report_type=comment`, {}, token,
        ),
      ]);
      setPendingPostReportCount(postData.total);
      setPendingCommentReportCount(commentData.total);
    } catch {}
  }, [token]);

  // ─── 신고 목록 로드 ───────────────────────────────────────────────────────────
  const fetchReports = useCallback(async (skip = 0) => {
    if (!token) return;
    setLoadingReports(true);
    try {
      const params = new URLSearchParams({ skip: String(skip), limit: String(PAGE_SIZE) });
      if (reportFilter === "pending") params.set("handled", "false");
      params.set("report_type", reportSubTab);
      const data = await apiFetch<{ reports: AdminReportItem[]; total: number }>(
        `/admin/community/reports?${params}`, {}, token,
      );
      setReports(data.reports);
      setReportTotal(data.total);
    } catch {}
    finally { setLoadingReports(false); }
  }, [token, reportFilter, reportSubTab]);

  // ─── 전체 게시글 목록 로드 ────────────────────────────────────────────────────
  const fetchAllPosts = useCallback(async (skip = 0) => {
    if (!token) return;
    setLoadingPosts(true);
    try {
      const data = await apiFetch<{ posts: AdminPostItem[]; total: number }>(
        `/admin/community/posts?limit=${PAGE_SIZE}&skip=${skip}`, {}, token,
      );
      setAllPosts(data.posts);
      setPostTotal(data.total);
    } catch {}
    finally { setLoadingPosts(false); }
  }, [token]);

  // ─── 문의 목록 로드 ───────────────────────────────────────────────────────────
  const fetchInquiries = useCallback(async (skip = 0) => {
    if (!token) return;
    setLoadingInquiries(true);
    try {
      const data = await getAdminInquiries(token, {
        status: inquiryFilter || undefined,
        skip,
        limit: PAGE_SIZE,
      });
      setInquiries(data.inquiries);
      setInquiryTotal(data.total);
    } catch {}
    finally { setLoadingInquiries(false); }
  }, [token, inquiryFilter]);

  useEffect(() => { if (!authLoading && token && activeTab === "notices") fetchNotices(0); }, [authLoading, token, activeTab, fetchNotices]);
  useEffect(() => { if (!authLoading && token && activeTab === "reports") { fetchReports(0); fetchPendingCounts(); } }, [authLoading, token, activeTab, fetchReports, fetchPendingCounts]);
  useEffect(() => { if (!authLoading && token && activeTab === "posts") fetchAllPosts(0); }, [authLoading, token, activeTab, fetchAllPosts]);
  useEffect(() => { if (!authLoading && token && activeTab === "inquiries") fetchInquiries(0); }, [authLoading, token, activeTab, fetchInquiries]);

  // 탭 전환 시 페이지 리셋
  useEffect(() => {
    setNoticeSkip(0);
    setReportSkip(0);
    setPostSkip(0);
    setInquirySkip(0);
  }, [activeTab]);

  // 필터/서브탭 변경 시 페이지 리셋
  useEffect(() => { setReportSkip(0); }, [reportFilter]);
  useEffect(() => { setReportSkip(0); }, [reportSubTab]);
  useEffect(() => { setInquirySkip(0); }, [inquiryFilter]);

  // ─── 공지 작성 ───────────────────────────────────────────────────────────────
  const handleCreateNotice = async () => {
    if (!token || !noticeForm.title.trim() || !noticeForm.content.trim()) return;
    const noticeCat = noticeCategories.find((c) => c.is_admin_only);
    if (!noticeCat) return;
    try {
      await createPostApi(
        { category_id: noticeCat.id, title: noticeForm.title, content: noticeForm.content, is_notice: true },
        token,
      );
      setShowNoticeModal(false);
      setNoticeForm({ title: "", content: "" });
      fetchNotices();
    } catch {}
  };

  // ─── 공지 수정 ───────────────────────────────────────────────────────────────
  const handleUpdateNotice = async () => {
    if (!token || !editingNotice) return;
    try {
      await updatePostApi(editingNotice.id, { title: editingNotice.title, content: editingNotice.content }, token);
      setEditingNotice(null);
      fetchNotices();
    } catch {}
  };

  // ─── 공지 삭제 ───────────────────────────────────────────────────────────────
  const handleDeleteNotice = async (postId: string) => {
    if (!token || !window.confirm("공지를 삭제하시겠습니까?")) return;
    try {
      await deletePostApi(postId, token);
      setNotices((prev) => prev.filter((n) => n.id !== postId));
    } catch {}
  };

  // ─── 작성자 계정 정지 ─────────────────────────────────────────────────────────
  const handleSuspendUser = async (userId: string, nickname: string) => {
    if (!token || !window.confirm(`${nickname} 님의 계정을 정지하시겠습니까?`)) return;
    try {
      await updateAdminUser(token, userId, { is_active: false });
    } catch {}
  };

  // ─── 신고 승인 ───────────────────────────────────────────────────────────────
  const handleApprove = async (reportId: string, isComment: boolean) => {
    const target = isComment ? "댓글" : "게시글";
    if (!token || !window.confirm(`신고를 승인하고 ${target}을 삭제하시겠습니까?`)) return;
    try {
      await apiFetch(`/admin/community/reports/${reportId}/approve`, { method: "POST" }, token);
      fetchReports(reportSkip);
      fetchAllPosts(postSkip);
      fetchPendingCounts();
    } catch {}
  };

  // ─── 신고 기각 ───────────────────────────────────────────────────────────────
  const handleReject = async (reportId: string) => {
    if (!token) return;
    try {
      await apiFetch(`/admin/community/reports/${reportId}/reject`, { method: "POST" }, token);
      fetchReports(reportSkip);
      fetchPendingCounts();
    } catch {}
  };

  // ─── 게시글 삭제 (관리자) ─────────────────────────────────────────────────────
  const handleDeletePost = async (postId: string) => {
    if (!token || !window.confirm("게시글을 삭제하시겠습니까?")) return;
    try {
      await deletePostApi(postId, token);
      setAllPosts((prev) => prev.filter((p) => p.id !== postId));
      setPostTotal((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  // ─── 문의 답변 완료 처리 ─────────────────────────────────────────────────────
  const handleReply = async (inquiryId: string) => {
    if (!token) return;
    try {
      await replyAdminInquiry(token, inquiryId);
      fetchInquiries(inquirySkip);
    } catch {}
  };

  // ─── 페이지 이동 ──────────────────────────────────────────────────────────────
  const handleNoticePage   = (newSkip: number) => { setNoticeSkip(newSkip);   fetchNotices(newSkip); };
  const handleReportPage   = (newSkip: number) => { setReportSkip(newSkip);   fetchReports(newSkip); };
  const handlePostPage     = (newSkip: number) => { setPostSkip(newSkip);     fetchAllPosts(newSkip); };
  const handleInquiryPage  = (newSkip: number) => { setInquirySkip(newSkip); fetchInquiries(newSkip); };

  const pendingCount = pendingPostReportCount + pendingCommentReportCount;
  const pendingInquiryCount = inquiryFilter === "pending"
    ? inquiryTotal
    : inquiries.filter((i) => i.status === "pending").length;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
      <h1 className="text-2xl font-bold mb-5 flex items-center gap-2" style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}><Bell size={24} />커뮤니티 &amp; 문의 관리</h1>

      {/* 탭 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {([
          { key: "notices",   label: "공지 관리" },
          { key: "reports",   label: `신고 관리 (${pendingCount})` },
          { key: "posts",     label: "게시글 관리" },
          { key: "inquiries", label: `문의 관리 (${pendingInquiryCount})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2.5 px-3 py-1 rounded-full font-medium text-base transition-colors ${
              activeTab === key
                ? "bg-warm-surface-soft hover:opacity-70 font-semibold transition-colors"
                : "bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 공지 관리 탭 ── */}
      {activeTab === "notices" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold text-base">공지사항 목록</h2>
            <button
              onClick={() => { setNoticeForm({ title: "", content: "" }); setShowNoticeModal(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold 
              text-primary-foreground bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)] 
              hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)] shadow-sm transition-all duration-300"
            >
              <Plus size={14} /> 새 공지 작성
            </button>
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            {loadingNotices ? (
              <div className="p-8 text-center text-muted-foreground text-base">불러오는 중</div>
            ) : notices.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-base">등록된 공지가 없습니다.</div>
            ) : (
              <div className="divide-y divide-border">
                {notices.map((notice) => (
                  <div key={notice.id} className="px-6 py-4 flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded">공지</span>
                        <span className="font-semibold truncate">{notice.title}</span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{notice.content}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatDate(notice.created_at)}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setEditingNotice({ ...notice })}
                        className="flex items-center gap-1 px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-muted"
                      >
                        <Edit3 size={13} /> 수정
                      </button>
                      <button
                        onClick={() => handleDeleteNotice(notice.id)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-destructive/10 text-destructive rounded-lg text-sm hover:bg-destructive/20"
                      >
                        <Trash2 size={13} /> 삭제
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 공지 페이지네이션 */}
          {(noticeSkip > 0 || noticeHasMore) && (
            <div className="mt-4 flex items-center justify-end gap-1">
              <button
                onClick={() => handleNoticePage(noticeSkip - PAGE_SIZE)}
                disabled={noticeSkip === 0}
                className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
              >
                이전
              </button>
              <span className="px-3 py-1.5 text-xs text-muted-foreground">
                {Math.floor(noticeSkip / PAGE_SIZE) + 1}페이지
              </span>
              <button
                onClick={() => handleNoticePage(noticeSkip + PAGE_SIZE)}
                disabled={!noticeHasMore}
                className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
              >
                다음
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 신고 관리 탭 ── */}
      {activeTab === "reports" && (
        <div className="space-y-4">
          {/* 게시글/댓글 서브탭 */}
          <div className="flex gap-2 border-b border-border pb-3">
            <button
              onClick={() => setReportSubTab("post")}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                reportSubTab === "post"
                  ? "bg-warm-surface-soft text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              게시글 신고 {pendingPostReportCount > 0 && `(${pendingPostReportCount})`}
            </button>
            <button
              onClick={() => setReportSubTab("comment")}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                reportSubTab === "comment"
                  ? "bg-warm-surface-soft text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              댓글 신고 {pendingCommentReportCount > 0 && `(${pendingCommentReportCount})`}
            </button>
          </div>

          {/* 처리 상태 필터 */}
          <div className="flex gap-2">
            {(["pending", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setReportFilter(f)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  reportFilter === f ? "bg-primary/10 text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f === "pending" ? "대기 중" : "전체"}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h3 className="font-bold">{reportSubTab === "post" ? "게시글" : "댓글"} 신고 목록</h3>
            </div>
            {loadingReports ? (
              <div className="p-8 text-center text-muted-foreground text-base">불러오는 중</div>
            ) : reports.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-base">신고 내역이 없습니다.</div>
            ) : (
              <div className="divide-y divide-border">
                {reports.map((report) => (
                  <div key={report.id} className={`px-6 py-4 ${report.is_handled ? "opacity-50" : ""}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1.5">
                        {report.post_title && (
                          <p className="font-medium">게시글: {report.post_title}</p>
                        )}
                        {report.comment_content && (
                          <p className="font-medium text-sm">댓글: "{report.comment_content}"</p>
                        )}
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          {report.post_author_nickname && (
                            <div className="flex items-center gap-2">
                              <span>작성자: <span className="text-foreground font-medium">{report.post_author_nickname}</span></span>
                              {!report.is_handled && report.post_author_id && (
                                <button
                                  onClick={() => handleSuspendUser(report.post_author_id!, report.post_author_nickname!)}
                                  className="px-2 py-0.5 rounded-full text-xs bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors"
                                >
                                  계정 정지
                                </button>
                              )}
                            </div>
                          )}
                          <div>신고자: {report.reporter_nickname}</div>
                          <div>사유: <span className="text-destructive">{report.reason}</span></div>
                          <div>신고일: {formatDate(report.created_at)}</div>
                        </div>
                      </div>

                      {report.is_handled ? (
                        <span className="px-3 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground shrink-0">
                          처리완료
                        </span>
                      ) : (
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => handleApprove(report.id, !!report.comment_id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-destructive text-destructive-foreground rounded-lg text-sm font-medium hover:opacity-90"
                          >
                            <Trash2 size={13} /> 삭제
                          </button>
                          <button
                            onClick={() => handleReject(report.id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-muted text-foreground rounded-lg text-sm font-medium hover:bg-muted/80"
                          >
                            <XCircle size={13} /> 기각
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 신고 페이지네이션 */}
          {reportTotal > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>총 {reportTotal.toLocaleString()}건</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handleReportPage(reportSkip - PAGE_SIZE)}
                  disabled={reportSkip === 0}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                >
                  이전
                </button>
                <span className="px-3 py-1.5 text-xs">
                  {Math.floor(reportSkip / PAGE_SIZE) + 1} / {Math.ceil(reportTotal / PAGE_SIZE)}
                </span>
                <button
                  onClick={() => handleReportPage(reportSkip + PAGE_SIZE)}
                  disabled={reportSkip + PAGE_SIZE >= reportTotal}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 게시글 관리 탭 ── */}
      {activeTab === "posts" && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-border bg-muted/30">
            <h3 className="font-bold">전체 게시글</h3>
          </div>
          {loadingPosts ? (
            <div className="p-8 text-center text-muted-foreground text-base">불러오는 중</div>
          ) : allPosts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-base">게시글이 없습니다.</div>
          ) : (
            <div className="divide-y divide-border">
              {allPosts.map((post) => (
                <div key={post.id} className="px-6 py-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {post.is_notice && (
                        <span className="px-2 py-0.5 bg-primary text-primary-foreground text-xs font-bold rounded">공지</span>
                      )}
                      <span className="px-2 py-0.5 bg-primary/10 text-primary-foreground rounded text-xs font-medium">
                        {post.category_name}
                      </span>
                      <span className="font-medium truncate">{post.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-wrap">
                      {post.is_anonymous ? (
                        <>
                          <span>익명</span>
                          <span className="px-1.5 py-0.5 bg-muted rounded text-xs text-foreground font-medium">
                            실제: {post.author_nickname}
                          </span>
                        </>
                      ) : (
                        <span>{post.nickname}</span>
                      )}
                      <span>·</span>
                      <span>{formatDate(post.created_at)}</span>
                      <span>·</span>
                      <span>좋아요 {post.like_count}</span>
                      <span>·</span>
                      <span>댓글 {post.comment_count}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 size={16} className="text-destructive" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 게시글 페이지네이션 */}
          {postTotal > PAGE_SIZE && (
            <div className="px-6 py-4 border-t border-border flex items-center justify-between text-sm text-muted-foreground">
              <span>총 {postTotal.toLocaleString()}개</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handlePostPage(postSkip - PAGE_SIZE)}
                  disabled={postSkip === 0}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                >
                  이전
                </button>
                <span className="px-3 py-1.5 text-xs">
                  {Math.floor(postSkip / PAGE_SIZE) + 1} / {Math.ceil(postTotal / PAGE_SIZE)}
                </span>
                <button
                  onClick={() => handlePostPage(postSkip + PAGE_SIZE)}
                  disabled={postSkip + PAGE_SIZE >= postTotal}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 문의 관리 탭 ── */}
      {activeTab === "inquiries" && (
        <div className="space-y-4">
          {/* 필터 */}
          <div className="flex gap-2">
            {([
              { value: "",         label: "전체" },
              { value: "pending",  label: "대기 중" },
              { value: "answered", label: "답변 완료" },
            ] as const).map((f) => (
              <button
                key={f.value}
                onClick={() => setInquiryFilter(f.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  inquiryFilter === f.value ? "bg-primary/10 text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border bg-muted/30">
              <h3 className="font-bold">문의 목록</h3>
            </div>
            {loadingInquiries ? (
              <div className="p-8 text-center text-muted-foreground text-base">불러오는 중</div>
            ) : inquiries.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-base">문의 내역이 없습니다.</div>
            ) : (
              <div className="divide-y divide-border">
                {inquiries.map((inq) => {
                  const isExpanded = expandedInquiry === inq.id;
                  const statusBadge =
                    inq.status === "pending"
                      ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 border border-amber-500/20">대기 중</span>
                      : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 border border-green-500/20">답변 완료</span>;

                  return (
                    <div key={inq.id} className="px-6 py-4">
                      {/* 헤더 행 */}
                      <div
                        className="flex items-start justify-between gap-4 cursor-pointer"
                        onClick={() => setExpandedInquiry(isExpanded ? null : inq.id)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {statusBadge}
                            <span className="font-medium truncate">{inq.subject}</span>
                          </div>
                          <div className="text-sm text-muted-foreground space-x-2">
                            <span>{inq.nickname}</span>
                            <span>·</span>
                            <span>{inq.email}</span>
                            <span>·</span>
                            <span>{formatDate(inq.created_at)}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-muted-foreground">
                          <ChevronDown size={16} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </div>

                      {/* 펼쳐진 상세 */}
                      {isExpanded && (
                        <div className="mt-4 space-y-3">
                          {/* 문의 내용 */}
                          <div className="p-4 bg-muted/30 rounded-xl text-sm whitespace-pre-wrap">
                            {inq.content}
                          </div>

                          {/* 액션 영역 */}
                          {inq.status === "pending" && (
                            <div className="flex justify-end">
                              <button
                                onClick={() => handleReply(inq.id)}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-3xl text-sm font-bold text-primary-foreground bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)] hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)] shadow-sm transition-all duration-300"
                              >
                                <CheckCircle size={14} /> 답변 완료
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 문의 페이지네이션 */}
          {inquiryTotal > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>총 {inquiryTotal.toLocaleString()}건</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handleInquiryPage(inquirySkip - PAGE_SIZE)}
                  disabled={inquirySkip === 0}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                >
                  이전
                </button>
                <span className="px-3 py-1.5 text-xs">
                  {Math.floor(inquirySkip / PAGE_SIZE) + 1} / {Math.ceil(inquiryTotal / PAGE_SIZE)}
                </span>
                <button
                  onClick={() => handleInquiryPage(inquirySkip + PAGE_SIZE)}
                  disabled={inquirySkip + PAGE_SIZE >= inquiryTotal}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-muted disabled:opacity-40 transition-colors text-xs"
                >
                  다음
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 공지 작성 모달 ── */}
      {showNoticeModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center pt-18 justify-center p-4" onClick={() => setShowNoticeModal(false)}>
          <div className="bg-card rounded-3xl w-full max-w-2xl shadow-2xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4">
              <h2 className="font-bold text-lg">새 공지 작성</h2>
              <button onClick={() => setShowNoticeModal(false)} className="p-1.5 rounded-full hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">제목</label>
                <input
                  type="text"
                  value={noticeForm.title}
                  onChange={(e) => setNoticeForm({ ...noticeForm, title: e.target.value })}
                  placeholder="공지 제목을 입력하세요"
                  className="w-full px-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">내용</label>
                <textarea
                  value={noticeForm.content}
                  onChange={(e) => setNoticeForm({ ...noticeForm, content: e.target.value })}
                  placeholder="공지 내용을 입력하세요"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={8}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-2">
              <button onClick={() => setShowNoticeModal(false)} className="flex-1 py-2.5 rounded-xl border border-border font-semibold hover:bg-muted">취소</button>
              <button onClick={handleCreateNotice} className="flex-1 py-2.5 rounded-3xl font-bold text-primary-foreground bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)] hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)] shadow-sm transition-all duration-300">공지 등록</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 공지 수정 모달 ── */}
      {editingNotice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setEditingNotice(null)}>
          <div className="bg-card rounded-3xl w-full max-w-2xl shadow-2xl border border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="font-bold text-lg">공지 수정</h2>
              <button onClick={() => setEditingNotice(null)} className="p-1.5 rounded-full hover:bg-muted"><X size={18} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-semibold mb-2 block">제목</label>
                <input
                  type="text"
                  value={editingNotice.title}
                  onChange={(e) => setEditingNotice({ ...editingNotice, title: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-2 block">내용</label>
                <textarea
                  value={editingNotice.content}
                  onChange={(e) => setEditingNotice({ ...editingNotice, content: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  rows={8}
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-2">
              <button onClick={() => setEditingNotice(null)} className="flex-1 py-2.5 rounded-xl border border-border font-semibold hover:bg-muted">취소</button>
              <button onClick={handleUpdateNotice} className="flex-1 py-2.5 rounded-3xl font-bold text-primary-foreground bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-100)_100%)] hover:bg-[radial-gradient(ellipse_at_center,var(--sage-50)_0%,var(--sage-200)_100%)] shadow-sm transition-all duration-300">수정 완료</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
