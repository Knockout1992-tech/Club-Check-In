
/* =========================================================
   STORAGE / PERSISTENCE
   ========================================================= */


/* =========================================================
   LOAD SAVED DATA
   ========================================================= */

function loadSavedData() {

    try {

        const rawData =
            localStorage.getItem("clubCheckInData");

        if (rawData) {

            const saved = JSON.parse(rawData);

            if (
                saved.players &&
                typeof saved.players === "object"
            ) {
                players = saved.players;
            }

            if (
                saved.dailyRegisters &&
                typeof saved.dailyRegisters === "object"
            ) {
                dailyRegisters = saved.dailyRegisters;
            }

            if (
                typeof saved.currentSeason === "string" &&
                saved.currentSeason
            ) {
                currentSeason = saved.currentSeason;
            }

        }

        // Ensure every age group has a player array.
        ageGroups.forEach(ageGroup => {

            if (!Array.isArray(players[ageGroup])) {
                players[ageGroup] = [];
            }

        });

        // Normalise player properties.
        Object.values(players).forEach(ageGroupPlayers => {

            if (!Array.isArray(ageGroupPlayers)) {
                return;
            }

            ageGroupPlayers.forEach(player => {

                if (
                    typeof player.coachGmsSuggestion !== "boolean"
                ) {
                    player.coachGmsSuggestion =
                        !!player.gms;
                }

                if (typeof player.archived !== "boolean") {
                    player.archived = false;
                }

                if (typeof player.active !== "boolean") {
                    player.active = !player.archived;
                }

                if (
                    typeof player.lastAttendanceDate === "undefined"
                ) {
                    player.lastAttendanceDate = null;
                }

            });

        });

        if (
            !dailyRegisters ||
            typeof dailyRegisters !== "object" ||
            Array.isArray(dailyRegisters)
        ) {
            dailyRegisters = {};
        }

        backfillLastAttendanceDates();

        console.log("Saved data loaded successfully.");

    } catch (error) {

        console.error(
            "Saved data could not be loaded:",
            error
        );

    }

}


/* =========================================================
   BACKFILL LAST ATTENDANCE DATES
   ========================================================= */

function backfillLastAttendanceDates() {

    Object.keys(dailyRegisters).forEach(dateKey => {

        const day = dailyRegisters[dateKey];

        if (!day || typeof day !== "object") {
            return;
        }

        Object.keys(day).forEach(ageGroup => {

            const register = day[ageGroup];

            if (
                !register ||
                !register.attendance ||
                typeof register.attendance !== "object"
            ) {
                return;
            }

            Object.keys(register.attendance).forEach(playerID => {

                if (register.attendance[playerID] !== true) {
                    return;
                }

                const player = findPlayerByID(playerID);

                if (!player) {
                    return;
                }

                if (
                    !player.lastAttendanceDate ||
                    dateKey > player.lastAttendanceDate
                ) {
                    player.lastAttendanceDate = dateKey;
                }

            });

        });

    });

}


/* =========================================================
   SAVE DATA
   ========================================================= */

function saveData() {

    try {

        const saved = {

            players:
                players,

            dailyRegisters:
                dailyRegisters,

            currentSeason:
                currentSeason

        };

        localStorage.setItem(
            "clubCheckInData",
            JSON.stringify(saved)
        );

        console.log("Saved data successfully.");

    } catch (error) {

        console.error(
            "Failed to save local data:",
            error
        );

        throw error;

    }

}


/* =========================================================
   LOAD PLAYERS FROM SUPABASE
   ========================================================= */

async function loadPlayersFromSupabase() {

    try {

        const { data, error } =
            await supabaseClient
                .from("players")
                .select("*");

        if (error) {
            throw error;
        }

        if (!Array.isArray(data)) {
            throw new Error(
                "Supabase returned an invalid players result."
            );
        }

        players = {};

        data.forEach(player => {

            if (!players[player.age_group]) {
                players[player.age_group] = [];
            }

            players[player.age_group].push({

                id:
                    player.player_id,

                name:
                    player.name,

                ageGroup:
                    player.age_group,

                gms:
                    player.gms,

                coachGmsSuggestion:
                    player.coach_gms_suggestion,

                active:
                    player.active,

                archived:
                    player.archived,

                lastAttendanceDate:
                    player.last_attendance_date

            });

        });

        // Ensure configured age groups exist.
        ageGroups.forEach(ageGroup => {

            if (!Array.isArray(players[ageGroup])) {
                players[ageGroup] = [];
            }

        });

        console.log(
            "Supabase players loaded successfully:",
            players
        );

        return true;

    } catch (error) {

        console.error(
            "Supabase player load failed:",
            error
        );

        return false;

    }

}
