// =====================================================
// PERSONAL USER LOGIN
// =====================================================

let personalLoginUsers = [];
let selectedPersonalUserID = null;
let currentPersonID = null;
let currentUserName = null;
let currentUserRoles = [];
let currentAllowedAgeGroupIDs = [];
let currentAuthSessionToken = null;

async function showWelcome() {
    currentAccessPIN = null;
    currentSeniorPIN = null;
    currentRole = null;
    currentPersonID = null;
    currentUserName = null;
    currentUserRoles = [];
    currentAllowedAgeGroupIDs = [];
    currentAuthSessionToken = null;
    currentAgeGroup = null;
    selectedAgeGroups = [];
    selectedPersonalUserID = null;

    const { data, error } = await supabaseClient.rpc(
        "get_personal_pin_login_users"
    );

    if (error || !Array.isArray(data)) {
        console.error("Personal login user list failed:", error);
        document.getElementById("app").innerHTML = `
            <div class="welcome"><div class="welcome-card">
                <img src="RHRFC.jpg" class="welcome-logo" alt="Rushden & Higham RUFC">
                <div class="welcome-title">CLUB CHECK-IN</div>
                <div class="welcome-club">Rushden &amp; Higham RUFC</div>
                <div class="error">Unable to load approved users. Please check your connection.</div>
                <button class="role-button" onclick="showWelcome()">Try Again</button>
                <button class="secondary-button" style="width:100%;margin-top:10px" onclick="showPIN('coach')">Existing shared PIN login</button>
            </div></div>`;
        return;
    }

    personalLoginUsers = data;
    renderPersonalLogin();
}

function renderPersonalLogin(message = "") {
    const options = personalLoginUsers.map(user => `
        <option value="${escapeHTML(user.person_id)}" ${selectedPersonalUserID === user.person_id ? "selected" : ""}>
            ${escapeHTML(user.display_name)}
        </option>`).join("");

    const selected = personalLoginUsers.find(user => user.person_id === selectedPersonalUserID);
    const setup = !!selected?.pin_setup_required;

    document.getElementById("app").innerHTML = `
        <div class="welcome">
            <div class="welcome-card">
                <img src="RHRFC.jpg" class="welcome-logo" alt="Rushden &amp; Higham RUFC">
                <div class="welcome-title">CLUB CHECK-IN</div>
                <div class="welcome-club">Rushden &amp; Higham RUFC</div>

                <form onsubmit="event.preventDefault(); submitPersonalLogin();">
                    <label for="personalUserSelect" style="display:block;text-align:left;font-weight:700;margin:0 0 7px">Your name</label>
                    <select id="personalUserSelect" onchange="selectPersonalLoginUser(this.value)"
                        style="width:100%;padding:14px;border:1px solid #ccc;border-radius:10px;background:#fff;color:#111;font:inherit;margin-bottom:12px">
                        <option value="">Select your name</option>
                        ${options}
                    </select>

                    ${selected ? (setup ? `
                        <p class="subtitle" style="margin:8px 0 14px">First-time setup: enter the existing shared Coach PIN, then choose your personal PIN.</p>
                        <input id="setupSharedPin" class="pin-input" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Shared Coach PIN" required>
                        <input id="setupNewPin" class="pin-input" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" placeholder="New personal PIN" required>
                        <input id="setupConfirmPin" class="pin-input" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" placeholder="Confirm personal PIN" required>
                    ` : `
                        <input id="personalPin" class="pin-input" type="password" inputmode="numeric" maxlength="12" autocomplete="current-password" placeholder="Personal PIN" required>
                    `) : ""}
                    <div id="personalLoginError" class="error">${escapeHTML(message)}</div>
                    <button class="primary-button" type="submit" ${selected ? "" : "disabled"}>
                        ${setup ? "Set Up Personal PIN" : "Sign In"}
                    </button>
                </form>

                <button class="secondary-button" style="width:100%;margin-top:12px" onclick="showPIN('coach')">
                    Existing shared PIN login
                </button>
                ${getInstallButtonHTML()}
                <a class="policy-link" href="https://rhrfc-mini.pages.dev/policies/" target="_blank" rel="noopener noreferrer">Privacy &amp; Data Protection</a>
                <div class="welcome-version">${APP_VERSION}</div>
            </div>
        </div>`;

    if (selected) {
        const target = document.getElementById(setup ? "setupSharedPin" : "personalPin");
        target?.focus();
    }
}

function selectPersonalLoginUser(personID) {
    selectedPersonalUserID = personID || null;
    renderPersonalLogin();
}

