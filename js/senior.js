
// =========================================================
// ADMIN / SENIOR FUNCTIONS
// =========================================================


// =========================================================
// ANONYMISE ARCHIVED PLAYER
// =========================================================

async function permanentlyRemovePlayer(playerID) {
    const diag = window.clubCheckInDiagnostics;

    if (currentRole !== "senior") {
        await appAlert(
            "Only Admin can anonymise players.",
            "Access denied",
            "danger"
        );
        return;
    }

    const player = findPlayerByID(playerID);

    if (!player || !player.archived) {
        await appAlert(
            "Only archived players can be anonymised.",
            "Action not allowed",
            "warning"
        );
        return;
    }

    const confirmed = await appConfirm(
        "Anonymise " + player.name + "?\n\n" +
        "Their name will be replaced with an anonymous ID.\n" +
        "Their historical attendance will be retained.\n\n" +
        "This cannot be undone.",
        "Anonymise player?",
        "Anonymise player"
    );

    if (!confirmed) return;

    try {
        const { data, error } = await supabaseClient.rpc(
            "anonymise_archived_player",
            {
                supplied_code: currentSeniorPIN,
                requested_player_id: playerID
            }
        );

        if (error) throw error;

        if (typeof data !== "string" || !data) {
            throw new Error(
                "Supabase did not confirm anonymisation. Check the PIN and archived status."
            );
        }

        ageGroups.forEach(ageGroup => {
            if (players[ageGroup]) {
                players[ageGroup] = players[ageGroup].filter(
                    item => item.id !== playerID
                );
            }
        });

        saveData();

        diag?.log("Archived player anonymised successfully.");

        await appAlert(
            "Player anonymised successfully as " + data + ".",
            "Anonymisation complete",
            "success"
        );

        showArchiveList();

    } catch (error) {
        diag?.error("Anonymisation failed:", error.message);
        console.error("Anonymisation failed:", error.message);

        await appAlert(
            "Anonymisation failed. No local player data was removed.",
            "Anonymisation failed",
            "danger"
        );
    }
}


// =========================================================
// USER MANAGEMENT
// =========================================================

async function showUserManagement() {

    const {
        data: users,
        error
    } = await supabaseClient.rpc(
        "get_manageable_users",
        {
            current_senior_code: currentSeniorPIN
        }
    );

    if (error || !Array.isArray(users)) {

        console.error("User management load failed:", error);

        if (window.clubCheckInDiagnostics) {
            window.clubCheckInDiagnostics.error(
                "User management load failed",
                error
            );
        }

        renderShell(`
            <div class="card">

                <button class="back-button"
                    onclick="showSeniorDashboard()">
                    ← Admin Dashboard
                </button>

                <h2>User Management</h2>

                <div class="info-box">
                    Unable to load users.
                </div>

            </div>
        `);

        return;
    }

    const {
        data: installations,
        error: installationError
    } = await supabaseClient.rpc(
        "get_installation_status",
        {
            current_senior_code: currentSeniorPIN
        }
    );

    if (installationError || !Array.isArray(installations)) {

        const errorDetails = installationError
            ? {
                message: installationError.message,
                details: installationError.details,
                hint: installationError.hint,
                code: installationError.code
            }
            : {
                message: "Installation status returned an unexpected response."
            };

        console.error(
            "Installation status load failed:",
            errorDetails
        );

        if (window.clubCheckInDiagnostics) {
            window.clubCheckInDiagnostics.error(
                "Installation status load failed",
                errorDetails
            );

            window.clubCheckInDiagnostics.show();
        }

        renderShell(`
            <div class="card">

                <button class="back-button"
                    onclick="showSeniorDashboard()">
                    ← Admin Dashboard
                </button>

                <h2>User Management</h2>

                <div class="info-box">
                    Unable to load device registration status.
                    Check the diagnostic panel for details.
                </div>

            </div>
        `);

        return;
    }

    const installationSummary = {};

    installations.forEach(installation => {
        installationSummary[installation.person_id] = {
            activeCount: Number(
                installation.active_installations || 0
            ),
            lastSeen: installation.last_seen_at || null
        };
    });

    function formatDeviceLastSeen(value) {

        if (!value) return "Not available";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }

    renderShell(`
        <div class="card">

            <button class="back-button"
                onclick="showSeniorDashboard()">
                ← Admin Dashboard
            </button>

            <h2>User Management</h2>

            <button class="primary-button"
                onclick="showAddCoach()">
                + Add Coach
            </button>

            <br><br>

            ${
                users.length === 0
                ? `
                    <div class="info-box">
                        No users have been added yet.
                    </div>
                `
                : users.map((user, index) => {

                    const device =
                        installationSummary[user.person_id] || {
                            activeCount: 0,
                            lastSeen: null
                        };

                    const deviceStatus =
                        device.activeCount > 0
                        ? "Device Registered"
                        : "No Active Device";

                    const deviceClass =
                        device.activeCount > 0
                        ? "user-status-active"
                        : "user-status-inactive";

                    return `
                        <div class="info-box user-management-card">

                            <div class="user-management-header">

                                <strong>${escapeHTML(user.name)}</strong>

                                <div style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">

                                    <span class="user-status ${
                                        user.active
                                        ? "user-status-active"
                                        : "user-status-inactive"
                                    }">
                                        ${user.active ? "Active" : "Inactive"}
                                    </span>

                                    <span class="user-status ${deviceClass}">
                                        ${deviceStatus}
                                    </span>

                                </div>

                                ${
                                    device.activeCount > 1
                                    ? `
                                        <br>
                                        <span class="user-status user-status-inactive">
                                            Warning: ${device.activeCount} active installations
                                        </span>
                                    `
                                    : ""
                                }

                                <br>

                                <small>
                                    Last seen:
                                    ${formatDeviceLastSeen(device.lastSeen)}
                                </small>

                            </div>

                            <div class="user-management-actions">

                                <button type="button"
                                    class="user-action-button ${
                                        user.active
                                        ? "user-action-danger"
                                        : "user-action-primary"
                                    } user-active-button"
                                    data-user-index="${index}">
                                    ${user.active ? "Deactivate" : "Activate"}
                                </button>

                                <button type="button"
                                    class="user-action-button user-action-neutral reset-installation-button"
                                    data-user-index="${index}">
                                    Reset Installation
                                </button>

                                <button type="button"
                                    class="user-action-button user-action-neutral change-user-name-button"
                                    data-user-index="${index}">
                                    Change Name
                                </button>

                            </div>

                        </div>
                    `;

                }).join("")
            }

        </div>
    `);

    document
        .querySelectorAll(".user-active-button")
        .forEach(button => {

            button.addEventListener("click", async () => {

                const selectedUser =
                    users[Number(button.dataset.userIndex)];

                if (!selectedUser) {
                    await appAlert(
                        "User could not be found.",
                        "User not found",
                        "danger"
                    );
                    return;
                }

                await setUserActive(
                    selectedUser.person_id,
                    !selectedUser.active
                );
            });
        });

    document
        .querySelectorAll(".reset-installation-button")
        .forEach(button => {

            button.addEventListener("click", async () => {

                const selectedUser =
                    users[Number(button.dataset.userIndex)];

                if (!selectedUser) {
                    await appAlert(
                        "User could not be found.",
                        "User not found",
                        "danger"
                    );
                    return;
                }

                await resetUserInstallation(
                    selectedUser.person_id
                );
            });
        });

    document
        .querySelectorAll(".change-user-name-button")
        .forEach(button => {

            button.addEventListener("click", async () => {

                const selectedUser =
                    users[Number(button.dataset.userIndex)];

                if (!selectedUser) {
                    await appAlert(
                        "User could not be found.",
                        "User not found",
                        "danger"
                    );
                    return;
                }

                showChangeUserName(selectedUser.person_id);
            });
        });
}


// =========================================================
// ADD COACH
// =========================================================

function showAddCoach() {

    renderShell(`
        <div class="card">

            <button class="back-button"
                onclick="showUserManagement()">
                ← User Management
            </button>

            <h2>Add Coach</h2>

            <input
                type="text"
                id="newCoachName"
                placeholder="Coach Name"
                maxlength="100"
                autocomplete="off">

            <button class="menu-button blue"
                onclick="addCoach()">
                Add Coach
            </button>

            <div id="addCoachMessage" class="info-box"></div>

        </div>
    `);
}


async function addCoach() {

    const input = document.getElementById("newCoachName");
    const message = document.getElementById("addCoachMessage");

    if (!input || !message) return;

    const name = input.value.trim();

    if (!name) {
        message.textContent = "Please enter the coach's name.";
        return;
    }

    if (name.length > 100) {
        message.textContent = "The name cannot exceed 100 characters.";
        return;
    }

    const { data, error } = await supabaseClient.rpc(
        "add_manageable_user",
        {
            current_senior_code: currentSeniorPIN,
            requested_name: name
        }
    );

    if (error) {
        console.error("Add coach failed:", error);
        message.textContent = "Unable to add coach. Please try again.";
        return;
    }

    if (!data) {
        message.textContent =
            "A user with that name may already exist. Check the name and try again.";
        return;
    }

    await showUserManagement();
}


// =========================================================
// CHANGE USER NAME
// =========================================================

async function showChangeUserName(personID) {

    const { data: users, error } = await supabaseClient.rpc(
        "get_manageable_users",
        {
            current_senior_code: currentSeniorPIN
        }
    );

    if (error || !Array.isArray(users)) {
        console.error("Unable to load user for renaming:", error);

        await appAlert(
            "Unable to load the user's details.",
            "Unable to load user",
            "danger"
        );

        return;
    }

    const user = users.find(item => item.person_id === personID);

    if (!user) {
        await appAlert(
            "User could not be found.",
            "User not found",
            "danger"
        );
        return;
    }

    renderShell(`
        <div class="card">

            <button class="back-button"
                onclick="showUserManagement()">
                ← User Management
            </button>

            <h2>Change Name</h2>

            <label for="updatedUserName">User name</label>

            <input
                type="text"
                id="updatedUserName"
                maxlength="100"
                autocomplete="off"
                placeholder="Enter user name">

            <button class="blue-button small-button"
                onclick="saveUserName('${personID}')">
                Save Name
            </button>

            <div id="changeUserNameMessage" class="info-box"></div>

        </div>
    `);

    const nameInput = document.getElementById("updatedUserName");

    if (nameInput) {
        nameInput.value = user.name;
        nameInput.focus();
        nameInput.select();
    }
}


async function saveUserName(personID) {

    const input = document.getElementById("updatedUserName");
    const message = document.getElementById("changeUserNameMessage");

    if (!input || !message) return;

    const name = input.value.trim();

    if (!name) {
        message.textContent = "Please enter a name.";
        return;
    }

    if (name.length > 100) {
        message.textContent = "The name cannot exceed 100 characters.";
        return;
    }

    const { data, error } = await supabaseClient.rpc(
        "rename_manageable_user",
        {
            current_senior_code: currentSeniorPIN,
            requested_person_id: personID,
            requested_name: name
        }
    );

    if (error) {
        console.error("Rename user failed:", error);
        message.textContent = "Unable to change the name. Please try again.";
        return;
    }

    if (!data) {
        message.textContent =
            "A user with that name may already exist, or the name could not be changed.";
        return;
    }

    await showUserManagement();
}


