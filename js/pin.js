 // PIN Screen =======================================

function showPIN(role) {

    currentRole = role;

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

async function checkPIN() {

    const entered =
        document.getElementById(
            "pinInput"
        ).value;

    const error =
        document.getElementById(
            "pinError"
        );

    error.textContent = "";

    if (!entered) {

        error.textContent =
            "Please enter your PIN.";

        return;

    }

    const {
        data,
        error: supabaseError
    } =
        await supabaseClient.rpc(
            "verify_access_code",
            {
                supplied_code:
                    entered,

                code_type:
                    currentRole
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

    if (data === true) {

        if (currentRole === "coach") {

            showCoachAgeGroups();

            return;

        }

        if (currentRole === "senior") {

            currentSeniorPIN = entered;

            showSeniorDashboard();

            return;

        }

    }

    error.textContent =
        "Incorrect PIN.";

}
