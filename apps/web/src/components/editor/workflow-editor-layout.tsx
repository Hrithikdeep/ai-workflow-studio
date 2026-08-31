'use client';

import React from 'react';

type WorkflowEditorLayoutProps = {
  header: React.ReactNode;
  palette: React.ReactNode;
  canvas: React.ReactNode;
  properties: React.ReactNode;
};

export default function WorkflowEditorLayout({
  header,
  palette,
  canvas,
  properties,
}: WorkflowEditorLayoutProps) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#f8fafc] text-slate-900">
      {/* ============================================================ */}
      {/* HEADER                                                       */}
      {/* ============================================================ */}

      <header className="h-[58px] shrink-0 border-b border-slate-200 bg-white">
        {header}
      </header>

      {/* ============================================================ */}
      {/* EDITOR                                                       */}
      {/* ============================================================ */}

      <div className="flex min-h-0 flex-1">
        {/* ========================================================== */}
        {/* LEFT SIDEBAR                                               */}
        {/* ========================================================== */}

        <aside className="w-[205px] shrink-0 overflow-hidden border-r border-slate-200 bg-white">
          {palette}
        </aside>

        {/* ========================================================== */}
        {/* CANVAS                                                      */}
        {/* ========================================================== */}

        <main className="relative min-w-0 flex-1 overflow-hidden bg-[#f8fafc]">
          {canvas}
        </main>

        {/* ========================================================== */}
        {/* RIGHT SIDEBAR                                               */}
        {/* ========================================================== */}

        <aside className="w-[315px] shrink-0 overflow-hidden border-l border-slate-200 bg-white">
          {properties}
        </aside>
      </div>
    </div>
  );
}