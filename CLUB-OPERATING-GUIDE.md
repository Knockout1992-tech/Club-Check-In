# Club Check-In — Club Operating & Recovery Guide

**Club:** Rushden & Higham RUFC  
**Application:** https://rhrufc-mini.pages.dev/club-check-in/  
**Match Availability:** Open the fixture link shared by the club  
**Document status:** Working operational guide — review with the club before formal adoption  
**Last reviewed:** 20 November 2026

---

## 1. Purpose and scope

This guide explains how the club should use Club Check-In and Match Availability, what each role is permitted to do, and what to do when something goes wrong.

It covers:
- Parents and guardians submitting match availability.
- Coaches viewing their assigned age groups and, if the club chooses to use it, recording attendance.
- Admin users managing people, access, fixtures, seasons and player records.
- Routine data retention and anonymisation.
- Basic troubleshooting and service recovery.

This guide reflects technical reviews and intermittent live use of the system. The main parent, Coach, Admin and attendance workflows have been exercised in normal use, but this has not been recorded as one formal end-to-end acceptance test. Section 10 identifies only the remaining follow-up points.

## 2. Roles and responsibilities

| Role | Main responsibilities | Restrictions |
|---|---|---|
| Parent/guardian | Open a fixture link, sign in, maintain their children’s details and submit availability | Can only access their own family information and authorised fixture responses |
| Coach | Access assigned age groups, view relevant match responses and record attendance | Cannot manage users or access unassigned age groups |
| Admin | Club administration, including fixtures, seasons and player records | Does not automatically have System Admin authority |
| System Admin | User and access administration and protected system-level operations | Reserved for specifically authorised users |

Use an individual account/session where provided. Do not share personal PINs or leave an authenticated device unattended.

## 3. Parents and guardians — Match Availability

### 3.1 Open a fixture

1. Open the fixture link shared by the club, normally through the club’s WhatsApp communication.
2. Check that the opposition and fixture details are correct.
3. If prompted, sign in using the parent account name and six-digit PIN.
4. A parent who has not registered can create an account through the portal.

Parent registration is intentionally not advertised as a public club sign-up route. The club shares fixture links with families.

### 3.2 Add children and submit availability

1. Add or select the child.
2. Check the child’s name, age group and school year.
3. Select one availability response: Available, Unavailable or Unsure.
4. Submit the response and check that the portal confirms it.

Only enter information requested by the portal. Do not enter medical details or other unnecessary personal information in free-text fields.

### 3.3 Return to Parent Home

Use the parent sign-in route and the same account details to return to Parent Home and review the family’s recorded responses.

### 3.4 Edit a response

Where editing is available, use the edit route supplied by the portal. Editing uses a separate, time-limited edit token and may be unavailable when the fixture is closed, the deadline has passed or an edit lock is active.

If editing is blocked, contact the club through its normal communication channel. Do not repeatedly submit duplicate responses.

### 3.5 Family invitations

A parent can use the family-sharing invitation process where offered. Invitations are single-use and expire after 24 hours. The corrected invitation link has been confirmed working in live use. If an invitation has expired or the link is invalid, ask the issuing parent to create a new invitation.

An invitation gives access to the intended family-sharing arrangement; it is not a PIN reset or general account recovery method.

### 3.6 Parent PIN problems

- Check that the correct parent account name and six-digit PIN are being used.
- Five failed PIN attempts can trigger a temporary ten-minute lock.
- Wait for the lock period to expire before trying again.
- There is currently no self-service parent PIN recovery.
- Do not send a PIN to a coach or post it in a WhatsApp group.

If access remains unavailable, refer the issue to the club’s designated Admin. Any manual account recovery process must be authorised by the club and should avoid collecting unnecessary personal information.

## 4. Coaches — attendance and match information

### 4.1 Sign in

1. Open Club Check-In.
2. Select the Coach sign-in route.
3. Use your individual personal PIN or registered passkey, where available.
4. Select an age group you have been assigned.

The operational Coach access model uses an individual session. The old shared Coach PIN is not intended for normal Coach operations.

If an expected age group is missing, ask a Admin to check your active age-group assignment. Do not try to access another Coach’s account.

