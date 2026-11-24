export interface Player {
  id: string;
  name: string;
  rating: number;
  wins: number;
  losses: number;
  lastPlayedAt: string; // "00:00" initially, then "HH:mm"
  lastPlayedTs: number; // epoch ms, 0 initially
  status: 'waiting' | 'queued' | 'playing';
  waitingSince: number;
  paused: boolean;
}

export interface Court {
  id: string;
  courtIndex: number;
  name: string; // blank by default ""
  playerIds: string[];
  players: Player[]; // 0 or 4 players
  startedAt: number | null; // epoch ms when match began, null when empty
}

export interface QueueGroup {
  id: string;
  position: number; // 1-based queue rank
  playerIds: string[];
  players: Player[]; // 4 players
  createdAt: number;
}

export interface MatchPlayerEntry {
  playerId: string;
  name: string;
  score: number;
  ratingDelta: number;
  ratingAfter: number;
}

export interface MatchRecord {
  id: string;
  courtName: string;
  playedAt: string; // "HH:mm"
  durationSeconds: number;
  playerIds: string[];
  players: MatchPlayerEntry[];
  createdAt: number;
}

export interface AppState {
  initialized: boolean;
  sessionDocExists: boolean;
  sessionDate: string;
  courtCount: number;
  autoArrange: boolean;
  nextAutoArrangeAt: number | null;
  courts: Court[];
  queue: QueueGroup[];
  waitingPlayers: Player[];
  allPlayers: Player[];
  totalMatchesToday: number;
}

export interface PlayerDetailResponse {
  player: Player;
  matches: MatchRecord[];
}
