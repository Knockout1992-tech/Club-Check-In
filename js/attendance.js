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

if (currentRole !== "coach" || !currentAccessPIN) {
    alert("Please log in as Coach again.");
    return null;
}

const todayKey = getTodayKey();

const { data: registerID, error: registerError } =
    await supabaseClient.rpc(
        "open_attendance_register",
        {
            requested_date: todayKey,
            requested_age_group: ageGroup,
            supplied_code: currentAccessPIN
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
        ageGroup + " is not active."
    );

    return null;
}

// Load register details and attendance through
// one protected Supabase RPC.
const { data: registerData, error: loadError } =
    await supabaseClient.rpc(
        "get_attendance_register",
        {
            requested_register_id: registerID,
            supplied_code: currentAccessPIN,
            supplied_role: "coach"
        }
    );

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

if (
    !registerData ||
    !Array.isArray(registerData.attendance)
) {

    console.error(
        "Supabase returned invalid attendance register data."
    );

    alert(
        "Unable to load today's attendance. Please try again."
    );

    return null;
}

const attendance = {};

registerData.attendance.forEach(record => {

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
ENSURE TODAY'S REGISTER IS LOADED
========================================================= */

async function ensureTodayAttendanceRegister(
ageGroup
) {

const existing =
    getTodayRegister(
        ageGroup
    );

if (existing) {

    return existing;

}

return await loadTodayAttendanceRegister(
    ageGroup
);

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

if (
    currentRole !== "coach" ||
    !currentAccessPIN
) {

    alert(
        "Please log in as Coach again."
    );

    return;
}

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
                present,

            supplied_code:
                currentAccessPIN
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
        "Attendance could not be updated. Please check your access and try again."
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

if (currentRole !== "coach" || !currentAccessPIN) {
    alert("Please log in as Coach again.");
    return false;
}

const register = getTodayRegister(ageGroup);

if (!register) {
    return false;
}

if (register.submitted || register.closedAutomatically) {
    alert("This register is closed.");
    return false;
}

const { data, error } = await supabaseClient.rpc(
    "add_player_to_attendance_register",
    {
        requested_register_id: register.id,
        requested_player_id: playerID,
        supplied_code: currentAccessPIN,
        supplied_role: "coach"
    }
);

if (error) {
    console.error(
        "Supabase add player to attendance failed:",
        error
    );

    alert("Unable to add the player to today's register.");
    return false;
}

if (data !== true) {
    alert("The player could not be added to today's register.");
    return false;
}

register.attendance[playerID] = false;

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