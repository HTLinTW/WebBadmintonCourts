import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AppState,
  Court,
  MatchPlayerEntry,
  MatchRecord,
  Player,
  PlayerDetailResponse,
  QueueGroup,
} from '../types';

export const AUTO_ARRANGE_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

// Blueprint-synchronized validation constants
const MAX_PLAYER_NAME_LEN = 50;
const MAX_COURT_NAME_LEN = 60;
const MIN_COURT_COUNT = 1;
const MAX_COURT_COUNT = 24;
const MIN_SCORE = -1000;
const MAX_SCORE = 1000;
const MIN_RATING = -100000;
const MAX_RATING = 100000;
const MAX_WINS_LOSSES = 10000;
const MAX_DURATION_SECONDS = 86400;
const HHMM_PATTERN = /^\d{2}:\d{2}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getTodayDateString(): string {
  try {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (DATE_PATTERN.test(formatted)) return formatted;
  } catch {
    // fallback below
  }
  return new Date().toISOString().slice(0, 10);
}

export function getLocalHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const formatted = `${h}:${m}`;
  return HHMM_PATTERN.test(formatted) ? formatted : '00:00';
}

export function formatDurationMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseNumericScore(raw: unknown): number {
  let num = 0;
  if (typeof raw === 'number') {
    num = Number.isFinite(raw) ? raw : 0;
  } else if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed !== '') {
      const parsed = Number(trimmed);
      num = Number.isFinite(parsed) ? parsed : 0;
    }
  }
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, num));
}

function sanitizeCourtName(raw: string): string {
  return raw.trim().slice(0, MAX_COURT_NAME_LEN);
}

function sanitizePlayerName(raw: string): string {
  return raw.trim().slice(0, MAX_PLAYER_NAME_LEN);
}

function clampRating(val: number): number {
  return Math.max(MIN_RATING, Math.min(MAX_RATING, Math.round(val)));
}

function clampCounter(val: number): number {
  return Math.max(0, Math.min(MAX_WINS_LOSSES, Math.round(val)));
}

function toEpochMs(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return 0;
}

function optimizeDoublesPairing(
  group: [Player, Player, Player, Player],
): [Player, Player, Player, Player] {
  const [p0, p1, p2, p3] = group;
  const candidates: [Player, Player, Player, Player][] = [
    [p0, p1, p2, p3],
    [p0, p2, p1, p3],
    [p0, p3, p1, p2],
  ];
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const cand of candidates) {
    const teamA = cand[0].rating + cand[1].rating;
    const teamB = cand[2].rating + cand[3].rating;
    const diff = Math.abs(teamA - teamB);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = cand;
    }
  }
  return best;
}

interface RawSession {
  exists: boolean;
  sessionDate: string;
  courtCount: number;
  autoArrange: boolean;
  nextAutoArrangeAt: number;
}

interface RawCourt {
  id: string;
  courtIndex: number;
  name: string;
  playerIds: string[];
  startedAt: number;
}

interface RawQueueGroup {
  id: string;
  position: number;
  playerIds: string[];
  createdAt: number;
}

