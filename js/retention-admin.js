/* =========================================================
   SYSTEM ADMIN / RETENTION MANAGEMENT
   Separate from the existing Senior PIN.
   ========================================================= */
let currentSystemAdminPIN = null;
let systemAdminExpiresAt = 0;
let retentionAdminData = null;

function requireSystemAdminSession() {
    if (!currentSystemAdminPIN || Date.now() > systemAdminExpiresAt) {
        currentSystemAdminPIN = null;
        systemAdminExpiresAt = 0;
        retentionAdminData = null;
        showSystemAdminLogin();
        return false;
    }
    return true;
}

function closeSystemAdmin() {
    currentSystemAdminPIN = null;
    systemAdminExpiresAt = 0;
    retentionAdminData = null;
    showSeniorDashboard();
}

function showSystemAdminLogin() {
    if (currentRole !== "senior" || !currentSeniorPIN) {
        appAlert("Please sign in with the existing Admin PIN first.", "Admin access required", "warning");
        return;
    }
    currentSystemAdminPIN = null;
    systemAdminExpiresAt = 0;
    renderShell(`
        <div class="card pin-card">
            <button class="back-button" onclick="showSeniorDashboard()">← Admin Dashboard</button>
            <h2>System Admin</h2>
            <div class="subtitle">Enter the separate System Admin PIN to access retention and system controls.</div>
            <form onsubmit="event.preventDefault(); unlockSystemAdmin();">
                <input id="systemAdminPinInput" class="pin-input" type="password"
                    inputmode="numeric" maxlength="4" autocomplete="off" required
                    placeholder="System Admin PIN">
                <div id="systemAdminPinError" class="error"></div>
                <button class="primary-button" type="submit">Unlock System Admin</button>
            </form>
        </div>`);
    document.getElementById("systemAdminPinInput").focus();
}

async function unlockSystemAdmin() {
    const input = document.getElementById("systemAdminPinInput");
    const errorBox = document.getElementById("systemAdminPinError");
    const pin = input?.value || "";
    errorBox.textContent = "";
    if (!/^\d{4}$/.test(pin)) {
        errorBox.textContent = "Enter your System Admin PIN.";
        return;
    }
    const { data, error } = await supabaseClient.rpc("get_retention_admin_data", {
        system_admin_pin: pin
    });
    if (error || !data) {
        errorBox.textContent = error?.message?.includes("locked")
            ? "System Admin access is temporarily locked. Try again later."
            : "System Admin PIN incorrect.";
        input.value = "";
        return;
    }
    currentSystemAdminPIN = pin;
    systemAdminExpiresAt = Date.now() + 10 * 60 * 1000;
    retentionAdminData = data;
    if (data.must_change_pin) {
        showSystemAdminChangePin(true);
        return;
    }
    showRetentionAdmin();
}

function showSystemAdminChangePin(required = false) {
    if (!currentSystemAdminPIN) return showSystemAdminLogin();
    renderShell(`
        <div class="card pin-card">
            ${required ? "" : '<button class="back-button" onclick="showRetentionAdmin()">← System Admin</button>'}
            <h2>Change System Admin PIN</h2>
            <div class="subtitle">${required ? "Your temporary setup PIN must be changed before using System Admin controls." : "Choose a new private PIN for System Admin access."}</div>
            <form onsubmit="event.preventDefault(); saveSystemAdminPin();">
                <input id="newSystemAdminPin" class="pin-input" type="password" inputmode="numeric"
                    maxlength="4" minlength="4" autocomplete="new-password" placeholder="New 4-digit PIN" required>
                <input id="confirmSystemAdminPin" class="pin-input" type="password" inputmode="numeric"
                    maxlength="4" minlength="4" autocomplete="new-password" placeholder="Confirm new PIN" required>
                <div id="changeSystemAdminPinError" class="error"></div>
                <button class="primary-button" type="submit">Save New PIN</button>
            </form>
        </div>`);
}

async function saveSystemAdminPin() {
    const next = document.getElementById("newSystemAdminPin").value;
    const confirm = document.getElementById("confirmSystemAdminPin").value;
    const box = document.getElementById("changeSystemAdminPinError");
    box.textContent = "";
    if (next !== confirm) { box.textContent = "The PIN entries do not match."; return; }
    if (!/^\d{4}$/.test(next)) { box.textContent = "Use exactly 4 digits."; return; }
    const { data, error } = await supabaseClient.rpc("change_system_admin_pin", {
        current_system_admin_pin: currentSystemAdminPIN,
        new_system_admin_pin: next
    });
    if (error || data !== true) { box.textContent = error?.message || "Unable to change PIN."; return; }
    currentSystemAdminPIN = next;
    systemAdminExpiresAt = Date.now() + 10 * 60 * 1000;
    await appAlert("System Admin PIN changed successfully.", "PIN updated", "success");
    const refreshed = await supabaseClient.rpc("get_retention_admin_data", { system_admin_pin: currentSystemAdminPIN });
    if (refreshed.error) { closeSystemAdmin(); return; }
    retentionAdminData = refreshed.data;
    showRetentionAdmin();
}


