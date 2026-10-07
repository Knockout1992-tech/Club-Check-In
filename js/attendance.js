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

    const todayKey = getTodayKey();

    const { data: registerID, error: registerError } =
        await supabaseClient.rpc(
            "open_attendance_register",
            {
                requested_date: todayKey,
                requested_age_group: ageGroup
            }
        );

    if (registerError) {

        console.error(
            "Supabase attendance register open failed:",
            registerError
        );

        alert(
            "Unable to open today's register. Please try again."
        );

        return null;
    }

    if (
        registerID === null ||
        registerID === undefined
    ) {

        console.warn(
            "No attendance register available for:",
            ageGroup
        );

        alert(
            ageGroup +
           " is not active."
            "."
        );

        return null;
    }

    const { data: registerData, error: loadError } =
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

    if (loadError) {

        console.error(
            "Supabase attendance register load failed:",
            loadError
        );

        alert(
            "Unable to load today's register. Please try again."
        );

        return null;
    }

    const {
        data: attendanceRecords,
        error: recordsError
    } =
        await supabaseClient
            .from("attendance_records")
            .select(`
                player_id,
                present
            `)
            .eq("register_id", registerID);

    if (recordsError) {

        console.error(
            "Supabase attendance records load failed:",
            recordsError
        );

        alert(
            "Unable to load attendance. Please try again."
        );

        return null;
    }

    const attendance = {};

    attendanceRecords.forEach(record => {

        attendance[record.player_id] =
            record.present === true;

    });

    const register = {

        id: registerData.id,

        submitted:
            registerData.submitted,

        closedAutomatically:
            registerData.closed_automatically,

        attendance:
            attendance
    };

    if (!attendanceRegisters[todayKey]) {

        attendanceRegisters[todayKey] = {};

    }

    attendanceRegisters[todayKey][ageGroup] =
        register;

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

    const player =
        findPlayerByID(playerID);

    if (!player) {
        return;
    }

    const register =
        getTodayRegister(
            player.ageGroup
        );

    if (!register) {
        return;
    }

    if (
        register.submitted ||
        register.closedAutomatically
    ) {
        return;
    }

    const { data, error } =
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

    if (error) {

        console.error(
            "Supabase attendance update failed:",
            error
        );

        alert(
            "Unable to save attendance. Please try again."
        );

        return;
    }

    if (data !== true) {

        alert(
            "Attendance could not be updated."
        );

        return;
    }

    register.attendance[playerID] =
        present;

    if (present) {

        player.lastAttendanceDate =
            getTodayKey();

    }

    showRegister();
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
