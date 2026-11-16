import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task8-slalom-balance',
  title: 'Toony Penguin Ice Slide (Weight Shift & Balance)',
  summary:
    'Gamified arctic penguin ice flume game for lower-limb lateral weight shifting, center-of-gravity transfer, and balance stability.',
  categoryId: 'weight-shifting-and-balance',
  activityId: 'lateral-weight-shifting',
  status: 'beta',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./SlalomBalanceModule')),
});