// =========================================================
// ACTIVATE / DEACTIVATE USER
// =========================================================

async function setUserActive(personID, active) {

    const action = active ? "activate" : "deactivate";

    const confirmed = await appConfirm(
        `Are you sure you want to ${action} this user?`,
        `${active ? "Activate" : "Deactivate"} user`,
        active ? "Activate user" : "Deactivate user"
    );

    if (!confirmed) return;

    const { data, error } = await supabaseClient.rpc(
        "set_manageable_user_active",
        {
            current_senior_code: currentSeniorPIN,
            requested_person_id: personID,
            requested_active: active
        }
    );

    if (error) {
        console.error("User status update failed:", error);

        await appAlert(
            "Unable to update user status.",
            "Update failed",
            "danger"
        );
        return;
    }

    if (!data) {
        await appAlert(
            "User status could not be changed.",
            "Update unsuccessful",
            "danger"
        );
        return;
    }

    await showUserManagement();
}


// =========================================================
// RESET USER INSTALLATION
// =========================================================

async function resetUserInstallation(personID) {

    const confirmed = await appConfirm(
        "Reset this user's installation?\n\n" +
        "Their current device registration will be revoked, " +
        "and they will need to activate the replacement device.",
        "Reset installation?",
        "Reset installation"
    );

    if (!confirmed) return;

    const { data, error } = await supabaseClient.rpc(
        "reset_installation",
        {
            current_senior_code: currentSeniorPIN,
            requested_person_id: personID
        }
    );

    if (error) {
        console.error("Installation reset failed:", error);

        await appAlert(
            "Unable to reset installation.",
            "Reset failed",
            "danger"
        );
        return;
    }

    if (!data) {
        await appAlert(
            "Installation could not be reset.",
            "Reset unsuccessful",
            "danger"
        );
        return;
    }

    await appAlert(
        "Installation reset successfully.",
        "Installation reset",
        "success"
    );

    await showUserManagement();
}


// =========================================================
// MATCH AVAILABILITY - ADMIN
// =========================================================

let matchFixtureRefreshTimer = null;

let matchAdminAgeGroups = [];
let latestCreatedFixtureLink = null;

const MATCH_AVAILABILITY_URL =
    "https://knockout1992-tech.github.io/Club-Match-Availability/";


function matchAdminEscape(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}


function matchAdminDate(value) {
    if (!value) return "";

    const parts = String(value).split("-");

    if (parts.length !== 3) return value;

    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}



async function matchAdminCall(functionName, body) {

    const credentials =
        currentRole === "senior"
        ? { senior_code: currentSeniorPIN }
        : { coach_code: currentAccessPIN };

    const { data, error } =
        await supabaseClient.functions.invoke(
            functionName,
            {
                body: {
                    installation_id: getInstallationID(),
                    ...credentials,
                    ...(currentRole === "coach"
                        ? { selected_age_groups: selectedAgeGroups }
                        : {}),
                    ...body
                }
            }
        );

    if (error) {
        console.error(
            `Match Availability ${functionName} error:`,
            error
        );

        throw new Error(
            error.message || "Unable to contact the server."
        );
    }

    if (!data?.success) {
        throw new Error(
            data?.error || "The request could not be completed."
        );
    }

    return data;
}

// =========================================================
// OPEN ADMIN FIXTURE SCREEN
// =========================================================


async function showMatchAvailabilityAdmin() {

    if (
        !(
            (currentRole === "senior" && currentSeniorPIN) ||
            (currentRole === "coach" && currentAccessPIN)
        )
    ) {
        await appAlert(
            "Please log in to access Match Availability.",
            "Access required",
            "danger"
        );
        return;
    }

    const isSenior = currentRole === "senior";

    renderShell(`
        <div class="card">

            <button class="back-button"
                onclick="${isSenior ? "showSeniorDashboard()" : "showCoachDashboard()"}">
                ← Back to Dashboard
            </button>

            <h2>Match Availability</h2>

            <div class="subtitle">
                Manage fixtures and parent responses.
            </div>

            <div id="matchAdminMessage"></div>

            <div class="user-management-actions" style="margin-top:20px;">
                <button class="primary-button"
                    onclick="showMatchFixtureForm()">
                    + Create Fixture
                </button>

                <button class="secondary-button"
                    onclick="copyCentralMatchParentLink()">
                    Copy Parent Home Link
                </button>
            </div>

            <h3 style="margin-top:25px;">Fixtures</h3>

            <div id="matchAdminFixtures">
                Loading fixtures...
            </div>

        </div>
    `);

    await loadMatchAdminFixtures();
}

// =========================================================
// LOAD FIXTURES
// =========================================================

