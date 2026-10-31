export type GameState = 'title' | 'count' | 'drive' | 'ramp' | 'air' | 'landed' | 'crashed' | 'results';

export type CarColor = 'silver' | 'red' | 'black';
export type GraphicsQuality = 'high' | 'low';

export interface RingData {
  id: number;
  x: number;
  y: number;
  z: number;
  radius: number;
  collected: boolean;
}

export interface ScoreBreakdown {
  ringsScore: number;
  flipsScore: number;
  airtimeScore: number;
  altScore: number;
  landingBonus: number;
  total: number;
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
  breakdown: ScoreBreakdown;
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
  sinkSpeedFtS: number;
  flips: number;
  ringsCount: number;
  totalRings: number;
  countdownElapsed: number;
  countdownLightStage: number; // 0, 1, 2, 3, 4 (4 is all green)
  isGreen: boolean;
  tooEarly: boolean;
  soundEnabled: boolean;
  isPaused: boolean;
  carColor: CarColor;
  graphicsQuality: GraphicsQuality;
  launchNotice: { visible: boolean; reactionSec: number } | null;
  flipNotice: { visible: boolean; count: number } | null;
  actionButtonText: 'GO' | 'THRUST';
  metrics: RunMetrics;
}
