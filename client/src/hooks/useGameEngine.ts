import { useState, useEffect, useRef, useCallback } from 'react';
import { TileType, Enemy, GameState, Wave } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';

const TICK_RATE = 60; // FPS
const TICK_MS = 1000 / TICK_RATE;

export function useGameEngine(
  width: number, 
  height: number, 
  grid: TileType[][]
) {
  const [gameState, setGameState] = useState<GameState>('editing');
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(20);
  const [money, setMoney] = useState(100);
  
  // Refs for mutable state in game loop
  const enemiesRef = useRef<Enemy[]>([]);
  const pathRef = useRef<{x: number, y: number}[] | null>(null);
  const frameRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const enemiesToSpawnRef = useRef<number>(0);
  
  // Initialize path when grid changes or game starts
  useEffect(() => {
    if (!grid || grid.length === 0 || grid.length !== height || grid[0].length !== width) {
      return;
    }

    let spawnPoint = null;
    let basePoint = null;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y] && grid[y][x] === 'spawn') spawnPoint = { x, y };
        if (grid[y] && grid[y][x] === 'base') basePoint = { x, y };
      }
    }

    if (spawnPoint && basePoint) {
      pathRef.current = findPath(grid, spawnPoint, basePoint, width, height);
    } else {
      pathRef.current = null;
    }
  }, [grid, width, height]);

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
    enemiesRef.current = [];
    
    // Setup first wave
    enemiesToSpawnRef.current = 5;
    spawnTimerRef.current = 0;
  }, []);

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
      if (spawnTimerRef.current > 1000) { // Spawn every 1 second
        spawnEnemy(path[0]);
        spawnTimerRef.current = 0;
        enemiesToSpawnRef.current--;
      }
    } else if (enemiesRef.current.length === 0 && lives > 0) {
      // Wave Complete - Start next wave after delay (simplified for now)
      // For now, just infinite waves
      setWave(w => w + 1);
      enemiesToSpawnRef.current = 5 + wave * 2;
    }

    // Move Enemies
    const nextEnemies: Enemy[] = [];
    let livesLost = 0;

    enemiesRef.current.forEach(enemy => {
      // Move towards next path node
      const targetNode = path[enemy.pathIndex];
      
      if (!targetNode) {
        // Reached end
        livesLost++;
        return; 
      }

      const dx = targetNode.x - enemy.x;
      const dy = targetNode.y - enemy.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      // Speed factor (tiles per second)
      const moveDist = (enemy.speed * deltaTime) / 1000;

      if (dist <= moveDist) {
        // Reached node, snap to it and increment index
        enemy.x = targetNode.x;
        enemy.y = targetNode.y;
        enemy.pathIndex++;
        
        // Check if reached base (end of path)
        if (enemy.pathIndex >= path.length) {
          livesLost++;
          return; // Remove enemy
        }
      } else {
        // Move towards node
        enemy.x += (dx / dist) * moveDist;
        enemy.y += (dy / dist) * moveDist;
      }

      nextEnemies.push(enemy);
    });

    if (livesLost > 0) {
      setLives(l => {
        const newLives = l - livesLost;
        if (newLives <= 0) setGameState('gameover');
        return newLives;
      });
    }

    enemiesRef.current = nextEnemies;
    setEnemies([...nextEnemies]); // Trigger render
  };

  const spawnEnemy = (startPos: {x: number, y: number}) => {
    const newEnemy: Enemy = {
      id: crypto.randomUUID(),
      x: startPos.x,
      y: startPos.y,
      pathIndex: 1, // Start moving to the second node
      speed: 2.5 + (wave * 0.1), // Speed increases slightly per wave
      health: 10 + (wave * 5),
      maxHealth: 10 + (wave * 5),
    };
    enemiesRef.current.push(newEnemy);
  };

  return {
    gameState,
    enemies,
    wave,
    lives,
    money,
    startGame,
    stopGame
  };
}
