/**
 * Firestore Security Rules Specification Tests ("Dirty Dozen" Payloads)
 *
 * Documents the 12 adversarial payloads that firestore.rules MUST reject
 * with PERMISSION_DENIED, plus authorized owner operations that MUST succeed.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  actor: { uid: string; email_verified: boolean } | null;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated read denied',
    actor: null,
    operation: 'get',
    path: '/users/alice/players/p1',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified email create denied',
    actor: { uid: 'alice', email_verified: false },
    operation: 'create',
    path: '/users/alice',
    payload: {
      ownerId: 'alice',
      sessionDate: '2026-11-24',
      courtCount: 4,
      autoArrange: false,
      nextAutoArrangeAt: 0,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Cross-tenant list denied',
    actor: { uid: 'bob', email_verified: true },
    operation: 'list',
    path: '/users/alice/players',
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Identity spoofing ownerId on create denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'create',
    path: '/users/alice/players/p1',
    payload: {
      ownerId: 'bob',
      name: '王小明',
      rating: 2000,
      wins: 0,
      losses: 0,
      lastPlayedAt: '00:00',
      lastPlayedTs: 0,
      status: 'waiting',
      waitingSince: 1700000000000,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Shadow field injection (isAdmin) denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'create',
    path: '/users/alice/players/p1',
    payload: {
      ownerId: 'alice',
      name: '王小明',
      rating: 2000,
      wins: 0,
      losses: 0,
      lastPlayedAt: '00:00',
      lastPlayedTs: 0,
      status: 'waiting',
      waitingSince: 1700000000000,
      isAdmin: true,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Immutable ownerId mutation denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'update',
    path: '/users/alice/players/p1',
    payload: {
      ownerId: 'bob',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Client timestamp forgery denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'create',
    path: '/users/alice/players/p1',
    payload: {
      ownerId: 'alice',
      name: '王小明',
      rating: 2000,
      wins: 0,
      losses: 0,
      lastPlayedAt: '00:00',
      lastPlayedTs: 0,
      status: 'waiting',
      waitingSince: 1700000000000,
      createdAt: '2020-01-01T00:00:00Z',
      updatedAt: '2020-01-01T00:00:00Z',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Oversized path ID poisoning denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'create',
    path: `/users/alice/players/${'a'.repeat(150)}`,
    payload: {
      ownerId: 'alice',
      name: '王小明',
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Unbounded court playerIds array (>4) denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'update',
    path: '/users/alice/courts/c1',
    payload: {
      playerIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Value poisoning on whitelisted court name field (>60 chars) denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'update',
    path: '/users/alice/courts/c1',
    payload: {
      name: 'X'.repeat(200),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Orphaned subcollection write without parent user session denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'create',
    path: '/users/alice/courts/c1',
    payload: {
      ownerId: 'alice',
      courtIndex: 1,
      name: '',
      playerIds: [],
      startedAt: 0,
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Completed match history update tampering denied',
    actor: { uid: 'alice', email_verified: true },
    operation: 'update',
    path: '/users/alice/matches/m1',
    payload: {
      durationSeconds: 9999,
    },
    expected: 'PERMISSION_DENIED',
  },
];
