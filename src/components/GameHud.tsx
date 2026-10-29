import React, { useState } from 'react';
import { Volume2, VolumeX, ArrowLeft, ArrowRight } from 'lucide-react';
import { GameStatus } from '../types';
import { soundManager } from '../audio/soundManager';

interface GameHudProps {
  status: GameStatus;
  onStartRun: () => void;
  onLaunch: () => void;
  onSteer: (dir: number) => void;
  onThrust: (active: boolean) => void;
  onRestart: () => void;
}

export const GameHud: React.FC<GameHudProps> = ({
  status,
  onStartRun,
  onLaunch,
  onSteer,
  onThrust,
  onRestart,
}) => {
  const [soundOn, setSoundOn] = useState(soundManager.isEnabled());
  const [showPrivacy, setShowPrivacy] = useState(false);

  const toggleSound = () => {
    const updated = soundManager.toggle();
    setSoundOn(updated);
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

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* 1. TOP HUD BAR (Image 2 & 3) */}
      <div className="flex justify-between items-start w-full pointer-events-auto">
        {/* Top Left: Score & Best */}
        <div className="flex flex-col">
          <span className="text-[10px] sm:text-xs font-mono-tech tracking-[0.2em] text-[#8a9bb5]">
            SCORE
          </span>
          <div className="text-2xl sm:text-4xl font-condensed font-bold tracking-tight text-white leading-none mt-0.5">
            {status.score.toLocaleString('en-US')}
          </div>
          <span className="text-[10px] sm:text-xs font-mono-tech tracking-wider text-[#687b94] mt-1">
            BEST {status.bestScore.toLocaleString('en-US')}
          </span>
        </div>

        {/* Top Center: Speed MPH, Thruster Gas Bar, Flips & Rings */}
        <div className="flex flex-col items-center max-w-[260px] sm:max-w-[320px] w-full px-2">
          {/* Speed */}
          <div className="flex items-baseline gap-1">
            <span className="text-3xl sm:text-5xl font-condensed font-extrabold tracking-tight text-white">
              {status.speedMph}
            </span>
            <span className="text-xs sm:text-sm font-mono-tech text-[#8a9bb5]">mph</span>
          </div>

          {/* Thruster Gas Bar */}
          <div className="w-full mt-1.5 flex flex-col items-center">
            <div className="w-full h-1 sm:h-1.5 bg-[#192639] rounded-full overflow-hidden border border-[#2b3e58]">
              <div
                className="h-full bg-gradient-to-r from-[#71e7ff] to-white transition-all duration-75"
                style={{ width: `${Math.round(status.thrusterGas * 100)}%` }}
              />
            </div>
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8a9bb5] mt-1">
              THRUSTER GAS
            </span>
          </div>

          {/* Flips & Rings info when airborne */}
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

        {/* Top Right: Sound Button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleSound}
            title={soundOn ? 'Mute Sound' : 'Enable Sound'}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#0c1422]/85 border border-[#263c5a] hover:border-[#71e7ff] text-[#b8c9df] hover:text-[#71e7ff] flex items-center justify-center transition-all cursor-pointer shadow-lg"
          >
            {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} className="text-[#ef4444]" />}
          </button>
        </div>
      </div>

      {/* 2. CENTER DRAG-STRIP COUNTDOWN LIGHTS (Image 2) */}
      {isCountdown && (
        <div className="absolute top-[36%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center pointer-events-auto">
          {/* Dark Pill Capsule */}
          <div className="bg-[#080f1b]/90 border border-[#253952] rounded-full px-5 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.8)] backdrop-blur-sm flex items-center gap-4">
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

          {/* Subtext below lights */}
          <div className="mt-4 text-center">
            {status.isGreen ? (
              <span className="text-3xl sm:text-5xl font-orbitron font-extrabold tracking-widest text-white drop-shadow-[0_0_20px_rgba(52,211,153,0.8)] animate-pulse">
                GO!
              </span>
            ) : (
              <span className="text-xs sm:text-sm font-mono-tech tracking-[0.25em] text-[#93a7c3]">
                WAIT FOR GREEN
              </span>
            )}
          </div>
        </div>
      )}

      {/* TOO EARLY JUMP START TOAST */}
      {status.tooEarly && (
        <div className="absolute top-[28%] left-1/2 -translate-x-1/2 bg-[#3b1216] border border-[#ef4444] text-[#fca5a5] px-5 py-2.5 rounded text-xs sm:text-sm font-mono-tech tracking-wider shadow-[0_0_25px_rgba(239,68,68,0.4)] pointer-events-none animate-bounce">
          TOO EARLY — WAIT FOR GREEN!
        </div>
      )}

      {/* 3. BOTTOM CONTROLS & GAUGES (Images 2 & 3) */}
      <div className="w-full flex items-end justify-between pointer-events-auto">
        {/* Bottom Left: Circular G-Force Gauge */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="#0a121f"
                stroke="#1b293c"
                strokeWidth="4"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={status.gForce > 20 ? '#ff3b30' : '#71e7ff'}
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={gStrokeOffset}
                strokeLinecap="round"
                className="gauge-ring"
                style={{
                  filter: status.gForce > 20 ? 'drop-shadow(0 0 8px #ff3b30)' : undefined,
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

          {/* Touch / Click Flip Steer Controls */}
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
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#0d1626]/90 border border-[#2b415e] active:bg-[#1a2f4c] text-white flex items-center justify-center cursor-pointer shadow-lg"
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
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-lg bg-[#0d1626]/90 border border-[#2b415e] active:bg-[#1a2f4c] text-white flex items-center justify-center cursor-pointer shadow-lg"
              >
                <ArrowRight size={20} />
              </button>
            </div>
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#798ea8] mt-1">
              FLIP
            </span>
          </div>
        </div>

        {/* Bottom Center / Right: Big Red Circular GO / THRUST Button & Altitude Gauge */}
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Big Glowing Red Circular Button (GO / THRUST) */}
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
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center font-orbitron font-bold text-sm sm:text-base tracking-widest text-white transition-all cursor-pointer shadow-2xl ${
              isAir
                ? 'bg-[#1e1012]/90 border-2 border-[#ff3b30] hover:bg-[#381619] active:scale-95 shadow-[0_0_35px_rgba(255,59,48,0.7)]'
                : 'bg-[#1e1012]/90 border-2 border-[#ff3b30] hover:bg-[#381619] active:scale-95 shadow-[0_0_30px_rgba(255,59,48,0.6)]'
            }`}
          >
            {isAir ? 'THRUST' : 'GO'}
          </button>

          {/* Circular Altitude Gauge */}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex items-center justify-center">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="#0a121f"
                stroke="#1b293c"
                strokeWidth="4"
              />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke="#71e7ff"
                strokeWidth="4"
                strokeDasharray={circumference}
                strokeDashoffset={altStrokeOffset}
                strokeLinecap="round"
                className="gauge-ring"
                style={{
                  filter: status.altitudeFt > 50 ? 'drop-shadow(0 0 8px #71e7ff)' : undefined,
                }}
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
        </div>
      </div>

      {/* 4. TITLE / START RUN MODAL (Image 1: image_41b990cd.png) */}
      {isTitle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 pointer-events-auto">
          <div className="w-full max-w-[440px] bg-[#0c1017] border border-[#233347] rounded-lg p-6 sm:p-7 shadow-[0_20px_70px_rgba(0,0,0,0.9)] flex flex-col">
            {/* Top eyebrow */}
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8ea3bd] uppercase">
              3D · NIGHT RUN · WALL RAMP · COLD-GAS THRUSTERS
            </span>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl font-orbitron font-extrabold tracking-tight text-white leading-none mt-2 mb-3">
              ROADSTER
              <br />
              LOOP
            </h1>

            {/* Glowing Red Underline */}
            <div className="red-neon-bar w-full mb-4" />

            {/* Intro paragraph */}
            <p className="text-xs sm:text-sm text-[#b2c4dc] leading-relaxed mb-5">
              Hit the ramp flat out, flip off the curl at the top, then burn the thrusters to set it
              down on all four wheels.
            </p>

            {/* Instruction table */}
            <div className="flex flex-col gap-3.5 mb-6 text-xs sm:text-sm text-[#cbd9ea]">
              {/* Launch */}
              <div className="flex items-start gap-4">
                <span className="w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Launch</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  Go when the last light turns green. A quick reaction means more speed at the ramp.
                </p>
              </div>

              {/* Flip */}
              <div className="flex items-start gap-4">
                <span className="w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Flip</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  <span className="key-cap mr-1">←</span>
                  <span className="key-cap mr-1.5">→</span>
                  rotate the car. Every time it passes upside down counts as a flip.
                </p>
              </div>

              {/* Land */}
              <div className="flex items-start gap-4">
                <span className="w-16 font-mono-tech text-[#7d92ad] text-xs pt-0.5">Land</span>
                <p className="flex-1 text-[#b8c9df] leading-snug">
                  <span className="key-cap mr-1.5">Space</span>
                  fires the thrusters out of the floor. Get upright and slow the drop below 39 ft/s
                  before the wheels touch.
                </p>
              </div>
            </div>

            {/* Start Button */}
            <button
              type="button"
              onClick={onStartRun}
              className="w-full py-3.5 bg-[#ff3b30] hover:bg-[#ff4e44] active:scale-[0.98] text-white font-orbitron font-bold text-sm tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_25px_rgba(255,59,48,0.5)]"
            >
              START RUN
            </button>

            {/* Footer subtext */}
            <div className="mt-4 text-center">
              <p className="text-[10px] text-[#71869e] leading-relaxed">
                Fly through the light rings for points and a gas refill.
                <br />
                Unofficial fan game, not affiliated with Tesla.{' '}
                <button
                  type="button"
                  onClick={() => setShowPrivacy(true)}
                  className="text-[#71e7ff] underline hover:text-white cursor-pointer"
                >
                  Privacy
                </button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 5. RESULTS / WIPEOUT / VICTORY MODAL (Image 4: image_2383f6ac.png) */}
      {isResults && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto">
          <div className="w-full max-w-[420px] bg-[#0b111a] border border-[#24374e] rounded-lg p-5 sm:p-6 shadow-[0_20px_80px_rgba(0,0,0,0.95)] flex flex-col">
            {/* Top kicker */}
            <span className="text-[9px] sm:text-[10px] font-mono-tech tracking-[0.2em] text-[#8da3bd] uppercase">
              {status.metrics.landedClean ? 'TOUCHDOWN' : 'CRASHED'}
            </span>

            {/* Title */}
            <h2 className="text-3xl sm:text-4xl font-orbitron font-extrabold tracking-tight text-white mt-1 mb-2">
              {status.metrics.landedClean ? 'CLEAN FLIGHT' : 'WIPEOUT'}
            </h2>

            {/* Red Underline */}
            <div className="red-neon-bar w-full mb-4" />

            {/* Score header */}
            <div className="flex flex-col mb-3">
              <span className="text-[9px] font-mono-tech tracking-[0.2em] text-[#869ab4]">SCORE</span>
              <div className="flex items-center gap-3">
                <span className="text-3xl sm:text-4xl font-condensed font-extrabold text-white">
                  {status.metrics.score.toLocaleString('en-US')}
                </span>
                {status.isNewBest && (
                  <span className="bg-[#ff3b30] text-white text-[9px] font-orbitron font-bold px-2 py-0.5 rounded tracking-wider">
                    NEW BEST
                  </span>
                )}
                <span className="text-xs font-mono-tech text-[#869ab4] ml-auto">
                  BEST {status.bestScore.toLocaleString('en-US')}
                </span>
              </div>
            </div>

            {/* Explanation paragraph */}
            <p className="text-xs text-[#a9bccf] leading-relaxed mb-4">
              {status.metrics.landedClean
                ? 'All four wheels touched down clean! Soft landing bonus awarded. Flips, airtime, and altitude banked.'
                : status.metrics.crashReason}
            </p>

            {/* 8-Metric Grid (2 columns x 4 rows) */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 py-3 border-t border-b border-[#21344a] text-xs font-mono-tech mb-5">
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

            {/* Red Action Button */}
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-3 bg-[#ff3b30] hover:bg-[#ff4e44] active:scale-[0.98] text-white font-orbitron font-bold text-xs sm:text-sm tracking-widest uppercase rounded cursor-pointer transition-all shadow-[0_0_25px_rgba(255,59,48,0.5)]"
            >
              RUN IT AGAIN
            </button>

            <span className="text-[9px] font-mono-tech text-[#71869e] text-center mt-2.5">
              Space or Enter restarts
            </span>
          </div>
        </div>
      )}

      {/* 6. PRIVACY POLICY MODAL */}
      {showPrivacy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
          <div className="w-full max-w-[500px] bg-[#0c121d] border border-[#2b415e] rounded-lg p-6 shadow-2xl text-xs sm:text-sm text-[#b8cae0] flex flex-col max-h-[85vh] overflow-y-auto">
            <h2 className="text-xl font-orbitron font-bold text-white mb-2">Privacy Policy</h2>
            <div className="red-neon-bar w-full mb-4" />
            <p className="mb-3">
              Roadster Loop is a client-side 3D fan game. It does not collect, sell, or transmit any
              personal data to external servers.
            </p>
            <h3 className="font-bold text-white mb-1">Local Storage</h3>
            <p className="mb-3">
              Your highest score and sound preferences are stored locally in your browser using{' '}
              <code className="text-[#71e7ff]">localStorage</code> for convenience. You can reset
              this at any time by clearing your browser cache.
            </p>
            <p className="text-[10px] text-[#71869e] mb-4">
              This is an unofficial fan prototype created for entertainment and is not affiliated
              with Tesla.
            </p>
            <button
              type="button"
              onClick={() => setShowPrivacy(false)}
              className="self-end px-5 py-2 bg-[#ff3b30] text-white font-orbitron text-xs font-bold rounded cursor-pointer hover:bg-[#ff4e44]"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