### 4.2 Record attendance

1. Select the correct age group and register date.
2. Check that the correct register is open.
3. Mark each player present or absent.
4. Check any changes before leaving the register.

**Attendance changes are saved as they are made.** The Save/Leave action does not submit or lock the register. Do not assume that leaving the screen is what saves the attendance.

If the connection fails or the app reports a save error:
- Stop making further changes until the connection is restored.
- Reopen the register and check the recorded positions.
- Re-enter only changes that are genuinely missing.
- Do not assume an unsuccessful save has been stored.

Previous registers are handled by the system’s automatic close process on a subsequent login. Coaches do not need to treat Save/Leave as a register submission.

### 4.3 New players and GMS

A new player added to an open register is initially included as absent until attendance is recorded.

Coaches can make GMS-related suggestions for their assigned groups. Final GMS confirmation is a Admin-only operation.

### 4.4 Match Availability

Coaches can view fixtures and responses for their assigned age groups. Fixture access and response visibility are restricted by the age-group assignments held by the system.

If a fixture or child response is missing:
- Confirm that the fixture includes your assigned age group.
- Ask a Admin to check the fixture’s age-group allocation and your assignment.
- Do not request another Coach’s credentials.

## 5. Admin and System Admin operations

### 5.1 User and access management

Use the appropriate Admin area for the operation. System Admin functions are restricted to specifically authorised users.

Typical access-management tasks include:
- Adding or renaming manageable users.
- Activating or deactivating users.
- Assigning Coach age groups.
- Reviewing installation/device access.
- Resetting an installation where the system offers that operation.

Before deactivating a user or resetting an installation, confirm the identity and the reason for the change. Explain the impact to the affected user through the club’s normal communication route.

Deactivating a user is designed to revoke their active sessions, installation access and passkeys.

### 5.2 Fixtures

Admin users manage fixture creation, publication, changes and cancellation through Match Availability administration.

Before publishing:
- Check opposition and fixture date.
- Check venue and home/away details.
- Check the selected age groups.
- Check response deadline and fixture status.
- Share the generated fixture link through the club’s normal communication channel.

If a fixture is changed or cancelled, communicate the change to affected families and Coaches. Do not assume that an old shared link represents the latest fixture details without checking the portal.

### 5.3 Season planning

Use the season-planning functions for planned events and one-off events. Coach access is limited to assigned age groups; Admin operations have broader authority.

Check the date, event details and age groups before saving.

### 5.4 Player archiving and anonymisation

Archive players who are no longer active in accordance with club procedure. Permanent anonymisation is a separate action and should only be used when the club’s retention rules permit it.

Before manual anonymisation:
- Confirm the player is archived.
- Check whether a retention hold applies.
- Confirm the action is authorised.

The anonymisation process is intended to preserve attendance history and player identifiers needed for historical relationships while removing identifying player details. Linked Match Availability child names are also anonymised, subject to applicable record-level holds.

Do not use anonymisation as a routine way to correct a spelling mistake or remove a duplicate. Resolve the underlying record issue first.


### 5.5 First-Aider Management
 
The **First-Aider Management** function is available only inside System Admin and requires the separate System Admin PIN. First-aider volunteers do not need a Club Check-In account, PIN or installation.

System Admin records:
- Volunteer name.
- One main age group.
- Any additional/shared age groups.

The gap analysis is shown as a table by age group. An age group is **Covered** only when at least one active first aider has it as their main age group. Additional/shared cover is shown separately but does not remove a gap. For example, a volunteer whose main group is U8 and who additionally covers U6 and U7 leaves U6 and U7 shown as gaps unless each has its own active main first aider.

Use Deactivate when a volunteer is no longer providing cover; this removes them from active coverage without deleting their record. Reactivate when appropriate. Do not enter medical details, qualifications, expiry dates, parent contact details or children's information in this register.

The initial demonstration records are clearly labelled **DUMMY**. They are not real volunteers. DUMMY volunteers can be edited and deactivated/reactivated like other volunteers; their DUMMY identity is preserved when the name is changed. Use the separate **DUMMY Data** tool on the System Admin home screen to preview and clear demonstration records across the operational database. There is no longer a first-aider-only clear button. The global cleanup uses a confirmation step, checks retention holds and linked genuine records, and leaves access, security, audit and retention records untouched.

