import { useState, useEffect } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS, TURRET_COST, UPGRADE_COST, ENEMY_STATS } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';
import { useGameEngine } from '@/hooks/useGameEngine';
import { Enemy } from '@/lib/gameTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Trash2, Play, Grid3X3, Download, Upload } from 'lucide-react';

export default function LevelEditor() {
  const [levelName, setLevelName] = useState('New Sector');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [selectedTool, setSelectedTool] = useState<TileType | 'sell'>('wall');
  // Initialize grid state with default values immediately to avoid undefined access
  const [grid, setGrid] = useState<TileType[][]>(() => 
    Array(DEFAULT_HEIGHT).fill(null).map(() => Array(DEFAULT_WIDTH).fill('empty'))
  );
  const [isDragging, setIsDragging] = useState(false);
  const [pathPreview, setPathPreview] = useState<{x: number, y: number}[] | null>(null);

  // Update grid when dimensions change
  useEffect(() => {
    setGrid(prev => {
      // If dimensions match, don't reset (preserves data if we just re-mounted)
      if (prev.length === height && prev[0]?.length === width) return prev;
      
      return Array(height).fill(null).map(() => Array(width).fill('empty'));
    });
  }, [width, height]);

  const { 
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
    highScore,
    particles
  } = useGameEngine(width, height, grid, pathPreview);
  
  const handleTileClick = (x: number, y: number) => {
    if (gameState === 'playing') {
      // In-game building logic
      if (selectedTool === 'sell') {
        // Check if there is a turret at this location using the engine's data
        const turret = getTurretAt(x, y);
        if (turret) {
          const refundAmount = Math.floor((TURRET_COST + (turret.level - 1) * UPGRADE_COST) * 0.5);
          const originalTile = sellTurret(x, y);
          
          // Force update grid visual if engine confirms sale
          if (originalTile) {
            const newGrid = [...grid];
            newGrid[y][x] = originalTile;
            setGrid(newGrid);
            toast.success(`Turret recycled! +${refundAmount} CR`);
          }
        }
        return;
      }

      if (selectedTool === 'turret') {
        if (grid[y][x] === 'empty' || grid[y][x] === 'wall') {
          if (buildTurret(x, y)) {
            const newGrid = [...grid];
            newGrid[y][x] = 'turret';
            setGrid(newGrid);
            toast.success('Turret deployed!');
          } else {
            toast.error('Insufficient credits!');
          }
        } else if (grid[y][x] === 'turret') {
          // Upgrade logic
          if (upgradeTurret(x, y)) {
            toast.success('Turret upgraded!');
          } else {
            const turret = getTurretAt(x, y);
            if (turret) {
              toast.info(`Level ${turret.level} Turret (Upgrade: ${UPGRADE_COST} CR)`);
            }
          }
        }
      }
      return;
    }

    // Editor logic
    if (selectedTool !== 'sell') {
      const newGrid = [...grid];
      newGrid[y][x] = selectedTool;
      setGrid(newGrid);
      updatePathPreview(newGrid);
    }
  };

  const updatePathPreview = (currentGrid: TileType[][]) => {
    // Find spawn and base
    let spawnPoint = null;
    let basePoint = null;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (currentGrid[y][x] === 'spawn') spawnPoint = { x, y };
        if (currentGrid[y][x] === 'base') basePoint = { x, y };
      }
    }

    if (spawnPoint && basePoint) {
      const path = findPath(currentGrid, spawnPoint, basePoint, width, height);
      setPathPreview(path);
    } else {
      setPathPreview(null);
    }
  };

  const handleMouseEnter = (x: number, y: number) => {
    if (isDragging) {
      handleTileClick(x, y);
    }
  };

  const saveLevel = () => {
    const levelData: LevelData = {
      id: crypto.randomUUID(),
      name: levelName,
      width,
      height,
      tiles: grid.map((row, y) => row.map((type, x) => ({ x, y, type }))),
    };
    
    localStorage.setItem(`level-${levelData.id}`, JSON.stringify(levelData));
    toast.success(`Sector "${levelName}" secure. Data saved.`);
  };

  const clearGrid = () => {
    if (confirm('WARNING: Purging sector data. Confirm?')) {
      setGrid(Array(height).fill(null).map(() => Array(width).fill('empty')));
    }
  };

  return (
    <div className="flex flex-col h-full gap-6 p-4">
      {/* Control Panel */}
      <Card className="p-4 panel flex flex-wrap items-center gap-4 justify-between bg-card/90 backdrop-blur-md border-primary/20">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-xs text-muted-foreground uppercase tracking-widest font-mono">Sector ID</label>
            <Input 
              value={levelName} 
              onChange={(e) => setLevelName(e.target.value)} 
              className="w-64 font-mono bg-background/50 border-primary/30 focus:border-primary"
            />
          </div>
          
          <div className="flex items-center gap-2 border-l border-border pl-4">
            <div className="flex flex-col w-20">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-mono">Width</label>
              <Input 
                type="number" 
                value={width} 
                onChange={(e) => setWidth(Number(e.target.value))}
                className="font-mono bg-background/50"
              />
            </div>
            <div className="flex flex-col w-20">
              <label className="text-xs text-muted-foreground uppercase tracking-widest font-mono">Height</label>
              <Input 
                type="number" 
                value={height} 
                onChange={(e) => setHeight(Number(e.target.value))}
                className="font-mono bg-background/50"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {gameState === 'editing' ? (
            <>
              <Button variant="outline" onClick={clearGrid} className="text-destructive border-destructive/50 hover:bg-destructive/10">
                <Trash2 className="w-4 h-4 mr-2" /> Purge
              </Button>
              <Button onClick={saveLevel} className="bg-primary text-primary-foreground hover:bg-primary/90 hazard-border">
                <Save className="w-4 h-4 mr-2" /> Save Sector
              </Button>
              <Button onClick={startGame} className="bg-green-600 text-white hover:bg-green-500 hazard-border ml-2">
                <Play className="w-4 h-4 mr-2" /> ENGAGE
              </Button>
            </>
          ) : (
            <Button onClick={stopGame} variant="destructive" className="hazard-border">
              ABORT MISSION
            </Button>
          )}
        </div>
      </Card>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Toolbox */}
        <Card className="w-64 p-4 panel flex flex-col gap-4 overflow-y-auto">
          <h3 className="text-lg font-bold text-primary border-b border-primary/30 pb-2">Construction</h3>
          
          <div className="grid grid-cols-2 gap-2">
            {(['empty', 'wall', 'path', 'base', 'spawn', 'turret'] as TileType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedTool(type)}
                disabled={gameState === 'playing' && type !== 'turret'}
                className={`
                  p-3 flex flex-col items-center justify-center gap-2 border transition-all
                  ${selectedTool === type 
                    ? 'border-primary bg-primary/10 shadow-[0_0_10px_rgba(var(--primary),0.3)]' 
                    : 'border-border hover:border-primary/50 hover:bg-accent/5'}
                  ${gameState === 'playing' && type !== 'turret' ? 'opacity-30 cursor-not-allowed' : ''}
                `}
              >
                <div className={`w-8 h-8 ${TILE_COLORS[type]} border border-white/10 shadow-inner`} />
                <span className="text-xs uppercase font-mono tracking-wider">{type}</span>
                {type === 'turret' && <span className="text-[10px] text-yellow-500 font-bold">{TURRET_COST} CR</span>}
              </button>
            ))}
            
            {/* Sell Tool */}
            <button
              onClick={() => setSelectedTool('sell')}
              disabled={gameState !== 'playing'}
              className={`
                p-3 flex flex-col items-center justify-center gap-2 border transition-all
                ${selectedTool === 'sell' 
                  ? 'border-red-500 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.3)]' 
                  : 'border-border hover:border-red-500/50 hover:bg-red-500/5'}
                ${gameState !== 'playing' ? 'opacity-30 cursor-not-allowed' : ''}
              `}
            >
              <div className="w-8 h-8 bg-red-900/50 border border-red-500/50 flex items-center justify-center">
                <span className="text-red-500 font-bold text-lg">×</span>
              </div>
              <span className="text-xs uppercase font-mono tracking-wider text-red-400">SELL</span>
            </button>

            {gameState === 'playing' && (
              <div className="col-span-2 mt-2 p-2 bg-primary/10 border border-primary/30 rounded text-xs text-center">
                <p className="text-primary font-bold mb-1">UPGRADE SYSTEM</p>
                <p className="text-muted-foreground">Click existing turret to upgrade</p>
                <p className="text-yellow-500 font-mono">{UPGRADE_COST} CR</p>
              </div>
            )}
          </div>

          <div className="mt-auto p-4 bg-black/20 border border-white/5 rounded text-xs font-mono text-muted-foreground">
            <p className="mb-2 text-primary">STATUS: {gameState === 'playing' ? 'COMBAT ACTIVE' : 'EDITING'}</p>
            
            {/* Large Credit Display */}
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded text-center">
              <span className="block text-[10px] text-yellow-500/70 uppercase tracking-widest mb-1">Available Credits</span>
              <span className="text-2xl font-bold text-yellow-400">{money} CR</span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between">
                <span>WAVE:</span>
                <span className="text-white">{wave}</span>
              </div>
              <div className="flex justify-between">
                <span>LIVES:</span>
                <span className="text-red-400">{lives}</span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                <span className="text-xs text-slate-400">HIGH SCORE:</span>
                <span className="text-xs text-yellow-400">WAVE {highScore}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Grid Canvas */}
        <Card className="flex-1 p-8 panel overflow-auto flex items-center justify-center bg-black/40 relative">
          {/* Game Over Overlay */}
          {gameState === 'gameover' && (
            <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm animate-in fade-in duration-500">
              <h2 className="text-6xl font-bold text-red-500 mb-4 tracking-widest glitch-text">MISSION FAILED</h2>
              <div className="text-2xl text-blue-400 mb-8 font-mono">
                WAVES SURVIVED: <span className="text-white">{wave}</span>
              </div>
              {wave >= highScore && wave > 1 && (
                <div className="text-xl text-yellow-400 mb-8 animate-pulse">
                  NEW HIGH SCORE!
                </div>
              )}
              <Button 
                onClick={stopGame}
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-6 text-xl rounded-none border border-red-400"
              >
                RETURN TO BASE
              </Button>
            </div>
          )}
          {/* Grid Background Effect */}
          <div className="absolute inset-0 pointer-events-none opacity-10" 
               style={{ backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)', backgroundSize: '40px 40px' }} 
          />

          <div 
            className="grid gap-[1px] bg-border/30 p-[1px] shadow-2xl relative z-10"
            style={{ 
              gridTemplateColumns: `repeat(${width}, minmax(2rem, 1fr))`,
              maxWidth: '100%',
              maxHeight: '100%'
            }}
            onMouseLeave={() => setIsDragging(false)}
          >
            {grid.map((row, y) => (
              row.map((tileType, x) => {
                const isPath = pathPreview?.some(p => p.x === x && p.y === y);
                return (
                  <div
                    key={`${x}-${y}`}
                    onMouseDown={() => { 
                      if (gameState === 'editing') {
                        setIsDragging(true); 
                        handleTileClick(x, y); 
                      } else if (gameState === 'playing' && selectedTool === 'turret') {
                        handleTileClick(x, y);
                      }
                    }}
                    onMouseEnter={() => {
                      if (gameState === 'editing') handleMouseEnter(x, y);
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    className={`
                      w-10 h-10 transition-colors duration-75 relative
                      ${TILE_COLORS[tileType]}
                      ${gameState === 'editing' || (gameState === 'playing' && (tileType === 'empty' || tileType === 'wall' || tileType === 'turret')) ? 'cursor-pointer hover:brightness-125' : ''}
                      ${selectedTool === 'sell' && tileType === 'turret' ? 'hover:bg-red-500/50 hover:border-red-500' : ''}
                      border border-white/5
                    `}
                    title={`Coordinates: ${x},${y}`}
                  >
                    {tileType === 'turret' && gameState === 'playing' && (
                      <>
                        <div className="absolute top-0 right-0 text-[8px] font-bold text-black bg-yellow-500 px-1 rounded-bl z-10">
                          LVL {getTurretAt(x, y)?.level || 1}
                        </div>
                        {/* Sell Preview Tooltip */}
                        {selectedTool === 'sell' && (
                          <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center z-20 group">
                            <span className="text-[8px] font-bold text-white bg-black/80 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                              +{Math.floor((TURRET_COST + ((getTurretAt(x, y)?.level || 1) - 1) * UPGRADE_COST) * 0.5)}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                    {isPath && gameState === 'editing' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })
            ))}
            
            {/* Enemy */}
                {enemies.map(enemy => {
                  const stats = ENEMY_STATS[enemy.type];
                  return (
                    <div
                      key={enemy.id}
                      className={`absolute w-6 h-6 ${stats.color} rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)] z-20 transition-transform duration-100 flex items-center justify-center`}
                      style={{
                        left: `calc(${enemy.x} * 100% / ${width} + 50% / ${width} - 0.75rem)`,
                        top: `calc(${enemy.y} * 100% / ${height} + 50% / ${height} - 0.75rem)`,
                      }}
                    >
                      {/* Type Indicator */}
                      <span className="text-[8px] font-bold text-black/80 uppercase tracking-tighter">
                        {enemy.type === 'tank' ? 'TNK' : enemy.type === 'scout' ? 'SCT' : ''}
                      </span>

                      {/* Health Bar */}
                      <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/50 rounded overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-100 ${enemy.type === 'tank' ? 'bg-blue-400' : enemy.type === 'scout' ? 'bg-yellow-400' : 'bg-green-500'}`}
                          style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                
                {/* Render Projectiles Layer */}
                {projectiles.map(proj => (
                  <div
                    key={proj.id}
                    className="absolute w-2 h-2 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.8)] z-30 pointer-events-none will-change-transform"
                    style={{
                      left: `calc(${proj.x} * 100% / ${width} + 50% / ${width})`,
                      top: `calc(${proj.y} * 100% / ${height} + 50% / ${height})`,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                ))}

                {/* Render Particles Layer */}
                {particles.map(p => (
                  <div
                    key={p.id}
                    className={`absolute rounded-full z-40 pointer-events-none will-change-transform ${p.color}`}
                    style={{
                      left: `calc(${p.x} * 100% / ${width} + 50% / ${width})`,
                      top: `calc(${p.y} * 100% / ${height} + 50% / ${height})`,
                      width: `${p.size}rem`,
                      height: `${p.size}rem`,
                      opacity: p.life,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
