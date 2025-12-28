import { useState, useEffect, useRef, useCallback } from 'react';
import { TileType, Enemy, GameState, Wave, TurretEntity, BuildingEntity, Projectile, Particle, DamageNumber, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, KILL_REWARD, ENEMY_STATS, EnemyType, TURRET_STATS, Resources, QUARRY_COST, FORGE_COST, WALL_COST, PATH_COST, REPAIR_BUILDING_COST, FOG_RADIUS, REPAIR_FACTORY_COST, Drone, ConstructionJob } from '@/lib/gameTypes';
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
        if (grid[y][x] === 'quarry' || grid[y][x] === 'forge' || grid[y][x] === 'turret' || grid[y][x] === 'sniper' || grid[y][x] === 'drone_factory') {
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
            type: isSniper ? 'sniper' : 'standard'
          });
        } else if (tile === 'quarry' || tile === 'forge' || tile === 'drone_factory') {
          buildingsRef.current.push({
            id: crypto.randomUUID(),
            x,
            y,
            type: tile,
            health: 100,
            maxHealth: 100,
            productionRate: tile === 'quarry' ? 2 : 1, // Quarry: 2 stone/sec, Forge: 1 metal/sec
            lastProduced: 0
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
                speed: 3.0
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
      reward: stats.reward
    };
    enemiesRef.current.push(newEnemy);
  };

  // Define updateGame BEFORE it is used in useEffect
  const updateGame = (deltaTime: number) => {
    const path = pathRef.current;
    if (!path) return;

    // Initialize nextProjectiles at the start of the function
    const nextProjectiles: Projectile[] = [];
    let stoneEarned = 0;
    let metalEarned = 0;

    // Resource Production
    const now = performance.now();
    buildingsRef.current.forEach(building => {
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
        spawnEnemy(path[0]);
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
      // Move towards next path node
      const targetNode = path[enemy.pathIndex];
      
      if (!targetNode) {
        livesLost++;
        return; 
      }

      const dx = targetNode.x - enemy.x;
      const dy = targetNode.y - enemy.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      const moveDist = (enemy.speed * deltaTime) / 1000;

      if (dist <= moveDist) {
        enemy.x = targetNode.x;
        enemy.y = targetNode.y;
        enemy.pathIndex++;
        
        if (enemy.pathIndex >= path.length) {
          livesLost++;
          return; 
        }
      } else {
        enemy.x += (dx / dist) * moveDist;
        enemy.y += (dy / dist) * moveDist;
      }

      nextEnemies.push(enemy);
    });

    // Turret Logic
    turretsRef.current.forEach(turret => {
      if (now - turret.lastFired >= turret.cooldown) {
        // Find target - prioritize tanks (firing enemies)
        let target = nextEnemies.find(e => {
          if (e.type !== 'tank') return false;
          const dx = e.x - turret.x;
          const dy = e.y - turret.y;
          return Math.sqrt(dx*dx + dy*dy) <= turret.range;
        });

        // If no tank found, target any enemy
        if (!target) {
          target = nextEnemies.find(e => {
            const dx = e.x - turret.x;
            const dy = e.y - turret.y;
            return Math.sqrt(dx*dx + dy*dy) <= turret.range;
          });
        }

        if (target) {
          turret.lastFired = now;
          turret.targetId = target.id;
          
          // Calculate critical hit
          const isSniper = turret.type === 'sniper';
          const critChance = isSniper ? 0.25 : 0.1; // 25% for sniper, 10% for standard
          const isCritical = Math.random() < critChance;
          const damage = isCritical ? Math.floor(turret.damage * 1.5) : turret.damage;

          // Spawn projectile
          nextProjectiles.push({
            id: crypto.randomUUID(),
            x: turret.x,
            y: turret.y,
            targetId: target.id,
            speed: 12,
            damage: damage,
            source: 'turret',
            isCritical
          });
        }
      }
    });

    // Enemy Attack Logic (Tanks)
    enemiesRef.current.forEach(enemy => {
      if (enemy.type === 'tank') {
        const now = Date.now();
        // Initialize attack stats if missing
        if (!enemy.attackCooldown) {
          enemy.attackCooldown = 2000;
          enemy.attackRange = 4;
          enemy.attackDamage = 15;
          enemy.lastFired = 0;
        }

        if (now - (enemy.lastFired || 0) >= enemy.attackCooldown!) {
          // Find nearest turret
          let targetTurret: TurretEntity | null = null;
          let minDist = Infinity;

          turretsRef.current.forEach(turret => {
            const dist = Math.sqrt(Math.pow(turret.x - enemy.x, 2) + Math.pow(turret.y - enemy.y, 2));
            if (dist <= enemy.attackRange! && dist < minDist) {
              minDist = dist;
              targetTurret = turret;
            }
          });

          if (targetTurret) {
            enemy.lastFired = now;
            // Fire projectile at turret
            projectilesRef.current.push({
              id: crypto.randomUUID(),
              x: enemy.x,
              y: enemy.y,
              targetId: (targetTurret as TurretEntity).id,
              speed: 8,
              damage: enemy.attackDamage!,
              source: 'enemy'
            });
          }
        }
      }
    });

    // Projectile Logic
    // Spawn damage number
    const spawnDamageNumber = (x: number, y: number, value: number, color: string, isCritical?: boolean) => {
      damageNumbersRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        value,
        life: 1.0,
        color,
        isCritical
      });
    };

    // Spawn explosion particles
    const spawnExplosion = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        particlesRef.current.push({
          id: crypto.randomUUID(),
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1.0,
          maxLife: Math.random() * 0.3 + 0.2, // 0.2-0.5s lifetime
          color,
          size: Math.random() * 3 + 2
        });
      }
    };

    projectilesRef.current.forEach(proj => {
      let targetX = 0;
      let targetY = 0;
      let hit = false;

      if (proj.source === 'turret') {
        const target = nextEnemies.find(e => e.id === proj.targetId);
        if (!target) return; // Target dead/gone
        targetX = target.x;
        targetY = target.y;

        const dx = targetX - proj.x;
        const dy = targetY - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveDist = proj.speed * (deltaTime / 1000);

        if (dist <= moveDist) {
          hit = true;
          target.health -= proj.damage;
          spawnDamageNumber(target.x, target.y, proj.damage, '#ff4444', proj.isCritical);
          if (target.health <= 0) {
            // Bounty logic - maybe enemies drop small amounts of metal?
            metalEarned += Math.floor(target.reward / 2); 
            spawnExplosion(target.x, target.y, ENEMY_STATS[target.type].color.replace('bg-', 'text-'), 12);
            nextEnemies = nextEnemies.filter(e => e.id !== target.id);
          }
          spawnExplosion(proj.x, proj.y, 'text-yellow-400', 3);
        } else {
          proj.x += (dx / dist) * moveDist;
          proj.y += (dy / dist) * moveDist;
        }
      } else {
        // Enemy projectile targeting turret
        const target = turretsRef.current.find(t => t.id === proj.targetId);
        if (!target) return; // Turret destroyed
        targetX = target.x;
        targetY = target.y;

        const dx = targetX - proj.x;
        const dy = targetY - proj.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const moveDist = proj.speed * (deltaTime / 1000);

        if (dist <= moveDist) {
          hit = true;
          target.health -= proj.damage;
          spawnDamageNumber(target.x, target.y, proj.damage, '#ffaa00');
          spawnExplosion(proj.x, proj.y, 'text-blue-400', 5);
          
          if (target.health <= 0) {
            // Turret destroyed!
            spawnExplosion(target.x, target.y, 'text-orange-500', 20);
            // Remove turret
            const idx = turretsRef.current.findIndex(t => t.id === target.id);
            if (idx !== -1) {
              const destroyedTurret = turretsRef.current[idx];
              turretsRef.current.splice(idx, 1);
              
              if (onTurretDestroyed) {
                onTurretDestroyed(destroyedTurret.x, destroyedTurret.y, destroyedTurret.originalTile);
              }
            }
          }
        } else {
          proj.x += (dx / dist) * moveDist;
          proj.y += (dy / dist) * moveDist;
        }
      }

      if (!hit) {
        nextProjectiles.push(proj);
      }
    });

    if (livesLost > 0) {
      setLives(l => {
        const newLives = l - livesLost;
        if (newLives <= 0) {
          setGameState('gameover');
          // Update high score
          if (wave > highScore) {
            setHighScore(wave);
            localStorage.setItem('std-highscore', wave.toString());
          }
        }
        return newLives;
      });
    }

    if (stoneEarned > 0 || metalEarned > 0) {
      setResources(r => ({
        stone: r.stone + stoneEarned,
        metal: r.metal + metalEarned
      }));
    }

    // Update Particles
    const nextParticles: Particle[] = [];
    particlesRef.current.forEach(p => {
      p.x += p.vx * (deltaTime / 1000);
      p.y += p.vy * (deltaTime / 1000);
      p.life -= deltaTime / 1000 / p.maxLife;
      if (p.life > 0) nextParticles.push(p);
    });
    particlesRef.current = nextParticles;

    // Update Damage Numbers
    const nextDamageNumbers: DamageNumber[] = [];
    damageNumbersRef.current.forEach(d => {
      d.y -= 1.0 * (deltaTime / 1000); // Float up
      d.life -= (deltaTime / 1000) / 0.8; // 0.8s lifetime
      if (d.life > 0) nextDamageNumbers.push(d);
    });
    damageNumbersRef.current = nextDamageNumbers;

    // Drone Logic
    dronesRef.current.forEach(drone => {
      if (drone.state === 'idle') {
        // Find pending job
        const job = jobsRef.current.find(j => j.status === 'pending' && !j.assignedDroneId);
        if (job) {
          drone.state = 'moving_to_job';
          drone.jobId = job.id;
          drone.targetX = job.x;
          drone.targetY = job.y;
          job.assignedDroneId = drone.id;
          job.status = 'in_progress';
        }
      } else if (drone.state === 'moving_to_job') {
        if (drone.targetX !== null && drone.targetY !== null) {
          const dx = drone.targetX - drone.x;
          const dy = drone.targetY - drone.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const moveDist = drone.speed * (deltaTime / 1000);
          
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
          job.progress += (deltaTime / 1000) * 20; // 20% per second
          if (job.progress >= 100) {
            job.status = 'completed';
            drone.state = 'returning';
            // Find factory to return to
            const factory = buildingsRef.current.find(b => b.type === 'drone_factory');
            if (factory) {
              drone.targetX = factory.x;
              drone.targetY = factory.y;
            } else {
              // No factory? Just stay put
              drone.state = 'idle';
              drone.jobId = null;
            }
            
            // Complete construction
            if (onJobComplete) {
              let tileType: TileType = 'turret';
              if (job.type === 'build_sniper') tileType = 'sniper';
              else if (job.type === 'build_quarry') tileType = 'quarry';
              else if (job.type === 'build_forge') tileType = 'forge';
              
              onJobComplete(job.x, job.y, tileType);
              
              // Add to entities
              if (job.type === 'build_turret' || job.type === 'build_sniper') {
                const isSniper = job.type === 'build_sniper';
                turretsRef.current.push({
                  id: crypto.randomUUID(),
                  x: job.x,
                  y: job.y,
                  range: isSniper ? 7.0 : 3.5,
                  damage: isSniper ? 100 : 20,
                  cooldown: isSniper ? 2000 : 800,
                  lastFired: 0,
                  targetId: null,
                  level: 1,
                  originalTile: 'empty',
                  health: isSniper ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
                  maxHealth: isSniper ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
                  type: isSniper ? 'sniper' : 'standard'
                });
              } else {
                const type = job.type === 'build_quarry' ? 'quarry' : 'forge';
                buildingsRef.current.push({
                  id: crypto.randomUUID(),
                  x: job.x,
                  y: job.y,
                  type,
                  health: 100,
                  maxHealth: 100,
                  productionRate: type === 'quarry' ? 2 : 1,
                  lastProduced: performance.now()
                });
              }
            }
          }
        }
      } else if (drone.state === 'returning') {
        if (drone.targetX !== null && drone.targetY !== null) {
          const dx = drone.targetX - drone.x;
          const dy = drone.targetY - drone.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const moveDist = drone.speed * (deltaTime / 1000);
          
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
    });
    
    // Cleanup completed jobs
    jobsRef.current = jobsRef.current.filter(j => j.status !== 'completed');

    enemiesRef.current = nextEnemies;
    projectilesRef.current = nextProjectiles;
    
    setEnemies([...nextEnemies]);
    setProjectiles([...nextProjectiles]);
    setParticles([...nextParticles]);
    setDamageNumbers([...nextDamageNumbers]);
    setDrones([...dronesRef.current]);
    setJobs([...jobsRef.current]);
  };

  // Keep a ref to the latest updateGame function to avoid stale closures
  const updateGameRef = useRef<(dt: number) => void>(() => {});
  
  useEffect(() => {
    updateGameRef.current = updateGame;
  });

  // Main Game Loop
  useEffect(() => {
    if (gameState !== 'playing') {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      return;
    }

    const loop = (timestamp: number) => {
      if (!lastTickRef.current) lastTickRef.current = timestamp;
      const deltaTime = timestamp - lastTickRef.current;

      if (deltaTime >= TICK_MS) {
        // Call the latest version of updateGame
        updateGameRef.current(deltaTime);
        lastTickRef.current = timestamp;
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [gameState]);

  const buildTurret = (x: number, y: number, type: 'standard' | 'sniper' = 'standard') => {
    const cost = type === 'sniper' ? SNIPER_COST : TURRET_COST;
    if (resources.metal >= cost.metal && resources.stone >= cost.stone) {
      setResources(r => ({
        stone: r.stone - cost.stone,
        metal: r.metal - cost.metal
      }));
      
      // Create construction job instead of instant build
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

  const buildBuilding = (x: number, y: number, type: 'quarry' | 'forge') => {
    const cost = type === 'quarry' ? QUARRY_COST : FORGE_COST;
    if (resources.metal >= cost.metal && resources.stone >= cost.stone) {
      setResources(r => ({
        stone: r.stone - cost.stone,
        metal: r.metal - cost.metal
      }));
      
      // Create construction job
      jobsRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        type: type === 'quarry' ? 'build_quarry' : 'build_forge',
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

  const repairBuilding = (x: number, y: number, type: 'abandoned_quarry' | 'abandoned_forge' | 'abandoned_drone_factory'): TileType | null => {
    const cost = type === 'abandoned_drone_factory' ? REPAIR_FACTORY_COST : REPAIR_BUILDING_COST;
    
    if (resources.metal >= cost.metal && resources.stone >= cost.stone) {
      setResources(r => ({
        stone: r.stone - cost.stone,
        metal: r.metal - cost.metal
      }));
      
      let newType: TileType;
      if (type === 'abandoned_quarry') newType = 'quarry';
      else if (type === 'abandoned_forge') newType = 'forge';
      else newType = 'drone_factory';
      
      // Add to active buildings
      buildingsRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        type: newType as 'quarry' | 'forge' | 'drone_factory',
        health: 100,
        maxHealth: 100,
        productionRate: newType === 'quarry' ? 2 : 1,
        lastProduced: performance.now()
      });
      
      // Spawn drones if factory
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
            speed: 3.0
          });
        }
      }
      
      return newType;
    }
    return null;
  };

  const upgradeTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (!turret) return false;
    
    const cost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
    
    if (resources.metal >= cost.metal && resources.stone >= cost.stone) {
      setResources(r => ({
        stone: r.stone - cost.stone,
        metal: r.metal - cost.metal
      }));
      turret.level += 1;
      
      if (turret.type === 'sniper') {
        turret.damage += 50;
        turret.range += 1.0;
        turret.cooldown = Math.max(1000, turret.cooldown - 100);
      } else {
        turret.damage += 10;
        turret.range += 0.5;
        turret.cooldown = Math.max(100, turret.cooldown - 50);
      }
      
      turret.maxHealth += 50;
      turret.health = turret.maxHealth; // Heal on upgrade
      return true;
    }
    return false;
  };

  const repairTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (turret && turret.health < turret.maxHealth) {
      const missingHp = turret.maxHealth - turret.health;
      const costMetal = Math.ceil(missingHp * TURRET_STATS.repairCostPerHp);
      
      if (resources.metal >= costMetal) {
        setResources(r => ({ ...r, metal: r.metal - costMetal }));
        turret.health = turret.maxHealth;
        return true;
      } else {
        // Partial repair
        const affordableHp = Math.floor(resources.metal / TURRET_STATS.repairCostPerHp);
        if (affordableHp > 0) {
          setResources(r => ({ ...r, metal: 0 }));
          turret.health += affordableHp;
          return true;
        }
      }
    }
    return false;
  };

  const getTurretAt = (x: number, y: number) => {
    return turretsRef.current.find(t => t.x === x && t.y === y);
  };

  const sellTurret = (x: number, y: number): TileType | null => {
    const index = turretsRef.current.findIndex(t => t.x === x && t.y === y);
    if (index !== -1) {
      const turret = turretsRef.current[index];
      // Refund 50% of base cost + 50% of upgrades
      const baseCost = turret.type === 'sniper' ? SNIPER_COST : TURRET_COST;
      const upgradeCost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
      
      const totalMetal = baseCost.metal + (turret.level - 1) * upgradeCost.metal;
      const totalStone = baseCost.stone + (turret.level - 1) * upgradeCost.stone;
      
      const refundMetal = Math.floor(totalMetal * 0.5);
      const refundStone = Math.floor(totalStone * 0.5);
      
      setResources(r => ({
        stone: r.stone + refundStone,
        metal: r.metal + refundMetal
      }));
      turretsRef.current.splice(index, 1);
      return turret.originalTile;
    }
    return null;
  };

  const clearRubble = (x: number, y: number) => {
    const RUBBLE_CLEAR_COST = 10; // Metal cost?
    if (resources.metal >= RUBBLE_CLEAR_COST) {
      setResources(r => ({ ...r, metal: r.metal - RUBBLE_CLEAR_COST }));
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
    particles,
    damageNumbers
  };
}
