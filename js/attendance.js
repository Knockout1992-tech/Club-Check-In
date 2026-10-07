/* =========================================================
   ATTENDANCE - SUPABASE BACKEND
   ========================================================= */

let attendanceRegisters = {};


/* =========================================================
   AUTO-CLOSE PREVIOUS REGISTERS
   ========================================================= */

async function autoClosePreviousAttendanceRegisters() {

    const { data, error } =
        await supabaseClient.rpc(
            "auto_close_previous_attendance_registers"
        );

    if (error) {

        console.error(
            "Supabase attendance auto-close failed:",
            error
        );

        return false;
    }

    console.log(
        "Attendance registers auto-closed:",
        data
    );

    return true;
}


/* =========================================================
   LOAD TODAY'S REGISTER
   ========================================================= */

async function loadTodayAttendanceRegister(ageGroup) {

    alert(
        "1. OPEN REGISTER\n\n" +
        "Age Group: " + ageGroup
    );

    const todayKey = getTodayKey();

    alert(
        "2. DATE\n\n" +
        "Today Key: " + todayKey +
        "\nAge Group: " + ageGroup
    );

    /*
     * OPEN / CREATE REGISTER
     */

    let registerID;
    let registerError;

    try {

        const result =
            await supabaseClient.rpc(
                "open_attendance_register",
                {
                    requested_date:
                        todayKey,

                    requested_age_group:
                        ageGroup
                }
            );

        registerID = result.data;
        registerError = result.error;

    } catch (err) {

        alert(
            "3. REGISTER RPC EXCEPTION\n\n" +
            err.message
        );

        console.error(
            "open_attendance_register exception:",
            err
        );

        return null;
    }

    alert(
        "3. REGISTER RPC RESPONSE\n\n" +
        "Register ID: " +
        JSON.stringify(registerID) +
        "\n\nError:\n" +
        (
            registerError
                ? JSON.stringify(
                    registerError,
                    null,
                    2
                )
                : "NONE"
        )
    );

    if (registerError) {

        console.error(
            "Supabase attendance register open failed:",
            registerError
        );

        return null;
    }

    /*
     * CHECK THAT RPC ACTUALLY RETURNED A REGISTER ID
     */

    if (
        registerID === null ||
        registerID === undefined
    ) {

        alert(
            "4. REGISTER ID IS EMPTY\n\n" +
            "The RPC completed without an error " +
            "but did not return a register ID."
        );

        return null;
    }

    /*
     * LOAD REGISTER
     */

    let registerData;
    let loadError;

    try {

        const result =
            await supabaseClient
                .from("attendance_registers")
                .select(`
                    id,
                    register_date,
                    age_group,
                    submitted,
                    closed_automatically
                `)
                .eq("id", registerID)
                .single();

        registerData = result.data;
        loadError = result.error;

    } catch (err) {

        alert(
            "5. REGISTER LOAD EXCEPTION\n\n" +
            err.message
        );

        console.error(
            "Register load exception:",
            err
        );

        return null;
    }

    alert(
        "5. REGISTER LOAD RESPONSE\n\n" +
        "Data:\n" +
        JSON.stringify(
            registerData,
            null,
            2
        ) +
        "\n\nError:\n" +
        (
            loadError
                ? JSON.stringify(
                    loadError,
                    null,
                    2
                )
                : "NONE"
        )
    );

    if (loadError) {

        console.error(
            "Supabase attendance register load failed:",
            loadError
        );

        return null;
    }

    /*
     * LOAD ATTENDANCE RECORDS
     */

    let attendanceRecords;
    let recordsError;

    try {

        const result =
            await supabaseClient
                .from("attendance_records")
                .select(`
                    player_id,
                    present
                `)
                .eq(
                    "register_id",
                    registerID
                );

        attendanceRecords =
            result.data;

        recordsError =
            result.error;

    } catch (err) {

        alert(
            "6. ATTENDANCE LOAD EXCEPTION\n\n" +
            err.message
        );

        console.error(
            "Attendance records exception:",
            err
        );

        return null;
    }

    alert(
        "6. ATTENDANCE RECORDS RESPONSE\n\n" +
        "Records: " +
        (
            attendanceRecords
                ? attendanceRecords.length
                : "NULL"
        ) +
        "\n\nError:\n" +
        (
            recordsError
                ? JSON.stringify(
                    recordsError,
                    null,
                    2
                )
                : "NONE"
        )
    );

    if (recordsError) {

        console.error(
            "Supabase attendance records load failed:",
            recordsError
        );

        return null;
    }

    /*
     * BUILD FRONT-END ATTENDANCE MIRROR
     */

    const attendance = {};

    if (
        !Array.isArray(
            attendanceRecords
        )
    ) {

        alert(
            "7. INVALID ATTENDANCE DATA\n\n" +
            JSON.stringify(
                attendanceRecords
            )
        );

        return null;
    }

    attendanceRecords.forEach(
        record => {

            attendance[
                record.player_id
            ] =
                record.present === true;

        }
    );

    /*
     * BUILD REGISTER OBJECT
     */

    const register = {

        id:
            registerData.id,

        submitted:
            registerData.submitted,

        closedAutomatically:
            registerData.closed_automatically,

        attendance:
            attendance
    };

    alert(
        "8. REGISTER BUILT\n\n" +
        "ID: " + register.id +
        "\nSubmitted: " +
        register.submitted +
        "\nClosed Automatically: " +
        register.closedAutomatically +
        "\nAttendance Records: " +
        Object.keys(
            register.attendance
        ).length
    );

    /*
     * STORE IN FRONT-END CACHE
     */

    if (
        !attendanceRegisters[todayKey]
    ) {

        attendanceRegisters[todayKey] =
            {};

    }

    attendanceRegisters[todayKey][
        ageGroup
    ] =
        register;

    alert(
        "9. REGISTER STORED\n\n" +
        "Cache Date: " +
        todayKey +
        "\nCache Age Group: " +
        ageGroup
    );

    return register;
}

