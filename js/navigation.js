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

                    Senior Member

                </button>

                <div class="welcome-version">
                    ${APP_VERSION}
                </div>

            </div>

        </div>

    `;

}
