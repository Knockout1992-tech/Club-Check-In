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