import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task7-knee-soccer',
  title: '2D Leg Kick Soccer Game',
  summary:
    'Gamified 2D arcade soccer kicking exercise for seated quadriceps strengthening and active knee terminal extension (90° -> 180°).',
  categoryId: 'knee-mobility-and-control',
  activityId: 'seated-knee-extension',
  status: 'beta',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./KneeSoccerModule')),
});