async function submitPersonalLogin() {
    const errorBox = document.getElementById("personalLoginError");
    const user = personalLoginUsers.find(item => item.person_id === selectedPersonalUserID);
    if (!user) {
        errorBox.textContent = "Please select your name.";
        return;
    }

    const installationID = getInstallationID();
    let pin = "";

    if (user.pin_setup_required) {
        const sharedPin = document.getElementById("setupSharedPin")?.value || "";
        const newPin = document.getElementById("setupNewPin")?.value || "";
        const confirmPin = document.getElementById("setupConfirmPin")?.value || "";

        if (!sharedPin || !newPin || !confirmPin) {
            errorBox.textContent = "Complete all PIN fields.";
            return;
        }
        if (!/^\d{6,12}$/.test(newPin)) {
            errorBox.textContent = "Your personal PIN must be 6–12 digits.";
            return;
        }
        if (newPin !== confirmPin) {
            errorBox.textContent = "The new PINs do not match.";
            return;
        }

        const { data, error } = await supabaseClient.rpc("complete_personal_pin_setup", {
            supplied_name: user.display_name,
            supplied_shared_pin: sharedPin,
            supplied_new_pin: newPin,
            supplied_installation_id: installationID
        });

        if (error || data !== true) {
            console.error("Personal PIN setup failed:", error);
            errorBox.textContent = "Setup could not be completed. Check the shared Coach PIN, your account status and try again.";
            return;
        }
        pin = newPin;
    } else {
        pin = document.getElementById("personalPin")?.value || "";
        if (!pin) {
            errorBox.textContent = "Please enter your personal PIN.";
            return;
        }
    }

    errorBox.textContent = "Signing in…";
    const { data, error } = await supabaseClient.rpc("authenticate_user_pin", {
        supplied_person_id: user.person_id,
        supplied_pin: pin,
        supplied_installation_id: installationID
    });

    if (error || !data?.success) {
        console.error("Personal login failed:", error || data);
        errorBox.textContent = data?.message || "Unable to sign in. Please try again.";
        return;
    }

    currentPersonID = data.person_id;
    currentUserName = data.name;
    currentUserRoles = Array.isArray(data.roles) ? data.roles : [];
    currentAllowedAgeGroupIDs = Array.isArray(data.age_group_ids) ? data.age_group_ids.map(Number) : [];
    currentAuthSessionToken = data.session_token;
    currentAccessPIN = data.session_token;
    currentSeniorPIN = currentUserRoles.includes("admin") ? data.session_token : null;
    currentRole = currentUserRoles.includes("coach") ? "coach" : "senior";

    if (currentRole === "coach") {
        const assigned = getAssignedCoachAgeGroups();
        if (!assigned.length) {
            await appAlert("Your account has no active age groups assigned. Please contact an Admin.", "No age groups assigned", "warning");
            logout();
            return;
        }
        selectedAgeGroups = assigned.length === 1 ? [...assigned] : [];
    }

    let loaded = false;
    try { loaded = await loadPlayersFromSupabase(); }
    catch (loadError) { console.error("Player load failed:", loadError); }

    if (!loaded) {
        clearPersonalSession();
        await appAlert("Unable to load player data. Please try again.", "Login unavailable", "danger");
        showWelcome();
        return;
    }

    await autoClosePreviousAttendanceRegisters();

    if (currentRole === "coach") {
        if (selectedAgeGroups.length === 1) {
            currentAgeGroup = selectedAgeGroups[0];
            await showCoachDashboard();
        } else {
            showCoachAgeGroups();
        }
    } else {
        await showSeniorDashboard();
    }
}

function getAssignedCoachAgeGroups() {
    return ageGroupData
        .filter(group => group.active && currentAllowedAgeGroupIDs.includes(Number(group.id)))
        .map(group => group.age_group);
}

function clearPersonalSession() {
    currentAccessPIN = null;
    currentSeniorPIN = null;
    currentPersonID = null;
    currentUserName = null;
    currentUserRoles = [];
    currentAllowedAgeGroupIDs = [];
    currentAuthSessionToken = null;
    currentRole = null;
    currentAgeGroup = null;
    selectedAgeGroups = [];
}


async function revokePersonalSession() {
    if (!currentAuthSessionToken) return;
    try {
        const { error } = await supabaseClient.rpc("revoke_personal_user_session", {
            supplied_session_token: currentAuthSessionToken,
            supplied_installation_id: getInstallationID()
        });
        if (error) console.error("Session revocation failed:", error);
    } catch (error) {
        console.error("Session revocation failed:", error);
    }
}
