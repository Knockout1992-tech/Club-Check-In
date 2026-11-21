# Club Check-In — AI Change-Control, Security & Privacy Master Prompt

**Purpose:** This document is the mandatory starting point for any future ChatGPT work on Club Check-In. It records the known architecture, operating decisions, security expectations, privacy requirements and working rules. It is a control document, not proof that every item has been re-tested or that the Club has formally approved its policies.

**Club:** Rushden & Higham RUFC  
**Main application:** https://rhrufc-mini.pages.dev  
**Main repository:** https://github.com/Knockout1992-tech/Club-Check-In  
**Canonical production branch:** `main`  
**Documentation branch created for this file:** `docs/club-checkin-master-prompt`  
**Supabase project reference:** `muxxlewtqhpckhoqeinn`  
**Related Match Availability site repository:** `Knockout1992-tech/Club-Match-Availability`  
**Last consolidated:** 21 November 2026  
**Current source version constant observed in `js/config.js`:** `V3.7.4` (this is a source-code value; verify the actual live deployed version before relying on it).

---

## 0. Mandatory instruction to ChatGPT — read this first

You are assisting with a live, operational club system used by parents/guardians, Coaches and club administrators. Treat this as a production system holding information about children. Your job is to improve it without breaking existing working behaviour or collecting unnecessary information.

**Before suggesting or making any amendment:**

1. Read this entire file.
2. Read the current `README.md`, `CLUB-OPERATING-GUIDE.md`, `SECURITY-REVIEW.md`, relevant source files, current migrations and the current live privacy/retention policy.
3. Confirm which repository, branch, deployment and environment the requested change concerns. Do not assume that the local/default branch, a Pages deployment, a Supabase Edge Function and the live database are all at the same version.
4. Inspect the current implementation before relying on this document. This file is a handover and control baseline, not a substitute for checking current code and live configuration. If it conflicts with current verified evidence, explain the discrepancy and ask before changing the design.
5. State what you intend to change, which files/functions/tables are affected, what could break, how it will be tested, and how it can be rolled back.
6. Do not make a change until the user has authorised that change. A request to investigate, review, audit, test or prepare a plan is **not** permission to amend code, database permissions, records, policies or production configuration.
7. Do not deploy, merge, publish, run migrations, change Supabase permissions, edit live policy text or alter production data unless the user explicitly authorises that action.
8. After an authorised change, verify the exact change and report the tests actually completed. Never say that something is fixed, healthy, secure or working unless the relevant verification supports that statement.

### Working style and change control

- Work incrementally and keep explanations concise, practical and direct.
- Preserve working functionality. Avoid broad rewrites, speculative refactoring and unnecessary architecture changes.
- Do not create branches for ordinary implementation work or deploy from a branch. The user has previously experienced branch/deployment confusion and prefers direct, controlled work on the canonical `main` branch. This documentation branch is a deliberate exception requested solely to hold this reference file; it is not a deployment branch.
- Do not push to `main`, merge, deploy or trigger a production sync without explicit approval.
- Do not create a separate test site or duplicate project unless specifically requested.
- Prefer the smallest safe change. Do not silently rename database objects, alter function signatures, change authentication flows, or replace UI components.
- Preserve the current UI style and custom alert/confirmation experience. Do not introduce native browser `alert()` or `confirm()` dialogs where the app uses its own UI.
- Avoid asking the user to repeat information already present here or in the repository. If an essential detail is genuinely missing, ask one focused question.
- The user may be working from an Android phone and may not have convenient access to browser developer tools. Prefer checks that can be performed through the app, controlled diagnostic screens, repository inspection or safe server-side verification.
- Do not expose internal implementation details, secrets or private family data in user-facing diagnostics.
- Do not over-engineer. Security must be proportionate to the system, but assume hostile users may be imprecise, persistent and willing to probe public endpoints.

### Hard production-safety rules

- Treat the live database and deployed application as production.
- Do not run destructive SQL, mass updates/deletes, test account creation, guessed PIN attempts, bulk submissions, fixture publication/cancellation, retention jobs, anonymisation or account resets as an exploratory test.
- Never use real Parent, Coach, Admin or System Admin credentials in chat or logs.
- Never request, print, commit or expose PINs, session tokens, fixture tokens, invitation tokens, edit tokens, service-role keys, webhook secrets, HMAC secrets, passkey private material or database credentials.
- Never test access by viewing or exporting real children's records unless the user has explicitly authorised a controlled test and the data is strictly necessary.
- Use synthetic test data in an isolated environment wherever possible. If an isolated environment does not exist, explain the risk and agree a safe test method first.
- A database query that reads metadata/permissions is not the same as an end-to-end HTTP attack test. Label the evidence accurately.
- Do not assume that a function is secure merely because it is named “admin”, “private” or “verify”. Inspect its implementation and every caller.
- Do not assume that `verify_jwt: false` means a function is vulnerable. Inspect its custom authentication and authorisation checks.
- Do not assume that `SECURITY DEFINER` is safe because RLS is enabled. Inspect grants, function body, search_path, caller identity and every data path.