async function loadMatchAdminFixtures() {

    const container = document.getElementById(
        "matchAdminFixtures"
    );

    if (!container) return;

    container.innerHTML = "Loading fixtures...";

    try {

        const result = await matchAdminCall(
            "admin_fixtures",
            {
                action: "list"
            }
        );

        // Active age groups supplied by the Edge Function
        matchAdminAgeGroups = result.available_age_groups || [];

        const allFixtures = result.fixtures || [];

        // Filter fixtures for Coaches using their dashboard selection
        const fixtures =
            currentRole === "coach" &&
            selectedAgeGroups.length > 0
            ? allFixtures.filter(fixture => {

                const fixtureGroups = (fixture.age_groups || [])
                    .map(group =>
                        group.display_name || group.age_group
                    );

                return selectedAgeGroups.some(ageGroup =>
                    fixtureGroups.includes(ageGroup)
                );

            })
            : allFixtures;

        const canManageFixtures =
            (currentRole === "senior" && currentSeniorPIN) ||
            (currentRole === "coach" && currentAccessPIN);

        if (!fixtures.length) {
            container.innerHTML = `
                <p>
                    ${
                        currentRole === "coach"
                        ? "No fixtures found for your selected age groups."
                        : "No fixtures have been created yet."
                    }
                </p>
            `;
            return;
        }

        container.innerHTML = fixtures.map(fixture => {

            const groups = (fixture.age_groups || [])
                .map(group =>
                    group.display_name || group.age_group
                )
                .join(", ");

            const status = String(
                fixture.status || ""
            ).toLowerCase();

            const statusLabel =
                status.charAt(0).toUpperCase() +
                status.slice(1);

            return `
                <div class="card" style="margin:12px 0;">

                    <h3>
                        ${matchAdminEscape(fixture.opposition)}
                    </h3>

                    <p>
                        <strong>Date:</strong>
                        ${matchAdminEscape(
                            matchAdminDate(fixture.fixture_date)
                        )}
                    </p>

                    <p>
                        <strong>Type:</strong>
                        ${
                            status === "cancelled"
                            ? "Cancelled"
                            : fixture.fixture_type === "home"
                                ? "Home"
                                : "Away"
                        }
                    </p>

                    <p>
                        <strong>Age groups:</strong>
                        ${matchAdminEscape(groups || "None")}
                    </p>

                    <p>
                        <strong>Status:</strong>
                        ${matchAdminEscape(statusLabel)}
                    </p>

                    <p>
                        <strong>Responses:</strong>
                        ${Number(fixture.response_count || 0)}
                        parents /
                        ${Number(fixture.children_count || 0)}
                        children
                    </p>

                    <div class="fixture-actions" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:20px;">

                    ${
                        canManageFixtures && status === "draft"
                        ? `
                            <button class="primary-button"
                                onclick="publishMatchFixture(${Number(fixture.id)})">
                                Publish Fixture
                            </button>
                        `
                        : ""
                    }

                    ${
                        canManageFixtures && ["draft", "open"].includes(status)
                        ? `
                            <button class="secondary-button"
                                onclick="editMatchFixture(${Number(fixture.id)})">
                                Edit Fixture
                            </button>

                            <button class="secondary-button"
                                onclick="cancelMatchFixture(${Number(fixture.id)})">
                                Cancel Fixture
                            </button>
                        `
                        : ""
                    }

                    ${
                        status !== "draft"
                        ? `
                            <button class="secondary-button"
                                onclick="viewMatchFixture(${Number(fixture.id)})">
                                View Responses
                            </button>
                        `
                        : ""
                    }

                    </div>

                </div>
            `;

        }).join("");

    } catch (error) {

        console.error(error);

        container.innerHTML = `
            <p class="error">
                ${matchAdminEscape(error.message)}
            </p>

            <button class="secondary-button"
                onclick="loadMatchAdminFixtures()">
                Try Again
            </button>
        `;
    }
}
// =========================================================
// CREATE FIXTURE FORM
// =========================================================

function showMatchFixtureForm(fixture = null) {

    const container = document.getElementById("matchAdminFixtures");
    if (!container) return;

    const isEditing = Boolean(fixture);
    const hasResponses = Number(fixture?.response_count || 0) > 0;

    const selectedIDs = new Set(
        (fixture?.age_groups || []).map(group => Number(group.age_group_id))
    );

    const ageGroupHTML = matchAdminAgeGroups.map(group => {
        const checked = selectedIDs.has(Number(group.id)) ? "checked" : "";
        const outsideCoachGroups =
            currentRole === "coach" &&
            !selectedAgeGroups.includes(group.display_name || group.age_group);
        const disabled = hasResponses || outsideCoachGroups ? "disabled" : "";

        return `
            <label style="
                display:flex;
                align-items:center;
                gap:10px;
                margin:10px 0;
            ">
                <input
                    type="checkbox"
                    class="matchFixtureAgeGroup"
                    value="${Number(group.id)}"
                    ${checked}
                    ${disabled}>

                ${matchAdminEscape(group.display_name || group.age_group)}
            </label>
        `;
    }).join("");

    const deadlineDate = fixture?.response_deadline
        ? new Date(fixture.response_deadline)
        : null;
    const deadline = deadlineDate && !Number.isNaN(deadlineDate.getTime())
        ? [
            deadlineDate.getFullYear(),
            String(deadlineDate.getMonth() + 1).padStart(2, "0"),
            String(deadlineDate.getDate()).padStart(2, "0")
        ].join("-") + "T" + [
            String(deadlineDate.getHours()).padStart(2, "0"),
            String(deadlineDate.getMinutes()).padStart(2, "0")
        ].join(":")
        : "";

    container.innerHTML = `
        <div class="card">

            <h3>${isEditing ? "Edit Fixture" : "Create Fixture"}</h3>

            ${hasResponses ? `
                <div class="info-box">
                    Age groups are locked because parents have already responded.
                    All other fixture details can still be changed.
                </div>
            ` : ""}

            <form onsubmit="
                event.preventDefault();
                ${isEditing
                    ? `updateMatchFixtureFromForm(${Number(fixture.id)})`
                    : "createMatchFixtureFromForm()"};
            ">

                <label>Opposition</label>
                <input
                    id="matchOpposition"
                    type="text"
                    required
                    maxlength="150"
                    value="${matchAdminEscape(fixture?.opposition || "")}"
                    placeholder="e.g. Northampton RFC">

                <label style="display:block;margin-top:15px;">
                    Fixture date
                </label>
                <input
                    id="matchFixtureDate"
                    type="date"
                    required
                    value="${matchAdminEscape(fixture?.fixture_date || "")}">

                <label style="display:block;margin-top:15px;">
                    Fixture type
                </label>
                <select id="matchFixtureType">
                    <option value="home" ${fixture?.fixture_type === "home" ? "selected" : ""}>Home</option>
                    <option value="away" ${fixture?.fixture_type === "away" ? "selected" : ""}>Away</option>
                </select>

                <label style="display:block;margin-top:15px;">
                    Kick-off time
                </label>
                <input
                    id="matchKickOff"
                    type="time"
                    value="${matchAdminEscape(fixture?.kick_off_time || "")}">

                <label style="display:block;margin-top:15px;">
                    Venue
                </label>
                <input
                    id="matchVenue"
                    type="text"
                    maxlength="150"
                    value="${matchAdminEscape(fixture?.venue || "")}"
                    placeholder="e.g. Rushden & Higham RFC">

                <label style="display:block;margin-top:15px;">
                    Venue address
                </label>
                <input
                    id="matchVenueAddress"
                    type="text"
                    maxlength="300"
                    value="${matchAdminEscape(fixture?.venue_address || "")}">

                <label style="display:block;margin-top:15px;">
                    Response deadline
                </label>
                <input
                    id="matchResponseDeadline"
                    type="datetime-local"
                    value="${deadline}">

                <h3 style="margin-top:20px;">Age Groups</h3>

                ${ageGroupHTML}

                <div style="margin-top:25px;">

                    <button class="primary-button" type="submit">
                        ${isEditing ? "Save Fixture Changes" : "Create Draft Fixture"}
                    </button>

                    <button class="secondary-button"
                        type="button"
                        onclick="loadMatchAdminFixtures()">
                        Cancel
                    </button>

                </div>

            </form>

        </div>
    `;
}

