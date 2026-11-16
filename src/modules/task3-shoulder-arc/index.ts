import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task3-shoulder-arc',
  title: 'Shoulder Clock Arc Sweep',
  summary:
    'Coronal plane shoulder abduction goniometer with star checkpoints and peak hold duration for rotator cuff and frozen shoulder recovery.',
  categoryId: 'shoulder-mobility',
  activityId: 'shoulder-abduction',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./ShoulderArcModule')),
});