First-aider volunteer names and age-group allocations are currently held under manual retention review. No automatic deletion or anonymisation period has been approved. The existing **Start New Season** review also includes active first-aider assignments so an Admin can review their progression alongside Coaches. Admin access is limited to viewing and confirming the rollover assignments; adding, editing, deactivating or reactivating first-aider volunteers remains restricted to System Admin.

### 5.6 DUMMY Data Management

The **DUMMY Data** tool is available from the System Admin home screen. It previews demonstration records across the operational database before offering one global cleanup action. Review the counts before confirming. The cleanup is transactional: if it finds an active retention hold, genuine attendance inside a DUMMY season, or genuine responses linked to a DUMMY parent/fixture, the entire operation stops without partial deletion. Attendance registers are retained; attendance rows marked through a DUMMY player are removed and historical totals for mixed registers are recalculated. Security/access records, personal-data cases, audit history, retention configuration and age-group reference configuration are not cleared.

Do not use DUMMY labels for genuine club records. When editing a DUMMY record, keep the DUMMY prefix so it remains identifiable for the global cleanup.

## 6. Data retention and privacy

The system has automated retention policies and a daily scheduled retention process. Retention periods differ by record type and are configured in the system; this guide is not a substitute for the current club privacy and retention policies.

Key operating points:
- Do not keep local spreadsheets or screenshots of children’s attendance or availability unless the club has an approved need and storage arrangement.
- Do not share PINs, session links or parent edit links.
- Use only the information required to run rugby activities.
- Retention holds must be used where records need to be preserved for an incident, review or other authorised reason.
- Do not promise a parent that information has been erased until the authorised process has completed and the result has been checked.

The app does not maintain an offline copy of the live player and attendance database on the device.

## 7. Troubleshooting

| Problem | What to do |
|---|---|
| App will not load | Check the device has internet access. Close and reopen the app or browser. Try the live app link again. |
| App appears out of date | Close the app fully and reopen it while online. If the issue remains, ask the Admin to check the latest deployment. |
| Supabase/connection error | Stop and avoid repeated submissions. Restore internet access, reopen the relevant screen and verify what was actually saved. |
| Coach cannot sign in | Check personal PIN/passkey and internet access. If the account is locked, inactive or the session has expired, ask Admin to review access. |
| Coach cannot see an age group | Ask Admin to check the active age-group assignment. |
| Parent PIN rejected | Check account name and PIN. After five failed attempts, wait ten minutes before trying again. |
| Parent cannot edit a response | Check fixture status, deadline and edit-lock message. Ask the club if the response needs administrative attention. |
| Fixture link does not work | Check the link has been copied in full and that the fixture is still valid/open. Ask Admin to verify or share a fresh link. |
| Attendance appears wrong after a connection failure | Reopen the correct register and compare each player. Correct only confirmed missing or incorrect entries. |
| A user has lost a device | Ask Admin to review installation access and revoke/reset the affected installation if appropriate. |
| Suspected unauthorised access | Stop using the affected session/device and report it promptly to the designated Admin. Preserve relevant details; do not delete records or attempt to investigate by changing data. |

## 8. Service outage and recovery

### 8.1 If the internet or Supabase is unavailable

Club Check-In requires an online connection for operational data. It is not an offline attendance system.

1. Confirm whether the device has internet access.
2. If other websites work but Club Check-In does not, treat it as a possible service issue.
3. Do not repeatedly submit the same parent response or attendance changes.
4. The attendance feature is not currently used as the club’s routine attendance process. If it is unavailable, there is no existing attendance process to lose or replace.
5. No separate paper-register contingency is currently required or defined.
6. If the club later decides to rely on Club Check-In for routine attendance, agree and document a suitable fallback before doing so.

This guide does not authorise storing children’s information in personal messaging accounts or unapproved spreadsheets.

### 8.2 If an account or installation is compromised

