import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'knee-extension-goniometer',
  title: 'Knee Extension & Goniometer Tracking',
  summary: 'Computer-vision clinical goniometer measuring real-time knee joint angle, 2.5s hold timer, rep counter, and mobility telemetry.',
  categoryId: 'knee-mobility-and-control',
  activityId: 'seated-knee-extension',
  status: 'demo',
  requiresCamera: true,
  tracking: ['pose'],
  component: lazy(() => import('./KneeGoniometerModule')),
});

