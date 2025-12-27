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

export type EnemyType = 'standard' | 'scout' | 'tank';

export interface Enemy {
  id: string;
  type: EnemyType;
  x: number; // Float for smooth movement
  y: number;
  pathIndex: number; // The index of the *next* tile they are moving towards
  speed: number;
  health: number;
  maxHealth: number;
  reward: number;
  frozen?: boolean;
}

export const ENEMY_STATS: Record<EnemyType, { health: number; speed: number; reward: number; color: string }> = {
  standard: { health: 100, speed: 2.5, reward: 10, color: 'bg-red-500' },
  scout: { health: 40, speed: 4.5, reward: 5, color: 'bg-yellow-400' },
  tank: { health: 300, speed: 1.2, reward: 25, color: 'bg-blue-600' },
};

export type GameState = 'editing' | 'playing' | 'paused' | 'gameover';

export interface Wave {
  count: number;
  interval: number; // ms between spawns
  types: EnemyType[]; // Pool of enemies to spawn from
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
  originalTile: TileType;
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
