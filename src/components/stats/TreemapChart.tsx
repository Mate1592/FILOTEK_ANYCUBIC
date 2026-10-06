import React, { useMemo, useState } from 'react';
import { hierarchy, treemap, type HierarchyRectangularNode } from 'd3-hierarchy';
import type { Roll } from '../../shared/types';
import { fmtG } from '../../lib/roll';

interface TreemapProps {
  rolls: Roll[];
  width?: number;
  height?: number;
}

interface TreeNode {
  name: string;
  value?: number;
  colorHex?: string;
  material?: string;
  brand?: string;
  rollId?: string;
  children?: TreeNode[];
}

export function TreemapChart({ rolls, width = 700, height = 340 }: TreemapProps) {
  const [hoveredNode, setHoveredNode] = useState<HierarchyRectangularNode<TreeNode> | null>(null);

  const rootData = useMemo(() => {
    // Group: Material -> Brand -> Roll
    const matMap = new Map<string, Map<string, Roll[]>>();
    rolls.forEach((r) => {
      if (r.remainingWeight <= 0) return;
      if (!matMap.has(r.material)) matMap.set(r.material, new Map());
      const bMap = matMap.get(r.material)!;
      if (!bMap.has(r.brand)) bMap.set(r.brand, []);
      bMap.get(r.brand)!.push(r);
    });

    const children: TreeNode[] = [];
    matMap.forEach((bMap, mat) => {
      const bChildren: TreeNode[] = [];
      bMap.forEach((rList, brand) => {
        const rChildren: TreeNode[] = rList.map((r) => ({
          name: r.colorName,
          value: r.remainingWeight,
          colorHex: r.colorHex,
          material: r.material,
          brand: r.brand,
          rollId: r.id,
        }));
        bChildren.push({
          name: brand,
          children: rChildren,
        });
      });
      children.push({
        name: mat,
        children: bChildren,
      });
    });

    return {
      name: 'root',
      children,
    } as TreeNode;
  }, [rolls]);

  const nodes = useMemo(() => {
    if (!rootData.children || rootData.children.length === 0) return [];
    const root = hierarchy(rootData)
      .sum((d) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const tree = treemap<TreeNode>()
      .size([width, height])
      .paddingOuter(3)
      .paddingTop(14)
      .paddingInner(2)
      .round(true);

    tree(root);
    return root.leaves() as HierarchyRectangularNode<TreeNode>[];
  }, [rootData, width, height]);

  if (nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-xs text-faint">
        Sin bobinas con filamento disponible para el mapa de inventario.
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-line bg-surface-1 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted uppercase tracking-wider">
          Treemap de inventario (Material → Marca → Rollo)
        </span>
        {hoveredNode && (
          <span className="text-xs font-mono text-text font-bold">
            {hoveredNode.data.material} · {hoveredNode.data.brand} · {hoveredNode.data.name} (
            {fmtG(hoveredNode.data.value || 0)})
          </span>
        )}
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[380px] rounded-xl overflow-hidden"
        >
          {nodes.map((node, i) => {
            const w = node.x1 - node.x0;
            const h = node.y1 - node.y0;
            if (w <= 0 || h <= 0) return null;
            const isHovered = hoveredNode === node;
            const color = node.data.colorHex || '#3a7bd5';

            return (
              <g
                key={i}
                transform={`translate(${node.x0}, ${node.y0})`}
                onMouseEnter={() => setHoveredNode(node)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer transition-opacity"
                opacity={hoveredNode && !isHovered ? 0.6 : 1}
              >
                <rect
                  width={w}
                  height={h}
                  fill={color}
                  rx={4}
                  stroke="var(--elevated)"
                  strokeWidth={1.5}
                />
                {w > 45 && h > 28 && (
                  <text
                    x={6}
                    y={16}
                    fill="#fff"
                    fontSize={10.5}
                    fontWeight={600}
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.85)' }}
                    className="pointer-events-none truncate"
                  >
                    {node.data.name}
                  </text>
                )}
                {w > 45 && h > 42 && (
                  <text
                    x={6}
                    y={30}
                    fill="rgba(255,255,255,0.9)"
                    fontSize={9.5}
                    fontFamily="monospace"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.85)' }}
                    className="pointer-events-none"
                  >
                    {fmtG(node.data.value || 0)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
