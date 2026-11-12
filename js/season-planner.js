/* =========================================================
   SEASON PLANNER — SENIOR ADMIN
   Protected through Senior-PIN-verified Supabase RPCs.
   ========================================================= */

let seasonPlannerData = null;
let seasonPlannerAgeFilter = "all";

function spEsc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
    })[c]);
}
function spDate(value) {
    if (!value) return "";
    const p = String(value).slice(0,10).split("-");
    return p.length === 3 ? p[2] + "/" + p[1] + "/" + p[0] : value;
}
function spTime(value) { return value ? String(value).slice(0,5) : ""; }
function spToday() { return getTodayKey(); }
function spDay(value) {
    return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][Number(value)] || "";
}
function spType(value) {
    return ({training:"Training",match:"Match",holiday:"Holiday",cancelled:"Cancelled",other:"Other event"})[value] || value;
}
function spSenior() {
    if (currentRole === "senior" && currentSeniorPIN) return true;
    appAlert("Only Senior users can access the Season Planner.","Access denied","danger");
    return false;
}
async function spRPC(name,args) {
    const {data,error} = await supabaseClient.rpc(name,args);
    if (error) { console.error("Season Planner:",name,error); throw error; }
    return data;
}

async function showSeasonPlanner() {
    if (!spSenior()) return;
    renderShell(`
        <div class="card">
            <button class="back-button" onclick="showSeniorDashboard()">← Admin Dashboard</button>
            <h2>Season Planner</h2>
            <div class="subtitle">Plan recurring training, matches, holidays and other age-group events across the full season.</div>
            <div id="seasonPlannerContent">Loading...</div>
        </div>`);
    await loadSeasonPlanner();
}

// Explicitly expose the entry point used by the Senior Dashboard's inline button.
window.showSeasonPlanner = showSeasonPlanner;

async function loadSeasonPlanner() {
    if (!spSenior()) return;
    const root = document.getElementById("seasonPlannerContent");
    if (!root) return;
    root.innerHTML = "Loading...";
    try {
        seasonPlannerData = await spRPC("get_season_planner",{
            supplied_code:currentSeniorPIN, requested_season_id:null
        });
        if (!seasonPlannerData || !seasonPlannerData.season) throw new Error("Unable to load the current season. Check Senior access and the current season setting.");
        seasonPlannerAgeFilter = "all";
        renderSeasonPlanner();
    } catch(e) {
        root.innerHTML = `<div class="info-box">Unable to load Season Planner.<br>${spEsc(e.message)}</div><button class="primary-button" onclick="loadSeasonPlanner()">Retry</button>`;
    }
}

