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
            <button class="secondary-button" style="width:100%;margin-top:12px"
                onclick="initialiseSystemAdmin()">First-time System Admin setup</button>
        </div>`);
    document.getElementById("systemAdminPinInput").focus();
}

async function initialiseSystemAdmin() {
    const confirmed = await appConfirm(
        "This will create the separate System Admin PIN using the temporary setup PIN. You must change it immediately after first access.",
        "Set up System Admin?",
        "Set up System Admin"
    );
    if (!confirmed) return;
    const { data, error } = await supabaseClient.rpc("setup_system_admin_pin", {
        supplied_senior_code: currentSeniorPIN,
        requested_system_admin_pin: "1111"
    });
    if (error || data !== true) {
        await appAlert(error?.message || "Unable to initialise System Admin.", "Setup failed", "danger");
        return;
    }
    const input = document.getElementById("systemAdminPinInput");
    if (input) input.value = "1111";
    await unlockSystemAdmin();
}

async function unlockSystemAdmin() {
    const input = document.getElementById("systemAdminPinInput");
    const errorBox = document.getElementById("systemAdminPinError");
    const pin = input?.value || "";
    errorBox.textContent = "";
    if (!/^\d{4,8}$/.test(pin)) {
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
    if (!/^\d{6,8}$/.test(next)) { box.textContent = "Use exactly 4 digits."; return; }
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

function showRetentionAdmin() {
    if (!requireSystemAdminSession() || !retentionAdminData) return;
    const policies = retentionAdminData.policies || [];
    const runs = retentionAdminData.runs || [];
    const changes = retentionAdminData.changes || [];
    renderShell(`
        <div class="card retention-admin">
            <button class="back-button" onclick="closeSystemAdmin()">← Admin Dashboard</button>
            <div class="retention-heading">
                <div><h2>System Admin</h2><div class="subtitle">Data retention and system controls</div></div>
                <button class="secondary-button small-button" onclick="showSystemAdminChangePin(false)">Change PIN</button>
            </div>
            <div class="info-box warning-box">
                Automatic enforcement is currently controlled per policy. Review each rule carefully.
                Dry runs do not delete or anonymise records.
            </div>
            <h3>Retention policies</h3>
            <div class="retention-policy-list">
                ${policies.map(p => `
                    <section class="retention-policy">
                        <div class="retention-policy-title"><strong>${escapeHTML(p.record_type || p.policy_key)}</strong>
                            <span class="retention-status">${p.enforcement_enabled ? "Automatic enforcement ON" : "Enforcement OFF"}</span></div>
                        <div class="subtitle">${escapeHTML(p.notes || p.action || "")}</div>
                        <div class="retention-edit-row">
                            <label>Period <input type="number" min="0" max="120" id="retention-value-${escapeHTML(p.policy_key)}" value="${p.retention_value}"></label>
                            <label>Unit <input type="text" id="retention-unit-${escapeHTML(p.policy_key)}" value="${escapeHTML(p.retention_unit)}"></label>
                            <label><span>Policy active</span><input type="checkbox" id="retention-enabled-${escapeHTML(p.policy_key)}" ${p.enabled ? "checked" : ""}></label>
                        </div>
                        <div class="retention-actions">
                            <button class="secondary-button small-button" onclick="saveRetentionPolicy('${escapeHTML(p.policy_key)}')">Save policy</button>
                            <button class="${p.enforcement_enabled ? "red-button" : "secondary-button"} small-button"
                                onclick="toggleRetentionEnforcement('${escapeHTML(p.policy_key)}',${!p.enforcement_enabled})">
                                ${p.enforcement_enabled ? "Disable enforcement" : "Enable enforcement"}
                            </button>
                        </div>
                    </section>`).join("") || '<div class="empty">No retention policies found.</div>'}
            </div>
            <h3>Retention check</h3>
            <p class="subtitle">Run a safe dry-run to see what would be processed. No records are changed.</p>
            <button class="primary-button" onclick="runRetentionDryRun()">Run dry-run check</button>
            <div id="retentionDryRunResult"></div>
            <h3>Recent runs</h3>
            ${runs.map(r => `<div class="retention-history"><strong>${escapeHTML(r.run_mode)} — ${escapeHTML(r.status)}</strong><div class="subtitle">${escapeHTML(r.started_at || "")}</div><pre>${escapeHTML(JSON.stringify(r.summary || {}, null, 2))}</pre></div>`).join("") || '<div class="empty">No runs recorded.</div>'}
            <h3>Policy change history</h3>
            ${changes.map(c => `<div class="retention-history"><strong>${escapeHTML(c.policy_key)}</strong><div class="subtitle">${escapeHTML(c.changed_at || "")}</div><pre>Before: ${escapeHTML(JSON.stringify(c.old_values || {}))}\nAfter: ${escapeHTML(JSON.stringify(c.new_values || {}))}</pre></div>`).join("") || '<div class="empty">No policy changes recorded.</div>'}
            <h3>System audit trail</h3>
            ${(retentionAdminData.audit || []).map(a => `<div class="retention-history"><strong>${escapeHTML(a.event_type)} — ${escapeHTML(a.outcome)}</strong><div class="subtitle">${escapeHTML(a.occurred_at || "")}</div></div>`).join("") || '<div class="empty">Audit entries will appear here as System Admin actions are performed.</div>'}
            <button class="secondary-button" onclick="closeSystemAdmin()">Close System Admin</button>
        </div>`);
}

async function saveRetentionPolicy(key) {
    if (!requireSystemAdminSession()) return;
    const value = Number(document.getElementById("retention-value-" + key).value);
    const unit = document.getElementById("retention-unit-" + key).value.trim();
    const enabled = document.getElementById("retention-enabled-" + key).checked;
    const { error } = await supabaseClient.rpc("update_retention_policy", {
        system_admin_pin: currentSystemAdminPIN,
        requested_policy_key: key,
        requested_retention_value: value,
        requested_retention_unit: unit,
        requested_enabled: enabled
    });
    if (error) { await appAlert(error.message, "Unable to save policy", "danger"); return; }
    await refreshRetentionAdmin("Retention policy saved.");
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
    if (!requireSystemAdminSession()) return;
    const target = document.getElementById("retentionDryRunResult");
    target.textContent = "Running dry-run…";
    const { data, error } = await supabaseClient.rpc("run_retention_admin_check", {
        system_admin_pin: currentSystemAdminPIN
    });
    if (error) { target.textContent = error.message; return; }
    target.textContent = JSON.stringify(data, null, 2);
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
