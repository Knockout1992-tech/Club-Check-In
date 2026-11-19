# Club Check-In Security Review

**Review date:** 19 November 2026  
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

- All 44 tables in the exposed `public` schema have Row Level Security enabled.
- No public table is missing RLS.
- The `anon` role has zero direct INSERT, UPDATE or DELETE table grants.
- Anonymous direct SELECT is limited to the public age-group and season lookup tables.
- The unused installation-wide user lookup RPC has had EXECUTE revoked from PUBLIC, anon and authenticated.

## Supabase advisor findings

The Supabase advisor reports SECURITY DEFINER function execution warnings because this application uses a custom PIN/session authentication model rather than Supabase Auth for end-user sign-in.

These RPCs are the application's API boundary. Restricted operations validate a personal session, installation, Coach age-group assignment, Senior/Admin PIN or System Admin PIN inside the function or the trusted Edge Function that calls it. Public read-only helpers are limited to login account resolution, installation lock status and published policy content.

The advisor cannot determine whether those internal checks are correct from the EXECUTE grant alone. The warnings should therefore be read alongside this access-control design and the function-level checks, not treated as proof of unauthorised table access. Direct anonymous table writes remain disabled.

## Verification performed

- Confirmed all 44 public tables have RLS enabled.
- Confirmed zero anonymous direct table write grants.
- Confirmed an invalid personal Coach session is rejected.
- Confirmed a legacy shared Coach credential is rejected by the operational Coach identity lookup.
- Confirmed the unused installation-wide user lookup RPC is not executable by anon or authenticated.
- Confirmed the four hardened fixture/availability Edge Functions are deployed and their source matches the canonical GitHub `main` branch.

## Governance remaining

The Club must review and approve the policy content, retention periods, responsibilities and contact details before treating the policies as formally adopted. Technical implementation does not itself constitute Club approval or a legal compliance certification.
