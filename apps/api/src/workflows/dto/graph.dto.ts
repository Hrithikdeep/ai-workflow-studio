// Response DTOs use the DB-friendly shape so the frontend can map them easily

export class GraphNodeResponseDto {
  id!: string;
  type?: string | null;
  label?: string;
  positionX!: number;
  positionY!: number;
  config?: Record<string, any>;
}

export class GraphEdgeResponseDto {
  id!: string;
  sourceNodeId!: string;
  targetNodeId!: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export class GraphResponseDto {
  nodes!: GraphNodeResponseDto[];
  edges!: GraphEdgeResponseDto[];
}