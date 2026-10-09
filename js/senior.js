/* =========================================================
   SENIOR / ADMIN
   ========================================================= */


/* =========================================================
   PERMANENTLY REMOVE ARCHIVED PLAYER
   ========================================================= */

function permanentlyRemovePlayer(playerID) {

    if (currentRole !== "senior") {

        alert(
            "Only Senior users can permanently remove players."
        );

        return;
    }

    const player =
        findPlayerByID(playerID);

    if (!player) {

        alert(
            "Player could not be found."
        );

        return;
    }

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

    ageGroups.forEach(ageGroup => {

        if (!players[ageGroup]) {
            return;
        }

        players[ageGroup] =
            players[ageGroup].filter(
                item => item.id !== player.id
            );

    });

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

    if (error || !Array.isArray(users)) {

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
                : users.map((user, index) => `

                    <div class="info-box user-management-card">

                        <div class="user-management-header">

                            <strong>${escapeHTML(user.name)}</strong>

                            <br>

                            <span class="user-status ${
                                user.active
                                ? "user-status-active"
                                : "user-status-inactive"
                            }">
                                ${user.active ? "Active" : "Inactive"}
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
                                    ${JSON.stringify(user.person_id)},
                                    ${!user.active}
                                )">
                                ${user.active ? "Deactivate" : "Activate"}
                            </button>

                            <button
                                class="user-action-button user-action-neutral"
                                onclick="resetUserInstallation(
                                    ${JSON.stringify(user.person_id)}
                                )">
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

                `).join("")
            }

        </div>
    `);

    document
        .querySelectorAll(".change-user-name-button")
        .forEach(button => {

            button.addEventListener("click", () => {

                const index =
                    Number(button.dataset.userIndex);

                const selectedUser = users[index];

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