async function editMatchFixture(fixtureId) {
    try {
        const result = await matchAdminCall("admin_fixtures", {
            action: "detail",
            fixture_id: Number(fixtureId)
        });

        const fixture = result.fixtures?.[0];
        if (!fixture) throw new Error("Fixture details could not be found.");

        if (!["draft", "open"].includes(String(fixture.status).toLowerCase())) {
            throw new Error("Only draft or open fixtures can be edited.");
        }

        showMatchFixtureForm(fixture);
    } catch (error) {
        await appAlert(error.message || "Unable to load fixture for editing.", "Edit unavailable", "danger");
    }
}

async function updateMatchFixtureFromForm(fixtureId) {
    const opposition = document.getElementById("matchOpposition").value.trim();
    const fixtureDate = document.getElementById("matchFixtureDate").value;
    const fixtureType = document.getElementById("matchFixtureType").value;
    const ageGroupIds = Array.from(
        document.querySelectorAll(".matchFixtureAgeGroup:checked")
    ).map(input => Number(input.value));

    if (!ageGroupIds.length) {
        await appAlert("Please select at least one age group.", "Age groups required", "warning");
        return;
    }

    const deadlineValue = document.getElementById("matchResponseDeadline").value;
    let deadline = null;

    if (deadlineValue) {
        const deadlineDate = new Date(deadlineValue);
        if (Number.isNaN(deadlineDate.getTime())) {
            await appAlert("Please enter a valid response deadline.", "Invalid deadline", "warning");
            return;
        }
        deadline = deadlineDate.toISOString();
    }

    try {
        await matchAdminCall("admin_fixtures", {
            action: "update",
            fixture_id: Number(fixtureId),
            opposition,
            fixture_date: fixtureDate,
            fixture_type: fixtureType,
            kick_off_time: document.getElementById("matchKickOff").value || null,
            venue: document.getElementById("matchVenue").value.trim(),
            venue_address: document.getElementById("matchVenueAddress").value.trim(),
            response_deadline: deadline,
            age_group_ids: ageGroupIds
        });

        await appAlert("Fixture details have been updated.", "Fixture updated", "success");
        await loadMatchAdminFixtures();
    } catch (error) {
        console.error("Fixture update failed:", error);
        await appAlert(error.message || "Unable to update fixture.", "Update failed", "danger");
    }
}

async function cancelMatchFixture(fixtureId) {
    const confirmed = await appConfirm(
        "Cancel this fixture?\n\nExisting parent responses will be retained, but parents will no longer be able to submit or update availability.",
        "Cancel fixture",
        "Cancel fixture"
    );

    if (!confirmed) return;

    try {
        await matchAdminCall("admin_fixtures", {
            action: "cancel",
            fixture_id: Number(fixtureId)
        });

        await appAlert("The fixture has been cancelled. Existing responses have been retained.", "Fixture cancelled", "success");
        await loadMatchAdminFixtures();
    } catch (error) {
        console.error("Fixture cancellation failed:", error);
        await appAlert(error.message || "Unable to cancel fixture.", "Cancellation failed", "danger");
    }
}

// =========================================================
// CREATE FIXTURE
// =========================================================

