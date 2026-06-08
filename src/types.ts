/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Player {
  phoneNumber: string;
  name: string;
  score: number;
  createdAt: string;
}

export interface Prediction {
  playerPhone: string;
  matchId: string;
  prediction: 'HOME' | 'DRAW' | 'AWAY';
  votedAt: string;
  points: number;
  evaluated: boolean;
}

export interface Match {
  id: string; // "1" to "104"
  homeTeam: string;
  awayTeam: string;
  matchTime: string; // ISO String (e.g., "2026-06-11T20:00:00Z")
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  homeScore?: number;
  awayScore?: number;
  winner?: 'HOME' | 'DRAW' | 'AWAY';
  stage: string; // "Vòng bảng - Bảng A", "Vòng 32", "Vòng 16", "Tứ kết", "Bán kết", "Chung kết"
  visible?: boolean;
}

export interface MatchOdds {
  matchId: string;
  homeOdds?: number;
  drawOdds?: number;
  awayOdds?: number;
  lastUpdated?: string;
}

export interface LeaderboardEntry extends Player {
  rank: number;
  predictedCount: number;
  correctCount: number;
}
