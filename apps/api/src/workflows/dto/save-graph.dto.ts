// SaveGraphDto accepts a backend-friendly shape coming from the frontend
// nodes: { id, type?, label?, positionX, positionY, config? }
// edges: { id, source, target, sourceHandle?, targetHandle? }

export class GraphNodeDto {
  id!: string;
  type?: string | null;
  label?: string;
  positionX!: number;
  positionY!: number;
  config?: Record<string, any>;
}

export class GraphEdgeDto {
  id!: string;
  sourceNodeId!: string; // source node id
  targetNodeId!: string; // target node id
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export class SaveGraphDto {
  nodes!: GraphNodeDto[];
  edges!: GraphEdgeDto[];
}