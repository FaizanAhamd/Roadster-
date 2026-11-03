import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GameCanvas, GameCanvasHandle } from './components/GameCanvas';
import { GameHud } from './components/GameHud';
import { CameraMode, CarColor, GameStatus, GraphicsQuality } from './types';
import { exportFlightReport } from './utils/reportGenerator';
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
      // Migrate existing installs to the faster preset once. After this,
      // the user's choice in Settings is remembered normally.
      const performanceDefaultApplied = localStorage.getItem('roadster_performance_default_v1') === '1';
      if (!performanceDefaultApplied) {
        localStorage.setItem('roadster_performance_default_v1', '1');
        localStorage.setItem('roadster_quality', 'low');
        return 'low';
      }
      const savedQuality = localStorage.getItem('roadster_quality');
      return savedQuality === 'high' || savedQuality === 'low' ? savedQuality : 'low';
    } catch {
      return 'low';
    }
  });

  const [isPaused, setIsPaused] = useState(false);
  const isPausedStateRef = useRef(isPaused);
  isPausedStateRef.current = isPaused;
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

  const handleTogglePause = useCallback(() => {
    const next = !isPausedStateRef.current;
    isPausedStateRef.current = next;
    initialStatusRef.current = { ...initialStatusRef.current, isPaused: next };
    setIsPaused(next);
  }, []);

  // Keyboard shortcut reads the latest game state through the mutable ref.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
        const activeState = initialStatusRef.current.state;
        if (activeState === 'drive' || activeState === 'ramp' || activeState === 'air') {
          e.preventDefault();
          handleTogglePause();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePause]);

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
    airtimeSec: 0,
    flips: 0,
    ringsCount: 0,
    totalRings: 3,
    countdownElapsed: 0,
    countdownLightStage: 0,
    isGreen: false,
    tooEarly: false,
    soundEnabled: soundManager.isEnabled(),
    isPaused: false,
    crashFlash: false,
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
    // Keep the mutable engine/status ref synchronized with React state.
    // Keyboard shortcuts and the fixed-step game loop read this ref.
    initialStatusRef.current = newStatus;
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
    isPausedStateRef.current = false;
    setIsPaused(false);
    initialStatusRef.current = { ...initialStatusRef.current, isPaused: false };
    canvasRef.current?.restart();
  };

  const handleSetCameraMode = (mode: CameraMode) => {
    canvasRef.current?.setCameraMode?.(mode);
  };

  const handleExportFlightReport = async () => {
    await exportFlightReport(status, canvasRef.current?.getSnapshotCanvas?.() ?? null);
  };

  
  return (
    <div className="min-h-screen w-full bg-[#050811] text-[#f1f6ff]">

      <main className="relative w-full h-[100dvh] overflow-hidden select-none touch-manipulation">

        <GameCanvas
          ref={canvasRef}
          onStatusUpdate={handleStatusUpdate}
          statusRef={initialStatusRef}
          carColor={carColor}
          graphicsQuality={graphicsQuality}
          isPaused={isPaused}
        />

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
          onSetCameraMode={handleSetCameraMode}
          onExportFlightReport={handleExportFlightReport}
          onOpenPrivacy={() => setShowPrivacy(true)}
        />

        {showPrivacy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto backdrop-blur-md">
            <div className="w-full max-w-[480px] max-h-[85vh] overflow-y-auto bg-[#0c121d] border border-[#253952] rounded-lg p-6 pb-8 shadow-2xl text-xs sm:text-sm text-[#b8cae0] flex flex-col">

              <h2 className="text-xl font-orbitron font-bold text-white mb-2">
                Privacy Policy
              </h2>

              <div className="red-neon-bar w-full mb-4" />

              <p className="mb-3 leading-relaxed">
                Roadster Loop is a browser-based 3D game. Game preferences and
                progress are stored locally in your browser. The website also
                uses Google AdSense to display advertisements.
              </p>

              <h3 className="font-bold text-white mb-1">Local Storage</h3>
              <p className="mb-3 leading-relaxed">
                Your best score, selected car color, sound preferences and
                graphics settings may be stored in your browser's localStorage.
                You can clear this information through your browser settings.
              </p>

              <h3 className="font-bold text-white mb-1">Advertising and Cookies</h3>
              <p className="mb-3 leading-relaxed">
                Google and its partners may use cookies, device identifiers
                or similar technologies to serve, measure and personalize ads,
                subject to your location, consent choices and applicable settings.
              </p>

              <p className="mb-3 leading-relaxed">
                Learn how Google uses information from sites that use its
                services in the{" "}
                <a
                  href="https://policies.google.com/technologies/partner-sites"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ff3880] underline"
                >
                  Google Partner Sites Policy
                </a>.
              </p>

              <h3 className="font-bold text-white mb-1">Your Choices</h3>
              <p className="mb-3 leading-relaxed">
                You can manage available advertising and privacy choices through
                Google's{" "}
                <a
                  href="https://myadcenter.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ff3880] underline"
                >
                  My Ad Center
                </a>
                {" "}and your browser settings.
              </p>

              <p className="mb-4 leading-relaxed">
                For more information, read our full{" "}
                <a
                  href="/roadster-loop/privacy.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ff3880] underline"
                >
                  Privacy Policy
                </a>.
              </p>

              <p className="text-[11px] text-[#71869e] mb-4">
                Roadster Loop is an unofficial fan game and is not affiliated
                with any car brand.
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

      {/* Website Footer */}
      <footer className="w-full bg-[#080e19] border-t border-[#253952] px-4 py-6 relative z-10">

        <nav
          aria-label="Website information"
          className="max-w-5xl mx-auto flex flex-wrap justify-center items-center gap-x-5 gap-y-3"
        >
          <a href="/about/" className="text-xs text-[#a9b8cc] hover:text-[#ff3880] transition-colors">
            About
          </a>

          <a href="/how-to-play/" className="text-xs text-[#a9b8cc] hover:text-[#ff3880] transition-colors">
            How to Play
          </a>

          <a href="/features/" className="text-xs text-[#a9b8cc] hover:text-[#ff3880] transition-colors">
            Features
          </a>

          <a href="/faq/" className="text-xs text-[#a9b8cc] hover:text-[#ff3880] transition-colors">
            FAQ
          </a>

          <a href="/privacy/" className="text-xs text-[#a9b8cc] hover:text-[#ff3880] transition-colors">
            Privacy
          </a>

          <a href="/contact/" className="text-xs text-[#a9b8cc] hover:text-[#ff3880] transition-colors">
            Contact
          </a>
        </nav>

        <p className="text-center text-[10px] text-[#71839b] mt-4">
          © {new Date().getFullYear()} Roadster Loop — Night Run
        </p>

      </footer>

    </div>
  );
}

