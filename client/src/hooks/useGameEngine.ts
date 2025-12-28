import { useState, useEffect, useRef, useCallback } from 'react';
import { TileType, Enemy, GameState, Wave, TurretEntity, BuildingEntity, Projectile, Particle, DamageNumber, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, KILL_REWARD, ENEMY_STATS, EnemyType, TURRET_STATS, Resources, QUARRY_COST, FORGE_COST, WALL_COST, PATH_COST, REPAIR_BUILDING_COST, FOG_RADIUS, REPAIR_FACTORY_COST, Drone, ConstructionJob, MAINTENANCE_HUB_COST } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';

const TICK_RATE = 60; // FPS
const TICK_MS = 1000 / TICK_RATE;

export function useGameEngine(
  width: number, 
  height: number, 
  grid: TileType[][],
  pathPreview: {x: number, y: number}[] | null,
  onTurretDestroyed?: (x: number, y: number, originalTile: TileType) => void,
  onJobComplete?: (x: number, y: number, type: TileType) => void
) {
  const [gameState, setGameState] = useState<GameState>('editing');
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [damageNumbers, setDamageNumbers] = useState<DamageNumber[]>([]);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(20);
  const [resources, setResources] = useState<Resources>({ stone: 50, metal: 20 }); // Start with just enough to repair
  const [highScore, setHighScore] = useState(0);
  const [visibleTiles, setVisibleTiles] = useState<boolean[][]>([]);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [jobs, setJobs] = useState<ConstructionJob[]>([]);
  const [currentWave, setCurrentWave] = useState<Wave>({
    count: 5,
    interval: 1500,
    types: ['standard']
  });

  // Load high score on mount
  useEffect(() => {
    const saved = localStorage.getItem('std-highscore');
    if (saved) setHighScore(parseInt(saved));
  }, []);
  
  // Refs for mutable state in game loop
  const enemiesRef = useRef<Enemy[]>([]);
  const turretsRef = useRef<TurretEntity[]>([]);
  const buildingsRef = useRef<BuildingEntity[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const damageNumbersRef = useRef<DamageNumber[]>([]);
  const dronesRef = useRef<Drone[]>([]);
  const jobsRef = useRef<ConstructionJob[]>([]);
  const pathRef = useRef<{x: number, y: number}[] | null>(null);
  const frameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const enemiesToSpawnRef = useRef<number>(0);
  
  // Initialize path when pathPreview changes
  useEffect(() => {
    pathRef.current = pathPreview;
  }, [pathPreview]);

  // Fog of War Logic
  const updateVisibility = useCallback(() => {
    const newVisible = Array(height).fill(null).map(() => Array(width).fill(false));
    
    const reveal = (cx: number, cy: number, radius: number) => {
      for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) {
        for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) {
          if (Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2)) <= radius) {
            newVisible[y][x] = true;
          }
        }
      }
    };

    // Reveal around base
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === 'base') {
          reveal(x, y, FOG_RADIUS);
        }
        // Reveal around active buildings and turrets
        if (grid[y][x] === 'quarry' || grid[y][x] === 'forge' || grid[y][x] === 'turret' || grid[y][x] === 'sniper' || grid[y][x] === 'drone_factory' || grid[y][x] === 'maintenance_hub') {
          reveal(x, y, FOG_RADIUS - 1);
        }
        // Reveal path
        if (grid[y][x] === 'path') {
          reveal(x, y, 2);
        }
      }
    }
    
    setVisibleTiles(newVisible);
  }, [grid, width, height]);

  // Update visibility when grid changes
  useEffect(() => {
    updateVisibility();
  }, [grid, updateVisibility]);

  const startGame = useCallback(() => {
    // Check if spawn is visible/discovered
    let spawnFound = false;
    for(let y=0; y<height; y++) {
      for(let x=0; x<width; x++) {
        if (grid[y][x] === 'spawn' && visibleTiles[y][x]) {
          spawnFound = true;
        }
      }
    }

    if (!spawnFound) {
      alert("Enemy spawn point not yet discovered! Explore more.");
      return;
    }

    if (!pathRef.current) {
      alert("No valid path from Spawn to Base!");
      return;
    }
    setGameState('playing');
    setLives(20);
    // Keep current resources
    setWave(1);
    setEnemies([]);
    setProjectiles([]);
    setDamageNumbers([]);
    setDrones([]);
    setJobs([]);
    enemiesRef.current = [];
    projectilesRef.current = [];
    damageNumbersRef.current = [];
    dronesRef.current = [];
    jobsRef.current = [];
    
    // Initialize turrets and buildings from grid
    turretsRef.current = [];
    buildingsRef.current = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = grid[y][x];
        if (tile === 'turret' || tile === 'sniper') {
          const isSniper = tile === 'sniper';
          turretsRef.current.push({
            id: crypto.randomUUID(),
            x,
            y,
            range: isSniper ? 7.0 : 3.5,
            damage: isSniper ? 100 : 20,
            cooldown: isSniper ? 2000 : 800, // ms
            lastFired: 0,
            targetId: null,
            level: 1,
            originalTile: 'empty', // Default for pre-placed turrets
            health: isSniper ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
            maxHealth: isSniper ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
            type: isSniper ? 'sniper' : 'standard',
            isWreckage: false
          });
        } else if (tile === 'quarry' || tile === 'forge' || tile === 'drone_factory' || tile === 'maintenance_hub') {
          buildingsRef.current.push({
            id: crypto.randomUUID(),
            x,
            y,
            type: tile,
            health: 100,
            maxHealth: 100,
            productionRate: tile === 'quarry' ? 2 : 1, // Quarry: 2 stone/sec, Forge: 1 metal/sec
            lastProduced: 0,
            isWreckage: false
          });
          
          // Spawn initial drones for factory
          if (tile === 'drone_factory') {
            for(let i=0; i<3; i++) {
              dronesRef.current.push({
                id: crypto.randomUUID(),
                x,
                y,
                targetX: null,
                targetY: null,
                state: 'idle',
                jobId: null,
                speed: 3.0,
                type: 'worker'
              });
            }
          } else if (tile === 'maintenance_hub') {
            for(let i=0; i<2; i++) {
              dronesRef.current.push({
                id: crypto.randomUUID(),
                x,
                y,
                targetX: null,
                targetY: null,
                state: 'idle',
                jobId: null,
                speed: 4.0,
                type: 'repair'
              });
            }
          }
        }
      }
    }
    
    // Setup first wave
    enemiesToSpawnRef.current = 5;
    spawnTimerRef.current = 0;
  }, [grid, width, height, visibleTiles]);

  const stopGame = useCallback(() => {
    setGameState('editing');
    setEnemies([]);
    enemiesRef.current = [];
  }, []);

  const spawnEnemy = (startPos: {x: number, y: number}) => {
    // Pick random type from current wave pool
    const type = currentWave.types[Math.floor(Math.random() * currentWave.types.length)];
    const stats = ENEMY_STATS[type];
    
    // Scale stats by wave number
    const healthMultiplier = 1 + (wave - 1) * 0.2;
    
    const newEnemy: Enemy = {
      id: crypto.randomUUID(),
      type,
      x: startPos.x,
      y: startPos.y,
      pathIndex: 1,
      speed: stats.speed,
      health: stats.health * healthMultiplier,
      maxHealth: stats.health * healthMultiplier,
      reward: stats.reward,
      targetId: null,
      targetType: undefined,
      path: undefined
    };
    enemiesRef.current.push(newEnemy);
  };

  // Helper to find nearest target for enemy
  const findNearestTarget = (enemy: Enemy) => {
    let nearestDist = Infinity;
    let nearestTarget: { id: string, type: 'turret' | 'building' | 'base', x: number, y: number } | null = null;

    // Check Base
    for(let y=0; y<height; y++) {
      for(let x=0; x<width; x++) {
        if (grid[y][x] === 'base') {
          const dist = Math.sqrt(Math.pow(x - enemy.x, 2) + Math.pow(y - enemy.y, 2));
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestTarget = { id: 'base', type: 'base', x, y };
          }
        }
      }
    }

    // Check Turrets (only active ones)
    turretsRef.current.forEach(t => {
      if (t.isWreckage) return;
      const dist = Math.sqrt(Math.pow(t.x - enemy.x, 2) + Math.pow(t.y - enemy.y, 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTarget = { id: t.id, type: 'turret', x: t.x, y: t.y };
      }
    });

    // Check Buildings (only active ones)
    buildingsRef.current.forEach(b => {
      if (b.isWreckage) return;
      const dist = Math.sqrt(Math.pow(b.x - enemy.x, 2) + Math.pow(b.y - enemy.y, 2));
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTarget = { id: b.id, type: 'building', x: b.x, y: b.y };
      }
    });

    return nearestTarget;
  };

  // Define updateGame BEFORE it is used in useEffect
  const updateGame = (deltaTime: number) => {
    // Initialize nextProjectiles at the start of the function
    const nextProjectiles: Projectile[] = [];
    let stoneEarned = 0;
    let metalEarned = 0;
    let metalSpent = 0; // For repairs

    // Resource Production
    const now = performance.now();
    buildingsRef.current.forEach(building => {
      if (building.isWreckage) return; // Wreckage produces nothing
      if (now - building.lastProduced >= 1000) { // Produce every second
        if (building.type === 'quarry') {
          stoneEarned += building.productionRate;
        } else if (building.type === 'forge') {
          metalEarned += building.productionRate;
        }
        building.lastProduced = now;
      }
    });

    // Spawning Logic
    if (enemiesToSpawnRef.current > 0) {
      spawnTimerRef.current += deltaTime;
      if (spawnTimerRef.current > currentWave.interval) {
        // Find spawn point
        let spawnPoint = { x: 0, y: 0 };
        for(let y=0; y<height; y++) {
          for(let x=0; x<width; x++) {
            if (grid[y][x] === 'spawn') spawnPoint = { x, y };
          }
        }
        spawnEnemy(spawnPoint);
        spawnTimerRef.current = 0;
        enemiesToSpawnRef.current--;
      }
    } else if (enemiesRef.current.length === 0 && lives > 0) {
      // Wave Complete
      setWave(w => {
        const nextWave = w + 1;
        
        // Dynamic Wave Composition
        let types: EnemyType[] = ['standard'];
        if (nextWave >= 3) types.push('scout');
        if (nextWave >= 6) types.push('tank');
        
        setCurrentWave(prev => ({
          count: Math.floor(prev.count * 1.2) + 2,
          interval: Math.max(300, prev.interval - 20),
          types: types
        }));
        
        enemiesToSpawnRef.current = Math.floor(currentWave.count * 1.2) + 2;
        return nextWave;
      });
    }

    // Move Enemies
    let nextEnemies: Enemy[] = [];
    let livesLost = 0;

    enemiesRef.current.forEach(enemy => {
      // 1. Acquire Target if needed
      if (!enemy.targetId) {
        const target = findNearestTarget(enemy);
        if (target) {
          enemy.targetId = target.id;
          enemy.targetType = target.type;
          // Calculate path to target
          const start = { x: Math.round(enemy.x), y: Math.round(enemy.y) };
          const end = { x: target.x, y: target.y };
          // Simple pathfinding: use existing findPath but allow moving through empty space if needed?
          // For now, let's use the main grid pathfinding which respects walls
          const path = findPath(grid, start, end, width, height);
          if (path) {
            enemy.path = path;
            enemy.pathIndex = 0;
          } else {
            // If no path (blocked), attack nearest wall? Or just move directly?
            // Fallback: move directly towards target (flying/ghosting) or just stay put
            enemy.path = [end]; // Try to go straight there
            enemy.pathIndex = 0;
          }
        }
      }

      // 2. Check if close enough to attack target
      let canAttack = false;
      let targetEntity: { x: number, y: number, health: number, isWreckage?: boolean } | null = null;

      if (enemy.targetType === 'base') {
        // Base is always at specific coords, check distance
        // For simplicity, base is "attacked" when enemy reaches it (lives lost)
        // But now we want them to attack it like a building.
        // Let's keep the "reach base = damage" mechanic for the Base specifically for now,
        // OR make the base have HP. The prompt says "attack the user location", implying base.
        // Let's stick to: if target is base, move to it. If reached, deduct lives (damage base).
      } else if (enemy.targetType === 'turret') {
        const t = turretsRef.current.find(t => t.id === enemy.targetId);
        if (t && !t.isWreckage) targetEntity = t;
        else enemy.targetId = null; // Target dead or wreckage
      } else if (enemy.targetType === 'building') {
        const b = buildingsRef.current.find(b => b.id === enemy.targetId);
        if (b && !b.isWreckage) targetEntity = b;
        else enemy.targetId = null; // Target dead or wreckage
      }

      if (targetEntity) {
        const dist = Math.sqrt(Math.pow(targetEntity.x - enemy.x, 2) + Math.pow(targetEntity.y - enemy.y, 2));
        if (dist < 1.5) { // Attack range
          canAttack = true;
        }
      }

      // 3. Move or Attack
      if (canAttack && targetEntity && enemy.targetType !== 'base') {
        // Attack!
        if (!enemy.lastFired || now - enemy.lastFired > 1000) {
          // Deal damage
          if (enemy.targetType === 'turret') {
            const t = turretsRef.current.find(t => t.id === enemy.targetId);
            if (t) {
              t.health -= 10; // Enemy damage
              // Visuals
              damageNumbersRef.current.push({
                id: crypto.randomUUID(),
                x: t.x,
                y: t.y,
                value: 10,
                life: 1.0,
                color: '#ef4444'
              });
              if (t.health <= 0) {
                // Destroy turret -> Wreckage
                t.health = 0;
                t.isWreckage = true;
                // if (onTurretDestroyed) onTurretDestroyed(t.x, t.y, t.originalTile); // Don't remove tile yet
                enemy.targetId = null; // Find new target next frame
              }
            }
          } else if (enemy.targetType === 'building') {
            const b = buildingsRef.current.find(b => b.id === enemy.targetId);
            if (b) {
              b.health -= 10;
              damageNumbersRef.current.push({
                id: crypto.randomUUID(),
                x: b.x,
                y: b.y,
                value: 10,
                life: 1.0,
                color: '#ef4444'
              });
              if (b.health <= 0) {
                // Destroy building -> Wreckage
                b.health = 0;
                b.isWreckage = true;
                // if (onTurretDestroyed) onTurretDestroyed(b.x, b.y, 'empty'); // Don't remove tile yet
                enemy.targetId = null;
              }
            }
          }
          enemy.lastFired = now;
        }
      } else {
        // Move
        if (enemy.path && enemy.pathIndex < enemy.path.length) {
          const targetNode = enemy.path[enemy.pathIndex];
          const dx = targetNode.x - enemy.x;
          const dy = targetNode.y - enemy.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const moveDist = (enemy.speed * deltaTime) / 1000;

          if (dist <= moveDist) {
            enemy.x = targetNode.x;
            enemy.y = targetNode.y;
            enemy.pathIndex++;
            
            // Check if reached end of path (Base)
            if (enemy.pathIndex >= enemy.path.length && enemy.targetType === 'base') {
              livesLost++;
              return; // Remove enemy
            }
          } else {
            enemy.x += (dx / dist) * moveDist;
            enemy.y += (dy / dist) * moveDist;
          }
        } else if (!enemy.path && enemy.targetType === 'base') {
           // Fallback if no path found but target is base (shouldn't happen with valid map)
           livesLost++;
           return;
        } else {
           // Re-calculate path if stuck or finished path but not at target
           enemy.targetId = null; 
        }
      }

      nextEnemies.push(enemy);
    });

    // Turret Logic (Targeting & Firing)
    turretsRef.current.forEach(turret => {
      if (turret.isWreckage) return; // Wreckage cannot fire

      // Find target if none or dead/out of range
      if (turret.targetId) {
        const target = nextEnemies.find(e => e.id === turret.targetId);
        if (!target) {
          turret.targetId = null;
        } else {
          const dist = Math.sqrt(Math.pow(target.x - turret.x, 2) + Math.pow(target.y - turret.y, 2));
          if (dist > turret.range) {
            turret.targetId = null;
          }
        }
      }

      if (!turret.targetId) {
        // Find closest enemy
        let closestDist = turret.range;
        let closestId: string | null = null;

        nextEnemies.forEach(enemy => {
          const dist = Math.sqrt(Math.pow(enemy.x - turret.x, 2) + Math.pow(enemy.y - turret.y, 2));
          if (dist <= closestDist) {
            closestDist = dist;
            closestId = enemy.id;
          }
        });

        turret.targetId = closestId;
      }

      // Fire
      if (turret.targetId && now - turret.lastFired >= turret.cooldown) {
        const target = nextEnemies.find(e => e.id === turret.targetId);
        if (target) {
          // Spawn projectile
          nextProjectiles.push({
            id: crypto.randomUUID(),
            x: turret.x,
            y: turret.y,
            targetId: turret.targetId,
            speed: 15, // Tiles per second
            damage: turret.damage,
            source: 'turret',
            isCritical: turret.type === 'sniper' ? Math.random() < 0.25 : Math.random() < 0.1
          });
          turret.lastFired = now;
        }
      }
    });

    // Projectile Movement & Collision
    const survivingProjectiles: Projectile[] = [];
    projectilesRef.current.forEach(proj => {
      const target = nextEnemies.find(e => e.id === proj.targetId);
      if (!target) {
        // Target dead, remove projectile (or make it travel to last known pos? For now remove)
        return;
      }

      const dx = target.x - proj.x;
      const dy = target.y - proj.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const moveDist = (proj.speed * deltaTime) / 1000;

      if (dist <= moveDist) {
        // Hit!
        const damage = proj.isCritical ? proj.damage * 1.5 : proj.damage;
        target.health -= damage;
        
        // Damage Number
        damageNumbersRef.current.push({
          id: crypto.randomUUID(),
          x: target.x,
          y: target.y,
          value: damage,
          life: 1.0,
          color: proj.isCritical ? '#fbbf24' : '#ffffff',
          isCritical: proj.isCritical
        });

        // Particles
        for(let i=0; i<5; i++) {
          particlesRef.current.push({
            id: crypto.randomUUID(),
            x: target.x,
            y: target.y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            maxLife: 0.5 + Math.random() * 0.5,
            color: target.type === 'tank' ? '#3b82f6' : '#ef4444',
            size: Math.random() * 0.1 + 0.05
          });
        }

        if (target.health <= 0) {
          // Enemy killed
          stoneEarned += 5; // Small resource reward for kills
          metalEarned += 5;
          setHighScore(s => s + target.reward);
        }
      } else {
        proj.x += (dx / dist) * moveDist;
        proj.y += (dy / dist) * moveDist;
        survivingProjectiles.push(proj);
      }
    });

    // Filter dead enemies
    nextEnemies = nextEnemies.filter(e => e.health > 0);

    // Update Particles
    const nextParticles = particlesRef.current
      .map(p => ({
        ...p,
        x: p.x + p.vx * (deltaTime / 1000),
        y: p.y + p.vy * (deltaTime / 1000),
        life: p.life - (deltaTime / 1000) / p.maxLife
      }))
      .filter(p => p.life > 0);
    particlesRef.current = nextParticles;

    // Update Damage Numbers
    const nextDamageNumbers = damageNumbersRef.current
      .map(d => ({
        ...d,
        y: d.y - 1 * (deltaTime / 1000), // Float up
        life: d.life - (deltaTime / 1000)
      }))
      .filter(d => d.life > 0);
    damageNumbersRef.current = nextDamageNumbers;

    // Drone Logic
    dronesRef.current.forEach(drone => {
      if (drone.type === 'worker') {
        if (drone.state === 'idle') {
          // Find pending job
          const job = jobsRef.current.find(j => j.status === 'pending');
          if (job) {
            job.status = 'in_progress';
            job.assignedDroneId = drone.id;
            drone.state = 'moving_to_job';
            drone.jobId = job.id;
            drone.targetX = job.x;
            drone.targetY = job.y;
          }
        } else if (drone.state === 'moving_to_job') {
          if (drone.targetX !== null && drone.targetY !== null) {
            const dx = drone.targetX - drone.x;
            const dy = drone.targetY - drone.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const moveDist = (drone.speed * deltaTime) / 1000;

            if (dist <= moveDist) {
              drone.x = drone.targetX;
              drone.y = drone.targetY;
              drone.state = 'working';
            } else {
              drone.x += (dx / dist) * moveDist;
              drone.y += (dy / dist) * moveDist;
            }
          }
        } else if (drone.state === 'working') {
          const job = jobsRef.current.find(j => j.id === drone.jobId);
          if (job) {
            job.progress += (deltaTime / 1000) * 20; // 20% per second = 5 seconds total
            if (job.progress >= 100) {
              job.status = 'completed';
              drone.state = 'returning';
              // Find factory to return to
              const factory = buildingsRef.current.find(b => b.type === 'drone_factory' && !b.isWreckage);
              if (factory) {
                drone.targetX = factory.x;
                drone.targetY = factory.y;
              } else {
                // If factory destroyed, just go to base
                const base = grid.flat().findIndex(t => t === 'base'); // Simplified
                // ... actually just stay put or idle
                drone.state = 'idle';
                drone.jobId = null;
              }
              
              // Complete the building
              if (onJobComplete) {
                let tileType: TileType = 'turret';
                if (job.type === 'build_sniper') tileType = 'sniper';
                if (job.type === 'build_quarry') tileType = 'quarry';
                if (job.type === 'build_forge') tileType = 'forge';
                if (job.type === 'build_maintenance_hub') tileType = 'maintenance_hub';
                onJobComplete(job.x, job.y, tileType);
                
                // Add to entities immediately so it works without waiting for next render cycle
                if (tileType === 'turret' || tileType === 'sniper') {
                  turretsRef.current.push({
                    id: crypto.randomUUID(),
                    x: job.x,
                    y: job.y,
                    range: tileType === 'sniper' ? 7.0 : 3.5,
                    damage: tileType === 'sniper' ? 100 : 20,
                    cooldown: tileType === 'sniper' ? 2000 : 800,
                    lastFired: 0,
                    targetId: null,
                    level: 1,
                    originalTile: 'empty',
                    health: tileType === 'sniper' ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
                    maxHealth: tileType === 'sniper' ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
                    type: tileType === 'sniper' ? 'sniper' : 'standard',
                    isWreckage: false
                  });
                } else {
                  buildingsRef.current.push({
                    id: crypto.randomUUID(),
                    x: job.x,
                    y: job.y,
                    type: tileType as any,
                    health: 100,
                    maxHealth: 100,
                    productionRate: tileType === 'quarry' ? 2 : 1,
                    lastProduced: performance.now(),
                    isWreckage: false
                  });
                  
                  if (tileType === 'maintenance_hub') {
                    for(let i=0; i<2; i++) {
                      dronesRef.current.push({
                        id: crypto.randomUUID(),
                        x: job.x,
                        y: job.y,
                        targetX: null,
                        targetY: null,
                        state: 'idle',
                        jobId: null,
                        speed: 4.0,
                        type: 'repair'
                      });
                    }
                  }
                }
              }
            }
          } else {
            // Job cancelled/gone
            drone.state = 'idle';
            drone.jobId = null;
          }
        } else if (drone.state === 'returning') {
          if (drone.targetX !== null && drone.targetY !== null) {
            const dx = drone.targetX - drone.x;
            const dy = drone.targetY - drone.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const moveDist = (drone.speed * deltaTime) / 1000;

            if (dist <= moveDist) {
              drone.x = drone.targetX;
              drone.y = drone.targetY;
              drone.state = 'idle';
              drone.jobId = null;
            } else {
              drone.x += (dx / dist) * moveDist;
              drone.y += (dy / dist) * moveDist;
            }
          }
        }
      } else if (drone.type === 'repair') {
        // Repair Drone Logic
        if (drone.state === 'idle') {
          // Find damaged building/turret OR Wreckage
          let target: { id: string, x: number, y: number, type: 'turret' | 'building' } | null = null;
          
          // Check Turrets (prioritize wreckage?)
          const damagedTurret = turretsRef.current.find(t => t.health < t.maxHealth);
          if (damagedTurret) {
            target = { id: damagedTurret.id, x: damagedTurret.x, y: damagedTurret.y, type: 'turret' };
          } else {
            // Check Buildings
            const damagedBuilding = buildingsRef.current.find(b => b.health < b.maxHealth);
            if (damagedBuilding) {
              target = { id: damagedBuilding.id, x: damagedBuilding.x, y: damagedBuilding.y, type: 'building' };
            }
          }

          if (target) {
            drone.state = 'moving_to_job';
            drone.jobId = target.id; // Use entity ID as job ID for repair
            drone.targetX = target.x;
            drone.targetY = target.y;
          }
        } else if (drone.state === 'moving_to_job') {
          if (drone.targetX !== null && drone.targetY !== null) {
            const dx = drone.targetX - drone.x;
            const dy = drone.targetY - drone.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const moveDist = (drone.speed * deltaTime) / 1000;

            if (dist <= moveDist) {
              drone.x = drone.targetX;
              drone.y = drone.targetY;
              drone.state = 'working';
            } else {
              drone.x += (dx / dist) * moveDist;
              drone.y += (dy / dist) * moveDist;
            }
          }
        } else if (drone.state === 'working') {
          // Repair logic
          let entity: { health: number, maxHealth: number, isWreckage?: boolean } | undefined;
          // Try to find in turrets first
          let t = turretsRef.current.find(t => t.id === drone.jobId);
          if (t) entity = t;
          else {
            let b = buildingsRef.current.find(b => b.id === drone.jobId);
            if (b) entity = b;
          }

          if (entity && entity.health < entity.maxHealth) {
            // Repair cost
            if (resources.metal >= 1) { // Need metal to repair
               // Repair rate: 10 HP per second
               const repairAmount = 10 * (deltaTime / 1000);
               entity.health = Math.min(entity.maxHealth, entity.health + repairAmount);
               
               // Cost: 1 metal per 2 HP repaired -> 0.5 metal per HP
               metalSpent += repairAmount * 0.5;

               // If fully repaired, remove wreckage status
               if (entity.health >= entity.maxHealth) {
                 entity.isWreckage = false;
               }
            } else {
              // Out of metal, return home
              drone.state = 'returning';
              const hub = buildingsRef.current.find(b => b.type === 'maintenance_hub' && !b.isWreckage);
              if (hub) {
                drone.targetX = hub.x;
                drone.targetY = hub.y;
              }
            }
          } else {
            // Fully repaired or entity gone
            drone.state = 'returning';
            const hub = buildingsRef.current.find(b => b.type === 'maintenance_hub' && !b.isWreckage);
            if (hub) {
              drone.targetX = hub.x;
              drone.targetY = hub.y;
            }
          }
        } else if (drone.state === 'returning') {
           if (drone.targetX !== null && drone.targetY !== null) {
            const dx = drone.targetX - drone.x;
            const dy = drone.targetY - drone.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            const moveDist = (drone.speed * deltaTime) / 1000;

            if (dist <= moveDist) {
              drone.x = drone.targetX;
              drone.y = drone.targetY;
              drone.state = 'idle';
              drone.jobId = null;
            } else {
              drone.x += (dx / dist) * moveDist;
              drone.y += (dy / dist) * moveDist;
            }
          }
        }
      }
    });

    // Cleanup completed jobs
    jobsRef.current = jobsRef.current.filter(j => j.status !== 'completed');

    // State Updates
    setEnemies(nextEnemies);
    setProjectiles(survivingProjectiles); // Use surviving projectiles
    setParticles(nextParticles);
    setDamageNumbers(nextDamageNumbers);
    setDrones([...dronesRef.current]);
    setJobs([...jobsRef.current]);
    
    if (livesLost > 0) {
      setLives(l => {
        const newLives = l - livesLost;
        if (newLives <= 0) setGameState('gameover');
        return newLives;
      });
    }

    if (stoneEarned > 0 || metalEarned > 0 || metalSpent > 0) {
      setResources(prev => ({
        stone: prev.stone + stoneEarned,
        metal: Math.max(0, prev.metal + metalEarned - metalSpent)
      }));
    }
  };

  // Game Loop
  useEffect(() => {
    if (gameState !== 'playing') return;

    let lastTime = performance.now();
    
    const loop = (time: number) => {
      const deltaTime = time - lastTime;
      lastTime = time;
      
      updateGame(deltaTime);
      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(frameRef.current);
  }, [gameState]);

  // Actions
  const buildTurret = (x: number, y: number, type: 'standard' | 'sniper') => {
    const cost = type === 'sniper' ? SNIPER_COST : TURRET_COST;
    if (resources.stone >= cost.stone && resources.metal >= cost.metal) {
      setResources(prev => ({
        stone: prev.stone - cost.stone,
        metal: prev.metal - cost.metal
      }));
      
      // Create Job
      jobsRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        type: type === 'sniper' ? 'build_sniper' : 'build_turret',
        progress: 0,
        totalWork: 100,
        assignedDroneId: null,
        status: 'pending',
        cost
      });
      
      return true;
    }
    return false;
  };

  const buildBuilding = (x: number, y: number, type: 'quarry' | 'forge' | 'maintenance_hub') => {
    const cost = type === 'quarry' ? QUARRY_COST : (type === 'forge' ? FORGE_COST : MAINTENANCE_HUB_COST);
    if (resources.stone >= cost.stone && resources.metal >= cost.metal) {
      setResources(prev => ({
        stone: prev.stone - cost.stone,
        metal: prev.metal - cost.metal
      }));

      jobsRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        type: type === 'quarry' ? 'build_quarry' : (type === 'forge' ? 'build_forge' : 'build_maintenance_hub'),
        progress: 0,
        totalWork: 100,
        assignedDroneId: null,
        status: 'pending',
        cost
      });

      return true;
    }
    return false;
  };

  const repairBuilding = (x: number, y: number, type: 'abandoned_quarry' | 'abandoned_forge' | 'abandoned_drone_factory') => {
    const cost = type === 'abandoned_drone_factory' ? REPAIR_FACTORY_COST : REPAIR_BUILDING_COST;
    
    if (resources.stone >= cost.stone && resources.metal >= cost.metal) {
      setResources(prev => ({
        stone: prev.stone - cost.stone,
        metal: prev.metal - cost.metal
      }));

      let newType: TileType;
      if (type === 'abandoned_quarry') newType = 'quarry';
      else if (type === 'abandoned_forge') newType = 'forge';
      else newType = 'drone_factory';

      // Add to entities
      buildingsRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        type: newType as any,
        health: 100,
        maxHealth: 100,
        productionRate: newType === 'quarry' ? 2 : 1,
        lastProduced: performance.now(),
        isWreckage: false
      });

      if (newType === 'drone_factory') {
        for(let i=0; i<3; i++) {
          dronesRef.current.push({
            id: crypto.randomUUID(),
            x,
            y,
            targetX: null,
            targetY: null,
            state: 'idle',
            jobId: null,
            speed: 3.0,
            type: 'worker'
          });
        }
      }

      return newType;
    }
    return null;
  };

  const upgradeTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (turret && !turret.isWreckage) {
      const cost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
      if (resources.metal >= cost.metal) {
        setResources(prev => ({ ...prev, metal: prev.metal - cost.metal }));
        turret.level++;
        turret.damage *= 1.5;
        turret.range *= 1.1;
        return true;
      }
    }
    return false;
  };

  const getTurretAt = (x: number, y: number) => {
    return turretsRef.current.find(t => t.x === x && t.y === y);
  };

  const sellTurret = (x: number, y: number) => {
    const turretIndex = turretsRef.current.findIndex(t => t.x === x && t.y === y);
    if (turretIndex !== -1) {
      const turret = turretsRef.current[turretIndex];
      const baseCost = turret.type === 'sniper' ? SNIPER_COST : TURRET_COST;
      const upgradeCost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
      
      const refundMetal = Math.floor((baseCost.metal + (turret.level - 1) * upgradeCost.metal) * 0.5);
      const refundStone = Math.floor((baseCost.stone + (turret.level - 1) * upgradeCost.stone) * 0.5);

      setResources(prev => ({
        stone: prev.stone + refundStone,
        metal: prev.metal + refundMetal
      }));

      const originalTile = turret.originalTile;
      turretsRef.current.splice(turretIndex, 1);
      return originalTile;
    }
    return null;
  };

  const repairTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (turret && turret.health < turret.maxHealth) {
      const missingHp = turret.maxHealth - turret.health;
      const cost = Math.ceil(missingHp * TURRET_STATS.repairCostPerHp);
      
      if (resources.metal >= cost) {
        setResources(prev => ({ ...prev, metal: prev.metal - cost }));
        turret.health = turret.maxHealth;
        turret.isWreckage = false; // Manual repair also fixes wreckage
        return true;
      }
    }
    return false;
  };

  const clearRubble = (x: number, y: number) => {
    if (resources.stone >= 10) {
      setResources(prev => ({ ...prev, stone: prev.stone - 10 }));
      return true;
    }
    return false;
  };

  return {
    gameState,
    enemies,
    wave,
    lives,
    resources,
    projectiles,
    damageNumbers,
    visibleTiles,
    drones,
    jobs,
    startGame,
    stopGame,
    buildTurret,
    buildBuilding,
    repairBuilding,
    upgradeTurret,
    getTurretAt,
    sellTurret,
    repairTurret,
    clearRubble,
    highScore,
    particles
  };
}
