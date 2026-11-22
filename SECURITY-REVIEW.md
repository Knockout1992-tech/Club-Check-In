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