async function createMatchFixtureFromForm() {

    const hasAccess =
        (currentRole === "senior" && currentSeniorPIN) ||
        (currentRole === "coach" && currentAccessPIN);

    if (!hasAccess) {
        await appAlert(
            "You do not have permission to create fixtures.",
            "Access required",
            "danger"
        );
        return;
    }

    const opposition =
        document.getElementById("matchOpposition").value.trim();

    const fixtureDate =
        document.getElementById("matchFixtureDate").value;

    const fixtureType =
        document.getElementById("matchFixtureType").value;

    const ageGroupIds = Array.from(
        document.querySelectorAll(".matchFixtureAgeGroup:checked")
    ).map(input => Number(input.value));

    if (!ageGroupIds.length) {
        await appAlert(
            "Please select at least one age group.",
            "Age groups required",
            "warning"
        );
        return;
    }

    const deadlineValue =
        document.getElementById("matchResponseDeadline").value;

    let deadline = null;

    if (deadlineValue) {
        const deadlineDate = new Date(deadlineValue);

        if (Number.isNaN(deadlineDate.getTime())) {
            await appAlert(
                "Please enter a valid response deadline.",
                "Invalid deadline",
                "warning"
            );
            return;
        }

        deadline = deadlineDate.toISOString();
    }

    try {

        const result = await matchAdminCall(
            "create_fixture",
            {
                opposition,
                fixture_date: fixtureDate,
                fixture_type: fixtureType,
                age_group_ids: ageGroupIds,
                kick_off_time:
                    document.getElementById("matchKickOff").value || null,
                venue:
                    document.getElementById("matchVenue").value.trim(),
                venue_address:
                    document.getElementById("matchVenueAddress").value.trim(),
                response_deadline: deadline
            }
        );

        // Keep both sharing options: central home and direct fixture.
        latestCreatedFixtureLink = result.parent_token
            ? MATCH_AVAILABILITY_URL + "?fixture=" + encodeURIComponent(result.parent_token)
            : null;

        const container =
            document.getElementById("matchAdminFixtures");

        if (!container) return;

        container.innerHTML = `
            <div class="card">

                <h3>Fixture Created</h3>

                <p>
                    ${matchAdminEscape(opposition)}
                    has been saved as a draft.
                </p>

                <p>
                    This fixture is saved as a draft. Parents will see it on the central home page once it is published.
                </p>

                <button class="secondary-button"
                    onclick="publishMatchFixture(${Number(result.fixture_id)})">
                    Publish Fixture
                </button>

                <button class="secondary-button"
                    onclick="loadMatchAdminFixtures()">
                    Back to Fixtures
                </button>

            </div>
        `;

    } catch (error) {

        console.error("Fixture creation failed:", error);

        await appAlert(
            error.message || "Unable to create fixture.",
            "Fixture creation failed",
            "danger"
        );
    }
}
// =========================================================
// COPY PARENT LINK
// =========================================================

async function copyLatestCentralParentLink() {
    try {
        await navigator.clipboard.writeText(MATCH_AVAILABILITY_URL);
        await appAlert("The central parent home link has been copied.", "Link copied", "success");
    } catch (error) {
        console.error("Copy central link failed:", error);
        await appAlert("Unable to copy the link on this device.", "Copy failed", "danger");
    }
}

async function copyLatestMatchFixtureLink() {
    if (!latestCreatedFixtureLink) {
        await appAlert("The individual fixture link is not available.", "Link unavailable", "warning");
        return;
    }
    try {
        await navigator.clipboard.writeText(latestCreatedFixtureLink);
        await appAlert("The direct link for this fixture has been copied.", "Fixture link copied", "success");
    } catch (error) {
        console.error("Copy fixture link failed:", error);
        await appAlert("Unable to copy the link on this device.", "Copy failed", "danger");
    }
}

// =========================================================
// PUBLISH FIXTURE
// =========================================================

async function publishMatchFixture(fixtureId) {

    const hasAccess =
        (currentRole === "senior" && currentSeniorPIN) ||
        (currentRole === "coach" && currentAccessPIN);

    if (!hasAccess) {
        await appAlert(
            "You do not have permission to publish fixtures.",
            "Access required",
            "danger"
        );
        return;
    }

    const confirmed = await appConfirm(
        "Publish this fixture? Parents will be able to submit availability.",
        "Publish fixture"
    );

    if (!confirmed) return;

    try {

        await matchAdminCall(
            "publish_fixture",
            {
                fixture_id: Number(fixtureId)
            }
        );

        await appAlert(
            "The fixture has been published.",
            "Fixture published",
            "success"
        );

        await loadMatchAdminFixtures();

    } catch (error) {

        console.error("Fixture publishing failed:", error);

        await appAlert(
            error.message || "Unable to publish fixture.",
            "Publish failed",
            "danger"
        );
    }
}

/* =========================================================
   MATCH FIXTURE - VIEW RESPONSES
   ========================================================= */


