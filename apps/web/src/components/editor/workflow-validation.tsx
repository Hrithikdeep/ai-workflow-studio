'use client';

import {
  AlertCircle,
  Check,
  ChevronDown,
  ShieldCheck,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

export type ValidationResult = {
  id: string;
  label: string;
  status: 'success' | 'error';
  message?: string;
};

type WorkflowValidationProps = {
  results?: ValidationResult[];
  defaultOpen?: boolean;
};

/* -------------------------------------------------------------------------- */
/* DEFAULT                                                                    */
/* -------------------------------------------------------------------------- */

const DEFAULT_RESULTS: ValidationResult[] = [
  {
    id: 'trigger',
    label: 'Trigger configured',
    status: 'success',
  },

  {
    id: 'connections',
    label: 'All nodes connected',
    status: 'success',
  },

  {
    id: 'cycles',
    label: 'No cycles detected',
    status: 'success',
  },
];

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function WorkflowValidation({
  results = DEFAULT_RESULTS,
  defaultOpen = true,
}: WorkflowValidationProps) {
  const [open, setOpen] =
    useState(defaultOpen);

  const hasErrors = useMemo(
    () =>
      results.some(
        (result) =>
          result.status ===
          'error',
      ),
    [results],
  );

  const errorResults = useMemo(
    () =>
      results.filter(
        (result) =>
          result.status ===
          'error',
      ),
    [results],
  );

  /* ------------------------------------------------------------------------ */
  /* COLLAPSED                                                               */
  /* ------------------------------------------------------------------------ */

  if (!open) {
    return (
      <button
        type="button"
        onClick={() =>
          setOpen(true)
        }
        className={[
          'pointer-events-auto',
          'flex',
          'h-8',
          'items-center',
          'gap-2',
          'rounded-md',
          'border',
          'border-slate-200',
          'bg-white',
          'px-2.5',
          'shadow-sm',
          'hover:bg-slate-50',
        ].join(' ')}
      >
        <ShieldCheck
          size={12}
          className={
            hasErrors
              ? 'text-red-500'
              : 'text-blue-500'
          }
        />

        <span className="text-[8px] font-semibold uppercase tracking-wide text-slate-500">
          Validation
        </span>

        <ChevronDown
          size={10}
          className="text-slate-400"
        />
      </button>
    );
  }

  /* ------------------------------------------------------------------------ */
  /* OPEN                                                                     */
  /* ------------------------------------------------------------------------ */

  return (
    <div className="pointer-events-auto w-[275px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-md">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}

      <button
        type="button"
        onClick={() =>
          setOpen(false)
        }
        className="flex h-9 w-full items-center justify-between px-3 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck
            size={13}
            className={
              hasErrors
                ? 'text-red-500'
                : 'text-blue-500'
            }
          />

          <span className="text-[10px] font-semibold text-slate-700">
            Workflow Validation
          </span>
        </div>

        <ChevronDown
          size={12}
          className="text-slate-400"
        />
      </button>

      {/* ================================================================== */}
      {/* RESULTS                                                            */}
      {/* ================================================================== */}

      <div className="border-t border-slate-100 px-3 py-2.5">
        <div className="space-y-2">
          {results.map(
            (result) => {
              const success =
                result.status ===
                'success';

              return (
                <div
                  key={result.id}
                  className="flex items-center gap-2"
                >
                  {/* ICON */}

                  <div className="flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                    {success ? (
                      <Check
                        size={13}
                        strokeWidth={2.5}
                        className="text-emerald-500"
                      />
                    ) : (
                      <AlertCircle
                        size={13}
                        strokeWidth={2}
                        className="text-red-500"
                      />
                    )}
                  </div>

                  {/* TEXT */}

                  <div
                    className={[
                      'min-w-0',
                      'text-[9px]',
                      'leading-4',

                      success
                        ? 'text-slate-600'
                        : 'font-medium text-red-600',
                    ].join(' ')}
                  >
                    {result.label}
                  </div>
                </div>
              );
            },
          )}
        </div>

        {/* ================================================================ */}
        {/* ERRORS                                                           */}
        {/* ================================================================ */}

        {hasErrors && (
          <div className="mt-2.5 overflow-hidden rounded-md border border-red-200 bg-red-50">
            {errorResults.map(
              (result) => (
                <div
                  key={result.id}
                  className="flex items-start gap-2 px-2.5 py-2"
                >
                  <AlertCircle
                    size={13}
                    className="mt-0.5 shrink-0 text-red-500"
                  />

                  <div className="min-w-0">
                    <div className="text-[9px] font-medium leading-4 text-red-600">
                      {result.label}
                    </div>

                    {result.message && (
                      <div className="mt-0.5 text-[8px] leading-3.5 text-red-500">
                        {result.message}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
    </div>
  );
}