/* =========================================================
   GET TODAY'S REGISTER
   ========================================================= */

function getTodayRegister(ageGroup) {

    const todayKey =
        getTodayKey();

    if (
        attendanceRegisters[todayKey] &&
        attendanceRegisters[todayKey][ageGroup]
    ) {

        return attendanceRegisters[todayKey][ageGroup];

    }

    return null;
}


/* =========================================================
   OPEN TODAY'S REGISTER
   ========================================================= */

async function createTodayRegister(ageGroup) {

    return await loadTodayAttendanceRegister(
        ageGroup
    );

}


/* =========================================================
   OPEN SELECTED AGE GROUPS
   ========================================================= */

async function openTodayRegister() {

    const groups =
        selectedAgeGroups.length
            ? selectedAgeGroups
            : [currentAgeGroup];

    for (const ageGroup of groups) {

        await loadTodayAttendanceRegister(
            ageGroup
        );

    }

    showRegister();

}


/* =========================================================
   OPEN ONE AGE GROUP REGISTER
   ========================================================= */

async function openAgeGroupRegister(ageGroup) {

    await loadTodayAttendanceRegister(
        ageGroup
    );

    showRegister();

}


/* =========================================================
   UPDATE ATTENDANCE
   ========================================================= */

async function setAttendance(
    playerID,
    present
) {
    alert(
        "1. SET ATTENDANCE\n" +
        "Player: " + playerID +
        "\nPresent: " + present
    );

    /* FIND PLAYER */
    const player =
        findPlayerByID(playerID);

    alert(
        "2. PLAYER LOOKUP\n" +
        "Found: " + !!player +
        "\nAge Group: " +
        (player ? player.ageGroup : "NONE")
    );

    if (!player) {
        alert("STOP: PLAYER NOT FOUND");
        return;
    }

    /* FIND REGISTER */
    const register =
        getTodayRegister(
            player.ageGroup
        );

    alert(
        "3. REGISTER LOOKUP\n" +
        "Found: " + !!register +
        "\nRegister ID: " +
        (register ? register.id : "NONE")
    );

    if (!register) {
        alert(
            "STOP: TODAY'S REGISTER NOT FOUND"
        );
        return;
    }

    /* CHECK REGISTER STATUS */
    alert(
        "4. REGISTER STATUS\n" +
        "Submitted: " +
        register.submitted +
        "\nClosed Automatically: " +
        register.closedAutomatically
    );

    if (
        register.submitted ||
        register.closedAutomatically
    ) {
        alert(
            "STOP: REGISTER IS CLOSED"
        );
        return;
    }

    /* SUPABASE CALL */
    alert(
        "5. CALLING SUPABASE\n" +
        "Register: " + register.id +
        "\nPlayer: " + playerID +
        "\nPresent: " + present
    );

    let data;
    let error;

    try {

        const result =
            await supabaseClient.rpc(
                "update_attendance",
                {
                    requested_register_id:
                        register.id,

                    requested_player_id:
                        playerID,

                    requested_present:
                        present
                }
            );

        data = result.data;
        error = result.error;

    } catch (err) {

        alert(
            "6. SUPABASE EXCEPTION\n" +
            err.message
        );

        console.error(
            "Supabase exception:",
            err
        );

        return;
    }

    /* SUPABASE RESPONSE */
    alert(
        "6. SUPABASE RESPONSE\n" +
        "Data: " + JSON.stringify(data) +
        "\nError: " +
        (error
            ? JSON.stringify(error)
            : "NONE")
    );

    if (error) {

        console.error(
            "Supabase attendance update failed:",
            error
        );

        alert(
            "STOP: SUPABASE ERROR\n\n" +
            error.message
        );

        return;
    }

    /* RPC RESULT */
    if (data !== true) {

        alert(
            "STOP: RPC RETURNED\n" +
            JSON.stringify(data)
        );

        return;
    }

    /* LOCAL UPDATE */
    alert(
        "7. SUPABASE SUCCESS\n" +
        "Updating local register..."
    );

    register.attendance[playerID] =
        present;

    if (present) {

        player.lastAttendanceDate =
            getTodayKey();

    }

    /* RENDER */
    alert(
        "8. RENDERING REGISTER"
    );

    showRegister();

    alert(
        "9. COMPLETE"
    );
}

/* =========================================================
   ADD PLAYER TO TODAY'S REGISTER
   ========================================================= */

async function addPlayerToTodayAttendance(
    ageGroup,
    playerID
) {

    const register =
        getTodayRegister(ageGroup);

    if (!register) {

        return false;

    }

    const { data, error } =
        await supabaseClient.rpc(
            "add_player_to_attendance_register",
            {
                requested_register_id:
                    register.id,

                requested_player_id:
                    playerID
            }
        );

    if (error) {

        console.error(
            "Supabase add player to attendance failed:",
            error
        );

        alert(
            "Unable to add the player to today's register."
        );

        return false;

    }

    if (data !== true) {

        alert(
            "The player could not be added to today's register."
        );

        return false;

    }

    /*
     * The backend inserts the player as absent.
     * The FE mirror therefore starts false.
     */

    register.attendance[playerID] =
        false;

    return true;

}


/* =========================================================
   SAVE / LEAVE REGISTER
   ========================================================= */

function saveSession() {

    /*
     * Save is deliberately NOT a submit/lock operation.
     *
     * Attendance changes have already been written to
     * Supabase when the coach ticks/unticks a player.
     *
     * The register therefore remains open.
     */

    showCoachDashboard();

}
