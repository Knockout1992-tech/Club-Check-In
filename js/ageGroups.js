/* =========================================================
   AGE GROUPS - SUPABASE BACKEND
   ========================================================= */

let ageGroupData = [];


/* =========================================================
   LOAD AGE GROUPS
   ========================================================= */

async function loadAgeGroupsFromSupabase() {

    const {
        data,
        error
    } =
        await supabaseClient
            .from("age_groups")
            .select(`
                id,
                age_group,
                display_name,
                sort_order,
                active,
                next_age_group_id
            `)
            .order(
                "sort_order",
                {
                    ascending: true
                }
            );

    if (error) {

        console.error(
            "Supabase age groups load failed:",
            error
        );

        alert(
            "Unable to load age groups. Please try again."
        );

        return false;
    }

    ageGroupData =
        data || [];


    /* -----------------------------------------------------
       BUILD AGE GROUP LIST
       ----------------------------------------------------- */

    ageGroups =
        ageGroupData.map(
            group => group.age_group
        );


    console.log(
        "Age groups loaded:",
        ageGroupData
    );

    console.log(
        "Active age groups:",
        ageGroupData
            .filter(group => group.active)
            .map(group => group.age_group)
    );

    return true;
}


/* =========================================================
   GET ACTIVE AGE GROUPS
   ========================================================= */

function getActiveAgeGroups() {

    return ageGroupData
        .filter(
            group => group.active
        )
        .map(
            group => group.age_group
        );
}