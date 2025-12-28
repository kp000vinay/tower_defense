import { TileType, Tile } from './gameTypes';

interface Point {
  x: number;
  y: number;
}

interface Node extends Point {
  g: number; // Cost from start
  h: number; // Heuristic cost to end
  f: number; // Total cost
  parent: Node | null;
}

// Manhattan distance heuristic
const heuristic = (a: Point, b: Point): number => {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
};

export const findPath = (
  grid: TileType[][],
  start: Point,
  end: Point,
  width: number,
  height: number
): Point[] | null => {
  const openList: Node[] = [];
  const closedList: Set<string> = new Set();

  const startNode: Node = {
    ...start,
    g: 0,
    h: heuristic(start, end),
    f: heuristic(start, end),
    parent: null,
  };

  openList.push(startNode);

  while (openList.length > 0) {
    // Sort by lowest f cost
    openList.sort((a, b) => a.f - b.f);
    const currentNode = openList.shift()!;

    // Check if reached end
    if (currentNode.x === end.x && currentNode.y === end.y) {
      const path: Point[] = [];
      let curr: Node | null = currentNode;
      while (curr) {
        path.unshift({ x: curr.x, y: curr.y });
        curr = curr.parent;
      }
      return path;
    }

    closedList.add(`${currentNode.x},${currentNode.y}`);

    // Get neighbors (up, down, left, right)
    const neighbors: Point[] = [
      { x: currentNode.x, y: currentNode.y - 1 },
      { x: currentNode.x, y: currentNode.y + 1 },
      { x: currentNode.x - 1, y: currentNode.y },
      { x: currentNode.x + 1, y: currentNode.y },
    ];

    for (const neighbor of neighbors) {
      // Check bounds
      if (
        neighbor.x < 0 ||
        neighbor.x >= width ||
        neighbor.y < 0 ||
        neighbor.y >= height
      ) {
        continue;
      }

      // Check if walkable (must be 'path', 'spawn', or 'base')
      // 'empty' and 'wall' are obstacles for enemies
      const tileType = grid[neighbor.y][neighbor.x];
      if (tileType !== 'path' && tileType !== 'spawn' && tileType !== 'base') {
        continue;
      }

      if (closedList.has(`${neighbor.x},${neighbor.y}`)) {
        continue;
      }

      const gScore = currentNode.g + 1;
      const existingNode = openList.find(
        (n) => n.x === neighbor.x && n.y === neighbor.y
      );

      if (!existingNode || gScore < existingNode.g) {
        const newNode: Node = {
          ...neighbor,
          g: gScore,
          h: heuristic(neighbor, end),
          f: gScore + heuristic(neighbor, end),
          parent: currentNode,
        };

        if (!existingNode) {
          openList.push(newNode);
        } else {
          existingNode.g = newNode.g;
          existingNode.f = newNode.f;
          existingNode.parent = newNode.parent;
        }
      }
    }
  }

  return null; // No path found
};
