import { useState, useEffect } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, ENEMY_STATS, QUARRY_COST, FORGE_COST, REPAIR_BUILDING_COST, REPAIR_FACTORY_COST } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';
import { useGameEngine } from '@/hooks/useGameEngine';
import { Enemy } from '@/lib/gameTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Trash2, Play, Grid3X3, Download, Upload, Wrench, Pickaxe, Hammer, Mountain, Gem, EyeOff, Bot } from 'lucide-react';

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
        case 'q':
          setSelectedTool('quarry');
          toast.info('Tool: Quarry');
          break;
        case 'f':
          setSelectedTool('forge');
          toast.info('Tool: Forge');
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
  } = useGameEngine(width, height, grid, pathPreview, (x, y, originalTile) => {
    setGrid(prev => {
      const newGrid = [...prev];
      // Set to rubble instead of restoring original tile
      newGrid[y][x] = 'rubble';
      return newGrid;
    });
  }, (x, y, type) => {
    // On job complete
    setGrid(prev => {
      const newGrid = [...prev];
      newGrid[y][x] = type;
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
          const baseCost = turret.type === 'sniper' ? SNIPER_COST : TURRET_COST;
          const upgradeCost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
          const refundMetal = Math.floor((baseCost.metal + (turret.level - 1) * upgradeCost.metal) * 0.5);
          const refundStone = Math.floor((baseCost.stone + (turret.level - 1) * upgradeCost.stone) * 0.5);
          
          const originalTile = sellTurret(x, y);
          
          // Force update grid visual if engine confirms sale
          if (originalTile) {
            const newGrid = [...grid];
            newGrid[y][x] = originalTile;
            setGrid(newGrid);
            toast.success(`Turret recycled! +${refundMetal} Metal, +${refundStone} Stone`);
          }
        } else if (grid[y][x] === 'rubble') {
          if (clearRubble(x, y)) {
            const newGrid = [...grid];
            newGrid[y][x] = 'empty'; // Or whatever was there before? For now, empty.
            setGrid(newGrid);
            toast.success('Rubble cleared!');
          } else {
            toast.error('Insufficient resources to clear rubble!');
          }
        }
        return;
      }

      if (selectedTool === 'repair') {
        // Check for abandoned buildings first
        if (grid[y][x] === 'abandoned_quarry' || grid[y][x] === 'abandoned_forge' || grid[y][x] === 'abandoned_drone_factory') {
          const newType = repairBuilding(x, y, grid[y][x] as 'abandoned_quarry' | 'abandoned_forge' | 'abandoned_drone_factory');
          if (newType) {
            const newGrid = [...grid];
            newGrid[y][x] = newType;
            setGrid(newGrid);
            toast.success('Facility restored and operational!');
          } else {
            const cost = grid[y][x] === 'abandoned_drone_factory' ? REPAIR_FACTORY_COST : REPAIR_BUILDING_COST;
            toast.error(`Need ${cost.stone} Stone, ${cost.metal} Metal to repair!`);
          }
          return;
        }

        const turret = getTurretAt(x, y);
        if (turret) {
          if (turret.health >= turret.maxHealth) {
            toast.info('Turret is already fully operational.');
          } else {
            if (repairTurret(x, y)) {
              toast.success('Turret repaired!');
            } else {
              toast.error('Insufficient resources for repair!');
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
          if (buildTurret(x, y, selectedTool === 'sniper' ? 'sniper' : 'standard')) {
            // Don't update grid immediately - wait for drone
            toast.success(`Construction order placed! Waiting for drone...`);
          } else {
            toast.error('Insufficient resources!');
          }
        } else if (grid[y][x] === 'turret' || grid[y][x] === 'sniper') {
          // Upgrade logic
          if (upgradeTurret(x, y)) {
            toast.success('Turret upgraded!');
          } else {
            const turret = getTurretAt(x, y);
            if (turret) {
              const cost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
              toast.info(`Level ${turret.level} ${turret.type === 'sniper' ? 'Sniper' : 'Turret'} (Upgrade: ${cost.metal} Metal)`);
            }
          }
        }
      }

      if (selectedTool === 'quarry' || selectedTool === 'forge') {
        // Building placement logic
        const requiredTile = selectedTool === 'quarry' ? 'resource_stone' : 'resource_metal';
        
        if (grid[y][x] === requiredTile) {
           if (buildBuilding(x, y, selectedTool)) {
             // Don't update grid immediately - wait for drone
             toast.success(`Construction order placed! Waiting for drone...`);
           } else {
             toast.error('Insufficient resources!');
           }
        } else {
          toast.error(`Must build ${selectedTool} on ${selectedTool === 'quarry' ? 'Stone' : 'Metal'} deposit!`);
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
              <Button onClick={startGame} className="bg-green-600 hover:bg-green-700 text-white hazard-border animate-pulse">
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

      <div className="flex gap-6 h-full min-h-0">
        {/* Tools Sidebar */}
        <Card className="w-64 p-4 panel flex flex-col gap-4 bg-black/80 backdrop-blur-md border-primary/20 overflow-y-auto">
          <div className="flex items-center gap-2 pb-2 border-b border-border">
            <Wrench className="w-4 h-4 text-primary" />
            <h2 className="font-mono text-sm tracking-widest text-primary">CONSTRUCTION</h2>
          </div>
          
          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant={selectedTool === 'empty' ? 'default' : 'outline'} 
              className={`h-20 flex flex-col gap-2 ${selectedTool === 'empty' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('empty')}
            >
              <div className="w-6 h-6 bg-slate-900 border border-slate-700" />
              <span className="text-xs font-mono">EMPTY</span>
            </Button>
            
            <Button 
              variant={selectedTool === 'wall' ? 'default' : 'outline'} 
              className={`h-20 flex flex-col gap-2 ${selectedTool === 'wall' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('wall')}
            >
              <div className="w-6 h-6 bg-slate-800 border border-slate-600" />
              <span className="text-xs font-mono">WALL</span>
            </Button>

            <Button 
              variant={selectedTool === 'path' ? 'default' : 'outline'} 
              className={`h-20 flex flex-col gap-2 ${selectedTool === 'path' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('path')}
            >
              <div className="w-6 h-6 bg-slate-700" />
              <span className="text-xs font-mono">PATH</span>
            </Button>

            <Button 
              variant={selectedTool === 'base' ? 'default' : 'outline'} 
              className={`h-20 flex flex-col gap-2 ${selectedTool === 'base' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('base')}
            >
              <div className="w-6 h-6 bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]" />
              <span className="text-xs font-mono">BASE</span>
            </Button>

            <Button 
              variant={selectedTool === 'spawn' ? 'default' : 'outline'} 
              className={`h-20 flex flex-col gap-2 ${selectedTool === 'spawn' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('spawn')}
            >
              <div className="w-6 h-6 bg-red-600 shadow-[0_0_10px_rgba(220,38,38,0.5)]" />
              <span className="text-xs font-mono">SPAWN</span>
            </Button>

            <Button 
              variant={selectedTool === 'resource_stone' ? 'default' : 'outline'} 
              className={`h-20 flex flex-col gap-2 ${selectedTool === 'resource_stone' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('resource_stone')}
            >
              <div className="w-6 h-6 bg-stone-400" />
              <span className="text-xs font-mono">STONE</span>
            </Button>

            <Button 
              variant={selectedTool === 'resource_metal' ? 'default' : 'outline'} 
              className={`h-20 flex flex-col gap-2 ${selectedTool === 'resource_metal' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('resource_metal')}
            >
              <div className="w-6 h-6 bg-cyan-700" />
              <span className="text-xs font-mono">METAL</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 pb-2 border-b border-border mt-4">
            <Pickaxe className="w-4 h-4 text-primary" />
            <h2 className="font-mono text-sm tracking-widest text-primary">BUILDINGS</h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant={selectedTool === 'quarry' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'quarry' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('quarry')}
            >
              <div className="w-6 h-6 bg-amber-700 rounded-sm" />
              <span className="text-xs font-mono font-bold">QUARRY</span>
              <span className="text-[10px] text-slate-400">{QUARRY_COST.stone}S</span>
            </Button>

            <Button 
              variant={selectedTool === 'forge' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'forge' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('forge')}
            >
              <div className="w-6 h-6 bg-orange-600 rounded-sm" />
              <span className="text-xs font-mono font-bold">FORGE</span>
              <span className="text-[10px] text-slate-400">{FORGE_COST.stone}S</span>
            </Button>

            <Button 
              variant={selectedTool === 'abandoned_quarry' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'abandoned_quarry' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('abandoned_quarry')}
            >
              <div className="w-6 h-6 bg-amber-900/50 rounded-sm border border-amber-700/50" />
              <span className="text-xs font-mono font-bold text-center">OLD QUARRY</span>
            </Button>

            <Button 
              variant={selectedTool === 'abandoned_forge' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'abandoned_forge' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('abandoned_forge')}
            >
              <div className="w-6 h-6 bg-orange-900/50 rounded-sm border border-orange-700/50" />
              <span className="text-xs font-mono font-bold text-center">OLD FORGE</span>
            </Button>

            <Button 
              variant={selectedTool === 'turret' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'turret' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('turret')}
            >
              <div className="w-6 h-6 bg-yellow-500 rounded-full" />
              <span className="text-xs font-mono font-bold">TURRET</span>
              <span className="text-[10px] text-slate-400">{TURRET_COST.metal}M</span>
            </Button>

            <Button 
              variant={selectedTool === 'sniper' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'sniper' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('sniper')}
            >
              <div className="w-6 h-6 bg-purple-500 rounded-full border-2 border-white/20" />
              <span className="text-xs font-mono font-bold">SNIPER</span>
              <span className="text-[10px] text-slate-400">{SNIPER_COST.metal}M</span>
            </Button>

            <Button 
              variant={selectedTool === 'drone_factory' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'drone_factory' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('drone_factory')}
            >
              <div className="w-6 h-6 bg-indigo-600 rounded-sm" />
              <span className="text-xs font-mono font-bold">DRONE FAC</span>
              <span className="text-[10px] text-slate-400">SPAWN</span>
            </Button>

            <Button 
              variant={selectedTool === 'abandoned_drone_factory' ? 'default' : 'outline'} 
              className={`h-24 flex flex-col gap-1 ${selectedTool === 'abandoned_drone_factory' ? 'bg-slate-800 ring-2 ring-primary' : 'bg-slate-900/50'}`}
              onClick={() => setSelectedTool('abandoned_drone_factory')}
            >
              <div className="w-6 h-6 bg-indigo-900/50 rounded-sm border border-indigo-700/50" />
              <span className="text-xs font-mono font-bold text-center">OLD FACTORY</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 pb-2 border-b border-border mt-4">
            <Hammer className="w-4 h-4 text-primary" />
            <h2 className="font-mono text-sm tracking-widest text-primary">ACTIONS</h2>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button 
              variant={selectedTool === 'sell' ? 'default' : 'outline'} 
              className={`h-16 flex flex-col gap-1 ${selectedTool === 'sell' ? 'bg-red-900/20 ring-2 ring-red-500' : 'bg-slate-900/50 hover:bg-red-900/10'}`}
              onClick={() => setSelectedTool('sell')}
            >
              <span className="text-xs font-mono text-red-400">RECYCLE</span>
            </Button>

            <Button 
              variant={selectedTool === 'repair' ? 'default' : 'outline'} 
              className={`h-16 flex flex-col gap-1 ${selectedTool === 'repair' ? 'bg-green-900/20 ring-2 ring-green-500' : 'bg-slate-900/50 hover:bg-green-900/10'}`}
              onClick={() => setSelectedTool('repair')}
            >
              <span className="text-xs font-mono text-green-400">REPAIR</span>
            </Button>
          </div>
        </Card>

        {/* Main Grid Area */}
        <div className="flex-1 flex flex-col gap-4">
          {/* HUD */}
          <div className="flex items-center justify-between bg-black/60 p-4 rounded-lg border border-primary/20 backdrop-blur-sm">
            <div className="flex items-center gap-8">
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Status</span>
                <span className={`font-mono text-xl ${gameState === 'playing' ? 'text-green-400 animate-pulse' : 'text-yellow-400'}`}>
                  {gameState === 'playing' ? 'COMBAT ACTIVE' : 'DESIGN MODE'}
                </span>
              </div>
              
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Wave</span>
                <span className="font-mono text-xl text-white">{wave}</span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Lives</span>
                <span className={`font-mono text-xl ${lives < 5 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                  {lives}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Drones</span>
                <span className="font-mono text-xl text-indigo-400">{drones.length}</span>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Stone</span>
                <span className="font-mono text-2xl text-stone-400 drop-shadow-[0_0_5px_rgba(168,162,158,0.5)]">
                  {Math.floor(resources?.stone || 0)}
                </span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-slate-400 uppercase tracking-widest">Metal</span>
                <span className="font-mono text-2xl text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">
                  {Math.floor(resources?.metal || 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Game Grid */}
          <div className="flex-1 bg-slate-950/50 rounded-lg border border-slate-800 flex items-center justify-center overflow-hidden relative">
            {gameState === 'gameover' && (
              <div className="absolute inset-0 z-50 bg-black/80 flex flex-col items-center justify-center animate-in fade-in duration-500">
                <h1 className="text-6xl font-black text-red-600 tracking-tighter mb-4 glitch-text">MISSION FAILED</h1>
                <div className="flex flex-col gap-2 text-center mb-8">
                  <p className="text-slate-400 font-mono">SECTOR OVERRUN AT WAVE {wave}</p>
                  <p className="text-primary font-mono">HIGHEST WAVE SURVIVED: {highScore}</p>
                </div>
                <Button onClick={stopGame} size="lg" className="bg-white text-black hover:bg-slate-200 font-bold tracking-widest">
                  RETURN TO EDITOR
                </Button>
              </div>
            )}

            <div 
              className="grid gap-[1px] bg-slate-900/50 p-4 shadow-2xl"
              style={{
                gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`,
                width: 'fit-content',
              }}
              onMouseLeave={() => setIsDragging(false)}
              onMouseUp={() => setIsDragging(false)}
            >
              {grid.map((row, y) => (
                row.map((tile, x) => {
                  const turret = getTurretAt(x, y);
                  const isSelected = selectedTurret?.x === x && selectedTurret?.y === y;
                  const isVisible = gameState === 'editing' || (visibleTiles[y] && visibleTiles[y][x]);
                  const job = jobs.find(j => j.x === x && j.y === y);
                  
                  return (
                    <div
                      key={`${x}-${y}`}
                      className={`
                        w-10 h-10 relative transition-all duration-200
                        ${isVisible ? TILE_COLORS[tile] : 'bg-black'}
                        ${isVisible && tile === 'empty' ? 'hover:bg-slate-800/50' : ''}
                        ${isVisible && tile === 'path' && pathPreview?.some(p => p.x === x && p.y === y) ? 'brightness-125 shadow-[inset_0_0_10px_rgba(59,130,246,0.3)]' : ''}
                        ${isSelected ? 'ring-2 ring-white z-10' : ''}
                        cursor-pointer
                      `}
                      onMouseDown={() => {
                        setIsDragging(true);
                        handleTileClick(x, y);
                      }}
                      onMouseEnter={() => handleMouseEnter(x, y)}
                    >
                      {/* Fog Overlay */}
                      {!isVisible && (
                        <div className="absolute inset-0 bg-black z-50 flex items-center justify-center">
                          <EyeOff className="w-3 h-3 text-slate-800" />
                        </div>
                      )}

                      {/* Construction Site Overlay */}
                      {isVisible && job && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10 border border-yellow-500/50 border-dashed">
                          <div className="w-full h-1 bg-slate-800 absolute bottom-1 left-0">
                            <div 
                              className="h-full bg-yellow-500 transition-all duration-200"
                              style={{ width: `${job.progress}%` }}
                            />
                          </div>
                          <Wrench className="w-4 h-4 text-yellow-500 animate-pulse" />
                        </div>
                      )}

                      {/* Turret Level Indicator */}
                      {isVisible && turret && (
                        <div className="absolute top-0 right-0 bg-black/80 text-[8px] px-1 rounded-bl text-white font-mono">
                          L{turret.level}
                        </div>
                      )}

                      {/* Health Bar */}
                      {isVisible && turret && turret.health < turret.maxHealth && (
                        <div className="absolute -top-2 left-0 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-300 ${
                              turret.health / turret.maxHealth < 0.3 ? 'bg-red-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${(turret.health / turret.maxHealth) * 100}%` }}
                          />
                        </div>
                      )}

                      {/* Range Indicator */}
                      {isSelected && turret && (
                        <div 
                          className="absolute top-1/2 left-1/2 rounded-full border-2 border-white/20 bg-white/5 pointer-events-none z-20"
                          style={{
                            width: `${turret.range * 2 * 40}px`, // 40px is tile size
                            height: `${turret.range * 2 * 40}px`,
                            transform: 'translate(-50%, -50%)'
                          }}
                        />
                      )}

                      {/* Render Game Entities */}
                      {gameState === 'playing' && isVisible && (
                        <>
                          {/* Drones */}
                          {drones.filter(d => Math.abs(d.x - x) < 0.5 && Math.abs(d.y - y) < 0.5).map(drone => (
                            <div
                              key={drone.id}
                              className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                              style={{
                                transform: `translate(${(drone.x - x) * 40}px, ${(drone.y - y) * 40}px)`
                              }}
                            >
                              <Bot className={`w-4 h-4 ${drone.state === 'working' ? 'text-yellow-400 animate-bounce' : 'text-indigo-400'}`} />
                            </div>
                          ))}

                          {/* Enemies */}
                          {enemies.filter(e => Math.floor(e.x) === x && Math.floor(e.y) === y).map(enemy => (
                            <div
                              key={enemy.id}
                              className={`absolute inset-0 m-1 rounded-full shadow-lg transition-transform duration-100 z-20 ${ENEMY_STATS[enemy.type].color}`}
                              style={{
                                transform: `translate(${(enemy.x - x) * 40}px, ${(enemy.y - y) * 40}px)`
                              }}
                            >
                              {/* Enemy Health Bar */}
                              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                                <div 
                                  className="h-full bg-red-500 transition-all duration-100"
                                  style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
                                />
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

                          {/* Damage Numbers */}
                          {damageNumbers.filter(d => Math.floor(d.x) === x && Math.floor(d.y) === y).map(d => (
                            <div
                              key={d.id}
                              className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
                              style={{
                                transform: `translateY(-${(1 - d.life) * 30}px) scale(${d.isCritical ? 1.5 : 1})`,
                                opacity: d.life
                              }}
                            >
                              <span 
                                className={`font-bold drop-shadow-md ${d.isCritical ? 'text-sm animate-bounce' : 'text-xs'}`}
                                style={{ 
                                  color: d.isCritical ? '#fbbf24' : d.color, // Amber-400 for crit
                                  textShadow: d.isCritical ? '0 0 5px rgba(251, 191, 36, 0.8)' : 'none'
                                }}
                              >
                                {Math.round(d.value)}
                                {d.isCritical && '!'}
                              </span>
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
    </div>
  );
}
