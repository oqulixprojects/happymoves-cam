
import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task7-knee-soccer',
  title: '2D Leg Kick Soccer Game',
  summary:
    'A camera-based knee extension game with soccer kicks, target scoring, and rehabilitation analytics.',
  categoryId: 'knee-mobility-and-control',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./KneeSoccerModule')),
});
