/* =========================================================
   SENIOR / ADMIN
   ========================================================= */
function permanentlyRemovePlayer(playerID) {

    // Senior only
    if (currentRole !== "senior") {

        alert(
            "Only Senior users can permanently remove players."
        );

        return;

    }

    const player =
        findPlayerByID(
            playerID
        );

    if (!player) {

        alert(
            "Player could not be found."
        );

        return;

    }

    // Player must already be archived
    if (!player.archived) {

        alert(
            "Only archived players can be permanently removed."
        );

        return;

    }

    const confirmed =
        confirm(
            "PERMANENTLY REMOVE "
            + player.name
            + "?\n\n"
            + "This will remove their player record "
            + "from Club Check-In.\n\n"
            + "This cannot be undone.\n\n"
            + "Historical attendance will be retained."
        );

    if (!confirmed) {

        return;

    }

    /*
        Remove the player from every age-group array.
        Historical daily registers are deliberately
        left untouched.
    */

    ageGroups.forEach(
        ageGroup => {

            if (!players[ageGroup]) {
                return;
            }

            players[ageGroup] =
                players[ageGroup].filter(
                    item =>
                        item.id !== player.id
                );

        }
    );

    saveData();

showArchiveList();

}

/* =========================================================
   USER MANAGEMENT
   ========================================================= */

async function showUserManagement() {

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

    if (error) {

        console.error(
            "User management load failed:",
            error
        );

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

                : users.map(user => `

                    <div class="info-box user-management-card">

                        <div class="user-management-header">

                            <strong>
                                ${user.name}
                            </strong>

                            <br>

                            <span class="user-status ${
                                user.active
                                ? "user-status-active"
                                : "user-status-inactive"
                            }">

                                ${
                                    user.active
                                    ? "Active"
                                    : "Inactive"
                                }

                            </span>

                        </div>

                        <div class="user-management-actions">

                            <button
                                class="user-action-button ${
                                    user.active
                                    ? "user-action-danger"
                                    : "user-action-primary"
                                }"
                                onclick="setUserActive(
                                    '${user.person_id}',
                                    ${!user.active}
                                )">

                                ${
                                    user.active
                                    ? "Deactivate"
                                    : "Activate"
                                }

                            </button>

                            <button
                                class="user-action-button user-action-neutral"
                                onclick="resetUserInstallation(
                                    '${user.person_id}'
                                )">

                                Reset Installation

                            </button>

                            <button
                                class="user-action-button user-action-neutral"
                                onclick="showChangeUserName(
                                    '${user.person_id}'
                                )">

                                Change Name

                            </button>

                        </div>

                    </div>

                `).join("")

            }

        </div>

    `);

}


function showAddCoach() {

    renderShell(`

        <div class="card">

            <button
                class="back-button"
                onclick="showUserManagement()">

                ← User Management

            </button>

            <h2>
                Add Coach
            </h2>

            <input
                type="text"
                id="newCoachName"
                placeholder="Coach Name"
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

    const name =
        document.getElementById(
            "newCoachName"
        ).value.trim();

    const message =
        document.getElementById(
            "addCoachMessage"
        );

    if (!name) {

        message.textContent =
            "Please enter the coach's name.";

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
        "Unable to add coach: " +
        error.message;

    return;
}

    if (!data) {

        message.textContent =
            "Unable to add coach. Check the details and try again.";

        return;
    }

    await showUserManagement();

}

async function setUserActive(
    personID,
    active
) {

    const action =
        active
        ? "activate"
        : "deactivate";

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

async function resetUserInstallation(
    personID
) {

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
