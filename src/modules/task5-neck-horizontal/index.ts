import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task5-neck-horizontal',
  title: 'Head-Steered Neck Horizontal Rotation',
  summary:
    'Active cervical lateral rotation exercise with gamified head-steered drone navigation for neck stiffness, whiplash, and posture recovery.',
  categoryId: 'weight-shifting-and-balance',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./NeckHorizontalModule')),
});
