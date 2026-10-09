/* =========================================================
   PLAYERS
   ========================================================= */


/* =========================================================
   ADD PLAYER
   ========================================================= */

async function addPlayerToAgeGroup(
    ageGroup,
    name,
    gms
) {

    const playerID =
        crypto.randomUUID();

    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .insert({
                player_id: playerID,
                name: name,
                age_group: ageGroup,
                gms: gms,
                coach_gms_suggestion: false,
                active: true,
                archived: false,
                last_attendance_date: null
            })
            .select()
            .single();

    if (error) {

        console.error(
            "Supabase player creation failed:",
            error
        );

        alert(
            "Unable to add the player. Please try again."
        );

        return null;
    }

    const newPlayer = {

        id:
            data.player_id,

        name:
            data.name,

        ageGroup:
            data.age_group,

        gms:
            data.gms,

        coachGmsSuggestion:
            data.coach_gms_suggestion,

        active:
            data.active,

        archived:
            data.archived,

        lastAttendanceDate:
            data.last_attendance_date
    };

    if (!players[data.age_group]) {

        players[data.age_group] = [];
    }

    players[data.age_group].push(
        newPlayer
    );

    saveData();

    return newPlayer;
}


/* =========================================================
   SENIOR GMS
   ========================================================= */

async function setGMS(
    playerID,
    confirmed
) {

    const player =
        findPlayerByID(
            playerID
        );

    if (!player) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .update({
                gms: confirmed,

                coach_gms_suggestion:
                    confirmed
                        ? false
                        : player.coachGmsSuggestion
            })
            .eq(
                "player_id",
                playerID
            )
            .select()
            .single();

    if (error) {

        console.error(
            "Supabase GMS update failed:",
            error
        );

        alert(
            "Unable to update GMS. Please try again."
        );

        return;
    }

    player.gms =
        data.gms;

    player.coachGmsSuggestion =
        data.coach_gms_suggestion;

    saveData();

    showPlayerManagement(
        player.ageGroup
    );
}


/* =========================================================
   COACH GMS SUGGESTION
   ========================================================= */


async function setCoachGMSSuggestion(
    playerID,
    suggested
) {

    const player = findPlayerByID(playerID);

    if (!player) {
        console.error(
            "Coach GMS suggestion failed: player not found",
            playerID
        );
        return;
    }

    try {

        const { data, error } = await supabaseClient
            .from("players")
            .update({
                coach_gms_suggestion: suggested
            })
            .eq("player_id", playerID)
            .select("player_id, coach_gms_suggestion")
            .single();

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error("No updated player was returned.");
        }

        player.coachGmsSuggestion =
            data.coach_gms_suggestion;

        saveData();

        showRoster();

    } catch (error) {

        console.error(
            "Supabase coach GMS suggestion update failed:",
            error
        );

        alert(
            "Unable to save the GMS suggestion. Please try again."
        );

        // Restore the roster to its current in-memory state.
        showRoster();
    }
}


/* =========================================================
   ARCHIVE PLAYER
   ========================================================= */

async function archivePlayer(
    playerID,
    returnTo
) {

    const player =
        findPlayerByID(
            playerID
        );

    if (!player) {
        return;
    }

    const confirmed =
        confirm(
            "Archive "
            + player.name
            + "?\n\n"
            + "Their historical attendance will be retained.\n"
            + "They will disappear from active registers."
        );

    if (!confirmed) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .update({
                active: false,
                archived: true,
                coach_gms_suggestion: false
            })
            .eq(
                "player_id",
                playerID
            )
            .select()
            .single();

    if (error) {

        console.error(
            "Supabase player archive failed:",
            error
        );

        alert(
            "Unable to archive the player. Please try again."
        );

        return;
    }

    player.active =
        data.active;

    player.archived =
        data.archived;

    player.coachGmsSuggestion =
        data.coach_gms_suggestion;

    saveData();

    if (
        returnTo ===
        "playerManagement"
    ) {

        showPlayerManagement(
            player.ageGroup
        );

    } else {

        showArchiveReview();
    }
}


/* =========================================================
   COACH RESTORE PLAYER
   ========================================================= */

