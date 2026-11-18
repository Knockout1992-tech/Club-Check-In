// =====================================================
// PERSONAL USER LOGIN
// =====================================================

let personalLoginAccount = null;
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
    personalLoginAccount = null;

    renderPersonalLogin();
}

function renderPersonalLogin(message = "") {
    const account = personalLoginAccount;
    const setup = !!account?.pin_setup_required;
    const isSystemAdmin = account?.protected_user === true;

    document.getElementById("app").innerHTML = `
        <div class="welcome">
            <div class="welcome-card">
                <img src="RHRFC.jpg" class="welcome-logo" alt="Rushden &amp; Higham RUFC">
                <div class="welcome-title">CLUB CHECK-IN</div>
                <div class="welcome-club">Rushden &amp; Higham RUFC</div>

                ${!account ? `
                    <form onsubmit="event.preventDefault(); lookupPersonalLoginName();">
                        <label for="personalNameInput" style="display:block;text-align:left;font-weight:700;margin:0 0 7px">Your name</label>
                        <input id="personalNameInput" class="pin-input" type="text" maxlength="100"
                            autocomplete="name" placeholder="Enter your name" required>
                        <div id="personalLoginError" class="error">${escapeHTML(message)}</div>
                        <button class="primary-button" type="submit">Continue</button>
                    </form>
                ` : isSystemAdmin ? `
                    <p class="subtitle" style="margin:12px 0">System Admin</p>
                    <p class="subtitle">Continue using the existing Admin PIN.</p>
                    <button class="primary-button" onclick="continueSystemAdminLogin()">Continue to Admin PIN</button>
                    <button class="secondary-button personal-login-secondary" onclick="resetPersonalLoginName()">Use a different name</button>
                ` : `
                    <p class="subtitle" style="margin:8px 0 14px">Signing in as <strong>${escapeHTML(account.display_name)}</strong></p>
                    <form onsubmit="event.preventDefault(); submitPersonalLogin();">
                        ${setup ? `
                            <p class="subtitle" style="margin:8px 0 14px">First-time setup: enter the existing shared Coach PIN, then choose your personal PIN.</p>
                            <input id="setupSharedPin" class="pin-input" type="password" inputmode="numeric" maxlength="8" autocomplete="off" placeholder="Shared Coach PIN" required>
                            <input id="setupNewPin" class="pin-input" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" placeholder="New personal PIN" required>
                            <input id="setupConfirmPin" class="pin-input" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password" placeholder="Confirm personal PIN" required>
                        ` : `
                            <input id="personalPin" class="pin-input" type="password" inputmode="numeric" maxlength="12" autocomplete="current-password" placeholder="Personal PIN" required>
                        `}
                        <div id="personalLoginError" class="error">${escapeHTML(message)}</div>
                        <button class="primary-button" type="submit">${setup ? "Set Up Personal PIN" : "Sign In"}</button>
                    </form>
                    <button class="secondary-button personal-login-secondary" onclick="resetPersonalLoginName()">Use a different name</button>
                `}
                ${getInstallButtonHTML()}
                <a class="policy-link" href="https://rhrfc-mini.pages.dev/policies/" target="_blank" rel="noopener noreferrer">Privacy &amp; Data Protection</a>
                <div class="welcome-version">${APP_VERSION}</div>
            </div>
        </div>`;

    document.getElementById(account && !isSystemAdmin
        ? (setup ? "setupSharedPin" : "personalPin")
        : "personalNameInput")?.focus();
}

async function lookupPersonalLoginName() {
    const name = document.getElementById("personalNameInput")?.value.trim() || "";
    const errorBox = document.getElementById("personalLoginError");

    if (!name) {
        errorBox.textContent = "Please enter your name.";
        return;
    }

    errorBox.textContent = "Checking account…";
    const { data, error } = await supabaseClient.rpc("get_personal_pin_login_status", {
        supplied_name: name
    });

    if (error || !data?.success) {
        console.error("Personal login name lookup failed:", error || data);
        errorBox.textContent = data?.message || "Unable to check the account. Please try again.";
        return;
    }

    personalLoginAccount = {
        person_id: data.person_id,
        display_name: data.display_name,
        pin_setup_required: data.pin_setup_required === true,
        protected_user: data.protected_user === true
    };

    renderPersonalLogin();
}

function resetPersonalLoginName() {
    personalLoginAccount = null;
    renderPersonalLogin();
}

function continueSystemAdminLogin() {
    if (!personalLoginAccount?.protected_user || personalLoginAccount.person_id !== "MAIN-001") {
        renderPersonalLogin("Invalid System Admin account.");
        return;
    }
    showPIN("senior");
}

async function submitPersonalLogin() {
    const errorBox = document.getElementById("personalLoginError");
    const user = personalLoginAccount;

    if (!user || user.protected_user) {
        errorBox.textContent = "Please enter your name again.";
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
        if (!/^\\d{6,12}$/.test(newPin)) {
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
