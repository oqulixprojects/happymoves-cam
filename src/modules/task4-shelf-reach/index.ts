import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'task4-shelf-reach',
  title: 'Shoulder Shelf Reach & Organizer',
  summary:
    'Multi-tier active vertical arm elevation and ADL reaching exercise on a 2D pantry shelf for shoulder and stroke rehab.',
  categoryId: 'shoulder-mobility',
  activityId: 'overhead-target-reaching',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./ShelfReachModule')),
});
