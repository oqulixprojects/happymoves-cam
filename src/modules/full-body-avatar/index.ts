import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'full-body-avatar',
  title: 'Full Body Avatar Tracking',
  summary: 'Interactive 2D healthcare character mirroring your exact movements, full body, fingers, and toes.',
  categoryId: 'weight-shifting-and-balance',
  activityId: 'full-body-avatar-tracking',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./FullBodyAvatarModule')),
});