async function restoreArchivedPlayer(
    playerID,
    fromRoster = false,
    rosterAgeGroup = null
) {

    const player =
        findPlayerByID(
            playerID
        );

    if (!player) {
        return;
    }

    const groups =
        rosterAgeGroup
        ? [rosterAgeGroup]
        : (
            selectedAgeGroups.length
            ? selectedAgeGroups
            : [currentAgeGroup]
        );

    if (!groups.length) {

        alert(
            "Please select an age group first."
        );

        return;
    }

    let targetAgeGroup =
        groups[0];

    if (groups.length > 1) {

        const select =
            document.getElementById(
                "targetAgeGroup"
            );

        if (!select || !select.value) {

            alert(
                "Please select the age group to restore the player to."
            );

            return;
        }

        targetAgeGroup =
            select.value;
    }

    let register = null;

    if (!fromRoster) {

        register =
            getTodayRegister(
                targetAgeGroup
            );

        if (
            !register ||
            register.submitted
        ) {

            alert(
                "Today's register is not open for "
                + targetAgeGroup
                + "."
            );

            return;
        }
    }

    const confirmed =
        confirm(
            "Restore "
            + player.name
            + " to "
            + targetAgeGroup
            + "?\n\n"
            + "Their historical attendance will be retained.\n"
            + (
                fromRoster
                ? "They will be added to the roster but NOT marked as present today.\n"
                : "They will be marked as PRESENT today.\n"
            )
            + "GMS will be reset and require Senior confirmation."
        );

    if (!confirmed) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .update({
                age_group: targetAgeGroup,
                active: true,
                archived: false,
                gms: false,
                coach_gms_suggestion: false
            })
            .eq(
                "player_id",
                playerID
            )
            .select()
            .single();

    if (error) {

        console.error(
            "Supabase player restore failed:",
            error
        );

        alert(
            "Unable to restore the player. Please try again."
        );

        return;
    }

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

    player.ageGroup =
        data.age_group;

    player.active =
        data.active;

    player.archived =
        data.archived;

    player.gms =
        data.gms;

    player.coachGmsSuggestion =
        data.coach_gms_suggestion;

    if (!players[targetAgeGroup]) {

        players[targetAgeGroup] = [];
    }

    players[targetAgeGroup].push(
        player
    );

    if (!fromRoster) {

        register.attendance[
            player.id
        ] = true;

        player.lastAttendanceDate =
            getTodayKey();
    }

    saveData();

    if (fromRoster) {

        showRoster();

    } else {

        showRegister();
    }
}


/* =========================================================
   SENIOR RESTORE PLAYER
   ========================================================= */

async function seniorRestorePlayer(
    playerID
) {

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

    const select =
        document.getElementById(
            "seniorRestoreAgeGroup"
        );

    if (!select || !select.value) {

        alert(
            "Please select an age group."
        );

        return;
    }

    const targetAgeGroup =
        select.value;

    const confirmed =
        confirm(
            "Restore "
            + player.name
            + " to "
            + targetAgeGroup
            + "?\n\n"
            + "Their Player ID and historical attendance "
            + "will be retained.\n\n"
            + "They will NOT be marked as attending today."
        );

    if (!confirmed) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .update({
                age_group: targetAgeGroup,
                active: true,
                archived: false,
                gms: false,
                coach_gms_suggestion: false
            })
            .eq(
                "player_id",
                playerID
            )
            .select()
            .single();

    if (error) {

        console.error(
            "Supabase senior player restore failed:",
            error
        );

        alert(
            "Unable to restore the player. Please try again."
        );

        return;
    }

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

    player.ageGroup =
        data.age_group;

    player.active =
        data.active;

    player.archived =
        data.archived;

    player.gms =
        data.gms;

    player.coachGmsSuggestion =
        data.coach_gms_suggestion;

    if (!players[targetAgeGroup]) {

        players[targetAgeGroup] = [];
    }

    players[targetAgeGroup].push(
        player
    );

    saveData();

    showPlayerManagement(
        targetAgeGroup
    );
}


/* =========================================================
   MOVE PLAYER
   ========================================================= */

async function movePlayer(
    playerID
) {

    const player =
        findPlayerByID(
            playerID
        );

    if (!player) {
        return;
    }

    const select =
        document.getElementById(
            "moveTargetAgeGroup"
        );

    if (!select || !select.value) {
        return;
    }

    const targetAgeGroup =
        select.value;

    if (
        targetAgeGroup ===
        player.ageGroup
    ) {
        return;
    }

    const confirmed =
        confirm(
            "Move "
            + player.name
            + " from "
            + player.ageGroup
            + " to "
            + targetAgeGroup
            + "?\n\n"
            + "Their Player ID and attendance history "
            + "will be retained."
        );

    if (!confirmed) {
        return;
    }

    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .update({
                age_group: targetAgeGroup
            })
            .eq(
                "player_id",
                playerID
            )
            .select()
            .single();

    if (error) {

        console.error(
            "Supabase player move failed:",
            error
        );

        alert(
            "Unable to move the player. Please try again."
        );

        return;
    }

    if (players[player.ageGroup]) {

        players[player.ageGroup] =
            players[player.ageGroup].filter(
                item =>
                    item.id !== player.id
            );
    }

    player.ageGroup =
        data.age_group;

    if (!players[targetAgeGroup]) {

        players[targetAgeGroup] = [];
    }

    players[targetAgeGroup].push(
        player
    );

    saveData();

    showPlayerManagement(
        targetAgeGroup
    );
}