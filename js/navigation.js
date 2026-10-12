// Navigation =====================================

function goHome() {

    if (
        currentRole === "coach"
    ) {

        currentAgeGroup = null;
        selectedAgeGroups = [];

        showCoachAgeGroups();

        return;

    }

    if (
        currentRole === "senior"
    ) {

        showSeniorDashboard();

        return;

    }

    showWelcome();

}

// Logout ==========================================

function logout() {

    currentRole = null;

    currentAgeGroup = null;

    selectedAgeGroups = [];

    showWelcome();

}

//Show welcome page ====================================


function showWelcome() {

    // Clear the current session credentials
    currentAccessPIN = null;
    currentSeniorPIN = null;

    // Reset the current session selections
    currentRole = null;
    currentAgeGroup = null;
    selectedAgeGroups = [];

    document.getElementById(
        "app"
    ).innerHTML = `

        <div class="welcome">

            <div class="welcome-card">

                <img
                    src="RHRFC.jpg"
                    class="welcome-logo"
                    alt="Rushden & Higham RUFC">

                <div class="welcome-title">
                    CLUB CHECK-IN
                </div>

                <div class="welcome-club">
                    Rushden & Higham RUFC
                </div>

                <button
                    class="role-button"
                    onclick="showPIN('coach')">

                    Coach

                </button>

                <button
                    class="role-button"
                    onclick="showPIN('senior')">

                    Admin Member

                </button>

                <div class="welcome-version">
                    ${APP_VERSION}
                </div>

            </div>

        </div>

    `;

}
