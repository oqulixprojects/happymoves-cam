import { Sparkles, Eye, Shirt, Compass, Footprints } from 'lucide-react';
import type { AvatarRenderOptions, OutfitTheme } from '../character/types';
import { OUTFIT_THEMES } from '../character/types';
import '../avatar.css';

interface AvatarControlsProps {
  options: AvatarRenderOptions;
  setOptions: React.Dispatch<React.SetStateAction<AvatarRenderOptions>>;
  viewMode: 'avatar' | 'split' | 'pip' | 'fullscreen';
  setViewMode: (v: 'avatar' | 'split' | 'pip' | 'fullscreen') => void;
}

export function AvatarControls({
  options,
  setOptions,
  viewMode,
  setViewMode,
}: AvatarControlsProps) {
  const updateOption = <K extends keyof AvatarRenderOptions>(key: K, value: AvatarRenderOptions[K]) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="avatar-controls-panel">
      {/* 1. View Mode Segmented Switcher */}
      <div className="control-group">
        <label className="control-group__label">
          <Eye size={15} />
          <span>Stage Layout</span>
        </label>
        <div className="mode-segmented-control" role="tablist">
          <button
            type="button"
            className={`mode-segmented-btn ${viewMode === 'avatar' ? 'mode-segmented-btn--active' : ''}`}
            onClick={() => setViewMode('avatar')}
          >
            <span>🧍 Avatar Only</span>
          </button>
          <button
            type="button"
            className={`mode-segmented-btn ${viewMode === 'pip' ? 'mode-segmented-btn--active' : ''}`}
            onClick={() => setViewMode('pip')}
          >
            <span>🖼️ Mini-Cam</span>
          </button>
          <button
            type="button"
            className={`mode-segmented-btn ${viewMode === 'split' ? 'mode-segmented-btn--active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            <span>🔀 Split View</span>
          </button>
        </div>
      </div>

      {/* 2. Outfit Theme Picker */}
      <div className="control-group">
        <label className="control-group__label">
          <Shirt size={15} />
          <span>Healthcare Uniform</span>
        </label>
        <div className="outfit-themes-row">
          {(Object.keys(OUTFIT_THEMES) as OutfitTheme[]).map((themeKey) => {
            const theme = OUTFIT_THEMES[themeKey];
            const isSelected = options.theme === themeKey;
            return (
              <button
                key={themeKey}
                type="button"
                className={`outfit-theme-pill ${isSelected ? 'outfit-theme-pill--active' : ''}`}
                onClick={() => updateOption('theme', themeKey)}
              >
                <span
                  className="outfit-theme-color-dot"
                  style={{ backgroundColor: theme.primary }}
                />
                <span>{theme.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Toggles: Mirror, Rig Overlay, Floor Grid, Footwear */}
      <div className="avatar-toggles-grid">
        <label className="avatar-checkbox-label">
          <input
            type="checkbox"
            checked={options.mirror}
            onChange={(e) => updateOption('mirror', e.target.checked)}
          />
          <Compass size={15} />
          <span>Mirror Mode</span>
        </label>

        <label className="avatar-checkbox-label">
          <input
            type="checkbox"
            checked={options.showSkeleton}
            onChange={(e) => updateOption('showSkeleton', e.target.checked)}
          />
          <Sparkles size={15} />
          <span>Biomechanical Rig</span>
        </label>

        <label className="avatar-checkbox-label">
          <input
            type="checkbox"
            checked={options.showFloorGrid}
            onChange={(e) => updateOption('showFloorGrid', e.target.checked)}
          />
          <span>Studio Depth Grid</span>
        </label>

        <button
          type="button"
          className="footwear-toggle-btn"
          onClick={() =>
            updateOption('footwear', options.footwear === 'sneakers' ? 'barefoot' : 'sneakers')
          }
        >
          <Footprints size={15} />
          <span>{options.footwear === 'sneakers' ? 'Sneakers' : 'Barefoot Rehab'}</span>
        </button>
      </div>
    </div>
  );
}
