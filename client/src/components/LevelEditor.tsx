import { useState, useEffect } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, ENEMY_STATS, QUARRY_COST, FORGE_COST, REPAIR_BUILDING_COST, REPAIR_FACTORY_COST, MAINTENANCE_HUB_COST, HERO_STATS } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';
import { useGameEngine } from '@/hooks/useGameEngine';
import { Enemy } from '@/lib/gameTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
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
        case 'm':
          setSelectedTool('maintenance_hub');
          toast.info('Tool: Maintenance Hub');
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

      if (selectedTool === 'quarry' || selectedTool === 'forge' || selectedTool === 'maintenance_hub') {
        // Building placement logic
        const requiredTile = selectedTool === 'quarry' ? 'resource_stone' : (selectedTool === 'forge' ? 'resource_metal' : null);
        
        if (!requiredTile || grid[y][x] === requiredTile || (selectedTool === 'maintenance_hub' && (grid[y][x] === 'empty' || grid[y][x] === 'rubble'))) {
           if (buildBuilding(x, y, selectedTool)) {
             // Don't update grid immediately - wait for drone
             toast.success(`Construction order placed! Waiting for drone...`);
           } else {
             toast.error('Insufficient resources!');
           }
        } else {
          toast.error(`Invalid placement for ${selectedTool}!`);
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
    a.download = `${levelName.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Level saved!');
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
        toast.success('Level loaded!');
      } catch (err) {
        toast.error('Invalid level file');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Sector Command
          </h1>
          {gameState === 'editing' && (
            <div className="flex items-center gap-2">
              <Input 
                value={levelName}
                onChange={(e) => setLevelName(e.target.value)}
                className="w-48 h-8 bg-slate-800 border-slate-700"
              />
              <div className="flex items-center gap-2 text-sm text-slate-400 ml-4">
                <Grid3X3 className="w-4 h-4" />
                <span>{width}x{height}</span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {gameState === 'editing' ? (
            <>
              <Button variant="outline" size="sm" onClick={saveLevel}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <div className="relative">
                <Button variant="outline" size="sm" className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  Import
                  <input 
                    type="file" 
                    accept=".json"
                    onChange={loadLevel}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </Button>
              </div>
              <div className="w-px h-6 bg-slate-800 mx-2" />
              <Button 
                size="sm" 
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={startGame}
              >
                <Play className="w-4 h-4 mr-2" />
                Deploy Commander
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 bg-slate-900 px-4 py-1.5 rounded-full border border-slate-800">
                <div className="flex items-center gap-2 text-red-400">
                  <HeartPulse className="w-4 h-4" />
                  <span className="font-mono font-bold">{hero?.health || 0}/{HERO_STATS.maxHealth}</span>
                </div>
                <div className="w-px h-4 bg-slate-800" />
                <div className="flex items-center gap-2 text-stone-400">
                  <Mountain className="w-4 h-4" />
                  <span className="font-mono font-bold">{Math.floor(resources.stone)}</span>
                </div>
                <div className="w-px h-4 bg-slate-800" />
                <div className="flex items-center gap-2 text-cyan-400">
                  <Gem className="w-4 h-4" />
                  <span className="font-mono font-bold">{Math.floor(resources.metal)}</span>
                </div>
              </div>

              {isExtracting && (
                <div className="flex flex-col w-48">
                  <div className="flex justify-between text-xs text-cyan-400 mb-1">
                    <span>Uplink Status</span>
                    <span>{Math.floor(extractionProgress)}%</span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-cyan-500 animate-pulse"
                      style={{ width: `${extractionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <Button 
                variant="destructive" 
                size="sm"
                onClick={stopGame}
              >
                Abort Mission
              </Button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Tools */}
        <aside className="w-64 bg-slate-900/50 border-r border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto">
          {/* Structures */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Structures</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton 
                active={selectedTool === 'wall'} 
                onClick={() => setSelectedTool('wall')}
                icon={<div className="w-4 h-4 bg-slate-500 rounded-sm" />}
                label="Wall"
                cost="10 Stone"
              />
              <ToolButton 
                active={selectedTool === 'path'} 
                onClick={() => setSelectedTool('path')}
                icon={<div className="w-4 h-4 bg-slate-700 rounded-sm" />}
                label="Path"
                cost="5 Stone"
              />
              <ToolButton 
                active={selectedTool === 'base'} 
                onClick={() => setSelectedTool('base')}
                icon={<div className="w-4 h-4 bg-blue-600 rounded-sm" />}
                label="Crash Site"
                disabled={gameState === 'playing'}
              />
              <ToolButton 
                active={selectedTool === 'extraction_point'} 
                onClick={() => setSelectedTool('extraction_point')}
                icon={<div className="w-4 h-4 bg-cyan-400 rounded-sm" />}
                label="Extraction"
                disabled={gameState === 'playing'}
              />
            </div>
          </div>

          {/* Defenses */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Defenses</h3>
            <div className="grid grid-cols-1 gap-2">
              <ToolButton 
                active={selectedTool === 'turret'} 
                onClick={() => setSelectedTool('turret')}
                icon={<div className="w-4 h-4 bg-yellow-500 rounded-full" />}
                label="Sentry Turret"
                cost="50 Metal"
                shortcut="T"
              />
              <ToolButton 
                active={selectedTool === 'sniper'} 
                onClick={() => setSelectedTool('sniper')}
                icon={<div className="w-4 h-4 bg-purple-500 rounded-full" />}
                label="Sniper Cannon"
                cost="120 Metal"
                shortcut="Y"
              />
            </div>
          </div>

          {/* Economy */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Economy</h3>
            <div className="grid grid-cols-1 gap-2">
              <ToolButton 
                active={selectedTool === 'quarry'} 
                onClick={() => setSelectedTool('quarry')}
                icon={<Pickaxe className="w-4 h-4 text-amber-500" />}
                label="Auto-Quarry"
                cost="50 Stone"
                shortcut="Q"
              />
              <ToolButton 
                active={selectedTool === 'forge'} 
                onClick={() => setSelectedTool('forge')}
                icon={<Hammer className="w-4 h-4 text-orange-500" />}
                label="Blast Forge"
                cost="100 Stone"
                shortcut="F"
              />
              <ToolButton 
                active={selectedTool === 'maintenance_hub'} 
                onClick={() => setSelectedTool('maintenance_hub')}
                icon={<Bot className="w-4 h-4 text-emerald-500" />}
                label="Maint. Hub"
                cost="100 S / 100 M"
                shortcut="M"
              />
            </div>
          </div>

          {/* Tools */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tools</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton 
                active={selectedTool === 'repair'} 
                onClick={() => setSelectedTool('repair')}
                icon={<Wrench className="w-4 h-4 text-green-400" />}
                label="Repair"
                shortcut="R"
              />
              <ToolButton 
                active={selectedTool === 'sell'} 
                onClick={() => setSelectedTool('sell')}
                icon={<Trash2 className="w-4 h-4 text-red-400" />}
                label="Recycle"
                shortcut="S"
              />
            </div>
          </div>

          {/* Editor Only */}
          {gameState === 'editing' && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Map Editor</h3>
              <div className="grid grid-cols-2 gap-2">
                <ToolButton 
                  active={selectedTool === 'resource_stone'} 
                  onClick={() => setSelectedTool('resource_stone')}
                  icon={<div className="w-4 h-4 bg-stone-400 rounded-sm" />}
                  label="Stone Node"
                />
                <ToolButton 
                  active={selectedTool === 'resource_metal'} 
                  onClick={() => setSelectedTool('resource_metal')}
                  icon={<div className="w-4 h-4 bg-cyan-700 rounded-sm" />}
                  label="Metal Node"
                />
                <ToolButton 
                  active={selectedTool === 'abandoned_quarry'} 
                  onClick={() => setSelectedTool('abandoned_quarry')}
                  icon={<div className="w-4 h-4 bg-amber-900/50 rounded-sm" />}
                  label="Old Quarry"
                />
                <ToolButton 
                  active={selectedTool === 'abandoned_forge'} 
                  onClick={() => setSelectedTool('abandoned_forge')}
                  icon={<div className="w-4 h-4 bg-orange-900/50 rounded-sm" />}
                  label="Old Forge"
                />
                <ToolButton 
                  active={selectedTool === 'abandoned_drone_factory'} 
                  onClick={() => setSelectedTool('abandoned_drone_factory')}
                  icon={<div className="w-4 h-4 bg-indigo-900/50 rounded-sm" />}
                  label="Old Factory"
                />
              </div>
            </div>
          )}
        </aside>

        {/* Game Area */}
        <main className="flex-1 bg-slate-950 relative overflow-auto flex items-center justify-center p-8"
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div 
            className="relative bg-slate-900 shadow-2xl rounded-lg overflow-hidden border border-slate-800"
            style={{
              width: width * 40,
              height: height * 40,
            }}
          >
            {/* Grid */}
            {grid.map((row, y) => (
              <div key={y} className="flex">
                {row.map((tile, x) => {
                  // Determine visibility
                  const isVisible = gameState === 'editing' || (visibleTiles[y] && visibleTiles[y][x]);
                  
                  // Determine color/content
                  let tileClass = TILE_COLORS[tile] || 'bg-slate-900';
                  
                  // Fog of War
                  if (!isVisible) {
                    return (
                      <div 
                        key={`${x}-${y}`}
                        className="w-10 h-10 bg-black border border-slate-900/50"
                      />
                    );
                  }

                  // Render Tile
                  return (
                    <div
                      key={`${x}-${y}`}
                      className={`w-10 h-10 border border-slate-800/50 flex items-center justify-center relative ${tileClass} cursor-pointer hover:brightness-110 transition-all duration-75`}
                      onMouseDown={() => handleMouseDown(x, y)}
                      onMouseEnter={() => handleMouseEnter(x, y)}
                    >
                      {/* Icons for specific tiles */}
                      {tile === 'base' && <Flag className="w-6 h-6 text-white" />}
                      {tile === 'extraction_point' && <Radio className="w-6 h-6 text-white animate-pulse" />}
                      {tile === 'spawn' && <EyeOff className="w-6 h-6 text-white/50" />}
                      {tile === 'quarry' && <Pickaxe className="w-5 h-5 text-amber-200" />}
                      {tile === 'forge' && <Hammer className="w-5 h-5 text-orange-200" />}
                      {tile === 'drone_factory' && <Bot className="w-5 h-5 text-indigo-200" />}
                      {tile === 'maintenance_hub' && <Wrench className="w-5 h-5 text-emerald-200" />}
                      {tile === 'wreckage' && <div className="absolute inset-0 bg-red-900/60 flex items-center justify-center"><Wrench className="w-6 h-6 text-red-400 animate-pulse" /></div>}
                      
                      {/* Repair Incoming Indicator */}
                      {gameState === 'playing' && drones.some(d => d.type === 'repair' && d.state === 'moving_to_job' && d.targetX === x && d.targetY === y) && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-20 animate-bounce">
                          <ArrowDownCircle className="w-6 h-6 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Game Entities Layer */}
            {gameState === 'playing' && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Hero */}
                {hero && hero.health > 0 && (
                  <div 
                    className="absolute w-8 h-8 bg-blue-400 rounded-full shadow-[0_0_15px_rgba(96,165,250,0.6)] flex items-center justify-center z-20 transition-transform duration-75"
                    style={{
                      left: hero.x * 40 + 6,
                      top: hero.y * 40 + 6,
                    }}
                  >
                    <User className="w-5 h-5 text-white" />
                    {/* Health Bar */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500"
                        style={{ width: `${(hero.health / hero.maxHealth) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Enemies */}
                {enemies.map(enemy => (
                  <div
                    key={enemy.id}
                    className={`absolute w-6 h-6 rounded-full shadow-lg transition-transform duration-100 z-10 ${enemy.type === 'tank' ? 'w-8 h-8' : ''} ${ENEMY_STATS[enemy.type].color}`}
                    style={{
                      left: enemy.x * 40 + (enemy.type === 'tank' ? 4 : 7),
                      top: enemy.y * 40 + (enemy.type === 'tank' ? 4 : 7),
                    }}
                  >
                    {/* Health Bar */}
                    <div className="absolute -top-2 left-0 w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-red-400"
                        style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* Drones */}
                {drones.map(drone => (
                  <div
                    key={drone.id}
                    className={`absolute w-3 h-3 rounded-sm shadow-md transition-transform duration-100 z-15 ${drone.type === 'repair' ? 'bg-green-400' : (drone.state === 'working' ? 'bg-yellow-400' : 'bg-indigo-400')}`}
                    style={{
                      left: drone.x * 40 + 14,
                      top: drone.y * 40 + 14,
                    }}
                  />
                ))}

                {/* Construction Sites */}
                {jobs.map(job => job.status !== 'completed' && (
                  <div
                    key={job.id}
                    className="absolute w-10 h-10 border-2 border-dashed border-yellow-400 bg-yellow-400/10 flex items-center justify-center z-0"
                    style={{
                      left: job.x * 40,
                      top: job.y * 40,
                    }}
                  >
                    <div className="w-8 h-1 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-yellow-400"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* Projectiles */}
                {projectiles.map(proj => (
                  <div
                    key={proj.id}
                    className={`absolute w-2 h-2 rounded-full shadow-sm z-20 ${proj.source === 'hero' ? 'bg-blue-400' : (proj.source === 'enemy' ? 'bg-red-400' : 'bg-yellow-300')}`}
                    style={{
                      left: proj.x * 40 + 15,
                      top: proj.y * 40 + 15,
                    }}
                  />
                ))}

                {/* Damage Numbers */}
                {damageNumbers.map(dn => (
                  <div
                    key={dn.id}
                    className="absolute text-xs font-bold z-30 pointer-events-none select-none"
                    style={{
                      left: dn.x * 40 + 10,
                      top: dn.y * 40 - 10,
                      color: dn.color,
                      opacity: dn.life,
                      transform: `translateY(-${(1 - dn.life) * 20}px) ${dn.isCritical ? 'scale(1.5)' : 'scale(1)'}`,
                      textShadow: dn.isCritical ? '0 0 4px rgba(251, 191, 36, 0.8)' : 'none'
                    }}
                  >
                    {Math.round(dn.value)}
                    {dn.isCritical && '!'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Game Over / Victory Overlay */}
      {(gameState === 'gameover' || gameState === 'victory') && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <Card className="w-96 p-8 bg-slate-900 border-slate-700 text-center space-y-6">
            <h2 className={`text-3xl font-bold ${gameState === 'victory' ? 'text-green-400' : 'text-red-500'}`}>
              {gameState === 'victory' ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED'}
            </h2>
            <p className="text-slate-400">
              {gameState === 'victory' 
                ? "Data uplink established. Extraction complete." 
                : "Commander signal lost. Reinforcements unavailable."}
            </p>
            <div className="text-xl font-mono">
              Score: <span className="text-white">{Math.floor(resources.metal + resources.stone)}</span>
            </div>
            <Button className="w-full" onClick={stopGame}>
              Return to Command
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function ToolButton({ active, onClick, icon, label, cost, shortcut, disabled }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, cost?: string, shortcut?: string, disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        flex flex-col items-start p-2 rounded-md border transition-all w-full
        ${active 
          ? 'bg-blue-600/20 border-blue-500 text-blue-100' 
          : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <div className="flex items-center justify-between w-full mb-1">
        {icon}
        {shortcut && <span className="text-[10px] font-mono opacity-50 bg-slate-900 px-1 rounded">{shortcut}</span>}
      </div>
      <span className="text-xs font-medium">{label}</span>
      {cost && <span className="text-[10px] opacity-70">{cost}</span>}
    </button>
  );
}
