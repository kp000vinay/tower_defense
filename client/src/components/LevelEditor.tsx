import { useState, useEffect } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS, TURRET_COST } from '@/lib/gameTypes';
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
  const [selectedTool, setSelectedTool] = useState<TileType>('wall');
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
    buildTurret
  } = useGameEngine(width, height, grid);

  const handleTileClick = (x: number, y: number) => {
    if (gameState === 'playing') {
      // In-game building logic
      if (selectedTool === 'turret' && grid[y][x] === 'empty') {
        if (buildTurret(x, y)) {
          const newGrid = [...grid];
          newGrid[y][x] = 'turret';
          setGrid(newGrid);
          toast.success('Turret deployed!');
        } else {
          toast.error('Insufficient credits!');
        }
      }
      return;
    }

    // Editor logic
    const newGrid = [...grid];
    newGrid[y][x] = selectedTool;
    setGrid(newGrid);
    updatePathPreview(newGrid);
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
          </div>

          <div className="mt-auto p-4 bg-black/20 border border-white/5 rounded text-xs font-mono text-muted-foreground">
            <p className="mb-2 text-primary">STATUS: {gameState === 'playing' ? 'COMBAT ACTIVE' : 'EDITING'}</p>
            <p>WAVE: {wave}</p>
            <p>LIVES: {lives}</p>
            <p>CREDITS: {money}</p>
          </div>
        </Card>

        {/* Grid Canvas */}
        <Card className="flex-1 p-8 panel overflow-auto flex items-center justify-center bg-black/40 relative">
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
                      ${gameState === 'editing' ? 'cursor-pointer hover:brightness-125' : ''}
                      border border-white/5
                    `}
                    title={`Coordinates: ${x},${y}`}
                  >
                    {isPath && gameState === 'editing' && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-2 h-2 bg-green-400 rounded-full shadow-[0_0_8px_rgba(74,222,128,0.8)] animate-pulse" />
                      </div>
                    )}
                  </div>
                );
              })
            ))}
            
            {/* Render Enemies Layer */}
            {enemies.map(enemy => (
              <div
                key={enemy.id}
                className="absolute w-6 h-6 bg-red-500 rounded-full border-2 border-white shadow-[0_0_10px_rgba(239,68,68,0.8)] z-20 pointer-events-none transition-transform will-change-transform"
                style={{
                  left: `${enemy.x * 2.5 + 0.5}rem`, // 2.5rem = w-10 (40px)
                  top: `${enemy.y * 2.5 + 0.5}rem`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                {/* Health Bar */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-8 h-1 bg-black/50 rounded overflow-hidden">
                  <div 
                    className="h-full bg-green-500" 
                    style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
                  />
                </div>
              </div>
            ))}

            {/* Render Projectiles Layer */}
            {projectiles.map(proj => (
              <div
                key={proj.id}
                className="absolute w-2 h-2 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.8)] z-30 pointer-events-none will-change-transform"
                style={{
                  left: `${proj.x * 2.5 + 0.5}rem`,
                  top: `${proj.y * 2.5 + 0.5}rem`,
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
