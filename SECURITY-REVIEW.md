# Club Check-In Security Review

**Review date:** 20 November 2026  
**Status:** Technical controls implemented; Club policy approval remains a governance decision.

## Scope

- Club Check-In PWA and Parent Match Availability Portal
- Supabase database and Row Level Security
- Personal PIN, Coach/Admin sessions and passkey authentication
- Parent PIN, fixture-link and response-editing workflows
- Coach access to attendance, fixtures and parent availability

## Implemented controls

### User authentication and access

- Individual personal PINs are stored as bcrypt hashes; PIN fingerprints use a server-held HMAC key.
- Successful personal authentication creates a random session token. Only its hash is stored in the database.
- Sessions are installation-bound, expire after two hours and can be revoked.
- Deactivating a user revokes their active sessions, installation access and passkeys.
- Passkey registration and authentication use WebAuthn challenges, origin checks and short-lived challenges.
- Coach data access requires an individual personal session and an active role/age-group assignment.
- The legacy shared Coach PIN is retained only for the one-time personal-PIN setup path. It is rejected for Coach operational access.

### Coach and fixture authorisation

The server derives Coach age-group permissions from the authenticated user's database assignments. It does not trust age-group names supplied by the browser.

The following Edge Functions enforce personal Coach sessions and database-backed age-group assignments:

- `admin_fixtures`
- `manage_match_child`
- `create_fixture`
- `publish_fixture`

A Coach may only manage or publish a fixture when every age group attached to that fixture is assigned to that Coach. Availability detail responses are filtered to the Coach's assigned groups.

### Parent and fixture security

- Parent PINs use per-account salts and PBKDF2-HMAC-SHA256 with 210,000 iterations.
- Failed parent PIN attempts are counted atomically and accounts are temporarily locked after five failures.
- Fixture links use cryptographically random tokens. Only token hashes are used for lookup; the recoverable token is encrypted at rest for authorised administration.
- Parent editing uses separate high-entropy edit tokens, hashed in storage, with expiring edit locks.
- Parent family invitations use expiring, single-use hashed tokens.
- Parent-facing fixture access is limited by the unguessable fixture token; response submission additionally requires the parent's PIN.

### Database exposure

Verified against the live Supabase project:

- All 46 tables in the exposed `public` schema have Row Level Security enabled.
- No public table is missing RLS.
- The `anon` role has zero direct INSERT, UPDATE or DELETE table grants.
- Anonymous direct SELECT is limited to the public age-group and season lookup tables.
- The unused installation-wide user lookup RPC has had EXECUTE revoked from PUBLIC, anon and authenticated.

## Supabase advisor findings

The Supabase advisor reports SECURITY DEFINER function execution warnings because this application uses a custom PIN/session authentication model rather than Supabase Auth for end-user sign-in.

These RPCs are the application's API boundary. Restricted operations validate a personal session, installation, Coach age-group assignment, Senior/Admin PIN or System Admin PIN inside the function or the trusted Edge Function that calls it. Public read-only helpers are limited to login account resolution, installation lock status and published policy content.

The advisor cannot determine whether those internal checks are correct from the EXECUTE grant alone. The warnings should therefore be read alongside this access-control design and the function-level checks, not treated as proof of unauthorised table access. Direct anonymous table writes remain disabled.

## Verification performed

- Confirmed all 46 public tables have RLS enabled.
- Confirmed zero anonymous direct table write grants.
- Confirmed an invalid personal Coach session is rejected.
- Confirmed a legacy shared Coach credential is rejected by the operational Coach identity lookup.
- Confirmed the unused installation-wide user lookup RPC is not executable by anon or authenticated.
- Confirmed the four hardened fixture/availability Edge Functions are deployed and their source matches the canonical GitHub `main` branch.

## Additional maintenance review — 20 November 2026

- Reviewed retention scheduling and policy execution; scheduled daily retention runs were completing successfully at the time of review.
- Corrected manual archived-player anonymisation so player-level retention holds block the action and linked Match Availability child names are anonymised consistently, while preserving attendance history and player identifiers.
- Reviewed offline and connection-failure behaviour. The application requires an online Supabase connection for operational data; it does not maintain an offline attendance database.
- Confirmed the latest canonical Club Check-In release and production mirror workflows completed successfully on 20 November 2026. The deployed PWA version is V3.6.9.

Operational limitation: source and automated checks do not replace live end-to-end testing with actual parent, Coach and Senior/Admin accounts. Backup restoration has not yet been demonstrated.

## Governance remaining

The Club must review and approve the policy content, retention periods, responsibilities and contact details before treating the policies as formally adopted. Technical implementation does not itself constitute Club approval or a legal compliance certification.


## Supplementary review — First-Aider Management (22 November 2026)

A System Admin-only first-aider volunteer register has been added.

