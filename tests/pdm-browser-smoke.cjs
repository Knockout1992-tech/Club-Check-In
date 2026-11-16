const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const calls = [];
  const requests = [
    { id: 11, request_ref: "PDM-TEST-001", request_type: "other", subject_type: "parent", subject_name: "Test Parent", requester_name: "Test Parent", received_at: "2026-11-10T10:00:00Z", due_at: "2026-12-10T10:00:00Z", extended_due_at: "2027-02-10T10:00:00Z", extension_reason: "Complex request requiring review", extension_notified_at: "2026-11-12T12:00:00Z", status: "in_review", identity_status: "verified", authority_status: "not_applicable" },
    { id: 13, request_ref: "PDM-TEST-003", request_type: "erasure", subject_type: "child", subject_name: "Test Player", requester_name: "Test Parent", subject_reference: "player:TEST", subject_locator: {}, received_at: "2026-11-10T10:00:00Z", due_at: "2026-12-10T10:00:00Z", status: "in_review", identity_status: "verified", authority_status: "verified" },
    { id: 12, request_ref: "PDM-TEST-002", request_type: "access", subject_type: "parent", subject_name: "Closed Parent", requester_name: "Closed Parent", received_at: "2026-10-01T10:00:00Z", due_at: "2026-11-01T10:00:00Z", status: "completed", identity_status: "verified", authority_status: "not_applicable" }
  ];
  let activeRequest = requests[0];
  await page.exposeFunction("__rpc", async (name, args) => {
    calls.push({ name, args });
    if (name === "list_personal_data_requests") return { data: { success: true, requests }, error: null };
    if (name === "get_personal_data_request_detail") return { data: { success: true, request: activeRequest }, error: null };
    if (name === "get_personal_data_request_history") return { data: [{ id: 1, occurred_at: "2026-11-10T10:00:00Z", event_type: "personal_data_request_created", outcome: "success", actor_type: "system_admin" }], error: null };
    if (name === "update_personal_data_request") return { data: { success: true, request_ref: args.p_request_id === 13 ? "PDM-TEST-003" : "PDM-TEST-001", status: args.p_status, extended_due_at: "2027-02-10T10:00:00Z" }, error: null };
    if (name === "get_personal_data_subject_bundle") return { data: { success: true, subject_type: args.p_subject_type, player: { name: "Test Player" }, attendance: [], availability: [] }, error: null };
    if (name === "preview_personal_data_erasure") return { data: { success: true, request_ref: "PDM-TEST-003", records: { player_record: 1, attendance_records: 2 }, blockers: [], can_erase: true, retained_aggregate_note: "Aggregate history is retained." }, error: null };
    if (name === "execute_personal_data_erasure") return { data: { success: true, request_ref: "PDM-TEST-003", records_removed: 3, message: "Test erasure completed." }, error: null };
    if (name === "search_personal_data_subjects") return { data: { success: true, parents: [], children: [] }, error: null };
    throw new Error("Unexpected RPC: " + name);
  });
  const pdmScript = fs.readFileSync(path.resolve(__dirname, "../js/personal-data-admin.js"), "utf8");
  const appStyles = fs.readFileSync(path.resolve(__dirname, "../css/styles.css"), "utf8");
  const harness = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:16px Arial;margin:0;padding:12px;background:#f4f4f4;color:#222}button,input,select,textarea{font:inherit}button{cursor:pointer}.card{background:#fff;border-radius:12px;padding:14px}.subtitle{color:#555;font-size:13px}.info-box{padding:12px;background:#eef4f0;border-radius:8px}.secondary-button,.primary-button,.back-button{min-height:42px;padding:9px 12px;border-radius:8px;border:1px solid #aaa;background:#eee;color:#222}.primary-button{background:#173d2c;color:white}.back-button{margin-bottom:12px}.empty{padding:16px;color:#555}</style></head><body><main id="app"></main><script>window.currentSystemAdminPIN="TEST-PIN";window.requireSystemAdminSession=()=>true;window.escapeHTML=v=>String(v??"").replace(/[&<>\\"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c]));window.renderShell=html=>{document.getElementById("app").innerHTML=html};window.showRetentionAdmin=()=>{};window.appAlert=async()=>{};window.appConfirm=async()=>true;window.supabaseClient={rpc:(name,args)=>window.__rpc(name,args)};</script></body></html>';
  await page.setContent(harness, { waitUntil: "load" });
  await page.addStyleTag({ content: appStyles });
  await page.evaluate(script => window.eval(script), pdmScript);
  await page.evaluate(() => window.showPersonalDataManagement());
  assert.match(await page.locator(".pdm-page").innerText(), /Personal Data Management/);
  assert.match(await page.locator(".pdm-filter").innerText(), /Open · 1/);
  assert.match(await page.locator(".pdm-filter").innerText(), /Closed · 1/);
  await page.screenshot({ path: "test-results/pdm-dashboard-mobile.png", fullPage: true });
  await page.evaluate(() => window.pdmSetRequestFilter("closed"));
  assert.match(await page.locator(".pdm-page").innerText(), /PDM-TEST-002/);
  assert.doesNotMatch(await page.locator(".pdm-page").innerText(), /PDM-TEST-001/);
  await page.evaluate(() => window.pdmSetRequestFilter("open"));
  await page.evaluate(() => window.pdmOpenRequest(11));
  await page.waitForSelector("#pdmTimeline .pdm-timeline");
  assert.match(await page.locator("#pdmTimeline").innerText(), /request created/);
  assert.match(await page.locator(".pdm-case-summary").innerText(), /verified/i);
  assert.equal(await page.locator(".pdm-page > .pdm-section:visible").count(), 1);
  await page.screenshot({ path: "test-results/pdm-case-mobile.png", fullPage: true });
  await page.locator("#pdmRequestDetail .back-button").click();
  assert.equal(await page.locator(".pdm-page > .pdm-section:visible").count(), 2);
  await page.evaluate(() => window.pdmOpenRequest(11));
  await page.waitForSelector("#pdmTimeline .pdm-timeline");
  assert.doesNotMatch(await page.locator("#pdmRequestDetail").innerText(), /Build data copy/);
  await page.evaluate(() => window.pdmDraftResponse());
  await page.screenshot({ path: "test-results/pdm-response-mobile.png", fullPage: true });
  assert.equal(await page.locator("#pdmResponseOutcome").count(), 1);
  await page.evaluate(() => window.pdmRecordSent());
  assert.equal(calls.filter(x => x.name === "update_personal_data_request" && x.args.p_status === "completed").length, 0, "Draft placeholders must block sending");
  await page.locator("#pdmResponseText").fill("Dear Test Parent,\n\nYour request has been reviewed and the action is complete.\n\nKind regards,\nRHRUFC");
  await page.locator("#pdmCheckThirdParty").check();
  await page.locator("#pdmCheckAccuracy").check();
  await page.evaluate(() => window.pdmRecordSent());
  assert.ok(calls.some(x => x.name === "update_personal_data_request" && x.args.p_status === "completed"));
  assert.ok(calls.some(x => x.name === "get_personal_data_request_history" && x.args.p_request_ref === "PDM-TEST-001"));

  const accessRequest = { ...requests[0], id: 14, request_ref: "PDM-TEST-004", request_type: "access", subject_name: "Access Parent", requester_name: "Access Parent" };
  activeRequest = accessRequest;
  await page.evaluate(() => window.pdmOpenRequest(14));
  assert.match(await page.locator("#pdmRequestDetail").innerText(), /Build data copy/);
  await page.evaluate(() => window.pdmDraftResponse());
  await page.locator("#pdmResponseText").fill("Dear Access Parent,\n\nYour access response is ready.\n\nKind regards,\nRHRUFC");
  await page.locator("#pdmCheckThirdParty").check();
  await page.locator("#pdmCheckAccuracy").check();
  const completedBeforeAccess = calls.filter(x => x.name === "update_personal_data_request" && x.args.p_status === "completed").length;
  await page.evaluate(() => window.pdmRecordSent());
  assert.equal(calls.filter(x => x.name === "update_personal_data_request" && x.args.p_status === "completed").length, completedBeforeAccess, "Access response must require a data copy");
  await page.evaluate(() => window.pdmLoadBundle());
  await page.locator("#pdmCheckExport").check();
  await page.evaluate(() => window.pdmRecordSent());
  assert.equal(calls.filter(x => x.name === "update_personal_data_request" && x.args.p_status === "completed").length, completedBeforeAccess + 1);

  activeRequest = requests[0];
  await page.evaluate(() => window.pdmOpenRequest(11));
  await page.evaluate(() => window.pdmUpdateStatus());
  await page.locator("#pdmStatus").selectOption("in_review");
  await page.evaluate(() => window.pdmSaveProgress());
  const progressSave = calls.filter(x => x.name === "update_personal_data_request").at(-1);
  assert.equal(progressSave.args.p_extension_reason, "Complex request requiring review");
  assert.equal(progressSave.args.p_extension_notified_at, "2026-11-12T12:00:00Z");

  await page.evaluate(() => window.pdmOpenRequest(11));
  await page.evaluate(() => window.pdmNotifyExtension());
  await page.locator("#pdmExtensionReason").fill("Complex request and multiple records require additional review.");
  await page.evaluate(() => window.pdmSaveExtension());
  const extensionSave = calls.filter(x => x.name === "update_personal_data_request").at(-1);
  assert.equal(extensionSave.args.p_extension_reason, "Complex request and multiple records require additional review.");
  assert.ok(extensionSave.args.p_extension_notified_at);

  activeRequest = requests[0];
  await page.evaluate(() => window.pdmOpenRequest(11));
  await page.evaluate(() => window.pdmLoadBundle());
  assert.ok(calls.some(x => x.name === "get_personal_data_subject_bundle"));

  activeRequest = requests[2];
  await page.evaluate(() => window.pdmOpenRequest(13));
  await page.evaluate(() => window.pdmPreviewErasure());
  assert.match(await page.locator("#pdmEraseHost").innerText(), /Eligible for deletion/);
  await page.locator("#pdmCheckExceptions").check();
  await page.locator("#pdmErasureReviewNotes").fill("Retention and safeguarding checks completed for test.");
  await page.locator("#pdmConfirmRef").fill("PDM-TEST-003");
  await page.evaluate(() => window.pdmExecuteErasure());
  assert.ok(calls.some(x => x.name === "execute_personal_data_erasure" && x.args.p_confirm_reference === "PDM-TEST-003"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.showPersonalDataManagement());
  await page.screenshot({ path: "test-results/pdm-dashboard-desktop.png", fullPage: true });
  await page.evaluate(() => window.pdmOpenRequest(11));
  await page.waitForSelector("#pdmTimeline .pdm-timeline");
  await page.evaluate(() => window.pdmDraftResponse());
  await page.screenshot({ path: "test-results/pdm-response-desktop.png", fullPage: true });
  console.log("PDM browser smoke tests passed: dashboard filters, case detail, audit timeline, response completion, mobile and desktop rendering.");
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });