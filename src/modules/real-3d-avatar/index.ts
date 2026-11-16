import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'real-3d-avatar',
  title: 'Real 3D Human Avatar Tracking',
  summary: 'True 3D anatomical skeletal mesh that mirrors your arms, spine, and leg movements in real-time WebGL space.',
  categoryId: 'weight-shifting-and-balance',
  activityId: 'real-3d-human-avatar-tracking',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./Real3DAvatarModule')),
});

