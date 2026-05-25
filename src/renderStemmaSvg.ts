// v0.39.0 — render_stemma_svg.
//
// Panel-review §3.24 / Yamamoto: "the rooted Newick string is great but
// she needs a tree image for her dissertation." This renders a Newick
// tree (rooted, from v0.33 build_stemma_with_rooting) as an SVG string
// suitable for direct embedding in HTML/Markdown or saving to a .svg
// file for FigTree-equivalent visualization without external deps.
//
// Algorithm: parse Newick into an undirected edge list (reusing the
// v0.33 parser indirectly via a local copy), BFS-tree from the
// designated root, lay out leaves at uniform y-spacing, place internal
// nodes at the midpoint of their children. SVG output uses standard
// phylogram conventions: horizontal branches, branch-length-proportional
// x-positions, leaf labels right-aligned.

export type RenderStemmaSvgOptions = {
  newick: string;
  width?: number;            // SVG canvas width in px. Default 800.
  height?: number;           // default = 30 * leaf_count + 60
  margin?: number;           // px margin around tree. Default 40.
  branchScale?: number;      // px per unit branch length. Auto-fit if omitted.
  fontSize?: number;         // px label font-size. Default 12.
  showInternalLabels?: boolean; // default false
  title?: string;            // optional title text rendered above the tree
};

export type RenderStemmaSvgResult = {
  svg: string;
  width: number;
  height: number;
  leaf_count: number;
  internal_count: number;
  total_branch_length: number;
  warnings: string[];
};

// ─── Newick parser (local copy to keep this module self-contained) ─────────

type Edge = { a: string; b: string; bl: number };

function parseNewick(s: string): { edges: Edge[]; rootLabel: string } {
  const src = s.trim().replace(/;$/, "");
  let pos = 0;
  const edges: Edge[] = [];
  let internalCounter = 0;

  function genInternalId(label: string): string {
    if (label) return label;
    internalCounter++;
    return `_INT_${internalCounter}`;
  }

  function readLabel(): string {
    let out = "";
    if (src[pos] === "'") {
      pos++;
      while (pos < src.length && src[pos] !== "'") out += src[pos++];
      pos++;
    } else {
      while (pos < src.length && !"(),:;".includes(src[pos])) out += src[pos++];
    }
    return out;
  }

  function readBranchLength(): number {
    if (src[pos] !== ":") return 0;
    pos++;
    let num = "";
    while (pos < src.length && /[-0-9.eE+]/.test(src[pos])) num += src[pos++];
    const n = parseFloat(num);
    return isFinite(n) ? n : 0;
  }

  function parseNode(): string {
    if (src[pos] === "(") {
      pos++;
      const children: Array<{ id: string; bl: number }> = [];
      while (true) {
        const childLabel = parseNode();
        const bl = readBranchLength();
        children.push({ id: childLabel, bl });
        if (src[pos] === ",") {
          pos++;
          continue;
        } else if (src[pos] === ")") {
          pos++;
          break;
        } else {
          break;
        }
      }
      const label = genInternalId(readLabel());
      for (const c of children) edges.push({ a: label, b: c.id, bl: c.bl });
      return label;
    } else {
      return readLabel();
    }
  }

  const rootLabel = parseNode();
  return { edges, rootLabel };
}

// ─── Layout helpers ────────────────────────────────────────────────────────

type LayoutNode = {
  id: string;
  isLeaf: boolean;
  children: LayoutNode[];
  parent: LayoutNode | null;
  branchLength: number;
  depth: number;
  x: number;
  y: number;
};

function buildTree(edges: Edge[], rootId: string): LayoutNode {
  // Convert edges to adjacency.
  const adj = new Map<string, Array<{ neighbor: string; bl: number }>>();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a)!.push({ neighbor: e.b, bl: e.bl });
    adj.get(e.b)!.push({ neighbor: e.a, bl: e.bl });
  }

  const nodes = new Map<string, LayoutNode>();
  function getNode(id: string): LayoutNode {
    let n = nodes.get(id);
    if (!n) {
      n = { id, isLeaf: false, children: [], parent: null, branchLength: 0, depth: 0, x: 0, y: 0 };
      nodes.set(id, n);
    }
    return n;
  }

  // BFS from root, orient parent → children.
  const root = getNode(rootId);
  const visited = new Set<string>([rootId]);
  const queue: LayoutNode[] = [root];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const { neighbor, bl } of adj.get(cur.id) ?? []) {
      if (visited.has(neighbor)) continue;
      visited.add(neighbor);
      const child = getNode(neighbor);
      child.parent = cur;
      child.branchLength = bl;
      child.depth = cur.depth + bl;
      cur.children.push(child);
      queue.push(child);
    }
  }

  // Mark leaves.
  for (const n of nodes.values()) {
    n.isLeaf = n.children.length === 0;
  }

  return root;
}

function assignLeafYs(root: LayoutNode, yStep: number, yStart: number): number {
  // In-order DFS: assign sequential y to leaves.
  let yCursor = yStart;
  function visit(n: LayoutNode) {
    if (n.isLeaf) {
      n.y = yCursor;
      yCursor += yStep;
      return;
    }
    for (const c of n.children) visit(c);
    // Internal: midpoint of children's y values.
    if (n.children.length > 0) {
      const ys = n.children.map((c) => c.y);
      n.y = (Math.min(...ys) + Math.max(...ys)) / 2;
    }
  }
  visit(root);
  return yCursor;
}

