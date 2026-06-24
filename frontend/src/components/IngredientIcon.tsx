import { useState, useEffect, type CSSProperties } from 'react';

const CUSTOM_EMOJI: Record<string, string> = {
  '무': 'radish', '연근': 'lotus-root',
  '참깨': 'sesame', '두부': 'tofu',
  '잣': 'pinenut', '대추': 'jujube',
  '단호박': 'kabocha', '호박': 'pumpkin',
  '애호박': 'pumpkin', '늙은호박': 'pumpkin',
  '들깨': 'sesame',
};

type IngredientIconProps = {
  name: string;
  emoji?: string | null;
  size?: number;
  className?: string;
};

const baseBoxStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const boxStyle = (size: number): CSSProperties => ({
  ...baseBoxStyle,
  width: size,
  height: size,
});

const fitImgStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

const FLUENT_ASSET_BASES = [
  'https://cdn.jsdelivr.net/gh/shuding/fluentui-emoji-unicode@main/assets',
  'https://raw.githubusercontent.com/shuding/fluentui-emoji-unicode/main/assets',
];

// Newer ZWJ emoji missing from the Unicode mirror are bundled from Microsoft's
// official Fluent Emoji assets so older Android WebViews do not rely on OS fonts.
const LOCAL_FLUENT_ASSETS: Record<string, string> = {
  '1f344-200d-1f7eb': '/emoji/fluent/brown_mushroom_3d.png',
};

const isImageUrl = (value: string) => /^(https?:\/\/|data:image\/|blob:)/i.test(value);

function getCodePointPath(emoji: string, excludedCodePoints: Set<number>): string {
  return [...emoji]
    .map((char) => char.codePointAt(0)!)
    .filter((codePoint) => !excludedCodePoints.has(codePoint))
    .map((codePoint) => codePoint.toString(16))
    .join('-');
}

function getFluentUrls(emoji: string): string[] {
  const normalizedEmoji = emoji.normalize('NFC');
  const codePointPaths = [
    getCodePointPath(normalizedEmoji, new Set([0xfe0e, 0xfe0f])),
    getCodePointPath(normalizedEmoji, new Set<number>()),
    getCodePointPath(normalizedEmoji, new Set([0x200d, 0xfe0e, 0xfe0f])),
  ];
  const assetNames = [
    ...codePointPaths.filter(Boolean).map((path) => `${path}_3d.png`),
    `${encodeURIComponent(normalizedEmoji)}_3d.png`,
  ];

  const localUrls = codePointPaths
    .map((path) => LOCAL_FLUENT_ASSETS[path])
    .filter((url): url is string => Boolean(url));

  return [...new Set([
    ...localUrls,
    ...FLUENT_ASSET_BASES.flatMap((base) => assetNames.map((asset) => `${base}/${asset}`)),
  ])];
}

export function IngredientIcon({ name, emoji, size = 40, className }: IngredientIconProps) {
  const [urlIdx, setUrlIdx] = useState(0);
  const custom = CUSTOM_EMOJI[name];
  const containerStyle = className ? baseBoxStyle : boxStyle(size);

  const emojiIsImageUrl = Boolean(emoji && isImageUrl(emoji));
  const urls = emoji ? (emojiIsImageUrl ? [emoji] : getFluentUrls(emoji)) : [];
  const imgFailed = urlIdx >= urls.length;

  useEffect(() => { setUrlIdx(0); }, [emoji]);

  if (custom) {
    return (
      <span style={containerStyle} className={className}>
        <img src={`/emoji/custom/${custom}.webp`} alt={name} style={fitImgStyle} />
      </span>
    );
  }

  if (emoji) {
    if (imgFailed) {
      return (
        <span
          style={{ ...containerStyle, ...(className ? {} : { fontSize: Math.round(size * 0.8) }) }}
          className={className}
        >
          {emojiIsImageUrl ? '🍽️' : emoji}
        </span>
      );
    }
    return (
      <span style={containerStyle} className={className}>
        <img
          src={urls[urlIdx]}
          alt={name}
          style={fitImgStyle}
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setUrlIdx(i => i + 1)}
        />
      </span>
    );
  }

  return (
    <span style={{ ...containerStyle, fontSize: className ? undefined : Math.round(size * 0.8) }} className={className}>
      🍽️
    </span>
  );
}
