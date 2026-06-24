import { useState, useEffect, useCallback, useRef } from "react";
import { useBodyScrollLock } from "../hooks/useBodyScrollLock";
import type { ChangeEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { useNavigate, useParams } from "react-router";
import {
  Heart, MessageCircle, Plus, X, Send, MoreVertical,
  Flag, Edit3, Trash2, ThumbsUp, Clock, MessageCircleHeart, ChevronDown, NotebookPen, ImagePlus,
  ChevronLeft, ChevronRight, AlertTriangle, Check,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { ApiError } from "../api/client";
import {
  listCategoriesApi,
  listPostsApi,
  createPostApi,
  uploadPostImageApi,
  updatePostApi,
  deletePostApi,
  deletePostImageApi,
  getPostApi,
  toggleLikeApi,
  listCommentsApi,
  createCommentApi,
  deleteCommentApi,
  reportPostApi,
  reportCommentApi,
} from "../api/community";
import type { CommunityCategory, CommunityPost, CommunityComment } from "../api/community";
import { feedingGuideCards, GUIDE_CATEGORIES } from "../data/feedingGuideCards";
import type { GuideCard } from "../data/feedingGuideCards";

const REPORT_REASONS = [
  { key: "스팸/광고",       desc: "도배, 홍보, 외부 링크 등" },
  { key: "욕설/혐오 발언",  desc: "모욕, 비방, 차별·증오 표현" },
  { key: "음란물/폭력",     desc: "선정적 내용, 폭력·위협" },
  { key: "기타",            desc: "개인정보 노출, 사칭, 허위사실 등" },
] as const;

const CATEGORY_ALL = "전체";
const INFO_CATEGORY_NAME = "정보 나눔";
const NOTICE_CATEGORY_NAME = "공지사항";
const COMMUNITY_IMAGE_MAX_SIZE_BYTES = 4 * 1024 * 1024;
const POSTS_PER_PAGE = 8;
const READONLY_CATEGORY_NAMES = new Set(["공지사항", "정보 나눔"]);

type CategoryStyle = { active: string; tag: string; card: string };

const CATEGORY_STYLE_MAP: Record<string, CategoryStyle> = {
  "공지사항": {
    active: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm",
    tag: "bg-white/70 text-[#B0462C]",
    card: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFEEE8_100%)]",
  },
  "정보 나눔": {
    active: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm",
    tag: "bg-white/70 text-[#256FA1]",
    card: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#EBF7FF_100%)]",
  },
  "레시피 나눔": {
    active: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm",
    tag: "bg-white/70 text-[#918027]",
    card: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFAE3_100%)]",
  },
  "육아 꿀팁": {
    active: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm",
    tag: "bg-white/70 text-[#329666]",
    card: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#EBFFF5_100%)]",
  },
  "궁금해요": {
    active: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm",
    tag: "bg-white/70 text-[#4B2994]",
    card: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#F6F2FF_100%)]",
  },
  "일상 나눔": {
    active: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm",
    tag: "bg-white/70 text-[#8C224B]",
    card: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFF2F7_100%)]",
  },
};

// 맵에 없는 카테고리(예: "전체") 기본 스타일
const DEFAULT_STYLE: CategoryStyle = {
  active: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground border-primary/50 shadow-sm",
  tag: "bg-[radial-gradient(ellipse_at_center,#FEF5CC_0%,#FFEFAB_100%)] text-[#3A3760]",
  card: "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)]",
};

const getCategoryStyle = (name: string): CategoryStyle =>
  CATEGORY_STYLE_MAP[name] ?? DEFAULT_STYLE;

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export default function Community() {
  const isApp = Capacitor.isNativePlatform();
  const postsPerPage = isApp ? 10 : POSTS_PER_PAGE;
  const { user, token } = useApp();
  const { postId } = useParams();
  const navigate = useNavigate();

  // ─── 카테고리 ────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [activeCategory, setActiveCategory] = useState(CATEGORY_ALL);
  const [activeCategoryId, setActiveCategoryId] = useState<string | undefined>(undefined);

  // ─── 게시글 목록 ─────────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchGenRef = useRef(0);
  const selectPostGenRef = useRef(0);
  const editPostGenRef = useRef(0);
  const editingFromPostRef = useRef<CommunityPost | null>(null);
  const [sortBy, setSortBy] = useState<"recent" | "likes">("recent");
  const [page, setPage] = useState(1);

  // ─── 게시글 상세 ─────────────────────────────────────────────────────────────
  const [selectedPost, setSelectedPost] = useState<CommunityPost | null>(null);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // ─── UI 상태 ─────────────────────────────────────────────────────────────────
  const [showWriteModal, setShowWriteModal] = useState(false);
  const [editingPost, setEditingPost] = useState<CommunityPost | null>(null);
  const [commentText, setCommentText] = useState("");
  const [showMenuId, setShowMenuId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState<string | null>(null);
  const [showCommentReportModal, setShowCommentReportModal] = useState<string | null>(null);
  const [selectedReportReason, setSelectedReportReason] = useState<string>("");
  const [customReportText, setCustomReportText] = useState("");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [newPost, setNewPost] = useState({ category: "", title: "", content: "", is_anonymous: false });
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [selectedImagePreviews, setSelectedImagePreviews] = useState<string[]>([]);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postImageError, setPostImageError] = useState("");
  const [postTitleError, setPostTitleError] = useState("");
  const [postContentError, setPostContentError] = useState("");
  const [editTitleError, setEditTitleError] = useState("");
  const [editContentError, setEditContentError] = useState("");
  const [postCreatedWithImageError, setPostCreatedWithImageError] = useState(false);
  const [showEditCategoryDropdown, setShowEditCategoryDropdown] = useState(false);
  const [editImages, setEditImages] = useState<File[]>([]);
  const [editImagePreviews, setEditImagePreviews] = useState<string[]>([]);
  const [editImageError, setEditImageError] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [guideSubCategory, setGuideSubCategory] = useState(GUIDE_CATEGORIES[0]);
  const [selectedGuideCard, setSelectedGuideCard] = useState<GuideCard | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [reportedPostIds, setReportedPostIds] = useState<Set<string>>(new Set());
  const [reportedCommentIds, setReportedCommentIds] = useState<Set<string>>(new Set());

  useBodyScrollLock(!!(selectedGuideCard || selectedPost || showWriteModal || editingPost || lightboxUrl || showReportModal || showCommentReportModal));

  const resetWriteForm = useCallback(() => {
    selectedImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setSelectedImages([]);
    setSelectedImagePreviews([]);
    setPostImageError("");
    setPostTitleError("");
    setPostContentError("");
    setPostCreatedWithImageError(false);
    setNewPost({ category: "", title: "", content: "", is_anonymous: false });
  }, [selectedImagePreviews]);

  const closeWriteModal = () => {
    if (isSubmittingPost) return;
    setShowWriteModal(false);
    setShowCategoryDropdown(false);
    resetWriteForm();
  };

  const closeEditModal = () => {
    if (isSubmittingEdit) return;
    ++editPostGenRef.current;
    editImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    const fromPost = editingFromPostRef.current;
    editingFromPostRef.current = null;
    setEditingPost(null);
    setEditImages([]);
    setEditImagePreviews([]);
    setEditImageError("");
    setEditTitleError("");
    setEditContentError("");
    setShowEditCategoryDropdown(false);
    if (fromPost) setSelectedPost(fromPost);
  };

  const handlePostImagesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    const validFiles = files.filter((file) => file.size <= COMMUNITY_IMAGE_MAX_SIZE_BYTES);
    const nextImages = [...selectedImages, ...validFiles].slice(0, 5);
    selectedImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setSelectedImages(nextImages);
    setSelectedImagePreviews(nextImages.map((file) => URL.createObjectURL(file)));
    if (validFiles.length !== files.length) {
      setPostImageError("이미지는 4MB 이하만 첨부할 수 있습니다.");
    } else if (selectedImages.length + files.length > 5) {
      setPostImageError("이미지는 게시글당 최대 5장까지 첨부할 수 있습니다.");
    } else {
      setPostImageError("");
    }
    event.target.value = "";
  };

  const removePostImage = (index: number) => {
    URL.revokeObjectURL(selectedImagePreviews[index]);
    setSelectedImages((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
    setSelectedImagePreviews((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
    setPostImageError("");
  };

  const handleEditImagesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) =>
      file.type.startsWith("image/"),
    );
    const validFiles = files.filter((file) => file.size <= COMMUNITY_IMAGE_MAX_SIZE_BYTES);
    const nextImages = [...editImages, ...validFiles].slice(0, 5);
    editImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    setEditImages(nextImages);
    setEditImagePreviews(nextImages.map((file) => URL.createObjectURL(file)));
    if (validFiles.length !== files.length) {
      setEditImageError("이미지는 4MB 이하만 첨부할 수 있습니다.");
    } else {
      setEditImageError("");
    }
    event.target.value = "";
  };

  const removeEditImage = (index: number) => {
    URL.revokeObjectURL(editImagePreviews[index]);
    setEditImages((prev) => prev.filter((_, i) => i !== index));
    setEditImagePreviews((prev) => prev.filter((_, i) => i !== index));
    setEditImageError("");
  };

  const removeExistingImage = async (imageId: string) => {
    if (!editingPost || !token || deletingImageId) return;
    setDeletingImageId(imageId);
    try {
      await deletePostImageApi(editingPost.id, imageId, token);
      setEditingPost((prev) =>
        prev ? { ...prev, images: prev.images?.filter((img) => img.id !== imageId) } : prev,
      );
    } catch {
      setEditImageError("이미지 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeletingImageId(null);
    }
  };

  useEffect(() => {
    return () => {
      selectedImagePreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  // ─── 카테고리 로드 ────────────────────────────────────────────────────────────
  useEffect(() => {
    listCategoriesApi(token)
      .then(setCategories)
      .catch(() => { })
      .finally(() => setLoadingCategories(false));
  }, [token]);

  // ─── 게시글 로드 ─────────────────────────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    try {
      const data = await listPostsApi(
        { category_id: activeCategoryId, sort_by: sortBy, limit: 50 },
        token,
      );
      if (gen !== fetchGenRef.current) return;
      setPosts(data);
    } catch {
      if (gen !== fetchGenRef.current) return;
      setPosts([]);
    } finally {
      if (gen !== fetchGenRef.current) return;
      setLoading(false);
    }
  }, [activeCategoryId, sortBy, token]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // ─── 게시글 선택 (댓글 함께 로드) ────────────────────────────────────────────
  const handleSelectPost = (post: CommunityPost, updateRoute = true) => {
    const gen = ++selectPostGenRef.current;
    setSelectedPost(post);
    if (updateRoute) navigate(`/community/posts/${post.id}`);
    setCommentText("");
    setLoadingComments(true);

    // 댓글과 상세 정보를 독립적으로 처리 — 댓글이 먼저 오면 즉시 표시
    listCommentsApi(post.id, token)
      .then((data) => {
        if (gen !== selectPostGenRef.current) return;
        setComments(data);
      })
      .catch(() => {
        if (gen !== selectPostGenRef.current) return;
        setComments([]);
      })
      .finally(() => {
        if (gen !== selectPostGenRef.current) return;
        setLoadingComments(false);
      });

    getPostApi(post.id, token)
      .then((detail) => {
        if (gen !== selectPostGenRef.current) return;
        setSelectedPost(detail);
      })
      .catch(() => { });
  };

  const closeSelectedPost = () => {
    ++selectPostGenRef.current;
    setSelectedPost(null);
    if (postId) navigate("/community");
  };

  useEffect(() => {
    if (!postId || selectedPost?.id === postId) return;

    const id = postId;
    let cancelled = false;
    async function openPostFromRoute() {
      try {
        const post = await getPostApi(id, token);
        if (!cancelled) handleSelectPost(post, false);
      } catch {
        if (!cancelled) navigate("/community", { replace: true });
      }
    }
    openPostFromRoute();
    return () => {
      cancelled = true;
    };
  }, [postId, selectedPost?.id, token]);

  // ─── 좋아요 토글 ─────────────────────────────────────────────────────────────
  const toggleLike = async (postId: string) => {
    if (!user || !token) return;
    const toggle = (p: CommunityPost) =>
      p.id === postId
        ? { ...p, like_count: p.is_liked ? p.like_count - 1 : p.like_count + 1, is_liked: !p.is_liked }
        : p;
    setPosts((prev) => prev.map(toggle));
    setSelectedPost((prev) => (prev?.id === postId ? toggle(prev) : prev));
    try {
      const result = await toggleLikeApi(postId, token);
      const confirm = (p: CommunityPost) =>
        p.id === postId ? { ...p, like_count: result.like_count, is_liked: result.liked } : p;
      setPosts((prev) => prev.map(confirm));
      setSelectedPost((prev) => (prev?.id === postId ? confirm(prev) : prev));
    } catch {
      setPosts((prev) => prev.map(toggle));
      setSelectedPost((prev) => (prev?.id === postId ? toggle(prev) : prev));
    }
  };

  // ─── 댓글 작성 ───────────────────────────────────────────────────────────────
  const handleAddComment = async () => {
    if (!user || !token || !selectedPost || !commentText.trim()) return;
    const savedText = commentText;
    const tempId = `temp-${Date.now()}`;
    const optimisticComment: CommunityComment = {
      id: tempId,
      post_id: selectedPost.id,
      content: savedText,
      nickname: user.nickname,
      is_mine: true,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: null,
    };
    setComments((prev) => [...prev, optimisticComment]);
    setPosts((prev) =>
      prev.map((p) =>
        p.id === selectedPost.id ? { ...p, comment_count: p.comment_count + 1 } : p,
      ),
    );
    setSelectedPost((prev) => prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev);
    setCommentText("");
    try {
      const newComment = await createCommentApi(selectedPost.id, savedText, token);
      setComments((prev) => prev.map((c) => c.id === tempId ? newComment : c));
    } catch {
      setComments((prev) => prev.filter((c) => c.id !== tempId));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p,
        ),
      );
      setSelectedPost((prev) => prev ? { ...prev, comment_count: Math.max(0, prev.comment_count - 1) } : prev);
      setCommentText(savedText);
    }
  };

  // ─── 댓글 삭제 ───────────────────────────────────────────────────────────────
  const handleDeleteComment = async (commentId: string) => {
    if (!token || !selectedPost) return;
    try {
      await deleteCommentApi(selectedPost.id, commentId, token);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      setPosts((prev) =>
        prev.map((p) =>
          p.id === selectedPost.id ? { ...p, comment_count: Math.max(0, p.comment_count - 1) } : p,
        ),
      );
      setSelectedPost((prev) =>
        prev ? { ...prev, comment_count: Math.max(0, prev.comment_count - 1) } : prev,
      );
    } catch { }
  };

  // ─── 게시글 작성 ─────────────────────────────────────────────────────────────
  const handleCreatePost = async () => {
    if (postCreatedWithImageError) {
  closeWriteModal();
  return;
}
if (!user || !token || isSubmittingPost) return;

if (!newPost.title.trim()) {
  setPostTitleError("제목을 입력하세요.");
  return;
}
if (!newPost.content.trim()) {
  setPostContentError("내용을 입력하세요.");
  return;
}
    const categoryObj = categories.find((c) => c.name === newPost.category);
    if (!categoryObj) return;
    setIsSubmittingPost(true);
    setPostImageError("");
    const imagesToUpload = [...selectedImages];
    try {
      const createdPost = await createPostApi(
        {
          category_id: categoryObj.id,
          title: newPost.title,
          content: newPost.content,
          is_anonymous: newPost.is_anonymous,
          is_notice: categoryObj.is_admin_only,
        },
        token,
      );
      if (!activeCategoryId || activeCategoryId === createdPost.category_id) {
        setPosts((prev) => [createdPost, ...prev]);
      }

      if (imagesToUpload.length > 0) {
        try {
          await Promise.all(imagesToUpload.map((img) => uploadPostImageApi(createdPost.id, img, token)));
          const fresh = await getPostApi(createdPost.id, token);
          setPosts((prev) => prev.map((p) => p.id === fresh.id ? fresh : p));
        } catch (error) {
          setPostImageError(error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.");
          setPostCreatedWithImageError(true);
          return;
        }
      }

      setShowWriteModal(false);
      resetWriteForm();
    } catch (error) {
      setPostImageError(error instanceof Error ? error.message : "게시글 작성 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingPost(false);
    }
  };

  // ─── 게시글 수정 ─────────────────────────────────────────────────────────────
  const handleUpdatePost = async () => {
    if (!editingPost || !token || isSubmittingEdit) return;
    if (!editingPost.title.trim()) {
      setEditTitleError("제목을 입력하세요.");
      return;
    }
    if (!editingPost.content.trim()) {
      setEditContentError("내용을 입력하세요.");
      return;
    }
    setIsSubmittingEdit(true);
    setEditImageError("");
    const postId = editingPost.id;
    try {
      const updated = await updatePostApi(
        postId,
        {
          title: editingPost.title,
          content: editingPost.content,
          category_id: editingPost.category_id,
          is_anonymous: editingPost.is_anonymous,
        },
        token,
      );
      if (editImages.length > 0) {
        await Promise.all(editImages.map((img) => uploadPostImageApi(postId, img, token)));
      }
      // 최신 데이터 조회 후 edit 닫기 + detail 열기를 한 렌더에 배치
      let freshPost = updated;
      try {
        freshPost = await getPostApi(postId, token);
      } catch { }
      editingFromPostRef.current = null;
      ++editPostGenRef.current;
      editImagePreviews.forEach((url) => URL.revokeObjectURL(url));
      setEditingPost(null);
      setEditImages([]);
      setEditImagePreviews([]);
      setEditImageError("");
      setEditTitleError("");
      setEditContentError("");
      setShowEditCategoryDropdown(false);
      setSelectedPost(freshPost);
      setPosts((prev) => prev.map((p) => p.id === freshPost.id ? { ...p, title: freshPost.title, content: freshPost.content, category_id: freshPost.category_id, category_name: freshPost.category_name, is_anonymous: freshPost.is_anonymous, images: freshPost.images } : p));
    } catch (error) {
      setEditImageError(error instanceof Error ? error.message : "게시글 수정 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // ─── 게시글 삭제 ─────────────────────────────────────────────────────────────
  const handleDeletePost = async (postId: string) => {
    if (!token || !window.confirm("정말 삭제하시겠습니까?")) return;
    try {
      await deletePostApi(postId, token);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      if (selectedPost?.id === postId) setSelectedPost(null);
      setShowMenuId(null);
    } catch { }
  };

  // ─── 신고 ────────────────────────────────────────────────────────────────────
  const resetReportForm = () => {
    setSelectedReportReason("");
    setCustomReportText("");
  };

  const getReportReason = () =>
    selectedReportReason === "기타" ? customReportText.trim() : selectedReportReason;

  const handleReport = async (postId: string) => {
    if (!token) return;
    try {
      await reportPostApi(postId, getReportReason(), token);
      setReportedPostIds((prev) => new Set(prev).add(postId));
      alert("신고가 접수되었습니다. 관리자가 검토 후 조치하겠습니다.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReportedPostIds((prev) => new Set(prev).add(postId));
        alert("이미 신고한 게시글입니다.");
      } else {
        alert("신고 처리 중 오류가 발생했습니다.");
      }
    } finally {
      setShowReportModal(null);
      setShowMenuId(null);
      resetReportForm();
    }
  };

  const handleReportComment = async (commentId: string) => {
    if (!token || !selectedPost) return;
    try {
      await reportCommentApi(selectedPost.id, commentId, getReportReason(), token);
      setReportedCommentIds((prev) => new Set(prev).add(commentId));
      alert("신고가 접수되었습니다. 관리자가 검토 후 조치하겠습니다.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setReportedCommentIds((prev) => new Set(prev).add(commentId));
        alert("이미 신고한 댓글입니다.");
      } else {
        alert("신고 처리 중 오류가 발생했습니다.");
      }
    } finally {
      setShowCommentReportModal(null);
      resetReportForm();
    }
  };

  // ─── 카테고리 탭 목록 ─────────────────────────────────────────────────────────
  const categoryTabs = [CATEGORY_ALL, ...categories.map((c) => c.name)];

  // ─── 쓰기 가능한 카테고리 (공지사항 제외) ────────────────────────────────────
  const writableCategories = categories.filter(
    (c) => c.name !== INFO_CATEGORY_NAME && (!c.is_admin_only || user?.isAdmin === true),
  );

  useEffect(() => {
    if (!showMenuId) return;
    const handler = () => setShowMenuId(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [showMenuId]);

  const filteredGuideCards = feedingGuideCards.filter(
    (c) => c.category === guideSubCategory,
  );

  return (

    <div
  className={`max-w-5xl mx-auto ${
    isApp ? "px-3 py-4" : "px-4 sm:px-6 lg:px-8 py-5"
  }`}
  >
      {/* 헤더 */}
      <div className={`mb-6 ${isApp ? "" : "flex flex-wrap items-center justify-between gap-3"}`}>
        <div className={isApp ? "flex items-center justify-between" : ""}>
          <h1
            className={`${isApp ? "text-xl" : "text-2xl"} font-bold flex items-center gap-2`}
            style={{ fontFamily: "'Paperlogic'", fontWeight: 600 }}
          >
            <MessageCircleHeart className="w-5 h-5 sm:w-6 sm:h-6" /> 커뮤니티
          </h1>
          {isApp && user && !READONLY_CATEGORY_NAMES.has(activeCategory) && (
            <button
              onClick={() => {
                setNewPost((prev) => ({ ...prev, category: writableCategories[0]?.name ?? "" }));
                setShowWriteModal(true);
              }}
              className="text-sm px-3 py-1.5 flex items-center gap-2 text-primary-foreground font-bold rounded-full whitespace-nowrap
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
                shadow-sm transition-all duration-300"
            >
              <Plus size={18} /> 게시물 작성하기
            </button>
          )}
          {!isApp && (
            <p className="text-base text-muted-foreground mt-1">부모님들과 소통하고 정보를 나눠요</p>
          )}
        </div>
        {isApp && (
          <p className="text-sm text-muted-foreground mt-1">부모님들과 소통하고 정보를 나눠요</p>
        )}
        {!isApp && user && !READONLY_CATEGORY_NAMES.has(activeCategory) && (
          <button
            onClick={() => {
                setNewPost((prev) => ({ ...prev, category: writableCategories[0]?.name ?? "" }));
                setShowWriteModal(true);
              }}
            className={`${isApp ? "text-sm px-3 py-1.5" : "px-4 py-2"} flex items-center gap-2 from-primary to-accent
            text-primary-foreground font-bold rounded-full whitespace-nowrap
            bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
            hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
            shadow-sm transition-all duration-300`}
          >
            <Plus size={18} /> 게시물 작성하기
          </button>
        )}
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
        {loadingCategories ? (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-9 w-20 rounded-full bg-muted animate-pulse" />
            ))}
          </div>
        ) : categoryTabs.map((cat) => {
          const isActive = activeCategory === cat;
          const activeClass = getCategoryStyle(cat).active;
          return (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                setActiveCategoryId(
                  cat === CATEGORY_ALL ? undefined : categories.find((c) => c.name === cat)?.id,
                );
                setPage(1);
              }}
              className={`whitespace-nowrap px-3.5 py-1.5 rounded-full ${isApp ? "text-sm" : "text-base"} font-semibold transition-all border ${isActive ? activeClass : "border-border hover:bg-primary/30 text-muted-foreground"
                }`}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {activeCategory === INFO_CATEGORY_NAME ? (
        <div>
          {/* 하위 카테고리 보조 탭 (위 커뮤니티 pill과 구분되는 언더라인 텍스트 탭) */}
          <div className="flex gap-5 mb-3 flex-wrap">
            {GUIDE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => { setGuideSubCategory(cat); setPage(1); }}
                className={`whitespace-nowrap text-sm font-medium transition-colors ${
                  guideSubCategory === cat
                    ? "text-[#256FA1] border-[#256FA1]"
                    : "text-muted-foreground border-transparent hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* 카드 세로 목록 + 페이지네이션 */}
          {(() => {
            const totalPages = Math.ceil(filteredGuideCards.length / POSTS_PER_PAGE);
            const paginatedCards = filteredGuideCards.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);
            const GROUP = 5;
            const groupIndex = Math.ceil(page / GROUP);
            const groupStart = (groupIndex - 1) * GROUP + 1;
            const groupEnd = Math.min(groupIndex * GROUP, totalPages);
            const hasPrev = groupStart > 1;
            const hasNext = groupEnd < totalPages;
            return (
              <>
                <div className="space-y-3">
                  {paginatedCards.map((card) => (
                    <div
                      key={card.id}
                      onClick={() => setSelectedGuideCard(card)}
                      className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#EBF7FF_100%)]
                      border border-[#FFCFE7]/50 rounded-2xl p-5 hover:shadow-sm transition-shadow
                      cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/70 text-[#256FA1]">
                          {card.category}
                        </span>
                      </div>
                      <h3 className="font-bold text-base mb-1 leading-snug">{card.title}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-1">{card.summary}</p>
                    </div>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-1 mt-6">
                    <button
                      onClick={() => { setPage(groupStart - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      disabled={!hasPrev}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
                      <button
                        key={p}
                        onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        className={`w-8 h-8 rounded-full text-sm font-semibold transition-all ${
                          p === page
                            ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground"
                            : "text-muted-foreground hover:bg-primary/20"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => { setPage(groupEnd + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      disabled={!hasNext}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : (
      <>
      {/* 정렬 */}
      {activeCategory !== NOTICE_CATEGORY_NAME && (
        <div className="flex justify-end gap-2 mb-4">
          <button
            onClick={() => { setSortBy("recent"); setPage(1); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${sortBy === "recent"
                ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFDEEF_100%)] text-[#3A3760] border-[#FFCFE7]/50 shadow-sm"
                : "border-[#FFCFE7]/50 hover:bg-[#FFCFE7]/30 text-muted-foreground"
              }`}
          >
            <Clock size={14} /> 최신순
          </button>
          <button
            onClick={() => { setSortBy("likes"); setPage(1); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-all border ${sortBy === "likes"
                ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFDEEF_100%)] text-[#3A3760] border-[#FFCFE7]/50 shadow-sm"
                : "border-[#FFCFE7]/50 hover:bg-[#FFCFE7]/30 text-muted-foreground"
              }`}
          >
            <ThumbsUp size={14} /> 좋아요순
          </button>
        </div>
      )}

      {/* 게시글 목록 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/4 mb-3" />
              <div className="h-5 bg-muted rounded w-3/4 mb-2" />
              <div className="h-4 bg-muted rounded w-full" />
            </div>
          ))}
        </div>
      ) : (() => {
        const sortedPosts = activeCategory === CATEGORY_ALL
          ? [...posts].sort((a, b) => (b.is_notice ? 1 : 0) - (a.is_notice ? 1 : 0))
          : posts;
        const totalPages = Math.ceil(sortedPosts.length / postsPerPage);
        const paginatedPosts = sortedPosts.slice((page - 1) * postsPerPage, page * postsPerPage);
        const GROUP = 5;
        const groupIndex = Math.ceil(page / GROUP);
        const groupStart = (groupIndex - 1) * GROUP + 1;
        const groupEnd = Math.min(groupIndex * GROUP, totalPages);
        const hasPrev = groupStart > 1;
        const hasNext = groupEnd < totalPages;
        return (
        <>
        <div className="space-y-3">
          {sortedPosts.length === 0 && (
            <p className="text-center text-muted-foreground py-16 text-sm">
              아직 게시글이 없습니다. 첫 번째 글을 작성해보세요!
            </p>
          )}
          {paginatedPosts.map((post) => (
            <div
              key={post.id}
              className={`${getCategoryStyle(post.category_name).card} border border-[#FFCFE7]/50 rounded-2xl ${isApp ? "px-4 py-2" : "px-4 py-3"} hover:shadow-sm transition-shadow cursor-pointer`}
              onClick={() => handleSelectPost(post)}
            >
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`${isApp ? "text-xs" : "text-sm"} font-medium px-2 py-0.5 rounded-full ${getCategoryStyle(post.category_name).tag}`}
                    >
                      {post.category_name}
                    </span>
                    <span className={`${isApp ? "text-xs" : "text-sm"} font-bold text-muted-foreground`}>{post.nickname}</span>
                    <span className={`${isApp ? "text-xs" : "text-sm"} text-muted-foreground`}>{formatRelativeTime(post.created_at)}</span>
                  </div>
                  <h3 className={`font-bold ${isApp ? "text-sm" : "text-base"} mb-0.5`}>{post.title}</h3>
                  <p className={`${isApp ? "text-xs" : "text-sm"} text-muted-foreground line-clamp-1`}>{post.content}</p>
                  {!!post.images?.length && (
                    <div className="flex gap-1.5 mt-1.5">
                      {post.images.slice(0, 1).map((image) => (
                        <img
                          key={image.id}
                          src={image.sas_url ?? image.image_url}
                          alt="게시글 이미지"
                          className="w-10 h-10 object-cover rounded-lg border border-border bg-muted flex-shrink-0"
                        />
                      ))}
                      {post.images.length > 1 && (
                        <div className="w-8 h-10 rounded-lg flex items-center justify-center text-base text-muted-foreground font-semibold flex-shrink-0">
                          +{post.images.length - 1}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {user && (
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowMenuId(showMenuId === post.id ? null : post.id);
                      }}
                      className="p-1.5 rounded-full hover:bg-white"
                    >
                      <MoreVertical size={16} className="text-muted-foreground" />
                    </button>

                    {showMenuId === post.id && (
                      <div className="absolute right-0 top-8 bg-card border border-border rounded-3xl shadow-lg z-10 py-1 px-1 w-32">
                        {(post.is_mine || user?.isAdmin) && (
                          <>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                setShowMenuId(null);
                                const gen = ++editPostGenRef.current;
                                setEditingPost(post);
                                try {
                                  const detail = await getPostApi(post.id, token);
                                  if (gen === editPostGenRef.current) setEditingPost(detail);
                                } catch { }
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-muted rounded-3xl flex items-center gap-2"
                            >
                              <Edit3 size={14} /> 수정
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeletePost(post.id);
                              }}
                              className="w-full px-4 py-2 text-left text-sm hover:bg-muted rounded-3xl flex items-center gap-2 text-destructive"
                            >
                              <Trash2 size={14} /> 삭제
                            </button>
                          </>
                        )}
                        {!post.is_mine && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!reportedPostIds.has(post.id)) {
                                setShowReportModal(post.id);
                                setShowMenuId(null);
                              }
                            }}
                            disabled={reportedPostIds.has(post.id)}
                            className={`w-full px-4 py-2 text-left text-sm rounded-3xl flex items-center gap-2 ${
                              reportedPostIds.has(post.id)
                                ? "text-muted-foreground cursor-default opacity-50"
                                : "hover:bg-muted text-destructive"
                            }`}
                          >
                            <Flag size={14} /> {reportedPostIds.has(post.id) ? "신고 접수됨" : "신고"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1">
                {!READONLY_CATEGORY_NAMES.has(post.category_name) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLike(post.id);
                    }}
                    className="flex items-center gap-1 text-xs hover:opacity-70 transition-opacity"
                  >
                    <Heart
                      size={14}
                      className={post.is_liked ? "fill-[#FFB7A5] text-[#FFB7A5]" : "text-muted-foreground"}
                    />
                    <span className="text-xs font-normal text-muted-foreground">{post.like_count}</span>
                  </button>
                )}
                {!READONLY_CATEGORY_NAMES.has(post.category_name) && (
                  <div className="flex items-center gap-1 text-xs">
                    <MessageCircle size={14} className="text-muted-foreground" />
                    <span className="text-xs font-normal text-muted-foreground">{post.comment_count}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 mt-6">
            <button
              onClick={() => { setPage(groupStart - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={!hasPrev}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: groupEnd - groupStart + 1 }, (_, i) => groupStart + i).map((p) => (
              <button
                key={p}
                onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className={`w-8 h-8 rounded-full text-sm font-semibold transition-all ${
                  p === page
                    ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FEF5CC_50%,#FFEFAB_100%)] text-primary-foreground"
                    : "text-muted-foreground hover:bg-primary/20"
                }`}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => { setPage(groupEnd + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              disabled={!hasNext}
              className="w-8 h-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        </>
        );
      })()}
      </>
      )}

      {/* ── 가이드 카드 상세 모달 ── */}
      {selectedGuideCard && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center pt-16 justify-center"
          onClick={() => setSelectedGuideCard(null)}
        >
          <div
            className="bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#EBF7FF_100%)] border border-border rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden max-h-[calc(100vh-7rem)] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div
  className={`flex items-center justify-between ${
    isApp ? "px-4 py-3" : "px-6 py-4"
  }`}
>
              <span className="text-sm font-medium px-2.5 py-1 rounded-full bg-white/70 text-[#256FA1]">
                {selectedGuideCard.category}
              </span>
              <button
                onClick={() => setSelectedGuideCard(null)}
                className="p-1.5 rounded-full hover:bg-[#C3E3FA]"
              >
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>
            <div className={`flex-1 overflow-y-auto ${isApp ? "py-3 px-4" : "py-4 px-7"}`}>
              <h2 className="text-xl font-bold mb-3 break-words">{selectedGuideCard.title}</h2>
              <div className="space-y-3 mb-5">
                {selectedGuideCard.content.map((para, i) => (
                  <p key={i} className="text-base text-foreground leading-relaxed">{para}</p>
                ))}
              </div>
              {selectedGuideCard.checklist.length > 0 && (
                <div className="mb-5">
                  <h3 className="font-bold text-sm mb-2 flex items-center gap-1.5">
                    <Check size={14} className="text-[#329666]" /> 체크 포인트
                  </h3>
                  <ul className="space-y-1.5">
                    {selectedGuideCard.checklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 text-[#329666] font-bold flex-shrink-0">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedGuideCard.caution && (
                <div className="mb-5 p-3 bg-[#FFF5F5] border border-[#FFD0D0] rounded-xl flex items-start gap-2">
                  <AlertTriangle size={15} className="text-[#E05050] flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-[#B03030]">{selectedGuideCard.caution}</p>
                </div>
              )}
              {selectedGuideCard.sources.length > 0 && (
                <div className="pb-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-0.5">출처</p>
                  <p className="text-xs text-muted-foreground">{selectedGuideCard.sources.join(", ")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 게시글 상세 모달 ── */}
      {selectedPost && !editingPost && (
        <div
          className={`fixed inset-0 bg-black/50 z-[9998] flex items-center ${isApp ? "py-4 px-4" : "pt-20 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"} justify-center`}
          onClick={closeSelectedPost}
        >
          <div
            className={`bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)]
            border border-border shadow-2xl flex flex-col rounded-3xl w-full max-w-2xl
            ${isApp ? "max-h-[calc(100vh-160px)]" : "max-h-[calc(100dvh-7rem)]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
  className={`flex items-center justify-between ${
    isApp ? "px-4 py-3" : "px-6 py-4"
  }`}
>
              <span
                className={`text-sm font-medium px-2.5 py-1 rounded-full ${getCategoryStyle(selectedPost.category_name).tag}`}
              >
                {selectedPost.category_name}
              </span>
              <div className="flex items-center gap-1">
                {(selectedPost.is_mine || user?.isAdmin) && (
                  <>
                    <button
                      onClick={async () => {
                        const gen = ++editPostGenRef.current;
                        editingFromPostRef.current = selectedPost;
                        setEditingPost(selectedPost);
                        setSelectedPost(null);
                        try {
                          const detail = await getPostApi(selectedPost.id, token);
                          if (gen === editPostGenRef.current) setEditingPost(detail);
                        } catch { }
                      }}
                      className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"
                    >
                      <Edit3 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeletePost(selectedPost.id)}
                      className="p-1.5 rounded-full hover:bg-muted text-muted-foreground"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                <button onClick={closeSelectedPost} className="p-1.5 rounded-full hover:bg-muted">
                  <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                </button>
              </div>
            </div>

            <div
              className={`flex-1 min-h-0 overflow-y-auto py-1 ${isApp ? "px-4" : "px-7"}`}
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="mb-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`${isApp ? "text-xs" : "text-sm"} font-bold text-muted-foreground`}>{selectedPost.nickname}</span>
                  <span className={`${isApp ? "text-xs" : "text-sm"} text-muted-foreground`}>{formatRelativeTime(selectedPost.created_at)}</span>
                </div>
                <h2 className={`${isApp ? "text-lg" : "text-xl"} font-bold mb-1 break-words`}>{selectedPost.title}</h2>
                <p className={`${isApp ? "text-sm" : "text-base"} font-semibold text-foreground leading-relaxed whitespace-pre-wrap break-words`}>{selectedPost.content}</p>
                {!!selectedPost.images?.length && (
                  <div className={`${isApp ? "grid grid-cols-3" : "grid grid-cols-4"} gap-2 mt-4`}>
                    {selectedPost.images.map((image) => (
                      <img
                        key={image.id}
                        src={image.sas_url ?? image.image_url}
                        alt="게시글 이미지"
                        onClick={() => setLightboxUrl(image.sas_url ?? image.image_url)}
                        className="w-full aspect-square object-cover rounded-xl border border-border bg-muted cursor-pointer hover:opacity-90 transition-opacity"
                      />
                    ))}
                  </div>
                )}

              </div>

              <div className="flex items-center gap-4 py-1">
                {!READONLY_CATEGORY_NAMES.has(selectedPost.category_name) && (
                  <button
                    onClick={() => toggleLike(selectedPost.id)}
                    className="flex items-center gap-2 hover:opacity-70 transition-opacity"
                  >
                    <Heart
                      size={18}
                      className={selectedPost.is_liked ? "fill-[#FFB7A5] text-[#FFB7A5]" : "text-muted-foreground"}
                    />
                    <span className="text-sm font-semibold text-muted-foreground">{selectedPost.like_count}</span>
                  </button>
                )}

                {!READONLY_CATEGORY_NAMES.has(selectedPost.category_name) && (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-muted-foreground" />
                    <span className="text-sm font-semibold text-muted-foreground">{comments.length}</span>
                  </div>
                )}
              </div>

              {/* 댓글 목록 */}
              {!READONLY_CATEGORY_NAMES.has(selectedPost.category_name) && (
              <div className="mt-2 mb-2">
                <h3 className="font-bold text-sm mb-2">댓글</h3>
                {loadingComments ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div key={i} className="p-3 bg-muted/50 rounded-xl animate-pulse">
                        <div className="h-3 bg-muted rounded w-1/4 mb-2" />
                        <div className="h-3 bg-muted rounded w-3/4" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {comments.map((comment) => (
                      <div key={comment.id} className="p-3 bg-[#FFFCF5] rounded-xl">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{comment.nickname}</span>
                            <span className="text-sm text-muted-foreground">{formatRelativeTime(comment.created_at)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {user && !comment.is_mine && (
                              <button
                                onClick={() => {
                                  if (!reportedCommentIds.has(comment.id)) {
                                    setShowCommentReportModal(comment.id);
                                  }
                                }}
                                disabled={reportedCommentIds.has(comment.id)}
                                className={`text-sm ${
                                  reportedCommentIds.has(comment.id)
                                    ? "text-muted-foreground cursor-default opacity-50"
                                    : "text-muted-foreground hover:text-destructive"
                                }`}
                              >
                                {reportedCommentIds.has(comment.id) ? "신고 접수됨" : "신고"}
                              </button>
                            )}
                            {(comment.is_mine || user?.isAdmin) && (
                              <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-sm text-muted-foreground hover:text-destructive"
                              >
                                삭제
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-sm font-normal">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              )}
            </div>

            {user && !READONLY_CATEGORY_NAMES.has(selectedPost.category_name) && (
              <div className={`${isApp ? "px-3 py-3" : "p-4"} rounded-br-xl rounded-bl-xl border-t border-border bg-[#EBF7FF]`}>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddComment()}
                    placeholder="댓글을 입력하세요..."
                    className={`flex-1 ${isApp ? "px-3 py-2.5 text-sm" : "px-4 py-2 text-sm"} rounded-xl border border-[#C9E9FF] bg-background focus:outline-none focus:ring-2 focus:ring-[#D4EEFF] font-normal`}
                  />
                  <button
                    onClick={handleAddComment}
                    className={`${isApp ? "px-3 py-1.5" : "px-4 py-2"} bg-[radial-gradient(ellipse_at_center,#B3DAF5_0%,#EBF7FF_100%)] text-muted-foreground rounded-3xl font-semibold hover:bg-[radial-gradient(ellipse_at_center,#B3DAF5_0%,#D9F1FF_100%)] flex items-center gap-2 shadow-sm`}
                  >
                    <Send className={isApp ? "w-3 h-3" : "w-3.5 h-3.5 sm:w-4 sm:h-4"} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 글쓰기 모달 ── */}
      {showWriteModal && (
        <div
          className={`fixed inset-0 bg-black/50 z-[10000] flex items-center ${isApp ? "py-4 px-4" : "pt-20 p-4"} justify-center`}
          onClick={closeWriteModal}
        >
          <div
            className={`bg-card rounded-3xl w-full max-w-2xl shadow-2xl border border-border overflow-hidden flex flex-col ${isApp ? "max-h-[calc(100dvh-2rem)]" : "max-h-[80vh]"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between ${isApp ? "px-4 py-3" : "px-6 py-4"} -mb-2`}>
              <h2 className="font-bold text-base flex items-center gap-2">
                <NotebookPen className="w-4 h-4 sm:w-5 sm:h-5" /> 게시물 작성하기
              </h2>
              <button onClick={closeWriteModal} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            <div className={`${isApp ? "p-4" : "p-6"} space-y-2 overflow-y-auto flex-1 [&::-webkit-scrollbar-track]:my-4`}>
              <div>
                <label className="text-sm font-semibold mb-2 block">카테고리</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowCategoryDropdown((prev) => !prev)}
                    className="w-full px-4 py-1.5 rounded-3xl border border-border bg-card text-base text-left focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] font-semibold"
                  >
                    {newPost.category || "카테고리 선택"}
                  </button>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  {showCategoryDropdown && (
                    <div className="absolute z-10 mt-1 w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
                      {writableCategories.map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => { setNewPost({ ...newPost, category: cat.name }); setShowCategoryDropdown(false); }}
                          className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 font-semibold ${newPost.category === cat.name ? "bg-primary/10" : ""}`}
                        >
                          {cat.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={postTitleError ? "pb-2" : ""}>
                <label className="text-sm font-semibold mb-2 block">제목</label>
                <input
                  type="text"
                  value={newPost.title}
                  onChange={(e) => { setNewPost({ ...newPost, title: e.target.value }); if (postTitleError) setPostTitleError(""); }}
                  placeholder="제목을 입력하세요"
                  maxLength={50}
                  className={`text-base w-full px-4 py-2 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] ${postTitleError ? "border-destructive" : "border-border"}`}
                />
                <div className="flex items-center justify-between mt-1">
                  {postTitleError ? (
                    <p className="text-xs text-destructive">{postTitleError}</p>
                  ) : (
                    <span />
                  )}
                  <p className="text-xs text-muted-foreground">{newPost.title.length}/50</p>
                </div>
              </div>

              <div className={postContentError ? "pb-2" : ""}>
                <label className="text-sm font-semibold mb-2 -mt-2 block">내용</label>
                <textarea
                  value={newPost.content}
                  onChange={(e) => { setNewPost({ ...newPost, content: e.target.value }); if (postContentError) setPostContentError(""); }}
                  placeholder="내용을 입력하세요"
                  maxLength={1000}
                  className={`text-base w-full px-4 py-2 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] resize-none ${postContentError ? "border-destructive" : "border-border"}`}
                  rows={4}
                />
                <div className="flex items-center justify-between">
                  {postContentError ? (
                    <p className="text-xs text-destructive">{postContentError}</p>
                  ) : (
                    <span />
                  )}
                  <p className="text-xs text-muted-foreground">{newPost.content.length}/1000</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className={`flex items-center justify-center whitespace-nowrap shrink-0 ${isApp ? "gap-1 px-2 py-1 text-xs" : "gap-2 w-auto sm:w-1/5 px-4 py-2 text-sm"} rounded-3xl border border-dashed border-border bg-muted cursor-pointer hover:bg-muted/70 font-semibold`}>
                  <ImagePlus className="w-4 h-4 shrink-0" />
                  <span>이미지 추가</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handlePostImagesChange}
                    disabled={selectedImages.length >= 5 || isSubmittingPost}
                  />
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newPost.is_anonymous}
                    onChange={(e) => setNewPost({ ...newPost, is_anonymous: e.target.checked })}
                    className="accent-primary rounded"
                  />
                  <span className="text-sm text-muted-foreground">익명으로 작성</span>
                </label>
              </div>

              {selectedImagePreviews.length > 0 && (
                <div className={`${isApp ? "grid grid-cols-3" : "grid grid-cols-5"} gap-2 mt-3`}>
                  {selectedImagePreviews.map((preview, index) => (
                    <div key={preview} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                      <img src={preview} alt="선택한 이미지" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePostImage(index)}
                        className="absolute right-1 top-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/75"
                        disabled={isSubmittingPost}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {postImageError && (
                <p className="mt-2 text-sm text-destructive">{postImageError}</p>
              )}
            </div>

            <div className={`${isApp ? "px-4 py-2" : "px-6 py-4"} border-t border-border flex gap-2`}>
              <button
                onClick={closeWriteModal}
                className={`flex-1 ${isApp ? "py-1.5 text-sm" : "py-2.5"} rounded-xl border border-border font-semibold hover:bg-[#EBF7FF]`}
              >
                취소
              </button>
              <button
                onClick={handleCreatePost}
                disabled={isSubmittingPost}
                className={`flex-1 ${isApp ? "py-1.5 text-sm" : "py-2.5"} rounded-xl text-primary-foreground font-bold disabled:opacity-60 bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)] hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)] shadow-sm transition-all duration-300`}
              >
                {isSubmittingPost ? "업로드 중" : postCreatedWithImageError ? "확인" : "작성하기"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 수정 모달 ── */}
      {editingPost && (
        <div
          className={`fixed inset-0 bg-black/50 flex items-center justify-center ${
            isApp ? "z-[10000] py-20 px-4" : "z-50 pt-20 p-4"
          }`}
          onClick={closeEditModal}
        >
          <div
            className={`rounded-3xl w-full max-w-2xl shadow-2xl border border-border overflow-hidden flex flex-col ${
              isApp
                ? "bg-[radial-gradient(ellipse_at_center,#FFFAF0_0%,#FFFBE8_100%)] max-h-[calc(100vh-160px)]"
                : "bg-card max-h-[80vh]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div
  className={`flex items-center justify-between ${
    isApp ? "px-4 py-3" : "px-6 py-4"
  } -mb-2`}
>
              <h2 className="font-bold text-base flex items-center gap-2">
                <NotebookPen className="w-4 h-4 sm:w-5 sm:h-5" /> 게시물 수정하기</h2>
              <button onClick={closeEditModal} className="p-1.5 rounded-full hover:bg-muted">
                <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
              </button>
            </div>

            <div className={`${isApp ? "p-4" : "p-6"} space-y-2 overflow-y-auto flex-1`}>
              <div>
                <label className="text-sm font-semibold mb-2 block">카테고리</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEditCategoryDropdown((prev) => !prev)}
                    className="w-full px-4 py-1.5 rounded-3xl border border-border bg-card
                    text-base text-left focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] font-semibold"
                  >
                    {editingPost.category_name}
                  </button>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  {showEditCategoryDropdown && (
                    <div className="absolute z-10 mt-1 w-full rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
                      {writableCategories.map((cat) => (
                        <div
                          key={cat.id}
                          onClick={() => {
                            setEditingPost({ ...editingPost, category_name: cat.name, category_id: cat.id });
                            setShowEditCategoryDropdown(false);
                          }}
                          className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 font-semibold ${editingPost.category_name === cat.name ? "bg-primary/10" : ""}`}
                        >
                          {cat.name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className={editTitleError ? "pb-2" : ""}>
                <label className="text-sm font-semibold mb-2 block">제목</label>
                <input
                  type="text"
                  value={editingPost.title}
                  onChange={(e) => { setEditingPost({ ...editingPost, title: e.target.value }); if (editTitleError) setEditTitleError(""); }}
                  maxLength={50}
                  className={`text-base w-full px-4 py-2 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] ${editTitleError ? "border-destructive" : "border-border"}`}
                />
                <div className="flex items-center justify-between mt-1">
                  {editTitleError ? (
                    <p className="text-xs text-destructive">{editTitleError}</p>
                  ) : (
                    <span />
                  )}
                  <p className="text-xs text-muted-foreground">{editingPost.title.length}/50</p>
                </div>
              </div>

              <div className={editContentError ? "pb-2" : ""}>
                <label className="text-sm font-semibold mb-2 -mt-2 block">내용</label>
                <textarea
                  value={editingPost.content}
                  onChange={(e) => { setEditingPost({ ...editingPost, content: e.target.value }); if (editContentError) setEditContentError(""); }}
                  maxLength={1000}
                  className={`text-base w-full px-4 py-2 rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-[#FFF5D4] resize-none ${editContentError ? "border-destructive" : "border-border"}`}
                  rows={4}
                />
                <div className="flex items-center justify-between">
                  {editContentError ? (
                    <p className="text-xs text-destructive">{editContentError}</p>
                  ) : (
                    <span />
                  )}
                  <p className="text-xs text-muted-foreground">{editingPost.content.length}/1000</p>
                </div>
              </div>

              <div className="flex items-start justify-between">
                <label className="flex items-center justify-center whitespace-nowrap shrink-0 gap-2 w-auto sm:w-1/5 px-4 py-2 rounded-3xl
                  border border-dashed border-border bg-muted cursor-pointer hover:bg-muted/70 text-sm font-semibold">
                  <ImagePlus className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
                  <span>이미지 추가</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={handleEditImagesChange}
                    disabled={editImages.length >= 5 || isSubmittingEdit}
                  />
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPost.is_anonymous}
                    onChange={(e) => setEditingPost({ ...editingPost, is_anonymous: e.target.checked })}
                    className="accent-primary rounded"
                  />
                  <span className="text-sm text-muted-foreground">익명으로 작성</span>
                </label>
              </div>

              {(!!(editingPost.images?.length) || editImagePreviews.length > 0) && (
                <div className={`${isApp ? "grid grid-cols-3" : "grid grid-cols-5"} gap-2`}>
                  {editingPost.images?.map((image) => (
                    <div key={image.id} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                      <img src={image.sas_url ?? image.image_url} alt="기존 이미지" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(image.id)}
                        disabled={deletingImageId === image.id || isSubmittingEdit}
                        className="absolute right-1 top-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/75 disabled:opacity-50"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  {editImagePreviews.map((preview, index) => (
                    <div key={preview} className="relative aspect-square rounded-xl overflow-hidden border border-border bg-muted">
                      <img src={preview} alt="선택한 이미지" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeEditImage(index)}
                        className="absolute right-1 top-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/75"
                        disabled={isSubmittingEdit}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {editImageError && (
                <p className="mt-2 text-sm text-destructive">{editImageError}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border flex gap-2">
              <button
                onClick={closeEditModal}
                className="flex-1 py-2.5 rounded-xl border border-border font-semibold hover:bg-[#EBF7FF]"
              >
                취소
              </button>
              <button
                onClick={handleUpdatePost}
                disabled={isSubmittingEdit}
                className="flex-1 py-2.5 rounded-xl text-primary-foreground font-bold disabled:opacity-60
                bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#C7E9FF_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#EBF7FF_0%,#B8E2FF_100%)]
                shadow-sm transition-all duration-300"
              >
                {isSubmittingEdit ? "업로드 중" : "수정 완료"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이미지 라이트박스 ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 bg-black/50 z-[10001] flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80"
            >
              <X className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
            </button>
            <img
              src={lightboxUrl}
              alt="확대 이미지"
              className="max-w-full max-h-[50vh] object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* ── 게시글 신고 모달 ── */}
      {showReportModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[60] flex items-center pt-16 justify-center"
          onClick={() => { setShowReportModal(null); resetReportForm(); }}
        >
          <div
            className="bg-card rounded-3xl w-full max-w-sm shadow-2xl border border-border px-4 py-3 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base">게시글 신고</h3>
            <p className="text-sm text-muted-foreground">신고 사유를 선택해 주세요.</p>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setSelectedReportReason(r.key)}
                  className={`w-full text-left px-4 py-3 rounded-3xl border transition-all ${
                    selectedReportReason === r.key
                      ? "border-destructive/40 bg-destructive/10"
                      : "border-border hover:bg-destructive/5"
                  }`}
                >
                  <div className="text-sm font-semibold">{r.key}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                </button>
              ))}
            </div>
            {selectedReportReason === "기타" && (
              <textarea
                value={customReportText}
                onChange={(e) => setCustomReportText(e.target.value)}
                placeholder="신고 사유를 직접 입력해 주세요"
                maxLength={50}
                className="w-full h-16 px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-destructive/30 resize-none overflow-hidden"
              />
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowReportModal(null); resetReportForm(); }}
                className="flex-1 py-3 rounded-full border border-border text-sm font-semibold
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity"
              >
                취소
              </button>
              <button
                onClick={() => handleReport(showReportModal)}
                disabled={!selectedReportReason || (selectedReportReason === "기타" && !customReportText.trim())}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold
                bg-[radial-gradient(ellipse_at_center,#FFD9C9_0%,#FFC2B0_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity disabled:opacity-40"
              >
                신고하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 댓글 신고 모달 ── */}
      {showCommentReportModal && (
        <div
          className="fixed inset-0 bg-black/50 z-[70] flex items-center pt-16 justify-center"
          onClick={() => { setShowCommentReportModal(null); resetReportForm(); }}
        >
          <div
            className="bg-card rounded-3xl w-full max-w-sm shadow-2xl border border-border px-4 py-3 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-base">댓글 신고</h3>
            <p className="text-sm text-muted-foreground">신고 사유를 선택해 주세요.</p>
            <div className="space-y-2">
              {REPORT_REASONS.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setSelectedReportReason(r.key)}
                  className={`w-full text-left px-4 py-3 rounded-3xl border transition-all ${
                    selectedReportReason === r.key
                      ? "border-destructive/40 bg-destructive/10"
                      : "border-border hover:bg-destructive/5"
                  }`}
                >
                  <div className="text-sm font-semibold">{r.key}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
                </button>
              ))}
            </div>
            {selectedReportReason === "기타" && (
              <textarea
                value={customReportText}
                onChange={(e) => setCustomReportText(e.target.value)}
                placeholder="신고 사유를 직접 입력해 주세요 (최대 50자) "
                maxLength={50}
                className="w-full h-16 px-3 py-2 text-sm rounded-xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-destructive/30 resize-none overflow-hidden"
              />
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { setShowCommentReportModal(null); resetReportForm(); }}
                className="flex-1 py-3 rounded-full border border-border text-sm font-semibold
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity"
              >
                취소
              </button>
              <button
                onClick={() => handleReportComment(showCommentReportModal)}
                disabled={!selectedReportReason || (selectedReportReason === "기타" && !customReportText.trim())}
                className="flex-1 py-3 rounded-full text-primary-foreground text-sm font-bold
                bg-[radial-gradient(ellipse_at_center,#FFD9C9_0%,#FFC2B0_100%)]
                hover:bg-[radial-gradient(ellipse_at_center,#FFEEE8_0%,#FFDCD1_100%)] transition-opacity disabled:opacity-40"
              >
                신고하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
