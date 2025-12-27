import { useState, useEffect } from 'react';
import { TileType, LevelData, DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_COLORS } from '@/lib/gameTypes';
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
  const [grid, setGrid] = useState<TileType[][]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Initialize grid
  useEffect(() => {
    const newGrid = Array(height).fill(null).map(() => Array(width).fill('empty'));
    setGrid(newGrid);
  }, [width, height]);

  const handleTileClick = (x: number, y: number) => {
    const newGrid = [...grid];
    newGrid[y][x] = selectedTool;
    setGrid(newGrid);
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
          <Button variant="outline" onClick={clearGrid} className="text-destructive border-destructive/50 hover:bg-destructive/10">
            <Trash2 className="w-4 h-4 mr-2" /> Purge
          </Button>
          <Button onClick={saveLevel} className="bg-primary text-primary-foreground hover:bg-primary/90 hazard-border">
            <Save className="w-4 h-4 mr-2" /> Save Sector
          </Button>
        </div>
      </Card>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Toolbox */}
        <Card className="w-64 p-4 panel flex flex-col gap-4 overflow-y-auto">
          <h3 className="text-lg font-bold text-primary border-b border-primary/30 pb-2">Construction</h3>
          
          <div className="grid grid-cols-2 gap-2">
            {(['empty', 'wall', 'path', 'base', 'spawn'] as TileType[]).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedTool(type)}
                className={`
                  p-3 flex flex-col items-center justify-center gap-2 border transition-all
                  ${selectedTool === type 
                    ? 'border-primary bg-primary/10 shadow-[0_0_10px_rgba(var(--primary),0.3)]' 
                    : 'border-border hover:border-primary/50 hover:bg-accent/5'}
                `}
              >
                <div className={`w-8 h-8 ${TILE_COLORS[type]} border border-white/10 shadow-inner`} />
                <span className="text-xs uppercase font-mono tracking-wider">{type}</span>
              </button>
            ))}
          </div>

          <div className="mt-auto p-4 bg-black/20 border border-white/5 rounded text-xs font-mono text-muted-foreground">
            <p className="mb-2 text-primary">STATUS: ONLINE</p>
            <p>GRID: {width}x{height}</p>
            <p>TOOL: {selectedTool.toUpperCase()}</p>
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
              row.map((tileType, x) => (
                <div
                  key={`${x}-${y}`}
                  onMouseDown={() => { setIsDragging(true); handleTileClick(x, y); }}
                  onMouseEnter={() => handleMouseEnter(x, y)}
                  onMouseUp={() => setIsDragging(false)}
                  className={`
                    w-10 h-10 cursor-pointer transition-colors duration-75
                    ${TILE_COLORS[tileType]}
                    hover:brightness-125
                    border border-white/5
                  `}
                  title={`Coordinates: ${x},${y}`}
                />
              ))
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
