/* =========================================================
   SEASONS - SUPABASE BACKEND
   ========================================================= */


/* =========================================================
   LOAD CURRENT SEASON FROM SUPABASE
   ========================================================= */

async function loadCurrentSeasonFromSupabase() {

    try {

        const { data, error } =
            await supabaseClient
                .from("seasons")
                .select("season_name")
                .eq("is_current", true)
                .maybeSingle();

        if (error) {
            throw error;
        }

        if (!data || !data.season_name) {

            throw new Error(
                "No current season is marked in Supabase."
            );

        }

        currentSeason =
            data.season_name;

        saveData();

        console.log(
            "Current season loaded from Supabase:",
            currentSeason
        );

        return true;

    } catch (error) {

        console.error(
            "Failed to load current season from Supabase:",
            error
        );

        return false;

    }

}


/* =========================================================
   GET NEXT SEASON
   ========================================================= */

function getNextSeason(season) {

    const parts =
        season.split("/");

    const start =
        parseInt(
            parts[0],
            10
        );

    const end =
        parseInt(
            parts[1],
            10
        );

    return (
        start + 1
    ) + "/" + (
        String(
            end + 1
        ).slice(-2)
    );

}


/* =========================================================
   START NEW SEASON
   ========================================================= */

async function performNewSeason(
    nextSeason
) {

    const startDate =
        new Date()
            .toISOString()
            .split("T")[0];

    const {
        data,
        error
    } =
        await supabaseClient.rpc(
            "rollover_season",
            {
                new_season_name:
                    nextSeason,

                new_start_date:
                    startDate
            }
        );

    if (error) {

        console.error(
            "Supabase season rollover failed:",
            error
        );

        alert(
            "Unable to start the new season.\n\n"
            + error.message
        );

        return false;

    }

    if (data !== true) {

        alert(
            "The new season could not be started."
        );

        return false;

    }


    /* -----------------------------------------------------
       REFRESH PLAYERS
       ----------------------------------------------------- */

    const playersLoaded =
        await loadPlayersFromSupabase();

    if (!playersLoaded) {

        alert(
            "The new season was created, "
            + "but the players could not be refreshed.\n\n"
            + "Please refresh the app."
        );

        return false;

    }


    /* -----------------------------------------------------
       UPDATE CURRENT SEASON
       ----------------------------------------------------- */

    currentSeason =
        nextSeason;

    saveData();


    /* -----------------------------------------------------
       RETURN TO SENIOR DASHBOARD
       ----------------------------------------------------- */

    showSeniorDashboard();

    return true;

}