- Tables: \`first_aider_volunteers\` and \`first_aider_age_group_assignments\`.
- Both tables have RLS enabled and direct table privileges revoked from \`PUBLIC\`, \`anon\` and \`authenticated\`.
- The four RPCs (\`get_first_aider_admin_data\`, \`save_first_aider\`, \`set_first_aider_active\`, \`clear_dummy_first_aider_data\`) are \`SECURITY DEFINER\`, use an empty fixed search path and call the existing System Admin PIN verifier before accessing records.
- Browser access to the RPCs is granted to anon/authenticated only because the app's custom System Admin PIN model is not Supabase Auth; every RPC independently verifies the PIN. This is not a public unauthenticated data path.
- One main assignment per volunteer is enforced by a partial unique index. Additional assignments are stored separately and do not count as main coverage.
- Main-cover gaps are calculated from active volunteers and their main assignments only. Shared assignments do not close a gap.
- Optional pitch is operational allocation information, not a qualification or medical record.
- Demonstration records are marked \`is_dummy=true\`; cleanup deletes only those records and cascades their assignments.
- Retention policy \`first_aider_volunteers\` is enabled as manual review only, with automatic enforcement disabled and no period invented.
- The live policy content now identifies System Admin access to volunteer names and age-group/pitch allocations. The public privacy notice wording and retention schedule have also been amended to describe the data.

**Verification evidence:** database metadata confirms both tables have RLS enabled; RPC grants are limited to anon/authenticated plus database owner; the live database contains only three clearly marked demonstration volunteer rows with the agreed U6–U10 example assignments. This metadata check is not an end-to-end hostile HTTP access test. A manual app/UI test using the club's System Admin session and a negative unauthorised RPC test remain part of release acceptance.


## Supplementary review — System-wide DUMMY Data Management (22 November 2026)

A System Admin-only DUMMY data manager has been added to the System Admin home screen.

- Runtime files: `index.html`, `js/dummy-data-admin.js`, `js/retention-admin.js` and `js/first-aider-admin.js`.
- Database migrations: `system_wide_dummy_data_management`, `dummy_data_identity_and_link_safeguards`, `refine_dummy_identity_and_availability_cleanup`, `protect_non_dummy_availability_during_dummy_cleanup`, `protect_genuine_season_planner_data_during_dummy_cleanup` and `retire_first_aider_only_dummy_cleanup`.
- RPCs: `get_dummy_data_summary` and `clear_dummy_data`. Both use `SECURITY DEFINER`, an empty fixed `search_path`, and the existing `_verify_system_admin_pin` verifier. That verifier locks after five failed attempts for 15 minutes and records attempts in the System Admin audit log. The RPCs are exposed to anon/authenticated only to support the app's custom PIN model; the System Admin PIN is checked inside each function.
- The cleanup uses explicit identifier fields, not a broad scan of arbitrary text. It covers DUMMY players, first-aider volunteers, fixture opposition, parent submission names, child availability names, season-planner event titles/opposition, schedule names, break labels and season names, plus linked demonstration attendance and coach notification outbox rows.
- Access/user accounts, Parent access accounts, credentials, installations, sessions, personal-data request cases, age-group reference configuration, security logs, audit history, retention policies/runs and retention holds are excluded from deletion.
- Attendance registers are retained. Attendance records for DUMMY players are removed; historical summaries for mixed registers are recalculated. A DUMMY season is removable only when it is not current, contains no genuine attendance, and contains no non-DUMMY schedules, breaks or planner events. Non-DUMMY availability linked to a DUMMY player, a DUMMY parent/fixture with genuine linked responses, or genuine planner records linked to DUMMY schedules/breaks/seasons block the entire transaction. Active retention holds also block the entire transaction.
- Database triggers preserve the DUMMY prefix on edits. The first-aider edit and active-status RPCs now allow DUMMY records while retaining their `is_dummy` marker.
- No new personal-data fields or collection purposes were introduced. The existing privacy notice and retention configuration were inspected; no policy text or retention setting was changed.

**Current preview counts (22 November 2026; not cleared):** 45 DUMMY players, 51 linked attendance records, 8 affected registers, 1 DUMMY fixture, 3 DUMMY submissions, 19 DUMMY availability responses, 3 DUMMY season-planner events and 3 DUMMY first-aider volunteers. No DUMMY schedules, breaks, seasons or queued coach notifications were found. The eight affected attendance registers are retained.

**Acceptance status:** migration and RPC definitions are deployed; a System Admin preview and cleanup have not yet been run using the club's live System Admin session. The GitHub JavaScript syntax and PDM browser smoke checks must pass for the final release, followed by mirror/Cloudflare/public asset verification and manual System Admin UI acceptance. Do not claim the destructive cleanup has run until the System Admin action confirms success.


**Release verification update — 22 November 2026:** Canonical and production mirror source were checked at version `V4.0.4` and service-worker cache `club-check-in-v1271-no-local-player-cache`; the corresponding source files match. The PWA Versioning and Syntax Check and PDM Browser Tests passed for the reviewed code changes. The production sync workflow completed successfully. Cloudflare Pages deployment for the latest mirror commit was still completing at the time of the last check. A direct public service-worker response still returned the preceding cache version, so the public deployment is not yet confirmed fully current. Manual System Admin preview/edit/status acceptance and the global cleanup action have not been run. The cleanup RPC remains System Admin PIN-gated and has not been executed.
