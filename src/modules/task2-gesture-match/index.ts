import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task2-gesture-match',
  title: 'Finger Gesture Match',
  summary:
    'Dynamic finger isolation, motor cognition, and proprioceptive gesture replication for neurological hand rehab.',
  categoryId: 'hand-fine-motor',
  activityId: 'individual-finger-extension',
  status: 'demo',
  requiresCamera: true,
  tracking: ['hands'],
  component: lazy(() => import('./GestureMatchModule')),
});
