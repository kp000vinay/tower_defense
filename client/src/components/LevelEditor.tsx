import { useState, useEffect } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, ENEMY_STATS } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';
import { useGameEngine } from '@/hooks/useGameEngine';
import { Enemy } from '@/lib/gameTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Trash2, Play, Grid3X3, Download, Upload, Wrench } from 'lucide-react';

export default function LevelEditor() {
  const [levelName, setLevelName] = useState('New Sector');
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [selectedTool, setSelectedTool] = useState<TileType | 'sell' | 'repair'>('wall');
  // Initialize grid state with default values immediately to avoid undefined access
  const [grid, setGrid] = useState<TileType[][]>(() => 
    Array(DEFAULT_HEIGHT).fill(null).map(() => Array(DEFAULT_WIDTH).fill('empty'))
  );
  const [isDragging, setIsDragging] = useState(false);
  const [pathPreview, setPathPreview] = useState<{x: number, y: number}[] | null>(null);
  const [selectedTurret, setSelectedTurret] = useState<{x: number, y: number} | null>(null);

  // Update grid when dimensions change
  useEffect(() => {
    setGrid(prev => {
      // If dimensions match, don't reset (preserves data if we just re-mounted)
      if (prev.length === height && prev[0]?.length === width) return prev;
      
      return Array(height).fill(null).map(() => Array(width).fill('empty'));
    });
  }, [width, height]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only active if not typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key.toLowerCase()) {
        case 's':
          setSelectedTool('sell');
          toast.info('Tool: Sell');
          break;
        case 'r':
          setSelectedTool('repair');
          toast.info('Tool: Repair');
          break;
        case 't':
          setSelectedTool('turret');
          toast.info('Tool: Standard Turret');
          break;
        case 'y': // 'S' is taken, so use 'Y' for Sniper (or maybe 'P' for Precision?)
          setSelectedTool('sniper');
          toast.info('Tool: Sniper Turret');
          break;
        case 'escape':
          setSelectedTool('empty'); // Or whatever "no tool" state is appropriate
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    repairTurret,
    clearRubble,
    highScore,
    particles
  } = useGameEngine(width, height, grid, pathPreview, (x, y, originalTile) => {
    setGrid(prev => {
      const newGrid = [...prev];
      // Set to rubble instead of restoring original tile
      newGrid[y][x] = 'rubble';
      return newGrid;
    });
  });
  
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
        } else if (grid[y][x] === 'rubble') {
          if (clearRubble(x, y)) {
            const newGrid = [...grid];
            newGrid[y][x] = 'empty'; // Or whatever was there before? For now, empty.
            setGrid(newGrid);
            toast.success('Rubble cleared!');
          } else {
            toast.error('Insufficient credits to clear rubble!');
          }
        }
        return;
      }

      if (selectedTool === 'repair') {
        const turret = getTurretAt(x, y);
        if (turret) {
          if (turret.health >= turret.maxHealth) {
            toast.info('Turret is already fully operational.');
          } else {
            if (repairTurret(x, y)) {
              toast.success('Turret repaired!');
            } else {
              toast.error('Insufficient credits for repair!');
            }
          }
        }
        return;
      }

      if (selectedTool === 'turret' || selectedTool === 'sniper') {
        // Handle selection for range display
        if (grid[y][x] === 'turret' || grid[y][x] === 'sniper') {
          setSelectedTurret({ x, y });
        } else {
          setSelectedTurret(null);
        }

        if (grid[y][x] === 'empty' || grid[y][x] === 'wall' || grid[y][x] === 'rubble') {
          // If rubble, try to clear it first (cost included in build or separate?)
          // For better UX, let's just assume building on rubble clears it for free or includes the cost.
          // Let's check if we can build.
          
          // If it's rubble, we might want to charge the clear cost automatically?
          // Or just allow building over it if they have enough money for the turret.
          // Let's keep it simple: building over rubble is allowed and replaces it.
          
          if (buildTurret(x, y, selectedTool === 'sniper' ? 'sniper' : 'standard')) {
            const newGrid = [...grid];
            newGrid[y][x] = selectedTool;
            setGrid(newGrid);
            toast.success(`${selectedTool === 'sniper' ? 'Sniper' : 'Turret'} deployed!`);
          } else {
            toast.error('Insufficient credits!');
          }
        } else if (grid[y][x] === 'turret' || grid[y][x] === 'sniper') {
          // Upgrade logic
          if (upgradeTurret(x, y)) {
            toast.success('Turret upgraded!');
          } else {
            const turret = getTurretAt(x, y);
            if (turret) {
              const cost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
              toast.info(`Level ${turret.level} ${turret.type === 'sniper' ? 'Sniper' : 'Turret'} (Upgrade: ${cost} CR)`);
            }
          }
        }
      }
      return;
    }

    // Editor logic
    if (selectedTool !== 'sell' && selectedTool !== 'repair') {
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
      <Card className="p-4 panel flex flex-wrap items-center gap-4 justify-between bg-black/80 backdrop-blur-md border-primary/20">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <label className="text-xs text-slate-400 uppercase tracking-widest font-mono">Sector ID</label>
            <Input 
              value={levelName} 
              onChange={(e) => setLevelName(e.target.value)} 
              className="w-64 font-mono bg-black/50 border-primary/30 focus:border-primary"
            />
          </div>
          
          <div className="flex items-center gap-2 border-l border-border pl-4">
            <div className="flex flex-col w-20">
              <label className="text-xs text-slate-400 uppercase tracking-widest font-mono">Width</label>
              <Input 
                type="number" 
                value={width} 
                onChange={(e) => setWidth(Number(e.target.value))}
                className="font-mono bg-black/50"
              />
            </div>
            <div className="flex flex-col w-20">
              <label className="text-xs text-slate-400 uppercase tracking-widest font-mono">Height</label>
              <Input 
                type="number" 
                value={height} 
                onChange={(e) => setHeight(Number(e.target.value))}
                className="font-mono bg-black/50"
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
              <Button onClick={startGame} className="bg-green-600 hover:bg-green-500 text-white ml-4 hazard-border">
                <Play className="w-4 h-4 mr-2" /> Engage
              </Button>
            </>
          ) : (
            <Button onClick={stopGame} variant="destructive" className="hazard-border">
              Abort Mission
            </Button>
          )}
        </div>
      </Card>

      <div className="flex flex-1 gap-6 min-h-0">
        {/* Tools Sidebar */}
        <Card className="w-64 p-4 flex flex-col gap-4 bg-black/80 backdrop-blur-md border-primary/20 overflow-y-auto">
          <h3 className="text-primary font-bold tracking-widest uppercase border-b border-primary/30 pb-2">
            {gameState === 'editing' ? 'Construction' : 'Defense Systems'}
          </h3>
          
          <div className="grid grid-cols-2 gap-2">
            {(['empty', 'wall', 'path', 'base', 'spawn'] as const).map((tool) => (
              gameState === 'editing' && (
                <Button
                  key={tool}
                  variant={selectedTool === tool ? "default" : "outline"}
                  className={`
                    h-24 flex flex-col gap-2 relative overflow-hidden transition-all duration-300
                    ${selectedTool === tool ? 'ring-2 ring-primary ring-offset-2 ring-offset-black' : 'hover:border-primary/50'}
                  `}
                  onClick={() => setSelectedTool(tool)}
                >
                  <div className={`w-8 h-8 ${TILE_COLORS[tool]} border border-white/10 shadow-lg`} />
                  <span className="text-xs font-mono uppercase">{tool}</span>
                  {selectedTool === tool && (
                    <div className="absolute inset-0 bg-primary/10 animate-pulse" />
                  )}
                </Button>
              )
            ))}

            {/* Game Tools */}
            {gameState === 'playing' && (
              <>
                <Button
                  variant={selectedTool === 'turret' ? "default" : "outline"}
                  className={`h-24 flex flex-col gap-2 ${selectedTool === 'turret' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedTool('turret')}
                >
                  <div className={`w-8 h-8 ${TILE_COLORS.turret}`} />
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-mono uppercase">Turret</span>
                    <span className="text-[10px] text-yellow-500">{TURRET_COST} CR</span>
                  </div>
                </Button>

                <Button
                  variant={selectedTool === 'sniper' ? "default" : "outline"}
                  className={`h-24 flex flex-col gap-2 ${selectedTool === 'sniper' ? 'ring-2 ring-primary' : ''}`}
                  onClick={() => setSelectedTool('sniper')}
                >
                  <div className={`w-8 h-8 ${TILE_COLORS.sniper}`} />
                  <div className="flex flex-col items-center">
                    <span className="text-xs font-mono uppercase">Sniper</span>
                    <span className="text-[10px] text-purple-400">{SNIPER_COST} CR</span>
                  </div>
                </Button>

                <Button
                  variant={selectedTool === 'sell' ? "destructive" : "outline"}
                  className={`h-24 flex flex-col gap-2 ${selectedTool === 'sell' ? 'ring-2 ring-destructive' : ''}`}
                  onClick={() => setSelectedTool('sell')}
                >
                  <div className="w-8 h-8 bg-destructive/20 flex items-center justify-center rounded border border-destructive">
                    <span className="text-xs">✕</span>
                  </div>
                  <span className="text-xs font-mono uppercase">Sell</span>
                </Button>

                <Button
                  variant={selectedTool === 'repair' ? "default" : "outline"}
                  className={`h-24 flex flex-col gap-2 ${selectedTool === 'repair' ? 'ring-2 ring-blue-500' : ''}`}
                  onClick={() => setSelectedTool('repair')}
                >
                  <div className="w-8 h-8 bg-blue-500/20 flex items-center justify-center rounded border border-blue-500">
                    <Wrench className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-mono uppercase">Repair</span>
                </Button>
              </>
            )}
          </div>

          {gameState === 'playing' && (
            <div className="mt-auto pt-4 border-t border-border">
              <div className="space-y-2 font-mono text-xs text-slate-400">
                <div className="flex justify-between">
                  <span>WAVE</span>
                  <span className="text-primary">{wave}</span>
                </div>
                <div className="flex justify-between">
                  <span>LIVES</span>
                  <span className={lives < 5 ? "text-destructive animate-pulse" : "text-primary"}>{lives}</span>
                </div>
                <div className="flex justify-between">
                  <span>CREDITS</span>
                  <span className="text-yellow-500">{money}</span>
                </div>
                <div className="flex justify-between">
                  <span>SCORE</span>
                  <span className="text-blue-400">{highScore}</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Main Grid Area */}
        <div className="flex-1 relative bg-black/40 rounded-lg border border-white/5 overflow-hidden flex items-center justify-center p-8">
          {/* Grid Background Effect */}
          <div className="absolute inset-0 grid-bg opacity-20 pointer-events-none" />
          
          <div 
            className="grid gap-[1px] bg-border/30 p-[1px] shadow-2xl relative z-10"
            style={{ 
              gridTemplateColumns: `repeat(${width}, minmax(2rem, 1fr))`,
              width: 'fit-content',
              height: 'fit-content',
              maxHeight: '100%',
              maxWidth: '100%',
              overflow: 'auto'
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
                      } else if (gameState === 'playing') {
                        // Allow all tools (turret, sniper, sell, repair) to trigger click
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
                      ${gameState === 'editing' || (gameState === 'playing' && (tileType === 'empty' || tileType === 'wall' || tileType === 'turret' || tileType === 'sniper')) ? 'cursor-pointer hover:brightness-125' : ''}
                      ${selectedTool === 'sell' && (tileType === 'turret' || tileType === 'sniper') ? 'hover:bg-red-500/50 hover:border-red-500' : ''}
                      border border-white/5
                    `}
                    title={`Coordinates: ${x},${y}`}
                  >
                    {/* Path Preview Dot */}
                    {isPath && tileType === 'empty' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-2 h-2 rounded-full bg-primary/50 animate-pulse" />
                      </div>
                    )}

                    {/* Turret Range Indicator */}
                    {selectedTurret && selectedTurret.x === x && selectedTurret.y === y && (
                      <div 
                        className="absolute rounded-full border-2 border-cyan-500/50 bg-cyan-500/10 pointer-events-none z-20"
                        style={{
                          width: `${(grid[y][x] === 'sniper' ? 7.0 : 3.5) * 2 * 100}%`, // Range * 2 (diameter) * 100% of tile size
                          height: `${(grid[y][x] === 'sniper' ? 7.0 : 3.5) * 2 * 100}%`,
                          top: '50%',
                          left: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      />
                    )}

                    {/* Entities Layer */}
                    {gameState === 'playing' && (
                      <>
                        {/* Enemies */}
                        {enemies.filter(e => Math.floor(e.x) === x && Math.floor(e.y) === y).map(enemy => (
                          <div 
                            key={enemy.id}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
                          >
                            <div 
                              className={`w-6 h-6 rounded-full ${ENEMY_STATS[enemy.type].color} shadow-lg border border-white/20 relative`}
                            >
                              {/* Health Bar */}
                              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/50 rounded-full overflow-hidden">
                                <div 
                                  className="h-full bg-green-500 transition-all duration-200"
                                  style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}

                        {/* Projectiles */}
                        {projectiles.filter(p => Math.floor(p.x) === x && Math.floor(p.y) === y).map(proj => (
                          <div
                            key={proj.id}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                          >
                            <div className="w-2 h-2 bg-yellow-400 rounded-full shadow-[0_0_10px_rgba(250,204,21,0.8)] animate-ping" />
                          </div>
                        ))}

                        {/* Particles */}
                        {particles.filter(p => Math.floor(p.x) === x && Math.floor(p.y) === y).map(p => (
                          <div
                            key={p.id}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-40"
                          >
                            <div 
                              className="w-1 h-1 rounded-full"
                              style={{ 
                                backgroundColor: p.color,
                                opacity: p.life,
                                transform: `translate(${(Math.random() - 0.5) * 20}px, ${(Math.random() - 0.5) * 20}px)`
                              }} 
                            />
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
