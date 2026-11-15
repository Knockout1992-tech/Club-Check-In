/* =========================================================
   PERSONAL DATA MANAGEMENT
   System Admin only. Uses PIN-verified server RPCs.
   ========================================================= */
let pdmSearchResults = null;
let pdmSelectedSubject = null;
let pdmRequests = [];
let pdmCurrentRequest = null;
let pdmBundle = null;
let pdmErasurePreview = null;

function pdmReady() {
    return typeof requireSystemAdminSession === "function" &&
        requireSystemAdminSession() && !!currentSystemAdminPIN;
}
function pdmEscape(value) {
    return escapeHTML(value == null ? "" : String(value));
}
function pdmDate(value) {
    return value ? new Date(value).toLocaleDateString("en-GB") : "—";
}
async function showPersonalDataManagement() {
    if (!pdmReady()) return;
    pdmSelectedSubject = null; pdmCurrentRequest = null; pdmBundle = null; pdmErasurePreview = null;
    const {data,error}=await supabaseClient.rpc("list_personal_data_requests",{p_system_admin_pin:currentSystemAdminPIN});
    if(error || data===null){await appAlert(error?.message||"Unable to load data requests.","Personal Data Management","danger");return;}
    pdmRequests=data.requests||[];
    renderPersonalDataManagement();
}
function renderPersonalDataManagement() {
    if(!pdmReady())return;
    const rows=pdmRequests.map(r=>'<article class="pdm-request"><div class="pdm-request-head"><strong>'+pdmEscape(r.request_ref)+' · '+pdmEscape(r.request_type)+'</strong><span>'+pdmEscape(r.status.replace(/_/g," "))+'</span></div><div>'+pdmEscape(r.subject_name)+' · '+pdmEscape(r.subject_type)+'</div><div class="subtitle">Received '+pdmDate(r.received_at)+' · Due '+pdmDate(r.extended_due_at||r.due_at)+'</div><button class="secondary-button small-button" onclick="pdmOpenRequest('+Number(r.id)+')">Open request</button></article>').join("");
    renderShell('<div class="card retention-admin pdm-page">'+
      '<button class="back-button" onclick="showRetentionAdmin()">← System Admin</button>'+
      '<h2>Personal Data Management</h2><div class="subtitle">Manage data protection requests across Club Check-In and the Parent Portal.</div>'+
      '<div class="info-box"><strong>Handle every request carefully.</strong><br>Verify identity and parental/representative authority, record the original receipt date, check applicable exceptions and retention holds, and send the response within the applicable deadline.</div>'+
      '<section class="pdm-section"><h3>Find a parent or child</h3><div class="pdm-search"><input id="pdmSearchTerm" type="search" placeholder="Enter at least 2 characters"><button class="primary-button" onclick="pdmSearch()">Search</button></div><div id="pdmSearchResults"></div></section>'+
      '<section class="pdm-section"><h3>Open requests</h3><button class="secondary-button small-button" onclick="showPersonalDataManagement()">Refresh requests</button>'+
      (rows||'<div class="empty">No data requests have been recorded.</div>')+'</section>'+
      '<button class="secondary-button" onclick="showRetentionAdmin()">Back to System Admin</button>'+
      '<style>.pdm-section{margin:20px 0}.pdm-search{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.pdm-search input,.pdm-form input,.pdm-form select,.pdm-form textarea{width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border,#ccc);border-radius:7px;background:var(--card,#fff);color:inherit}.pdm-result,.pdm-request{border:1px solid var(--border,#ddd);border-radius:9px;padding:12px;margin:9px 0}.pdm-request-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}.pdm-form{display:grid;gap:10px;margin-top:12px}.pdm-form label{display:grid;gap:5px;font-size:13px}.pdm-actions{display:flex;gap:8px;flex-wrap:wrap}.pdm-json{white-space:pre-wrap;overflow-wrap:anywhere;max-height:340px;overflow:auto;background:rgba(127,127,127,.1);padding:10px;border-radius:7px;font-size:11px}.pdm-note{font-size:12px;opacity:.8}.pdm-bad{color:#9b2c2c;font-weight:600}</style></div>');
}
async function pdmSearch() {
    if(!pdmReady())return;
    const term=document.getElementById("pdmSearchTerm")?.value?.trim()||"";
    const host=document.getElementById("pdmSearchResults");
    if(term.length<2){await appAlert("Enter at least two characters.","Search","warning");return;}
    host.textContent="Searching…";
    const {data,error}=await supabaseClient.rpc("search_personal_data_subjects",{p_system_admin_pin:currentSystemAdminPIN,p_search_term:term});
    if(error||data===null||!data.success){host.textContent="Search failed. Please try again.";return;}
    pdmSearchResults=data;
    const parents=(data.parents||[]).map(x=>({type:"parent",ref:x.subject_reference,name:x.parent_name,detail:"Parent account · "+x.linked_submissions+" linked submissions",locator:{}}));
    const children=(data.children||[]).map(x=>({type:x.subject_type,ref:x.subject_reference,name:x.subject_name,detail:[x.context_label,x.age_group,x.school_year,x.ambiguous_match?"Possible duplicate child records — manual identification required":""].filter(Boolean).join(" · "),locator:{age_group_id:x.age_group_id||null,school_year:x.school_year||"",family_id:x.family_id||null,parent_name:x.parent_name||"",availability_ids:x.availability_ids||null,ambiguous_match:x.ambiguous_match===true}}));
    const all=[...parents,...children];
    host.innerHTML=all.length?all.map((x,i)=>'<article class="pdm-result"><strong>'+pdmEscape(x.name)+'</strong><div class="subtitle">'+pdmEscape(x.detail)+'</div><button class="secondary-button small-button" onclick="pdmSelectSubject('+i+')">Select</button></article>').join(""):'<div class="empty">No matching parent or child records found.</div>';
    window.pdmCurrentResults=all;
}
function pdmSelectSubject(index) {
    if(!pdmReady())return;
    const item=window.pdmCurrentResults?.[index];if(!item)return;
    pdmSelectedSubject=item;pdmCurrentRequest=null;pdmBundle=null;pdmErasurePreview=null;
    const host=document.getElementById("pdmSearchResults");
    host.innerHTML='<div class="pdm-result"><strong>Selected: '+pdmEscape(item.name)+'</strong><div>'+pdmEscape(item.detail)+'</div>'+
      '<form class="pdm-form" onsubmit="event.preventDefault();pdmCreateRequest()">'+
      '<label>Request type<select id="pdmType"><option value="access">Access to personal data</option><option value="erasure">Erasure / deletion</option><option value="rectification">Rectification</option><option value="restriction">Restriction</option><option value="objection">Objection</option><option value="portability">Data portability</option><option value="other">Other</option></select></label>'+
      '<label>Requester name<input id="pdmRequester" maxlength="120" required></label>'+
      '<label>Relationship to subject<select id="pdmRelationship">'+(pdmSelectedSubject.type==="parent"?'<option value="self">The person themselves</option><option value="authorised_representative">Authorised representative</option><option value="other">Other</option>':'<option value="parent_or_guardian">Parent / person with parental responsibility</option><option value="authorised_representative">Authorised representative</option><option value="other">Other</option>')+'</select></label>'+
      '<label>Contact method<select id="pdmContactMethod"><option value="club_contact_route">Club official contact route</option><option value="email">Email</option><option value="letter">Letter</option><option value="phone">Phone</option></select></label>'+
      '<label>Contact details (if supplied)<input id="pdmContactDetails" maxlength="250"></label>'+
      '<label>Date received<input id="pdmReceived" type="date" value="'+new Date().toISOString().slice(0,10)+'" required></label>'+
      '<label>Identity check<select id="pdmIdentity"><option value="unverified">Not yet verified</option><option value="verified">Verified</option><option value="more_information_required">More information required</option></select></label>'+
      '<label>Authority to act<select id="pdmAuthority">'+(pdmSelectedSubject.type==="parent"?'<option value="not_applicable">Not applicable / requester is adult subject</option><option value="unverified">Not yet verified</option><option value="verified">Verified</option>':'<option value="unverified">Not yet verified</option><option value="verified">Verified parental responsibility / authority</option><option value="not_authorised">Not authorised</option>')+'</select></label>'+
      '<label>Scope / notes<textarea id="pdmScope" rows="2" maxlength="2000"></textarea></label>'+
      '<button class="primary-button" type="submit">Create request</button></form></div>';
}
async function pdmCreateRequest() {
    if(!pdmReady()||!pdmSelectedSubject)return;
    const v=id=>document.getElementById(id)?.value||"";
    const received=new Date(v("pdmReceived")+"T12:00:00").toISOString();
    const args={p_system_admin_pin:currentSystemAdminPIN,p_request_type:v("pdmType"),p_subject_type:pdmSelectedSubject.type,
      p_subject_reference:pdmSelectedSubject.ref,p_subject_name:pdmSelectedSubject.name,p_subject_locator:pdmSelectedSubject.locator,
      p_requester_name:v("pdmRequester"),p_requester_relationship:v("pdmRelationship"),p_contact_method:v("pdmContactMethod"),
      p_contact_details:v("pdmContactDetails"),p_received_at:received,p_identity_status:v("pdmIdentity"),
      p_authority_status:v("pdmAuthority"),p_scope_notes:v("pdmScope")};
    const {data,error}=await supabaseClient.rpc("create_personal_data_request",args);
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to create request.","Request not created","warning");return;}
    await appAlert("Request "+data.request_ref+" created. Due date: "+pdmDate(data.due_at)+".","Request recorded","success");
    await showPersonalDataManagement();await pdmOpenRequest(data.id);
}
async function pdmOpenRequest(id) {
    if(!pdmReady())return;
    const {data,error}=await supabaseClient.rpc("get_personal_data_request_detail",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:id});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Request could not be loaded.","Personal Data Management","warning");return;}
    pdmCurrentRequest=data.request;
    pdmBundle=null;pdmErasurePreview=null;
    renderPdmRequestDetail();
}
function renderPdmRequestDetail() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const r=pdmCurrentRequest;
    const host=document.querySelector(".pdm-page");
    if(!host)return;
    const panel=document.createElement("section");panel.id="pdmRequestDetail";panel.className="pdm-section";
    panel.innerHTML='<h3>'+pdmEscape(r.request_ref)+' · '+pdmEscape(r.request_type)+'</h3>'+
      '<p>'+pdmEscape(r.subject_name)+' · '+pdmEscape(r.subject_type)+'<br>Received '+pdmDate(r.received_at)+' · Due '+pdmDate(r.extended_due_at||r.due_at)+'</p>'+
      '<div class="pdm-actions"><button class="secondary-button" onclick="pdmLoadBundle()">Build data copy</button>'+
      (r.request_type==="erasure"?'<button class="secondary-button" onclick="pdmPreviewErasure()">Preview deletion</button>':'')+'</div>'+
      '<div id="pdmBundleHost"></div><div id="pdmEraseHost"></div>'+
      '<div class="pdm-actions"><button class="secondary-button" onclick="pdmDraftResponse()">Prepare response</button><button class="secondary-button" onclick="pdmUpdateStatus()">Update progress</button><button class="secondary-button" onclick="pdmNotifyExtension()">Record extension notice</button></div>'+
      '<div id="pdmResponseHost"></div>';
    host.querySelector("#pdmRequestDetail")?.remove();host.appendChild(panel);
}
async function pdmLoadBundle() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const r=pdmCurrentRequest;
    if(r.identity_status!=="verified"||!["verified","not_applicable"].includes(r.authority_status)){
      await appAlert("Verify the requester’s identity and, where applicable, their authority before preparing a personal data copy.","Verification required","warning");return;
    }
    const {data,error}=await supabaseClient.rpc("get_personal_data_subject_bundle",{p_system_admin_pin:currentSystemAdminPIN,
      p_subject_type:r.subject_type,p_subject_reference:r.subject_reference,p_subject_name:r.subject_name,p_subject_locator:r.subject_locator||{}});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to build data copy.","Access request","warning");return;}
    pdmBundle=data;const host=document.getElementById("pdmBundleHost");
    host.innerHTML='<p><strong>Data copy preview</strong></p><p class="pdm-note">Check the scope and remove any third-party information before sending. This preview is not automatically sent.</p>'+
      '<div class="pdm-actions"><button class="primary-button small-button" onclick="pdmDownloadBundle()">Download JSON data copy</button><button class="secondary-button small-button" onclick="pdmDownloadReadableBundle()">Download readable report</button></div><pre class="pdm-json">'+pdmEscape(JSON.stringify(data,null,2))+'</pre>';
}
function pdmDownloadBundle() {
    if(!pdmBundle||!pdmReady())return;
    const blob=new Blob([JSON.stringify(pdmBundle,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(pdmCurrentRequest.request_ref||"personal-data")+".json";a.click();URL.revokeObjectURL(url);
}
async function pdmDownloadReadableBundle() {
    if(!pdmBundle||!pdmReady())return;
    const render=(key,value)=>{
      if(value===null||typeof value!=="object")return '<p><strong>'+pdmEscape(key.replace(/_/g," "))+'</strong>: '+pdmEscape(value??"Not recorded")+'</p>';
      if(Array.isArray(value)){
        if(!value.length)return '<h3>'+pdmEscape(key.replace(/_/g," "))+'</h3><p>None recorded.</p>';
        if(typeof value[0]==="object"){
          const cols=[...new Set(value.flatMap(row=>Object.keys(row)))];
          return '<h3>'+pdmEscape(key.replace(/_/g," "))+'</h3><div class="table-wrap"><table><thead><tr>'+cols.map(c=>'<th>'+pdmEscape(c.replace(/_/g," "))+'</th>').join("")+'</tr></thead><tbody>'+value.map(row=>'<tr>'+cols.map(c=>'<td>'+pdmEscape(row[c]??"")+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>';
        }
        return '<h3>'+pdmEscape(key.replace(/_/g," "))+'</h3><ul>'+value.map(x=>'<li>'+pdmEscape(x)+'</li>').join("")+'</ul>';
      }
      return '<section><h3>'+pdmEscape(key.replace(/_/g," "))+'</h3>'+Object.entries(value).map(([k,v])=>render(k,v)).join("")+'</section>';
    };
    const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal data copy</title><style>body{font:14px Arial,sans-serif;max-width:1100px;margin:32px auto;padding:0 18px;color:#222}h1{font-size:24px}h2{font-size:18px;margin-top:26px}h3{font-size:15px;margin-top:20px;text-transform:capitalize}p{line-height:1.5}.table-wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #ccc;padding:7px;text-align:left;vertical-align:top}th{background:#f2f2f2}section{margin:14px 0}@media print{body{margin:0;max-width:none}}</style></head><body><h1>Personal data copy</h1><p>Rushden &amp; Higham RUFC · '+pdmEscape(pdmCurrentRequest?.request_ref||"")+'</p><p>Prepared '+pdmEscape(new Date().toLocaleString("en-GB"))+'</p><p><strong>Review before disclosure:</strong> check the identity and authority of the requester and remove or redact information about other people where required.</p>'+Object.entries(pdmBundle).map(([k,v])=>render(k,v)).join("")+'</body></html>';
    const blob=new Blob([html],{type:"text/html;charset=utf-8"});const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=(pdmCurrentRequest?.request_ref||"personal-data")+"-report.html";a.click();URL.revokeObjectURL(url);
}
async function pdmPreviewErasure() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const {data,error}=await supabaseClient.rpc("preview_personal_data_erasure",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to preview deletion.","Deletion preview","warning");return;}
    pdmErasurePreview=data;
    document.getElementById("pdmEraseHost").innerHTML='<h4>Deletion preview</h4><pre class="pdm-json">'+pdmEscape(JSON.stringify(data.records,null,2))+'</pre>'+
      (data.can_erase?'<p>Eligible for deletion. No active retention holds were found.</p>':'<p class="pdm-bad">Deletion blocked. '+pdmEscape((data.blockers||[]).map(x=>x.message).join(" "))+'</p>')+
      '<p class="pdm-note">'+pdmEscape(data.retained_aggregate_note)+'</p>'+
      (data.can_erase?'<label>Type '+pdmEscape(data.request_ref)+' to confirm<input id="pdmConfirmRef"></label><button class="red-button" onclick="pdmExecuteErasure()">Permanently erase identified records</button>':'');
}
async function pdmExecuteErasure() {
    if(!pdmReady()||!pdmCurrentRequest||!pdmErasurePreview?.can_erase)return;
    const ref=document.getElementById("pdmConfirmRef")?.value?.trim()||"";
    if(ref!==pdmCurrentRequest.request_ref){await appAlert("The request reference does not match.","Confirmation required","warning");return;}
    const ok=await appConfirm("This permanently removes the identified personal records. This cannot be undone. Continue only if the request, identity, authority and retention checks have been approved.","Permanent erasure","Erase records");
    if(!ok)return;
    const {data,error}=await supabaseClient.rpc("execute_personal_data_erasure",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id,p_confirm_reference:ref});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Erasure was not completed.","Erasure failed","danger");return;}
    await appAlert(data.message+" Records removed: "+data.records_removed,"Erasure completed","success");
    await showPersonalDataManagement();
}
function pdmDraftResponse() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const r=pdmCurrentRequest;
    const subject=r.request_type==="access"?"Your personal data access request":r.request_type==="erasure"?"Your personal data erasure request":"Your data protection request";
    const body="Dear "+r.requester_name+",\n\nThank you for your request received on "+pdmDate(r.received_at)+".\n\n"+
      (r.request_type==="access"?"Please find attached the copy of personal data held by Rushden & Higham RUFC within the systems covered by this request.\n\nThe club uses this information to administer rugby participation, registers, fixtures, availability, family access and related club administration. The data may include parent account details, child/player details, age group, attendance, availability responses, family-sharing relationships and relevant security records.\n\nInformation may be accessed by authorised club coaches, administrators and system administrators according to their roles, and processed by the club's hosting and technical service providers. Records are retained under the club's published retention schedule, subject to legal, safeguarding and other applicable requirements.\n\nBefore sending, complete and verify the following from the current privacy notice and supplier records: the club's controller contact details and lawful basis for each purpose; specific recipients and service providers; any international transfers and safeguards; the source of any data not obtained directly from you; applicable retention periods; and whether automated decision-making or profiling is used.\n\nYou may have rights to request rectification, erasure, restriction, portability or object to processing, depending on the circumstances. You may complain to the Information Commissioner’s Office.":r.request_type==="erasure"?
      "We have reviewed your request. Outcome: "+(r.decision||"Please insert the approved outcome.")+".\n\nWhere information has not been erased, the reason and applicable retention basis are: "+(r.response_notes||"Please insert the specific reason and legal basis."):"We have reviewed your request. Please see the outcome and explanation below:\n\n"+(r.response_notes||"Please insert the decision and reasons."))+
      "\n\nIf you remain dissatisfied, you may raise a concern with the Information Commissioner's Office (ICO).\n\nKind regards,\nRHRUFC Club Committee";
    const host=document.getElementById("pdmResponseHost");
    host.innerHTML='<label>Response draft<textarea id="pdmResponseText" rows="14">'+pdmEscape(body)+'</textarea></label>'+
      '<button class="secondary-button" onclick="GenUI.copy(document.getElementById(\'pdmResponseText\').value)">Copy response</button>'+
      '<label>Sent by<select id="pdmSentMethod"><option value="club_contact_route">Club official contact route</option><option value="email">Email</option><option value="letter">Letter</option><option value="phone">Phone</option></select></label>'+
      '<p class="pdm-note">Review the wording, attach the access export where applicable, check for third-party data, then send through the verified contact route. Record the actual sent date and method.</p>'+
      '<button class="primary-button" onclick="pdmRecordSent()">Record as sent</button>';
}
async function pdmRecordSent() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    if(pdmCurrentRequest.identity_status!=="verified"||!["verified","not_applicable"].includes(pdmCurrentRequest.authority_status)){
      await appAlert("Verify the requester’s identity and authority before issuing a response.","Verification required","warning");return;
    }
    const method=document.getElementById("pdmSentMethod")?.value||"club_contact_route";
    const {data,error}=await supabaseClient.rpc("update_personal_data_request",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id,
      p_status:"completed",p_identity_status:pdmCurrentRequest.identity_status||"verified",p_authority_status:pdmCurrentRequest.authority_status||"not_applicable",
      p_scope_notes:pdmCurrentRequest.scope_notes||null,p_extension_reason:null,p_extension_notified_at:null,
      p_decision:pdmCurrentRequest.decision||"Response issued",p_response_notes:document.getElementById("pdmResponseText")?.value||pdmCurrentRequest.response_notes||null,
      p_sent_at:new Date().toISOString(),p_sent_via:method,p_completed_at:new Date().toISOString()});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to record response.","Update failed","warning");return;}
    await showPersonalDataManagement();
}
function pdmUpdateStatus() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const host=document.getElementById("pdmResponseHost");
    const statuses=["received","awaiting_identity","awaiting_authority","in_review","extension_notified","ready_to_send","partially_completed","refused","withdrawn"];
    host.innerHTML='<div class="pdm-form"><label>Request status<select id="pdmStatus">'+statuses.map(x=>'<option value="'+x+'">'+x.replace(/_/g," ")+'</option>').join("")+'</select></label>'+
      '<label>Identity check<select id="pdmIdentityStatus"><option value="unverified">Unverified</option><option value="verified">Verified</option><option value="more_information_required">More information required</option><option value="not_applicable">Not applicable</option></select></label>'+
      '<label>Authority to act<select id="pdmAuthorityStatus"><option value="not_applicable">Not applicable</option><option value="unverified">Unverified</option><option value="verified">Verified</option><option value="not_authorised">Not authorised</option></select></label>'+
      '<label>Decision / outcome<input id="pdmDecision" maxlength="500"></label><label>Review notes<textarea id="pdmResponseNotes" rows="3" maxlength="4000"></textarea></label>'+
      '<label>Scope notes<textarea id="pdmScopeNotes" rows="2" maxlength="2000"></textarea></label>'+
      '<button class="primary-button" onclick="pdmSaveProgress()">Save progress</button></div>';
    document.getElementById("pdmStatus").value=pdmCurrentRequest.status||"in_review";
    document.getElementById("pdmIdentityStatus").value=pdmCurrentRequest.identity_status||"unverified";
    document.getElementById("pdmAuthorityStatus").value=pdmCurrentRequest.authority_status||"not_applicable";
    document.getElementById("pdmDecision").value=pdmCurrentRequest.decision||"";
    document.getElementById("pdmResponseNotes").value=pdmCurrentRequest.response_notes||"";
    document.getElementById("pdmScopeNotes").value=pdmCurrentRequest.scope_notes||"";
}
async function pdmSaveProgress() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const v=id=>document.getElementById(id)?.value||"";
    const status=v("pdmStatus");
    if(status==="completed"){await appAlert("Use Prepare response and Record as sent to complete a request.","Response required","warning");return;}
    const {data,error}=await supabaseClient.rpc("update_personal_data_request",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id,
      p_status:status,p_identity_status:v("pdmIdentityStatus"),p_authority_status:v("pdmAuthorityStatus"),
      p_scope_notes:v("pdmScopeNotes"),p_extension_reason:null,p_extension_notified_at:null,
      p_decision:v("pdmDecision"),p_response_notes:v("pdmResponseNotes"),
      p_sent_at:pdmCurrentRequest.sent_at||null,p_sent_via:pdmCurrentRequest.sent_via||null,p_completed_at:pdmCurrentRequest.completed_at||null});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to update request.","Update failed","warning");return;}
    await showPersonalDataManagement();
}
function pdmNotifyExtension() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const host=document.getElementById("pdmResponseHost");
    host.innerHTML='<div class="pdm-form"><p>A complex request or multiple requests may justify up to two additional months. The requester must be told, with reasons, within the first month.</p>'+
      '<label>Reason for extension<textarea id="pdmExtensionReason" rows="3" maxlength="2000" required></textarea></label>'+
      '<label>Date the requester was notified<input id="pdmExtensionDate" type="date" value="'+new Date().toISOString().slice(0,10)+'" required></label>'+
      '<button class="primary-button" onclick="pdmSaveExtension()">Record extension notice</button></div>';
}
async function pdmSaveExtension() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const reason=document.getElementById("pdmExtensionReason")?.value?.trim()||"";
    const notified=document.getElementById("pdmExtensionDate")?.value||"";
    if(reason.length<10||!notified){await appAlert("Enter the reason and date the requester was notified.","Extension details required","warning");return;}
    const when=new Date(notified+"T12:00:00");
    const deadline=new Date(pdmCurrentRequest.received_at);deadline.setMonth(deadline.getMonth()+1);
    if(Number.isNaN(when.getTime())||when>new Date()||when>deadline){
      await appAlert("The extension must be notified within the first month of receipt.","Extension not recorded","warning");return;
    }
    const {data,error}=await supabaseClient.rpc("update_personal_data_request",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id,
      p_status:"extension_notified",p_identity_status:pdmCurrentRequest.identity_status||"unverified",p_authority_status:pdmCurrentRequest.authority_status||"not_applicable",
      p_scope_notes:pdmCurrentRequest.scope_notes||null,p_extension_reason:reason,p_extension_notified_at:when.toISOString(),
      p_decision:pdmCurrentRequest.decision||null,p_response_notes:pdmCurrentRequest.response_notes||null,
      p_sent_at:pdmCurrentRequest.sent_at||null,p_sent_via:pdmCurrentRequest.sent_via||null,p_completed_at:null});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to record extension.","Extension not recorded","warning");return;}
    await appAlert("Extension recorded. Revised deadline: "+pdmDate(data.extended_due_at)+". Ensure the requester was actually notified and retain a copy of that notice.","Extension recorded","success");
    await showPersonalDataManagement();
}
