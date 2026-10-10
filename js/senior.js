/* =========================================================
   SENIOR / ADMIN
   ========================================================= */



/* =========================================================
   ANONYMISE ARCHIVED PLAYER
   ========================================================= */

async function permanentlyRemovePlayer(playerID) {

    const diag = window.clubCheckInDiagnostics;

    diag?.section("ANONYMISE PLAYER");
    diag?.log("Started. Player ID:", playerID);

    if (currentRole !== "senior") {

        diag?.error(
            "Permission check failed. Current role:",
            currentRole
        );

        alert("Only Senior users can anonymise players.");
        return;
    }

    const player = findPlayerByID(playerID);

    if (!player) {

        diag?.error(
            "Player not found locally:",
            playerID
        );

        alert("Player could not be found.");
        return;
    }

    if (!player.archived) {

        diag?.error(
            "Player is not archived:",
            playerID
        );

        alert("Only archived players can be anonymised.");
        return;
    }

    diag?.log(
        "Player found:",
        player.name,
        "Archived:",
        player.archived
    );

    if (!confirm(
        "ANONYMISE " + player.name + "?\n\n" +
        "Their name will be replaced with an anonymous ID.\n" +
        "Their player ID and historical attendance will be retained.\n\n" +
        "This cannot be undone."
    )) {

        diag?.log("Cancelled by user.");
        return;
    }

    try {

        /* STEP 1 — READ EXISTING ANONYMOUS NAMES */

        diag?.log(
            "Step 1: Reading anonymous names from Supabase."
        );

        const {
            data: anonymousPlayers,
            error: readError
        } = await supabaseClient
            .from("players")
            .select("name")
            .like("name", "Anonymous-%");

        if (readError) {

            diag?.error(
                "Step 1 failed: Supabase read.",
                readError
            );

            throw readError;
        }

        let highestNumber = 0;

        (anonymousPlayers || []).forEach(item => {

            const match =
                /^Anonymous-(\d+)$/.exec(item.name);

            if (match) {

                highestNumber = Math.max(
                    highestNumber,
                    Number(match[1])
                );

            }

        });

        const anonymousName =
            "Anonymous-" +
            String(highestNumber + 1).padStart(3, "0");

        diag?.log(
            "Step 1 complete. Existing anonymous records:",
            anonymousPlayers?.length,
            "New name:",
            anonymousName
        );


        /* STEP 2 — UPDATE SUPABASE */

        diag?.log(
            "Step 2: Updating Supabase player record."
        );

        const {
            data: updatedPlayer,
            error: updateError
        } = await supabaseClient
            .from("players")
            .update({
                name: anonymousName,
                gms: false,
                coach_gms_suggestion: false,
                active: false,
                archived: true,
                last_attendance_date: null
            })
            .eq("player_id", playerID)
            .eq("archived", true)
            .select("player_id, name, active, archived");

        if (updateError) {

            diag?.error(
                "Step 2 failed: Supabase update.",
                updateError
            );

            throw updateError;
        }

        diag?.log(
            "Step 2 response:",
            updatedPlayer
        );

        if (
            !Array.isArray(updatedPlayer) ||
            updatedPlayer.length !== 1
        ) {

            throw new Error(
                "Supabase did not confirm exactly one updated player. " +
                "Check the player ID, archived status and database permissions."
            );

        }

        const confirmedPlayer = updatedPlayer[0];

        if (
            confirmedPlayer.player_id !== playerID ||
            confirmedPlayer.name !== anonymousName ||
            confirmedPlayer.active !== false ||
            confirmedPlayer.archived !== true
        ) {

            throw new Error(
                "The returned player record did not match the expected anonymised values."
            );

        }

        diag?.log(
            "Step 2 complete. Supabase confirmed:",
            anonymousName
        );


        /* STEP 3 — UPDATE LOCAL DATA */

        diag?.log(
            "Step 3: Removing identifiable local player data."
        );

        ageGroups.forEach(ageGroup => {

            if (!players[ageGroup]) {
                return;
            }

            players[ageGroup] =
                players[ageGroup].filter(
                    item => item.id !== playerID
                );

        });

        saveData();

        diag?.log(
            "SUCCESS: Player anonymised as",
            anonymousName,
            "Player ID and historical attendance retained."
        );

        alert(
            "Player anonymised successfully as " +
            anonymousName + "."
        );

        showArchiveList();

    } catch (error) {

        diag?.error(
            "ANONYMISATION FAILED:",
            error
        );

        alert(
            "Anonymisation failed. Check the on-screen " +
            "diagnostics for the exact error."
        );

    }

}

