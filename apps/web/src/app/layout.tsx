import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { ToastContainer } from '@/components/shared/toast';

export const metadata: Metadata = {
  title: 'NexusAI — Autonomous AI Chief of Staff & Agentic OS',
  description: 'Enterprise-grade autonomous agentic operating system with MCP tooling, persistent pgvector memory, and human-in-the-loop approvals.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#07090e] text-slate-100 min-h-screen flex antialiased">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto bg-gradient-to-b from-[#07090e] via-[#090d16] to-[#06080d]">
            {children}
          </main>
        </div>
        <ToastContainer />
      </body>
    </html>
  );
}
