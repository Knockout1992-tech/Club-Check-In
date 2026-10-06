/* =========================================================
   SENIOR / ADMIN
   ========================================================= */
function permanentlyRemovePlayer(playerID) {

    // Senior only
    if (currentRole !== "senior") {

        alert(
            "Only Senior users can permanently remove players."
        );

        return;

    }

    const player =
        findPlayerByID(
            playerID
        );

    if (!player) {

        alert(
            "Player could not be found."
        );

        return;

    }

    // Player must already be archived
    if (!player.archived) {

        alert(
            "Only archived players can be permanently removed."
        );

        return;

    }

    const confirmed =
        confirm(
            "PERMANENTLY REMOVE "
            + player.name
            + "?\n\n"
            + "This will remove their player record "
            + "from Club Check-In.\n\n"
            + "This cannot be undone.\n\n"
            + "Historical attendance will be retained."
        );

    if (!confirmed) {

        return;

    }

    /*
        Remove the player from every age-group array.
        Historical daily registers are deliberately
        left untouched.
    */

    ageGroups.forEach(
        ageGroup => {

            if (!players[ageGroup]) {
                return;
            }

            players[ageGroup] =
                players[ageGroup].filter(
                    item =>
                        item.id !== player.id
                );

        }
    );

    saveData();

showArchiveList();

}
