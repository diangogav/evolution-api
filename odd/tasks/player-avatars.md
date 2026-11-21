# Player avatars

## Objective

Let a player save the bust avatar they build on the web (hair, eyes, glasses, hat,
shirt, logo, background...) and show it to everyone: ranking and profiles.

## Problem

The web already has the avatar builder and renderer (`evolutionygo-web-ranking`,
`src/utils/avatar/`), but the API has nowhere to keep the choice, so the web stores it
in the player's browser. Only its owner sees it, on that browser; everyone else still
sees initials.

## Why

An avatar is for others to recognise the player. Kept in the browser it has no value.

## Decisions

- The avatar is a small JSON of choices, `{ "hairStyle": "spiky", "hairColor": "purple", ... }`.
  The web owns the catalog of options and draws the SVG. The API stores and serves the
  JSON; it never renders images.
- New API-owned table `player_avatars` (`user_id` PK and FK to `users(id)` ON DELETE
  CASCADE, `config` jsonb, `updated_at`), in `src/migrations/` like `user_emote_bars`.
  `users.avatar` (evolution-types) is not reused: the game server writes it when it
  creates or migrates profiles and it may hold legacy values.
- The API validates the shape, not the catalog: at most 24 entries, keys
  `^[a-zA-Z]{1,24}$`, values `^[a-z0-9-]{1,32}$`. The domain factory owns these rules and
  answers 400; the body schema only requires an object of strings (anything else is
  Elysia's 422). Adding a hair style or a colour needs
  no API change. The web sanitizes the JSON against its catalog before drawing, so an
  unknown value falls back to the default instead of breaking anything.
- Player routes, behind `requireUser`: `GET /me/avatar` (404 when none), `PUT /me/avatar`
  (replace whole, upsert), `DELETE /me/avatar` (back to initials).
- Public route: `GET /avatars?userIds=a,b,c` returns the avatars of the given users in
  one call (at most 100 ids). Users without an avatar or unknown ids are left out, not an
  error. Batch by user id because the ranking has ids and shows many players at once;
  it keeps the stats queries untouched.
- The in-duel avatar (the `AVATAR` cosmetic in the loadout) is a different thing and
  does not change.

## Scope

Repos: evolution-api, evolutionygo-web-ranking.
Out of scope: in-duel avatar, OG image (needs a PNG), moderation of avatars (choices come
from a fixed catalog, there is no free text or upload), tournament pages (their
participants carry only a name, no user id, and the tournaments module is retired).

## Constraints

- Deploy order: API (migration, then endpoints), then web. The web must keep working
  with initials when the API has no avatar endpoints or returns errors.
- Avatars already saved in browsers are uploaded once by the web on the player's next
  visit, so nobody loses theirs.
- New endpoints satisfy the OpenAPI ratchet (`PROTECTED_OPERATIONS`, tags).

## Tasks

- [x] T1 API: `player-avatars` module. Domain avatar config factory with the shape rules,
      repository port, migration `create-player-avatars`, Postgres repository.
- [x] T2 API: `GetMyAvatar`, `SaveMyAvatar`, `DeleteMyAvatar` use cases and the
      `/me/avatar` router behind `requireUser`.
- [x] T3 API: `GetAvatarsByUserIds` use case and the public `GET /avatars` router.
- [ ] T4 Web: avatar store backed by the API (load on login and page load, save, delete),
      one-time upload of a browser-saved avatar, initials when the API fails.
- [ ] T5 Web: show avatars to everyone: ranking table rows and the profile header
      (server-rendered from the API).

## Acceptance criteria

- A player saves an avatar on one device and sees it on another after logging in.
- Another visitor, logged in or not, sees that avatar in the ranking and on the profile.
- `DELETE /me/avatar` brings the initials back everywhere.
- A body with unknown key shapes, long values or more than 24 entries is a 400.
- With the API avatar endpoints down, every page renders with initials.

## Checks

- TDD: test first for domain rules, use cases, routers and web store.
- evolution-api: `bun test`, `bun run lint`, `bun run build`
- evolutionygo-web-ranking: `bun run test`, `bun run lint`, `bun run build`