function renderSeasonPlanner() {
    const root = document.getElementById("seasonPlannerContent");
    if (!root || !seasonPlannerData) return;
    const s = seasonPlannerData.season;
    const configured = !!(s.start_date && s.end_date);
    const groups = seasonPlannerData.age_groups;
    const groupOptions = groups.map(g=>`<option value="${g.id}">${spEsc(g.display_name || g.age_group)}</option>`).join("");

    const schedules = seasonPlannerData.schedules.map(x=>`
        <div class="info-box" style="margin:8px 0;">
            <strong>${spEsc(x.schedule_name)}</strong> · ${spEsc(x.display_name || x.age_group)}
            <br>${spDay(x.weekday)} · ${spTime(x.start_time)}–${spTime(x.end_time)} · Every ${x.recurrence_interval_weeks} week(s)
            <br>${spDate(x.schedule_start_date)} – ${spDate(x.schedule_end_date)} ${x.venue ? "· "+spEsc(x.venue) : ""}
            ${x.active ? `<br><button class="secondary-button" style="margin-top:8px" onclick="endSeasonPlannerSchedule(${x.id})">End future sessions</button>` : "<br>Schedule ended"}
        </div>`).join("") || "<p>No recurring schedules yet.</p>";

    const breaks = seasonPlannerData.breaks.map(x=>`
        <div class="info-box" style="margin:8px 0;">
            <strong>${spEsc(x.label)}</strong> · ${x.age_group ? spEsc(x.display_name || x.age_group) : "All age groups"}
            <br>${spDate(x.start_date)} – ${spDate(x.end_date)}
            <br><button class="secondary-button" style="margin-top:8px" onclick="deleteSeasonPlannerBreak(${x.id})">Remove future break</button>
        </div>`).join("") || "<p>No holidays or breaks added.</p>";

    const events = seasonPlannerData.events.filter(x=>seasonPlannerAgeFilter==="all" || String(x.age_group_id)===String(seasonPlannerAgeFilter));
    const eventRows = events.map(x=>{
        const locked = x.event_date <= spToday();
        const time = x.start_time ? spTime(x.start_time)+(x.end_time ? "–"+spTime(x.end_time) : "") : "Time not set";
        return `
        <div class="info-box" style="margin:8px 0;">
            <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;">
                <div><strong>${spDate(x.event_date)} · ${spEsc(x.title)}</strong>
                <br>${spEsc(x.display_name || x.age_group)} · ${spType(x.event_type)}
                <br>${spEsc(time)} ${x.venue ? "· "+spEsc(x.venue) : ""}
                ${x.opposition ? "<br>Opposition: "+spEsc(x.opposition) : ""}
                ${x.notes ? "<br>"+spEsc(x.notes) : ""}</div>
                <div>${locked ? '<span class="subtitle">Locked</span>' : `<button class="secondary-button" onclick="editSeasonPlannerEvent(${x.id})">Change</button>`}</div>
            </div>
        </div>`;
    }).join("") || "<p>No sessions generated for this age group.</p>";

    root.innerHTML = `
        <div class="info-box"><strong>Season: ${spEsc(s.season_name)}</strong><br>
        ${configured ? spDate(s.start_date)+" – "+spDate(s.end_date) : "Set the season dates to begin."}</div>

        <h3>1. Season dates</h3>
        <p class="subtitle">Set the start and end of the season. Schedules are generated within these dates.</p>
        <div class="form-group"><label for="spSeasonStart">Season start</label><input id="spSeasonStart" type="date" value="${s.start_date || ""}"></div>
        <div class="form-group"><label for="spSeasonEnd">Season end</label><input id="spSeasonEnd" type="date" value="${s.end_date || ""}"></div>
        <button class="primary-button" onclick="saveSeasonPlannerPeriod()">Save season dates</button>

        ${configured ? `
        <h3 style="margin-top:25px">2. Recurring schedules</h3>
        <p class="subtitle">Create multiple schedules for an age group, e.g. Sunday and Wednesday training.</p>
        <div class="form-group"><label for="spAgeGroup">Age group</label><select id="spAgeGroup">${groupOptions}</select></div>
        <div class="form-group"><label for="spScheduleName">Schedule name</label><input id="spScheduleName" maxlength="80" placeholder="e.g. Sunday training"></div>
        <div class="form-group"><label for="spWeekday">Day</label><select id="spWeekday">
            <option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option>
        </select></div>
        <div class="form-group"><label for="spFrequency">Frequency</label><select id="spFrequency">
            <option value="1">Every week</option><option value="2">Every 2 weeks</option><option value="3">Every 3 weeks</option><option value="4">Every 4 weeks</option>
        </select></div>
        <div class="form-group"><label for="spScheduleStart">Schedule starts</label><input id="spScheduleStart" type="date" min="${s.start_date}" max="${s.end_date}" value="${s.start_date}"></div>
        <div class="form-group"><label for="spScheduleEnd">Schedule ends</label><input id="spScheduleEnd" type="date" min="${s.start_date}" max="${s.end_date}" value="${s.end_date}"></div>
        <div class="form-group"><label for="spStartTime">Start time</label><input id="spStartTime" type="time" value="10:00"></div>
        <div class="form-group"><label for="spEndTime">End time</label><input id="spEndTime" type="time" value="11:00"></div>
        <div class="form-group"><label for="spVenue">Location</label><input id="spVenue" maxlength="160" placeholder="e.g. Rushden & Higham RFC"></div>
        <button class="primary-button" onclick="createSeasonPlannerSchedule()">Generate recurring sessions</button>
        <h4>Existing schedules</h4>${schedules}

        <h3 style="margin-top:25px">3. Holidays and breaks</h3>
        <p class="subtitle">Apply a holiday to one age group or all age groups. Future training dates in the period are changed to holidays.</p>
        <div class="form-group"><label for="spBreakGroup">Apply to</label><select id="spBreakGroup"><option value="">All age groups</option>${groupOptions}</select></div>
        <div class="form-group"><label for="spBreakName">Holiday / break name</label><input id="spBreakName" maxlength="80" placeholder="e.g. Christmas break"></div>
        <div class="form-group"><label for="spBreakStart">From</label><input id="spBreakStart" type="date" min="${s.start_date}" max="${s.end_date}"></div>
        <div class="form-group"><label for="spBreakEnd">To</label><input id="spBreakEnd" type="date" min="${s.start_date}" max="${s.end_date}"></div>
        <button class="primary-button" onclick="createSeasonPlannerBreak()">Add holiday / break</button>
        <h4>Existing breaks</h4>${breaks}

        <h3 style="margin-top:25px">4. Season calendar</h3>
        <div class="form-group"><label for="spFilter">Show age group</label><select id="spFilter" onchange="filterSeasonPlannerCalendar(this.value)">
            <option value="all">All age groups</option>${groups.map(g=>`<option value="${g.id}">${spEsc(g.display_name || g.age_group)}</option>`).join("")}
        </select></div>
        ${eventRows}
        ` : ""}
    `;
    const filter = document.getElementById("spFilter");
    if (filter) filter.value = seasonPlannerAgeFilter;
}

