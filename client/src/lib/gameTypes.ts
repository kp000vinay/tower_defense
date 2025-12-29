export type TileType = 'empty' | 'path' | 'wall' | 'base' | 'spawn' | 'turret' | 'sniper' | 'rubble' | 'resource_stone' | 'resource_metal' | 'quarry' | 'forge' | 'abandoned_quarry' | 'abandoned_forge' | 'drone_factory' | 'abandoned_drone_factory' | 'maintenance_hub' | 'wreckage' | 'extraction_point';

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
  tiles: TileType[][];
}

export const TILE_COLORS: Record<TileType, string> = {
  empty: 'bg-slate-900/50',
  path: 'bg-slate-700',
  wall: 'bg-slate-800',
  base: 'bg-blue-600',
  spawn: 'bg-red-600',
  turret: 'bg-yellow-500',
  sniper: 'bg-purple-500',
  rubble: 'bg-stone-600',
  resource_stone: 'bg-stone-400',
  resource_metal: 'bg-cyan-700',
  quarry: 'bg-amber-700',
  forge: 'bg-orange-600',
  abandoned_quarry: 'bg-amber-900/50',
  abandoned_forge: 'bg-orange-900/50',
  drone_factory: 'bg-indigo-600',
  abandoned_drone_factory: 'bg-indigo-900/50',
  maintenance_hub: 'bg-emerald-600',
  wreckage: 'bg-red-900/50',
  extraction_point: 'bg-cyan-400 animate-pulse',
};

export const DEFAULT_WIDTH = 40;
export const DEFAULT_HEIGHT = 30;

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
  lastFired?: number; // For enemies that shoot
  attackRange?: number;
  attackDamage?: number;
  attackCooldown?: number;
  targetId?: string | null; // ID of the building/turret they are targeting
  targetType?: 'turret' | 'building' | 'base' | 'hero';
  path?: {x: number, y: number}[]; // Dynamic path to target
}

export const ENEMY_STATS: Record<EnemyType, { health: number; speed: number; reward: number; color: string }> = {
  standard: { health: 100, speed: 2.5, reward: 10, color: 'bg-red-500' },
  scout: { health: 40, speed: 4.5, reward: 5, color: 'bg-yellow-400' },
  tank: { health: 300, speed: 1.2, reward: 25, color: 'bg-blue-600' },
};

export const TURRET_STATS = {
  baseHealth: 200,
  repairCostPerHp: 0.5, // 1 credit repairs 2 HP
  sniperHealth: 150,
};

export type GameState = 'editing' | 'playing' | 'paused' | 'gameover' | 'victory';

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
  health: number;
  maxHealth: number;
  type: 'standard' | 'sniper';
  isWreckage?: boolean;
}

export interface BuildingEntity {
  id: string;
  x: number;
  y: number;
  type: 'quarry' | 'forge' | 'drone_factory' | 'maintenance_hub';
  health: number;
  maxHealth: number;
  productionRate: number; // Resources per second
  lastProduced: number;
  isWreckage?: boolean;
}

export interface Projectile {
  id: string;
  x: number;
  y: number;
  targetId: string; // Can be enemy ID or turret ID
  speed: number;
  damage: number;
  source: 'turret' | 'enemy' | 'hero';
  isCritical?: boolean;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0 to 1
  maxLife: number;
  color: string;
  size: number;
}

export interface Cost {
  stone: number;
  metal: number;
}

export const TURRET_COST: Cost = { stone: 0, metal: 50 };
export const SNIPER_COST: Cost = { stone: 0, metal: 120 };
export const QUARRY_COST: Cost = { stone: 50, metal: 0 };
export const FORGE_COST: Cost = { stone: 100, metal: 0 };
export const MAINTENANCE_HUB_COST: Cost = { stone: 100, metal: 100 };
export const WALL_COST: Cost = { stone: 10, metal: 0 };
export const PATH_COST: Cost = { stone: 5, metal: 0 };
export const REPAIR_BUILDING_COST: Cost = { stone: 25, metal: 10 };
export const REPAIR_FACTORY_COST: Cost = { stone: 50, metal: 50 };

export const UPGRADE_COST: Cost = { stone: 0, metal: 75 };
export const SNIPER_UPGRADE_COST: Cost = { stone: 0, metal: 150 };
export const KILL_REWARD = 10; 

export interface DamageNumber {
  id: string;
  x: number;
  y: number;
  value: number;
  life: number; // 0 to 1
  color: string;
  isCritical?: boolean;
}

export interface Resources {
  stone: number;
  metal: number;
}

export const FOG_RADIUS = 4; // Radius of visibility around base/buildings

// Drone System Types
export interface Drone {
  id: string;
  x: number;
  y: number;
  targetX: number | null;
  targetY: number | null;
  state: 'idle' | 'moving_to_job' | 'working' | 'returning';
  jobId: string | null;
  speed: number;
  type: 'worker' | 'repair' | 'harvester';
  resourceType?: 'stone' | 'metal';
  carryAmount?: number;
}

export interface ConstructionJob {
  id: string;
  x: number;
  y: number;
  type: 'build_turret' | 'build_sniper' | 'build_quarry' | 'build_forge' | 'build_maintenance_hub' | 'build_drone_factory';
  progress: number; // 0 to 100
  totalWork: number; // Time/ticks needed
  assignedDroneId: string | null;
  status: 'pending' | 'in_progress' | 'completed';
  cost: { stone: number; metal: number };
}

export interface RepairJob {
  id: string;
  targetId: string;
  targetType: 'turret' | 'building';
  x: number;
  y: number;
  assignedDroneId: string | null;
}

// Hero System
export interface Hero {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  speed: number;
  damage: number;
  range: number;
  cooldown: number;
  lastFired: number;
  isMoving: boolean;
  direction: 'up' | 'down' | 'left' | 'right';
}

export const HERO_STATS = {
  maxHealth: 500,
  speed: 4.0,
  damage: 25,
  range: 4,
  cooldown: 500, // ms
};

export const EXTRACTION_TIME = 60; // Seconds to hold the connection
