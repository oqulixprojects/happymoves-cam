import { Link, useParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ROUTES } from '@/core/config/app';
import { getCategory, getSection } from '@/catalog';
import { getEntriesForCategory } from '@/modules/registry';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { CATEGORY_CARD_CONFIG, CategoryPhotoThumbnail } from '@/components/catalog/CategoryGameCards';
import './pages.css';

export function CategoryPage() {
  const { sectionId = '', categoryId = '' } = useParams();
  const category = getCategory(categoryId);
  const section = getSection(sectionId);
  useDocumentTitle(category ? `${category.title} Quests` : 'Category');

  if (!category || !section || category.sectionId !== section.id) {
    return <Navigate to="/not-found" replace />;
  }

  const { activities, extras } = getEntriesForCategory(category.id);
  const config = CATEGORY_CARD_CONFIG[category.id] ?? {
    gradient: 'linear-gradient(135deg, rgba(13, 148, 136, 0.85) 0%, rgba(17, 94, 89, 0.95) 100%)',
    badgeBg: '#ccfbf1',
    badgeColor: '#0f766e',
    accent: '#2dd4bf',
    level: 'LVL 1',
    duration: `${activities.length} Exercises`,
    image: '/images/shoulder-reach.jpg',
  };

  const isAvailableModule = activities.some((a) => a.state === 'available');

  return (
    <div className="page game-category-page">
      {/* 1. Header with back button & category title */}
      <div className="arcade-top-nav">
        <Link to={ROUTES.section(section.id)} className="arcade-back-btn" aria-label="Back to Section">
          <ArrowLeft size={18} />
        </Link>
        <div className="arcade-top-titles">
          <span className="arcade-top-sub">{section.title.toUpperCase()}</span>
          <h1 className="arcade-top-title">{category.title}</h1>
        </div>
        <span
          className="arcade-section-pill"
          style={{ backgroundColor: config.badgeBg, color: config.badgeColor }}
        >
          {config.level}
        </span>
      </div>

      {/* 2. Game Level Cover Card with Realistic Exercise Photo */}
      <div className="arcade-level-banner" style={{ background: config.gradient }}>
        <div className="arcade-level-banner__graphic">
          <CategoryPhotoThumbnail src={config.image} alt={category.title} size={70} />
        </div>
        <div className="arcade-level-banner__info">
          <span className="arcade-level-badge">TRAINING MODULE</span>
          <h2 className="arcade-level-title">{category.title}</h2>
          <p className="arcade-level-sub">
            {activities.length} Structured Exercises · Motion Tracking
          </p>
          <div className="arcade-level-chips-row">
            <span className="arcade-level-chip">
              <Sparkles size={12} /> {category.priority === 'P0' ? 'Core Priority' : 'Mobility Phase'}
            </span>
            {isAvailableModule && (
              <span className="arcade-level-chip arcade-level-chip--live">
                <Zap size={12} /> Vision Tracking Active
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 3. Initial Build Focus / Mission Objectives Pill Bar */}
      {category.initialFocus && category.initialFocus.length > 0 && (
        <section className="arcade-focus-strip" aria-labelledby="mission-title">
          <div className="arcade-focus-strip__header">
            <CheckCircle2 size={16} className="arcade-focus-strip__icon" />
            <span id="mission-title" className="arcade-focus-strip__title">
              Mission Focus
            </span>
          </div>
          <div className="arcade-focus-pills-row">
            {category.initialFocus.map((item) => (
              <span key={item} className="arcade-focus-pill">
                {item}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 4. Activities Quests List */}
      <section className="arcade-activities-section" aria-labelledby="quests-heading">
        <div className="arcade-section-row">
          <h3 id="quests-heading" className="arcade-section-heading">
            Activities & Drills ({activities.length})
          </h3>
          <span className="arcade-section-subaction">Select to start</span>
        </div>

        <div className="arcade-activities-grid">
          {activities.map((entry, idx) => {
            const isLive = entry.state === 'available';

            return (
              <Link
                key={entry.slug}
                to={ROUTES.module(section.id, category.id, entry.slug)}
                className={`arcade-activity-tile ${isLive ? 'arcade-activity-tile--live' : ''}`}
              >
                <div className="arcade-activity-tile__num">
                  <span>{String(idx + 1).padStart(2, '0')}</span>
                </div>

                <div className="arcade-activity-tile__content">
                  <span className="arcade-activity-tile__title">{entry.title}</span>
                  <div className="arcade-activity-tile__meta">
                    {isLive ? (
                      <span className="arcade-xp-pill arcade-xp-pill--live">
                        <Play size={10} fill="currentColor" /> Ready to Play
                      </span>
                    ) : (
                      <span className="arcade-xp-pill arcade-xp-pill--planned">
                        Guide Ready
                      </span>
                    )}
                    <span className="arcade-activity-points">50 XP</span>
                  </div>
                </div>

                <div className="arcade-activity-tile__action">
                  <span className="arcade-play-mini">
                    <Play size={12} fill="currentColor" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* 5. Extra Platform Modules (if any) */}
      {extras.length > 0 && (
        <section className="arcade-activities-section">
          <h3 className="arcade-section-heading">Platform Templates</h3>
          <div className="arcade-activities-grid">
            {extras.map((extra) => (
              <Link
                key={extra.slug}
                to={ROUTES.module(section.id, category.id, extra.slug)}
                className="arcade-activity-tile arcade-activity-tile--live"
              >
                <div className="arcade-activity-tile__num">
                  <span>★</span>
                </div>
                <div className="arcade-activity-tile__content">
                  <span className="arcade-activity-tile__title">{extra.title}</span>
                  <div className="arcade-activity-tile__meta">
                    <span className="arcade-xp-pill arcade-xp-pill--live">Template Live</span>
                  </div>
                </div>
                <div className="arcade-activity-tile__action">
                  <span className="arcade-play-mini">
                    <Play size={12} fill="currentColor" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