export function subscribeToSessionState(
  uid: string,
  onUpdate: (state: AppState) => void,
  onError: (err: Error) => void,
): Unsubscribe {
  let sessionReady = false;
  let courtsReady = false;
  let playersReady = false;
  let queueReady = false;
  let matchesReady = false;

  let rawSession: RawSession = {
    exists: false,
    sessionDate: getTodayDateString(),
    courtCount: 0,
    autoArrange: false,
    nextAutoArrangeAt: 0,
  };
  let rawCourts: RawCourt[] = [];
  let rawPlayers: Player[] = [];
  let rawQueue: RawQueueGroup[] = [];
  let matchesCount = 0;

  const emitIfReady = () => {
    if (!sessionReady || !courtsReady || !playersReady || !queueReady || !matchesReady) {
      return;
    }

    const playerMap = new Map<string, Player>();
    for (const p of rawPlayers) {
      playerMap.set(p.id, p);
    }

    const courts: Court[] = [...rawCourts]
      .sort((a, b) => a.courtIndex - b.courtIndex)
      .map((c) => ({
        id: c.id,
        courtIndex: c.courtIndex,
        name: c.name,
        playerIds: c.playerIds,
        players: c.playerIds
          .map((pid) => playerMap.get(pid))
          .filter((p): p is Player => Boolean(p)),
        startedAt: c.startedAt > 0 ? c.startedAt : null,
      }));

    const queue: QueueGroup[] = [...rawQueue]
      .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
      .map((g) => ({
        id: g.id,
        position: g.position,
        playerIds: g.playerIds,
        players: g.playerIds
          .map((pid) => playerMap.get(pid))
          .filter((p): p is Player => Boolean(p)),
        createdAt: g.createdAt,
      }));

    const waitingPlayers = rawPlayers
      .filter((p) => p.status === 'waiting')
      .sort((a, b) => a.waitingSince - b.waitingSince || a.id.localeCompare(b.id));

    const today = getTodayDateString();
    const isSameDay = rawSession.sessionDate === today;
    const effectiveCourtCount = isSameDay ? rawSession.courtCount : 0;

    onUpdate({
      initialized: rawSession.exists && effectiveCourtCount > 0,
      sessionDocExists: rawSession.exists,
      sessionDate: today,
      courtCount: effectiveCourtCount,
      autoArrange: isSameDay ? rawSession.autoArrange : false,
      nextAutoArrangeAt:
        isSameDay && rawSession.autoArrange && rawSession.nextAutoArrangeAt > 0
          ? rawSession.nextAutoArrangeAt
          : null,
      courts,
      queue,
      waitingPlayers,
      allPlayers: rawPlayers,
      totalMatchesToday: matchesCount,
    });
  };

  const handleListenerError = (error: unknown, op: OperationType, path: string) => {
    try {
      handleFirestoreError(error, op, path);
    } catch (wrapped) {
      onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
    }
  };

  const sessionPath = `users/${uid}`;
  const unsubSession = onSnapshot(
    doc(db, 'users', uid),
    (snap) => {
      sessionReady = true;
      if (snap.exists()) {
        const d = snap.data();
        rawSession = {
          exists: true,
          sessionDate: typeof d.sessionDate === 'string' ? d.sessionDate : getTodayDateString(),
          courtCount: typeof d.courtCount === 'number' ? d.courtCount : 0,
          autoArrange: Boolean(d.autoArrange),
          nextAutoArrangeAt: typeof d.nextAutoArrangeAt === 'number' ? d.nextAutoArrangeAt : 0,
        };
      } else {
        rawSession = {
          exists: false,
          sessionDate: getTodayDateString(),
          courtCount: 0,
          autoArrange: false,
          nextAutoArrangeAt: 0,
        };
      }
      emitIfReady();
    },
    (error) => handleListenerError(error, OperationType.GET, sessionPath),
  );

  const courtsPath = `users/${uid}/courts`;
  const unsubCourts = onSnapshot(
    query(collection(db, 'users', uid, 'courts'), where('ownerId', '==', uid)),
    (snap) => {
      courtsReady = true;
      rawCourts = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          courtIndex: typeof d.courtIndex === 'number' ? d.courtIndex : 1,
          name: typeof d.name === 'string' ? d.name : '',
          playerIds: Array.isArray(d.playerIds) ? d.playerIds.map(String) : [],
          startedAt: typeof d.startedAt === 'number' ? d.startedAt : 0,
        };
      });
      emitIfReady();
    },
    (error) => handleListenerError(error, OperationType.LIST, courtsPath),
  );

  const playersPath = `users/${uid}/players`;
  const unsubPlayers = onSnapshot(
    query(collection(db, 'users', uid, 'players'), where('ownerId', '==', uid)),
    (snap) => {
      playersReady = true;
      rawPlayers = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: typeof d.name === 'string' ? d.name : '',
          rating: typeof d.rating === 'number' ? d.rating : 2000,
          wins: typeof d.wins === 'number' ? d.wins : 0,
          losses: typeof d.losses === 'number' ? d.losses : 0,
          lastPlayedAt: typeof d.lastPlayedAt === 'string' ? d.lastPlayedAt : '00:00',
          lastPlayedTs: typeof d.lastPlayedTs === 'number' ? d.lastPlayedTs : 0,
          status:
            d.status === 'queued' || d.status === 'playing' || d.status === 'waiting'
              ? d.status
              : 'waiting',
          waitingSince: typeof d.waitingSince === 'number' ? d.waitingSince : 0,
          paused: Boolean(d.paused),
        };
      });
      emitIfReady();
    },
    (error) => handleListenerError(error, OperationType.LIST, playersPath),
  );

  const queuePath = `users/${uid}/queueGroups`;
  const unsubQueue = onSnapshot(
    query(collection(db, 'users', uid, 'queueGroups'), where('ownerId', '==', uid)),
    (snap) => {
      queueReady = true;
      rawQueue = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          position: typeof d.position === 'number' ? d.position : 1,
          playerIds: Array.isArray(d.playerIds) ? d.playerIds.map(String) : [],
          createdAt: toEpochMs(d.createdAt),
        };
      });
      emitIfReady();
    },
    (error) => handleListenerError(error, OperationType.LIST, queuePath),
  );

  const matchesPath = `users/${uid}/matches`;
  const unsubMatches = onSnapshot(
    query(collection(db, 'users', uid, 'matches'), where('ownerId', '==', uid)),
    (snap) => {
      matchesReady = true;
      matchesCount = snap.size;
      emitIfReady();
    },
    (error) => handleListenerError(error, OperationType.LIST, matchesPath),
  );

  return () => {
    unsubSession();
    unsubCourts();
    unsubPlayers();
    unsubQueue();
    unsubMatches();
  };
}