/* =========================================================
USER MANAGEMENT
========================================================= */




async function showUserManagement() {

    /* LOAD USERS */

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

        console.error(
            "User management load failed:",
            error
        );

        if (window.clubCheckInDiagnostics) {
            window.clubCheckInDiagnostics.error(
                "User management load failed",
                error
            );
        }

        renderShell(`
            <div class="card">

                <button
                    class="back-button"
                    onclick="showSeniorDashboard()">
                    ← Senior Dashboard
                </button>

                <h2>User Management</h2>

                <div class="info-box">
                    Unable to load users.
                </div>

            </div>
        `);

        return;
    }


    /* LOAD REGISTERED INSTALLATIONS */

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

                <button
                    class="back-button"
                    onclick="showSeniorDashboard()">
                    ← Senior Dashboard
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


    /* BUILD INSTALLATION SUMMARY */

    const installationSummary = {};

    installations.forEach(installation => {

        installationSummary[installation.person_id] = {
            activeCount: Number(
                installation.active_installations || 0
            ),
            lastSeen: installation.last_seen_at || null
        };

    });


    /* FORMAT LAST-SEEN DATE */

    function formatDeviceLastSeen(value) {

        if (!value) {
            return "Not available";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return "Not available";
        }

        return date.toLocaleString("en-GB", {
            dateStyle: "medium",
            timeStyle: "short"
        });
    }


    /* DISPLAY USER MANAGEMENT */

    renderShell(`
        <div class="card">

            <button
                class="back-button"
                onclick="showSeniorDashboard()">
                ← Senior Dashboard
            </button>

            <h2>User Management</h2>

            <button
                class="primary-button"
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

                                <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">

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

                                <button
                                    type="button"
                                    class="user-action-button ${
                                        user.active
                                        ? "user-action-danger"
                                        : "user-action-primary"
                                    } user-active-button"
                                    data-user-index="${index}">
                                    ${user.active ? "Deactivate" : "Activate"}
                                </button>

                                <button
                                    type="button"
                                    class="user-action-button user-action-neutral reset-installation-button"
                                    data-user-index="${index}">
                                    Reset Installation
                                </button>

                                <button
                                    type="button"
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


    /* ACTIVATE / DEACTIVATE */

    document
        .querySelectorAll(".user-active-button")
        .forEach(button => {

            button.addEventListener("click", async () => {

                const selectedUser =
                    users[Number(button.dataset.userIndex)];

                if (!selectedUser) {

                    alert("User could not be found.");

                    return;
                }

                await setUserActive(
                    selectedUser.person_id,
                    !selectedUser.active
                );

            });

        });


    /* RESET INSTALLATION */

    document
        .querySelectorAll(".reset-installation-button")
        .forEach(button => {

            button.addEventListener("click", async () => {

                const selectedUser =
                    users[Number(button.dataset.userIndex)];

                if (!selectedUser) {

                    alert("User could not be found.");

                    return;
                }

                await resetUserInstallation(
                    selectedUser.person_id
                );

            });

        });


    /* CHANGE NAME */

    document
        .querySelectorAll(".change-user-name-button")
        .forEach(button => {

            button.addEventListener("click", () => {

                const selectedUser =
                    users[Number(button.dataset.userIndex)];

                if (!selectedUser) {

                    alert("User could not be found.");

                    return;
                }

                showChangeUserName(
                    selectedUser.person_id
                );

            });

        });

}

/* =========================================================
   ADD COACH
   ========================================================= */

function showAddCoach() {

    renderShell(`

        <div class="card">

            <button
                class="back-button"
                onclick="showUserManagement()">

                ← User Management

            </button>

            <h2>Add Coach</h2>

            <input
                type="text"
                id="newCoachName"
                placeholder="Coach Name"
                maxlength="100"
                autocomplete="off"
            >

            <button
                class="menu-button blue"
                onclick="addCoach()">

                Add Coach

            </button>

            <div
                id="addCoachMessage"
                class="info-box">
            </div>

        </div>

    `);
}


async function addCoach() {

    const input =
        document.getElementById("newCoachName");

    const message =
        document.getElementById("addCoachMessage");

    if (!input || !message) {
        return;
    }

    const name = input.value.trim();

    if (!name) {

        message.textContent =
            "Please enter the coach's name.";

        return;
    }

    if (name.length > 100) {

        message.textContent =
            "The name cannot exceed 100 characters.";

        return;
    }

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "add_manageable_user",
        {
            current_senior_code:
                currentSeniorPIN,

            requested_name:
                name
        }
    );

    if (error) {

        console.error(
            "Add coach failed:",
            error
        );

        message.textContent =
            "Unable to add coach. Please try again.";

        return;
    }

    if (!data) {

        message.textContent =
            "A user with that name may already exist. Check the name and try again.";

        return;
    }

    await showUserManagement();
}


/* =========================================================
   CHANGE USER NAME
   ========================================================= */

async function showChangeUserName(personID) {

    const {
        data: users,
        error
    } = await supabaseClient.rpc(
        "get_manageable_users",
        {
            current_senior_code:
                currentSeniorPIN
        }
    );

    if (error || !Array.isArray(users)) {

        console.error(
            "Unable to load user for renaming:",
            error
        );

        alert(
            "Unable to load the user's details."
        );

        return;
    }

    const user =
        users.find(
            item => item.person_id === personID
        );

    if (!user) {

        alert(
            "User could not be found."
        );

        return;
    }

    renderShell(`

        <div class="card">

            <button
                class="back-button"
                onclick="showUserManagement()">

                ← User Management

            </button>

            <h2>Change Name</h2>

            <label for="updatedUserName">
                User name
            </label>

            <input
                type="text"
                id="updatedUserName"
                maxlength="100"
                autocomplete="off"
                placeholder="Enter user name"
            >

            <button
                class="menu-button blue"
                onclick="saveUserName(
                    '${personID}'
                )">

                Save Name

            </button>

            <div
                id="changeUserNameMessage"
                class="info-box">
            </div>

        </div>

    `);

    const nameInput =
        document.getElementById("updatedUserName");

    if (nameInput) {

        nameInput.value = user.name;

        nameInput.focus();

        nameInput.select();
    }
}


async function saveUserName(personID) {

    const input =
        document.getElementById("updatedUserName");

    const message =
        document.getElementById("changeUserNameMessage");

    if (!input || !message) {
        return;
    }

    const name = input.value.trim();

    if (!name) {

        message.textContent =
            "Please enter a name.";

        return;
    }

    if (name.length > 100) {

        message.textContent =
            "The name cannot exceed 100 characters.";

        return;
    }

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "rename_manageable_user",
        {
            current_senior_code:
                currentSeniorPIN,

            requested_person_id:
                personID,

            requested_name:
                name
        }
    );

    if (error) {

        console.error(
            "Rename user failed:",
            error
        );

        message.textContent =
            "Unable to change the name. Please try again.";

        return;
    }

    if (!data) {

        message.textContent =
            "A user with that name may already exist, or the name could not be changed.";

        return;
    }

    await showUserManagement();
}


/* =========================================================
   ACTIVATE / DEACTIVATE USER
   ========================================================= */

async function setUserActive(personID, active) {

    const action =
        active ? "activate" : "deactivate";

    if (
        !confirm(
            `Are you sure you want to ${action} this user?`
        )
    ) {
        return;
    }

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "set_manageable_user_active",
        {
            current_senior_code:
                currentSeniorPIN,

            requested_person_id:
                personID,

            requested_active:
                active
        }
    );

    if (error) {

        console.error(
            "User status update failed:",
            error
        );

        alert(
            "Unable to update user status."
        );

        return;
    }

    if (!data) {

        alert(
            "User status could not be changed."
        );

        return;
    }

    await showUserManagement();
}


/* =========================================================
   RESET USER INSTALLATION
   ========================================================= */

async function resetUserInstallation(personID) {

    if (
        !confirm(
            "Reset this user's installation? Their current device registration will be revoked, and they will need to activate the replacement device."
        )
    ) {
        return;
    }

    const {
        data,
        error
    } = await supabaseClient.rpc(
        "reset_installation",
        {
            current_senior_code:
                currentSeniorPIN,

            requested_person_id:
                personID
        }
    );

    if (error) {

        console.error(
            "Installation reset failed:",
            error
        );

        alert(
            "Unable to reset installation."
        );

        return;
    }

    if (!data) {

        alert(
            "Installation could not be reset."
        );

        return;
    }

    alert(
        "Installation reset successfully."
    );

    await showUserManagement();
}