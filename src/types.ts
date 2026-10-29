export type GameState = 'title' | 'count' | 'drive' | 'ramp' | 'air' | 'landed' | 'crashed' | 'results';

export interface RingData {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  collected: boolean;
}

export interface RunMetrics {
  reactionMs: number;
  rampSpeedMph: number;
  peakG: number;
  maxAltitudeFt: number;
  airtimeSec: number;
  flips: number;
  ringsCollected: number;
  totalRings: number;
  touchdownSpeedFtS: number;
  tiltAngleDeg: number;
  landedClean: boolean;
  score: number;
  crashReason: string;
}

export interface GameStatus {
  state: GameState;
  score: number;
  bestScore: number;
  isNewBest: boolean;
  speedMph: number;
  thrusterGas: number; // 0 to 1
  gForce: number;
  altitudeFt: number;
  flips: number;
  ringsCount: number;
  totalRings: number;
  countdownElapsed: number; // 0 to 4000 ms
  countdownLightStage: number; // 0, 1, 2, 3, 4 (4 is all green)
  isGreen: boolean;
  metrics: RunMetrics;
  tooEarly: boolean;
  soundEnabled: boolean;
}
