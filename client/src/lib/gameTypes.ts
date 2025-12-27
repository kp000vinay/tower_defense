export type TileType = 'empty' | 'path' | 'wall' | 'base' | 'spawn';

export interface Tile {
  x: number;
  y: number;
  type: TileType;
}

export interface LevelData {
  id: string;
  name: string;
  width: number;
  height: number;
  tiles: Tile[][];
}

export const TILE_COLORS: Record<TileType, string> = {
  empty: 'bg-slate-900/50',
  path: 'bg-slate-700',
  wall: 'bg-slate-800',
  base: 'bg-blue-600',
  spawn: 'bg-red-600',
};

export const DEFAULT_WIDTH = 20;
export const DEFAULT_HEIGHT = 12;
