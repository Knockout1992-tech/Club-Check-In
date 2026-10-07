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