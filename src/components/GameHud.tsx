import React, { useState } from 'react';
import {
  Volume2,
  VolumeX,
  Pause,
  Play,
  Share2,
  Settings,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Sparkles,
  Award,
  Camera,
  Download,
} from 'lucide-react';
import { CameraMode, CarColor, GameStatus, GraphicsQuality } from '../types';
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
  onSetCameraMode: (mode: CameraMode) => void;
  onExportFlightReport: () => Promise<void> | void;
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
  onSetCameraMode,
  onExportFlightReport,
  onOpenPrivacy,
}) => {
  const [soundOn, setSoundOn] = useState(soundManager.isEnabled());
  const [showMenu, setShowMenu] = useState(false);
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

  const handleExportFlightReport = async () => {
    setIsSharing(true);
    try {
      await onExportFlightReport();
    } catch (error) {
      console.error('[Roadster] Flight report export failed:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const isAir = status.state === 'air';
  const isCountdown = status.state === 'count';
  const isTitle = status.state === 'title';
  const isResults = status.state === 'results';

  // Circular gauge calculations (real units: g ranges 0..6, alt ranges 0..180)
  const gRatio = Math.min(Math.max(status.gForce / 6.0, 0), 1);
  const altRatio = Math.min(Math.max(status.altitudeFt / 180, 0), 1);

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

      // Radial glowing gradient
      const grad = ctx.createRadialGradient(400, 200, 40, 400, 200, 420);
      grad.addColorStop(0, 'rgba(255, 42, 42, 0.28)');
      grad.addColorStop(1, 'rgba(5, 8, 17, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 800, 800);

      // Outer border line
      ctx.strokeStyle = '#223044';
      ctx.lineWidth = 4;
      ctx.strokeRect(32, 32, 736, 736);

      // Title
      ctx.fillStyle = '#ff2a2a';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('ROADSTER LOOP — NIGHT RUN', 60, 90);

      ctx.fillStyle = status.metrics.landedClean ? '#34d399' : '#ff2a2a';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(status.metrics.landedClean ? 'CLEAN LANDING' : 'WIPEOUT', 60, 150);

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

      // 6 Key metrics
      const grid = [
        { label: 'REACTION', val: `${(status.metrics.reactionMs / 1000).toFixed(3)} s` },
        { label: 'RAMP SPEED', val: `${status.metrics.rampSpeedMph} mph` },
        { label: 'PEAK G', val: `${status.metrics.peakG.toFixed(1)} g` },
        { label: 'MAX ALTITUDE', val: `${status.metrics.maxAltitudeFt} ft` },
        { label: 'AIRTIME', val: `${status.metrics.airtimeSec.toFixed(1)} s` },
        { label: 'RINGS', val: `${status.metrics.ringsCollected} / 3` },
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
    <div className="absolute inset-0 pointer-events-none select-none z-10 flex min-h-0 flex-col justify-between pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] px-2 sm:px-5 md:px-6">
      {/* Red flash/vignette on crash impact (lasts 0.15s) */}
      {status.state === 'crashed' && status.crashFlash && (
        <div className="fixed inset-0 pointer-events-none z-40 bg-[radial-gradient(circle_at_center,rgba(255,42,42,0.10)_0%,rgba(255,42,42,0.32)_100%)] transition-opacity duration-150" />
      )}

      {/* 1. TOP HUD BAR (Matching Screenshot 2 & 3, fully responsive at 360px) */}
      <div className="flex justify-between items-start gap-1.5 sm:gap-3 w-full pointer-events-auto">
        {/* Top Left: Large SCORE number (~28px) & BEST small under it */}
        <div className="flex flex-col shrink-0 min-w-[70px]">
          <span className="text-[10px] font-mono-tech tracking-[0.2em] text-[#8a9bb5]">
            SCORE
          </span>
          <div className="text-[24px] sm:text-3xl font-condensed font-bold tracking-tight text-white leading-none mt-0.5 drop-shadow">
            {status.score.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] sm:text-[11px] font-mono-tech tracking-wider text-[#687b94] mt-1">
            BEST {status.bestScore.toLocaleString('en-US')}
          </span>
        </div>

        {/* Top Center: Speed MPH, Thin Pale White-Blue Thruster Gas Bar, Flips & Rings */}
        <div className="flex flex-col items-center max-w-[144px] sm:max-w-[240px] md:max-w-[300px] w-full min-w-0 px-1">
          {/* Speed in MPH (horizontal speed only!) */}
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-5xl font-condensed font-extrabold tracking-tight text-white leading-none">
              {status.speedMph}
            </span>
            <span className="text-[10px] sm:text-xs font-mono-tech text-[#8a9bb5]">mph</span>
          </div>

          {/* Thin pale white-blue Thruster Gas Bar */}
          <div className="w-full mt-1.5 flex flex-col items-center">
            <div className="w-full h-1 sm:h-1.5 bg-[#121a26] rounded-full overflow-hidden border border-[#233346]">
              <div
                className="h-full bg-gradient-to-r from-white to-[#cbd8e8] transition-all duration-75"
                style={{ width: `${Math.round(status.thrusterGas * 100)}%` }}
              />
            </div>
            <span className="text-[8px] sm:text-[9px] font-mono-tech tracking-[0.2em] text-[#8a9bb5] mt-0.5">
              THRUSTER GAS
            </span>
          </div>

          {/* Flips & Rings Counters when launched, airborne, crashing or landed (~14px) */}
          {(isAir || status.state === 'drive' || status.state === 'ramp' || status.state === 'crashed' || status.state === 'landed') && (
            <div className="flex justify-between w-full mt-1 text-[13px] sm:text-sm font-mono-tech text-[#dbe8fa] tracking-wider px-2">
              <div className="flex flex-col items-center">
                <span className="text-[#8a9bb5] text-[8px] tracking-wider">FLIPS</span>
                <span className="font-bold text-[13px] sm:text-sm">{status.flips}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[#8a9bb5] text-[8px] tracking-wider">RINGS</span>
                <span className="font-bold text-[13px] sm:text-sm">
                  {status.ringsCount} / {status.totalRings}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top Right: Only a small sound icon plus one '⋯' menu button */}
        <div className="flex items-center gap-1.5 shrink-0 relative">
          <button
            type="button"
            onClick={toggleSound}
            title={soundOn ? 'Mute Sound' : 'Enable Sound'}
            aria-label={soundOn ? 'Mute Sound' : 'Enable Sound'}
            className="w-8 h-8 rounded-full bg-[#0c121d]/90 border border-[#253952] hover:border-[#ff2a2a] text-[#b8c9df] hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
          >
            {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} className="text-[#ff2a2a]" />}
          </button>

          <button
            type="button"
            onClick={() => setShowMenu((prev) => !prev)}
            title="Options Menu"
            aria-label="Menu"
            className="w-8 h-8 rounded-full bg-[#0c121d]/90 border border-[#253952] hover:border-[#ff2a2a] text-[#b8c9df] hover:text-white flex items-center justify-center transition-all cursor-pointer shadow-md"
          >
            <MoreHorizontal size={18} />
          </button>

          {/* Clean glass dropdown menu */}
          {showMenu && (
            <div className="absolute right-0 top-10 w-44 bg-[#0a101a]/95 border border-[#253952] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.85)] p-2 z-50 flex flex-col gap-1 backdrop-blur-md">
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onTogglePause();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono-tech text-white hover:bg-[#1a2536] rounded-lg transition-colors text-left"
              >
                {isPaused ? <Play size={14} className="text-[#34d399]" /> : <Pause size={14} className="text-[#cbd9ea]" />}
                <span>{isPaused ? 'Resume Run' : 'Pause Game'}</span>
              </button>
              <div className="border-y border-[#253952] py-2 my-1">
                <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[9px] font-mono-tech tracking-[0.18em] text-[#7890aa]">
                  <Camera size={11} /> CAMERA VIEW
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {([
                    ['chase', 'CHASE'],
                    ['mounted', 'MOUNTED'],
                    ['roof', 'ROOF'],
                    ['drone', 'DRONE'],
                  ] as [CameraMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        onSetCameraMode(mode);
                        setShowMenu(false);
                      }}
                      aria-pressed={(status.cameraMode ?? 'chase') === mode}
                      className={`px-2 py-2 rounded-lg text-[9px] font-mono-tech tracking-wider transition-colors ${(status.cameraMode ?? 'chase') === mode ? 'bg-[#eaf2fb] text-[#07101d] font-bold' : 'text-[#aabbd0] hover:bg-[#1a2536]'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowTutorial(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono-tech text-white hover:bg-[#1a2536] rounded-lg transition-colors text-left"
              >
                <HelpCircle size={14} className="text-[#cbd9ea]" />
                <span>How to Play</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  setShowSettings(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono-tech text-white hover:bg-[#1a2536] rounded-lg transition-colors text-left"
              >
                <Settings size={14} className="text-[#cbd9ea]" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMenu(false);
                  onRestart();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono-tech text-[#ff5454] hover:bg-[#2b1014] rounded-lg transition-colors text-left"
              >
                <Sparkles size={14} />
                <span>Restart Run</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. CENTER DRAG-STRIP COUNTDOWN LIGHTS (Matching Frame 2 & 3) */}
      {isCountdown && (
        <div className="absolute top-[30%] sm:top-[32%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto">
          {/* Dark Pill Capsule */}
          <div className="bg-[#080f1b]/95 border border-[#253952] rounded-full px-4 sm:px-5 py-2.5 sm:py-3 shadow-[0_10px_35px_rgba(0,0,0,0.85)] backdrop-blur-sm flex items-center gap-3 sm:gap-4">
            {[1, 2, 3, 4].map((stageNum) => {
              const isAllGreen = status.isGreen;
              const isRedOn = !status.isGreen && status.countdownLightStage >= stageNum;

              return (
                <div
                  key={stageNum}
                  className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full transition-all duration-100 ${
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

          {/* Subtext below lights: "TAP GO ON GREEN", then "GO" in small faint wide-spaced text */}
          <div className="mt-3 text-center">
            {status.isGreen ? (
              <span className="text-xs sm:text-sm font-mono-tech font-bold tracking-[0.35em] text-white/80">
                GO
              </span>
            ) : (
              <span className="text-xs sm:text-sm font-mono-tech tracking-[0.25em] text-[#cbd9ea] font-semibold">
                TAP GO ON GREEN
              </span>
            )}
          </div>
        </div>
      )}

      {/* LAUNCH REACTION NOTICE BANNER: faint, wide-spaced, ~60% opacity */}
      {status.launchNotice && (
        <div className="absolute top-[22%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none opacity-60 z-20">
          <span className="text-lg sm:text-xl font-mono-tech font-bold tracking-[0.3em] text-white">
            LAUNCH
          </span>
          <span className="text-[10px] sm:text-xs font-mono-tech tracking-[0.2em] text-[#cbd9ea] mt-0.5">
            Reaction {status.launchNotice.reactionSec.toFixed(3)} s
          </span>
        </div>
      )}

      {/* FLIP STUNT POPUP BANNER: smaller, faint white text (~60% opacity), never covering car or rings */}
      {status.flipNotice && (
        <div className="absolute top-[18%] left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none opacity-60 transition-opacity z-20">
          <span className="text-sm sm:text-base font-mono-tech tracking-[0.3em] text-white font-bold">
            FLIP
          </span>
          <span className="text-[10px] sm:text-xs font-mono-tech tracking-wider text-white/80 mt-0.5">
            +1,500 on landing
          </span>
        </div>
      )}

      {/* CAMERA MODE CHANGE TOAST: subtle, sleek monospace toast badge */}
      {status.cameraNotice && (
        <div className="absolute top-[13%] left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1 bg-[#0b1019]/85 border border-[#2a3c54]/80 rounded-full backdrop-blur-md pointer-events-none opacity-90 transition-opacity z-20 shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span className="text-[11px] sm:text-xs font-mono-tech tracking-[0.25em] text-[#dbe8fa] uppercase font-bold">
            {status.cameraNotice.modeName}
          </span>
        </div>
      )}

      {/* TOO EARLY JUMP START TOAST */}
      {status.tooEarly && (
        <div className="absolute top-[24%] left-1/2 -translate-x-1/2 bg-[#3b1216] border border-[#ff2a2a] text-[#fca5a5] px-4 py-2 rounded text-xs sm:text-sm font-mono-tech tracking-wider shadow-[0_0_25px_rgba(255,42,42,0.5)] pointer-events-none animate-bounce z-30">
          TOO EARLY — WAIT FOR GREEN!
        </div>
      )}

      {/* CRASH RED VIGNETTE FLASH */}
      {status.state === 'crashed' && (
        <div className="fixed inset-0 pointer-events-none z-30 bg-radial from-transparent via-[#ff2a2a]/15 to-[#ff2a2a]/35 animate-pulse" />
      )}

      {/* 3. BOTTOM CONTROLS & CIRCULAR GAUGES (Exact match to Reference Frames 2, 3, 7, 8) */}
      <div className="w-full flex items-end justify-between gap-2 pointer-events-auto pb-1 px-0.5 sm:px-1">
        {/* Bottom Left Column: Flip Buttons above G-Force Gauge */}
        <div className="flex flex-col items-center gap-1 sm:gap-2 shrink-0">
          {/* Flip Steer Controls */}
          <div className="flex flex-col items-center">
            <div className="flex gap-2">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (status.state === 'crashed' || status.state === 'landed') return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  onSteer(-1);
                }}
                onPointerUp={() => onSteer(0)}
                onPointerCancel={() => onSteer(0)}
                onLostPointerCapture={() => onSteer(0)}
                onPointerLeave={() => onSteer(0)}
                aria-label="Rotate car left"
                className="w-[clamp(3.25rem,16vw,5rem)] h-[clamp(3.25rem,16vw,5rem)] rounded-xl sm:rounded-2xl bg-[#0c1422]/90 border border-[#253952] active:bg-[#1a2f4c] text-white flex items-center justify-center cursor-pointer shadow-lg transition-transform active:scale-95 shrink-0 touch-none"
              >
                <ChevronLeft size={32} strokeWidth={2.5} />
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  if (status.state === 'crashed' || status.state === 'landed') return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  onSteer(1);
                }}
                onPointerUp={() => onSteer(0)}
                onPointerCancel={() => onSteer(0)}
                onLostPointerCapture={() => onSteer(0)}
                onPointerLeave={() => onSteer(0)}
                aria-label="Rotate car right"
                className="w-[clamp(3.25rem,16vw,5rem)] h-[clamp(3.25rem,16vw,5rem)] rounded-xl sm:rounded-2xl bg-[#0c1422]/90 border border-[#253952] active:bg-[#1a2f4c] text-white flex items-center justify-center cursor-pointer shadow-lg transition-transform active:scale-95 shrink-0 touch-none"
              >
                <ChevronRight size={32} strokeWidth={2.5} />
              </button>
            </div>
            <span className="text-[10px] font-mono-tech tracking-[0.25em] text-[#798ea8] mt-1.5">
              FLIP
            </span>
          </div>

          {/* Current G-Force Gauge (~64 px round gauge at left edge) */}
          <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="#080e18"
                stroke={status.gForce >= 3.5 ? '#ff2a2a' : '#172232'}
                strokeWidth={status.gForce >= 3.5 ? '4' : '3'}
                style={{
                  filter: status.gForce >= 3.5 ? 'drop-shadow(0 0 10px #ff2a2a)' : undefined,
                }}
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={status.gForce >= 3.5 ? '#ff2a2a' : '#cbd7e6'}
                strokeWidth={status.gForce >= 3.5 ? '5' : '4'}
                strokeDasharray={circumference}
                strokeDashoffset={status.gForce >= 3.5 ? 0 : gStrokeOffset}
                strokeLinecap="round"
                className="gauge-ring"
                style={{
                  filter: status.gForce >= 3.5 ? 'drop-shadow(0 0 10px #ff2a2a)' : undefined,
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-[7px] sm:text-[8px] font-mono-tech tracking-wider text-[#798ea8]">
                G-FORCE
              </span>
              <span
                className={`text-sm sm:text-base font-condensed font-bold leading-none my-0.5 ${
                  status.gForce >= 3.5 ? 'text-[#ff2a2a]' : 'text-white'
                }`}
              >
                {status.gForce.toFixed(1)}
              </span>
              <span className="text-[7px] sm:text-[8px] font-mono-tech text-[#798ea8]">g</span>
            </div>
          </div>
        </div>

        {/* Bottom Right Column: Big Round Red Action Circle (~120 px) above Altitude Gauge (~64 px) */}
        <div className="flex flex-col items-center gap-1 sm:gap-2 shrink-0">
          {/* Action Circle: ~120px diameter, thin red ring, translucent red fill */}
          <button
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              if (status.state === 'crashed' || status.state === 'landed') return;
              e.currentTarget.setPointerCapture(e.pointerId);
              if (isAir) {
                onThrust(true);
              } else {
                onLaunch();
              }
            }}
            onPointerUp={() => {
              if (isAir) onThrust(false);
            }}
            onPointerCancel={() => {
              if (isAir) onThrust(false);
            }}
            onLostPointerCapture={() => {
              if (isAir) onThrust(false);
            }}
            onPointerLeave={() => {
              if (isAir) onThrust(false);
            }}
            className="w-[clamp(5rem,23vw,7.5rem)] h-[clamp(5rem,23vw,7.5rem)] sm:w-[120px] sm:h-[120px] rounded-full flex items-center justify-center font-orbitron font-bold text-xs sm:text-base tracking-widest text-white transition-all cursor-pointer active:scale-95 shrink-0 touch-none bg-[#ff2a2a]/20 border-2 border-[#ff2a2a] shadow-[0_0_28px_rgba(255,42,42,0.65)] hover:shadow-[0_0_36px_rgba(255,42,42,0.85)]"
          >
            {status.actionButtonText}
          </button>

          {/* Altitude Gauge (~64 px) with SINK xx FT/S text underneath, fully visible */}
          <div className="flex flex-col items-center">
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center shrink-0">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="#080e18"
                  stroke="#172232"
                  strokeWidth="3"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={status.altitudeFt > 40 ? '#ff2a2a' : '#cbd7e6'}
                  strokeWidth="4"
                  strokeDasharray={circumference}
                  strokeDashoffset={altStrokeOffset}
                  strokeLinecap="round"
                  className="gauge-ring"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-[7px] sm:text-[8px] font-mono-tech tracking-wider text-[#798ea8]">
                  ALTITUDE
                </span>
                <span className="text-sm sm:text-base font-condensed font-bold text-white leading-none my-0.5">
                  {status.altitudeFt}
                </span>
                <span className="text-[7px] sm:text-[8px] font-mono-tech text-[#798ea8]">ft</span>
              </div>
            </div>

            {/* SINK xx FT/S text under ALTITUDE gauge, fully visible */}
            {status.sinkSpeedFtS > 0 && (
              <span
                className={`text-[9px] sm:text-[10px] font-mono-tech font-bold mt-1 tracking-wider ${
                  status.sinkSpeedFtS > 39
                    ? 'text-[#ff2a2a] drop-shadow-[0_0_8px_rgba(255,42,42,0.9)]'
                    : 'text-[#34d399]'
                }`}
              >
                SINK {status.sinkSpeedFtS} FT/S
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. TITLE / START RUN MODAL (Exact match to Reference Screenshot 1 & rule 9) */}
      {isTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 pointer-events-auto">
          <div className="w-full max-w-[400px] bg-[#0c1017]/95 border border-[#233347] rounded-lg p-5 sm:p-6 shadow-[0_20px_70px_rgba(0,0,0,0.9)] flex flex-col backdrop-blur-md">
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8ea3bd] uppercase">
              3D · NIGHT RUN · WALL RAMP · COLD-GAS THRUSTERS
            </span>

            <h1 className="text-4xl sm:text-5xl font-orbitron font-extrabold tracking-tight text-white leading-none mt-2 mb-3">
              ROADSTER
              <br />
              LOOP
            </h1>

            <div className="red-neon-bar w-full mb-3.5" />

            <p className="text-xs sm:text-sm text-[#b2c4dc] leading-relaxed mb-4">
              Hit the ramp flat out, flip off the curl at the top, then hold the thrusters as the car
              settles onto the runway.
            </p>

            <div className="flex flex-col gap-3 mb-5 text-xs sm:text-sm text-[#cbd9ea]">
              <div className="flex items-start gap-3 sm:gap-4">
                <span className="w-14 sm:w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Launch</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  Go when the last light turns green. A quick reaction means more speed at the ramp.
                </p>
              </div>

              <div className="flex items-start gap-3 sm:gap-4">
                <span className="w-14 sm:w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Flip</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  <span className="key-cap mr-1">←</span>
                  <span className="key-cap mr-1.5">→</span>
                  rotate the car. Every time it passes upside down counts as a flip.
                </p>
              </div>

              <div className="flex items-start gap-3 sm:gap-4">
                <span className="w-14 sm:w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Land</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  <span className="key-cap mr-1.5">Space</span>
                  fires the thrusters out of the floor. Hold thrust to keep the car stable and level as
                  the wheels make contact.
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
                  Privacy.
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. RESULTS / WIPEOUT / VICTORY MODAL (Exact match to Reference Screenshot 4 & rule 2/9) */}
      {isResults && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto overscroll-contain bg-black/75 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pointer-events-auto">
          <div className="my-auto w-full max-w-[380px] sm:max-w-[410px] max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem)] overflow-y-auto overscroll-contain bg-[#0b1018]/95 border border-[#24354a] rounded-lg p-3 sm:p-5 shadow-[0_20px_80px_rgba(0,0,0,0.95)] flex flex-col backdrop-blur-md">
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8da3bd] uppercase">
              {status.metrics.landedClean ? 'TOUCHDOWN' : 'CRASHED'}
            </span>

            <h2 className="text-3xl sm:text-4xl font-orbitron font-extrabold tracking-tight text-white mt-1 mb-2">
              {status.metrics.landedClean ? 'CLEAN LANDING' : 'WIPEOUT'}
            </h2>

            <div className="red-neon-bar w-full mb-3" />

            <div className="flex flex-col mb-2">
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

            <div
              role="status"
              aria-live="polite"
              className={`mb-3 rounded-md border px-3 py-2.5 ${
                status.metrics.landedClean
                  ? 'border-emerald-400/35 bg-emerald-400/[0.07]'
                  : 'border-[#ff5454]/40 bg-[#ff2a2a]/[0.07]'
              }`}
            >
              <span
                className={`block text-[9px] font-mono-tech tracking-[0.18em] uppercase ${
                  status.metrics.landedClean ? 'text-emerald-300' : 'text-[#ff8a8a]'
                }`}
              >
                {status.metrics.landedClean ? 'TOUCHDOWN VERIFIED' : 'WHY THE RUN ENDED'}
              </span>
              <p className="mt-1 text-xs leading-relaxed text-[#d5e0ed] break-words">
                {status.metrics.landedClean
                  ? `Wheel contact was solid. Keep the car upright and the thrusters burning as you settle in.`
                  : status.metrics.crashReason || 'Landing criteria were not met.'}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/10 pt-2 text-[9px] font-mono-tech tracking-wider">
                <span className="text-[#8297b2]">TOUCHDOWN SINK SPEED</span>
                <span className={`font-bold ${
                  status.metrics.touchdownSpeedFtS <= 72 ? 'text-emerald-300' : 'text-[#ff8a8a]'
                }`}>
                  {status.metrics.touchdownSpeedFtS} FT/S
                  <span className="ml-1 font-normal text-[#8297b2]">/ TARGET ≤72</span>
                </span>
              </div>
            </div>

            {/* 8-Metric Grid matching Screenshot 4 */}
            <div className="grid grid-cols-2 border border-[#1f2f42] divide-x divide-y divide-[#1f2f42] text-xs font-mono-tech mb-3 bg-[#080d16]/60">
              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">REACTION</span>
                <span className="text-sm sm:text-base font-semibold text-white">
                  {(status.metrics.reactionMs / 1000).toFixed(3)}<span className="text-xs text-[#8da3bd] ml-0.5">s</span>
                </span>
              </div>
              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">RAMP SPEED</span>
                <span className="text-sm sm:text-base font-semibold text-white">
                  {status.metrics.rampSpeedMph} <span className="text-xs text-[#8da3bd]">mph</span>
                </span>
              </div>

              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">PEAK G</span>
                <span className="text-sm sm:text-base font-semibold text-white">
                  {status.metrics.peakG.toFixed(1)} <span className="text-xs text-[#8da3bd]">g</span>
                </span>
              </div>
              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">MAX ALTITUDE</span>
                <span className="text-sm sm:text-base font-semibold text-white">
                  {status.metrics.maxAltitudeFt} <span className="text-xs text-[#8da3bd]">ft</span>
                </span>
              </div>

              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">AIRTIME</span>
                <span className="text-sm sm:text-base font-semibold text-white">
                  {status.metrics.airtimeSec.toFixed(1)}<span className="text-xs text-[#8da3bd] ml-0.5">s</span>
                </span>
              </div>
              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">FLIPS</span>
                <span className="text-sm sm:text-base font-semibold text-white">{status.metrics.flips}</span>
              </div>

              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">RINGS</span>
                <span className="text-sm sm:text-base font-semibold text-white">
                  {status.metrics.ringsCollected} / {status.metrics.totalRings}
                </span>
              </div>
              <div className="p-2.5 sm:p-3">
                <span className="text-[9px] tracking-wider text-[#768da6] block uppercase">TOUCHDOWN</span>
                <span className="text-sm sm:text-base font-semibold text-white">
                  {status.metrics.touchdownSpeedFtS} <span className="text-xs text-[#8da3bd]">ft/s</span>
                </span>
              </div>
            </div>

            {/* Expandable Score Breakdown */}
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
                    <span>Flips ({status.metrics.flips}x1500):</span>
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
                onClick={handleExportFlightReport}
                disabled={isSharing}
                className="w-full py-2 bg-[#132237] hover:bg-[#1a3048] border border-[#2b4965] hover:border-[#70c8ee] text-[#d8eafa] hover:text-white font-mono-tech text-xs tracking-wider uppercase rounded flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-60"
              >
                <Download size={13} className="text-cyan-300" />
                {isSharing ? 'Generating...' : 'EXPORT FLIGHT REPORT'}
              </button>

              <button
                type="button"
                onClick={handleShareScore}
                disabled={isSharing}
                className="w-full py-2 bg-[#121c2b] hover:bg-[#1a293d] border border-[#2b3e58] hover:border-[#ff2a2a] text-[#c3d5eb] hover:text-white font-mono-tech text-xs tracking-wider uppercase rounded flex items-center justify-center gap-2 cursor-pointer transition-all"
              >
                <Share2 size={13} className="text-[#ff3880]" />
                {isSharing ? 'Generating...' : 'SHARE SCORE'}
              </button>
            </div>

            <span className="text-[9px] font-mono-tech text-[#71869e] text-center mt-2">
              Space or Enter restarts
            </span>
          </div>
        </div>
      )}

      {/* 6. PAUSE OVERLAY */}
      {isPaused && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 pointer-events-auto backdrop-blur-sm">
          <div className="w-full max-w-[320px] bg-[#0c121d] border border-[#253952] rounded-lg p-5 shadow-2xl flex flex-col items-center text-center">
            <h2 className="text-2xl font-orbitron font-extrabold text-white tracking-widest mb-1">
              PAUSED
            </h2>
            <div className="red-neon-bar w-20 mb-5" />

            <div className="flex flex-col gap-2.5 w-full">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-2.5 bg-[#ff2a2a] hover:bg-[#ff3b3b] text-white font-orbitron font-bold text-xs tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_20px_rgba(255,42,42,0.4)]"
              >
                RESUME
              </button>

              <button
                type="button"
                onClick={() => {
                  onTogglePause();
                  onRestart();
                }}
                className="w-full py-2 bg-[#141e2e] hover:bg-[#1c2a40] border border-[#2a3e59] text-white font-mono-tech text-xs tracking-wider uppercase rounded cursor-pointer transition-all"
              >
                RESTART RUN
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. SETTINGS MODAL: Car Color & Graphics Quality */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto backdrop-blur-sm">
          <div className="w-full max-w-[360px] bg-[#0c121d] border border-[#253952] rounded-lg p-5 shadow-2xl flex flex-col">
            <h2 className="text-base font-orbitron font-bold text-white mb-1">SETTINGS</h2>
            <div className="red-neon-bar w-full mb-3.5" />

            {/* Select Car Color */}
            <div className="mb-4">
              <label className="text-[11px] font-mono-tech tracking-wider text-[#8a9bb5] block mb-2">
                ROADSTER COLOR
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'silver' as CarColor, label: 'Silver Frost', hex: '#dce5f2' },
                  { id: 'red' as CarColor, label: 'Cyber Red', hex: '#d81f2a' },
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
                    <span className="text-[9px] font-mono-tech text-white leading-tight text-center">
                      {c.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Graphics Quality */}
            <div className="mb-4">
              <label className="text-[11px] font-mono-tech tracking-wider text-[#8a9bb5] block mb-2">
                GRAPHICS QUALITY
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSelectGraphicsQuality('high')}
                  className={`py-2 px-1.5 rounded border text-[11px] font-mono-tech cursor-pointer transition-all ${
                    graphicsQuality === 'high'
                      ? 'border-[#ff2a2a] bg-[#1f151c] text-white font-bold'
                      : 'border-[#26374d] bg-[#0e1624] text-[#8a9bb5] hover:text-white'
                  }`}
                >
                  HIGH (CINEMATIC MODE)
                </button>
                <button
                  type="button"
                  onClick={() => onSelectGraphicsQuality('low')}
                  className={`py-2 px-1.5 rounded border text-[11px] font-mono-tech cursor-pointer transition-all ${
                    graphicsQuality === 'low'
                      ? 'border-[#ff2a2a] bg-[#1f151c] text-white font-bold'
                      : 'border-[#26374d] bg-[#0e1624] text-[#8a9bb5] hover:text-white'
                  }`}
                >
                  LOW (PERFORMANCE MODE)
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

      {/* 8. FIRST-RUN TUTORIAL OVERLAY */}
      {showTutorial && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-4 pointer-events-auto backdrop-blur-sm">
          <div className="w-full max-w-[380px] bg-[#0b1018] border border-[#283b52] rounded-lg p-5 shadow-2xl flex flex-col">
            <div className="flex items-center gap-2 text-[#ff3880] text-xs font-mono-tech uppercase mb-1">
              <Award size={15} /> HOW TO PLAY
            </div>
            <h2 className="text-2xl font-orbitron font-extrabold text-white mb-1.5">
              ROADSTER LOOP
            </h2>
            <div className="red-neon-bar w-full mb-3.5" />

            <div className="flex flex-col gap-3 text-xs text-[#cbd9ea] mb-4">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1e1014] border border-[#ff2a2a] text-[#ff2a2a] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <b className="text-white block font-mono-tech">LAUNCH ON GREEN</b>
                  <p className="text-[#9cb0c9] mt-0.5 leading-relaxed text-[11px]">
                    Watch the 4 start lights. Tap <b>GO</b> or press <b>Space</b> right when green turns on. Faster reaction awards higher launch velocity.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1e1014] border border-[#ff2a2a] text-[#ff2a2a] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <b className="text-white block font-mono-tech">FLIP OFF THE WALL</b>
                  <p className="text-[#9cb0c9] mt-0.5 leading-relaxed text-[11px]">
                    Use <b>← / →</b> or <b>A / D</b> to rotate. Each full 360° flip scores points on landing. Fly through the pink rings for gas refills!
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-[#1e1014] border border-[#ff2a2a] text-[#ff2a2a] flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <b className="text-white block font-mono-tech">LAND WHEELS DOWN</b>
                  <p className="text-[#9cb0c9] mt-0.5 leading-relaxed text-[11px]">
                    Hold <b>THRUST</b> or <b>Space</b> to fire the floor jets. Aim for a stable, upright touchdown and keep the car from hitting the roof or body before the wheels settle.
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={closeTutorial}
              className="w-full py-2.5 bg-[#ff2a2a] hover:bg-[#ff3b3b] text-white font-orbitron font-bold text-xs tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_20px_rgba(255,42,42,0.4)]"
            >
              GOT IT — LET'S GO
            </button>
          </div>
        </div>
      )}
    </div>
  );
};