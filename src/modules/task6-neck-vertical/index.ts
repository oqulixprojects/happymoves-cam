
import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'neck-vertical-star-catcher',
  title: 'Neck Vertical: Up & Down Star Catcher',
  summary: 'A camera-based neck movement game where players move their head up and down to catch stars.',
  categoryId: 'weight-shifting-and-balance',
  activityId: 'cervical-flexion-extension',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./NeckVerticalModule')),
});
