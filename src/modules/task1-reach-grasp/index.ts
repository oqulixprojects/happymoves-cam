import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task1-reach-grasp',
  title: 'Open Hand Reach & Grasp',
  summary:
    'Gross grasp and release, coordinated open-hand trajectory reaching, and active finger extension to flexion for neurological hand recovery.',
  categoryId: 'hand-gross-motor',
  activityId: 'gross-grasp-and-release',
  status: 'demo',
  requiresCamera: true,
  tracking: ['hands'],
  component: lazy(() => import('./ReachGraspModule')),
});
