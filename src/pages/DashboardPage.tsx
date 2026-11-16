import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Play,
  Flame,
  Award,
  ChevronRight,
  Sparkles,
  Zap,
  Bookmark,
  CheckCircle2,
} from 'lucide-react';
import { ROUTES } from '@/core/config/app';
import { getCatalogStats } from '@/modules/registry';
import { categories } from '@/catalog';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { UpperBodyTrainingArt, LowerBodyTrainingArt } from '@/components/catalog/TrainingHeroArt';
import { CATEGORY_CARD_CONFIG, CategoryPhotoThumbnail } from '@/components/catalog/CategoryGameCards';
import './pages.css';

export function DashboardPage() {
  useDocumentTitle('HappyMoves · Training Arcade');
  const stats = getCatalogStats();

  const [activeFilter, setActiveFilter] = useState<'all' | 'upper-body' | 'lower-body'>('all');
  const [bookmarked, setBookmarked] = useState<Record<string, boolean>>({
    'full-body-avatar-tracking': true,
    'shoulder-mobility': false,
    'knee-mobility-and-control': true,
  });

  const toggleBookmark = (slug: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBookmarked((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  const filteredCategories = categories.filter((cat) => {
    if (activeFilter === 'all') return true;
    return cat.sectionId === activeFilter;
  });

  return (
    <div className="page game-dashboard-page">
      {/* 1. TOP GREETING & STREAK BAR */}
      <section className="arcade-header-bar">
        <div className="arcade-header-titles">
          <span className="arcade-header-kicker">REHABILITATION ARENA</span>
          <h1 className="arcade-header-title">Stay Active & Level Up</h1>
        </div>
        <div className="arcade-streak-badge" title="Daily training streak">
          <Flame size={18} className="arcade-streak-fire" />
          <span className="arcade-streak-count">Day 4</span>
        </div>
      </section>

      {/* 2. BODY REGION HERO CARDS (Upper Body & Lower Body with Minimal Training Art) */}
      <section className="arcade-region-section" aria-label="Body Regions">
        <div className="arcade-region-grid">
          {/* Upper Body Hero Card */}
          <Link to={ROUTES.section('upper-body')} className="arcade-region-card arcade-region-card--teal">
            <div className="arcade-region-card__visual">
              <UpperBodyTrainingArt className="arcade-region-card__art" />
              <div className="arcade-region-card__overlay">
                <span className="arcade-region-tag">7 CATEGORIES</span>
                <span className="arcade-region-name">Upper Body</span>
              </div>
            </div>
            <div className="arcade-region-card__footer">
              <span className="arcade-region-stat">47 Activities</span>
              <span className="arcade-region-btn">
                <Play size={12} fill="currentColor" />
                <span>Enter</span>
              </span>
            </div>
          </Link>

          {/* Lower Body Hero Card */}
          <Link to={ROUTES.section('lower-body')} className="arcade-region-card arcade-region-card--indigo">
            <div className="arcade-region-card__visual">
              <LowerBodyTrainingArt className="arcade-region-card__art" />
              <div className="arcade-region-card__overlay">
                <span className="arcade-region-tag">5 CATEGORIES</span>
                <span className="arcade-region-name">Lower Body</span>
              </div>
            </div>
            <div className="arcade-region-card__footer">
              <span className="arcade-region-stat">42 Activities</span>
              <span className="arcade-region-btn">
                <Play size={12} fill="currentColor" />
                <span>Enter</span>
              </span>
            </div>
          </Link>
        </div>
      </section>

      {/* 3. GAMIFIED STAT PILLS (Total Stats Displayed as Badges) */}
      <section className="arcade-stats-strip" aria-label="Quick Stats">
        <div className="arcade-stat-pill arcade-stat-pill--orange">
          <div className="arcade-stat-pill__icon">
            <Zap size={16} />
          </div>
          <div className="arcade-stat-pill__content">
            <span className="arcade-stat-pill__num">{stats.categories || 12}</span>
            <span className="arcade-stat-pill__lbl">Categories</span>
          </div>
        </div>

        <div className="arcade-stat-pill arcade-stat-pill--teal">
          <div className="arcade-stat-pill__icon">
            <Sparkles size={16} />
          </div>
          <div className="arcade-stat-pill__content">
            <span className="arcade-stat-pill__num">{stats.activities || 89}</span>
            <span className="arcade-stat-pill__lbl">Activities</span>
          </div>
        </div>

        <div className="arcade-stat-pill arcade-stat-pill--indigo">
          <div className="arcade-stat-pill__icon">
            <Award size={16} />
          </div>
          <div className="arcade-stat-pill__content">
            <span className="arcade-stat-pill__num">5 Live</span>
            <span className="arcade-stat-pill__lbl">Vision Mods</span>
          </div>
        </div>
      </section>

      {/* 4. FEATURED / FAVORITE PROGRAM (Match the reference card layout) */}
      <section className="arcade-featured-section" aria-labelledby="featured-heading">
        <div className="arcade-section-row">
          <h2 id="featured-heading" className="arcade-section-heading">
            Live Modules & Quests
          </h2>
          <span className="arcade-section-subaction">Ready to play</span>
        </div>

        <div className="arcade-featured-list">
          {/* Real 3D Human Avatar Tracking Card */}
          <Link
            to={ROUTES.module('lower-body', 'weight-shifting-and-balance', 'real-3d-human-avatar-tracking')}
            className="arcade-quest-card arcade-quest-card--glow"
          >
            <div className="arcade-quest-card__thumb">
              <CategoryPhotoThumbnail src="/images/patient-avatar-tracking.jpg" alt="Real 3D Human Avatar Tracking" size={64} />
              <span className="arcade-quest-chip">3D MESH</span>
            </div>
            <div className="arcade-quest-card__body">
              <div className="arcade-quest-card__top">
                <span className="arcade-quest-title">Real 3D Human Mesh Avatar</span>
                <button
                  type="button"
                  className={`arcade-bookmark-btn ${bookmarked['real-3d-avatar'] ? 'active' : ''}`}
                  onClick={(e) => toggleBookmark('real-3d-avatar', e)}
                  aria-label="Bookmark"
                >
                  <Bookmark size={16} fill={bookmarked['real-3d-avatar'] ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p className="arcade-quest-sub">Full Body · True 3D Skeletal Mesh</p>
              <div className="arcade-quest-meta">
                <span className="arcade-xp-pill arcade-xp-pill--teal">
                  <CheckCircle2 size={11} /> WebGL Rig & Camera MoCap
                </span>
                <span className="arcade-tag-text">Full 3D Rigged</span>
              </div>
            </div>
          </Link>

          {/* Knee Extension Goniometer Card */}
          <Link
            to={ROUTES.module('lower-body', 'knee-mobility-and-control', 'seated-knee-extension')}
            className="arcade-quest-card arcade-quest-card--glow"
          >
            <div className="arcade-quest-card__thumb">
              <CategoryPhotoThumbnail src="/images/knee-balance.jpg" alt="Knee Extension and Goniometer" size={64} />
              <span className="arcade-quest-chip">ROM</span>
            </div>
            <div className="arcade-quest-card__body">
              <div className="arcade-quest-card__top">
                <span className="arcade-quest-title">Knee Goniometer & Analytics</span>
                <button
                  type="button"
                  className={`arcade-bookmark-btn ${bookmarked['knee-mobility-and-control'] ? 'active' : ''}`}
                  onClick={(e) => toggleBookmark('knee-mobility-and-control', e)}
                  aria-label="Bookmark"
                >
                  <Bookmark size={16} fill={bookmarked['knee-mobility-and-control'] ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p className="arcade-quest-sub">Lower Body · Knee Mobility & Control</p>
              <div className="arcade-quest-meta">
                <span className="arcade-xp-pill arcade-xp-pill--teal">
                  <CheckCircle2 size={11} /> 150° Target & Hold
                </span>
                <span className="arcade-tag-text">Live Telemetry</span>
              </div>
            </div>
          </Link>

          {/* Full Body Avatar Tracking Card */}
          <Link
            to={ROUTES.module('lower-body', 'weight-shifting-and-balance', 'full-body-avatar-tracking')}
            className="arcade-quest-card arcade-quest-card--glow"
          >
            <div className="arcade-quest-card__thumb">
              <CategoryPhotoThumbnail src="/images/patient-avatar-tracking.jpg" alt="Patient Full Body Avatar Tracking" size={64} />
              <span className="arcade-quest-chip">60 FPS</span>
            </div>
            <div className="arcade-quest-card__body">
              <div className="arcade-quest-card__top">
                <span className="arcade-quest-title">2D Avatar Tracking</span>
                <button
                  type="button"
                  className={`arcade-bookmark-btn ${bookmarked['full-body-avatar-tracking'] ? 'active' : ''}`}
                  onClick={(e) => toggleBookmark('full-body-avatar-tracking', e)}
                  aria-label="Bookmark"
                >
                  <Bookmark size={16} fill={bookmarked['full-body-avatar-tracking'] ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p className="arcade-quest-sub">Full Body Tracking · Weight & Balance</p>
              <div className="arcade-quest-meta">
                <span className="arcade-xp-pill">
                  <CheckCircle2 size={11} /> Interactive Motion
                </span>
                <span className="arcade-tag-text">Real-time Camera</span>
              </div>
            </div>
          </Link>

          {/* Shoulder Mobility Card */}
          <Link
            to={ROUTES.module('upper-body', 'shoulder-mobility', 'general-template')}
            className="arcade-quest-card"
          >
            <div className="arcade-quest-card__thumb">
              <CategoryPhotoThumbnail src="/images/upper-body-patient.jpg" alt="Upper Body Patient Rehabilitation" size={64} />
            </div>
            <div className="arcade-quest-card__body">
              <div className="arcade-quest-card__top">
                <span className="arcade-quest-title">Shoulder Mobility</span>
                <button
                  type="button"
                  className={`arcade-bookmark-btn ${bookmarked['shoulder-mobility'] ? 'active' : ''}`}
                  onClick={(e) => toggleBookmark('shoulder-mobility', e)}
                  aria-label="Bookmark"
                >
                  <Bookmark size={16} fill={bookmarked['shoulder-mobility'] ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p className="arcade-quest-sub">Upper Body · Shoulder Arc & Range</p>
              <div className="arcade-quest-meta">
                <span className="arcade-xp-pill arcade-xp-pill--teal">Flexion & Reach</span>
                <span className="arcade-tag-text">7 Exercises</span>
              </div>
            </div>
          </Link>

          {/* Hand Opening & Closing */}
          <Link
            to={ROUTES.module('upper-body', 'hand-gross-motor', 'hand-opening-and-closing')}
            className="arcade-quest-card"
          >
            <div className="arcade-quest-card__thumb">
              <CategoryPhotoThumbnail src="/images/hand-grasp.jpg" alt="Hand Opening and Closing" size={64} />
            </div>
            <div className="arcade-quest-card__body">
              <div className="arcade-quest-card__top">
                <span className="arcade-quest-title">Hand Gross Motor</span>
                <button
                  type="button"
                  className={`arcade-bookmark-btn ${bookmarked['hand-motor'] ? 'active' : ''}`}
                  onClick={(e) => toggleBookmark('hand-motor', e)}
                  aria-label="Bookmark"
                >
                  <Bookmark size={16} fill={bookmarked['hand-motor'] ? 'currentColor' : 'none'} />
                </button>
              </div>
              <p className="arcade-quest-sub">Upper Body · Grasp & Release</p>
              <div className="arcade-quest-meta">
                <span className="arcade-xp-pill arcade-xp-pill--cyan">Pinch & Grip</span>
                <span className="arcade-tag-text">7 Exercises</span>
              </div>
            </div>
          </Link>
        </div>
      </section>

      {/* 5. 12 CATEGORIES ARCADE GRID WITH FILTER PILLS */}
      <section className="arcade-categories-section" aria-labelledby="categories-heading">
        <div className="arcade-section-row">
          <h2 id="categories-heading" className="arcade-section-heading">
            All 12 Categories ({filteredCategories.length})
          </h2>
          <div className="arcade-filter-tabs">
            <button
              type="button"
              className={`arcade-filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All (12)
            </button>
            <button
              type="button"
              className={`arcade-filter-pill ${activeFilter === 'upper-body' ? 'active' : ''}`}
              onClick={() => setActiveFilter('upper-body')}
            >
              Upper (7)
            </button>
            <button
              type="button"
              className={`arcade-filter-pill ${activeFilter === 'lower-body' ? 'active' : ''}`}
              onClick={() => setActiveFilter('lower-body')}
            >
              Lower (5)
            </button>
          </div>
        </div>

        {/* 12 Designed Category Game Cards with colorful themed backgrounds */}
        <div className="arcade-category-grid">
          {filteredCategories.map((cat) => {
            const config = CATEGORY_CARD_CONFIG[cat.id] ?? {
              gradient: 'linear-gradient(135deg, rgba(13, 148, 136, 0.85) 0%, rgba(17, 94, 89, 0.95) 100%)',
              badgeBg: '#ccfbf1',
              badgeColor: '#0f766e',
              accent: '#2dd4bf',
              level: 'LVL 1',
              duration: `${cat.activities.length} Exercises`,
              image: '/images/shoulder-reach.jpg',
            };

            return (
              <Link
                key={cat.id}
                to={ROUTES.category(cat.sectionId, cat.id)}
                className="arcade-cat-tile"
                style={{ background: config.gradient }}
              >
                <div className="arcade-cat-tile__top">
                  <span
                    className="arcade-cat-level-chip"
                    style={{ backgroundColor: config.badgeBg, color: config.badgeColor }}
                  >
                    {config.level}
                  </span>
                  <span className="arcade-cat-badge-arrow">
                    <ChevronRight size={14} />
                  </span>
                </div>

                <div className="arcade-cat-tile__graphic">
                  <CategoryPhotoThumbnail src={config.image} alt={cat.title} size={50} />
                </div>

                <div className="arcade-cat-tile__info">
                  <span className="arcade-cat-tile__name">{cat.title}</span>
                  <span className="arcade-cat-tile__count">{cat.activities.length} Activities</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
