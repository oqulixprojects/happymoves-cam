import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task6-neck-vertical',
  title: 'Neck Vertical – Up & Down Star Catcher',
  summary:
    'Cervical sagittal plane flexion and extension exercise with vertical character flight navigation for tech-neck, neck stiffness, and posture recovery.',
  categoryId: 'weight-shifting-and-balance',
  activityId: 'cervical-flexion-extension',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./NeckVerticalModule')),
});
