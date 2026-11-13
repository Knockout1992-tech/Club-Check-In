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

        currentSeason = data.season_name;

        saveData();
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

    const parts = season.split("/");

    const start = parseInt(parts[0], 10);

    const end = parseInt(parts[1], 10);

    return (
        start + 1
    ) + "/" + (
        String(end + 1).slice(-2)
    );

}


/* =========================================================
   START NEW SEASON
   ========================================================= */

async function performNewSeason(nextSeason) {

    // The rollover date is fixed at 1 August of the season being started.
    // The database independently enforces this date and Senior PIN validation.
    const startYear = Number(String(nextSeason).split("/")[0]);
    const startDate = startYear + "-08-01";

    const { data, error } =
        await supabaseClient.rpc(
            "rollover_season_secure",
            {
                supplied_code: currentSeniorPIN,
                new_season_name: nextSeason,
                new_start_date: startDate
            }
        );

    if (error) {

        console.error(
            "Supabase season rollover failed:",
            error
        );

        await appAlert(
            "Unable to start the new season.\n\n" +
            error.message,
            "Season rollover failed",
            "danger"
        );

        return false;

    }

    if (data !== true) {

        await appAlert(
            "The new season could not be started.",
            "Season not started",
            "danger"
        );

        return false;

    }


    /* -----------------------------------------------------
       REFRESH PLAYERS
       ----------------------------------------------------- */

    const playersLoaded =
        await loadPlayersFromSupabase();

    if (!playersLoaded) {

        await appAlert(
            "The new season was created, " +
            "but the players could not be refreshed.\n\n" +
            "Please refresh the app.",
            "Season created",
            "warning"
        );

        return false;

    }


    /* -----------------------------------------------------
       UPDATE CURRENT SEASON
       ----------------------------------------------------- */

    currentSeason = nextSeason;

    saveData();


    /* -----------------------------------------------------
       RETURN TO SENIOR DASHBOARD
       ----------------------------------------------------- */

    showSeniorDashboard();

    return true;

}