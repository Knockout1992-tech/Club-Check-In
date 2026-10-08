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

    console.log(
        "Age groups loaded:",
        ageGroupData
    );

    return true;
}
