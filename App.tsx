import React, { useState, useRef } from 'react';
import Scene from './components/Scene';
import { animationParser, AnimationData } from './utils/parser';

// Icons using SVG to avoid deps
const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
);
const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
);
const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
);
const FileIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>
);

const App: React.FC = () => {
  const [animationData, setAnimationData] = useState<AnimationData | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [maxFrame, setMaxFrame] = useState(100);
  const [speed, setSpeed] = useState(30);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setFileName(file.name);
    // Reset state before loading
    setIsPlaying(false);
    setCurrentFrame(1);

    try {
      const buffer = await file.arrayBuffer();
      const parsedData = await animationParser.parse(buffer);
      setAnimationData(parsedData);
      // Auto-start playing upon successful load
      setIsPlaying(true);
    } catch (err: any) {
      setError(err.message || 'Failed to parse file');
      setAnimationData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (animationData && fileName) {
      animationParser.convertToCSV(animationData, fileName);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-900 text-white font-sans overflow-hidden">
      {/* Sidebar Controls */}
      <aside className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col z-10 shadow-xl">
        <div className="p-6 border-b border-gray-700">
          <h1 className="text-xl font-bold text-green-400 tracking-tight flex items-center gap-2">
            <span className="text-2xl">☠️</span> SF3 Diddler
          </h1>
          <p className="text-gray-400 text-xs mt-1">Binary Animation Parser & Viewer</p>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {/* File Upload Section */}
          <div className="mb-8">
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              1. Load Animation File (.bytes)
            </label>
            <div 
              className="border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-green-500 hover:bg-gray-750 transition-all group"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileIcon />
              <span className="mt-2 text-sm text-gray-400 group-hover:text-white">
                {fileName || "Click to browse"}
              </span>
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".bytes,.bin,.dat,.anim" 
                className="hidden" 
                onChange={handleFileChange}
              />
            </div>
            {error && (
              <div className="mt-2 p-2 bg-red-900/50 border border-red-700 rounded text-xs text-red-200">
                {error}
              </div>
            )}
            {loading && (
              <div className="mt-2 text-xs text-yellow-400 animate-pulse">
                Parsing binary data...
              </div>
            )}
          </div>

          {/* Controls Section */}
          <div className={`transition-opacity duration-300 ${animationData ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            <label className="block text-sm font-semibold text-gray-300 mb-4">
              2. Playback Controls
            </label>

            <div className="flex items-center gap-2 mb-6">
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded font-bold transition-colors ${isPlaying ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isPlaying ? <><PauseIcon /> Pause</> : <><PlayIcon /> Play</>}
              </button>
            </div>

            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Timeline</span>
                <span className="text-white font-mono">{currentFrame} / {maxFrame}</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max={maxFrame} 
                value={currentFrame} 
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentFrame(parseInt(e.target.value));
                }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>

            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>Speed</span>
                <span className="text-white font-mono">{speed} FPS</span>
              </div>
              <input 
                type="range" 
                min="1" 
                max="120" 
                value={speed} 
                onChange={(e) => setSpeed(parseInt(e.target.value))}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Stats */}
            <div className="bg-gray-750 p-3 rounded border border-gray-700 mb-6">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Metadata</h3>
              <div className="grid grid-cols-2 gap-y-1 text-xs">
                <span className="text-gray-500">Bones:</span>
                <span className="text-right text-gray-300">{animationData?.bonesCount || 0}</span>
                <span className="text-gray-500">Frames:</span>
                <span className="text-right text-gray-300">{animationData?.framesCount || 0}</span>
              </div>
            </div>

             {/* Exports */}
             <div className="space-y-2">
                 <button 
                    onClick={handleDownloadCSV}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded flex items-center justify-center gap-2 text-sm transition-colors border border-gray-600"
                  >
                    <DownloadIcon /> Export Data (CSV)
                  </button>
             </div>
          </div>
        </div>
        
        <div className="p-4 border-t border-gray-700 text-xs text-gray-500 text-center">
          Skeleton hierarchy is hardcoded.
        </div>
      </aside>

      {/* Main Viewport */}
      <main className="flex-1 relative bg-gradient-to-b from-gray-900 to-black">
        {/* Overlay Helper */}
        {!animationData && !loading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-gray-600 text-lg font-light">
              Waiting for animation file...
            </div>
          </div>
        )}

        <Scene 
          animationData={animationData}
          isPlaying={isPlaying}
          playbackSpeed={speed}
          currentFrame={currentFrame}
          onFrameChange={setCurrentFrame}
          onMaxFrameSet={setMaxFrame}
        />
      </main>
    </div>
  );
};

export default App;