---

## 1. System purpose and data-minimisation philosophy

Club Check-In supports Rushden & Higham RUFC youth rugby administration. It is deliberately designed to collect and retain only the information needed to operate the club's relevant processes.

Core principles:

- **Data minimisation by design.** Do not add data fields, parent contact details, medical details, addresses, dates of birth, photographs, analytics or other personal data unless there is a clear operational need, the user approves the requirement, and the privacy notice and retention design are updated accordingly.
- Parent communication is normally through the club's existing WhatsApp arrangements. The Match Availability system was deliberately designed not to require parent phone numbers or email addresses.
- Do not turn the intentionally limited parent portal into a public directory or an advertised general registration service.
- Do not collect biometrics. Passkeys use the device/platform authenticator; biometric processing (where used by the device) is handled by the device and is not sent to the Club by this application.
- Do not add tracking, advertising, third-party analytics or unnecessary external services.
- Keep the distinction between an operational record, an audit trail, a temporary security token and a policy/retention configuration clear.
- Data retention and anonymisation must be deliberate, documented and consistent across linked records. Do not silently delete history or bypass a retention hold.
- Historical attendance may need to remain meaningful after a player's identifying details are anonymised. Preserve the relationships and historical facts required by the approved retention design.

The system is not a general-purpose CRM and must not drift into one.

---

## 2. Applications, repositories and deployment boundaries

### 2.1 Main Club Check-In PWA

- Live URL: `https://rhrufc-mini.pages.dev`
- Repository: `Knockout1992-tech/Club-Check-In`
- Canonical source branch: `main`
- Frontend is a browser-based Progressive Web App.
- Supabase provides database, RPC and Edge Function services.
- The app requires an online connection for operational data. It is not an offline attendance database.
- The service worker uses a network-first strategy for same-origin GET requests and maintains an app-shell/cache fallback. It is configured not to retain a local player database. Review the current service worker before changing caching behaviour.
- The source version constant observed in `js/config.js` is `V3.7.4`; verify the deployed version independently.

### 2.2 Match Availability

- A separate Match Availability site/repository exists: `Knockout1992-tech/Club-Match-Availability`.
- The main Club Check-In repository also contains the canonical Match Availability Edge Function source and Admin/Coach integration.
- Parent-facing fixture links are shared by the club, normally through WhatsApp.
- Do not merge the separate site and the main PWA into one deployment or assume their release processes are identical.
- Confirm which repository is the source of truth for each requested file before editing.
- The Parent portal uses a fixture reference/token in its URL. Do not change token/query-string formats without tracing both the link generator and recipient portal.

### 2.3 Production synchronisation

The main repository contains GitHub workflows including:
- `.github/workflows/sync-production.yml`
- `.github/workflows/syntax-check.yml`
- `.github/workflows/pdm-browser-tests.yml`

Read the current workflow files before any push or deployment. Understand exactly which branch/event triggers production synchronisation and which remote/site it updates. A successful GitHub commit is not proof that the Pages deployment or Edge Functions have updated.

### 2.4 Current source layout observed

The main repository includes, among other files:

- `index.html` — main app shell and page markup.
- `js/config.js` — app version and shared state/configuration.
- `js/helpers.js`, `js/storage.js`, `js/supabase.js`, `js/connection.js` — common helpers, local storage, Supabase client and connection handling.
- `js/auth.js` — individual user authentication, Parent/Coach/Admin session and passkey-related UI/logic.
- `js/pin.js` — PIN workflow/legacy or role-specific PIN screen; verify whether each path is still active before editing.
- `js/players.js`, `js/ageGroups.js`, `js/attendance.js`, `js/seasons.js`, `js/season-planner.js`, `js/roster.js` — player, age-group, attendance, season and planning features.
- `js/senior.js` — Admin/Senior dashboard and administration features, including Match Availability integration.
- `js/navigation.js`, `js/shell.js` — navigation and UI shell.
- `js/notifications.js` — notifications.
- `js/diagnostics.js` — diagnostics.
- `js/personal-data-admin.js`, `js/retention-admin.js` — personal data requests, retention and privacy administration.
- `service-worker.js`, `manifest.json` — PWA configuration.
- `supabase/functions/` — Edge Function source.
- `supabase/migrations/` — tracked database migration SQL.
- `CLUB-OPERATING-GUIDE.md` — operational guide.
- `SECURITY-REVIEW.md` — security review (must be kept current).

