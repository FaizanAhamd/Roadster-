import React, { useState, useEffect, useRef } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Share2,
  Settings,
  HelpCircle,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Award,
} from 'lucide-react';
import { CarColor, GameStatus, GraphicsQuality } from '../types';
import { soundManager } from '../audio/soundManager';

interface GameHudProps {
  status: GameStatus;
  carColor: CarColor;
  graphicsQuality: GraphicsQuality;
  isPaused: boolean;
  onStartRun: () => void;
  onLaunch: () => void;
  onSteer: (dir: number) => void;
  onThrust: (active: boolean) => void;
  onRestart: () => void;
  onTogglePause: () => void;
  onSelectCarColor: (color: CarColor) => void;
  onSelectGraphicsQuality: (quality: GraphicsQuality) => void;
  onOpenPrivacy: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  status,
  carColor,
  graphicsQuality,
  isPaused,
  onStartRun,
  onLaunch,
  onSteer,
  onThrust,
  onRestart,
  onTogglePause,
  onSelectCarColor,
  onSelectGraphicsQuality,
  onOpenPrivacy,
}) => {
  const [soundOn, setSoundOn] = useState(soundManager.isEnabled());
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return !localStorage.getItem('roadster_tutorial_seen');
    } catch {
      return false;
    }
  });
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const toggleSound = () => {
    const updated = soundManager.toggle();
    setSoundOn(updated);
  };

  const closeTutorial = () => {
    setShowTutorial(false);
    try {
      localStorage.setItem('roadster_tutorial_seen', 'true');
    } catch {}
  };

  const isAir = status.state === 'air';
  const isCountdown = status.state === 'count';
  const isTitle = status.state === 'title';
  const isResults = status.state === 'results' || status.state === 'landed' || status.state === 'crashed';

  // Circular gauge calculations
  const gRatio = Math.min(Math.max((status.gForce - 1) / 50, 0), 1);
  const altRatio = Math.min(Math.max(status.altitudeFt / 250, 0), 1);

  const circumference = 2 * Math.PI * 42;
  const gStrokeOffset = circumference - gRatio * circumference;
  const altStrokeOffset = circumference - altRatio * circumference;

  // Share Score card generator (Canvas snapshot + Web Share API or download)
  const handleShareScore = async () => {
    setIsSharing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Dark background
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, 800, 800);

      // Gradient accent glow
      const grad = ctx.createRadialGradient(400, 200, 50, 400, 200, 400);
      grad.addColorStop(0, 'rgba(255, 42, 42, 0.25)');
      grad.addColorStop(1, 'rgba(5, 8, 17, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 800);

      // Border line
      ctx.strokeStyle = '#222f42';
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, 740, 740);

      // Title
      ctx.fillStyle = '#ff2a2a';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('ROADSTER LOOP — NIGHT RUN', 60, 90);

      ctx.fillStyle = status.metrics.landedClean ? '#34d399' : '#ff2a2a';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(status.metrics.landedClean ? 'TOUCHDOWN CLEAN' : 'WIPEOUT', 60, 150);

      // Red divider
      ctx.fillStyle = '#ff2a2a';
      ctx.fillRect(60, 170, 680, 4);

      // Score
      ctx.fillStyle = '#8a9bb5';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('TOTAL SCORE', 60, 220);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 72px sans-serif';
      ctx.fillText(status.metrics.score.toLocaleString(), 60, 290);

      // 4 Key metrics
      const grid = [
        { label: 'REACTION', val: `${(status.metrics.reactionMs / 1000).toFixed(3)} s` },
        { label: 'RAMP SPEED', val: `${status.metrics.rampSpeedMph} mph` },
        { label: 'MAX ALTITUDE', val: `${status.metrics.maxAltitudeFt} ft` },
        { label: 'FLIPS', val: `${status.metrics.flips}` },
        { label: 'RINGS', val: `${status.metrics.ringsCollected} / 3` },
        { label: 'AIRTIME', val: `${status.metrics.airtimeSec.toFixed(1)} s` },
      ];

      grid.forEach((item, idx) => {
        const col = idx % 2;
        const row = Math.floor(idx / 2);
        const gx = 60 + col * 340;
        const gy = 360 + row * 90;

        ctx.fillStyle = '#7a8ba5';
        ctx.font = '16px monospace';
        ctx.fillText(item.label, gx, gy);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(item.val, gx, gy + 36);
      });

      // Footer
      ctx.fillStyle = '#5a687d';
      ctx.font = '14px monospace';
      ctx.fillText('Unofficial fan game, not affiliated with any car brand.', 60, 720);

      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
      if (!blob) return;

      const file = new File([blob], 'roadster-loop-score.png', { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Roadster Loop Score',
          text: `I scored ${status.metrics.score.toLocaleString()} on Roadster Loop! Can you beat it?`,
          files: [file],
        });
      } else {
        // Download fallback
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roadster-loop-score-${status.metrics.score}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.warn('Share error:', err);
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-3 sm:p-5 md:p-6">
      {/* 1. TOP HUD BAR (Matching Reference Screenshot 2 & 3) */}
      <div className="flex justify-between items-start w-full pointer-events-auto">
        {/* Top Left: Score & Best */}
        <div className="flex flex-col">
          <span className="text-[10px] sm:text-xs font-mono-tech tracking-[0.2em] text-[#8a9bb5]">
            SCORE
          </span>
          <div className="text-3xl sm:text-4xl font-condensed font-bold tracking-tight text-white leading-none mt-0.5 drop-shadow">
            {status.score.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] sm:text-xs font-mono-tech tracking-wider text-[#687b94] mt-1">
            BEST {status.bestScore.toLocaleString('en-US')}
          </span>
        </div>

        {/* Top Center: Speed MPH, Thruster Gas Bar, Flips & Rings */}
        <div className="flex flex-col items-center max-w-[240px] sm:max-w-[320px] w-full px-2">
          {/* Speed */}
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-5xl font-condensed font-extrabold tracking-tight text-white">
              {status.speedMph}
            </span>
            <span className="text-xs sm:text-sm font-mono-tech text-[#8a9bb5]">mph</span>
          </div>

          {/* Thruster Gas Bar (Light grey/white fill with clean border) */}
          <div className="w-full mt-1.5 flex flex-col items-center">
            <div className="w-full h-1 sm:h-1.5 bg-[#141d2a] rounded-full overflow-hidden border border-[#26374d]">
              <div
                className="h-full bg-gradient-to-r from-white to-[#cbd7e6] transition-all duration-75"
                style={{ width: `${Math.round(status.thrusterGas * 100)}%` }}
              />
            </div>
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8a9bb5] mt-1">
              THRUSTER GAS
            </span>
          </div>

          {/* Flips & Rings Counters when airborne (Screenshot 3) */}
          {isAir && (
            <div className="flex justify-between w-full mt-1 text-[10px] sm:text-xs font-mono-tech text-[#dbe8fa] tracking-wider px-2">
              <div className="flex flex-col items-center">
                <span className="text-[#8a9bb5] text-[8px] sm:text-[9px]">FLIPS</span>
                <span className="font-bold text-sm sm:text-base">{status.flips}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[#8a9bb5] text-[8px] sm:text-[9px]">RINGS</span>
                <span className="font-bold text-sm sm:text-base">
                  {status.ringsCount} / {status.totalRings}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top Right: Sound Button, Pause Button, Settings */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowTutorial(true)}
            title="Help / Tutorial"
            aria-label="Help"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0c121d]/90 border border-[#253952] hover:border-[#ff2a2a] text-[#b8c9df] hover:text-[#ff2a2a] flex items-center justify-center transition-all cursor-pointer shadow-lg"
          >
            <HelpCircle size={17} />
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title="Settings (Car Color & Quality)"
            aria-label="Settings"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0c121d]/90 border border-[#253952] hover:border-[#ff2a2a] text-[#b8c9df] hover:text-[#ff2a2a] flex items-center justify-center transition-all cursor-pointer shadow-lg"
          >
            <Settings size={17} />
          </button>

          <button
            type="button"
            onClick={onTogglePause}
            title={isPaused ? 'Resume Game' : 'Pause Game'}
            aria-label={isPaused ? 'Resume' : 'Pause'}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0c121d]/90 border border-[#253952] hover:border-[#ff2a2a] text-[#b8c9df] hover:text-[#ff2a2a] flex items-center justify-center transition-all cursor-pointer shadow-lg"
          >
            {isPaused ? <Play size={17} /> : <Pause size={17} />}
          </button>

          <button
            type="button"
            onClick={toggleSound}
            title={soundOn ? 'Mute Sound' : 'Enable Sound'}
            aria-label={soundOn ? 'Mute Sound' : 'Enable Sound'}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0c121d]/90 border border-[#253952] hover:border-[#ff2a2a] text-[#b8c9df] hover:text-[#ff2a2a] flex items-center justify-center transition-all cursor-pointer shadow-lg"
          >
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} className="text-[#ff2a2a]" />}
          </button>
        </div>
      </div>

      {/* 2. CENTER DRAG-STRIP COUNTDOWN LIGHTS (Screenshot 2) */}
      {isCountdown && (
        <div className="absolute top-[34%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto">
          {/* Dark Pill Capsule */}
          <div className="bg-[#080f1b]/95 border border-[#253952] rounded-full px-5 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-sm flex items-center gap-3.5 sm:gap-4">
            {[1, 2, 3, 4].map((stageNum) => {
              const isAllGreen = status.isGreen;
              const isRedOn = !status.isGreen && status.countdownLightStage >= stageNum;

              return (
                <div
                  key={stageNum}
                  className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full transition-all duration-100 ${
                    isAllGreen
                      ? 'green-light-glow'
                      : isRedOn
                      ? 'red-light-glow'
                      : 'bg-[#1b2637] border border-[#354863]'
                  }`}
                />
              );
            })}
          </div>

          {/* Subtext below lights matching screenshot: "GO!" */}
          <div className="mt-4 text-center">
            {status.isGreen ? (
              <span className="text-3xl sm:text-5xl font-orbitron font-extrabold tracking-widest text-white drop-shadow-[0_0_20px_rgba(52,211,153,0.85)] animate-pulse">
                GO!
              </span>
            ) : (
              <span className="text-xs sm:text-sm font-mono-tech tracking-[0.25em] text-[#cbd9ea] font-medium">
                WAIT FOR GREEN
              </span>
            )}
          </div>
        </div>
      )}

      {/* LAUNCH REACTION NOTICE BANNER */}
      {status.launchNotice && (
        <div className="absolute top-[34%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none animate-fade-in">
          <span className="text-3xl sm:text-5xl font-orbitron font-black tracking-widest text-white/90 drop-shadow-[0_0_25px_rgba(255,255,255,0.7)]">
            LAUNCH
          </span>
          <span className="text-xs sm:text-sm font-mono-tech tracking-wider text-[#cbd9ea] mt-1">
            Reaction {status.launchNotice.reactionSec.toFixed(3)} s
          </span>
        </div>
      )}

      {/* FLIP STUNT POPUP BANNER */}
      {status.flipNotice && (
        <div className="absolute top-[30%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none animate-bounce">
          <span className="text-3xl sm:text-5xl font-orbitron font-extrabold tracking-wider text-white drop-shadow-[0_0_25px_rgba(255,42,42,0.8)]">
            FLIP
          </span>
          <span className="text-xs sm:text-sm font-mono-tech tracking-wider text-[#ff3880] mt-0.5 font-bold">
            +1,000 on landing
          </span>
        </div>
      )}

      {/* TOO EARLY JUMP START TOAST */}
      {status.tooEarly && (
        <div className="absolute top-[26%] left-1/2 -translate-x-1/2 bg-[#3b1216] border border-[#ff2a2a] text-[#fca5a5] px-5 py-2.5 rounded text-xs sm:text-sm font-mono-tech tracking-wider shadow-[0_0_25px_rgba(255,42,42,0.4)] pointer-events-none animate-bounce">
          TOO EARLY — WAIT FOR GREEN!
        </div>
      )}

      {/* 3. BOTTOM CONTROLS & CIRCULAR GAUGES (Matching Screenshot 2 & 3) */}
      <div className="w-full flex items-end justify-between pointer-events-auto pb-1 sm:pb-2">
        {/* Bottom Left: Circular G-Force Gauge & Flip Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="#080e18"
                stroke="#172232"
                strokeWidth="4"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={status.gForce > 20 ? '#ff2a2a' : '#94a7c0'}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={gStrokeOffset}
                strokeLinecap="round"
                className="gauge-ring"
                style={{
                  filter: status.gForce > 20 ? 'drop-shadow(0 0 8px #ff2a2a)' : undefined,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[8px] sm:text-[9px] font-mono-tech tracking-wider text-[#798ea8]">
                G-FORCE
              </span>
              <span className="text-sm sm:text-lg font-condensed font-bold text-white leading-none my-0.5">
                {status.gForce.toFixed(1)}
              </span>
              <span className="text-[8px] sm:text-[9px] font-mono-tech text-[#798ea8]">g</span>
            </div>
          </div>

          {/* Flip Steer Controls */}
          <div className="flex flex-col items-center">
            <div className="flex gap-2">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSteer(-1);
                }}
                onPointerUp={() => onSteer(0)}
                onPointerLeave={() => onSteer(0)}
                aria-label="Rotate car left"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#0c1422]/90 border border-[#253952] active:bg-[#1a2f4c] text-white flex items-center justify-center cursor-pointer shadow-lg transition-transform active:scale-95"
              >
                <ArrowLeft size={20} />
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSteer(1);
                }}
                onPointerUp={() => onSteer(0)}
                onPointerLeave={() => onSteer(0)}
                aria-label="Rotate car right"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#0c1422]/90 border border-[#253952] active:bg-[#1a2f4c] text-white flex items-center justify-center cursor-pointer shadow-lg transition-transform active:scale-95"
              >
                <ArrowRight size={20} />
              </button>
            </div>
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#798ea8] mt-1">
              FLIP
            </span>
          </div>
        </div>

        {/* Bottom Right: Big Red Action Circle & Altitude with Real-time SINK RATE */}
        <div className="flex items-center gap-2.5 sm:gap-4">
          {/* Action Circle (GO on ground, THRUST during flight) - Matching Screenshot 2 & 3 */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (isAir) {
                onThrust(true);
              } else {
                onLaunch();
              }
            }}
            onPointerUp={() => {
              if (isAir) onThrust(false);
            }}
            onPointerLeave={() => {
              if (isAir) onThrust(false);
            }}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center font-orbitron font-bold text-sm sm:text-base tracking-widest text-white transition-all cursor-pointer shadow-2xl bg-[#1e0e12]/95 border-2 border-[#ff2a2a] hover:bg-[#341117] active:scale-95 shadow-[0_0_32px_rgba(255,42,42,0.65)]"
          >
            {status.actionButtonText}
          </button>

          {/* Altitude Gauge with Dynamic SINK SPEED indicator */}
          <div className="flex flex-col items-center">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="#080e18"
                  stroke="#172232"
                  strokeWidth="4"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={status.altitudeFt > 50 ? '#ff2a2a' : '#cbd7e6'}
                  strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={altStrokeOffset}
                  strokeLinecap="round"
                  className="gauge-ring"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[8px] sm:text-[9px] font-mono-tech tracking-wider text-[#798ea8]">
                  ALTITUDE
                </span>
                <span className="text-sm sm:text-lg font-condensed font-bold text-white leading-none my-0.5">
                  {status.altitudeFt}
                </span>
                <span className="text-[8px] sm:text-[9px] font-mono-tech text-[#798ea8]">ft</span>
              </div>
            </div>

            {/* In-Flight Real-Time Sink Speed Badge */}
            {isAir && status.sinkSpeedFtS > 0 && (
              <span
                className={`text-[9px] sm:text-[10px] font-mono-tech font-bold mt-1 tracking-wider ${
                  status.sinkSpeedFtS > 39
                    ? 'text-[#ff2a2a] drop-shadow-[0_0_6px_rgba(255,42,42,0.8)]'
                    : 'text-[#34d399]'
                }`}
              >
                SINK {status.sinkSpeedFtS} FT/S
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. TITLE / START RUN MODAL (Exact match to Reference Screenshot 1) */}
      {isTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 pointer-events-auto">
          <div className="w-full max-w-[420px] bg-[#0c1017]/95 border border-[#233347] rounded-lg p-5 sm:p-6 shadow-[0_20px_70px_rgba(0,0,0,0.9)] flex flex-col backdrop-blur-md">
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8ea3bd] uppercase">
              3D · NIGHT RUN · WALL RAMP · COLD-GAS THRUSTERS
            </span>

            <h1 className="text-4xl sm:text-5xl font-orbitron font-extrabold tracking-tight text-white leading-none mt-2 mb-3">
              ROADSTER
              <br />
              LOOP
            </h1>

            <div className="red-neon-bar w-full mb-4" />

            <p className="text-xs sm:text-sm text-[#b2c4dc] leading-relaxed mb-4">
              Hit the ramp flat out, flip off the curl at the top, then burn the thrusters to set it
              down on all four wheels.
            </p>

            <div className="flex flex-col gap-3 mb-5 text-xs sm:text-sm text-[#cbd9ea]">
              <div className="flex items-start gap-4">
                <span className="w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Launch</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  Go when the last light turns green. A quick reaction means more speed at the ramp.
                </p>
              </div>

              <div className="flex items-start gap-4">
                <span className="w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Flip</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  <span className="key-cap mr-1">←</span>
                  <span className="key-cap mr-1.5">→</span>
                  rotate the car. Every time it passes upside down counts as a flip.
                </p>
              </div>

              <div className="flex items-start gap-4">
                <span className="w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Land</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  <span className="key-cap mr-1.5">Space</span>
                  fires the thrusters out of the floor. Get upright and slow the drop below 39 ft/s
                  before the wheels touch.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onStartRun}
              className="w-full py-3.5 bg-[#ff2a2a] hover:bg-[#ff3b3b] active:scale-[0.98] text-white font-orbitron font-bold text-sm tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_25px_rgba(255,42,42,0.5)]"
            >
              START RUN
            </button>

            <div className="mt-3.5 text-center">
              <p className="text-[10px] text-[#71869e] leading-relaxed">
                Fly through the light rings for points and a gas refill.
                <br />
                Unofficial fan game, not affiliated with any car brand.{' '}
                <button
                  type="button"
                  onClick={onOpenPrivacy}
                  className="text-[#ff3880] underline hover:text-white cursor-pointer"
                >
                  Privacy
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. RESULTS / WIPEOUT / VICTORY MODAL (Exact match to Reference Screenshot 4) */}
      {isResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4 pointer-events-auto">
          <div className="w-full max-w-[420px] bg-[#0b1018]/95 border border-[#24354a] rounded-lg p-4 sm:p-5 shadow-[0_20px_80px_rgba(0,0,0,0.95)] flex flex-col backdrop-blur-md">
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8da3bd] uppercase">
              {status.metrics.landedClean ? 'SUCCESS' : 'CRASHED'}
            </span>

            <h2 className="text-3xl sm:text-4xl font-orbitron font-extrabold tracking-tight text-white mt-1 mb-2">
              {status.metrics.landedClean ? 'TOUCHDOWN' : 'WIPEOUT'}
            </h2>

            <div className="red-neon-bar w-full mb-3" />

            <div className="flex flex-col mb-2.5">
              <span className="text-[9px] font-mono-tech tracking-[0.2em] text-[#869ab4]">SCORE</span>
              <div className="flex items-center gap-3">
                <span className="text-3xl sm:text-4xl font-condensed font-extrabold text-white">
                  {status.metrics.score.toLocaleString('en-US')}
                </span>
                {status.isNewBest && (
                  <span className="bg-[#ff2a2a] text-white text-[9px] font-orbitron font-bold px-2 py-0.5 rounded tracking-wider">
                    NEW BEST
                  </span>
                )}
                <span className="text-xs font-mono-tech text-[#869ab4] ml-auto">
                  BEST {status.bestScore.toLocaleString('en-US')}
                </span>
              </div>
            </div>

            <p className="text-xs text-[#a9bccf] leading-relaxed mb-3">
              {status.metrics.landedClean
                ? `All four wheels touched down clean! Soft landing speed ${status.metrics.touchdownSpeedFtS} ft/s banked with bonus points.`
                : status.metrics.crashReason}
            </p>

            {/* 8-Metric Grid matching Screenshot 4 */}
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 py-2.5 border-t border-b border-[#1f2f42] text-xs font-mono-tech mb-3">
              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">REACTION</span>
                <span className="text-sm font-semibold text-white">
                  {(status.metrics.reactionMs / 1000).toFixed(3)} s
                </span>
              </div>
              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">RAMP SPEED</span>
                <span className="text-sm font-semibold text-white">
                  {status.metrics.rampSpeedMph} mph
                </span>
              </div>

              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">PEAK G</span>
                <span className="text-sm font-semibold text-white">
                  {status.metrics.peakG.toFixed(1)} g
                </span>
              </div>
              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">MAX ALTITUDE</span>
                <span className="text-sm font-semibold text-white">
                  {status.metrics.maxAltitudeFt} ft
                </span>
              </div>

              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">AIRTIME</span>
                <span className="text-sm font-semibold text-white">
                  {status.metrics.airtimeSec.toFixed(1)} s
                </span>
              </div>
              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">FLIPS</span>
                <span className="text-sm font-semibold text-white">{status.metrics.flips}</span>
              </div>

              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">RINGS</span>
                <span className="text-sm font-semibold text-white">
                  {status.metrics.ringsCollected} / {status.metrics.totalRings}
                </span>
              </div>
              <div>
                <span className="text-[9px] tracking-wider text-[#768da6] block">TOUCHDOWN</span>
                <span className="text-sm font-semibold text-white">
                  {status.metrics.touchdownSpeedFtS} ft/s
                </span>
              </div>
            </div>

            {/* Expandable Score Breakdown (Requirement 4.3) */}
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="text-[10px] font-mono-tech text-[#8a9bb5] hover:text-white flex items-center gap-1.5 cursor-pointer underline"
              >
                <Sparkles size={12} className="text-[#ff3880]" />
                {showBreakdown ? 'Hide score breakdown' : 'View score breakdown'}
              </button>

              {showBreakdown && status.metrics.breakdown && (
                <div className="mt-2 bg-[#080d16] border border-[#1e2e42] p-2.5 rounded text-[11px] font-mono-tech text-[#b8c9df] flex flex-col gap-1">
                  <div className="flex justify-between">
                    <span>Rings ({status.metrics.ringsCollected}x500):</span>
                    <span>+{status.metrics.breakdown.ringsScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Flips ({status.metrics.flips}x1000):</span>
                    <span>+{status.metrics.breakdown.flipsScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Altitude Bonus:</span>
                    <span>+{status.metrics.breakdown.altScore}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Airtime ({status.metrics.airtimeSec.toFixed(1)}s):</span>
                    <span>+{status.metrics.breakdown.airtimeScore}</span>
                  </div>
                  <div className="flex justify-between font-bold text-white border-t border-[#1e2e42] pt-1">
                    <span>Clean Landing Bonus:</span>
                    <span>+{status.metrics.breakdown.landingBonus}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Actions: Run it again & Share Score */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-3 bg-[#ff2a2a] hover:bg-[#ff3b3b] active:scale-[0.98] text-white font-orbitron font-bold text-xs sm:text-sm tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_25px_rgba(255,42,42,0.5)]"
              >
                RUN IT AGAIN
              </button>

              <button
                type="button"
                onClick={handleShareScore}
                disabled={isSharing}
                className="w-full py-2 bg-[#121c2b] hover:bg-[#1a293d] border border-[#2b3e58] hover:border-[#ff2a2a] text-[#c3d5eb] hover:text-white font-mono-tech text-xs tracking-wider uppercase rounded flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Share2 size={14} className="text-[#ff3880]" />
                {isSharing ? 'Generating...' : 'Share Score'}
              </button>
            </div>

            <span className="text-[9px] font-mono-tech text-[#71869e] text-center mt-2">
              Space or Enter restarts
            </span>
          </div>
        </div>
      )}

      {/* 6. PAUSE OVERLAY (Requirement 4.2) */}
      {isPaused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 pointer-events-auto backdrop-blur-sm">
          <div className="w-full max-w-[340px] bg-[#0c121d] border border-[#253952] rounded-lg p-6 shadow-2xl flex flex-col items-center text-center">
            <h2 className="text-3xl font-orbitron font-extrabold text-white tracking-widest mb-1">
              PAUSED
            </h2>
            <div className="red-neon-bar w-24 mb-6" />

            <div className="flex flex-col gap-3 w-full">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-3 bg-[#ff2a2a] hover:bg-[#ff3b3b] text-white font-orbitron font-bold text-xs tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_20px_rgba(255,42,42,0.4)]"
              >
                RESUME
              </button>

              <button
                type="button"
                onClick={() => {
                  onTogglePause();
                  onRestart();
                }}
                className="w-full py-2.5 bg-[#141e2e] hover:bg-[#1c2a40] border border-[#2a3e59] text-white font-mono-tech text-xs tracking-wider uppercase rounded cursor-pointer transition-all"
              >
                RESTART RUN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SETTINGS MODAL: Car Color & Graphics Quality (Requirements 4.6 & 4.7) */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto backdrop-blur-sm">
          <div className="w-full max-w-[380px] bg-[#0c121d] border border-[#253952] rounded-lg p-5 shadow-2xl flex flex-col">
            <h2 className="text-lg font-orbitron font-bold text-white mb-1">SETTINGS</h2>
            <div className="red-neon-bar w-full mb-4" />

            {/* Select Car Color */}
            <div className="mb-4">
              <label className="text-xs font-mono-tech tracking-wider text-[#8a9bb5] block mb-2">
                ROADSTER COLOR
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'silver' as CarColor, label: 'Silver Frost', hex: '#dce5ef' },
                  { id: 'red' as CarColor, label: 'Cyber Red', hex: '#d61b26' },
                  { id: 'black' as CarColor, label: 'Carbon Black', hex: '#181a20' },
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectCarColor(c.id)}
                    className={`py-2 px-1 rounded flex flex-col items-center gap-1.5 border transition-all cursor-pointer ${
                      carColor === c.id
                        ? 'border-[#ff2a2a] bg-[#1f151c]'
                        : 'border-[#26374d] bg-[#0e1624] hover:border-[#455d7e]'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="text-[10px] font-mono-tech text-white leading-tight text-center">
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Graphics Quality */}
            <div className="mb-5">
              <label className="text-xs font-mono-tech tracking-wider text-[#8a9bb5] block mb-2">
                GRAPHICS QUALITY
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectGraphicsQuality('high')}
                  className={`py-2 px-2 rounded border text-xs font-mono-tech cursor-pointer transition-all ${
                    graphicsQuality === 'high'
                      ? 'border-[#ff2a2a] bg-[#1f151c] text-white font-bold'
                      : 'border-[#26374d] bg-[#0e1624] text-[#8a9bb5] hover:text-white'
                  }`}
                >
                  HIGH (60FPS + Shadows)
                </button>
                <button
                  type="button"
                  onClick={() => onSelectGraphicsQuality('low')}
                  className={`py-2 px-2 rounded border text-xs font-mono-tech cursor-pointer transition-all ${
                    graphicsQuality === 'low'
                      ? 'border-[#ff2a2a] bg-[#1f151c] text-white font-bold'
                      : 'border-[#26374d] bg-[#0e1624] text-[#8a9bb5] hover:text-white'
                  }`}
                >
                  LOW (Battery Saver)
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSettings(false)}
              className="w-full py-2.5 bg-[#ff2a2a] text-white font-orbitron text-xs font-bold rounded cursor-pointer hover:bg-[#ff3b3b]"
            >
              SAVE & CLOSE
            </button>
          </div>
        </div>
      )}

      {/* 8. FIRST-RUN TUTORIAL OVERLAY (Requirement 4.1) */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 pointer-events-auto backdrop-blur-sm">
          <div className="w-full max-w-[420px] bg-[#0b1018] border border-[#283b52] rounded-lg p-5 sm:p-6 shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 text-[#ff3880] text-xs font-mono-tech uppercase mb-1">
              <Award size={16} /> HOW TO PLAY
            </div>
            <h2 className="text-2xl sm:text-3xl font-orbitron font-extrabold text-white mb-2">
              ROADSTER LOOP
            </h2>
            <div className="red-neon-bar w-full mb-4" />

            <div className="flex flex-col gap-3.5 text-xs text-[#cbd9ea] mb-5">
              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[#1e1014] border border-[#ff2a2a] text-[#ff2a2a] flex items-center justify-center font-bold text-xs shrink-0">
                  1
                </span>
                <div>
                  <b className="text-white block font-mono-tech">LAUNCH ON GREEN</b>
                  <p className="text-[#9cb0c9] mt-0.5 leading-relaxed">
                    Watch the 4 start lights. Tap <b>GO</b> or press <b>Space</b> right when green turns on. Faster reaction awards higher launch velocity.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[#1e1014] border border-[#ff2a2a] text-[#ff2a2a] flex items-center justify-center font-bold text-xs shrink-0">
                  2
                </span>
                <div>
                  <b className="text-white block font-mono-tech">FLIP OFF THE WALL</b>
                  <p className="text-[#9cb0c9] mt-0.5 leading-relaxed">
                    Use <b>← / →</b> or <b>A / D</b> buttons to rotate. Each full 360° flip scores 1,000 points. Fly through the pink rings for gas refills!
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <span className="w-6 h-6 rounded-full bg-[#1e1014] border border-[#ff2a2a] text-[#ff2a2a] flex items-center justify-center font-bold text-xs shrink-0">
                  3
                </span>
                <div>
                  <b className="text-white block font-mono-tech">LAND WHEELS DOWN</b>
                  <p className="text-[#9cb0c9] mt-0.5 leading-relaxed">
                    Hold <b>THRUST</b> or <b>Space</b> to fire cold-gas rockets. Level wheels upright and keep sink speed under 39 ft/s for a clean landing!
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={closeTutorial}
              className="w-full py-3 bg-[#ff2a2a] hover:bg-[#ff3b3b] text-white font-orbitron font-bold text-xs tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_20px_rgba(255,42,42,0.4)]"
            >
              GOT IT — LET'S GO
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
