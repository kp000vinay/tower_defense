import { useState, useEffect } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS, TURRET_COST, SNIPER_COST, UPGRADE_COST, SNIPER_UPGRADE_COST, ENEMY_STATS, QUARRY_COST, FORGE_COST, REPAIR_BUILDING_COST, REPAIR_FACTORY_COST, MAINTENANCE_HUB_COST } from '@/lib/gameTypes';
import { findPath } from '@/lib/pathfinding';
import { useGameEngine } from '@/hooks/useGameEngine';
import { Enemy } from '@/lib/gameTypes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Save, Trash2, Play, Grid3X3, Download, Upload, Wrench, Pickaxe, Hammer, Mountain, Gem, EyeOff, Bot, HeartPulse, ArrowDownCircle } from 'lucide-react';

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
      // Actually, for wreckage mechanic, we keep the tile as is but render it differently
      // So we don't need to change the grid tile type to 'rubble' anymore for destroyed buildings
      // UNLESS we want to allow clearing it.
      // Let's keep the tile type but render an overlay.
      // BUT, if we want to allow building over it, maybe we should change it?
      // The prompt says "turn into Wreckage... Repair Drones automatically detect... and begin repairing".
      // So it should stay as the building type but be "broken".
      // So we do NOTHING to the grid here.
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
      setPathPreview(null);
      toast.success('Sector purged.');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-mono overflow-hidden">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between shrink-0 z-10 shadow-md">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-cyan-400 tracking-wider flex items-center gap-2">
            <Grid3X3 className="w-6 h-6" />
            SECTOR DEFENSE
          </h1>
          <div className="h-6 w-px bg-slate-700 mx-2" />
          <div className="flex items-center gap-2">
            <Input 
              value={levelName} 
              onChange={(e) => setLevelName(e.target.value)}
              className="bg-slate-800 border-slate-700 text-slate-200 w-48 h-8 focus:ring-cyan-500/50"
            />
            <Button size="sm" variant="outline" onClick={saveLevel} className="h-8 border-slate-700 hover:bg-slate-800 hover:text-cyan-400">
              <Save className="w-4 h-4 mr-2" /> Save
            </Button>
            <Button size="sm" variant="outline" onClick={clearGrid} className="h-8 border-slate-700 hover:bg-red-900/20 hover:text-red-400 hover:border-red-900/50">
              <Trash2 className="w-4 h-4 mr-2" /> Clear
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* Resources Display */}
          <div className="flex items-center gap-4 bg-slate-900/50 px-4 py-1.5 rounded-full border border-slate-800">
            <div className="flex items-center gap-2 text-stone-400">
              <Mountain className="w-4 h-4" />
              <span className="font-bold">{Math.floor(resources.stone)}</span>
            </div>
            <div className="flex items-center gap-2 text-cyan-400">
              <Gem className="w-4 h-4" />
              <span className="font-bold">{Math.floor(resources.metal)}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-sm text-slate-400">
              Wave: <span className="text-cyan-400 font-bold">{wave}</span>
            </div>
            <div className="text-sm text-slate-400">
              Lives: <span className={`${lives < 5 ? 'text-red-500 animate-pulse' : 'text-green-400'} font-bold`}>{lives}</span>
            </div>
            <div className="text-sm text-slate-400">
              Score: <span className="text-yellow-400 font-bold">{highScore}</span>
            </div>
          </div>

          <Button 
            onClick={gameState === 'playing' ? stopGame : startGame}
            variant={gameState === 'playing' ? "destructive" : "default"}
            className={`w-32 font-bold tracking-wide transition-all ${gameState === 'playing' ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-600 hover:bg-cyan-500 shadow-[0_0_15px_rgba(8,145,178,0.5)]'}`}
          >
            {gameState === 'playing' ? 'ABORT' : 'DEPLOY'}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Tools */}
        <aside className="w-72 bg-slate-900 border-r border-slate-800 p-4 flex flex-col gap-6 overflow-y-auto shrink-0 z-10">
          {/* Build Tools */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Infrastructure</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton 
                active={selectedTool === 'path'} 
                onClick={() => setSelectedTool('path')}
                icon={<div className="w-4 h-4 bg-slate-600 rounded-sm" />}
                label="Path"
                cost={null}
              />
              <ToolButton 
                active={selectedTool === 'wall'} 
                onClick={() => setSelectedTool('wall')}
                icon={<div className="w-4 h-4 bg-slate-500 border border-slate-400 rounded-sm" />}
                label="Wall"
                cost={null}
              />
              <ToolButton 
                active={selectedTool === 'quarry'} 
                onClick={() => setSelectedTool('quarry')}
                icon={<Mountain className="w-4 h-4 text-amber-600" />}
                label="Quarry"
                cost={QUARRY_COST}
              />
              <ToolButton 
                active={selectedTool === 'forge'} 
                onClick={() => setSelectedTool('forge')}
                icon={<Hammer className="w-4 h-4 text-orange-500" />}
                label="Forge"
                cost={FORGE_COST}
              />
              <ToolButton 
                active={selectedTool === 'maintenance_hub'} 
                onClick={() => setSelectedTool('maintenance_hub')}
                icon={<HeartPulse className="w-4 h-4 text-emerald-500" />}
                label="Maint. Hub"
                cost={MAINTENANCE_HUB_COST}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Defenses</h3>
            <div className="grid grid-cols-1 gap-2">
              <ToolButton 
                active={selectedTool === 'turret'} 
                onClick={() => setSelectedTool('turret')}
                icon={<div className="w-4 h-4 bg-yellow-500 rounded-full border-2 border-yellow-700" />}
                label="Turret"
                cost={TURRET_COST}
              />
              <ToolButton 
                active={selectedTool === 'sniper'} 
                onClick={() => setSelectedTool('sniper')}
                icon={<div className="w-4 h-4 bg-purple-500 rounded-full border-2 border-purple-700" />}
                label="Sniper"
                cost={SNIPER_COST}
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Management</h3>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton 
                active={selectedTool === 'repair'} 
                onClick={() => setSelectedTool('repair')}
                icon={<Wrench className="w-4 h-4 text-green-400" />}
                label="Repair"
                cost={null}
              />
              <ToolButton 
                active={selectedTool === 'sell'} 
                onClick={() => setSelectedTool('sell')}
                icon={<Trash2 className="w-4 h-4 text-red-400" />}
                label="Recycle"
                cost={null}
              />
            </div>
          </div>

          {/* Map Elements (Editor Only) */}
          {gameState === 'editing' && (
            <div className="space-y-3 pt-4 border-t border-slate-800">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Map Editor</h3>
              <div className="grid grid-cols-2 gap-2">
                <ToolButton 
                  active={selectedTool === 'base'} 
                  onClick={() => setSelectedTool('base')}
                  icon={<div className="w-4 h-4 bg-blue-600 rounded-sm" />}
                  label="Base"
                  cost={null}
                />
                <ToolButton 
                  active={selectedTool === 'spawn'} 
                  onClick={() => setSelectedTool('spawn')}
                  icon={<div className="w-4 h-4 bg-red-600 rounded-sm" />}
                  label="Spawn"
                  cost={null}
                />
                <ToolButton 
                  active={selectedTool === 'resource_stone'} 
                  onClick={() => setSelectedTool('resource_stone')}
                  icon={<div className="w-4 h-4 bg-stone-400 rounded-sm" />}
                  label="Stone"
                  cost={null}
                />
                <ToolButton 
                  active={selectedTool === 'resource_metal'} 
                  onClick={() => setSelectedTool('resource_metal')}
                  icon={<div className="w-4 h-4 bg-cyan-700 rounded-sm" />}
                  label="Metal"
                  cost={null}
                />
                <ToolButton 
                  active={selectedTool === 'abandoned_quarry'} 
                  onClick={() => setSelectedTool('abandoned_quarry')}
                  icon={<div className="w-4 h-4 bg-amber-900/50 rounded-sm" />}
                  label="Aband. Quarry"
                  cost={null}
                />
                <ToolButton 
                  active={selectedTool === 'abandoned_forge'} 
                  onClick={() => setSelectedTool('abandoned_forge')}
                  icon={<div className="w-4 h-4 bg-orange-900/50 rounded-sm" />}
                  label="Aband. Forge"
                  cost={null}
                />
                <ToolButton 
                  active={selectedTool === 'abandoned_drone_factory'} 
                  onClick={() => setSelectedTool('abandoned_drone_factory')}
                  icon={<div className="w-4 h-4 bg-indigo-900/50 rounded-sm" />}
                  label="Aband. Factory"
                  cost={null}
                />
                <ToolButton 
                  active={selectedTool === 'empty'} 
                  onClick={() => setSelectedTool('empty')}
                  icon={<div className="w-4 h-4 border border-slate-600 rounded-sm" />}
                  label="Eraser"
                  cost={null}
                />
              </div>
            </div>
          )}
        </aside>

        {/* Main Grid Area */}
        <main className="flex-1 bg-slate-950 relative overflow-auto flex items-center justify-center p-8">
          <div 
            className="relative bg-slate-900 shadow-2xl border border-slate-800 select-none"
            style={{ 
              width: width * 40, 
              height: height * 40,
              cursor: selectedTool === 'empty' ? 'default' : 'crosshair'
            }}
            onMouseDown={() => setIsDragging(true)}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
          >
            {/* Grid Tiles */}
            {grid.map((row, y) => (
              row.map((tile, x) => {
                // Determine if tile is visible (Fog of War)
                const isVisible = gameState === 'editing' || (visibleTiles[y] && visibleTiles[y][x]);
                
                // Check for wreckage status
                const turret = getTurretAt(x, y);
                const isWreckage = turret?.isWreckage; 
                
                // Check if a repair drone is en route to this tile
                const isRepairIncoming = drones.some(d => 
                  d.type === 'repair' && 
                  d.state === 'moving_to_job' && 
                  d.targetX === x && 
                  d.targetY === y
                );
                
                return (
                  <div
                    key={`${x}-${y}`}
                    className={`absolute w-10 h-10 border border-slate-800/50 transition-colors duration-200 flex items-center justify-center
                      ${isVisible ? TILE_COLORS[tile] : 'bg-black'}
                      ${!isVisible && gameState === 'playing' ? 'brightness-0' : ''}
                    `}
                    style={{ left: x * 40, top: y * 40 }}
                    onMouseDown={() => handleTileClick(x, y)}
                    onMouseEnter={() => handleMouseEnter(x, y)}
                  >
                    {/* Fog Overlay (Soft edges?) */}
                    {!isVisible && gameState === 'playing' && (
                      <div className="absolute inset-0 bg-black z-20" />
                    )}

                    {/* Wreckage Overlay */}
                    {isVisible && isWreckage && (
                      <div className="absolute inset-0 bg-red-900/60 z-10 flex items-center justify-center animate-pulse">
                        <Wrench className="w-6 h-6 text-red-400 opacity-75" />
                      </div>
                    )}

                    {/* Repair Incoming Indicator */}
                    {isVisible && isRepairIncoming && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 animate-bounce">
                        <ArrowDownCircle className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]" />
                      </div>
                    )}

                    {/* Path Preview Overlay */}
                    {isVisible && pathPreview?.some(p => p.x === x && p.y === y) && (
                      <div className="w-2 h-2 bg-cyan-400/50 rounded-full animate-pulse" />
                    )}

                    {/* Turret Range Preview */}
                    {isVisible && selectedTurret && selectedTurret.x === x && selectedTurret.y === y && (
                      <div 
                        className="absolute rounded-full border border-cyan-500/30 bg-cyan-500/10 pointer-events-none z-10"
                        style={{
                          width: (tile === 'sniper' ? 14 : 7) * 40,
                          height: (tile === 'sniper' ? 14 : 7) * 40,
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                      />
                    )}

                    {/* Construction Site Overlay */}
                    {isVisible && jobs.some(j => j.x === x && j.y === y && j.status !== 'completed') && (
                      <div className="absolute inset-0 border-2 border-dashed border-yellow-400 bg-yellow-400/10 z-10 flex items-center justify-center">
                        <div className="w-full h-1 bg-slate-700 absolute bottom-1 left-0 px-1">
                          <div 
                            className="h-full bg-yellow-400 transition-all duration-200"
                            style={{ width: `${jobs.find(j => j.x === x && j.y === y)?.progress || 0}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ))}

            {/* Entities Layer (Enemies, Projectiles, Particles) */}
            {gameState === 'playing' && (
              <div className="absolute inset-0 pointer-events-none z-20">
                {/* Enemies */}
                {enemies.map(enemy => (
                  <div
                    key={enemy.id}
                    className={`absolute w-6 h-6 rounded-full shadow-lg transition-transform duration-100 flex items-center justify-center ${ENEMY_STATS[enemy.type].color}`}
                    style={{ 
                      left: enemy.x * 40 + 7, 
                      top: enemy.y * 40 + 7,
                      opacity: visibleTiles[Math.round(enemy.y)]?.[Math.round(enemy.x)] ? 1 : 0 // Hide if in fog
                    }}
                  >
                    {/* Health Bar */}
                    <div className="absolute -top-3 left-0 w-full h-1 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-green-500 transition-all duration-200"
                        style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}

                {/* Drones */}
                {drones.map(drone => (
                  <div
                    key={drone.id}
                    className={`absolute w-4 h-4 rounded-sm shadow-md transition-transform duration-100 flex items-center justify-center
                      ${drone.type === 'worker' ? (drone.state === 'working' ? 'bg-yellow-400' : 'bg-indigo-400') : 'bg-emerald-400'}
                    `}
                    style={{ 
                      left: drone.x * 40 + 12, 
                      top: drone.y * 40 + 12,
                      opacity: visibleTiles[Math.round(drone.y)]?.[Math.round(drone.x)] ? 1 : 0
                    }}
                  >
                    {drone.type === 'worker' ? <Bot className="w-3 h-3 text-slate-900" /> : <HeartPulse className="w-3 h-3 text-slate-900" />}
                    
                    {/* Repair Beam */}
                    {drone.state === 'working' && drone.type === 'repair' && drone.targetX !== null && (
                      <svg className="absolute top-1/2 left-1/2 w-[200px] h-[200px] -translate-x-1/2 -translate-y-1/2 pointer-events-none overflow-visible">
                        <line 
                          x1="50%" y1="50%" 
                          x2={`${(drone.targetX - drone.x) * 40 + 100}px`} 
                          y2={`${(drone.targetY - drone.y) * 40 + 100}px`} 
                          stroke="#10b981" 
                          strokeWidth="2" 
                          strokeDasharray="4 2"
                          className="animate-pulse"
                        />
                      </svg>
                    )}
                  </div>
                ))}

                {/* Projectiles */}
                {projectiles.map(proj => (
                  <div
                    key={proj.id}
                    className={`absolute w-2 h-2 rounded-full ${proj.isCritical ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)] scale-125' : 'bg-cyan-400 shadow-[0_0_5px_rgba(34,211,238,0.8)]'}`}
                    style={{ 
                      left: proj.x * 40 + 15, 
                      top: proj.y * 40 + 15,
                      opacity: visibleTiles[Math.round(proj.y)]?.[Math.round(proj.x)] ? 1 : 0
                    }}
                  />
                ))}

                {/* Particles */}
                {particles.map(p => (
                  <div
                    key={p.id}
                    className="absolute rounded-full"
                    style={{
                      left: p.x * 40 + 20,
                      top: p.y * 40 + 20,
                      width: p.size * 40,
                      height: p.size * 40,
                      backgroundColor: p.color,
                      opacity: p.life,
                      transform: 'translate(-50%, -50%)'
                    }}
                  />
                ))}

                {/* Damage Numbers */}
                {damageNumbers.map(dn => (
                  <div
                    key={dn.id}
                    className={`absolute font-bold text-center pointer-events-none select-none ${dn.isCritical ? 'text-lg z-30' : 'text-xs z-20'}`}
                    style={{ 
                      left: dn.x * 40, 
                      top: dn.y * 40,
                      width: 40,
                      color: dn.color,
                      opacity: dn.life,
                      transform: `translateY(${(1 - dn.life) * -20}px) ${dn.isCritical ? 'scale(1.2)' : ''}`,
                      textShadow: dn.isCritical ? '0 0 4px rgba(0,0,0,0.5)' : 'none'
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
    </div>
  );
}

function ToolButton({ active, onClick, icon, label, cost }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string, cost: { stone: number, metal: number } | null }) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      className={`h-auto flex flex-col items-center justify-center gap-1 py-2 px-1 ${active ? 'bg-cyan-600 hover:bg-cyan-500 border-cyan-500' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 hover:border-slate-600'}`}
      onClick={onClick}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
      {cost && (
        <div className="flex gap-1 text-[9px] opacity-80">
          {cost.stone > 0 && <span className="text-stone-400">{cost.stone}S</span>}
          {cost.metal > 0 && <span className="text-cyan-400">{cost.metal}M</span>}
        </div>
      )}
    </Button>
  );
}
