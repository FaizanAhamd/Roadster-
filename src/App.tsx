import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GameCanvas, GameCanvasHandle } from './components/GameCanvas';
import { GameHud } from './components/GameHud';
import { CarColor, GameStatus, GraphicsQuality } from './types';
import { soundManager } from './audio/soundManager';

export default function App() {
  const canvasRef = useRef<GameCanvasHandle>(null);

  const [carColor, setCarColor] = useState<CarColor>(() => {
    try {
      return (localStorage.getItem('roadster_car_color') as CarColor) || 'silver';
    } catch {
      return 'silver';
    }
  });

  const [graphicsQuality, setGraphicsQuality] = useState<GraphicsQuality>(() => {
    try {
      return (localStorage.getItem('roadster_quality') as GraphicsQuality) || 'high';
    } catch {
      return 'high';
    }
  });

  const [isPaused, setIsPaused] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // Catch PWA beforeinstallprompt
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleSelectCarColor = (color: CarColor) => {
    setCarColor(color);
    try {
      localStorage.setItem('roadster_car_color', color);
    } catch {}
  };

  const handleSelectGraphicsQuality = (quality: GraphicsQuality) => {
    setGraphicsQuality(quality);
    try {
      localStorage.setItem('roadster_quality', quality);
    } catch {}
  };

  const handleTogglePause = () => {
    setIsPaused((prev) => !prev);
  };

  // Keyboard shortcut for Pause (Esc or P)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (status.state === 'drive' || status.state === 'ramp' || status.state === 'air') {
          e.preventDefault();
          setIsPaused((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const initialStatusRef = useRef<GameStatus>({
    state: 'title',
    score: 0,
    bestScore: (() => {
      try {
        return Number(localStorage.getItem('roadsterLoopBest') || 1000);
      } catch {
        return 1000;
      }
    })(),
    isNewBest: false,
    speedMph: 0,
    thrusterGas: 1.0,
    gForce: 1.0,
    altitudeFt: 0,
    flips: 0,
    ringsCount: 0,
    totalRings: 3,
    countdownElapsed: 0,
    countdownLightStage: 0,
    isGreen: false,
    tooEarly: false,
    soundEnabled: soundManager.isEnabled(),
    isPaused: false,
    carColor,
    graphicsQuality,
    sinkSpeedFtS: 0,
    launchNotice: null,
    flipNotice: null,
    actionButtonText: 'GO',
    metrics: {
      reactionMs: 0,
      rampSpeedMph: 80,
      peakG: 1.0,
      maxAltitudeFt: 0,
      airtimeSec: 0,
      flips: 0,
      ringsCollected: 0,
      totalRings: 3,
      touchdownSpeedFtS: 0,
      tiltAngleDeg: 0,
      landedClean: false,
      score: 0,
      crashReason: '',
      breakdown: {
        ringsScore: 0,
        flipsScore: 0,
        airtimeScore: 0,
        altScore: 0,
        landingBonus: 0,
        total: 0,
      },
    },
  });

  const [status, setStatus] = useState<GameStatus>(initialStatusRef.current);

  const handleStatusUpdate = useCallback((newStatus: GameStatus) => {
    setStatus(newStatus);
  }, []);

  const handleStartRun = () => {
    canvasRef.current?.startCountdown();
  };

  const handleLaunch = () => {
    canvasRef.current?.triggerLaunch();
  };

  const handleSteer = (dir: number) => {
    canvasRef.current?.setSteer(dir);
  };

  const handleThrust = (active: boolean) => {
    canvasRef.current?.setThrust(active);
  };

  const handleRestart = () => {
    setIsPaused(false);
    canvasRef.current?.restart();
  };

  return (
    <main className="w-full h-full h-[100dvh] w-[100vw] overflow-hidden bg-[#050811] text-[#f1f6ff] relative select-none touch-manipulation">
      {/* 3D WebGL Canvas Layer (Full Screen 100dvh x 100vw) */}
      <GameCanvas
        ref={canvasRef}
        onStatusUpdate={handleStatusUpdate}
        statusRef={initialStatusRef}
        carColor={carColor}
        graphicsQuality={graphicsQuality}
        isPaused={isPaused}
      />

      {/* Primary In-Game HUD & Modals */}
      <GameHud
        status={status}
        carColor={carColor}
        graphicsQuality={graphicsQuality}
        isPaused={isPaused}
        onStartRun={handleStartRun}
        onLaunch={handleLaunch}
        onSteer={handleSteer}
        onThrust={handleThrust}
        onRestart={handleRestart}
        onTogglePause={handleTogglePause}
        onSelectCarColor={handleSelectCarColor}
        onSelectGraphicsQuality={handleSelectGraphicsQuality}
        onOpenPrivacy={() => setShowPrivacy(true)}
      />

      {/* PRIVACY POLICY MODAL */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto backdrop-blur-md">
          <div className="w-full max-w-[480px] bg-[#0c121d] border border-[#253952] rounded-lg p-6 shadow-2xl text-xs sm:text-sm text-[#b8cae0] flex flex-col max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-orbitron font-bold text-white mb-2">Privacy Policy</h2>
            <div className="red-neon-bar w-full mb-4" />
            <p className="mb-3 leading-relaxed">
              Roadster Loop is a client-side 3D fan game. It operates completely in your browser and does not collect, track, or share any personal data with external servers.
            </p>
            <h3 className="font-bold text-white mb-1">Local Storage</h3>
            <p className="mb-3 leading-relaxed">
              Your highest score, sound toggles, chosen car paint color, and graphics quality settings are stored locally in your browser using <code className="text-[#ff3880]">localStorage</code>. You can reset these at any time by clearing your browser data.
            </p>
            <p className="text-[11px] text-[#71869e] mb-4">
              Unofficial fan game, not affiliated with any car brand.
            </p>
            <button
              type="button"
              onClick={() => setShowPrivacy(false)}
              className="self-end px-5 py-2 bg-[#ff2a2a] text-white font-orbitron text-xs font-bold rounded cursor-pointer hover:bg-[#ff3b3b]"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