The script loading order in `index.html` matters. Before moving, renaming or adding scripts, inspect the actual current script list and dependencies. A previously encountered live issue was caused by a required script being omitted from the live HTML, so verify the deployed script list rather than assuming a local file is loaded.

---

## 3. Roles and access boundaries

Use these user-facing role names in documentation and UI:

| User-facing role | Purpose | Expected boundary |
|---|---|---|
| Parent/Guardian | Manage their own family details and submit/review their children's fixture availability | Own family and authorised fixture responses only |
| Coach | View assigned age groups, relevant match responses and attendance functions where used | Only assigned age groups; no user-management authority |
| Admin | Club administration, fixtures, seasons and player administration | Administrative operations permitted by the app; not automatically System Admin |
| System Admin | Restricted user/access management and protected system-level configuration | Only specifically authorised people and operations |

Internal database identifiers may retain historical names such as `senior`; do not expose confusing internal terminology to users.

Rules:
- Never trust a role, person ID, age-group ID, fixture ID or permission supplied by the browser as proof of authority.
- The server must resolve identity and authorisation from the trusted session/installation and database records.
- A Coach must not be able to access or administer an unassigned age group by changing a request parameter.
- A Coach must not be able to add/manage users, reset protected accounts or perform System Admin operations.
- An Admin is not automatically a System Admin.
- Deactivating a user should revoke active sessions, installation access and passkeys as designed. Verify all related paths when changing deactivation.
- Enforce authorisation in the database RPC or trusted Edge Function, not just by hiding a button in the UI.

---

## 4. Authentication, sessions and installation model

The application has a custom PIN/session authentication model rather than relying on Supabase Auth for all end-user identities. This makes the database RPCs and Edge Functions a critical security boundary.

### 4.1 Installation approval

- Each installation has a generated installation identifier (historically stored in local storage as an `INSTALL-...` identifier).
- Installation approval/registration is part of the access model.
- A download/installation code is used during installation approval; the database validates it and applies lockout controls.
- Approved user status and active installation state must be checked by trusted server-side logic.
- The design prevents one approved user from silently creating unlimited active installations.
- Do not weaken installation approval or remove installation binding without explicit approval and a security review.

### 4.2 Individual Coach/Admin identity

- Coaches and Admin users use individual personal PINs and/or registered passkeys for normal access.
- The legacy shared Coach PIN is intended only for the one-time personal PIN setup path, not routine Coach operations.
- Personal PIN setup requires the relevant existing shared/authorised credential and approved user identity.
- Personal PINs are stored as bcrypt hashes; PIN fingerprints use a server-held HMAC key.
- Successful authentication creates a cryptographically random session token. Only a hash of the session token is stored server-side.
- Sessions are installation-bound, expire after two hours and can be revoked.
- The current UI also implements client-side idle/absolute timeout handling. Verify both client and server expiry; client-side timers are not a substitute for server enforcement.
- Do not store verified PINs or session tokens in localStorage, sessionStorage, URLs, logs or analytics. Session credentials should remain in memory as designed.

### 4.3 Parent account and PIN

- Parent accounts are deliberately lightweight and are not a public club membership-registration workflow.
- A parent can establish/use an account through the fixture/Parent portal route.
- Parent PINs use per-account salts and PBKDF2-HMAC-SHA256 with 210,000 iterations (verify current source before relying on this exact setting).
- Five failed PIN attempts trigger a temporary ten-minute lock (verify the current atomic implementation and any per-account/per-installation details).
- Parent PIN recovery is not currently self-service. Do not add a recovery route that requires the Club to collect more contact details without a separate approved privacy/design decision.
- Do not expose whether an account exists, its internal ID, its protection status or PIN-setup state through a public account-enumeration endpoint.
- Parent identity and family isolation must be enforced server-side, not merely by filtering the visible UI.

### 4.4 Passkeys and remembered name

- Passkeys use WebAuthn challenges and verification, including origin checks and short-lived challenges.
- A return visit may pre-fill the remembered account name and automatically attempt passkey authentication when a passkey is registered.
- If passkey authentication is unavailable or unsuccessful, the user must still be able to use the personal PIN route.
- Biometric information (fingerprint/face recognition) is handled by the device/platform authenticator and is not transmitted to the Club through the application.
- Passkey registration is optional and must not block a successful PIN login if registration fails.
- Do not describe a passkey as the Club storing a fingerprint or face scan.
- Verify current behaviour and exact policy wording before changing remember-me, name prefill, automatic passkey attempt, passkey registration or fallback behaviour.