async function deleteCollectionDocsInBatches(uid: string, subcollection: string): Promise<void> {
  const path = `users/${uid}/${subcollection}`;
  let snap;
  try {
    snap = await getDocs(
      query(collection(db, 'users', uid, subcollection), where('ownerId', '==', uid)),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }

  const docs = snap.docs;
  const CHUNK_SIZE = 400;
  for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    for (const d of docs.slice(i, i + CHUNK_SIZE)) {
      batch.delete(d.ref);
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }
}

export async function setupCourts(
  uid: string,
  courtCount: number,
  sessionDocExists: boolean,
): Promise<void> {
  if (!Number.isInteger(courtCount) || courtCount < MIN_COURT_COUNT || courtCount > MAX_COURT_COUNT) {
    throw new Error('請輸入 1 到 24 之間的場地數量');
  }

  const today = getTodayDateString();

  // If session doc existed from a previous day, clean up stale subcollections first
  if (sessionDocExists) {
    await deleteCollectionDocsInBatches(uid, 'courts');
    await deleteCollectionDocsInBatches(uid, 'queueGroups');
    await deleteCollectionDocsInBatches(uid, 'players');
    await deleteCollectionDocsInBatches(uid, 'matches');
  }

  const batch = writeBatch(db);
  const sessionRef = doc(db, 'users', uid);

  if (sessionDocExists) {
    batch.update(sessionRef, {
      courtCount,
      sessionDate: today,
      autoArrange: false,
      nextAutoArrangeAt: 0,
      updatedAt: serverTimestamp(),
    });
  } else {
    batch.set(sessionRef, {
      ownerId: uid,
      sessionDate: today,
      courtCount,
      autoArrange: false,
      nextAutoArrangeAt: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (let i = 1; i <= courtCount; i++) {
    const courtRef = doc(db, 'users', uid, 'courts', `court_${i}`);
    batch.set(courtRef, {
      ownerId: uid,
      courtIndex: i,
      name: '',
      playerIds: [],
      startedAt: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/courts`);
  }
}

export async function updateCourtCount(
  uid: string,
  courtCount: number,
  currentCourts: Court[],
): Promise<void> {
  if (!Number.isInteger(courtCount) || courtCount < MIN_COURT_COUNT || courtCount > MAX_COURT_COUNT) {
    throw new Error('請輸入 1 到 24 之間的場地數量');
  }

  const sorted = [...currentCourts].sort((a, b) => a.courtIndex - b.courtIndex);
  const batch = writeBatch(db);
  const now = Date.now();

  if (courtCount > sorted.length) {
    for (let i = sorted.length + 1; i <= courtCount; i++) {
      const courtRef = doc(db, 'users', uid, 'courts', `court_${i}`);
      batch.set(courtRef, {
        ownerId: uid,
        courtIndex: i,
        name: '',
        playerIds: [],
        startedAt: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } else if (courtCount < sorted.length) {
    const toRemove = sorted.filter((c) => c.courtIndex > courtCount);
    for (const c of toRemove) {
      for (const pid of c.playerIds) {
        batch.update(doc(db, 'users', uid, 'players', pid), {
          status: 'waiting',
          waitingSince: now,
          updatedAt: serverTimestamp(),
        });
      }
      batch.delete(doc(db, 'users', uid, 'courts', c.id));
    }
  }

  batch.update(doc(db, 'users', uid), {
    courtCount,
    sessionDate: getTodayDateString(),
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/courts`);
  }
}

export async function updateCourtName(uid: string, courtId: string, name: string): Promise<void> {
  const sanitized = sanitizeCourtName(name);
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'courts', courtId), {
    name: sanitized,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/courts/${courtId}`);
  }
}

export async function addPlayers(
  uid: string,
  rawNameInput: string,
  existingPlayers: Player[],
): Promise<{ added: string[]; duplicates: string[] }> {
  const names = rawNameInput
    .split(/[\n,，、]+/)
    .map((n) => sanitizePlayerName(n))
    .filter((n) => n.length > 0);

  if (names.length === 0) {
    throw new Error('請輸入有效的球員名稱');
  }

  const existingNames = new Set(existingPlayers.map((p) => p.name));
  const added: string[] = [];
  const duplicates: string[] = [];
  const seenInBatch = new Set<string>();

  for (const name of names) {
    if (existingNames.has(name) || seenInBatch.has(name)) {
      if (!duplicates.includes(name)) duplicates.push(name);
    } else {
      seenInBatch.add(name);
      added.push(name);
    }
  }

  if (added.length === 0 && duplicates.length > 0) {
    throw new Error(`球員「${duplicates.join('、')}」已經存在`);
  }

  const batch = writeBatch(db);
  const now = Date.now();
  const playersCol = collection(db, 'users', uid, 'players');

  added.forEach((name, idx) => {
    const newRef = doc(playersCol);
    batch.set(newRef, {
      ownerId: uid,
      name,
      rating: 2000,
      wins: 0,
      losses: 0,
      lastPlayedAt: '00:00',
      lastPlayedTs: 0,
      status: 'waiting',
      waitingSince: now + idx,
      paused: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}/players`);
  }

  return { added, duplicates };
}

export async function getPlayerDetail(uid: string, playerId: string): Promise<PlayerDetailResponse> {
  const playerPath = `users/${uid}/players/${playerId}`;
  let playerSnap;
  try {
    playerSnap = await getDoc(doc(db, 'users', uid, 'players', playerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, playerPath);
  }

  if (!playerSnap.exists()) {
    throw new Error('找不到該球員資料');
  }

  const pd = playerSnap.data();
  const player: Player = {
    id: playerSnap.id,
    name: typeof pd.name === 'string' ? pd.name : '',
    rating: typeof pd.rating === 'number' ? pd.rating : 2000,
    wins: typeof pd.wins === 'number' ? pd.wins : 0,
    losses: typeof pd.losses === 'number' ? pd.losses : 0,
    lastPlayedAt: typeof pd.lastPlayedAt === 'string' ? pd.lastPlayedAt : '00:00',
    lastPlayedTs: typeof pd.lastPlayedTs === 'number' ? pd.lastPlayedTs : 0,
    status:
      pd.status === 'queued' || pd.status === 'playing' || pd.status === 'waiting'
        ? pd.status
        : 'waiting',
    waitingSince: typeof pd.waitingSince === 'number' ? pd.waitingSince : 0,
    paused: Boolean(pd.paused),
  };

  const matchesPath = `users/${uid}/matches`;
  let matchSnap;
  try {
    matchSnap = await getDocs(
      query(
        collection(db, 'users', uid, 'matches'),
        where('ownerId', '==', uid),
        where('playerIds', 'array-contains', playerId),
      ),
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, matchesPath);
  }

  const matches: MatchRecord[] = matchSnap.docs
    .map((mDoc) => {
      const d = mDoc.data();
      return {
        id: mDoc.id,
        courtName: typeof d.courtName === 'string' ? d.courtName : '',
        playedAt: typeof d.playedAt === 'string' ? d.playedAt : '00:00',
        durationSeconds: typeof d.durationSeconds === 'number' ? d.durationSeconds : 0,
        playerIds: Array.isArray(d.playerIds) ? d.playerIds.map(String) : [],
        players: Array.isArray(d.players) ? (d.players as MatchPlayerEntry[]) : [],
        createdAt: toEpochMs(d.createdAt),
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  return { player, matches };
}

export async function createManualGroup(
  uid: string,
  playerIds: string[],
  currentQueue: QueueGroup[],
): Promise<void> {
  const uniqueIds = Array.from(new Set(playerIds));
  if (uniqueIds.length !== 4) {
    throw new Error('必須選擇剛好 4 位未排列球員才能加入排隊組合');
  }

  const nextPosition =
    currentQueue.length > 0 ? Math.max(...currentQueue.map((g) => g.position)) + 1 : 1;

  const batch = writeBatch(db);
  const groupRef = doc(collection(db, 'users', uid, 'queueGroups'));

  batch.set(groupRef, {
    ownerId: uid,
    position: Math.min(500, nextPosition),
    playerIds: uniqueIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  for (const pid of uniqueIds) {
    batch.update(doc(db, 'users', uid, 'players', pid), {
      status: 'queued',
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/queueGroups`);
  }
}

export async function removeQueueGroup(
  uid: string,
  groupId: string,
  currentQueue: QueueGroup[],
): Promise<void> {
  const target = currentQueue.find((g) => g.id === groupId);
  if (!target) {
    throw new Error('找不到該排列組合');
  }

  const batch = writeBatch(db);

  for (const pid of target.playerIds) {
    batch.update(doc(db, 'users', uid, 'players', pid), {
      status: 'waiting',
      updatedAt: serverTimestamp(),
    });
  }

  batch.delete(doc(db, 'users', uid, 'queueGroups', groupId));

  // Re-index remaining queue groups
  const remaining = currentQueue
    .filter((g) => g.id !== groupId)
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);

  remaining.forEach((g, idx) => {
    const newPos = idx + 1;
    if (g.position !== newPos) {
      batch.update(doc(db, 'users', uid, 'queueGroups', g.id), {
        position: newPos,
        updatedAt: serverTimestamp(),
      });
    }
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/queueGroups/${groupId}`);
  }
}

function appendOutgoingMatchToBatch(
  batch: ReturnType<typeof writeBatch>,
  uid: string,
  court: Court,
  sanitizedScores: number[],
  clientTime: string,
  now: number,
): boolean {
  if (court.players.length === 0) return false;

  const durationSeconds = court.startedAt
    ? Math.max(0, Math.min(MAX_DURATION_SECONDS, Math.floor((now - court.startedAt) / 1000)))
    : 0;

  const matchPlayers: MatchPlayerEntry[] = [];
  const matchPlayerIds: string[] = [];

  court.players.forEach((player, idx) => {
    const score = sanitizedScores[idx] ?? 0;
    const ratingDelta = Math.round(score * 10);
    const ratingAfter = clampRating(player.rating + ratingDelta);
    const wins = clampCounter(player.wins + (score === 21 ? 1 : 0));
    const losses = clampCounter(player.losses + (score < 21 && score > 0 ? 1 : 0));

    batch.update(doc(db, 'users', uid, 'players', player.id), {
      rating: ratingAfter,
      wins,
      losses,
      lastPlayedAt: clientTime,
      lastPlayedTs: now,
      status: 'waiting',
      waitingSince: now,
      updatedAt: serverTimestamp(),
    });

    matchPlayerIds.push(player.id);
    matchPlayers.push({
      playerId: player.id,
      name: sanitizePlayerName(player.name),
      score,
      ratingDelta,
      ratingAfter,
    });
  });

  const matchRef = doc(collection(db, 'users', uid, 'matches'));
  batch.set(matchRef, {
    ownerId: uid,
    courtName: sanitizeCourtName(court.name),
    playedAt: clientTime,
    durationSeconds,
    playerIds: matchPlayerIds,
    players: matchPlayers,
    createdAt: serverTimestamp(),
  });

  return true;
}

export async function assignCourtGroup(
  uid: string,
  court: Court,
  group: QueueGroup,
  rawScores: string[],
  currentQueue: QueueGroup[],
): Promise<{ sanitizedScores: number[]; recordedMatch: boolean }> {
  const sanitizedScores = [0, 1, 2, 3].map((i) => parseNumericScore(rawScores[i]));
  const clientTime = getLocalHHMM();
  const now = Date.now();
  const batch = writeBatch(db);

  const recordedMatch = appendOutgoingMatchToBatch(
    batch,
    uid,
    court,
    sanitizedScores,
    clientTime,
    now,
  );

  // Move incoming group onto court
  batch.update(doc(db, 'users', uid, 'courts', court.id), {
    playerIds: group.playerIds,
    startedAt: now,
    updatedAt: serverTimestamp(),
  });

  for (const pid of group.playerIds) {
    batch.update(doc(db, 'users', uid, 'players', pid), {
      status: 'playing',
      updatedAt: serverTimestamp(),
    });
  }

  // Delete clicked queue group and re-index remaining groups
  batch.delete(doc(db, 'users', uid, 'queueGroups', group.id));
  const remaining = currentQueue
    .filter((g) => g.id !== group.id)
    .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);

  remaining.forEach((g, idx) => {
    const newPos = idx + 1;
    if (g.position !== newPos) {
      batch.update(doc(db, 'users', uid, 'queueGroups', g.id), {
        position: newPos,
        updatedAt: serverTimestamp(),
      });
    }
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/courts/${court.id}`);
  }

  return { sanitizedScores, recordedMatch };
}

export async function clearCourt(
  uid: string,
  court: Court,
  rawScores: string[],
): Promise<{ sanitizedScores: number[]; recordedMatch: boolean }> {
  const sanitizedScores = [0, 1, 2, 3].map((i) => parseNumericScore(rawScores[i]));
  const clientTime = getLocalHHMM();
  const now = Date.now();
  const batch = writeBatch(db);

  const recordedMatch = appendOutgoingMatchToBatch(
    batch,
    uid,
    court,
    sanitizedScores,
    clientTime,
    now,
  );

  batch.update(doc(db, 'users', uid, 'courts', court.id), {
    playerIds: [],
    startedAt: 0,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/courts/${court.id}`);
  }

  return { sanitizedScores, recordedMatch };
}

export async function togglePlayerPause(
  uid: string,
  playerId: string,
  paused: boolean,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid, 'players', playerId), {
    paused,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}/players/${playerId}`);
  }
}

/**
 * Automatic Matchmaking Algorithm:
 * 1. Pick the waiting player with the longest time since last play (oldest lastPlayedTs, tie-break waitingSince).
 * 2. Look for 3 other waiting players within ±300 rating of anchor.
 * 3. If not found, look for 1 player within ±300 PLUS 2 players > +300 OR 2 players < -300.
 * 4. If still not found, pick the 3 players with closest rating to anchor.
 * Paused players are excluded from automatic matchmaking.
 * Balances the 4 players into optimal 2v2 doubles pairing, and repeats while >= 4 eligible waiting players remain.
 */
export async function runAutoArrangeOnce(
  uid: string,
  waitingPlayers: Player[],
  currentQueue: QueueGroup[],
  updateSchedule: boolean,
): Promise<number> {
  const pool = waitingPlayers.filter((p) => !p.paused);
  let nextPos =
    currentQueue.length > 0 ? Math.max(...currentQueue.map((g) => g.position)) + 1 : 1;
  let createdCount = 0;

  const batch = writeBatch(db);
  const queueCol = collection(db, 'users', uid, 'queueGroups');

  while (pool.length >= 4 && nextPos <= 500) {
    pool.sort(
      (a, b) =>
        a.lastPlayedTs - b.lastPlayedTs ||
        a.waitingSince - b.waitingSince ||
        a.id.localeCompare(b.id),
    );
    const anchor = pool[0];
    const others = pool.slice(1);
    const R = anchor.rating;

    const within300 = others
      .filter((p) => Math.abs(p.rating - R) <= 300)
      .sort(
        (a, b) =>
          Math.abs(a.rating - R) - Math.abs(b.rating - R) ||
          a.lastPlayedTs - b.lastPlayedTs ||
          a.waitingSince - b.waitingSince,
      );

    let chosenThree: Player[] | null = null;

    if (within300.length >= 3) {
      chosenThree = within300.slice(0, 3);
    } else {
      const high300 = others
        .filter((p) => p.rating - R > 300)
        .sort(
          (a, b) =>
            a.rating - b.rating ||
            a.lastPlayedTs - b.lastPlayedTs ||
            a.waitingSince - b.waitingSince,
        );
      const low300 = others
        .filter((p) => R - p.rating > 300)
        .sort(
          (a, b) =>
            b.rating - a.rating ||
            a.lastPlayedTs - b.lastPlayedTs ||
            a.waitingSince - b.waitingSince,
        );

      if (within300.length >= 1 && (high300.length >= 2 || low300.length >= 2)) {
        const partner = within300[0];
        if (high300.length >= 2 && low300.length >= 2) {
          const highAvgDist = (high300[0].rating - R + (high300[1].rating - R)) / 2;
          const lowAvgDist = (R - low300[0].rating + (R - low300[1].rating)) / 2;
          const pair = highAvgDist <= lowAvgDist ? high300.slice(0, 2) : low300.slice(0, 2);
          chosenThree = [partner, pair[0], pair[1]];
        } else if (high300.length >= 2) {
          chosenThree = [partner, high300[0], high300[1]];
        } else {
          chosenThree = [partner, low300[0], low300[1]];
        }
      }
    }

    if (!chosenThree) {
      const closest = [...others].sort(
        (a, b) =>
          Math.abs(a.rating - R) - Math.abs(b.rating - R) ||
          a.lastPlayedTs - b.lastPlayedTs ||
          a.waitingSince - b.waitingSince,
      );
      chosenThree = closest.slice(0, 3);
    }

    const balanced = optimizeDoublesPairing([
      anchor,
      chosenThree[0],
      chosenThree[1],
      chosenThree[2],
    ]);

    const playerIds = balanced.map((p) => p.id);
    const groupRef = doc(queueCol);

    batch.set(groupRef, {
      ownerId: uid,
      position: nextPos++,
      playerIds,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const usedIds = new Set(playerIds);
    for (const pid of usedIds) {
      batch.update(doc(db, 'users', uid, 'players', pid), {
        status: 'queued',
        updatedAt: serverTimestamp(),
      });
    }

    for (let i = pool.length - 1; i >= 0; i--) {
      if (usedIds.has(pool[i].id)) {
        pool.splice(i, 1);
      }
    }

    createdCount++;
  }

  if (updateSchedule) {
    batch.update(doc(db, 'users', uid), {
      autoArrange: true,
      nextAutoArrangeAt: Date.now() + AUTO_ARRANGE_INTERVAL_MS,
      updatedAt: serverTimestamp(),
    });
  }

  if (createdCount > 0 || updateSchedule) {
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${uid}/queueGroups`);
    }
  }

  return createdCount;
}

export async function toggleAutoArrange(
  uid: string,
  currentAutoArrange: boolean,
  waitingPlayers: Player[],
  currentQueue: QueueGroup[],
): Promise<{ enabled: boolean; groupsCreated: number }> {
  if (currentAutoArrange) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid), {
      autoArrange: false,
      nextAutoArrangeAt: 0,
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
    return { enabled: false, groupsCreated: 0 };
  }

  const groupsCreated = await runAutoArrangeOnce(uid, waitingPlayers, currentQueue, true);
  return { enabled: true, groupsCreated };
}

export async function resetAll(uid: string): Promise<void> {
  await deleteCollectionDocsInBatches(uid, 'courts');
  await deleteCollectionDocsInBatches(uid, 'queueGroups');
  await deleteCollectionDocsInBatches(uid, 'players');
  await deleteCollectionDocsInBatches(uid, 'matches');

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), {
    courtCount: 0,
    sessionDate: getTodayDateString(),
    autoArrange: false,
    nextAutoArrangeAt: 0,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}
