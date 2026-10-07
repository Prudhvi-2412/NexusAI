import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/layout/app-shell';
import { ToastContainer } from '@/components/shared/toast';
import { CommandPalette } from '@/components/layout/command-palette';
import { AuthGate } from '@/components/auth/auth-gate';

export const metadata: Metadata = {
  title: 'NexusAI — Autonomous AI Chief of Staff & Agentic OS',
  description: 'Gemini-powered personal chief of staff with saved conversations and previews of upcoming integrations.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <AuthGate>
          <AppShell>{children}</AppShell>
          <ToastContainer />
          <CommandPalette />
        </AuthGate>
      </body>
    </html>
  );
}