function retentionFriendlyDate(value) {
    if (!value) return "Date not recorded";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-GB", {day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);
}
function retentionFriendlyStatus(value) {
    const v=String(value||"").toLowerCase();
    if (["succeeded","success","completed"].includes(v)) return "Completed successfully";
    if (["failed","error"].includes(v)) return "Could not be completed";
    if (["running","started"].includes(v)) return "In progress";
    return v ? v.replace(/[_-]+/g," ").replace(/\b\w/g,c=>c.toUpperCase()) : "Status not recorded";
}
function retentionFriendlyMode(value) {
    const v=String(value||"").toLowerCase();
    if(v==="dry_run") return "Preview check";
    if(v==="scheduled") return "Scheduled check";
    if(v==="enforcement") return "Automatic removal";
    return v.replace(/[_-]+/g," ") || "System check";
}
function retentionHumanLabel(value) {
    return String(value||"").replace(/[_-]+/g," ").replace(/\b\w/g,c=>c.toUpperCase());
}
function retentionPolicyDescription(p) {
    const key=String(p.policy_key||"").toLowerCase()+" "+String(p.record_type||"").toLowerCase();
    const action=String(p.action||"").toLowerCase();
    if(/archiv/.test(key)) return "Keep archived player details for the period shown. After that, an administrator must check the player record before personal details are removed. Attendance history is kept";
    if(/attendance/.test(key)) return "Remove individual attendance records after the period shown. Season totals and attendance history are kept";
    if(/cancel/.test(key)) return "Keep responses for cancelled matches for the period shown, then remove those responses";
    if(/invitation|invite/.test(key)) return "Remove an invitation after it has been accepted, cancelled or expired";
    if(/availability|match.response/.test(key)) return "Keep match availability responses for the period shown after the fixture date, then remove the responses";
    if(/parent|family|account.link/.test(key)) return "Keep parent account links while they are needed. Once marked as no longer needed, an administrator must check them before removal";
    if(/security|audit|log/.test(key)) return "Keep club security records for the period shown, then remove them. Supplier-held records follow the supplier's own settings";
    if(action==="anonymise") return "Remove personal details after the period shown while keeping the remaining record";
    if(action==="review") return "An administrator must check these records before they are removed. They will not be removed automatically";
    if(action==="external") return "These records are managed by the external service and are not removed by this app";
    return "Keep these records for the period shown before the stated action can take place";
}
function retentionSummaryRows(obj,prefix) {
    const rows=[];
    if(!obj||typeof obj!=="object") return rows;
    Object.entries(obj).forEach(([key,val])=>{
        const label=(prefix?prefix+" ":"")+key.replace(/[_-]+/g," ");
        if(typeof val==="number"&&Number.isFinite(val)){if(val>0)rows.push({label:label,value:val});}
        else if(val&&typeof val==="object") rows.push(...retentionSummaryRows(val,label));
    });
    return rows;
}
function renderRetentionRunSummary(summary,mode) {
    summary=summary&&typeof summary==="object"?summary:{};
    const preview=String(mode||"").toLowerCase()==="dry_run";
    const invitationCount=Number(summary.invitation_rows_checked);
    const hasInvitationCount=Number.isFinite(invitationCount);
    const rows=retentionSummaryRows(summary,"").filter(r=>!/^invitation rows (checked|deleted)$/i.test(r.label));
    let html="";
    if(hasInvitationCount) {
        html+='<div class="retention-key-result"><strong>'+invitationCount.toLocaleString("en-GB")+'</strong><span>Invitations eligible for automatic removal</span></div>';
        html+='<p class="retention-no-changes">'+(invitationCount>0
            ?'These invitations have been accepted, revoked/cancelled or expired. They are due to be removed at the next daily cleanup (03:15 UTC (04:15 during British Summer Time)).'
            :'No accepted, revoked/cancelled or expired invitations are waiting for removal.')+'</p>';
    }
    if(rows.length) html+='<ul class="retention-result-list">'+rows.map(r=>'<li><span>'+escapeHTML(retentionHumanLabel(r.label))+'</span><strong>'+r.value.toLocaleString("en-GB")+'</strong></li>').join("")+'</ul>';
    if(!html) html='<p class="retention-no-changes">'+(preview?"No records were identified for removal or checking. Nothing has been changed":"No record changes were reported")+'</p>';
    if(preview) html+='<p class="retention-no-changes">Preview only — no records have been changed or deleted</p>';
    return html;
}
function showRetentionAdmin() {
    if (!requireSystemAdminSession() || !retentionAdminData) return;
    const policies=retentionAdminData.policies||[], runs=retentionAdminData.runs||[], changes=retentionAdminData.changes||[];
    renderShell(
      '<div class="card retention-admin">'+
      '<button class="back-button" onclick="closeSystemAdmin()">← Admin Dashboard</button>'+
      '<div class="retention-heading"><div><h2>System Admin</h2><div class="subtitle">Control how long club records are kept</div></div><button class="secondary-button small-button" onclick="showSystemAdminChangePin(false)">Change PIN</button></div>'+
      '<div class="retention-intro"><strong>How this works</strong><p>Set how long each type of record is kept. Automatic removal is separate and is currently OFF. A preview check never changes or deletes records</p></div>'+
      '<h3>How long we keep records</h3><div class="retention-policy-list">'+
      (policies.map(p=>{
        const key=escapeHTML(p.policy_key);
        const amount=Number(p.retention_value)||0;
        const isInvitation=/invitation|invite/i.test(String(p.policy_key||"")+" "+String(p.record_type||""));
        const unit=String(p.retention_unit||"").replace(/s$/,"")+(amount===1?"":"s");
        const manual=String(p.action||"").toLowerCase()==="review"||/archiv|parent|family/i.test(String(p.policy_key||"")+" "+String(p.record_type||""));
        return '<section class="retention-policy"><div class="retention-policy-title"><strong>'+escapeHTML(p.record_type||retentionHumanLabel(p.policy_key))+'</strong><span class="retention-status '+(p.enforcement_enabled?"is-on":"")+'">'+(p.enforcement_enabled?"Automatic removal ON":"Automatic removal OFF")+'</span></div>'+
        '<p class="retention-description">'+escapeHTML(retentionPolicyDescription(p))+'</p>'+
        (isInvitation?'<div class="retention-period-line"><strong>Keep until:</strong><span class="retention-unit">Accepted, revoked/cancelled or expired</span></div><p class="retention-no-changes">When this rule is active, eligible invitations are removed by the next daily cleanup at 03:15 UTC (04:15 during British Summer Time).</p>':'<div class="retention-period-line"><label for="retention-value-'+key+'">Keep for</label><input type="number" min="0" max="120" step="1" id="retention-value-'+key+'" value="'+amount+'"><span class="retention-unit">'+escapeHTML(unit)+'</span></div>')+
        '<label class="retention-active"><input type="checkbox" id="retention-enabled-'+key+'" '+(p.enabled?"checked":"")+'><span>This rule is active</span></label>'+
        '<div class="retention-actions"><button class="secondary-button small-button" onclick="saveRetentionPolicy(\''+key+'\')">Save changes</button><button class="'+(p.enforcement_enabled?"red-button":"secondary-button")+' small-button" onclick="toggleRetentionEnforcement(\''+key+'\','+(!p.enforcement_enabled)+')">'+(p.enforcement_enabled?"Turn automatic removal OFF":"Turn automatic removal ON")+'</button></div>'+
        (manual?'<p class="retention-manual-note">An administrator must check these records first. The app will not remove them automatically</p>':"")+'</section>';
      }).join("")||'<div class="empty">No record-keeping rules are available</div>')+
      '</div><section class="retention-section"><h3>Preview check</h3><p>Check which records are due for action. This does not change or delete anything</p><button class="primary-button" onclick="runRetentionDryRun()">Run preview check</button><div id="retentionDryRunResult"></div></section>'+
      '<section class="retention-section"><h3>Previous checks</h3>'+
      (runs.map(r=>'<div class="retention-history"><strong>'+escapeHTML(retentionFriendlyMode(r.run_mode))+' — '+escapeHTML(retentionFriendlyStatus(r.status))+'</strong><div class="subtitle">'+escapeHTML(retentionFriendlyDate(r.started_at))+'</div>'+renderRetentionRunSummary(r.summary,r.run_mode)+'</div>').join("")||'<div class="empty">No checks have been run yet</div>')+
      '</section><section class="retention-section"><h3>Changes to these rules</h3>'+
      (changes.map(c=>{
        const before=c.old_values||{},after=c.new_values||{};
        const oldText=before.retention_value!==undefined?before.retention_value+" "+(before.retention_unit||after.retention_unit||""):"";
        const newText=after.retention_value!==undefined?after.retention_value+" "+(after.retention_unit||before.retention_unit||""):"";
        return '<div class="retention-history"><strong>'+escapeHTML(retentionHumanLabel(c.policy_key))+'</strong><div class="subtitle">'+escapeHTML(retentionFriendlyDate(c.changed_at))+'</div><p>'+(oldText&&newText?"Changed from "+escapeHTML(oldText)+" to "+escapeHTML(newText):"A setting for this rule was changed")+'</p></div>';
      }).join("")||'<div class="empty">No rule changes have been recorded</div>')+
      '</section><section class="retention-section"><h3>System activity</h3>'+
      ((retentionAdminData.audit||[]).map(a=>'<div class="retention-history"><strong>'+escapeHTML(retentionHumanLabel(a.event_type))+' — '+escapeHTML(retentionFriendlyStatus(a.outcome))+'</strong><div class="subtitle">'+escapeHTML(retentionFriendlyDate(a.occurred_at))+'</div></div>').join("")||'<div class="empty">System Admin activity will appear here</div>')+
      '</section><button class="secondary-button" onclick="closeSystemAdmin()">Close System Admin</button></div>'
    );
}
async function saveRetentionPolicy(key) {
    if (!requireSystemAdminSession()) return;
    const policy=(retentionAdminData?.policies||[]).find(p=>p.policy_key===key);
    if(!policy){await appAlert("This rule could not be found. Refresh System Admin and try again","Unable to save","danger");return;}
    const valueInput=document.getElementById("retention-value-"+key);
    const value=valueInput?Number(valueInput.value):Number(policy.retention_value)||0;
    const enabled=document.getElementById("retention-enabled-"+key).checked;
    if(valueInput&&(!Number.isInteger(value)||value<0||value>120)){await appAlert("Enter a whole number from 0 to 120","Check the retention period","warning");return;}
    const {error}=await supabaseClient.rpc("update_retention_policy",{system_admin_pin:currentSystemAdminPIN,requested_policy_key:key,requested_retention_value:value,requested_retention_unit:policy.retention_unit,requested_enabled:enabled});
    if(error){await appAlert(error.message,"Unable to save rule","danger");return;}
    await refreshRetentionAdmin("Rule saved successfully");
}
async function toggleRetentionEnforcement(key, enabled) {
    if (!requireSystemAdminSession()) return;
    const message = enabled
        ? "This enables scheduled automatic processing for this policy. Only proceed once the rule has been reviewed and approved. Continue?"
        : "Turn off automatic enforcement for this policy?";
    const ok = await appConfirm(message, "Confirm enforcement change", enabled ? "Enable enforcement" : "Disable enforcement");
    if (!ok) return;
    const { error } = await supabaseClient.rpc("set_retention_enforcement", {
        system_admin_pin: currentSystemAdminPIN,
        requested_policy_key: key,
        requested_enforcement: enabled
    });
    if (error) { await appAlert(error.message, "Unable to change enforcement", "danger"); return; }
    await refreshRetentionAdmin("Enforcement setting updated.");
}

