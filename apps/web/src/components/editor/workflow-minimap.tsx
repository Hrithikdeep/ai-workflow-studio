'use client';

import {
  Maximize2,
  Minimize2,
} from 'lucide-react';

import {
  useMemo,
  useState,
} from 'react';

import {
  useReactFlow,
  type Edge,
  type Node,
} from 'reactflow';

/* -------------------------------------------------------------------------- */
/* TYPES                                                                      */
/* -------------------------------------------------------------------------- */

type WorkflowMiniMapProps = {
  nodes: Node[];
  edges?: Edge[];
};

/* -------------------------------------------------------------------------- */
/* COMPONENT                                                                  */
/* -------------------------------------------------------------------------- */

export default function WorkflowMiniMap({
  nodes,
  edges = [],
}: WorkflowMiniMapProps) {
  const { fitView } = useReactFlow();

  const [hidden, setHidden] =
    useState(false);

  /* ------------------------------------------------------------------------ */
  /* Empty                                                                    */
  /* ------------------------------------------------------------------------ */

  if (hidden) {
    return (
      <div className="pointer-events-auto overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() =>
            setHidden(false)
          }
          className="flex h-7 items-center gap-1.5 px-2.5 text-[8px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          <Maximize2 size={10} />

          MINI MAP

          <span className="ml-1 text-[8px] font-normal text-slate-400">
            show
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto w-[135px] overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      {/* ================================================================== */}
      {/* HEADER                                                             */}
      {/* ================================================================== */}

      <div className="flex h-7 items-center justify-between border-b border-slate-100 px-2.5">
        <span className="text-[8px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          Mini Map
        </span>

        <button
          type="button"
          onClick={() =>
            setHidden(true)
          }
          className="text-[8px] font-medium text-slate-400 hover:text-slate-700"
        >
          hide
        </button>
      </div>

      {/* ================================================================== */}
      {/* MAP                                                                */}
      {/* ================================================================== */}

      <div className="relative h-[125px] w-full overflow-hidden bg-slate-50">
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[8px] text-slate-300">
            No nodes
          </div>
        ) : (
          <MiniMapGraph
            nodes={nodes}
            edges={edges}
          />
        )}
      </div>

      {/* ================================================================== */}
      {/* FOOTER                                                             */}
      {/* ================================================================== */}

      <div className="flex h-6 items-center justify-end border-t border-slate-100 px-2">
        <button
          type="button"
          onClick={() =>
            fitView({
              padding: 0.2,
              duration: 250,
            })
          }
          className="flex items-center gap-1 text-[8px] font-medium text-slate-400 hover:text-slate-700"
        >
          <Minimize2 size={9} />

          fit
        </button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* GRAPH                                                                      */
/* -------------------------------------------------------------------------- */

function MiniMapGraph({
  nodes,
  edges,
}: {
  nodes: Node[];
  edges: Edge[];
}) {
  const bounds = useMemo(() => {
    if (nodes.length === 0) {
      return {
        minX: 0,
        maxX: 1,
        minY: 0,
        maxY: 1,
        width: 1,
        height: 1,
      };
    }

    const xs = nodes.map(
      (node) => node.position.x,
    );

    const ys = nodes.map(
      (node) => node.position.y,
    );

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);

    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      minX,
      maxX,
      minY,
      maxY,

      width: Math.max(
        maxX - minX,
        180,
      ),

      height: Math.max(
        maxY - minY,
        220,
      ),
    };
  }, [nodes]);

  const mapWidth = 135;
  const mapHeight = 125;

  const paddingX = 14;
  const paddingY = 12;

  const scaleX =
    (mapWidth - paddingX * 2) /
    bounds.width;

  const scaleY =
    (mapHeight - paddingY * 2) /
    bounds.height;

  const scale = Math.min(
    scaleX,
    scaleY,
  );

  const getPosition = (
    node: Node,
  ) => {
    return {
      x:
        paddingX +
        (node.position.x -
          bounds.minX) *
          scale,

      y:
        paddingY +
        (node.position.y -
          bounds.minY) *
          scale,
    };
  };

  return (
    <div className="absolute inset-0">
      {/* ================================================================ */}
      {/* EDGES                                                             */}
      {/* ================================================================ */}

      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${mapWidth} ${mapHeight}`}
        preserveAspectRatio="none"
      >
        {edges.map((edge) => {
          const source = nodes.find(
            (node) =>
              node.id ===
              edge.source,
          );

          const target = nodes.find(
            (node) =>
              node.id ===
              edge.target,
          );

          if (!source || !target) {
            return null;
          }

          const sourcePosition =
            getPosition(source);

          const targetPosition =
            getPosition(target);

          const x1 =
            sourcePosition.x + 5;

          const y1 =
            sourcePosition.y + 3;

          const x2 =
            targetPosition.x + 5;

          const y2 =
            targetPosition.y + 3;

          const midY =
            (y1 + y2) / 2;

          return (
            <path
              key={edge.id}
              d={`
                M ${x1} ${y1}
                C ${x1} ${midY},
                  ${x2} ${midY},
                  ${x2} ${y2}
              `}
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* ================================================================ */}
      {/* NODES                                                             */}
      {/* ================================================================ */}

      {nodes.map((node) => {
        const position =
          getPosition(node);

        const selected =
          Boolean(node.selected);

        return (
          <div
            key={node.id}
            className={[
              'absolute',
              'h-[6px]',
              'w-[22px]',
              'rounded-[2px]',
              'border',
              'transition-colors',

              selected
                ? 'border-blue-500 bg-blue-500'
                : 'border-slate-300 bg-slate-400',
            ].join(' ')}
            style={{
              left:
                position.x,
              top:
                position.y,
            }}
          />
        );
      })}
    </div>
  );
}