function assignXs(root: LayoutNode, xScale: number, xStart: number): void {
  function visit(n: LayoutNode) {
    n.x = xStart + n.depth * xScale;
    for (const c of n.children) visit(c);
  }
  visit(root);
}

function collectNodes(root: LayoutNode): LayoutNode[] {
  const out: LayoutNode[] = [];
  function visit(n: LayoutNode) {
    out.push(n);
    for (const c of n.children) visit(c);
  }
  visit(root);
  return out;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// ─── Public entry point ────────────────────────────────────────────────────

export function renderStemmaSvg(opts: RenderStemmaSvgOptions): RenderStemmaSvgResult {
  const warnings: string[] = [];
  const fontSize = opts.fontSize ?? 12;
  const margin = opts.margin ?? 40;
  const showInternal = opts.showInternalLabels ?? false;

  let edges: Edge[];
  let rootId: string;
  try {
    const parsed = parseNewick(opts.newick);
    edges = parsed.edges;
    rootId = parsed.rootLabel;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      svg: "",
      width: opts.width ?? 800,
      height: opts.height ?? 200,
      leaf_count: 0,
      internal_count: 0,
      total_branch_length: 0,
      warnings: [`Newick parse failed: ${msg}`],
    };
  }

  if (edges.length === 0) {
    return {
      svg: "",
      width: opts.width ?? 800,
      height: opts.height ?? 200,
      leaf_count: 0,
      internal_count: 0,
      total_branch_length: 0,
      warnings: ["Newick produced zero edges; cannot render"],
    };
  }

  const root = buildTree(edges, rootId);
  const allNodes = collectNodes(root);
  const leaves = allNodes.filter((n) => n.isLeaf);
  const internals = allNodes.filter((n) => !n.isLeaf);

  const leafCount = leaves.length;
  const internalCount = internals.length;
  const width = opts.width ?? 800;
  const height = opts.height ?? Math.max(200, 30 * leafCount + 80);

  // Determine x-axis scale.
  const maxDepth = Math.max(...allNodes.map((n) => n.depth));
  const longestLabel = Math.max(...leaves.map((n) => n.id.length));
  const labelReservedPx = longestLabel * fontSize * 0.55 + 10;
  const xUsable = Math.max(50, width - 2 * margin - labelReservedPx);
  const xScale = opts.branchScale ?? (maxDepth > 0 ? xUsable / maxDepth : 0);
  const totalBl = allNodes.reduce((s, n) => s + n.branchLength, 0);

  // Y layout.
  const yStart = margin + (opts.title ? fontSize + 12 : 0);
  const yEnd = height - margin;
  const yAvailable = Math.max(50, yEnd - yStart);
  const yStep = leafCount > 1 ? yAvailable / (leafCount - 1) : 0;
  assignLeafYs(root, yStep, yStart);
  assignXs(root, xScale, margin);

  // SVG construction.
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif" font-size="${fontSize}">`,
  );
  parts.push(
    `<rect width="100%" height="100%" fill="#ffffff" stroke="#cccccc" stroke-width="1"/>`,
  );

  if (opts.title) {
    parts.push(
      `<text x="${margin}" y="${margin}" font-size="${fontSize + 2}" font-weight="bold">${escapeXml(opts.title)}</text>`,
    );
  }

  // Branches as right-angle (cladogram-style) edges: child connects via a
  // horizontal segment to (parent.x, child.y), then a vertical segment from
  // (parent.x, child.y) to (parent.x, parent.y).
  for (const n of allNodes) {
    if (!n.parent) continue;
    const p = n.parent;
    parts.push(
      `<line x1="${p.x}" y1="${n.y}" x2="${n.x}" y2="${n.y}" stroke="#333" stroke-width="1.2"/>`,
    );
    parts.push(
      `<line x1="${p.x}" y1="${p.y}" x2="${p.x}" y2="${n.y}" stroke="#333" stroke-width="1.2"/>`,
    );
  }

  // Leaf labels (right-aligned to leaf position).
  for (const n of leaves) {
    parts.push(
      `<text x="${n.x + 4}" y="${n.y + fontSize / 3}" text-anchor="start" fill="#000">${escapeXml(n.id)}</text>`,
    );
    // Small leaf dot
    parts.push(
      `<circle cx="${n.x}" cy="${n.y}" r="2" fill="#333"/>`,
    );
  }

  // Internal node labels (optional).
  if (showInternal) {
    for (const n of internals) {
      parts.push(
        `<text x="${n.x - 4}" y="${n.y - 4}" text-anchor="end" fill="#888" font-size="${fontSize - 2}">${escapeXml(n.id)}</text>`,
      );
    }
  }

  parts.push(`</svg>`);

  return {
    svg: parts.join(""),
    width,
    height,
    leaf_count: leafCount,
    internal_count: internalCount,
    total_branch_length: totalBl,
    warnings,
  };
}