async function viewMatchFixture(fixtureId, silentRefresh = false) {

    try {

        if (!silentRefresh && matchFixtureRefreshTimer) {
            clearInterval(matchFixtureRefreshTimer);
            matchFixtureRefreshTimer = null;
        }

        const previouslyOpen = new Set(
            Array.from(
                document.querySelectorAll(
                    "#matchFixtureDetailScreen details[data-age-group-id]"
                )
            )
            .filter(details => details.open)
            .map(details => details.dataset.ageGroupId)
        );

        const result = await matchAdminCall("admin_fixtures", {
            action: "detail",
            fixture_id: Number(fixtureId)
        });

        const fixture = result.fixtures?.[0];

        if (!fixture) {
            throw new Error("Fixture details could not be found.");
        }

        const submissions = fixture.submissions || [];
        const allAgeGroups = fixture.age_groups || [];

        // Coaches only see their selected age groups.
        // Seniors continue to see every age group.
        const ageGroups =
            currentRole === "coach"
            ? allAgeGroups.filter(group =>
                selectedAgeGroups.includes(
                    group.display_name || group.age_group
                )
            )
            : allAgeGroups;

        // Count responses and children only within the visible groups.
        const visibleAgeGroupIDs = new Set(
            ageGroups.map(group => Number(group.age_group_id))
        );

        const visibleSubmissions = submissions.filter(submission =>
            (submission.children || []).some(child =>
                visibleAgeGroupIDs.has(Number(child.age_group_id))
            )
        );

        const visibleChildren = ageGroups.reduce(
            (total, group) =>
                total + submissions.reduce(
                    (groupTotal, submission) =>
                        groupTotal +
                        (submission.children || []).filter(child =>
                            Number(child.age_group_id) ===
                            Number(group.age_group_id)
                        ).length,
                    0
                ),
            0
        );

        const totalAvailable = ageGroups.reduce(
            (sum, group) => sum + Number(group.available || 0), 0
        );

        const totalUnavailable = ageGroups.reduce(
            (sum, group) => sum + Number(group.unavailable || 0), 0
        );

        const totalUnsure = ageGroups.reduce(
            (sum, group) => sum + Number(group.unsure || 0), 0
        );

        const statusLabel = status =>
            status === "available" ? "Available" :
            status === "unavailable" ? "Unavailable" :
            status === "unsure" ? "Unsure" : "Unknown";

        const statusClass = status =>
            status === "available" ? "user-status-active" :
            status === "unavailable" ? "user-status-inactive" :
            "user-status";

        let html = `
            <div class="card" id="matchFixtureDetailScreen">

                <button class="back-button"
                    onclick="returnToMatchAdminFixtures()">
                    ← Back to Fixtures
                </button>

                <h2>${matchAdminEscape(fixture.opposition)}</h2>

                <div class="subtitle">
                    ${matchAdminEscape(matchAdminDate(fixture.fixture_date))}
                    · ${matchAdminEscape(
                        fixture.fixture_type === "home" ? "Home" : "Away"
                    )}
                </div>

                <div class="info-box">
                    <strong>Parent Availability Link</strong>

                    <p>
                        Share the direct link for this fixture with parents.
                    </p>

                    <div class="user-management-actions">
                        <button class="primary-button"
                            onclick="copyMatchFixtureLink(${Number(fixture.id)}, '${matchAdminEscape(fixture.parent_token || "")}')"
                            ${fixture.parent_token ? "" : "disabled"}>
                            Copy Individual Fixture Link
                        </button>
                    </div>
                </div>

                <div class="info-box">
                    <strong>Fixture Summary</strong>

                    <p>
                        ${visibleSubmissions.length}
                        parent responses ·
                        ${visibleChildren}
                        children registered
                    </p>

                    <div class="user-management-actions">

                        <span class="user-status user-status-active">
                            ${totalAvailable} Available
                        </span>

                        <span class="user-status user-status-inactive">
                            ${totalUnavailable} Unavailable
                        </span>

                        <span class="user-status">
                            ${totalUnsure} Unsure
                        </span>

                    </div>

                    ${
                        Number(fixture.duplicate_review_count || 0) > 0 &&
                        currentRole === "senior"
                        ? `
                            <p>
                                <span class="user-status user-status-inactive">
                                    ${Number(fixture.duplicate_review_count)}
                                    Potential duplicates to review
                                </span>
                            </p>
                        `
                        : ""
                    }

                    <small>
                        Responses refresh automatically every 15 seconds.
                    </small>
                </div>

                <h3>Age Group Responses</h3>
        `;

        if (!ageGroups.length) {
            html += `
                <p>
                    No responses found for your selected age groups.
                </p>
            `;
        }

        ageGroups.forEach((group, index) => {

            const groupID = String(group.age_group_id);

            const children = submissions.flatMap(submission =>
                (submission.children || [])
                    .filter(child =>
                        Number(child.age_group_id) ===
                        Number(group.age_group_id)
                    )
                    .map(child => ({
                        ...child,
                        parent_name: submission.parent_name
                    }))
            );

            const isOpen = silentRefresh
                ? previouslyOpen.has(groupID)
                : index === 0;

            html += `
                <details class="info-box"
                    data-age-group-id="${matchAdminEscape(groupID)}"
                    ${isOpen ? "open" : ""}>

                    <summary style="cursor:pointer;font-weight:bold;">
                        ${matchAdminEscape(
                            group.display_name || group.age_group
                        )}

                        (${children.length})
                    </summary>

                    <div class="user-management-actions"
                        style="margin:12px 0;">

                        <span class="user-status user-status-active">
                            ${group.available} Available
                        </span>

                        <span class="user-status user-status-inactive">
                            ${group.unavailable} Unavailable
                        </span>

                        <span class="user-status">
                            ${group.unsure} Unsure
                        </span>

                    </div>

                    ${
                        children.length
                        ? children.map(child => {

                            const duplicate =
                                child.duplicate_review_status === "pending";

                            const childID = Number(child.id);

                            return `
                                <div style="
                                    padding:12px 0;
                                    border-top:1px solid var(--border-color, #ddd);
                                ">

                                    <div style="
                                        display:flex;
                                        justify-content:space-between;
                                        align-items:center;
                                        gap:10px;
                                        flex-wrap:wrap;
                                    ">

                                        <strong>
                                            ${matchAdminEscape(child.child_name)}
                                        </strong>

                                        <span class="user-status ${
                                            statusClass(child.availability)
                                        }">
                                            ${statusLabel(child.availability)}
                                        </span>

                                    </div>

                                    <small>
                                        Parent:
                                        ${matchAdminEscape(child.parent_name || "Not provided")}
                                        ${
                                            child.school_year
                                            ? " · School Year " +
                                                matchAdminEscape(child.school_year)
                                            : ""
                                        }
                                    </small>

                                    <div style="margin-top:10px;">

                                        <label for="matchAvailability-${childID}">
                                            Change availability
                                        </label>

                                        <select
                                            id="matchAvailability-${childID}"
                                            style="width:100%;padding:10px;margin-top:5px;"
                                            onchange="updateMatchChildAvailability(
                                                ${childID},
                                                this.value,
                                                ${Number(fixture.id)}
                                            )">

                                            <option value="available"
                                                ${child.availability === "available" ? "selected" : ""}>
                                                Available
                                            </option>

                                            <option value="unavailable"
                                                ${child.availability === "unavailable" ? "selected" : ""}>
                                                Unavailable
                                            </option>

                                            <option value="unsure"
                                                ${child.availability === "unsure" ? "selected" : ""}>
                                                Unsure
                                            </option>

                                        </select>

                                    </div>

                                    ${
                                        duplicate
                                        ? `
                                            <div style="margin-top:10px;">

                                                <span class="user-status user-status-inactive">
                                                    Potential duplicate - review
                                                </span>

                                                <br><br>

                                                <button
                                                    class="user-action-button user-action-danger"
                                                    onclick="deleteMatchDuplicate(
                                                        ${childID},
                                                        ${Number(fixture.id)}
                                                    )">

                                                    Delete Duplicate

                                                </button>

                                            </div>
                                        `
                                        : ""
                                    }

                                </div>
                            `;

                        }).join("")
                        : "<p>No responses yet.</p>"
                    }

                </details>
            `;

        });

        html += `</div>`;

        renderShell(html);

        if (!silentRefresh) {

            matchFixtureRefreshTimer = setInterval(() => {

                if (!document.getElementById("matchFixtureDetailScreen")) {
                    clearInterval(matchFixtureRefreshTimer);
                    matchFixtureRefreshTimer = null;
                    return;
                }

                viewMatchFixture(fixtureId, true);

            }, 15000);
        }

    } catch (error) {

        console.error("Unable to load fixture responses:", error);

        if (!silentRefresh) {
            await appAlert(
                error.message || "Unable to load responses.",
                "Unable to load responses",
                "danger"
            );
        }
    }
}