### 4.5 Security-sensitive implementation details

- The Edge Function `club_checkin_passkeys` uses a service-role Supabase client for trusted server-side operations. The service-role key must never be sent to the browser.
- Never expose service-role keys, webhook secrets, PIN hashes, HMAC keys or token hashes in client code or logs.
- All `SECURITY DEFINER` functions require careful review of grants, body, fixed `search_path`, identity validation and data returned.
- Do not add broad `GRANT EXECUTE` privileges as a quick fix.
- A public function that returns account/person metadata is an account-enumeration surface even if it does not return a PIN.
- Review overloads individually. PostgreSQL functions with the same name but different signatures can have different permissions and behaviour.

---

## 5. Match Availability design

Match Availability is intentionally designed to minimise parent data collection.

### Parent-facing behaviour

- Parents open a fixture-specific link supplied by the club.
- Parent authentication uses the Parent account name and PIN.
- Parent can add/select children and provide an availability status such as Available, Unavailable or Unsure.
- Parent can return to review family responses.
- Editing may use a separate high-entropy edit token, expiry and edit-lock mechanism.
- Family sharing uses a separate single-use, expiring invitation token.
- Parent-facing portal should not require parent phone number or email address merely to submit availability.
- Parent contact remains through existing club communication routes unless a formally approved requirement changes.

### Coach/Admin behaviour

- Admin creates and manages fixtures and selects age groups.
- Fixture links are generated for sharing by the club.
- Coaches can view availability for their assigned age groups.
- Coaches must not see responses for age groups they are not assigned to.
- Admin/Coach visibility must be checked server-side.
- Fixture status, deadline, cancellation and editing rules must be consistent between the app, Edge Functions and privacy/retention description.

### Edge Functions observed in the live project

The Supabase project reported these deployed functions (all were listed with `verify_jwt: false`; that setting alone does not establish a vulnerability because custom authentication is used):

- `coach_push_dispatch`
- `get_fixture`
- `coach_push_subscriptions`
- `submit_availability`
- `parent_home`
- `manage_match_child`
- `manage_submission`
- `club_checkin_passkeys`
- `manage_parent_family`
- `create_fixture`
- `publish_fixture`
- `admin_fixtures`
- `public_retention_policy`

For every function change, check:
- Authentication and role/session validation.
- Installation binding where applicable.
- Parent family ownership.
- Coach age-group authorisation.
- Fixture token validation.
- Request validation and size limits.
- Rate limiting/lockout and replay handling.
- Error messages and information disclosure.
- Whether the function uses service-role access and, if so, whether every requested operation is explicitly authorised.
- Whether its deployed source matches the canonical repository source.

Do not treat a fixture token as a substitute for Parent authentication when submitting or changing family data.

---

## 6. Attendance and player management

- Attendance is organised by season, register date and age group.
- Relevant tables observed include `attendance_registers` and `attendance_records`.
- A register has a submitted/closed state and may be automatically closed by the housekeeping function.
- Attendance records link to players and registers.
- A player added to an already-open destination register should be present as absent until marked otherwise.
- When a player moves age group, the system must preserve historical records and correctly handle an existing open destination register.
- Attendance is currently not relied on as the club's routine attendance process. Do not claim it is the club's formal attendance system unless the Club changes that decision.
- The app requires an online connection for operational data; there is no offline local attendance database.
- Weekly attendance trends, where enabled, compare current/previous periods and must not rewrite historical attendance.
- Player archiving and anonymisation are separate operations.
- Anonymisation must preserve the historical attendance relationships required by the design and must handle linked Match Availability child names consistently.
- Retention holds must prevent prohibited deletion/anonymisation. Never bypass a hold to make a workflow complete.
- Do not perform mass archive/anonymisation/retention actions as a test.

---

## 7. Database and Supabase security baseline

### 7.1 Database objects and exposure

- Supabase project reference: `muxxlewtqhpckhoqeinn`.
- The exposed `public` schema has been reviewed for RLS.
- A previous live check found all 46 public tables had RLS enabled.
- Anonymous direct table writes were previously confirmed absent.
- Anonymous direct SELECT was limited to intentionally public lookup data such as age groups and seasons at the time of review.
- Re-run current metadata/permission checks before relying on these historical results. Table count, grants and policies can change.
- Sensitive tables include (not exhaustive) approved users, PIN credentials, sessions, installations, players, attendance, Parent family/submission/availability data and fixtures.
- RLS must remain enabled on exposed tables. Policies must enforce the actual data boundary, not merely permit any authenticated request.

### 7.2 SECURITY DEFINER functions and RPCs