async function saveSeasonPlannerPeriod() {
    if (!spSenior()) return;
    const start=document.getElementById("spSeasonStart")?.value;
    const end=document.getElementById("spSeasonEnd")?.value;
    if (!start || !end || end<start) return appAlert("Enter valid season start and end dates.","Check dates","warning");
    try {
        const ok=await spRPC("save_season_planner_period",{
            supplied_code:currentSeniorPIN,requested_season_id:seasonPlannerData.season.id,
            requested_start_date:start,requested_end_date:end
        });
        if (ok!==true) throw new Error("Dates could not be saved. Check that existing schedules fit inside the new season dates.");
        await loadSeasonPlanner();
        await appAlert("Season dates saved.","Season updated","success");
    } catch(e) { await appAlert(e.message || "Unable to save season dates.","Save failed","danger"); }
}

async function createSeasonPlannerSchedule() {
    if (!spSenior()) return;
    const v=id=>document.getElementById(id)?.value;
    const name=v("spScheduleName"),start=v("spScheduleStart"),end=v("spScheduleEnd"),st=v("spStartTime"),et=v("spEndTime");
    if (!v("spAgeGroup") || !name || !start || !end || end<start || !st || !et || et<=st)
        return appAlert("Complete the schedule details and check the dates and times.","Check schedule","warning");
    try {
        const id=await spRPC("create_season_planner_schedule",{
            supplied_code:currentSeniorPIN,requested_season_id:seasonPlannerData.season.id,
            requested_age_group_id:Number(v("spAgeGroup")),requested_schedule_name:name,
            requested_start_date:start,requested_end_date:end,requested_weekday:Number(v("spWeekday")),
            requested_interval_weeks:Number(v("spFrequency")),requested_start_time:st,requested_end_time:et,
            requested_venue:v("spVenue") || null
        });
        if (!id) throw new Error("Schedule could not be created. Check the dates are within the season and the selected weekday occurs before the end date.");
        await loadSeasonPlanner();
        await appAlert("All matching dates in the season have been generated.","Schedule created","success");
    } catch(e) { await appAlert(e.message || "Unable to create schedule.","Schedule failed","danger"); }
}

async function createSeasonPlannerBreak() {
    if (!spSenior()) return;
    const v=id=>document.getElementById(id)?.value;
    const start=v("spBreakStart"),end=v("spBreakEnd"),label=v("spBreakName");
    if (!start || !end || !label || end<start)
        return appAlert("Enter a break name and valid start and end dates.","Check break","warning");
    try {
        const id=await spRPC("create_season_planner_break",{
            supplied_code:currentSeniorPIN,requested_season_id:seasonPlannerData.season.id,
            requested_age_group_id:v("spBreakGroup") ? Number(v("spBreakGroup")) : null,
            requested_start_date:start,requested_end_date:end,requested_label:label
        });
        if (!id) throw new Error("Break could not be added. Check the dates are within the season and do not overlap an existing break.");
        await loadSeasonPlanner();
        await appAlert("The break has been added and matching future training dates marked as holidays.","Break added","success");
    } catch(e) { await appAlert(e.message || "Unable to add break.","Break failed","danger"); }
}

