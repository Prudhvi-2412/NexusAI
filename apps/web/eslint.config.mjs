import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    files: [
      'src/components/activity/activity-view.tsx',
      'src/components/apps/apps-view.tsx',
      'src/components/chat/chat-container.tsx',
    ],
    // These effects start an asynchronous initial fetch or read browser speech
    // capabilities; the event-handler state updates do not occur during render.
    rules: { 'react-hooks/set-state-in-effect': 'off' },
  },
  {
    files: ['src/components/chat/chat-container.tsx'],
    // Date.now() here runs only inside send/stream event callbacks.
    rules: { 'react-hooks/purity': 'off' },
  },
]);