1. Notify the designated Admin promptly.
2. Identify the affected user and device/installation.
3. Use the system’s access-management controls to deactivate the user or reset/revoke the affected installation as appropriate.
4. Check whether other active sessions or passkeys need revoking.
5. Record the incident and any retention hold required.
6. Do not delete relevant audit records while the incident is being reviewed.

### 8.3 Backups and restoration

A GitHub Actions database backup workflow has been prepared, but it is not yet configured because the database connection details have not been added. A successful backup and restoration test have therefore **not** been completed.

This is a planned resilience improvement, not a blocker to routine use of the live system. The club should remain aware that GitHub source control is not a database backup and that a tested database restore is not currently available. When convenient, the workflow can be configured and a controlled restoration exercise carried out.

Until then:
- Avoid destructive database changes unless there is a clear reason and an appropriate recovery plan.
- If the database becomes unavailable or data appears to be missing, escalate to the person responsible for the Supabase project.
- Do not attempt an improvised database restore.

## 9. Deployment and application updates

The canonical source repository is `Knockout1992-tech/Club-Check-In`, branch `main`. The production mirror is `Knockout1992-tech/Club-Match-Availability`, branch `main`, folder `club-check-in/`. Cloudflare Pages hosts Match Availability at the project root and Club Check-In beneath `/club-check-in/`.

**Correct Club Check-In launch URL:** https://rhrufc-mini.pages.dev/club-check-in/

The release path is:

1. A change is committed to canonical `main`.
2. `PWA Versioning and Syntax Check` checks JavaScript and automatically increments the app version and service-worker cache version on a successful push.
3. `PDM Browser Tests` runs browser smoke tests.
4. `Sync canonical Club Check-In to production` checks out the latest canonical `main`, copies the PWA runtime files into `Club-Match-Availability/club-check-in/`, and pushes the mirror repository's `main` branch.
5. That mirror push is expected to trigger the Cloudflare Pages Git deployment.
6. The Cloudflare Pages deployment must be checked separately, followed by verification of the public app URL and assets. A successful GitHub sync is not proof that Cloudflare has finished deploying.

If the app appears out of date, check each stage in order: canonical source version, versioning workflow result and generated commit, mirror version and commit, Cloudflare Pages deployment status/commit, then the public `club-check-in/js/config.js` and service-worker response. Do not immediately ask users to uninstall the PWA or clear stored data.

Operational users should:
- Use the exact live Club Check-In link above, not the Pages project root, an old bookmark or a copied test URL.
- Avoid installing unofficial copies or using old duplicate Pages addresses.
- Report unexpected behaviour with the screen, approximate time and steps that led to it.
- Never send PINs, session tokens or private invitation/edit links as diagnostic evidence.

**Version status (21 November 2026):** canonical source `js/config.js` was observed as `V3.7.9`, while the production mirror `club-check-in/js/config.js` was observed as `V3.8.1`. These values do not match and the live Cloudflare response has not yet been independently confirmed. Do not quote either value as the confirmed live version until the discrepancy is investigated and Cloudflare's deployed assets have been checked.

## 10. Checks still required before formal adoption

The system has been exercised in live use at different times across the parent, Coach, Admin, Match Availability and attendance workflows. These checks have not been consolidated into a single formal acceptance record, but there is no requirement to repeat working journeys solely to create one.

The corrected family invitation link has also been confirmed working in live use. The outstanding governance task is to keep a simple record of any future issues or material changes and the checks performed in response.

Database backup and restoration remain a lower-priority resilience improvement. The backup workflow is prepared but not configured, and no restoration test has been completed. This does not prevent routine operation, but it should be revisited when the database connection details are available.

## 11. Document ownership and review

The club should nominate a document owner (normally a designated Admin or club officer) to:
- Confirm role responsibilities and escalation arrangements.
- Revisit attendance contingency arrangements only if the club starts relying on Club Check-In for routine attendance.
- Check this guide after material application changes.
- Review it alongside the club’s privacy, retention and safeguarding arrangements.
- Record formal approval and the next review date.

**This is a working operational guide, not evidence by itself of formal Club approval, a completed disaster-recovery test or legal compliance certification.**
