import { useState } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  Sparkles,
  Play,
  Flame,
} from 'lucide-react';
import { ROUTES } from '@/core/config/app';
import { getCategoriesForSection, getSection } from '@/catalog';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { UpperBodyTrainingArt, LowerBodyTrainingArt } from '@/components/catalog/TrainingHeroArt';
import { CATEGORY_CARD_CONFIG, CategoryPhotoThumbnail } from '@/components/catalog/CategoryGameCards';
import './pages.css';

export function SectionPage() {
  const { sectionId = '' } = useParams();
  const section = getSection(sectionId);
  useDocumentTitle(section?.title ?? 'Rehabilitation Arena');

  const [activeTab, setActiveTab] = useState<'all' | 'p0' | 'p1'>('all');

  if (!section) return <Navigate to="/not-found" replace />;

  const cats = getCategoriesForSection(section.id);
  const totalActivities = cats.reduce((sum, c) => sum + c.activities.length, 0);

  const isUpper = section.id === 'upper-body';

  const filteredCats = cats.filter((cat) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'p0') return cat.priority === 'P0';
    return cat.priority === 'P1' || cat.priority === 'P2';
  });

  return (
    <div className="page game-section-page">
      {/* 1. Header with back button & title */}
      <div className="arcade-top-nav">
        <Link to={ROUTES.home} className="arcade-back-btn" aria-label="Back to Dashboard">
          <ArrowLeft size={18} />
        </Link>
        <div className="arcade-top-titles">
          <span className="arcade-top-sub">REGION ARENA</span>
          <h1 className="arcade-top-title">{isUpper ? 'Upper Body Zone' : 'Lower Body Zone'}</h1>
        </div>
        <div className="arcade-streak-badge">
          <Flame size={16} className="arcade-streak-fire" />
          <span>{totalActivities} Acts</span>
        </div>
      </div>

      {/* 2. Visual Cover Banner with minimal training character */}
      <div className={`arcade-hero-cover ${isUpper ? 'arcade-hero-cover--teal' : 'arcade-hero-cover--indigo'}`}>
        <div className="arcade-hero-cover__art-wrap">
          {isUpper ? (
            <UpperBodyTrainingArt className="arcade-hero-cover__art" />
          ) : (
            <LowerBodyTrainingArt className="arcade-hero-cover__art" />
          )}
        </div>
        <div className="arcade-hero-cover__content">
          <span className="arcade-hero-pill">
            <Sparkles size={13} /> {cats.length} Training Categories
          </span>
          <h2 className="arcade-hero-tagline">
            {isUpper ? 'Master Reach & Arm Coordination' : 'Build Leg Strength & Body Balance'}
          </h2>
          <div className="arcade-hero-meta-strip">
            <span className="arcade-hero-tag">89 Total App Activities</span>
            <span className="arcade-hero-tag arcade-hero-tag--active">Motion Camera Ready</span>
          </div>
        </div>
      </div>

      {/* 3. Filter Pills */}
      <div className="arcade-section-filter-row">
        <div className="arcade-filter-tabs">
          <button
            type="button"
            className={`arcade-filter-pill ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Categories ({cats.length})
          </button>
          <button
            type="button"
            className={`arcade-filter-pill ${activeTab === 'p0' ? 'active' : ''}`}
            onClick={() => setActiveTab('p0')}
          >
            Priority Focus
          </button>
          <button
            type="button"
            className={`arcade-filter-pill ${activeTab === 'p1' ? 'active' : ''}`}
            onClick={() => setActiveTab('p1')}
          >
            Mobility & Control
          </button>
        </div>
      </div>

      {/* 4. Category Cards Grid */}
      <div className="arcade-section-category-list">
        {filteredCats.map((category) => {
          const config = CATEGORY_CARD_CONFIG[category.id] ?? {
            gradient: 'linear-gradient(135deg, rgba(13, 148, 136, 0.85) 0%, rgba(17, 94, 89, 0.95) 100%)',
            badgeBg: '#ccfbf1',
            badgeColor: '#0f766e',
            accent: '#2dd4bf',
            level: 'LVL 1',
            duration: `${category.activities.length} Exercises`,
            image: '/images/shoulder-reach.jpg',
          };

          return (
            <Link
              key={category.id}
              to={ROUTES.category(section.id, category.id)}
              className="arcade-section-card"
            >
              {/* Left visual thumbnail with realistic exercise image */}
              <div className="arcade-section-card__thumb">
                <CategoryPhotoThumbnail src={config.image} alt={category.title} size={58} />
              </div>

              {/* Main details */}
              <div className="arcade-section-card__content">
                <div className="arcade-section-card__tags">
                  <span
                    className="arcade-section-pill"
                    style={{ backgroundColor: config.badgeBg, color: config.badgeColor }}
                  >
                    {config.level}
                  </span>
                  <span className="arcade-section-pill arcade-section-pill--muted">
                    {category.activities.length} Exercises
                  </span>
                </div>

                <span className="arcade-section-card__title">{category.title}</span>

                {/* Sub exercise sample chips */}
                <div className="arcade-exercise-mini-chips">
                  {category.activities.slice(0, 2).map((act) => (
                    <span key={act} className="arcade-mini-chip">
                      • {act}
                    </span>
                  ))}
                  {category.activities.length > 2 && (
                    <span className="arcade-mini-chip arcade-mini-chip--more">
                      +{category.activities.length - 2} more
                    </span>
                  )}
                </div>
              </div>

              {/* Action play button */}
              <div className="arcade-section-card__action">
                <span className="arcade-play-circle">
                  <Play size={14} fill="currentColor" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
