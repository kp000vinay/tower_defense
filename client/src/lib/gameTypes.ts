export type TileType = 'empty' | 'path' | 'wall' | 'base' | 'spawn' | 'turret';

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
  turret: 'bg-yellow-500',
};

export const DEFAULT_WIDTH = 20;
export const DEFAULT_HEIGHT = 12;

export interface Enemy {
  id: string;
  x: number; // Float for smooth movement
  y: number;
  pathIndex: number; // The index of the *next* tile they are moving towards
  speed: number;
  health: number;
  maxHealth: number;
  frozen?: boolean;
}

export type GameState = 'editing' | 'playing' | 'paused' | 'gameover';

export interface Wave {
  count: number;
  interval: number; // ms between spawns
  enemyHealth: number;
  enemySpeed: number;
}

export interface TurretEntity {
  id: string;
  x: number;
  y: number;
  range: number;
  damage: number;
  cooldown: number;
  lastFired: number;
  targetId: string | null;
  level: number;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string;
  speed: number;
  damage: number;
}

export const TURRET_COST = 50;
export const UPGRADE_COST = 75;
export const KILL_REWARD = 10;
