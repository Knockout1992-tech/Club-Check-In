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
    const children=(data.children||[]).map(x=>({type:x.subject_type,ref:x.subject_reference,name:x.subject_name,detail:[x.context_label,x.age_group,x.school_year].filter(Boolean).join(" · "),locator:{age_group_id:x.age_group_id||null,school_year:x.school_year||"",family_id:x.family_id||null,parent_name:x.parent_name||""}}));
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
    const {data,error}=await supabaseClient.rpc("get_personal_data_subject_bundle",{p_system_admin_pin:currentSystemAdminPIN,
      p_subject_type:r.subject_type,p_subject_reference:r.subject_reference,p_subject_name:r.subject_name,p_subject_locator:r.subject_locator||{}});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to build data copy.","Access request","warning");return;}
    pdmBundle=data;const host=document.getElementById("pdmBundleHost");
    host.innerHTML='<p><strong>Data copy preview</strong></p><p class="pdm-note">Check the scope and remove any third-party information before sending. This preview is not automatically sent.</p>'+
      '<button class="primary-button small-button" onclick="pdmDownloadBundle()">Download JSON data copy</button><pre class="pdm-json">'+pdmEscape(JSON.stringify(data,null,2))+'</pre>';
}
function pdmDownloadBundle() {
    if(!pdmBundle||!pdmReady())return;
    const blob=new Blob([JSON.stringify(pdmBundle,null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=(pdmCurrentRequest.request_ref||"personal-data")+".json";a.click();URL.revokeObjectURL(url);
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
      (r.request_type==="access"?"Please find attached the copy of personal data held by Rushden & Higham RUFC within the systems covered by this request.\\n\\nThe club uses this information to administer rugby participation, registers, fixtures, availability, family access and related club administration. The data may include parent account details, child/player details, age group, attendance, availability responses, family-sharing relationships and relevant security records.\\n\\nInformation may be accessed by authorised club coaches, administrators and system administrators according to their roles, and processed by the club's hosting and technical service providers. Records are retained under the club's published retention schedule, subject to legal, safeguarding and other applicable requirements.\\n\\nYou may have rights to request rectification, erasure, restriction or object to processing, depending on the circumstances. You may complain to the Information Commissioner’s Office. This response should be checked against the club's current privacy notice and actual supplier arrangements before issue.":r.request_type==="erasure"?
      "We have reviewed your request. Outcome: "+(r.decision||"Please insert the approved outcome.")+".\n\nWhere information has not been erased, the reason and applicable retention basis are: "+(r.response_notes||"Please insert the specific reason and legal basis."):"We have reviewed your request. Please see the outcome and explanation below:\n\n"+(r.response_notes||"Please insert the decision and reasons."))+
      "\n\nIf you remain dissatisfied, you may raise a concern with the Information Commissioner's Office (ICO).\n\nKind regards,\nRHRUFC Club Committee";
    const host=document.getElementById("pdmResponseHost");
    host.innerHTML='<label>Response draft<textarea id="pdmResponseText" rows="14">'+pdmEscape(body)+'</textarea></label>'+
      '<button class="secondary-button" onclick="GenUI.copy(document.getElementById(\'pdmResponseText\').value)">Copy response</button>'+
      '<p class="pdm-note">Review the wording, attach the access export where applicable, check for third-party data, then send through the verified contact route. Record the actual sent date and method.</p>'+
      '<button class="primary-button" onclick="pdmRecordSent()">Record as sent</button>';
}
async function pdmRecordSent() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const method=document.getElementById("pdmSentMethod")?.value||"club_contact_route";
    const {data,error}=await supabaseClient.rpc("update_personal_data_request",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id,
      p_status:"completed",p_identity_status:pdmCurrentRequest.identity_status||"verified",p_authority_status:pdmCurrentRequest.authority_status||"not_applicable",
      p_scope_notes:pdmCurrentRequest.scope_notes||null,p_extension_reason:null,p_extension_notified_at:null,
      p_decision:pdmCurrentRequest.decision||"Response issued",p_response_notes:pdmCurrentRequest.response_notes||null,
      p_sent_at:new Date().toISOString(),p_sent_via:method,p_completed_at:new Date().toISOString()});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to record response.","Update failed","warning");return;}
    await showPersonalDataManagement();
}
async function pdmUpdateStatus() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const status=prompt("Enter status: received, awaiting_identity, awaiting_authority, in_review, extension_notified, ready_to_send, completed, partially_completed, refused, withdrawn",pdmCurrentRequest.status||"in_review");
    if(!status)return;
    const {data,error}=await supabaseClient.rpc("update_personal_data_request",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id,
      p_status:status,p_identity_status:pdmCurrentRequest.identity_status||"unverified",p_authority_status:pdmCurrentRequest.authority_status||"not_applicable",
      p_scope_notes:pdmCurrentRequest.scope_notes||null,p_extension_reason:null,p_extension_notified_at:null,p_decision:pdmCurrentRequest.decision||null,
      p_response_notes:pdmCurrentRequest.response_notes||null,p_sent_at:pdmCurrentRequest.sent_at||null,p_sent_via:pdmCurrentRequest.sent_via||null,
      p_completed_at:pdmCurrentRequest.completed_at||null});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to update request.","Update failed","warning");return;}
    await showPersonalDataManagement();
}

async function pdmNotifyExtension() {
    if(!pdmReady()||!pdmCurrentRequest)return;
    const reason=prompt("Explain why this request is complex or involves multiple requests (at least 10 characters).");
    if(!reason||reason.trim().length<10)return;
    const notified=prompt("Enter the date you notified the requester (YYYY-MM-DD).",new Date().toISOString().slice(0,10));
    if(!notified)return;
    const when=new Date(notified+"T12:00:00");
    if(Number.isNaN(when.getTime())||when>new Date()||when>new Date(pdmCurrentRequest.received_at).setMonth(new Date(pdmCurrentRequest.received_at).getMonth()+1)){
      await appAlert("The extension must be notified within the first month of receipt.","Extension not recorded","warning");return;
    }
    const {data,error}=await supabaseClient.rpc("update_personal_data_request",{p_system_admin_pin:currentSystemAdminPIN,p_request_id:pdmCurrentRequest.id,
      p_status:"extension_notified",p_identity_status:pdmCurrentRequest.identity_status||"unverified",p_authority_status:pdmCurrentRequest.authority_status||"not_applicable",
      p_scope_notes:pdmCurrentRequest.scope_notes||null,p_extension_reason:reason.trim(),p_extension_notified_at:when.toISOString(),
      p_decision:pdmCurrentRequest.decision||null,p_response_notes:pdmCurrentRequest.response_notes||null,
      p_sent_at:pdmCurrentRequest.sent_at||null,p_sent_via:pdmCurrentRequest.sent_via||null,p_completed_at:null});
    if(error||data===null||!data.success){await appAlert(error?.message||data?.message||"Unable to record extension.","Extension not recorded","warning");return;}
    await appAlert("Extension recorded. The revised deadline is "+pdmDate(data.extended_due_at)+". Ensure the requester was actually notified and retain a copy of that notice.","Extension recorded","success");
    await showPersonalDataManagement();
}