- The app uses custom PIN/session authentication; many protected database operations are implemented as RPCs.
- Review every public-schema SECURITY DEFINER function for:
  - EXECUTE grants to PUBLIC, anon, authenticated and service_role;
  - exact overload/signature;
  - fixed and safe search_path;
  - validation of supplied user/session/installation/role;
  - row ownership and age-group scope;
  - return values and account enumeration;
  - dynamic SQL/injection risk;
  - lockout/rate limiting;
  - whether a public caller can cause side effects;
  - whether service-role access is genuinely required.
- A SECURITY DEFINER warning from Supabase Advisor is not automatically proof of a breach, but must not be dismissed without reviewing the function.
- Do not grant PUBLIC/anon/authenticated execution simply to silence a permission error.
- Prefer the narrowest required role. If a function is only called from a trusted Edge Function using service_role, restrict it accordingly.
- A database function's UI caller is not proof that the caller has permission. Trace the real API request and PostgreSQL role.

### 7.3 Current security clean-up performed on 21 November 2026

The following permission changes were made directly against the live Supabase database after a security review. They were verified by querying effective privileges after the change:

1. `public.get_personal_pin_login_status(text)`
   - EXECUTE revoked from `anon` and `authenticated`.
   - EXECUTE retained for `service_role`.
   - Reason: the function returned internal person ID, display name, protected-user status and whether personal PIN setup was required. It did not return PINs or child records, but exposed unnecessary account-enumeration information.
   - The trusted `club_checkin_passkeys` Edge Function calls it using a service-role client.

2. `public.get_installation_access_lock_status()` (no-argument overload)
   - EXECUTE revoked from `PUBLIC`, `anon` and `authenticated`.
   - Reason: the no-argument overload read an installation ID from request headers and returned whether that installation was locked. The current repository search found the frontend uses the text-argument overload, not this no-argument overload.

3. `public.get_installation_access_lock_status(text)`
   - Was already restricted to the database owner and was left unchanged.
   - **Important unresolved compatibility issue:** current `js/pin.js` calls this text-argument RPC from the browser after an unsuccessful PIN verification. Its current permission state does not grant anon/authenticated EXECUTE. The call can therefore fail and the UI may fall back to a generic “Incorrect PIN” message rather than accurately report a lock. This needs a controlled review and an approved fix; do not simply grant it publicly without assessing what it reveals and how the caller is authenticated.

4. **Important unresolved compatibility issue:** current `js/auth.js` contains a direct browser-side fallback call to `get_personal_pin_login_status(text)`. That direct call no longer has anon/authenticated permission. The primary passkey name lookup is performed by the trusted `club_checkin_passkeys` Edge Function using service_role. The fallback path must be traced and safely removed or replaced if still reachable. Do not re-enable public account enumeration merely to make the fallback work.

These database permission changes were applied using direct SQL execution. They were not, at the time of writing, confirmed as represented by a committed migration in the repository. Treat this as potential schema/migration drift. Before making further database changes, inspect current live grants and migration history. If an approved migration is needed, prepare and review it carefully; do not replay or duplicate changes blindly.

### 7.4 What has and has not been tested

Previous technical review included:
- RLS status and table grants inspection.
- Checks that fake Coach/Admin session tokens were rejected by the database verifier.
- Checks that unregistered installations were denied by installation approval logic.
- Source review of Parent, Coach, Admin and fixture Edge Functions.
- Source review of Parent PIN hashing/lockout, fixture/edit/invitation tokens and passkey challenge handling.
- Review of Coach age-group scoping and role checks.

**Not established by those checks:**
- A full set of adversarial HTTP requests against every deployed Edge Function.
- A completed cross-family Parent IDOR test using controlled test accounts.
- A completed cross-Coach age-group isolation test using controlled Coach accounts.
- A complete live end-to-end test of PIN and Passkey login after the 21 November permission changes.
- A verified production backup restore.
- A formal penetration test or independent security certification.

Be exact about these limitations. Do not report “no vulnerabilities” merely because RLS is enabled or source code appears correct.

---

## 8. Privacy policy, retention and data protection — mandatory alignment

**The privacy notice is a living, separate source of truth and must match what the application actually does.** The user has been updating the policy separately. Do not overwrite, simplify, publish or claim approval of it as part of an unrelated code change.

### 8.1 Required review before any feature change

Before adding, removing or changing any collection, processing, sharing, authentication, storage, retention, deletion, anonymisation, notification or third-party integration:

