# Security Specification — Badminton Doubles Scheduler (Firestore)

## 1. Data Invariants

1. **Ownership & Verification**: Every document in `/users/{userId}` and its subcollections (`courts`, `players`, `queueGroups`, `matches`) can only be read or mutated by the authenticated, email-verified user whose `request.auth.uid == userId` and `data.ownerId == request.auth.uid`.
2. **Master Gate Integrity**: Subcollection documents (`courts`, `players`, `queueGroups`, `matches`) cannot exist without an existing (or atomically created via `existsAfter`) parent `/users/{userId}` document.
3. **Zero PII Storage**: No email addresses, phone numbers, or addresses are stored in Firestore documents.
4. **Strict Schema & No Shadow Fields**: Every `create` checks `keys().hasAll(...) && keys().hasOnly(...)`; every `update` runs the entity validator first AND restricts modified keys via `affectedKeys().hasOnly(...)`.
5. **Immutable Audit Fields**: `ownerId` and `createdAt` are immutable after creation. Completed `matches` are append-only (no `update` allowed; `delete` only for owner full reset).
6. **Temporal Integrity**: `createdAt == request.time` on `create`; `updatedAt == request.time` on `create` and `update`.
7. **Bounded Arrays & Strings**: `court.playerIds` has size `0` or `4`; `queueGroup.playerIds` has size `4`; `match.playerIds` and `match.players` have size `1..4`; all strings enforce strict `size()` bounds and regex patterns (`HH:mm`, `YYYY-MM-DD`, valid IDs).
8. **Secure List Queries**: Every `allow list` validates `isVerifiedUser() && isOwner(userId) && resource.data.ownerId == request.auth.uid` with zero `get()`/`exists()` lookups inside `list`.

## 2. The "Dirty Dozen" Adversarial Payloads

| # | Attack Vector | Target Path | Payload / Action | Expected Result |
|---|---------------|-------------|------------------|-----------------|
| 1 | Unauthenticated Read | `/users/alice/players/p1` | `get` without auth | `PERMISSION_DENIED` |
| 2 | Unverified Email Write | `/users/alice` | `create` with `email_verified: false` | `PERMISSION_DENIED` |
| 3 | Cross-Tenant Read / List | `/users/alice/players` | Authenticated as `bob`, `list` query | `PERMISSION_DENIED` |
| 4 | Identity Spoofing on Create | `/users/alice/players/p1` | Authenticated as `alice`, `ownerId: "bob"` | `PERMISSION_DENIED` |
| 5 | Shadow Field Injection | `/users/alice/players/p1` | Valid player + `isAdmin: true` | `PERMISSION_DENIED` |
| 6 | Immutable `ownerId` Mutation | `/users/alice/players/p1` | `update` changing `ownerId` to `"bob"` | `PERMISSION_DENIED` |
| 7 | Client Timestamp Forgery | `/users/alice/players/p1` | `create` with backdated `createdAt` (`!= request.time`) | `PERMISSION_DENIED` |
| 8 | Path ID Poisoning (Denial of Wallet) | `/users/alice/players/a...150chars` | `create` with oversized or special-char document ID | `PERMISSION_DENIED` |
| 9 | Unbounded Array Injection | `/users/alice/courts/c1` | `update` with `playerIds` containing 5 elements | `PERMISSION_DENIED` |
| 10 | Value Poisoning on Allowed Key | `/users/alice/courts/c1` | `update` setting `name` to 200-char string or number | `PERMISSION_DENIED` |
| 11 | Orphaned Subcollection Create | `/users/alice/courts/c1` | `create` when `/users/alice` does not exist | `PERMISSION_DENIED` |
| 12 | Match History Tampering | `/users/alice/matches/m1` | `update` trying to alter recorded match scores | `PERMISSION_DENIED` |
