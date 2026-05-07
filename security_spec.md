# Security Specification - AURA Orchestrator

## Data Invariants
1. A topic or session cannot exist without being owned by the authenticated user.
2. A chat thread must belong to its owner.
3. Messages in a thread must belong to the thread owner.
4. Users cannot read other users' profiles, topics, or chats.

## The Dirty Dozen (Attacker Payloads)

1. **Identity Spoofing**: Creating a topic under `/users/ALICE/topics/T1` while authenticated as `BOB`.
2. **Path Poisoning**: Providing a 2KB string as a `topicId`.
3. **Shadow Update**: Updating a topic with an additional field `isAdmin: true` to try and gain elevated privileges.
4. **Relational Break**: Creating a message in a chat thread that doesn't exist.
5. **PII Leakage**: Attempting to list all documents in `/users` collection without a specific `userId`.
6. **Immutable Field Attack**: Trying to change the `ownerId` of a topic.
7. **Timestamp Fraud**: Providing a future client-side timestamp for `createdAt`.
8. **Bulk Query Scraping**: Attempting `allow list: if isSignedIn()` to download all user metadata.
9. **Role Escalation**: Setting `mode: "admin"` on a `ChatThread` where only "focused" or "free" are allowed.
10. **Resource Exhaustion**: Sending a 1MB string in the `summary` field of `TopicMemory`.
11. **Orphaned Writes**: Creating a session referencing a `topicId` that doesn't exist.
12. **Cross-User Injection**: Authenticated User A writing to User B's `topicMemories`.

## Test Scenarios (Manual Validation)
- `get` on `/users/BOB` as `ALICE` -> DENIED
- `create` on `/users/ALICE/topics/T1` with `ownerId: "BOB"` -> DENIED
- `list` on `/users/ALICE/chats` as `ALICE` -> ALLOWED
- `list` on `/users` -> DENIED
