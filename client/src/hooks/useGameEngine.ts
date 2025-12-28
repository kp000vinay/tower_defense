import { useState, useEffect, useRef, useCallback } from 'react';
import { TileType, Enemy, GameState, Wave, TurretEntity, Projectile, Particle, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, KILL_REWARD, ENEMY_STATS, EnemyType, TURRET_STATS } from '@/lib/gameTypes';
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
  const [particles, setParticles] = useState<Particle[]>([]);
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
  const particlesRef = useRef<Particle[]>([]);
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
        if (grid[y][x] === 'turret' || grid[y][x] === 'sniper') {
          const isSniper = grid[y][x] === 'sniper';
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
    let moneyEarned = 0;

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
        if (nextWave >= 2) types.push('striker'); // Strikers appear early (Wave 2)
        if (nextWave >= 3) types.push('scout');
        if (nextWave >= 5) types.push('tank');
        
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
          nextProjectiles.push({
            id: crypto.randomUUID(),
            x: turret.x,
            y: turret.y,
            targetId: target.id,
            speed: 12,
            damage: turret.damage,
            source: 'turret'
          });
        }
      }
    });

    // Enemy Attack Logic (Tanks & Strikers)
    enemiesRef.current.forEach(enemy => {
      if (enemy.type === 'tank' || enemy.type === 'striker') {
        const now = Date.now();
        // Initialize attack stats if missing
        if (!enemy.attackCooldown) {
          if (enemy.type === 'tank') {
            enemy.attackCooldown = 2000;
            enemy.attackRange = 4;
            enemy.attackDamage = 30;
          } else {
            // Striker stats: faster fire, lower damage, shorter range
            enemy.attackCooldown = 1000;
            enemy.attackRange = 3;
            enemy.attackDamage = 10;
          }
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
              speed: enemy.type === 'striker' ? 10 : 8,
              damage: enemy.attackDamage!,
              source: 'enemy'
            });
          }
        }
      }
    });

    // Projectile Logic
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
          size: Math.random() * 0.15 + 0.05
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
          if (target.health <= 0) {
            moneyEarned += target.reward;
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
          spawnExplosion(proj.x, proj.y, 'text-blue-400', 5);
          
          if (target.health <= 0) {
            // Turret destroyed!
            spawnExplosion(target.x, target.y, 'text-orange-500', 20);
            // Remove turret
            const idx = turretsRef.current.findIndex(t => t.id === target.id);
            if (idx !== -1) turretsRef.current.splice(idx, 1);
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

    if (moneyEarned > 0) {
      setMoney(m => m + moneyEarned);
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

    enemiesRef.current = nextEnemies;
    projectilesRef.current = nextProjectiles;
    
    setEnemies([...nextEnemies]);
    setProjectiles([...nextProjectiles]);
    setParticles([...nextParticles]);
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
    if (money >= cost) {
      setMoney(m => m - cost);
      // Add to ref immediately for gameplay
      turretsRef.current.push({
        id: crypto.randomUUID(),
        x,
        y,
        range: type === 'sniper' ? 7.0 : 3.5,
        damage: type === 'sniper' ? 100 : 20,
        cooldown: type === 'sniper' ? 2000 : 800,
        lastFired: 0,
        targetId: null,
        level: 1,
        originalTile: grid[y][x], // Store what was underneath
        health: type === 'sniper' ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
        maxHealth: type === 'sniper' ? TURRET_STATS.sniperHealth : TURRET_STATS.baseHealth,
        type
      });
      return true;
    }
    return false;
  };

  const upgradeTurret = (x: number, y: number) => {
    const turret = turretsRef.current.find(t => t.x === x && t.y === y);
    if (!turret) return false;
    
    const cost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
    
    if (money >= cost) {
      setMoney(m => m - cost);
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
      const cost = Math.ceil(missingHp * TURRET_STATS.repairCostPerHp);
      
      if (money >= cost) {
        setMoney(m => m - cost);
        turret.health = turret.maxHealth;
        return true;
      } else {
        // Partial repair
        const affordableHp = Math.floor(money / TURRET_STATS.repairCostPerHp);
        if (affordableHp > 0) {
          setMoney(0);
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
      
      const totalValue = baseCost + (turret.level - 1) * upgradeCost;
      const refund = Math.floor(totalValue * 0.5);
      
      setMoney(m => m + refund);
      turretsRef.current.splice(index, 1);
      return turret.originalTile;
    }
    return null;
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
    repairTurret,
    highScore,
    particles
  };
}
