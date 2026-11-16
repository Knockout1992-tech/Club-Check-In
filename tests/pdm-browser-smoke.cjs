const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const calls = [];
  const requests = [
    { id: 11, request_ref: "PDM-TEST-001", request_type: "other", subject_type: "parent", subject_name: "Test Parent", requester_name: "Test Parent", received_at: "2026-11-10T10:00:00Z", due_at: "2026-12-10T10:00:00Z", status: "in_review", identity_status: "verified", authority_status: "not_applicable" },
    { id: 12, request_ref: "PDM-TEST-002", request_type: "access", subject_type: "parent", subject_name: "Closed Parent", requester_name: "Closed Parent", received_at: "2026-10-01T10:00:00Z", due_at: "2026-11-01T10:00:00Z", status: "completed", identity_status: "verified", authority_status: "not_applicable" }
  ];
  let activeRequest = requests[0];
  await page.exposeFunction("__rpc", async (name, args) => {
    calls.push({ name, args });
    if (name === "list_personal_data_requests") return { data: { success: true, requests }, error: null };
    if (name === "get_personal_data_request_detail") return { data: { success: true, request: activeRequest }, error: null };
    if (name === "get_personal_data_request_history") return { data: [{ id: 1, occurred_at: "2026-11-10T10:00:00Z", event_type: "personal_data_request_created", outcome: "success", actor_type: "system_admin" }], error: null };
    if (name === "update_personal_data_request") return { data: { success: true, request_ref: "PDM-TEST-001", status: args.p_status }, error: null };
    if (name === "search_personal_data_subjects") return { data: { success: true, parents: [], children: [] }, error: null };
    throw new Error("Unexpected RPC: " + name);
  });
  const pdmScript = fs.readFileSync(path.resolve(__dirname, "../js/personal-data-admin.js"), "utf8");
  const harness = '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:16px Arial;margin:0;padding:12px;background:#f4f4f4;color:#222}button,input,select,textarea{font:inherit}button{cursor:pointer}.card{background:#fff;border-radius:12px;padding:14px}.subtitle{color:#555;font-size:13px}.info-box{padding:12px;background:#eef4f0;border-radius:8px}.secondary-button,.primary-button,.back-button{min-height:42px;padding:9px 12px;border-radius:8px;border:1px solid #aaa;background:#eee;color:#222}.primary-button{background:#173d2c;color:white}.back-button{margin-bottom:12px}.empty{padding:16px;color:#555}</style></head><body><main id="app"></main><script>window.currentSystemAdminPIN="TEST-PIN";window.requireSystemAdminSession=()=>true;window.escapeHTML=v=>String(v??"").replace(/[&<>\\"\']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\'":"&#39;"}[c]));window.renderShell=html=>{document.getElementById("app").innerHTML=html};window.showRetentionAdmin=()=>{};window.appAlert=async()=>{};window.appConfirm=async()=>true;window.supabaseClient={rpc:(name,args)=>window.__rpc(name,args)};</script></body></html>';
  await page.setContent(harness, { waitUntil: "load" });
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
  await page.screenshot({ path: "test-results/pdm-case-mobile.png", fullPage: true });
  await page.evaluate(() => window.pdmDraftResponse());
  assert.equal(await page.locator("#pdmResponseOutcome").count(), 1);
  await page.locator("#pdmResponseText").fill("Dear Test Parent,\n\nYour request has been reviewed and the action is complete.\n\nKind regards,\nRHRUFC");
  await page.locator("#pdmCheckThirdParty").check();
  await page.locator("#pdmCheckAccuracy").check();
  await page.evaluate(() => window.pdmRecordSent());
  assert.ok(calls.some(x => x.name === "update_personal_data_request" && x.args.p_status === "completed"));
  assert.ok(calls.some(x => x.name === "get_personal_data_request_history" && x.args.p_request_ref === "PDM-TEST-001"));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => window.showPersonalDataManagement());
  await page.screenshot({ path: "test-results/pdm-dashboard-desktop.png", fullPage: true });
  console.log("PDM browser smoke tests passed: dashboard filters, case detail, audit timeline, response completion, mobile and desktop rendering.");
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });