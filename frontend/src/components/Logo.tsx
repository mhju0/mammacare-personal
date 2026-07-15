// Proposed cream/sage brand lockup — a placeholder mark to keep the app on-palette
// after the warm-kr→cream/sage pivot. Not a final designed asset; the old raster
// logos (mamma_6/mamma_9.webp) are kept in src/asset for easy reversal.
// The shield+check echoes the product's "allergy safety" positioning (concept mark).

type LogoProps = {
  /** height of the mark in px; wordmark scales with it */
  size?: number;
  /** show the "맘마케어" wordmark next to the mark */
  wordmark?: boolean;
  className?: string;
};

export default function Logo({ size = 22, wordmark = true, className = "" }: LogoProps) {
  return (
    <span
      className={`inline-flex items-center ${className}`}
      style={{ gap: size * 0.38, lineHeight: 1 }}
      aria-label="맘마케어"
    >
      <svg
        width={size * 1.16}
        height={size * 1.16}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ display: "block", flex: "none" }}
      >
        <rect x="1.5" y="1.5" width="21" height="21" rx="7" fill="var(--warm-brand)" />
        <path
          d="M12 5.8 7.7 7.5v3.1c0 2.6 1.7 4.5 4.3 5.6 2.6-1.1 4.3-3 4.3-5.6V7.5Z"
          fill="none"
          stroke="var(--warm-brand-fg)"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M10 11.4 11.4 12.8 14.2 9.6"
          fill="none"
          stroke="var(--warm-brand-fg)"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {wordmark && (
        <span
          style={{
            fontSize: size * 0.94,
            fontWeight: 700,
            color: "var(--warm-fg)",
            letterSpacing: "-0.02em",
            fontFamily: "'Paperlogic', 'Pretendard', 'Noto Sans KR', sans-serif",
          }}
        >
          맘마케어
        </span>
      )}
    </span>
  );
}
