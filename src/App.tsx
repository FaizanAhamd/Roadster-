import React, { useState, useRef, useCallback } from 'react';
import { GameCanvas, GameCanvasHandle } from './components/GameCanvas';
import { GameHud } from './components/GameHud';
import { GameStatus } from './types';
import { soundManager } from './audio/soundManager';

export default function App() {
  const canvasRef = useRef<GameCanvasHandle>(null);

  const initialStatusRef = useRef<GameStatus>({
    state: 'title',
    score: 0,
    bestScore: (() => {
      try {
        return Number(localStorage.getItem('roadsterLoopBest') || 500);
      } catch {
        return 500;
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
    metrics: {
      reactionMs: 0,
      rampSpeedMph: 90,
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
    canvasRef.current?.restart();
  };

  return (
    <main className="w-full min-h-screen bg-[#080d18] text-[#f1f6ff] flex flex-col items-center">
      <div className="w-full max-w-[1440px] px-4 sm:px-8 md:px-9 flex flex-col min-h-screen">
        {/* TOP BAR */}
        <header className="h-[68px] sm:h-[76px] flex items-center justify-between border-b border-[rgba(151,180,215,0.16)] w-full">
          {/* Brand */}
          <a
            href="#"
            className="flex items-center gap-3 text-white text-xs sm:text-sm tracking-[2.4px] font-extrabold no-underline font-orbitron"
          >
            <span className="w-8 h-8 border border-[#71e7ff] text-[#71e7ff] grid place-items-center font-black text-lg -skew-x-6">
              R<span className="text-[10px] -mt-1 ml-0.5">↗</span>
            </span>
            <span>
              ROADSTER <b className="text-[#71e7ff]">LOOP</b>
            </span>
          </a>

          {/* Session Meta */}
          <div className="hidden sm:flex items-center gap-2.5 text-[#8190a8] font-mono-tech text-[10px] tracking-[1.3px]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#70f6bd] shadow-[0_0_10px_#70f6bd]" />
            NIGHT SESSION <span className="text-[#3c4b61]">/</span> BUILD 02
          </div>

        </header>

        {/* GAME SECTION */}
        <section className="pt-4 sm:pt-6 w-full flex flex-col">
          <div className="w-full h-[min(68vw,660px)] min-h-[460px] max-h-[700px] relative overflow-hidden bg-[#060912] border border-[rgba(127,171,215,0.22)] rounded-md shadow-2xl">
            {/* 3D WebGL Canvas */}
            <GameCanvas
              ref={canvasRef}
              onStatusUpdate={handleStatusUpdate}
              statusRef={initialStatusRef}
            />

            {/* In-Game UI Overlay */}
            <GameHud
              status={status}
              onStartRun={handleStartRun}
              onLaunch={handleLaunch}
              onSteer={handleSteer}
              onThrust={handleThrust}
              onRestart={handleRestart}
            />
          </div>
        </section>

        {/* FEATURE INFO STRIP BELOW GAME */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 py-7 sm:py-8 border-b border-[rgba(151,180,215,0.16)] w-full">
          <div className="flex items-start gap-3.5">
            <span className="border border-[#29415a] text-[#71e7ff] px-2 py-1 font-mono-tech text-[10px]">
              01
            </span>
            <div>
              <b className="font-mono-tech text-xs tracking-wider text-white">TIME IT RIGHT</b>
              <p className="text-xs text-[#7f90a8] leading-relaxed mt-1.5 max-w-[280px]">
                Launch on green. Faster reaction reflexes award higher speed and momentum at the ramp.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <span className="border border-[#29415a] text-[#71e7ff] px-2 py-1 font-mono-tech text-[10px]">
              02
            </span>
            <div>
              <b className="font-mono-tech text-xs tracking-wider text-white">OWN THE AIR</b>
              <p className="text-xs text-[#7f90a8] leading-relaxed mt-1.5 max-w-[280px]">
                Rotate in mid-flight with ← / → or A / D. Tap Space or hold THRUST for pressurized
                cold-gas propulsion.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <span className="border border-[#29415a] text-[#71e7ff] px-2 py-1 font-mono-tech text-[10px]">
              03
            </span>
            <div>
              <b className="font-mono-tech text-xs tracking-wider text-white">STICK THE LANDING</b>
              <p className="text-xs text-[#7f90a8] leading-relaxed mt-1.5 max-w-[280px]">
                Keep the wheels pointed down and use thrusters to slow sink speed below 39 ft/s before
                ground contact.
              </p>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="min-h-[58px] py-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[#6c7d94] font-mono-tech text-[9px] tracking-wider w-full mt-auto">
          <span>© ROADSTER LOOP · ORIGINAL FAN-MADE GAME</span>
          <span>Unofficial fan game, not affiliated with Tesla.</span>
          <a
            href="public/roadster-loop/privacy.html"
            target="_blank"
            rel="noreferrer"
            className="text-[#94a7c0] hover:text-white underline cursor-pointer"
          >
            PRIVACY
          </a>
        </footer>
      </div>
    </main>
  );
}
