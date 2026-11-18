import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'slalom-balance',
  title: 'Penguin Ice Slide',
  summary: 'Shift your weight left and right to steer a penguin down an icy slide and collect golden fish.',
  categoryId: 'weight-shifting-and-balance',
  activityId: 'lateral-weight-shifting',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./SlalomBalanceModule')),
});