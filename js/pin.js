
 // PIN Screen =======================================

// Keep the verified PIN in memory for authorised
// database operations. Do not put it in localStorage.
let currentAccessPIN = null;


// ===================================================
// PIN SCREEN
// ===================================================

function showPIN(role) {

    currentRole = role;

    // Clear any previous session credentials when
    // returning to the PIN screen.
    currentAccessPIN = null;

    const roleName =
        role === "coach"
        ? "Coach"
        : "Senior Member";

    renderShell(`

        <div class="card pin-card">

            <button
                class="back-button"
                onclick="showWelcome()">

                ← Back

            </button>

            <h2>
                ${roleName} Access
            </h2>

            <div class="subtitle">

                Enter your PIN to continue.

            </div>

            <form onsubmit="event.preventDefault(); checkPIN();">

                <input
                    id="pinInput"
                    class="pin-input"
                    type="password"
                    inputmode="numeric"
                    enterkeyhint="go"
                    maxlength="8"
                    autocomplete="off"
                    required>

                <div
                    id="pinError"
                    class="error">
                </div>

                <button
                    class="primary-button"
                    type="submit">

                    Continue

                </button>

            </form>

        </div>

    `);

    document.getElementById(
        "pinInput"
    ).focus();

}


// ===================================================
// VERIFY PIN
// ===================================================


async function checkPIN() {

    const entered =
        document.getElementById("pinInput").value;

    const error =
        document.getElementById("pinError");

    error.textContent = "";

    if (!entered) {
        error.textContent = "Please enter your PIN.";
        return;
    }

    // Do not retain credentials from an earlier attempt.
    currentAccessPIN = null;
    currentSeniorPIN = null;

    // Step 1: Verify the supplied PIN.
    const {
        data,
        error: supabaseError
    } = await supabaseClient.rpc(
        "verify_access_code",
        {
            supplied_code: entered,
            code_type: currentRole
        }
    );

    if (supabaseError) {
        console.error(
            "PIN verification error:",
            supabaseError
        );

        error.textContent =
            "Unable to verify PIN. Please try again.";

        return;
    }

    if (data !== true) {
        error.textContent = "Incorrect PIN.";
        return;
    }

    // Step 2: Check that this installation and its user
    // are still authorised by Supabase.
    const installationAuthorised =
        await checkInstallationAccess();

    if (installationAuthorised === null) {
        error.textContent =
            "Unable to verify device access. Check your connection and try again.";

        return;
    }

    if (installationAuthorised === false) {
        error.textContent =
            "Access has been revoked or this user is inactive. Contact an Admin.";

        return;
    }

    // Step 3: Grant the session only after both checks pass.
    currentAccessPIN = entered;

    if (currentRole === "coach") {
        showCoachAgeGroups();
        return;
    }

    if (currentRole === "senior") {
        currentSeniorPIN = entered;
        showSeniorDashboard();
        return;
    }

    // Unexpected role: do not retain the credential.
    currentAccessPIN = null;
    currentSeniorPIN = null;

    error.textContent =
        "Invalid access role. Please start again.";
}