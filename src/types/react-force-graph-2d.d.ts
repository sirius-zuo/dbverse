// src/types/react-force-graph-2d.d.ts
declare module "react-force-graph-2d" {
  import type { ComponentType } from "react";

  export interface ForceGraph2DProps {
    graphData: { nodes: unknown[]; links: unknown[] };
    nodeId?: string;
    nodeLabel?: string;
    nodeColor?: string;
    linkLabel?: string;
    linkDirectionalArrowLength?: number;
    linkDirectionalArrowRelPos?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onNodeClick?: (node: any) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onLinkClick?: (link: any) => void;
    width?: number;
    height?: number;
  }

  const ForceGraph2D: ComponentType<ForceGraph2DProps>;
  export default ForceGraph2D;
}