async function deleteSeasonPlannerBreak(id) {
    if (!spSenior()) return;
    if (!await appConfirm("Remove this break? Future sessions linked to it will return to training.","Remove break")) return;
    try {
        const ok=await spRPC("delete_season_planner_break",{supplied_code:currentSeniorPIN,requested_break_id:id});
        if (ok!==true) throw new Error("Break could not be removed.");
        await loadSeasonPlanner();
    } catch(e) { await appAlert(e.message || "Unable to remove break.","Remove failed","danger"); }
}

async function endSeasonPlannerSchedule(id) {
    if (!spSenior()) return;
    if (!await appConfirm("End this recurring schedule? Future sessions will be cancelled. Past sessions will remain unchanged.","End schedule")) return;
    try {
        const ok=await spRPC("end_season_planner_schedule",{supplied_code:currentSeniorPIN,requested_schedule_id:id});
        if (ok!==true) throw new Error("Schedule could not be ended.");
        await loadSeasonPlanner();
    } catch(e) { await appAlert(e.message || "Unable to end schedule.","Update failed","danger"); }
}

function filterSeasonPlannerCalendar(value) {
    seasonPlannerAgeFilter=value;
    renderSeasonPlanner();
}

function editSeasonPlannerEvent(id) {
    if (!spSenior()) return;
    const event=seasonPlannerData.events.find(x=>Number(x.id)===Number(id));
    if (!event || event.event_date<=spToday())
        return appAlert("Past sessions and today's sessions are locked. Only future sessions can be changed.","Session locked","warning");

    const root=document.getElementById("seasonPlannerContent");
    const old=document.getElementById("spEventEditor");
    if (old) old.remove();
    const editor=document.createElement("div");
    editor.id="spEventEditor"; editor.className="card"; editor.style.marginTop="18px";
    editor.innerHTML=`
        <h3>Change future session</h3>
        <p class="subtitle">${spDate(event.event_date)} · ${spEsc(event.display_name || event.age_group)}</p>
        <div class="form-group"><label>Event type</label><select id="spEditType">${["training","match","other","holiday","cancelled"].map(t=>`<option value="${t}" ${t===event.event_type?"selected":""}>${spType(t)}</option>`).join("")}</select></div>
        <div class="form-group"><label>Title</label><input id="spEditTitle" maxlength="120" value="${spEsc(event.title)}"></div>
        <div class="form-group"><label>Start time</label><input id="spEditStart" type="time" value="${spTime(event.start_time)}"></div>
        <div class="form-group"><label>End time</label><input id="spEditEnd" type="time" value="${spTime(event.end_time)}"></div>
        <div class="form-group"><label>Location</label><input id="spEditVenue" maxlength="160" value="${spEsc(event.venue || "")}"></div>
        <div class="form-group"><label>Opposition (for matches)</label><input id="spEditOpposition" maxlength="120" value="${spEsc(event.opposition || "")}"></div>
        <div class="form-group"><label>Notes</label><textarea id="spEditNotes" rows="3" maxlength="1000">${spEsc(event.notes || "")}</textarea></div>
        <button class="primary-button" onclick="saveSeasonPlannerEvent(${event.id})">Save changes</button>
        <button class="secondary-button" onclick="document.getElementById('spEventEditor').remove()">Close</button>`;
    root.appendChild(editor); editor.scrollIntoView({behavior:"smooth",block:"start"});
}

async function saveSeasonPlannerEvent(id) {
    if (!spSenior()) return;
    const event=seasonPlannerData.events.find(x=>Number(x.id)===Number(id));
    if (!event || event.event_date<=spToday())
        return appAlert("Past sessions and today's sessions cannot be changed.","Session locked","warning");
    const v=id=>document.getElementById(id)?.value;
    const st=v("spEditStart") || null,et=v("spEditEnd") || null;
    if (!v("spEditTitle") || (st && et && et<=st))
        return appAlert("Enter a title and check the session times.","Check details","warning");
    try {
        const ok=await spRPC("update_season_planner_event",{
            supplied_code:currentSeniorPIN,requested_event_id:Number(id),
            requested_event_type:v("spEditType"),requested_title:v("spEditTitle"),
            requested_start_time:st,requested_end_time:et,requested_venue:v("spEditVenue") || null,
            requested_opposition:v("spEditOpposition") || null,requested_notes:v("spEditNotes") || null
        });
        if (ok!==true) throw new Error("Session could not be changed. It may have become locked.");
        await loadSeasonPlanner();
        await appAlert("Future session updated.","Session updated","success");
    } catch(e) { await appAlert(e.message || "Unable to update session.","Update failed","danger"); }
}
