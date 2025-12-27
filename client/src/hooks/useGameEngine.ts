import { useState, useEffect, useRef, useCallback } from 'react';
import { TileType, Enemy, GameState, Wave, TurretEntity, Projectile, TURRET_COST, UPGRADE_COST, KILL_REWARD, ENEMY_STATS, EnemyType } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';

const TICK_RATE = 60; // FPS
const TICK_MS = 1000 / TICK_RATE;

export function useGameEngine(
  width: number, 
  height: number, 
  grid: TileType[][],
  pathPreview: {x: number, y: number}[] | null
) {
  const [gameState, setGameState] = useState<GameState>('editing');
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [projectiles, setProjectiles] = useState<Projectile[]>([]);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(20);
  const [money, setMoney] = useState(100);
  const [highScore, setHighScore] = useState(0);
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
  const projectilesRef = useRef<Projectile[]>([]);
  const pathRef = useRef<{x: number, y: number}[] | null>(null);
  const frameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const enemiesToSpawnRef = useRef<number>(0);
  
  // Initialize path when pathPreview changes
  useEffect(() => {
    pathRef.current = pathPreview;
  }, [pathPreview]);

  const startGame = useCallback(() => {
    if (!pathRef.current) {
      alert("No valid path from Spawn to Base!");
      return;
    }
    setGameState('playing');
    setLives(20);
    setMoney(100);
    setWave(1);
    setEnemies([]);
    setProjectiles([]);
    enemiesRef.current = [];
    projectilesRef.current = [];
    
    // Initialize turrets from grid
    turretsRef.current = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === 'turret') {
          turretsRef.current.push({
            id: crypto.randomUUID(),
            x,
            y,
            range: 3.5,
            damage: 20,
            cooldown: 800, // ms
            lastFired: 0,
            targetId: null,
            level: 1,
            originalTile: 'empty' // Default for pre-placed turrets
          });
        }
      }
    }
    
    // Setup first wave
    enemiesToSpawnRef.current = 5;
    spawnTimerRef.current = 0;
  }, [grid, width, height]);

  const stopGame = useCallback(() => {
    setGameState('editing');
    setEnemies([]);
    enemiesRef.current = [];
  }, []);

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
        updateGame(deltaTime);
        lastTickRef.current = timestamp;
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [gameState]);

  const updateGame = (deltaTime: number) => {
    const path = pathRef.current;
    if (!path) return;

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
        if (nextWave >= 2) types.push('scout');
        if (nextWave >= 4) types.push('tank');
        
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
    const now = performance.now();
    turretsRef.current.forEach(turret => {
      if (now - turret.lastFired >= turret.cooldown) {
        // Find target
        const target = nextEnemies.find(e => {
          const dx = e.x - turret.x;
          const dy = e.y - turret.y;
          return Math.sqrt(dx*dx + dy*dy) <= turret.range;
        });

        if (target) {
          turret.lastFired = now;
          turret.targetId = target.id;
          
          // Spawn projectile
          projectilesRef.current.push({
            id: crypto.randomUUID(),
            x: turret.x,
            y: turret.y,
            targetId: target.id,
            speed: 10,
            damage: turret.damage
          });
        }
      }
    });

    // Projectile Logic
    const nextProjectiles: Projectile[] = [];
    let moneyEarned = 0;

    projectilesRef.current.forEach(proj => {
      const target = nextEnemies.find(e => e.id === proj.targetId);
      if (!target) return; // Target dead/gone

      const dx = target.x - proj.x;
      const dy = target.y - proj.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const moveDist = (proj.speed * deltaTime) / 1000;

      if (dist <= moveDist) {
        // Hit!
        target.health -= proj.damage;
        if (target.health <= 0) {
          // Enemy killed
          moneyEarned += target.reward;
          // Remove enemy from nextEnemies immediately so other projectiles don't target it
          nextEnemies = nextEnemies.filter(e => e.id !== target.id);
        }
      } else {
        // Move projectile
        proj.x += (dx / dist) * moveDist;
        proj.y += (dy / dist) * moveDist;
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

    if (moneyEarned > 0) {
      setMoney(m => m + moneyEarned);
    }

    enemiesRef.current = nextEnemies;
    projectilesRef.current = nextProjectiles;
    
    setEnemies([...nextEnemies]);
    setProjectiles([...nextProjectiles]);
  };

  const buildTurret = (x: number, y: number) => {
    if (money >= TURRET_COST) {
      setMoney(m => m - TURRET_COST);
      // Add to ref immediately for gameplay
      turretsRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        range: 3.5,
        damage: 20,
        cooldown: 800,
        lastFired: 0,
        targetId: null,
        level: 1,
        originalTile: grid[y][x] // Store what was underneath
      });
      return true;
    }
    return false;
  };

  const upgradeTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (turret && money >= UPGRADE_COST) {
      setMoney(m => m - UPGRADE_COST);
      turret.level += 1;
      turret.damage += 10;
      turret.range += 0.5;
      turret.cooldown = Math.max(100, turret.cooldown - 50);
      return true;
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
      const totalValue = TURRET_COST + (turret.level - 1) * UPGRADE_COST;
      const refund = Math.floor(totalValue * 0.5);
      
      setMoney(m => m + refund);
      turretsRef.current.splice(index, 1);
      return turret.originalTile;
    }
    return null;
  };

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

  return {
    gameState,
    enemies,
    wave,
    lives,
    money,
    projectiles,
    startGame,
    stopGame,
    buildTurret,
    upgradeTurret,
    getTurretAt,
    sellTurret,
    highScore
  };
}
