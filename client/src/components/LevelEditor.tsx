import { useState, useEffect, useCallback, useRef } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, ENEMY_STATS, QUARRY_COST, FORGE_COST, REPAIR_BUILDING_COST, REPAIR_FACTORY_COST, MAINTENANCE_HUB_COST, HERO_STATS } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';
import { useGameEngine } from '@/hooks/useGameEngine';
import { Enemy } from '@/lib/gameTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { gameToast } from '@/lib/toastUtils';
import { Save, Trash2, Play, Grid3X3, Download, Upload, Wrench, Pickaxe, Hammer, Mountain, Gem, EyeOff, Bot, HeartPulse, ArrowDownCircle, User, Flag, Radio } from 'lucide-react';

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
  const viewportRef = useRef<HTMLDivElement>(null);

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
          gameToast.info('Tool: Sell', 'tool_select');
          break;
        case 'r':
          setSelectedTool('repair');
          gameToast.info('Tool: Repair', 'tool_select');
          break;
        case 't':
          setSelectedTool('turret');
          gameToast.info('Tool: Standard Turret', 'tool_select');
          break;
        case 'y': // 'S' is taken, so use 'Y' for Sniper (or maybe 'P' for Precision?)
          setSelectedTool('sniper');
          gameToast.info('Tool: Sniper Turret', 'tool_select');
          break;
        case 'q':
          setSelectedTool('quarry');
          gameToast.info('Tool: Quarry', 'tool_select');
          break;
        case 'f':
          setSelectedTool('forge');
          gameToast.info('Tool: Forge', 'tool_select');
          break;
        case 'm':
          setSelectedTool('maintenance_hub');
          gameToast.info('Tool: Maintenance Hub', 'tool_select');
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
    hero,
    extractionProgress,
    isExtracting,
    preparationTime,
    isPreparationPhase,
    currentWave,
    skipPreparation,
    startGame, 
    stopGame,
    turrets,
    buildings,
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
      // No grid update needed for wreckage logic
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

  // Camera Follow Logic
  useEffect(() => {
    if (gameState === 'playing' && hero && viewportRef.current) {
      const tileSize = 32;
      const heroX = hero.x * tileSize;
      const heroY = hero.y * tileSize;
      
      const viewport = viewportRef.current;
      const viewportWidth = viewport.clientWidth;
      const viewportHeight = viewport.clientHeight;
      
      // Center the camera on the hero
      viewport.scrollTo({
        left: heroX - viewportWidth / 2,
        top: heroY - viewportHeight / 2,
        behavior: 'smooth'
      });
    }
  }, [hero?.x, hero?.y, gameState]);
  
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
            gameToast.success(`Turret recycled! +${refundMetal} Metal, +${refundStone} Stone`);
          }
        } else if (grid[y][x] === 'rubble') {
          if (clearRubble(x, y)) {
            const newGrid = [...grid];
            newGrid[y][x] = 'empty'; // Or whatever was there before? For now, empty.
            setGrid(newGrid);
            gameToast.success('Rubble cleared!');
          } else {
            gameToast.error('Insufficient resources to clear rubble!', 'resource_error');
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
            gameToast.success('Facility restored and operational!');
          } else {
            const cost = grid[y][x] === 'abandoned_drone_factory' ? REPAIR_FACTORY_COST : REPAIR_BUILDING_COST;
            gameToast.error(`Need ${cost.stone} Stone, ${cost.metal} Metal to repair!`, 'resource_error');
          }
          return;
        }

        const turret = getTurretAt(x, y);
        if (turret) {
          if (turret.health >= turret.maxHealth) {
            gameToast.info('Turret is already fully operational.', 'turret_full_health');
          } else {
            if (repairTurret(x, y)) {
              gameToast.success('Turret repaired!');
            } else {
              gameToast.error('Insufficient resources for repair!', 'resource_error');
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
            gameToast.success(`Construction order placed! Waiting for drone...`);
          } else {
            gameToast.error('Insufficient resources!', 'resource_error');
          }
        } else if (grid[y][x] === 'turret' || grid[y][x] === 'sniper') {
          // Upgrade logic
          if (upgradeTurret(x, y)) {
            gameToast.success('Turret upgraded!');
          } else {
            const turret = getTurretAt(x, y);
            if (turret) {
              const cost = turret.type === 'sniper' ? SNIPER_UPGRADE_COST : UPGRADE_COST;
              gameToast.info(`Level ${turret.level} ${turret.type === 'sniper' ? 'Sniper' : 'Turret'} (Upgrade: ${cost.metal} Metal)`, 'upgrade_info');
            }
          }
        }
      }

      if (selectedTool === 'quarry' || selectedTool === 'forge' || selectedTool === 'maintenance_hub') {
        // Building placement logic
        const requiredTile = selectedTool === 'quarry' ? 'resource_stone' : (selectedTool === 'forge' ? 'resource_metal' : null);
        
        if (!requiredTile || grid[y][x] === requiredTile || (selectedTool === 'maintenance_hub' && (grid[y][x] === 'empty' || grid[y][x] === 'rubble'))) {
           if (buildBuilding(x, y, selectedTool)) {
             // Don't update grid immediately - wait for drone
             gameToast.success(`Construction order placed! Waiting for drone...`);
           } else {
             gameToast.error('Insufficient resources!', 'resource_error');
           }
        } else {
          gameToast.error(`Invalid placement for ${selectedTool}!`, 'invalid_placement');
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

  const handleMouseDown = (x: number, y: number) => {
    setIsDragging(true);
    handleTileClick(x, y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const saveLevel = () => {
    const levelData: LevelData = {
      id: crypto.randomUUID(),
      name: levelName,
      width,
      height,
      tiles: grid
    };
    
    const blob = new Blob([JSON.stringify(levelData)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${levelName.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    gameToast.success('Level saved!');
  };

  const loadLevel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as LevelData;
        setLevelName(data.name);
        setWidth(data.width);
        setHeight(data.height);
        setGrid(data.tiles);
        gameToast.success('Level loaded!');
      } catch (err) {
        gameToast.error('Failed to load level file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="font-bold text-lg bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
            {gameState === 'playing' ? 'Mission Control' : 'Sector Editor'}
          </h1>
          
          {gameState === 'playing' && (
            <div className="flex items-center gap-6 text-sm font-mono">
              <div className="flex items-center gap-2 text-red-400">
                <HeartPulse className="w-4 h-4" />
                <span>{hero ? Math.ceil(hero.health) : 0}/{HERO_STATS.maxHealth}</span>
              </div>
              <div className="flex items-center gap-2 text-amber-400">
                <Mountain className="w-4 h-4" />
                <span>{Math.floor(resources.stone)}</span>
              </div>
              <div className="flex items-center gap-2 text-cyan-400">
                <Gem className="w-4 h-4" />
                <span>{Math.floor(resources.metal)}</span>
              </div>
              <div className="flex items-center gap-2 text-emerald-400">
                <Bot className="w-4 h-4" />
                <span>{drones.filter(d => d.type === 'worker').length} Workers</span>
              </div>
              {isExtracting && (
                <div className="flex items-center gap-2 text-purple-400 animate-pulse">
                  <Radio className="w-4 h-4" />
                  <span>Uploading: {Math.floor(extractionProgress)}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {gameState === 'editing' ? (
            <>
              <Input
                value={levelName}
                onChange={(e) => setLevelName(e.target.value)}
                className="w-40 h-8 bg-slate-900 border-slate-700"
              />
              <Button size="sm" variant="outline" onClick={saveLevel}>
                <Download className="w-4 h-4 mr-2" /> Export
              </Button>
              <div className="relative">
                <Button size="sm" variant="outline" className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" /> Import
                </Button>
                <input
                  type="file"
                  accept=".json"
                  onChange={loadLevel}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>
              <Button size="sm" onClick={startGame} className="bg-green-600 hover:bg-green-700 text-white">
                <Play className="w-4 h-4 mr-2" /> Deploy Commander
              </Button>
            </>
          ) : (
            <Button size="sm" variant="destructive" onClick={stopGame}>
              Abort Mission
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tools */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/30 p-4 flex flex-col gap-6 overflow-y-auto">
          {gameState === 'editing' ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Terrain</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedTool === 'wall' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('wall')}
                  >
                    <div className="w-4 h-4 bg-slate-600 mr-2 rounded-sm" /> Wall
                  </Button>
                  <Button 
                    variant={selectedTool === 'path' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('path')}
                  >
                    <div className="w-4 h-4 bg-amber-900/50 mr-2 rounded-sm" /> Path
                  </Button>
                  <Button 
                    variant={selectedTool === 'resource_stone' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('resource_stone')}
                  >
                    <Mountain className="w-4 h-4 mr-2 text-stone-400" /> Stone
                  </Button>
                  <Button 
                    variant={selectedTool === 'resource_metal' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('resource_metal')}
                  >
                    <Gem className="w-4 h-4 mr-2 text-cyan-400" /> Metal
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Objectives</h3>
                <div className="grid grid-cols-1 gap-2">
                  <Button 
                    variant={selectedTool === 'base' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('base')}
                  >
                    <Flag className="w-4 h-4 mr-2 text-blue-500" /> Crash Site (Start)
                  </Button>
                  <Button 
                    variant={selectedTool === 'extraction_point' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('extraction_point')}
                  >
                    <Radio className="w-4 h-4 mr-2 text-purple-500" /> Extraction Point
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ruins</h3>
                <div className="grid grid-cols-1 gap-2">
                  <Button 
                    variant={selectedTool === 'abandoned_quarry' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('abandoned_quarry')}
                  >
                    <Pickaxe className="w-4 h-4 mr-2 text-stone-600" /> Old Quarry
                  </Button>
                  <Button 
                    variant={selectedTool === 'abandoned_forge' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('abandoned_forge')}
                  >
                    <Hammer className="w-4 h-4 mr-2 text-cyan-800" /> Old Forge
                  </Button>
                  <Button 
                    variant={selectedTool === 'abandoned_drone_factory' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('abandoned_drone_factory')}
                  >
                    <Bot className="w-4 h-4 mr-2 text-indigo-800" /> Old Factory
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tools</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedTool === 'empty' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('empty')}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Eraser
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700">
                <h3 className="text-sm font-bold text-slate-300 mb-2">Mission Status</h3>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Wave</span>
                    <span className="text-white font-mono">{isPreparationPhase ? 'PREPARING' : wave}</span>
                  </div>
                  {isPreparationPhase && (
                    <>
                      <div className="flex justify-between">
                        <div className="flex flex-col items-center mb-2">
                        <span className="text-slate-400 text-xs uppercase tracking-widest mb-1">Next Wave In</span>
                        <span className="text-4xl font-bold text-orange-500 font-mono animate-pulse drop-shadow-[0_0_10px_rgba(249,115,22,0.5)]">
                          {preparationTime}s
                        </span>
                      </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-700">
                        <span className="text-slate-400 block mb-1">Incoming Threat:</span>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300">Count</span>
                            <span className="text-red-400 font-mono">{currentWave.count}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-300">Types</span>
                            <span className="text-red-400 font-mono capitalize">{currentWave.types.join(', ')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          className="w-full text-xs"
                          onClick={skipPreparation}
                        >
                          Start Wave Now
                        </Button>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Enemies</span>
                    <span className="text-red-400 font-mono">{enemies.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Score</span>
                    <span className="text-yellow-400 font-mono">{highScore}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Construction</h3>
                <div className="grid grid-cols-1 gap-2">
                  <Button 
                    variant={selectedTool === 'turret' ? 'default' : 'outline'} 
                    className="justify-start h-auto py-2" 
                    onClick={() => setSelectedTool('turret')}
                  >
                    <div className="flex flex-col items-start">
                      <span className="flex items-center font-semibold">
                        <div className="w-3 h-3 bg-blue-500 rounded-full mr-2" /> Turret
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {TURRET_COST.stone} Stone, {TURRET_COST.metal} Metal
                      </span>
                    </div>
                  </Button>
                  <Button 
                    variant={selectedTool === 'sniper' ? 'default' : 'outline'} 
                    className="justify-start h-auto py-2" 
                    onClick={() => setSelectedTool('sniper')}
                  >
                    <div className="flex flex-col items-start">
                      <span className="flex items-center font-semibold">
                        <div className="w-3 h-3 bg-purple-500 rounded-full mr-2" /> Sniper
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {SNIPER_COST.stone} Stone, {SNIPER_COST.metal} Metal
                      </span>
                    </div>
                  </Button>
                  <Button 
                    variant={selectedTool === 'quarry' ? 'default' : 'outline'} 
                    className="justify-start h-auto py-2" 
                    onClick={() => setSelectedTool('quarry')}
                  >
                    <div className="flex flex-col items-start">
                      <span className="flex items-center font-semibold">
                        <Pickaxe className="w-3 h-3 mr-2" /> Quarry
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {QUARRY_COST.stone} Stone, {QUARRY_COST.metal} Metal
                      </span>
                    </div>
                  </Button>
                  <Button 
                    variant={selectedTool === 'forge' ? 'default' : 'outline'} 
                    className="justify-start h-auto py-2" 
                    onClick={() => setSelectedTool('forge')}
                  >
                    <div className="flex flex-col items-start">
                      <span className="flex items-center font-semibold">
                        <Hammer className="w-3 h-3 mr-2" /> Forge
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {FORGE_COST.stone} Stone, {FORGE_COST.metal} Metal
                      </span>
                    </div>
                  </Button>
                  <Button 
                    variant={selectedTool === 'maintenance_hub' ? 'default' : 'outline'} 
                    className="justify-start h-auto py-2" 
                    onClick={() => setSelectedTool('maintenance_hub')}
                  >
                    <div className="flex flex-col items-start">
                      <span className="flex items-center font-semibold">
                        <HeartPulse className="w-3 h-3 mr-2" /> Maint. Hub
                      </span>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {MAINTENANCE_HUB_COST.stone} Stone, {MAINTENANCE_HUB_COST.metal} Metal
                      </span>
                    </div>
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    variant={selectedTool === 'repair' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('repair')}
                  >
                    <Wrench className="w-4 h-4 mr-2" /> Repair
                  </Button>
                  <Button 
                    variant={selectedTool === 'sell' ? 'default' : 'outline'} 
                    className="justify-start" 
                    onClick={() => setSelectedTool('sell')}
                  >
                    <Trash2 className="w-4 h-4 mr-2" /> Recycle
                  </Button>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Game Grid */}
        <main 
          ref={viewportRef}
          className="flex-1 bg-slate-950 relative overflow-auto flex items-center justify-center p-8"
        >
          <div 
            className="relative bg-slate-900 shadow-2xl border border-slate-800 select-none"
            style={{ 
              width: width * 32, 
              height: height * 32,
              cursor: gameState === 'playing' ? 'crosshair' : 'default'
            }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Grid Tiles */}
            {grid.map((row, y) => (
              row.map((tile, x) => {
                const isVisible = gameState === 'editing' || (visibleTiles[y] && visibleTiles[y][x]);
                const isFog = !isVisible;
                
                return (
                  <div
                    key={`${x}-${y}`}
                    className="absolute w-8 h-8 border-[0.5px] border-slate-800/30 transition-colors duration-200"
                    style={{
                      left: x * 32,
                      top: y * 32,
                      backgroundColor: isFog ? '#020617' : (tile === 'empty' ? 'transparent' : (TILE_COLORS[tile] || TILE_COLORS.empty)),
                      backgroundImage: !isFog && tile === 'wall' ? 'url(/images/tile_wall.png)' : (!isFog && tile === 'empty' ? 'url(/images/tile_floor.png)' : 'none'),
                      backgroundSize: 'cover',
                      opacity: isFog ? 1 : 1
                    }}
                    onMouseDown={() => handleMouseDown(x, y)}
                    onMouseEnter={() => handleMouseEnter(x, y)}
                  >
                    {/* Fog Overlay */}
                    {isFog && (
                      <div className="absolute inset-0 bg-black z-20 flex items-center justify-center">
                        <EyeOff className="w-3 h-3 text-slate-800 opacity-20" />
                      </div>
                    )}

                    {/* Tile Content (only if visible) */}
                    {!isFog && (
                      <>
                        {/* Resource Icons */}
                        {tile === 'resource_stone' && <div className="absolute inset-0 bg-[url('/images/building_quarry.png')] bg-cover opacity-50 grayscale" />}
                        {tile === 'resource_metal' && <div className="absolute inset-0 bg-[url('/images/building_forge.png')] bg-cover opacity-50 grayscale" />}
                        
                        {/* Base / Start */}
                        {tile === 'base' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-blue-900/50 animate-pulse">
                            <Flag className="w-5 h-5 text-blue-400" />
                          </div>
                        )}

                        {/* Extraction Point */}
                        {tile === 'extraction_point' && (
                          <div className="absolute inset-0 flex items-center justify-center bg-purple-900/50">
                            <Radio className={`w-5 h-5 text-purple-400 ${isExtracting ? 'animate-ping' : ''}`} />
                          </div>
                        )}

                        {/* Abandoned Buildings */}
                        {tile === 'abandoned_quarry' && <div className="absolute inset-0 bg-[url('/images/building_quarry.png')] bg-cover opacity-50 grayscale brightness-50" />}
                        {tile === 'abandoned_forge' && <div className="absolute inset-0 bg-[url('/images/building_forge.png')] bg-cover opacity-50 grayscale brightness-50" />}
                        {tile === 'abandoned_drone_factory' && <div className="absolute inset-0 bg-[url('/images/building_drone_factory.png')] bg-cover opacity-50 grayscale brightness-50" />}

                        {/* Active Buildings & Turrets with Health Bars */}
                        {(() => {
                          const building = buildings.find(b => b.x === x && b.y === y);
                          const turret = turrets.find(t => t.x === x && t.y === y);
                          const entity = building || turret;
                          
                          if (!entity) return null;

                          const healthPercent = entity.health / entity.maxHealth;
                          const isDamaged = healthPercent < 1;
                          const isCritical = healthPercent < 0.25;
                          const isHeavyDamage = healthPercent < 0.5;

                          return (
                            <div className="relative w-full h-full flex items-center justify-center">
                              {/* Health Bar (only show if damaged) */}
                              {isDamaged && (
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-black/50 rounded-full overflow-hidden z-10">
                                  <div 
                                    className={`h-full transition-all duration-200 ${
                                      isCritical ? 'bg-red-600' : 
                                      isHeavyDamage ? 'bg-orange-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${healthPercent * 100}%` }} 
                                  />
                                </div>
                              )}

                              {/* Visual Damage Effects */}
                              <div className={`relative ${isCritical ? 'animate-pulse' : ''}`}>
                                {tile === 'quarry' && <Pickaxe className={`w-5 h-5 m-auto mt-1 ${isHeavyDamage ? 'text-stone-400' : 'text-stone-200 animate-bounce'}`} style={{ animationDuration: '2s' }} />}
                                {tile === 'forge' && <Hammer className={`w-5 h-5 m-auto mt-1 ${isHeavyDamage ? 'text-cyan-900' : 'text-cyan-200 animate-bounce'}`} style={{ animationDuration: '2s' }} />}
                                {tile === 'drone_factory' && <Bot className={`w-5 h-5 m-auto mt-1 ${isHeavyDamage ? 'text-indigo-900' : 'text-indigo-300'}`} />}
                                {tile === 'maintenance_hub' && <div className="absolute inset-0 bg-[url('/images/building_maintenance.png')] bg-cover opacity-90" />}
                                
                                {tile === 'turret' && (
                                  <div 
                                    className="absolute inset-0 bg-[url('/images/turret_standard.png?v=2')] bg-cover z-10"
                                    style={{ 
                                      transform: `rotate(${turret?.rotation || 0}deg)`,
                                      filter: isHeavyDamage ? 'brightness(0.5) sepia(1) hue-rotate(-50deg)' : 'none'
                                    }} 
                                  />
                                )}
                                {tile === 'sniper' && (
                                  <div 
                                    className="absolute inset-0 bg-[url('/images/turret_sniper.png?v=2')] bg-cover z-10"
                                    style={{ 
                                      transform: `rotate(${turret?.rotation || 0}deg)`,
                                      filter: isHeavyDamage ? 'brightness(0.5) sepia(1) hue-rotate(-50deg)' : 'none'
                                    }} 
                                  />
                                )}

                                {/* Smoke/Fire Effect for critical damage */}
                                {isHeavyDamage && (
                                  <div className="absolute -top-2 -right-2 w-3 h-3 bg-black/40 rounded-full blur-[1px] animate-ping" />
                                )}
                                {isCritical && (
                                  <div className="absolute top-0 left-0 w-full h-full bg-red-500/20 animate-pulse rounded-sm" />
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* Wreckage Overlay */}
                        {/* Note: Wreckage state is in game engine, but we can infer from tile type if we had access to entity list here directly or pass it via props. 
                            For now, let's rely on the entity rendering layer below. */}
                      </>
                    )}
                  </div>
                );
              })
            ))}

            {/* Game Entities Layer (only visible if not fog) */}
            {gameState === 'playing' && (
              <>
                {/* Range Visualization */}
                {selectedTurret && (
                  <div
                    className="absolute rounded-full border-2 border-blue-400/30 bg-blue-400/10 pointer-events-none z-10"
                    style={{
                      left: (selectedTurret.x + 0.5) * 32,
                      top: (selectedTurret.y + 0.5) * 32,
                      width: (getTurretAt(selectedTurret.x, selectedTurret.y)?.range || 3.5) * 2 * 32,
                      height: (getTurretAt(selectedTurret.x, selectedTurret.y)?.range || 3.5) * 2 * 32,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                )}

                {/* Hero */}
                {hero && (
                  <div 
                    className="absolute w-6 h-6 z-30 transition-all duration-100 ease-linear"
                    style={{ 
                      left: hero.x * 32 + 4, 
                      top: hero.y * 32 + 4,
                    }}
                  >
                    {/* Hero Health Bar */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/50 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-200 ${
                          hero.health / hero.maxHealth < 0.3 ? 'bg-red-500 animate-pulse' : 
                          hero.health / hero.maxHealth < 0.6 ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${(hero.health / hero.maxHealth) * 100}%` }} 
                      />
                    </div>

                    <div className="relative w-full h-full overflow-hidden">
                      <div 
                        className="absolute w-[400%] h-[400%] bg-[url('/images/hero_walk_sheet_topdown.png?v=2')] z-30"
                        style={{ 
                          backgroundSize: '100% 100%',
                          transform: `scale(1.5)`,
                          transformOrigin: 'center center',
                          // Rows (Top) = Direction
                          top: hero.direction === 'down' ? '0%' : 
                               hero.direction === 'up' ? '-100%' : 
                               hero.direction === 'left' ? '-200%' : '-300%',
                          // Columns (Left) = Animation Frame
                          left: hero.isMoving ? `-${Math.floor((Date.now() / 150) % 4) * 100}%` : '0%',
                          filter: 'drop-shadow(0 0 5px rgba(0, 255, 255, 0.5))'
                        }} 
                      />
                    </div>
                  </div>
                )}

                {/* Enemies */}
                {enemies.map(enemy => {
                  const isVisible = visibleTiles[Math.round(enemy.y)]?.[Math.round(enemy.x)];
                  if (!isVisible) return null;

                  return (
                    <div
                      key={enemy.id}
                      className="absolute w-6 h-6 bg-red-500 rounded-sm z-20 transition-all duration-100 ease-linear flex items-center justify-center shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                      style={{ left: enemy.x * 32 + 4, top: enemy.y * 32 + 4 }}
                    >
                      <div className="w-4 h-0.5 bg-black/30 absolute -top-2 left-1">
                        <div 
                          className="h-full bg-green-400" 
                          style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Projectiles */}
                {projectiles.map(proj => (
                  <div
                    key={proj.id}
                    className="absolute w-2 h-2 rounded-full z-30 shadow-[0_0_8px_currentColor]"
                    style={{ 
                      left: proj.x * 32 + 14, 
                      top: proj.y * 32 + 14,
                      backgroundColor: proj.source === 'hero' ? '#60a5fa' : '#fbbf24'
                    }}
                  />
                ))}

                {/* Drones */}
                {drones.map(drone => {
                  const isVisible = visibleTiles[Math.round(drone.y)]?.[Math.round(drone.x)];
                  if (!isVisible) return null;

                  return (
                    <div
                      key={drone.id}
                      className="absolute w-4 h-4 z-20 transition-all duration-100 ease-linear"
                      style={{ left: drone.x * 32 + 8, top: drone.y * 32 + 8 }}
                    >
                      <div className="relative w-full h-full overflow-hidden">
                        <div 
                          className={`absolute w-[400%] h-[500%] z-20 ${
                            drone.type === 'worker' ? "bg-[url('/images/drone_worker_sheet.png?v=2')]" : 
                            drone.type === 'repair' ? "bg-[url('/images/drone_repair_sheet.png?v=2')]" : 
                            "bg-[url('/images/drone_harvester_sheet.png?v=2')]"
                          }`}
                          style={{ 
                            backgroundSize: '100% 100%',
                            // Rows (Top) = State (Idle vs Working)
                            top: drone.state === 'working' ? '-100%' : '0%', 
                            // Columns (Left) = Animation Frame
                            left: `-${Math.floor((Date.now() / 100) % 4) * 100}%`,
                            transform: 'scale(1.5)'
                          }} 
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Construction Jobs (Progress Bars) */}
                {jobs.map(job => {
                  const isVisible = visibleTiles[Math.round(job.y)]?.[Math.round(job.x)];
                  if (!isVisible || job.status === 'completed') return null;

                  return (
                    <div
                      key={job.id}
                      className="absolute w-8 h-8 border-2 border-dashed border-yellow-500/50 z-10 flex items-center justify-center"
                      style={{ left: job.x * 32, top: job.y * 32 }}
                    >
                      <div className="absolute -top-3 left-0 w-full h-1 bg-slate-700">
                        <div 
                          className="h-full bg-yellow-500 transition-all duration-200" 
                          style={{ width: `${job.progress}%` }} 
                        />
                      </div>
                    </div>
                  );
                })}

                {/* Damage Numbers */}
                {damageNumbers.map(dn => (
                  <div
                    key={dn.id}
                    className="absolute text-xs font-bold z-40 pointer-events-none animate-out fade-out slide-out-to-top-2 duration-1000"
                    style={{ 
                      left: dn.x * 32, 
                      top: dn.y * 32 - 16, 
                      color: dn.color,
                      fontSize: dn.isCritical ? '16px' : '12px',
                      textShadow: '0 1px 2px black'
                    }}
                  >
                    {Math.round(dn.value)}
                    {dn.isCritical && '!'}
                  </div>
                ))}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