// =========================================================
// UPDATE CHILD AVAILABILITY
// =========================================================

async function updateMatchChildAvailability(
    childId,
    availability,
    fixtureId
) {

    const select = document.getElementById(
        `matchAvailability-${childId}`
    );

    if (select) select.disabled = true;

    try {

        await matchAdminCall("manage_match_child", {
            action: "update_availability",
            child_id: Number(childId),
            availability: availability
        });

        await viewMatchFixture(fixtureId, false);

    } catch (error) {

        console.error("Availability update failed:", error);

        await appAlert(
            error.message || "Unable to update availability.",
            "Update failed",
            "danger"
        );

        await viewMatchFixture(fixtureId, false);
    }
}


// =========================================================
// DELETE POTENTIAL DUPLICATE
// =========================================================

async function deleteMatchDuplicate(childId, fixtureId) {

    const confirmed = await appConfirm(
        "Are you sure you want to delete this child entry?\n\n" +
        "This will permanently remove this individual entry. " +
        "The parent's other children and submission will remain.",
        "Delete duplicate?",
        "Delete duplicate"
    );

    if (!confirmed) return;

    try {

        await matchAdminCall("manage_match_child", {
            action: "delete_duplicate",
            child_id: Number(childId)
        });

        await appAlert(
            "The duplicate child entry has been deleted.",
            "Duplicate deleted",
            "success"
        );

        await viewMatchFixture(fixtureId, false);

    } catch (error) {

        console.error("Duplicate deletion failed:", error);

        await appAlert(
            error.message || "Unable to delete duplicate.",
            "Deletion failed",
            "danger"
        );
    }
}

// =========================================================
// BACK TO ADMIN FIXTURES
// =========================================================

async function returnToMatchAdminFixtures() {

    if (matchFixtureRefreshTimer) {
        clearInterval(matchFixtureRefreshTimer);
        matchFixtureRefreshTimer = null;
    }

    await showMatchAvailabilityAdmin();
}


// =========================================================
// COPY PARENT FIXTURE LINK
// =========================================================


async function copyCentralMatchParentLink() {
    try {
        await navigator.clipboard.writeText(MATCH_AVAILABILITY_URL);
        await appAlert("The central parent home link has been copied.", "Link copied", "success");
    } catch (error) {
        console.error("Unable to copy central parent link:", error);
        await appAlert("Unable to copy parent home link.", "Copy failed", "danger");
    }
}

async function copyMatchFixtureLink(fixtureId, parentToken) {
    if (!parentToken) {
        await appAlert("The individual fixture link is unavailable for this fixture.", "Link unavailable", "warning");
        return;
    }
    const fixtureLink = MATCH_AVAILABILITY_URL + "?fixture=" + encodeURIComponent(parentToken);
    try {
        await navigator.clipboard.writeText(fixtureLink);
        await appAlert("The direct parent link for this fixture has been copied.", "Fixture link copied", "success");
    } catch (error) {
        console.error("Unable to copy individual fixture link:", error);
        await appAlert("Unable to copy fixture link.", "Copy failed", "danger");
    }
}
