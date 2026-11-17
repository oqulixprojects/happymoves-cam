import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'shoulder-clock-arc',
  title: 'Shoulder Clock Arc',
  summary: 'Shoulder mobility exercise with clock arc tracking.',
  categoryId: 'shoulder-mobility',
  activityId: 'shoulder-abduction',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./ShoulderArcModule')),
});