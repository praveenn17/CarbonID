import { ReactNode } from 'react';
import Sidebar from './Sidebar';

export default function MainLayout({ children, title, subtitle }: { children: ReactNode, title: string, subtitle: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      {/* Absolute Backdrop styling */}
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-emerald-500/5 blur-[150px] rounded-full pointer-events-none" />

      <Sidebar />

      <main className="flex-1 ml-64 p-8 relative z-10">
        <header className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">{title}</h1>
          <p className="text-slate-400">{subtitle}</p>
        </header>

        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
