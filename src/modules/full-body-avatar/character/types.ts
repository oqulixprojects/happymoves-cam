
export type OutfitTheme = 'teal' | 'blue' | 'purple' | 'coral';

export interface OutfitColors {
  name: string;
  primary: string;
  primaryDark: string;
  primaryLight: string;
  trim: string;
  pants: string;
  pantsDark: string;
  shoes: string;
  shoesSole: string;
  badge: string;
}

export const OUTFIT_THEMES: Record<OutfitTheme, OutfitColors> = {
  teal: {
    name: 'Clinical Teal',
    primary: '#0d9488',
    primaryDark: '#0f766e',
    primaryLight: '#5eead4',
    trim: '#ccfbf1',
    pants: '#1e293b',
    pantsDark: '#0f172a',
    shoes: '#ffffff',
    shoesSole: '#0d9488',
    badge: '#10b981',
  },
  blue: {
    name: 'Royal Rehab',
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primaryLight: '#93c5fd',
    trim: '#eff6ff',
    pants: '#1e293b',
    pantsDark: '#0f172a',
    shoes: '#ffffff',
    shoesSole: '#2563eb',
    badge: '#3b82f6',
  },
  purple: {
    name: 'Lavender Wellness',
    primary: '#7c3aed',
    primaryDark: '#6d28d9',
    primaryLight: '#c4b5fd',
    trim: '#f5f3ff',
    pants: '#1e293b',
    pantsDark: '#0f172a',
    shoes: '#ffffff',
    shoesSole: '#7c3aed',
    badge: '#a855f7',
  },
  coral: {
    name: 'Vitality Sunset',
    primary: '#ea580c',
    primaryDark: '#c2410c',
    primaryLight: '#fdba74',
    trim: '#fff7ed',
    pants: '#1e293b',
    pantsDark: '#0f172a',
    shoes: '#ffffff',
    shoesSole: '#ea580c',
    badge: '#f97316',
  },
};

export interface BodyJointAngles {
  leftShoulder: number;
  rightShoulder: number;
  leftElbow: number;
  rightElbow: number;
  leftHip: number;
  rightHip: number;
  leftKnee: number;
  rightKnee: number;
  leftAnkle: number;
  rightAnkle: number;
  spineTilt: number;
  leftHandGrip: number; // 0 (open) to 1 (closed fist)
  rightHandGrip: number;
  leftToeFlexion: number; // -1 (heel raise) to +1 (toe raise)
  rightToeFlexion: number;
  centerOfMass: { x: number; y: number };
}

export interface AvatarRenderOptions {
  theme: OutfitTheme;
  mirror: boolean;
  showSkeleton: boolean;
  showAngles: boolean;
  showFloorGrid: boolean;
  footwear: 'sneakers' | 'barefoot';
}
