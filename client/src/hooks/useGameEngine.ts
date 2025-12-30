import { useState, useEffect, useRef, useCallback } from 'react';
import { TileType, Enemy, GameState, Wave, TurretEntity, BuildingEntity, Projectile, Particle, DamageNumber, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, KILL_REWARD, ENEMY_STATS, EnemyType, TURRET_STATS, Resources, QUARRY_COST, FORGE_COST, REPAIR_BUILDING_COST, FOG_RADIUS, REPAIR_FACTORY_COST, Drone, ConstructionJob, MAINTENANCE_HUB_COST, Hero, HERO_STATS, EXTRACTION_TIME, Cost } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';
import { gameToast } from '@/lib/toastUtils';

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
  const [lives, setLives] = useState(1);
  const [resources, setResources] = useState<Resources>({ stone: 300, metal: 300 }); 
  const [highScore, setHighScore] = useState(0);
  const [visibleTiles, setVisibleTiles] = useState<boolean[][]>([]);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [jobs, setJobs] = useState<ConstructionJob[]>([]);
  const [hero, setHero] = useState<Hero | null>(null);
  const [extractionProgress, setExtractionProgress] = useState(0); // 0 to 100
  const [isExtracting, setIsExtracting] = useState(false);
  const [preparationTime, setPreparationTime] = useState(30); // 30 seconds prep time
  const [isPreparationPhase, setIsPreparationPhase] = useState(true);
  
  // Sync ref with state
  useEffect(() => {
    isPreparationPhaseRef.current = isPreparationPhase;
  }, [isPreparationPhase]);

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

  // Preparation Phase Timer
  useEffect(() => {
    if (!isPreparationPhase) return;
    
    const timer = setInterval(() => {
      setPreparationTime(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsPreparationPhase(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPreparationPhase]);

  // Trigger first wave when preparation ends
  useEffect(() => {
    if (!isPreparationPhase && wave === 1 && enemies.length === 0 && enemiesToSpawnRef.current === 0) {
       startWave(1);
    }
  }, [isPreparationPhase]);
  
  // Refs for mutable state in game loop
  const enemiesRef = useRef<Enemy[]>([]);
  const turretsRef = useRef<TurretEntity[]>([]);
  const buildingsRef = useRef<BuildingEntity[]>([]);
  const projectilesRef = useRef<Projectile[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const damageNumbersRef = useRef<DamageNumber[]>([]);
  const dronesRef = useRef<Drone[]>([]);
  const jobsRef = useRef<ConstructionJob[]>([]);
  const heroRef = useRef<Hero | null>(null);
  const pathRef = useRef<{x: number, y: number}[] | null>(null);
  const frameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const enemiesToSpawnRef = useRef<number>(0);
  const extractionTimerRef = useRef<number>(0);
  const isPreparationPhaseRef = useRef<boolean>(true);
  const waveRef = useRef<number>(1);
  const currentWaveRef = useRef<Wave>({ count: 5, interval: 1500, types: ['standard'] });
  
  // Initialize path when pathPreview changes
  useEffect(() => {
    pathRef.current = pathPreview;
  }, [pathPreview]);

  // Hero Input Handling
  useEffect(() => {
    if (gameState !== 'playing') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!heroRef.current) return;
      
      switch(e.key.toLowerCase()) {
        case 'w': case 'arrowup': heroRef.current.direction = 'up'; heroRef.current.isMoving = true; break;
        case 's': case 'arrowdown': heroRef.current.direction = 'down'; heroRef.current.isMoving = true; break;
        case 'a': case 'arrowleft': heroRef.current.direction = 'left'; heroRef.current.isMoving = true; break;
        case 'd': case 'arrowright': heroRef.current.direction = 'right'; heroRef.current.isMoving = true; break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!heroRef.current) return;
      
      switch(e.key.toLowerCase()) {
        case 'w': case 'arrowup': if (heroRef.current.direction === 'up') heroRef.current.isMoving = false; break;
        case 's': case 'arrowdown': if (heroRef.current.direction === 'down') heroRef.current.isMoving = false; break;
        case 'a': case 'arrowleft': if (heroRef.current.direction === 'left') heroRef.current.isMoving = false; break;
        case 'd': case 'arrowright': if (heroRef.current.direction === 'right') heroRef.current.isMoving = false; break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

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

    // Reveal around Hero with Cone of Vision
    if (heroRef.current) {
      const hx = Math.round(heroRef.current.x);
      const hy = Math.round(heroRef.current.y);
      
      // Base radius around hero (always visible)
      reveal(hx, hy, 4);

      // Cone of Vision based on direction
      const coneLength = 8; // How far the hero can see
      const coneAngle = Math.PI / 3; // 60 degrees cone
      
      let dirAngle = 0;
      if (heroRef.current.direction === 'right') dirAngle = 0;
      if (heroRef.current.direction === 'down') dirAngle = Math.PI / 2;
      if (heroRef.current.direction === 'left') dirAngle = Math.PI;
      if (heroRef.current.direction === 'up') dirAngle = -Math.PI / 2;

      for (let r = 1; r <= coneLength; r++) {
        // Check arc at radius r
        const arcLen = r * coneAngle;
        const steps = Math.ceil(arcLen * 2); // Sample points along arc
        
        for (let i = 0; i <= steps; i++) {
          const angleOffset = (i / steps - 0.5) * coneAngle;
          const angle = dirAngle + angleOffset;
          
          const tx = Math.round(heroRef.current.x + Math.cos(angle) * r);
          const ty = Math.round(heroRef.current.y + Math.sin(angle) * r);
          
          if (tx >= 0 && tx < width && ty >= 0 && ty < height) {
            newVisible[ty][tx] = true;
            // Also reveal neighbors for smoother look
            if (tx+1 < width) newVisible[ty][tx+1] = true;
            if (tx-1 >= 0) newVisible[ty][tx-1] = true;
            if (ty+1 < height) newVisible[ty+1][tx] = true;
            if (ty-1 >= 0) newVisible[ty-1][tx] = true;
          }
        }
      }
    }

    // Reveal around base (Crash Site)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === 'base') {
          reveal(x, y, FOG_RADIUS + 2);
        }
        // Reveal around active buildings and turrets
        if (grid[y][x] === ('quarry' as TileType) || grid[y][x] === ('forge' as TileType) || grid[y][x] === 'turret' || grid[y][x] === 'sniper' || grid[y][x] === ('drone_factory' as TileType) || grid[y][x] === ('maintenance_hub' as TileType)) {
          reveal(x, y, FOG_RADIUS - 1);
        }
        // Reveal path
        if (grid[y][x] === 'path') {
          reveal(x, y, 2);
        }
      }
    }
    
    // Reveal around dynamic turrets (not in grid yet)
    turretsRef.current.forEach(t => {
       reveal(Math.round(t.x), Math.round(t.y), FOG_RADIUS - 1);
    });
    
    setVisibleTiles(newVisible);
  }, [grid, width, height]);

  // Update visibility when grid changes or hero moves (handled in game loop)
  useEffect(() => {
    updateVisibility();
  }, [grid, updateVisibility]);

  const startGame = useCallback(() => {
    // Find spawn (Crash Site)
    let startX = 0, startY = 0;
    let baseFound = false;
    for(let y=0; y<height; y++) {
      for(let x=0; x<width; x++) {
        if (grid[y][x] === 'base') {
          startX = x;
          startY = y;
          baseFound = true;
        }
      }
    }

    if (!baseFound) {
      alert("No Base (Crash Site) found!");
      return;
    }

    setGameState('playing');
    setLives(1);
    setWave(1);
    setEnemies([]);
    setProjectiles([]);
    setDamageNumbers([]);
    setDrones([]);
    setJobs([]);
    setExtractionProgress(0);
    setIsExtracting(false);
    
    enemiesRef.current = [];
    projectilesRef.current = [];
    damageNumbersRef.current = [];
    dronesRef.current = [];
    jobsRef.current = [];
    
    // Initialize Hero
    heroRef.current = {
      x: startX,
      y: startY,
      health: HERO_STATS.maxHealth,
      maxHealth: HERO_STATS.maxHealth,
      speed: HERO_STATS.speed,
      damage: HERO_STATS.damage,
      range: HERO_STATS.range,
      cooldown: HERO_STATS.cooldown,
      lastFired: 0,
      isMoving: false,
      direction: 'down'
    };
    setHero(heroRef.current);

    // Spawn Initial Worker Drone (so player can build first factory)
    dronesRef.current.push({
      id: crypto.randomUUID(),
      x: startX,
      y: startY,
      targetX: null,
      targetY: null,
      state: 'idle',
      jobId: null,
      speed: 3,
      type: 'worker'
    });
    setDrones([...dronesRef.current]); // Force update UI immediately

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
          });
        } else if (tile === ('quarry' as TileType) || tile === ('forge' as TileType) || tile === ('drone_factory' as TileType) || tile === ('maintenance_hub' as TileType) || tile === ('abandoned_drone_factory' as TileType) || tile === ('abandoned_quarry' as TileType) || tile === ('abandoned_forge' as TileType)) {
          
          let type: any = tile;
          let health = 100;
          let maxHealth = 100;
          let isAbandoned = false;

          if (tile === ('abandoned_drone_factory' as TileType)) { type = 'drone_factory'; health = 20; isAbandoned = true; }
          if (tile === ('abandoned_quarry' as TileType)) { type = 'quarry'; health = 20; isAbandoned = true; }
          if (tile === ('abandoned_forge' as TileType)) { type = 'forge'; health = 20; isAbandoned = true; }

          buildingsRef.current.push({
            id: crypto.randomUUID(),
            x,
            y,
            type: type,
            health: health,
            maxHealth: maxHealth,
            productionRate: (type === 'quarry' && !isAbandoned) ? 2 : (type === 'forge' && !isAbandoned) ? 1 : 0, 
            lastProduced: 0,
            isWreckage: isAbandoned // Use isWreckage flag to indicate it needs repair to function
          });
          
          // Spawn initial drones for factory ONLY if not abandoned
          if (type === 'drone_factory' && !isAbandoned) {
            for(let i=0; i<3; i++) {
              dronesRef.current.push({
                id: crypto.randomUUID(),
                x,
                y,
                targetX: null,
                targetY: null,
                state: 'idle',
                jobId: null,
                speed: 3,
                type: 'worker'
              });
            }
          }
          // Spawn initial drones for maintenance hub
          if (tile === ('maintenance_hub' as TileType)) {
            for(let i=0; i<2; i++) {
              dronesRef.current.push({
                id: crypto.randomUUID(),
                x,
                y,
                targetX: null,
                targetY: null,
                state: 'idle',
                jobId: null,
                speed: 4,
                type: 'repair'
              });
            }
          }
        }
      }
    }
    
    setDrones([...dronesRef.current]);

    // Start first wave
    // startWave(1); // Handled by preparation timer
    
    // Reset extraction state
    setExtractionProgress(0);
    setIsExtracting(false);
    extractionTimerRef.current = 0;
    
    // Start game loop
    lastTickRef.current = performance.now();
    frameRef.current = requestAnimationFrame(gameLoop);
  }, [grid, width, height]);

  const stopGame = useCallback(() => {
    setGameState('editing');
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
    }
  }, []);

  const startWave = (waveNum: number) => {
    setWave(waveNum);
    waveRef.current = waveNum;
    
    // Difficulty scaling
    const count = 5 + Math.floor(waveNum * 1.5);
    const interval = Math.max(500, 1500 - waveNum * 50);
    
    const types: EnemyType[] = ['standard'];
    if (waveNum >= 3) types.push('scout');
    if (waveNum >= 5) types.push('tank');
    
    const newWave = { count, interval, types };
    setCurrentWave(newWave);
    currentWaveRef.current = newWave;
    
    enemiesToSpawnRef.current = count;
    spawnTimerRef.current = 0;
    
    console.log(`Starting Wave ${waveNum}: ${count} enemies, interval ${interval}ms`);
  };

  const skipPreparation = () => {
    if (isPreparationPhase) {
      setPreparationTime(0);
      setIsPreparationPhase(false);
      // Trigger wave start via effect or direct call, but ensure state is consistent
      // Setting isPreparationPhase(false) will enable the game loop spawning logic
      startWave(1);
    }
  };

  const spawnEnemy = () => {
    console.log('Spawning enemy...');
    // Spawn from random edge of map (Global Spawning)
    let x, y;
    const edge = Math.floor(Math.random() * 4); // 0: top, 1: right, 2: bottom, 3: left
    
    switch(edge) {
      case 0: x = Math.random() * width; y = 0; break;
      case 1: x = width - 1; y = Math.random() * height; break;
      case 2: x = Math.random() * width; y = height - 1; break;
      case 3: x = 0; y = Math.random() * height; break;
      default: x = 0; y = 0;
    }

    const type = currentWaveRef.current.types[Math.floor(Math.random() * currentWaveRef.current.types.length)];
    const stats = ENEMY_STATS[type];
    
    // Scale health with wave
    const healthMultiplier = 1 + (waveRef.current * 0.2);

    const newEnemy: Enemy = {
      id: crypto.randomUUID(),
      type,
      x,
      y,
      pathIndex: 0,
      speed: stats.speed,
      health: stats.health * healthMultiplier,
      maxHealth: stats.health * healthMultiplier,
      reward: stats.reward,
      // path: [] // Will be calculated in game loop
    };

    enemiesRef.current.push(newEnemy);
    setEnemies([...enemiesRef.current]);
  };

  const gameLoop = (time: number) => {
    const deltaTime = time - lastTickRef.current;
    
    if (deltaTime >= TICK_MS) {
      // Update Game Logic
      
      // 1. Spawning
      if (!isPreparationPhaseRef.current) {
        if (enemiesToSpawnRef.current > 0) {
          spawnTimerRef.current += deltaTime;
          if (spawnTimerRef.current >= currentWaveRef.current.interval) {
            spawnEnemy();
            enemiesToSpawnRef.current--;
            spawnTimerRef.current = 0;
          }
        } else if (enemiesRef.current.length === 0 && waveRef.current < 100) { // Simple wave check
           // Wave complete, start next after delay? For now immediate
           startWave(waveRef.current + 1);
        }
      }

      // 2. Hero Logic
      if (heroRef.current) {
        const h = heroRef.current;
        
        // Movement
        if (h.isMoving) {
          let dx = 0, dy = 0;
          if (h.direction === 'up') dy = -1;
          if (h.direction === 'down') dy = 1;
          if (h.direction === 'left') dx = -1;
          if (h.direction === 'right') dx = 1;
          
          const nextX = h.x + dx * (h.speed * TICK_MS / 1000);
          const nextY = h.y + dy * (h.speed * TICK_MS / 1000);
          
          // Collision check with bounds and walls
          if (nextX >= 0 && nextX < width && nextY >= 0 && nextY < height) {
             const tileX = Math.floor(nextX);
             const tileY = Math.floor(nextY);
             const tile = grid[tileY]?.[tileX];
             
             // Simple collision: can walk on empty, path, base, extraction, rubble
             // Cannot walk on walls, buildings, turrets
             const isWalkable = tile === 'empty' || tile === 'path' || tile === 'base' || tile === ('extraction_point' as TileType) || tile === 'rubble' || tile === 'spawn' || tile === ('resource_stone' as TileType) || tile === ('resource_metal' as TileType);
             
             if (isWalkable) {
               h.x = nextX;
               h.y = nextY;
             }
          }
        }
        
        // Auto-Attack
        if (time - h.lastFired >= h.cooldown) {
          // Find nearest enemy
          let nearestDist = Infinity;
          let targetId = null;
          
          for (const enemy of enemiesRef.current) {
            const dist = Math.sqrt(Math.pow(enemy.x - h.x, 2) + Math.pow(enemy.y - h.y, 2));
            if (dist <= h.range && dist < nearestDist) {
              nearestDist = dist;
              targetId = enemy.id;
            }
          }
          
          if (targetId) {
            projectilesRef.current.push({
              id: crypto.randomUUID(),
              x: h.x,
              y: h.y,
              targetId,
              speed: 10,
              damage: h.damage,
              source: 'hero' as any
            });
            h.lastFired = time;
          }
        }
        
        // Update Visibility based on Hero Position
        updateVisibility();
      }

      // 3. Enemy Logic (Movement & Attack)
      enemiesRef.current.forEach(enemy => {
        // Find target (Hero or Building)
        let targetX = heroRef.current?.x || 0;
        let targetY = heroRef.current?.y || 0;
        let targetType: 'hero' | 'building' | 'base' | 'turret' = 'hero';
        let targetId = 'hero';
        
        // Check for closer buildings
        let minDist = Math.sqrt(Math.pow(targetX - enemy.x, 2) + Math.pow(targetY - enemy.y, 2));
        
        // Check buildings
        buildingsRef.current.forEach(b => {
          if (b.isWreckage) return;
          const dist = Math.sqrt(Math.pow(b.x - enemy.x, 2) + Math.pow(b.y - enemy.y, 2));
          if (dist < minDist) {
            minDist = dist;
            targetX = b.x;
            targetY = b.y;
            targetType = 'building';
            targetId = b.id;
          }
        });
        
        // Check turrets
        turretsRef.current.forEach(t => {
          if (t.health <= 0) return;
          const dist = Math.sqrt(Math.pow(t.x - enemy.x, 2) + Math.pow(t.y - enemy.y, 2));
          if (dist < minDist) {
            minDist = dist;
            targetX = t.x;
            targetY = t.y;
            targetType = 'building'; // Treat turret as building for targeting
            targetId = t.id;
          }
        });
        
        // Check Base (only if extracting)
        if (isExtracting) {
           // Find base coords
           for(let y=0; y<height; y++) {
             for(let x=0; x<width; x++) {
               if (grid[y][x] === 'base') {
                 const dist = Math.sqrt(Math.pow(x - enemy.x, 2) + Math.pow(y - enemy.y, 2));
                 if (dist < minDist) {
                   minDist = dist;
                   targetX = x;
                   targetY = y;
                   targetType = 'base';
                   targetId = 'base';
                 }
               }
             }
           }
        }

        // Move towards target
        const dx = targetX - enemy.x;
        const dy = targetY - enemy.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        
        if (dist > 1.0) { // Move if not in melee range
           // Calculate path if needed (staggered updates based on enemy ID hash)
           // Use a simple hash of ID to stagger updates across frames
           const idHash = enemy.id.charCodeAt(0) + enemy.id.charCodeAt(enemy.id.length - 1);
           const shouldUpdatePath = !enemy.path || enemy.path.length === 0 || (frameRef.current + idHash) % 60 === 0;
           
           if (shouldUpdatePath) {
             const startNode = { x: Math.round(enemy.x), y: Math.round(enemy.y) };
             const endNode = { x: Math.round(targetX), y: Math.round(targetY) };
             
             // Only recalculate if target has moved significantly or we don't have a path
             // For now, just check if we have a path to the current target
             // Optimization: Check if endNode is same as last path node?
             
             const newPath = findPath(grid, startNode, endNode, width, height);
             if (newPath && newPath.length > 0) {
               enemy.path = newPath;
               enemy.pathIndex = 0;
             }
           }

           // Follow path
           if (enemy.path && enemy.path.length > 0) {
             // Get next waypoint
             // If close to current waypoint, move to next
             let nextPoint = enemy.path[enemy.pathIndex];
             
             // If we are close to the next point, advance index
             const distToNext = Math.sqrt(Math.pow(nextPoint.x - enemy.x, 2) + Math.pow(nextPoint.y - enemy.y, 2));
             if (distToNext < 0.1) {
               enemy.pathIndex++;
               if (enemy.path && enemy.pathIndex >= (enemy.path as any[]).length) {
                 // Reached end of path (target)
                 (enemy as any).path = [];
               } else if (enemy.path) {
                 nextPoint = (enemy.path as any[])[enemy.pathIndex];
               }
             }
             
             if (nextPoint) {
               const pdx = nextPoint.x - enemy.x;
               const pdy = nextPoint.y - enemy.y;
               const pdist = Math.sqrt(pdx*pdx + pdy*pdy);
               
               if (pdist > 0) {
                 const moveDist = enemy.speed * TICK_MS / 1000;
                 enemy.x += (pdx / pdist) * moveDist;
                 enemy.y += (pdy / pdist) * moveDist;
               }
             }
           } else {
             // Fallback to direct movement if no path found (e.g. blocked)
             const moveDist = enemy.speed * TICK_MS / 1000;
             enemy.x += (dx / dist) * moveDist;
             enemy.y += (dy / dist) * moveDist;
           }
        } else {
          // Attack!
          if (!enemy.lastFired || time - enemy.lastFired >= 1000) {
             // Deal damage
             if (targetType === 'hero' && heroRef.current) {
               heroRef.current.health -= 10;
               damageNumbersRef.current.push({
                 id: crypto.randomUUID(),
                 x: heroRef.current.x,
                 y: heroRef.current.y,
                 value: 10,
                 life: 1.0,
                 color: '#ef4444'
               });
               if (heroRef.current.health <= 0) {
                 setGameState('gameover');
                 gameToast.error("Commander Down! Mission Failed.");
               }
             } else if (targetType === 'building') {
               const b = buildingsRef.current.find(b => b.id === targetId);
               const t = turretsRef.current.find(t => t.id === targetId);
               
               if (b) {
                 b.health -= 20;
                 damageNumbersRef.current.push({
                   id: crypto.randomUUID(),
                   x: b.x,
                   y: b.y,
                   value: 20,
                   life: 1.0,
                   color: '#ef4444'
                 });
                 if (b.health <= 0) {
                   b.isWreckage = true;
                   b.health = 0;
                   // Update grid visual?
                   // We need a way to tell the UI that this tile is now wreckage
                   // But tile type in grid is static. We rely on overlay.
                 }
               } else if (t) {
                 t.health -= 20;
                 damageNumbersRef.current.push({
                   id: crypto.randomUUID(),
                   x: t.x,
                   y: t.y,
                   value: 20,
                   life: 1.0,
                   color: '#ef4444'
                 });
                 if (t.health <= 0) {
                   // t.isWreckage = true; // Removed from type
                   t.health = 0;
                 }
               }
             }
             enemy.lastFired = time;
          }
        }
      });

      // 4. Turret Logic
      const newProjectiles: Projectile[] = [];
      turretsRef.current.forEach(turret => {
        if (turret.health <= 0) return;
        
        // Always update target for rotation even if on cooldown
        let target = null;
        let minDist = Infinity;

        for (const enemy of enemiesRef.current) {
          const dist = Math.sqrt(Math.pow(enemy.x - turret.x, 2) + Math.pow(enemy.y - turret.y, 2));
          if (dist <= turret.range && dist < minDist) {
            minDist = dist;
            target = enemy;
          }
        }
        
        if (target) {
           turret.targetId = target.id; // Update target ID for rotation
        } else {
           turret.targetId = null;
        }
        
        if (time - turret.lastFired >= turret.cooldown) {
          if (target) {
            newProjectiles.push({
              id: crypto.randomUUID(),
              x: turret.x,
              y: turret.y,
              targetId: target.id,
              speed: 15,
              damage: turret.damage,
              source: 'turret'
            });
            turret.lastFired = time;
          }
        }
      });
      
      // Add new projectiles to ref
      projectilesRef.current = [...projectilesRef.current, ...newProjectiles];

      // 5. Projectile Logic
      const activeProjectiles: Projectile[] = [];
      for (const p of projectilesRef.current) {
        const target = enemiesRef.current.find(e => e.id === p.targetId);
        
        if (target) {
          const dx = target.x - p.x;
          const dy = target.y - p.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          
          if (dist < 0.5) {
            // Hit!
            target.health -= p.damage;
            damageNumbersRef.current.push({
              id: crypto.randomUUID(),
              x: target.x,
              y: target.y,
              value: p.damage,
              life: 1.0,
              color: '#fbbf24' // Gold for damage
            });
            
            // Particle effect
            for(let i=0; i<5; i++) {
              particlesRef.current.push({
                id: crypto.randomUUID(),
                x: target.x,
                y: target.y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                maxLife: 1.0,
                color: '#fbbf24',
                size: Math.random() * 3 + 1
              });
            }

            if (target.health <= 0) {
              // Enemy death handled in cleanup
              setResources((res: Resources) => ({ ...res, metal: res.metal + target.reward }));
              setHighScore(s => {
                const newScore = s + KILL_REWARD;
                localStorage.setItem('std-highscore', newScore.toString());
                return newScore;
              });
            }
          } else {
            // Move projectile
            const move = p.speed * TICK_MS / 1000;
            p.x += (dx / dist) * move;
            p.y += (dy / dist) * move;
            activeProjectiles.push(p);
          }
        } else {
          // Target lost/dead, remove projectile
        }
      }
      
      projectilesRef.current = activeProjectiles;
      setProjectiles([...activeProjectiles]);

      // Cleanup dead enemies
      enemiesRef.current = enemiesRef.current.filter(e => e.health > 0);
      setEnemies([...enemiesRef.current]);

      // 6. Resource Production
      buildingsRef.current.forEach(b => {
        if (b.isWreckage) return;
        if (b.type === 'quarry' || b.type === 'forge') {
          if (time - b.lastProduced >= 1000) {
            setResources((res: Resources) => ({
              stone: res.stone + (b.type === 'quarry' ? b.productionRate : 0),
              metal: res.metal + (b.type === 'forge' ? b.productionRate : 0)
            }));
            b.lastProduced = time;
            
            // Pop up number
            damageNumbersRef.current.push({
              id: crypto.randomUUID(),
              x: b.x,
              y: b.y,
              value: b.productionRate,
              life: 1.0,
              color: b.type === 'quarry' ? '#a8a29e' : '#22d3ee'
            });
          }
        }
      });

      // 7. Drone Logic (Workers & Repair)
      dronesRef.current.forEach(drone => {
        if (drone.state === 'idle') {
          // Look for jobs
          if (drone.type === 'worker') {
            const pendingJob = jobsRef.current.find(j => j.status === 'pending');
            if (pendingJob) {
              drone.state = 'moving_to_job';
              drone.jobId = pendingJob.id;
              drone.targetX = pendingJob.x;
              drone.targetY = pendingJob.y;
              pendingJob.status = 'in_progress';
              pendingJob.assignedDroneId = drone.id;
            }
          } else if (drone.type === 'repair') {
            // Look for damaged buildings/turrets/wreckage
            let target = null;
            let targetType: 'building' | 'turret' = 'building';
            
            // Prioritize wreckage? Or active damaged?
            // Let's prioritize active damaged first to keep defenses up
            
            // Check turrets
            const damagedTurret = turretsRef.current.find(t => t.health < t.maxHealth); // Or include wreckage?
            // Actually, let's include wreckage for auto-rebuild
            const damagedOrWreckedTurret = turretsRef.current.find(t => t.health < t.maxHealth);
            
            if (damagedOrWreckedTurret) {
               target = damagedOrWreckedTurret;
               targetType = 'turret';
            } else {
               const damagedOrWreckedBuilding = buildingsRef.current.find(b => b.health < b.maxHealth);
               if (damagedOrWreckedBuilding) {
                 target = damagedOrWreckedBuilding;
                 targetType = 'building';
               }
            }
            
            if (target) {
              drone.state = 'moving_to_job';
              drone.targetX = target.x;
              drone.targetY = target.y;
              drone.jobId = target.id; // Use entity ID as job ID for repair
            }
          }
        } else if (drone.state === 'moving_to_job') {
          if (drone.targetX !== null && drone.targetY !== null) {
            const dx = drone.targetX - drone.x;
            const dy = drone.targetY - drone.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 0.1) {
              drone.state = 'working';
            } else {
              const move = drone.speed * TICK_MS / 1000;
              drone.x += (dx / dist) * move;
              drone.y += (dy / dist) * move;
            }
          }
        } else if (drone.state === 'working') {
          if (drone.type === 'worker') {
            const job = jobsRef.current.find(j => j.id === drone.jobId);
            if (job) {
              job.progress += 1; // 1% per tick? That's 1.6s. Let's say 0.5 per tick -> 3.3s
              if (job.progress >= 100) {
                job.status = 'completed';
                drone.state = 'returning';
                // Find factory to return to? Or just idle here?
                // Let's just idle here for now or return to base
                drone.targetX = heroRef.current?.x || 0; // Return to hero/base area
                drone.targetY = heroRef.current?.y || 0;
                
                // Apply job result
                if (onJobComplete) {
                   let tileType: TileType = 'turret';
                   if (job.type === 'build_sniper') tileType = 'sniper' as TileType;
                   if (job.type === 'build_quarry') tileType = 'quarry' as TileType;
                   if (job.type === 'build_forge') tileType = 'forge' as TileType;
                   if (job.type === 'build_maintenance_hub') tileType = 'maintenance_hub' as TileType;
                   if (job.type === 'build_drone_factory') tileType = 'drone_factory' as TileType;
                   
                   onJobComplete(job.x, job.y, tileType);
                   
                   // Add to entity lists
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
                     });
                     // Force visibility update to reveal fog around new turret
                     updateVisibility();
                   } else {
                     buildingsRef.current.push({
                        id: crypto.randomUUID(),
                        x: job.x,
                        y: job.y,
                        type: tileType as any,
                        health: 100,
                        maxHealth: 100,
                        productionRate: tileType === ('quarry' as TileType) ? 2 : 1,
                        lastProduced: 0,
                     });
                     // Spawn drones if factory/hub
                     if (tileType === ('drone_factory' as TileType)) {
                        for(let i=0; i<2; i++) {
                          dronesRef.current.push({
                            id: crypto.randomUUID(),
                            x: job.x,
                            y: job.y,
                            targetX: null,
                            targetY: null,
                            state: 'idle',
                            jobId: null,
                            speed: 3,
                            type: 'worker'
                          });
                        }
                        // Spawn 1 harvester
                        dronesRef.current.push({
                          id: crypto.randomUUID(),
                          x: job.x,
                          y: job.y,
                          targetX: null,
                          targetY: null,
                          state: 'idle',
                          jobId: null,
                          speed: 2.5,
                          type: 'harvester',
                          carryAmount: 0,
                          resourceType: undefined
                        });
                     }
                     if (tileType === ('maintenance_hub' as TileType)) {
                        for(let i=0; i<2; i++) {
                          dronesRef.current.push({
                            id: crypto.randomUUID(),
                            x: job.x,
                            y: job.y,
                            targetX: null,
                            targetY: null,
                            state: 'idle',
                            jobId: null,
                            speed: 4,
                            type: 'repair'
                          });
                        }
                     }
                   }
                }
              }
            } else {
              drone.state = 'idle'; // Job gone?
            }
          } else if (drone.type === 'harvester') {
            // Harvester Logic
            if (drone.state === 'idle') {
              // Find nearest resource
              let minDist = Infinity;
              let targetX = -1;
              let targetY = -1;
              let rType: 'stone' | 'metal' | undefined;

              for(let y=0; y<height; y++) {
                for(let x=0; x<width; x++) {
                  const tile = grid[y][x];
                  if (tile === ('resource_stone' as TileType) || tile === ('resource_metal' as TileType)) {
                    const dist = Math.sqrt(Math.pow(x - drone.x, 2) + Math.pow(y - drone.y, 2));
                    if (dist < minDist) {
                      minDist = dist;
                      targetX = x;
                      targetY = y;
                      rType = tile === ('resource_stone' as TileType) ? 'stone' : 'metal';
                    }
                  }
                }
              }

              if (targetX !== -1) {
                drone.targetX = targetX;
                drone.targetY = targetY;
                drone.resourceType = rType;
                drone.state = 'moving_to_job';
              }
            } else if (drone.state === 'moving_to_job') {
              // Move logic handled above
              const dist = Math.sqrt(Math.pow(drone.targetX! - drone.x, 2) + Math.pow(drone.targetY! - drone.y, 2));
              if (dist < 0.5) {
                drone.state = 'working';
              }
            } else if (drone.state === 'working') {
              drone.carryAmount = (drone.carryAmount || 0) + 0.5; // Harvest rate
              if (drone.carryAmount >= 10) { // Max capacity
                drone.state = 'returning';
                // Find base or hero
                // For now, return to hero
                if (heroRef.current) {
                  drone.targetX = heroRef.current.x;
                  drone.targetY = heroRef.current.y;
                } else {
                   // Find base
                   for(let y=0; y<height; y++) {
                     for(let x=0; x<width; x++) {
                       if (grid[y][x] === 'base') {
                         drone.targetX = x;
                         drone.targetY = y;
                         break;
                       }
                     }
                   }
                }
              }
            } else if (drone.state === 'returning') {
               const dist = Math.sqrt(Math.pow(drone.targetX! - drone.x, 2) + Math.pow(drone.targetY! - drone.y, 2));
               if (dist < 1.0) {
                 // Deposit
                 if (drone.resourceType === 'stone') {
                   setResources((res: Resources) => ({ ...res, stone: res.stone + (drone.carryAmount || 0) }));
                 } else {
                   setResources((res: Resources) => ({ ...res, metal: res.metal + (drone.carryAmount || 0) }));
                 }
                 drone.carryAmount = 0;
                 drone.state = 'idle';
               }
            }
          } else if (drone.type === 'repair') {
            // Auto-assign job if idle
            if (drone.state === 'idle') {
               let nearestTarget: any = null;
               let minDistance = Infinity;
               
               // Check turrets
               turretsRef.current.forEach(t => {
                 if (t.health < t.maxHealth) {
                   const dist = Math.sqrt(Math.pow(t.x - drone.x, 2) + Math.pow(t.y - drone.y, 2));
                   if (dist < minDistance && dist < 15) { // 15 tile range for auto-repair
                     minDistance = dist;
                     nearestTarget = t;
                   }
                 }
               });
               
               // Check buildings (including abandoned)
               buildingsRef.current.forEach(b => {
                 if (b.health < b.maxHealth) {
                   const dist = Math.sqrt(Math.pow(b.x - drone.x, 2) + Math.pow(b.y - drone.y, 2));
                   if (dist < minDistance && dist < 15) {
                     minDistance = dist;
                     nearestTarget = b;
                   }
                 }
               });
               
               if (nearestTarget) {
                 drone.jobId = nearestTarget.id;
                 drone.targetX = nearestTarget.x;
                 drone.targetY = nearestTarget.y;
                 drone.state = 'moving_to_job';
               }
            } else if (drone.state === 'moving_to_job') {
               const dist = Math.sqrt(Math.pow(drone.targetX! - drone.x, 2) + Math.pow(drone.targetY! - drone.y, 2));
               if (dist < 1.0) {
                 drone.state = 'working';
               }
            } else if (drone.state === 'working') {
                const t = turretsRef.current.find(t => t.id === drone.jobId);
                const b = buildingsRef.current.find(b => b.id === drone.jobId);
                
                const target = t || b;
                
                if (target && target.health < target.maxHealth) {
                   // Consume metal
                   if (resources.metal >= 0.1) { // Cost per tick
                     setResources((res: Resources) => ({ ...res, metal: Math.max(0, res.metal - 0.1) }));
                     target.health += 0.5; // Repair rate
                     
                     if (target.health >= target.maxHealth) {
                       target.health = target.maxHealth;
                       
                       // If it was wreckage, activate it!
                       if (target.isWreckage) {
                           target.isWreckage = false;
                           // Logic to activate specific building types
                           if ((target as any).type === 'quarry') (target as any).productionRate = 2;
                           if ((target as any).type === 'forge') (target as any).productionRate = 1;
                           
                           if ((target as any).type === 'drone_factory') {
                                // Spawn drones
                                for(let i=0; i<2; i++) {
                                  dronesRef.current.push({
                                    id: crypto.randomUUID(),
                                    x: target.x,
                                    y: target.y,
                                    targetX: null,
                                    targetY: null,
                                    state: 'idle',
                                    jobId: null,
                                    speed: 3,
                                    type: 'worker'
                                  });
                                }
                                dronesRef.current.push({
                                  id: crypto.randomUUID(),
                                  x: target.x,
                                  y: target.y,
                                  targetX: null,
                                  targetY: null,
                                  state: 'idle',
                                  jobId: null,
                                  speed: 2.5,
                                  type: 'harvester',
                                  carryAmount: 0,
                                  resourceType: undefined
                                });
                           }
                           gameToast.success("Abandoned Building Restored!");
                       }
                       
                       drone.state = 'idle';
                       drone.jobId = null;
                     }
                   }
               } else {
                 gameToast.error("Out of Metal! Repairs paused.", "repair_metal_error");
               }
            } else {
              // Done or gone
              drone.state = 'idle';
              drone.jobId = null;
            }
          }
        } else if (drone.state === 'returning') {
           // Simple return to idle logic
           drone.state = 'idle';
        }
      });
      
      setDrones([...dronesRef.current]);
      setJobs([...jobsRef.current]);

      // 8. Win Condition (Hero at Extraction Point)
      if (!isExtracting) {
        // Find Extraction Point
        let endNode = null;
        for(let y=0; y<height; y++) {
          for(let x=0; x<width; x++) {
            if (grid[y][x] === ('extraction_point' as TileType)) endNode = {x, y};
          }
        }
        
        if (endNode && heroRef.current) {
           const dist = Math.sqrt(Math.pow(heroRef.current.x - endNode.x, 2) + Math.pow(heroRef.current.y - endNode.y, 2));
           if (dist < 1.5) {
              setIsExtracting(true);
              gameToast.success("Extraction Initiated! Hold position!");
           }
        }
      } else {
        // Extraction in progress
        extractionTimerRef.current += deltaTime / 1000;
        setExtractionProgress((extractionTimerRef.current / EXTRACTION_TIME) * 100);
        
        if (extractionTimerRef.current >= EXTRACTION_TIME) {
          setGameState('victory');
          gameToast.success("Extraction Complete! Mission Accomplished!");
        }
        
        // Check if connection broken?
        // For now, let's say once connected, you just need to survive.
        // Or strictly check path every tick? That might be expensive.
        // Let's assume the "connection" initiates the upload, and you just need to survive.
      }

      // Update UI state
      setDamageNumbers(prev => prev.map(dn => ({ ...dn, life: dn.life - 0.02 })).filter(dn => dn.life > 0));
      setParticles(prev => prev.map(p => ({ ...p, x: p.x + p.vx * 0.01, y: p.y + p.vy * 0.01, life: p.life - 0.02 })).filter(p => p.life > 0));
      
      lastTickRef.current = time;
    }
    
    frameRef.current = requestAnimationFrame(gameLoop);
  };

  // Helper functions for UI
  const buildTurret = (x: number, y: number, type: 'standard' | 'sniper') => {
    const cost: Cost = type === 'sniper' ? SNIPER_COST : TURRET_COST;
    if (resources.stone >= cost.stone && resources.metal >= cost.metal) {
      setResources((prev: Resources) => ({ stone: prev.stone - cost.stone, metal: prev.metal - cost.metal }));
      
      // Create job
      const job: ConstructionJob = {
        id: crypto.randomUUID(),
        x,
        y,
        type: type === 'sniper' ? 'build_sniper' : 'build_turret',
        progress: 0,
        totalWork: 100,
        assignedDroneId: null,
        status: 'pending',
        cost
      };
      jobsRef.current.push(job);
      setJobs([...jobsRef.current]);
      return true;
    }
    return false;
  };

  const buildBuilding = (x: number, y: number, type: TileType) => {
    let cost = QUARRY_COST;
    let jobType: ConstructionJob['type'] = 'build_quarry';
    
    if (type === ('forge' as TileType)) { cost = FORGE_COST; jobType = 'build_forge'; }
    if (type === ('maintenance_hub' as TileType)) { cost = MAINTENANCE_HUB_COST; jobType = 'build_maintenance_hub'; }
    if (type === ('drone_factory' as TileType)) { cost = REPAIR_FACTORY_COST; jobType = 'build_drone_factory'; }
    
    if (resources.stone >= cost.stone && resources.metal >= cost.metal) {
      setResources((prev: Resources) => ({ stone: prev.stone - cost.stone, metal: prev.metal - cost.metal }));
      
      const job: ConstructionJob = {
        id: crypto.randomUUID(),
        x,
        y,
        type: jobType,
        progress: 0,
        totalWork: 100,
        assignedDroneId: null,
        status: 'pending',
        cost
      };
      jobsRef.current.push(job);
      setJobs([...jobsRef.current]);
      return true;
    }
    return false;
  };

  const repairBuilding = (id: string, isTurret: boolean) => {
    if (isTurret) {
      const t = turretsRef.current.find(t => t.id === id);
      if (t && t.health < t.maxHealth) {
        const missing = t.maxHealth - t.health;
        const cost = Math.ceil(missing * TURRET_STATS.repairCostPerHp);
        if (resources.metal >= cost) {
          setResources(prev => ({ ...prev, metal: prev.metal - cost }));
          t.health = t.maxHealth;
          gameToast.success("Turret Repaired");
        } else {
          gameToast.error("Not enough Metal", "repair_metal_error");
        }
      }
    } else {
      const b = buildingsRef.current.find(b => b.id === id);
      if (b && b.health < b.maxHealth) {
        // Check if it's a factory repair (more expensive)
        const isFactory = b.type === 'drone_factory';
        const cost = isFactory ? REPAIR_FACTORY_COST : REPAIR_BUILDING_COST;
        
        if (resources.stone >= cost.stone && resources.metal >= cost.metal) {
           setResources(prev => ({ ...prev, stone: prev.stone - cost.stone, metal: prev.metal - cost.metal }));
           b.health = b.maxHealth;
           
           // If it was wreckage/abandoned, activate it
           if (b.isWreckage) {
             b.isWreckage = false;
             if (b.type === 'quarry') b.productionRate = 2;
             if (b.type === 'forge') b.productionRate = 1;
             
             // Spawn drones if factory
             if (b.type === 'drone_factory') {
                for(let i=0; i<2; i++) {
                  dronesRef.current.push({
                    id: crypto.randomUUID(),
                    x: b.x,
                    y: b.y,
                    targetX: null,
                    targetY: null,
                    state: 'idle',
                    jobId: null,
                    speed: 3,
                    type: 'worker'
                  });
                }
                // Spawn 1 harvester
                dronesRef.current.push({
                  id: crypto.randomUUID(),
                  x: b.x,
                  y: b.y,
                  targetX: null,
                  targetY: null,
                  state: 'idle',
                  jobId: null,
                  speed: 2.5,
                  type: 'harvester',
                  carryAmount: 0,
                  resourceType: undefined
                });
             }
             gameToast.success("Building Restored & Operational!");
           } else {
             gameToast.success("Building Repaired");
           }
        } else {
           gameToast.error("Not enough Resources", "resource_error");
        }
      }
    }
  };

  const upgradeTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (turret) {
      const cost = (turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST) as Cost;
      if (resources.metal >= cost.metal) {
        setResources((prev: Resources) => ({ ...prev, metal: prev.metal - cost.metal }));
        turret.level++;
        turret.damage *= 1.5;
        turret.range += 0.5;
        return true;
      }
    }
    return false;
  };

  const sellTurret = (x: number, y: number) => {
    const index = turretsRef.current.findIndex(t => t.x === x && t.y === y);
    if (index !== -1) {
      const turret = turretsRef.current[index];
      turretsRef.current.splice(index, 1);
      return turret.originalTile;
    }
    return null;
  };

  const repairTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (turret && turret.health < turret.maxHealth) {
      const missing = turret.maxHealth - turret.health;
      const cost = Math.ceil(missing * TURRET_STATS.repairCostPerHp);
      
      if (resources.metal >= cost) {
        setResources((prev: Resources) => ({ ...prev, metal: prev.metal - cost }));
        turret.health = turret.maxHealth;
        return true;
      }
    }
    return false;
  };

  const clearRubble = (x: number, y: number) => {
    if (resources.stone >= 10) {
      setResources((prev: Resources) => ({ ...prev, stone: prev.stone - 10 }));
      return true;
    }
    return false;
  };

  const getTurretAt = (x: number, y: number) => {
    return turretsRef.current.find(t => t.x === x && t.y === y);
  };

  return {
    gameState,
    enemies,
    wave,
    lives,
    resources,
    projectiles,
    particles,
    damageNumbers,
    visibleTiles,
    drones,
    jobs,
    hero,
    extractionProgress,
    preparationTime,
    isPreparationPhase,
    isExtracting,
    currentWave,
    skipPreparation,
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
    highScore
  };
}
