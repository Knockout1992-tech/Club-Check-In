/* =========================================================
   STORAGE / PERSISTENCE
   ========================================================= */


function loadSavedData() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    "clubCheckInData"
                )
            );

        if (saved) {

            if (saved.players) {
                players = saved.players;
            }

            if (saved.sessions) {
                sessions = saved.sessions;
            }

            if (saved.dailyRegisters) {
                dailyRegisters =
                    saved.dailyRegisters;
            }

            if (saved.currentSeason) {
                currentSeason =
                    saved.currentSeason;
            }

            if (saved.coachPIN) {
                coachPIN =
                    saved.coachPIN;
            }

            if (saved.seniorPIN) {
                seniorPIN =
                    saved.seniorPIN;
            }

        }

        ageGroups.forEach(ageGroup => {

            if (!players[ageGroup]) {
                players[ageGroup] = [];
            }

            if (!sessions[ageGroup]) {
                sessions[ageGroup] = [];
            }

            players[ageGroup].forEach(player => {

                if (
                    typeof player.coachGmsSuggestion
                    !== "boolean"
                ) {

                    player.coachGmsSuggestion =
                        !!player.gms;

                }

                if (
                    typeof player.archived
                    !== "boolean"
                ) {

                    player.archived = false;

                }

                if (
                    typeof player.active
                    !== "boolean"
                ) {

                    player.active =
                        !player.archived;

                }

                if (
                    typeof player.lastAttendanceDate
                    === "undefined"
                ) {

                    player.lastAttendanceDate =
                        null;

                }

            });

        });

        backfillLastAttendanceDates();

    } catch (error) {

        console.log(
            "Saved data could not be loaded.",
            error
        );

    }

}

/* =========================================================
   BACKFILL ATTENDANCE
   ========================================================= */

function backfillLastAttendanceDates() {

    Object.keys(dailyRegisters)
        .forEach(dateKey => {

            const day =
                dailyRegisters[dateKey];

            if (!day) {
                return;
            }

            Object.keys(day)
                .forEach(ageGroup => {

                    const register =
                        day[ageGroup];

                    if (
                        !register ||
                        !register.attendance
                    ) {
                        return;
                    }

                    Object.keys(
                        register.attendance
                    ).forEach(playerID => {

                        if (
                            register.attendance[playerID]
                            !== true
                        ) {
                            return;
                        }

                        const player =
                            findPlayerByID(
                                playerID
                            );

                        if (!player) {
                            return;
                        }

                        if (
                            !player.lastAttendanceDate ||
                            dateKey >
                            player.lastAttendanceDate
                        ) {

                            player.lastAttendanceDate =
                                dateKey;

                        }

                    });

                });

        });

}

function saveData() {

    localStorage.setItem(
        "clubCheckInData",
        JSON.stringify({

            players:
                players,

            sessions:
                sessions,

            dailyRegisters:
                dailyRegisters,

            currentSeason:
                currentSeason,

            coachPIN:
                coachPIN,

            seniorPIN:
                seniorPIN

        })
    );

}

async function loadPlayersFromSupabase() {

    const { data, error } =
        await supabaseClient
            .from("players")
            .select("*");

    if (error) {

        console.error(
            "Supabase player load failed:",
            error
        );

        return false;
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

    console.log(
        "Supabase players loaded:",
        players
    );

    return true;
}