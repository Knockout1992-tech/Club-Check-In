/* =========================================================
   PLAYER DATA OPERATIONS
   Supabase-backed player functions
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

                player_id:
                    playerID,

                name:
                    name,

                age_group:
                    ageGroup,

                gms:
                    gms,

                coach_gms_suggestion:
                    false,

                active:
                    true,

                archived:
                    false,

                last_attendance_date:
                    null

            })
            .select()
            .single();


    if (error) {

    console.error(
        "Supabase player creation failed:",
        error
    );

    alert(
        "Player could not be saved:\n\n" +
        error.message
    );

    return null;
}


    /*
       Keep the existing FE working while we migrate.

       Supabase is now the source of the player record.
       The local players object is temporarily kept as
       a mirror until LocalStorage is removed later.
    */

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


    /*
       Temporary migration support.
       This will disappear when LocalStorage is removed.
    */

    saveData();


    return newPlayer;
}

/* =========================================================
   SET GMS
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
                gms:
                    confirmed,

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


    /*
       Temporary FE mirror.
       LocalStorage will be removed later.
    */

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
   SET COACH GMS SUGGESTION
   ========================================================= */

async function setCoachGMSSuggestion(
    playerID,
    suggested
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

                coach_gms_suggestion:
                    suggested

            })
            .eq(
                "player_id",
                playerID
            )
            .select()
            .single();


    if (error) {

        console.error(
            "Supabase coach GMS suggestion update failed:",
            error
        );

        alert(
            "Unable to update the GMS suggestion. Please try again."
        );

        return;
    }


    /*
       Temporary FE mirror.
       LocalStorage will be removed later.
    */

    player.coachGmsSuggestion =
        data.coach_gms_suggestion;


    /*
       If Senior has already confirmed GMS,
       don't allow the suggestion to override it.
    */

    if (player.gms) {

        player.coachGmsSuggestion =
            false;

    }


    saveData();

showRoster();

}

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

    /*
        Temporary FE mirror.
        LocalStorage will be removed later.
    */

    player.active =
        data.active;

    player.archived =
        data.archived;

    player.coachGmsSuggestion =
        data.coach_gms_suggestion;

    saveData();

    /*
        Return to the screen the user came from.
    */

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

    /*
        REGISTER:
        Make sure today's register is open.
    */

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

    /*
        Update the player in Supabase.
    */

    const {
        data,
        error
    } =
        await supabaseClient
            .from("players")
            .update({

                age_group:
                    targetAgeGroup,

                active:
                    true,

                archived:
                    false,

                gms:
                    false,

                coach_gms_suggestion:
                    false

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

    /*
        Temporary FE mirror.
        LocalStorage will be removed later.
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

    /*
        REGISTER:
        The restored player is marked
        present today.
    */

    if (!fromRoster) {

        register.attendance[
            player.id
        ] = true;

        player.lastAttendanceDate =
            getTodayKey();

        saveData();

        /*
            Backend attendance update will be
            wired in with the attendance migration.
        */

    } else {

        saveData();

    }

    /*
        Return to the correct screen.
    */

    if (fromRoster) {

        showRoster();

    } else {

        showRegister();

    }

}