async function runRetentionDryRun() {
    if(!requireSystemAdminSession())return;
    const target=document.getElementById("retentionDryRunResult");
    target.innerHTML='<p class="retention-running">Checking records…</p>';
    const {data,error}=await supabaseClient.rpc("run_retention_admin_check",{system_admin_pin:currentSystemAdminPIN});
    if(error){target.innerHTML='<p class="retention-error">The preview check could not be completed. Please try again</p>';return;}
    const summary=data?.summary||data?.counts||data?.result||data||{};
    target.innerHTML='<div class="retention-preview-result"><strong>Preview check completed</strong><div class="subtitle">'+escapeHTML(retentionFriendlyDate(new Date().toISOString()))+'</div>'+renderRetentionRunSummary(summary,"dry_run")+'</div>';
    await refreshRetentionAdmin();
}
async function refreshRetentionAdmin(message) {
    if (!requireSystemAdminSession()) return;
    const { data, error } = await supabaseClient.rpc("get_retention_admin_data", {
        system_admin_pin: currentSystemAdminPIN
    });
    if (error) { await appAlert(error.message, "System Admin session ended", "warning"); closeSystemAdmin(); return; }
    retentionAdminData = data;
    showRetentionAdmin();
    if (message) await appAlert(message, "System Admin", "success");
}
