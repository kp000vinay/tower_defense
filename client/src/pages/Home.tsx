import LevelEditor from '@/components/LevelEditor';

export default function Home() {
  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col">
      <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-6 justify-between z-50 relative">
        <div className="flex items-center gap-3">
          <div className="w-3 h-12 bg-primary hazard-border"></div>
          <h1 className="text-2xl font-bold tracking-widest text-glow text-primary">
            DEFENSE PROTOCOL <span className="text-foreground/50 text-sm align-top ml-2">v0.1.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
          <span className="animate-pulse text-green-500">● SYSTEM NOMINAL</span>
          <span>USER: COMMANDER</span>
        </div>
      </header>
      
      <main className="flex-1 relative overflow-hidden">
        <LevelEditor />
      </main>
    </div>
  );
}
