/* =========================================================
   SEASON PLANNER — SENIOR ADMIN
   Protected through Senior-PIN-verified Supabase RPCs.
   ========================================================= */

let seasonPlannerData = null;
let seasonPlannerAgeFilter = "all";
let seasonPlannerPage = "home";

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
        seasonPlannerPage = "home";
        renderSeasonPlanner();
    } catch(e) {
        root.innerHTML = `<div class="info-box">Unable to load Season Planner.<br>${spEsc(e.message)}</div><button class="primary-button" onclick="loadSeasonPlanner()">Retry</button>`;
    }
}

function spSetPage(page) {
    seasonPlannerPage = page;
    renderSeasonPlanner();
}
function spBackHome() {
    return '<button class="back-button" onclick="spSetPage(\'home\')">← Season Planner</button>';
}
function spAgeNames(x) {
    if (x.applies_to_all) return "All age groups";
    const names=(x.age_group_ids||[]).map(g=>g.display_name||g.age_group).filter(Boolean);
    return names.length ? names.join(", ") : (x.display_name||x.age_group||"Age group");
}
function spRenderHome() {
    const s=seasonPlannerData.season;
    const upcoming=seasonPlannerData.events.filter(e=>e.event_date>spToday()).sort((a,b)=>a.event_date.localeCompare(b.event_date)||String(a.start_time||"").localeCompare(String(b.start_time||"")));
    const nextDate=upcoming.length?upcoming[0].event_date:null;
    const next=nextDate?upcoming.filter(e=>e.event_date===nextDate):[];
    let html='<div class="info-box" style="padding:16px;"><div class="subtitle">CURRENT SEASON</div><strong>'+spEsc(s.season_name)+'</strong><br>';
    html+=(s.start_date&&s.end_date?spDate(s.start_date)+" – "+spDate(s.end_date):"Season dates not set");
    html+='<div style="margin-top:10px;">'+seasonPlannerData.schedules.filter(x=>x.active).length+' active schedules · '+upcoming.length+' upcoming sessions</div></div>';
    html+='<h3 style="margin-top:20px;">Up Next</h3>';
    if(next.length) {
        html+='<div class="info-box" style="padding:14px;margin:10px 0;"><div class="subtitle">'+spDate(nextDate)+'</div>';
        html+=next.map(e=>'<div style="padding:8px 0;border-bottom:1px solid #ddd;"><strong>'+spEsc(e.title)+'</strong><br>'+spEsc(e.display_name||e.age_group)+' · '+spType(e.event_type)+(e.start_time?' · '+spTime(e.start_time):'')+(e.venue?' · '+spEsc(e.venue):'')+'</div>').join("");
        html+='</div>';
    } else html+='<div class="info-box">No upcoming events have been scheduled.</div>';
    html+='<h3 style="margin-top:22px;">Manage season</h3>';
    html+='<button class="secondary-button" style="width:100%;text-align:left;padding:15px;margin:5px 0;" onclick="spSetPage(\'schedules\')"><strong>Recurring Schedules</strong><br><span class="subtitle">Regular training and match days</span></button>';
    html+='<button class="secondary-button" style="width:100%;text-align:left;padding:15px;margin:5px 0;" onclick="spSetPage(\'holidays\')"><strong>Holidays & Breaks</strong><br><span class="subtitle">Club closures and time off</span></button>';
    html+='<button class="secondary-button" style="width:100%;text-align:left;padding:15px;margin:5px 0;" onclick="spSetPage(\'calendar\')"><strong>Season Calendar</strong><br><span class="subtitle">View and edit future events</span></button>';
    html+='<button class="secondary-button" style="width:100%;text-align:left;padding:15px;margin:5px 0;" onclick="spSetPage(\'setup\')"><strong>Season Setup</strong><br><span class="subtitle">Season start and end dates</span></button>';
    return html;
}
function spRenderSchedules() {
    const s=seasonPlannerData.season, groups=seasonPlannerData.age_groups;
    const checks=groups.map(g=>'<label style="display:flex;gap:8px;padding:6px 0;"><input type="checkbox" class="spScheduleGroup" value="'+g.id+'"> '+spEsc(g.display_name||g.age_group)+'</label>').join("");
    const schedules=seasonPlannerData.schedules.map(x=>'<div class="info-box" style="margin:8px 0;padding:13px;"><strong>'+spEsc(x.schedule_name)+'</strong><br>'+spEsc(spAgeNames(x))+'<br>'+spDay(x.weekday)+' · '+spTime(x.start_time)+'–'+spTime(x.end_time)+' · Every '+x.recurrence_interval_weeks+' week(s)<br>'+spDate(x.schedule_start_date)+' – '+spDate(x.schedule_end_date)+(x.venue?' · '+spEsc(x.venue):'')+(x.active?'<br><button class="secondary-button" style="margin-top:9px;" onclick="endSeasonPlannerSchedule('+x.id+')">End future sessions</button>':'<br><span class="subtitle">Schedule ended</span>')+'</div>').join("")||"<p>No recurring schedules yet.</p>";
    let h=spBackHome()+'<h3>Recurring Schedules</h3><p class="subtitle">Create separate schedules for different days or age groups. All age groups automatically includes newly activated groups.</p>';
    if(!s.start_date||!s.end_date) h+='<div class="info-box">Set the season dates in Season Setup before creating schedules.</div>';
    h+='<div class="card" style="padding:14px;margin:12px 0;"><h4>Create a schedule</h4><div class="form-group"><label>Applies to</label><select id="spScheduleScope" onchange="document.getElementById(\'spScheduleGroups\').style.display=this.value===\'selected\'?\'block\':\'none\'"><option value="all">All age groups</option><option value="selected">Choose age groups</option></select></div>';
    h+='<div id="spScheduleGroups" style="display:none;border:1px solid #ddd;border-radius:8px;padding:8px;margin-bottom:12px;"><div class="subtitle">Select one or more age groups</div>'+checks+'</div>';
    h+='<div class="form-group"><label for="spScheduleName">Schedule name</label><input id="spScheduleName" maxlength="80" placeholder="e.g. Sunday training"></div>';
    h+='<div class="form-group"><label for="spWeekday">Day</label><select id="spWeekday"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></div>';
    h+='<div class="form-group"><label for="spFrequency">Frequency</label><select id="spFrequency"><option value="1">Every week</option><option value="2">Every 2 weeks</option><option value="3">Every 3 weeks</option><option value="4">Every 4 weeks</option></select></div>';
    h+='<div class="form-group"><label for="spScheduleStart">Starts</label><input id="spScheduleStart" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'" value="'+(s.start_date||'')+'"></div>';
    h+='<div class="form-group"><label for="spScheduleEnd">Ends</label><input id="spScheduleEnd" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'" value="'+(s.end_date||'')+'"></div>';
    h+='<div style="display:flex;gap:10px;flex-wrap:wrap;"><div class="form-group" style="flex:1;min-width:120px;"><label for="spStartTime">Start time</label><input id="spStartTime" type="time" value="10:00"></div><div class="form-group" style="flex:1;min-width:120px;"><label for="spEndTime">End time</label><input id="spEndTime" type="time" value="11:00"></div></div>';
    h+='<div class="form-group"><label for="spVenue">Location</label><input id="spVenue" maxlength="160" placeholder="e.g. Club grounds"></div><button class="primary-button" onclick="createSeasonPlannerSchedule()">Create schedule</button></div><h4>Existing schedules</h4>'+schedules;
    return h;
}
function spRenderHolidays() {
    const s=seasonPlannerData.season, groups=seasonPlannerData.age_groups;
    const opts=groups.map(g=>'<option value="'+g.id+'">'+spEsc(g.display_name||g.age_group)+'</option>').join("");
    const breaks=seasonPlannerData.breaks.map(x=>'<div class="info-box" style="margin:8px 0;padding:13px;"><strong>'+spEsc(x.label)+'</strong> · '+(x.age_group?spEsc(x.display_name||x.age_group):"All age groups")+'<br>'+spDate(x.start_date)+' – '+spDate(x.end_date)+'<br><button class="secondary-button" style="margin-top:8px;" onclick="deleteSeasonPlannerBreak('+x.id+')">Remove break</button></div>').join("")||"<p>No holidays or breaks added.</p>";
    let h=spBackHome()+'<h3>Holidays & Breaks</h3><p class="subtitle">A break changes matching future training sessions to holidays. Past sessions are not altered.</p><div class="card" style="padding:14px;margin:12px 0;">';
    h+='<div class="form-group"><label for="spBreakGroup">Applies to</label><select id="spBreakGroup"><option value="">All age groups</option>'+opts+'</select></div>';
    h+='<div class="form-group"><label for="spBreakName">Name</label><input id="spBreakName" maxlength="80" placeholder="e.g. Christmas break"></div>';
    h+='<div class="form-group"><label for="spBreakStart">From</label><input id="spBreakStart" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'"></div>';
    h+='<div class="form-group"><label for="spBreakEnd">To</label><input id="spBreakEnd" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'"></div><button class="primary-button" onclick="createSeasonPlannerBreak()">Add break</button></div><h4>Existing breaks</h4>'+breaks;
    return h;
}
function spRenderCalendar() {
    const groups=seasonPlannerData.age_groups;
    const events=seasonPlannerData.events.filter(x=>seasonPlannerAgeFilter==="all"||String(x.age_group_id)===String(seasonPlannerAgeFilter));
    const rows=events.map(x=>{
        const locked=x.event_date<=spToday();
        const time=x.start_time?spTime(x.start_time)+(x.end_time?"–"+spTime(x.end_time):""):"Time not set";
        return '<div class="info-box" style="margin:8px 0;padding:13px;"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;"><div><strong>'+spDate(x.event_date)+' · '+spEsc(x.title)+'</strong><br>'+spEsc(x.display_name||x.age_group)+' · '+spType(x.event_type)+'<br>'+spEsc(time)+(x.venue?' · '+spEsc(x.venue):'')+(x.opposition?'<br>Opposition: '+spEsc(x.opposition):'')+(x.notes?'<br>'+spEsc(x.notes):'')+'</div>'+(locked?'<span class="subtitle">Locked</span>':'<button class="secondary-button" onclick="editSeasonPlannerEvent('+x.id+')">Change</button>')+'</div></div>';
    }).join("")||"<p>No events found for this filter.</p>";
    let h=spBackHome()+'<h3>Season Calendar</h3><div class="form-group"><label for="spFilter">Age group</label><select id="spFilter" onchange="filterSeasonPlannerCalendar(this.value)"><option value="all">All age groups</option>';
    h+=groups.map(g=>'<option value="'+g.id+'">'+spEsc(g.display_name||g.age_group)+'</option>').join("")+'</select></div>'+rows;
    return h;
}
function spRenderSetup() {
    const s=seasonPlannerData.season;
    return spBackHome()+'<h3>Season Setup</h3><p class="subtitle">Set the date range that schedules and events can be created within.</p><div class="info-box"><strong>'+spEsc(s.season_name)+'</strong></div><div class="form-group"><label for="spSeasonStart">Season start</label><input id="spSeasonStart" type="date" value="'+(s.start_date||'')+'"></div><div class="form-group"><label for="spSeasonEnd">Season end</label><input id="spSeasonEnd" type="date" value="'+(s.end_date||'')+'"></div><button class="primary-button" onclick="saveSeasonPlannerPeriod()">Save season dates</button>';
}
function renderSeasonPlanner() {
    const root=document.getElementById("seasonPlannerContent");
    if(!root||!seasonPlannerData) return;
    const pages={home:spRenderHome,schedules:spRenderSchedules,holidays:spRenderHolidays,calendar:spRenderCalendar,setup:spRenderSetup};
    root.innerHTML=(pages[seasonPlannerPage]||pages.home)();
    const filter=document.getElementById("spFilter");
    if(filter) filter.value=seasonPlannerAgeFilter;
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
    const appliesToAll=v("spScheduleScope")==="all";
    const selected=[...document.querySelectorAll(".spScheduleGroup:checked")].map(x=>Number(x.value));
    if(!name||!start||!end||end<start||!st||!et||et<=st||(!appliesToAll&&!selected.length))
        return appAlert("Complete the schedule details and select at least one age group.","Check schedule","warning");
    try {
        const id=await spRPC("create_season_planner_schedule_v2",{
            supplied_code:currentSeniorPIN,
            requested_season_id:seasonPlannerData.season.id,
            requested_age_group_ids:selected,
            requested_applies_to_all:appliesToAll,
            requested_schedule_name:name,
            requested_start_date:start,
            requested_end_date:end,
            requested_weekday:Number(v("spWeekday")),
            requested_interval_weeks:Number(v("spFrequency")),
            requested_start_time:st,
            requested_end_time:et,
            requested_venue:v("spVenue")||null
        });
        if(!id) throw new Error("Schedule could not be created. Check the dates and selected age groups.");
        await loadSeasonPlanner();
        await appAlert("The recurring schedule has been created for the selected age groups.","Schedule created","success");
    } catch(e) { await appAlert(e.message||"Unable to create schedule.","Schedule failed","danger"); }
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