1. Read the current live privacy notice at the app's current policy route (the user has previously referred to `https://rhrufc-mini.pages.dev/policies`; verify the live route and content rather than assuming it has not changed).
2. Read the current policy/retention configuration in the database and the current public retention policy endpoint.
3. Inspect the actual implementation and data flows, including Edge Functions, database tables, logs, service worker/browser storage, push subscriptions and third-party services.
4. Compare each real data item and purpose with the policy. Identify omissions, overstatements and stale wording.
5. Check that the retention periods described publicly match the live configured periods and enforcement logic.
6. Check that the policy accurately describes who can see information (Parent, assigned Coach, Admin/System Admin, hosting/database providers and any other actual recipients).
7. Check that the policy explains the real authentication model, including Parent PINs, individual Coach/Admin PINs, installation binding, passkeys, remembered-name behaviour and fallback to PIN.
8. Check the actual family-sharing, invitation, editing and fixture-link behaviour.
9. Check the actual deletion/anonymisation process, holds, audit records and any information retained after an account is removed.
10. Present discrepancies and proposed wording to the user. Do not change the policy or mark it approved without explicit instruction.

### 8.2 Passkey and remembered-name wording

The policy must not imply that the Club receives or stores a fingerprint/face scan if WebAuthn uses the device's authenticator. The policy should accurately explain:
- A remembered account name may be pre-filled on return visits.
- If a passkey is registered, the app may automatically attempt passkey authentication.
- The device's own security method (fingerprint, face recognition or device screen lock) is handled by the device/platform.
- Biometric information is not sent to the Club through Club Check-In.
- If passkey authentication is unavailable or fails, the user can still sign in with their personal PIN.

Verify these statements against the current live implementation and exact current privacy notice before editing either side.

### 8.3 Parent data and family sharing

The policy and implementation must align on:
- The fact that parent registration is deliberately not advertised as a general public registration process.
- The Parent account name/PIN and child details actually collected.
- Fixture-specific access and the availability information shown to Parents.
- Family-sharing invitations, expiry, single-use behaviour and the data shared.
- Whether a family is linked by a verified family relationship or by a fallback matching process. Do not claim stronger identity verification than is implemented.
- The absence of parent phone/email collection unless the current implementation has changed.
- Parent PIN recovery limitations and any manual support process.
- Who can see responses: the Parent/family, assigned Coaches and authorised Admins as implemented.

### 8.4 Retention, access requests and anonymisation

- Retention periods are configurable and must be read from the live policy configuration, not guessed from old documentation.
- Do not hardcode or invent retention periods in the app, policy, help text or this master prompt.
- Some record types may be held for manual review where no approved retention period is configured.
- Retention holds must be honoured by automated and manual actions.
- The system includes personal-data management workflows for requests, review, export, correction and erasure/anonymisation. Inspect the current implementation before describing the exact rights workflow.
- A data export must be limited to the verified requester and relevant family relationship; do not disclose other family members' records without appropriate authority.
- A request being received, prepared, reviewed, approved, sent or completed are different statuses. Do not claim an action is complete until the system and responsible person confirm it.
- Keep policy statements factual. Do not invent legal bases, statutory retention periods, suppliers, contact details, committee approval or compliance claims.
- The Club's policy/retention governance must be approved by the appropriate Club authority. Technical implementation is not itself legal advice or proof of GDPR compliance.

### 8.5 Privacy policy status caution

Repository code/comments and the existing operational/security documents have previously indicated that the Club privacy notice and retention governance still required Club/committee review and approval. That status may since have changed. Verify the current live policy and the Club's approval status before repeating it as current fact.

---

## 9. Security review method — “assume hostile traffic”

When asked to review security, be adversarial and systematic, but do not damage production.

Review these attack surfaces:

1. Public website and PWA assets: exposed configuration, source maps, accidental secrets, debug endpoints, stale files and caching.
2. Supabase Data API: table grants, RLS, policies, views, functions, overloads and schema exposure.
3. RPCs: unauthenticated calls, weak identity checks, IDOR/BOLA, enumeration, parameter tampering, replay, race conditions, lockout bypass and unsafe SECURITY DEFINER.
4. Edge Functions: JWT/custom auth, service-role use, origin/CORS, request validation, rate limits, response leakage, object ownership and side effects.
5. Parent portal: fixture token handling, account discovery, name squatting, family isolation, child ownership, invitations, edit tokens, duplicate submissions and expiry.
6. Coach portal: personal session, installation binding, age-group scope, fixture visibility, attendance access and deactivation/session revocation.
7. Admin/System Admin: role separation, PIN changes, protected users, user management, installation reset, fixture administration and destructive actions.
8. Passkeys: challenge generation/expiry, origin/RP ID, credential ownership, replay, registration authorisation, account lookup and fallback behaviour.
9. Browser/PWA: localStorage/sessionStorage, cache contents, XSS, DOM injection, CSP/security headers, service-worker update and stale-cache behaviour.
10. Push notifications: subscription ownership, endpoint secrecy, dispatch authentication, payload minimisation and revocation.
11. Retention and privacy operations: unauthorised export, cross-family disclosure, hold bypass, anonymisation gaps, premature deletion and audit trail integrity.
12. Operational resilience: backup configuration, restoration, deployment workflow, monitoring, error handling and incident response.

For each finding, report:
- Severity (Critical/High/Medium/Low/Informational) and why.
- Exact affected component/function/table/permission.
- Evidence: source inspection, SQL metadata, controlled test, live HTTP test or inference.
- Preconditions and realistic impact.
- Whether it is confirmed, suspected or a false positive.
- Safest remediation.
- Regression risks and tests required.
- Whether a production change is necessary.
- Whether privacy notice, retention policy, operating guide or security review needs updating.

Do not brute-force real users, guess real PINs, enumerate real children or create production records as a test. Use controlled synthetic accounts and an approved test fixture/environment.

---

## 10. Testing and release acceptance

Before an authorised change is considered complete, choose tests relevant to the change. Do not run unrelated tests merely to produce activity.

Minimum expectations where applicable:

- Syntax/lint/build checks pass.
- Existing browser smoke tests pass.
- The changed UI path works on a normal supported device/browser.
- Parent access cannot cross family boundaries.
- Coach access cannot cross assigned age-group boundaries.
- Admin and System Admin authority remain distinct.
- PIN and Passkey fallback paths work.
- Lockout and error messaging work without exposing account state.
- Data remains correct after connection loss/retry where relevant.
- Service-worker update/cache behaviour is correct.
- No new personal data is stored in browser caches or logs.
- Retention holds and audit trails remain intact.
- The current privacy notice and retention configuration still match implementation.
- Edge Function deployed version matches the reviewed source if a function was changed.
- Live deployment version matches the approved source after deployment.

Record which tests passed, failed, were skipped and why. “No errors seen” is not a test result. Do not use a successful syntax check as evidence of security.

---

## 11. Incident and recovery principles

If a security issue or suspected breach is found:
- Do not immediately delete records, reset accounts or rewrite logs.
- Preserve relevant evidence and timestamps.
- Identify the affected system, user scope and data categories without exposing them unnecessarily.
- Recommend containment that is proportionate and reversible where possible.
- Explain whether immediate credential/session revocation is warranted.
- Escalate to the Club's designated responsible person.
- Do not claim a legally reportable breach or decide regulator/data-subject notification obligations without the Club's responsible person and appropriate advice.
- Record what was changed, by whom, when, why and how it was verified.

If the app or Supabase is unavailable:
- Do not improvise an unapproved local copy of children's information.
- Do not repeatedly resubmit operations when save status is uncertain.
- The app is online-dependent and is not currently the club's routine attendance system.
- A GitHub repository is not a database backup.
- A backup workflow has previously been described as prepared but not configured, and no successful restore test was evidenced. Re-check current state before relying on this.

---

## 12. Known documentation and implementation items to reconcile

These are not blanket authorisations to fix anything. Verify current state first and then propose a safe, approved action.

1. **RPC permission compatibility:** after the 21 November 2026 live permission clean-up, `js/auth.js` still contains a direct fallback call to `get_personal_pin_login_status(text)`, while anonymous/authenticated execution has been revoked. Trace whether this path is reachable and whether it fails harmlessly or affects the PIN fallback.
2. **PIN lock-status lookup:** `js/pin.js` calls `get_installation_access_lock_status(text)` after an unsuccessful PIN check. The overload was observed as owner-only. Check whether the user-facing lockout message is affected. Do not restore public access without reviewing the information disclosure and authentication model.
3. **Migration drift:** the two permission revocations made on 21 November 2026 were applied directly to the live database and were not confirmed as tracked in a repository migration. Compare live schema/grants with migration history before preparing a migration.
4. **Security review document:** `SECURITY-REVIEW.md` predates the latest permission changes and includes statements about public login/installation helpers. Update it only after the live state and frontend compatibility have been fully reconciled.
5. **Operational guide version:** `CLUB-OPERATING-GUIDE.md` previously stated V3.6.9, whereas current source `js/config.js` reports V3.7.4. Verify production version and update the guide if needed.
6. **Privacy policy:** verify the current live `/policies` content and actual Club approval status. The policy has been updated in a separate workflow; do not overwrite it or assume this repository contains its complete current text.
7. **HTTP-level isolation testing:** a full controlled cross-family Parent test and cross-Coach age-group test have not been evidenced as complete.
8. **Backup/restore:** verify whether the backup workflow has since been configured and whether a restore has been successfully demonstrated.
9. **End-to-end health:** no complete PIN and Passkey login test was evidenced immediately after the 21 November permission changes. Do not state the app is fully healthy until the relevant flows have been checked.

---

## 13. Required response format for future work

When the user asks for a change, respond in this order:

1. **What I understand:** one or two sentences describing the requested outcome.
2. **What I checked:** exact files/functions/database objects and live state inspected.
3. **Impact:** what will change and what must remain unchanged.
4. **Risks:** likely regressions, data/privacy/security effects.
5. **Plan:** smallest safe sequence and verification steps.
6. **Approval gate:** clearly state whether you are waiting for permission to make the change. Do not proceed without it.
7. **After implementation:** list exact files/database objects changed, tests actually run, deployment status and any outstanding limitations.

If the user asks only for a review, provide findings and recommendations without modifying anything.

If the user asks to fix a specific issue, do not use that as permission to refactor unrelated areas. If a fix requires a wider change, stop and explain why before proceeding.

If the user says “go” after a clearly described plan, treat that as approval for the described scope only — not for unrelated changes, deployment, policy approval or destructive database actions.

---

## 14. Living-document requirement — mandatory for every chat

This file is the project's **living control document**, not a one-off handover note. Every ChatGPT conversation that works on Club Check-In must maintain it.

### Required behaviour in every new chat

1. Fetch and read the latest version of this file from the canonical repository and branch before doing any work. Do not rely on a copy pasted into an earlier conversation or on remembered context.
2. Check whether the requested task or any approved change affects the architecture, setup, repositories, deployment, roles, authentication, permissions, data flows, privacy, retention, security controls, testing, operating procedures or known issues.
3. If the work reveals that any statement in this document is wrong, stale, incomplete or newly verified, flag that discrepancy. Do not leave known misleading instructions in place.
4. When an approved change materially affects the system or its operating rules, update this document as part of the same work. Include the date, what changed, relevant files/functions/tables/configuration, verification performed and any remaining caveats.
5. If a task is investigative only and no change is authorised, do not silently amend production code or configuration. You may propose a documentation update; only commit it when the user has authorised the documentation change or has given standing approval for routine factual maintenance.
6. Do not record secrets, credentials, real PINs, tokens, personal data, identifiable child/family details or sensitive operational values in this file.
7. Keep historical findings clearly labelled with dates and status. Do not present an old finding as a current fact without re-verification.
8. Do not delete unresolved issues merely because a code change was attempted. Close an item only after its resolution has been verified.
9. Keep the document concise enough to remain usable, but detailed enough that a new chat can safely understand the system and its constraints.
10. Before finishing a task, explicitly state whether this living document needed updating. If it did, identify the section updated and provide the commit/branch reference. If it did not, say why.

### Where and how to maintain it

- The intended long-term canonical location is the root of `main` in `Knockout1992-tech/Club-Check-In`.
- Until the user confirms that this file has been moved to `main`, retrieve the current authorised working copy from the branch containing this document. Do not assume the temporary documentation branch is already the canonical location.
- Do not create another branch just to update this document. Follow the user's current branch/deployment instructions.
- Update the document through a reviewed GitHub commit, preserving its existing history. Do not overwrite unrelated edits.
- A documentation update is not permission to deploy the application, alter database state or publish a privacy policy.
- If the relevant code change is not yet approved, do not pre-emptively document it as implemented. You may record it as a proposal or unresolved item with its status clearly stated.

## 15. Copy-and-use prompt

The user can start a future Club Check-In conversation with the following instruction:

> **Before doing anything, fetch and read the latest `AI-CHANGE-CONTROL-AND-SECURITY-MASTER-PROMPT.md` from the Club-Check-In repository's canonical branch. Then read the current operating guide, security review, relevant source, migrations and live privacy/retention policy. Treat the master prompt as mandatory working rules and as a living document that you must maintain. Verify the current implementation rather than assuming the document is perfectly current. Do not amend code, database permissions, data, policies or production configuration until you have explained the proposed change, impact, risks and tests and I have explicitly approved it. Preserve working functionality, minimise data collection, keep the privacy notice aligned with actual behaviour, and do not deploy without separate approval. Whenever an approved change materially affects the system, update the master prompt in the same work, record what changed and how it was verified, and commit the documentation update. At the end of every task, tell me whether the living document was updated and where the change was committed.**

---

**Document control:** This file must be reviewed and maintained as part of every material Club Check-In change. Keep dated findings and distinguish confirmed live facts from historical notes, assumptions and unresolved items. Do not put credentials, secrets, personal data or real user identifiers in this document.
