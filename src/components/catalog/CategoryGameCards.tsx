export interface CategoryCardMeta {
  gradient: string;
  badgeBg: string;
  badgeColor: string;
  accent: string;
  level: string;
  duration: string;
  image: string;
}

export const CATEGORY_CARD_CONFIG: Record<string, CategoryCardMeta> = {
  'shoulder-mobility': {
    gradient: 'linear-gradient(135deg, rgba(13, 148, 136, 0.88) 0%, rgba(17, 94, 89, 0.96) 100%)',
    badgeBg: '#ccfbf1',
    badgeColor: '#0f766e',
    accent: '#2dd4bf',
    level: 'STAGE 1 · REACH',
    duration: '7 Exercises',
    image: '/images/upper-body-patient.jpg',
  },
  'elbow-rehabilitation': {
    gradient: 'linear-gradient(135deg, rgba(2, 132, 199, 0.88) 0%, rgba(3, 105, 161, 0.96) 100%)',
    badgeBg: '#e0f2fe',
    badgeColor: '#0369a1',
    accent: '#38bdf8',
    level: 'STAGE 1 · FLEX',
    duration: '6 Exercises',
    image: '/images/shoulder-reach.jpg',
  },
  'wrist-mobility': {
    gradient: 'linear-gradient(135deg, rgba(79, 70, 229, 0.88) 0%, rgba(55, 48, 163, 0.96) 100%)',
    badgeBg: '#e0e7ff',
    badgeColor: '#4338ca',
    accent: '#818cf8',
    level: 'STAGE 2 · ROTATE',
    duration: '7 Exercises',
    image: '/images/hand-grasp.jpg',
  },
  'hand-gross-motor': {
    gradient: 'linear-gradient(135deg, rgba(8, 145, 178, 0.88) 0%, rgba(21, 94, 117, 0.96) 100%)',
    badgeBg: '#cffafe',
    badgeColor: '#0e7490',
    accent: '#22d3ee',
    level: 'STAGE 2 · GRIP',
    duration: '7 Exercises',
    image: '/images/hand-grasp.jpg',
  },
  'hand-fine-motor': {
    gradient: 'linear-gradient(135deg, rgba(217, 119, 6, 0.88) 0%, rgba(180, 83, 9, 0.96) 100%)',
    badgeBg: '#fef3c7',
    badgeColor: '#92400e',
    accent: '#fbbf24',
    level: 'STAGE 3 · PINCH',
    duration: '8 Exercises',
    image: '/images/hand-grasp.jpg',
  },
  'neck-and-cervical': {
    gradient: 'linear-gradient(135deg, rgba(124, 58, 237, 0.88) 0%, rgba(91, 33, 182, 0.96) 100%)',
    badgeBg: '#ede9fe',
    badgeColor: '#6d28d9',
    accent: '#a78bfa',
    level: 'STAGE 1 · POSTURE',
    duration: '6 Exercises',
    image: '/images/upper-body-patient.jpg',
  },
  'trunk-and-core-control': {
    gradient: 'linear-gradient(135deg, rgba(5, 150, 105, 0.88) 0%, rgba(6, 95, 70, 0.96) 100%)',
    badgeBg: '#d1fae5',
    badgeColor: '#047857',
    accent: '#34d399',
    level: 'STAGE 2 · CORE',
    duration: '6 Exercises',
    image: '/images/upper-body-patient.jpg',
  },
  'hip-mobility': {
    gradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.88) 0%, rgba(30, 64, 175, 0.96) 100%)',
    badgeBg: '#dbeafe',
    badgeColor: '#1d4ed8',
    accent: '#60a5fa',
    level: 'STAGE 1 · STRIDE',
    duration: '8 Exercises',
    image: '/images/lower-body-patient.jpg',
  },
  'knee-mobility-and-control': {
    gradient: 'linear-gradient(135deg, rgba(2, 132, 199, 0.88) 0%, rgba(7, 89, 133, 0.96) 100%)',
    badgeBg: '#e0f2fe',
    badgeColor: '#0284c7',
    accent: '#38bdf8',
    level: 'STAGE 2 · BALANCE',
    duration: '7 Exercises',
    image: '/images/lower-body-patient.jpg',
  },
  'ankle-and-foot-mobility': {
    gradient: 'linear-gradient(135deg, rgba(13, 148, 136, 0.88) 0%, rgba(19, 78, 74, 0.96) 100%)',
    badgeBg: '#ccfbf1',
    badgeColor: '#0f766e',
    accent: '#2dd4bf',
    level: 'STAGE 1 · TAP',
    duration: '8 Exercises',
    image: '/images/lower-body-patient.jpg',
  },
  'weight-shifting-and-balance': {
    gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.88) 0%, rgba(67, 56, 202, 0.96) 100%)',
    badgeBg: '#e0e7ff',
    badgeColor: '#4f46e5',
    accent: '#a5b4fc',
    level: 'LIVE · 2D AVATAR',
    duration: '9 Exercises',
    image: '/images/patient-avatar-tracking.jpg',
  },
  'stepping-and-functional-mobility': {
    gradient: 'linear-gradient(135deg, rgba(234, 88, 12, 0.88) 0%, rgba(194, 65, 12, 0.96) 100%)',
    badgeBg: '#ffedd5',
    badgeColor: '#c2410c',
    accent: '#fb923c',
    level: 'STAGE 3 · STEP',
    duration: '7 Exercises',
    image: '/images/lower-body-patient.jpg',
  },
};

/** Realistic Photo Thumbnail for Categories & Modules */
export function CategoryPhotoThumbnail({
  src,
  alt = 'Rehabilitation exercise thumbnail',
  size = 54,
  className = '',
}: {
  src: string;
  alt?: string;
  size?: number;
  className?: string;
}) {
  return (
    <div
      className={`cat-photo-thumb ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: 14,
        overflow: 'hidden',
        position: 'relative',
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        border: '1.5px solid rgba(255,255,255,0.4)',
      }}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
}
