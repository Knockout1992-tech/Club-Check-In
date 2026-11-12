/* =========================================================
   SEASON PLANNER — SENIOR ADMIN
   Protected through Senior-PIN-verified Supabase RPCs.
   ========================================================= */

let seasonPlannerData = null;
let seasonPlannerAgeFilter = "all";
let seasonPlannerShowLocked = false;
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
    seasonPlannerPage = "home";
    renderShell(`
        <div class="card season-planner-shell">
            <button id="spHeaderBack" class="back-button" onclick="showSeniorDashboard()">← Back</button>
            <h2 id="spPageTitle">Season Planner</h2>
            <div id="spPageDescription" class="subtitle">Plan recurring training, matches, holidays and other age-group events across the full season.</div>
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

function spSetPage(page) {
    seasonPlannerPage = page;
    renderSeasonPlanner();
}
function spBackHome() {
    return "";
}
function spAgeNames(x) {
    if (x.applies_to_all) return "All age groups";
    const names=(x.age_group_ids||[]).map(g=>g.display_name||g.age_group).filter(Boolean);
    return names.length ? names.join(", ") : (x.display_name||x.age_group||"Age group");
}
function spEventCategory(value) {
    return ({training:"training",match:"fixture",holiday:"holiday",other:"event",cancelled:"cancelled"})[value] || "event";
}
function spTypeBadge(value) {
    const category=spEventCategory(value);
    return '<span class="sp-type-badge sp-type-' + category + '">' + spEsc(spType(value)) + '</span>';
}
function spGroupUpcomingEvents(events) {
    const grouped = new Map();
    events.forEach(event => {
        const key = [event.event_date,event.title,event.event_type,spTime(event.start_time),
            spTime(event.end_time),event.venue||"",event.opposition||"",event.notes||""].join("|");
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(event);
    });
    const allIds = (seasonPlannerData.age_groups||[]).map(g=>String(g.id)).sort();
    return [...grouped.values()].map(items => {
        const ids=[...new Set(items.map(e=>String(e.age_group_id)))].sort();
        const names=ids.map(id=>{
            const g=(seasonPlannerData.age_groups||[]).find(x=>String(x.id)===id);
            return g ? (g.display_name||g.age_group) : "";
        }).filter(Boolean);
        const all=allIds.length>0 && ids.length===allIds.length && ids.every((id,i)=>id===allIds[i]);
        return {event:items[0],ageLabel:all?"All age groups":names.join(" · ")};
    }).sort((x,y)=>x.event.event_date.localeCompare(y.event.event_date)||
        String(x.event.start_time||"").localeCompare(String(y.event.start_time||"")));
}
function spRenderHome() {
    const s=seasonPlannerData.season;
    const upcoming=seasonPlannerData.events.filter(e=>e.event_date>spToday() && e.event_type!=="cancelled")
        .sort((a,b)=>a.event_date.localeCompare(b.event_date)||String(a.start_time||"").localeCompare(String(b.start_time||"")));
    const nextDate=upcoming.length?upcoming[0].event_date:null;
    const next=nextDate?spGroupUpcomingEvents(upcoming.filter(e=>e.event_date===nextDate)):[];
    const active=seasonPlannerData.schedules.filter(x=>x.active).length;
    let html='<section class="sp-season-summary"><div class="sp-eyebrow">CURRENT SEASON</div>'+
        '<div class="sp-season-name">'+spEsc(s.season_name)+'</div><div class="sp-season-dates">'+
        (s.start_date&&s.end_date?spDate(s.start_date)+' – '+spDate(s.end_date):'Season dates not set')+
        '</div><div class="sp-season-meta">'+active+' active schedules <span>·</span> '+upcoming.length+' upcoming sessions</div></section>';
    html+='<section class="sp-section"><div class="sp-section-heading"><h3>Up Next</h3>'+
        (nextDate?'<span class="sp-date-chip">'+spDate(nextDate)+'</span>':'')+'</div>';
    if(next.length) {
        html+='<div class="sp-upcoming-list">'+next.map(item=>{
            const e=item.event;
            return '<div class="sp-upcoming-row sp-upcoming-'+spEventCategory(e.event_type)+'">'+
                '<div class="sp-event-content"><div class="sp-event-title">'+spEsc(e.title)+' '+spTypeBadge(e.event_type)+'</div>'+
                '<div class="sp-event-meta">'+spEsc(item.ageLabel)+
                (e.start_time?' · '+spTime(e.start_time):'')+(e.venue?' · '+spEsc(e.venue):'')+
                (e.opposition?' · '+spEsc(e.opposition):'')+'</div></div></div>';
        }).join('')+'</div>';
    } else html+='<div class="sp-empty">No upcoming events have been scheduled.</div>';
    html+='</section><section class="sp-section sp-manage-section"><h3>Manage season</h3><div class="sp-menu-list">'+
        '<button class="sp-menu-item" onclick="spSetPage(\'schedules\')"><span><strong>Recurring Schedules</strong><small>Regular training and match days</small></span><b>›</b></button>'+
        '<button class="sp-menu-item" onclick="spSetPage(\'calendar\')"><span><strong>Season Calendar</strong><small>View and edit future events</small></span><b>›</b></button>'+
        '<button class="sp-menu-item" onclick="spSetPage(\'holidays\')"><span><strong>Holidays & Breaks</strong><small>Club closures and time off</small></span><b>›</b></button>'+
        '<button class="sp-menu-item" onclick="spSetPage(\'setup\')"><span><strong>Season Setup</strong><small>Season start and end dates</small></span><b>›</b></button>'+
        '</div></section>';
    return html;
}
function spRenderSchedules() {
    const s=seasonPlannerData.season, groups=seasonPlannerData.age_groups;
    const checks=groups.map(g=>'<label class="sp-group-choice"><input type="checkbox" class="spScheduleGroup" value="'+g.id+'"> '+spEsc(g.display_name||g.age_group)+'</label>').join("");
    const schedules=seasonPlannerData.schedules.map(x=>'<article class="sp-management-row"><div class="sp-management-main"><strong>'+spEsc(x.schedule_name)+'</strong><div class="sp-event-meta">'+spEsc(spAgeNames(x))+'</div><div class="sp-event-meta">'+spDay(x.weekday)+' · '+spTime(x.start_time)+'–'+spTime(x.end_time)+' · Every '+x.recurrence_interval_weeks+' week(s)</div><div class="sp-event-meta">'+spDate(x.schedule_start_date)+' – '+spDate(x.schedule_end_date)+(x.venue?' · '+spEsc(x.venue):'')+'</div></div><div>'+(x.active?'<button class="secondary-button" onclick="endSeasonPlannerSchedule('+x.id+')">End schedule</button>':'<span class="sp-locked-tag">Ended</span>')+'</div></article>').join("")||'<div class="sp-empty">No recurring schedules yet.</div>';
    let h='<div class="sp-page-intro">Build regular training or match patterns. Each schedule can cover all age groups or a selected group of teams.</div>';
    if(!s.start_date||!s.end_date) h+='<div class="sp-empty">Set the season dates in Season Setup before creating schedules.</div>';
    h+='<section class="sp-form-panel"><h3>Create a schedule</h3><div class="form-group"><label for="spScheduleScope">Applies to</label><select id="spScheduleScope" onchange="document.getElementById(\'spScheduleGroups\').style.display=this.value===\'selected\'?\'block\':\'none\'"><option value="all">All age groups</option><option value="selected">Choose age groups</option></select></div>';
    h+='<div id="spScheduleGroups" class="sp-group-picker" style="display:none;"><div class="sp-field-hint">Select one or more age groups</div>'+checks+'</div>';
    h+='<div class="form-group"><label for="spScheduleName">Schedule name</label><input id="spScheduleName" maxlength="80" placeholder="e.g. Sunday training"></div>';
    h+='<div class="form-group"><label for="spWeekday">Day</label><select id="spWeekday"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></div>';
    h+='<div class="form-group"><label for="spFrequency">Frequency</label><select id="spFrequency"><option value="1">Every week</option><option value="2">Every 2 weeks</option><option value="3">Every 3 weeks</option><option value="4">Every 4 weeks</option></select></div>';
    h+='<div class="sp-form-grid"><div class="form-group"><label for="spScheduleStart">Starts</label><input id="spScheduleStart" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'" value="'+(s.start_date||'')+'"></div><div class="form-group"><label for="spScheduleEnd">Ends</label><input id="spScheduleEnd" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'" value="'+(s.end_date||'')+'"></div></div>';
    h+='<div class="sp-form-grid"><div class="form-group"><label for="spStartTime">Start time</label><input id="spStartTime" type="time" value="10:00"></div><div class="form-group"><label for="spEndTime">End time</label><input id="spEndTime" type="time" value="11:00"></div></div>';
    h+='<div class="form-group"><label for="spVenue">Location</label><input id="spVenue" maxlength="160" placeholder="e.g. Club grounds"></div><button class="primary-button" onclick="createSeasonPlannerSchedule()">Create schedule</button></section><section class="sp-existing-section"><h3>Existing schedules</h3>'+schedules+'</section>';
    return h;
}
function spRenderHolidays() {
    const s=seasonPlannerData.season, groups=seasonPlannerData.age_groups;
    const opts=groups.map(g=>'<option value="'+g.id+'">'+spEsc(g.display_name||g.age_group)+'</option>').join("");
    const breaks=seasonPlannerData.breaks.map(x=>'<article class="sp-management-row sp-calendar-holiday"><div class="sp-management-main"><strong>'+spEsc(x.label)+'</strong> '+spTypeBadge("holiday")+'<div class="sp-event-meta">'+(x.age_group?spEsc(x.display_name||x.age_group):"All age groups")+'</div><div class="sp-event-meta">'+spDate(x.start_date)+' – '+spDate(x.end_date)+'</div></div><button class="secondary-button" onclick="deleteSeasonPlannerBreak('+x.id+')">Remove</button></article>').join("")||'<div class="sp-empty">No holidays or breaks added.</div>';
    let h='<div class="sp-page-intro">Add club closures and age-group breaks. Matching future training sessions will be marked as holidays; past sessions stay unchanged.</div>';
    h+='<section class="sp-form-panel"><h3>Add a holiday or break</h3><div class="form-group"><label for="spBreakGroup">Applies to</label><select id="spBreakGroup"><option value="">All age groups</option>'+opts+'</select></div>';
    h+='<div class="form-group"><label for="spBreakName">Name</label><input id="spBreakName" maxlength="80" placeholder="e.g. Christmas break"></div>';
    h+='<div class="sp-form-grid"><div class="form-group"><label for="spBreakStart">From</label><input id="spBreakStart" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'"></div><div class="form-group"><label for="spBreakEnd">To</label><input id="spBreakEnd" type="date" min="'+(s.start_date||'')+'" max="'+(s.end_date||'')+'"></div></div><button class="primary-button" onclick="createSeasonPlannerBreak()">Add break</button></section>';
    h+='<section class="sp-existing-section"><h3>Planned holidays</h3>'+breaks+'</section>';
    return h;
}
function spGroupCalendarEvents(events) {
    const grouped=new Map();
    events.forEach(event=>{
        const key=[event.event_date,event.title,event.event_type,spTime(event.start_time),
            spTime(event.end_time),event.venue||"",event.opposition||"",event.notes||""].join("|");
        if(!grouped.has(key)) grouped.set(key,[]);
        grouped.get(key).push(event);
    });
    const allIds=(seasonPlannerData.age_groups||[]).map(g=>String(g.id)).sort();
    return [...grouped.values()].map(items=>{
        const ids=[...new Set(items.map(e=>String(e.age_group_id)))].sort();
        const names=ids.map(id=>{
            const g=(seasonPlannerData.age_groups||[]).find(x=>String(x.id)===id);
            return g?(g.display_name||g.age_group):"";
        }).filter(Boolean);
        const all=allIds.length>0&&ids.length===allIds.length&&ids.every((id,i)=>id===allIds[i]);
        return {items, event:items[0], ageLabel:all?"All age groups":names.join(" · "), multiple:items.length>1};
    }).sort((a,b)=>a.event.event_date.localeCompare(b.event.event_date)||
        String(a.event.start_time||"").localeCompare(String(b.event.start_time||"")));
}
function spRenderCalendar() {
    const groups=seasonPlannerData.age_groups;
    const allEvents=seasonPlannerData.events.filter(x=>seasonPlannerAgeFilter==="all"||String(x.age_group_id)===String(seasonPlannerAgeFilter));
    const lockedCount=allEvents.filter(x=>x.event_date<=spToday()).length;
    const events=allEvents.filter(x=>seasonPlannerShowLocked||x.event_date>spToday());
    const grouped=spGroupCalendarEvents(events);
    const rows=grouped.map(group=>{
        const x=group.event,locked=x.event_date<=spToday();
        const time=x.start_time?spTime(x.start_time)+(x.end_time?"–"+spTime(x.end_time):""):"Time not set";
        const edit=locked?'<span class="sp-lock-note">Past session</span>':
            (group.multiple&&seasonPlannerAgeFilter==="all"?'<span class="sp-lock-note">Filter by age group to edit</span>':'<button class="secondary-button" onclick="editSeasonPlannerEvent('+x.id+')">Change</button>');
        return '<div class="sp-calendar-row sp-calendar-'+spEventCategory(x.event_type)+'"><div class="sp-calendar-main"><div class="sp-calendar-date">'+spDate(x.event_date)+'</div><strong>'+spEsc(x.title)+'</strong> '+spTypeBadge(x.event_type)+(locked?'<span class="sp-locked-tag">Locked</span>':'')+'<div class="sp-event-meta">'+spEsc(group.ageLabel)+' · '+spEsc(time)+(x.venue?' · '+spEsc(x.venue):'')+'</div>'+(x.opposition&&!String(x.title||"").toLowerCase().includes(String(x.opposition).toLowerCase())?'<div class="sp-event-meta">Opposition: '+spEsc(x.opposition)+'</div>':'')+(x.notes?'<div class="sp-event-meta">'+spEsc(x.notes)+'</div>':'')+'</div>'+edit+'</div>';
    }).join("")||'<div class="sp-empty">'+(lockedCount&&!seasonPlannerShowLocked?'Past sessions are hidden. Use “Show locked” to include them.':'No events found for this filter.')+'</div>';
    let h='<div class="sp-calendar-toolbar"><div class="form-group"><label for="spFilter">Age group</label><select id="spFilter" onchange="filterSeasonPlannerCalendar(this.value)"><option value="all">All age groups</option>';
    h+=groups.map(g=>'<option value="'+g.id+'">'+spEsc(g.display_name||g.age_group)+'</option>').join("")+'</select></div>';
    h+='<button class="secondary-button sp-locked-toggle" onclick="toggleSeasonPlannerLocked()">'+(seasonPlannerShowLocked?'Hide locked':'Show locked')+(lockedCount?' ('+lockedCount+')':'')+'</button></div>'+rows;
    return h;
}
function spRenderSetup() {
    const s=seasonPlannerData.season;
    return '<div class="sp-page-intro">Set the date range for this season. Recurring schedules and planned events use these dates.</div><section class="sp-form-panel"><h3>'+spEsc(s.season_name)+'</h3><div class="sp-form-grid"><div class="form-group"><label for="spSeasonStart">Season starts</label><input id="spSeasonStart" type="date" value="'+(s.start_date||'')+'"></div><div class="form-group"><label for="spSeasonEnd">Season ends</label><input id="spSeasonEnd" type="date" value="'+(s.end_date||'')+'"></div></div><button class="primary-button" onclick="saveSeasonPlannerPeriod()">Save season dates</button></section>';
}
function renderSeasonPlanner() {
    const root=document.getElementById("seasonPlannerContent");
    if(!root||!seasonPlannerData) return;
    const pages={home:spRenderHome,schedules:spRenderSchedules,holidays:spRenderHolidays,calendar:spRenderCalendar,setup:spRenderSetup};
    const headers={
        home:["Season Planner","Plan recurring training, matches, holidays and other age-group events across the full season."],
        schedules:["Recurring Schedules","Create and manage regular training and match schedules across your age groups."],
        holidays:["Holidays & Breaks","Set dates when training and club activities are paused."],
        calendar:["Season Calendar","View the season at a glance and make changes to future events."],
        setup:["Season Setup","Set the dates for your club season."]
    };
    const header=headers[seasonPlannerPage]||headers.home;
    const title=document.getElementById("spPageTitle");
    const description=document.getElementById("spPageDescription");
    const back=document.getElementById("spHeaderBack");
    if(title) title.textContent=header[0];
    if(description) description.textContent=header[1];
    if(back) {
        back.textContent=seasonPlannerPage==="home"?"← Back to Dashboard":"← Back";
        back.onclick=seasonPlannerPage==="home"?showSeniorDashboard:()=>spSetPage("home");
    }
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

function toggleSeasonPlannerLocked() {
    seasonPlannerShowLocked=!seasonPlannerShowLocked;
    renderSeasonPlanner();
}
function filterSeasonPlannerCalendar(value) {
    seasonPlannerAgeFilter=value;
    renderSeasonPlanner();
}

function spMarkMatchTitleManual() {
    const title=document.getElementById("spEditTitle");
    if(title) title.dataset.matchAuto="false";
}
function spUpdateMatchTitle() {
    const type=document.getElementById("spEditType");
    const opposition=document.getElementById("spEditOpposition");
    const title=document.getElementById("spEditTitle");
    if(!type||!opposition||!title) return;
    const previous=type.dataset.lastValue||type.value;
    const wasAuto=title.dataset.matchAuto==="true";
    if(type.value==="match" && previous!=="match") {
        title.value=opposition.value.trim()?"Opposition: "+opposition.value.trim():"";
        title.dataset.matchAuto="true";
    } else if(type.value==="match" && wasAuto) {
        title.value=opposition.value.trim()?"Opposition: "+opposition.value.trim():"";
    } else if(type.value!=="match" && wasAuto) {
        title.value="";
        title.dataset.matchAuto="false";
    }
    type.dataset.lastValue=type.value;
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
        <div class="form-group"><label>Event type</label><select id="spEditType" onchange="spUpdateMatchTitle()">${["training","match","other","holiday","cancelled"].map(t=>`<option value="${t}" ${t===event.event_type?"selected":""}>${spType(t)}</option>`).join("")}</select></div>
        <div class="form-group"><label>Title</label><input id="spEditTitle" maxlength="120" value="${spEsc(event.title)}" oninput="spMarkMatchTitleManual()"></div>
        <div class="form-group"><label>Start time</label><input id="spEditStart" type="time" value="${spTime(event.start_time)}"></div>
        <div class="form-group"><label>End time</label><input id="spEditEnd" type="time" value="${spTime(event.end_time)}"></div>
        <div class="form-group"><label>Location</label><input id="spEditVenue" maxlength="160" value="${spEsc(event.venue || "")}"></div>
        <div class="form-group"><label>Opposition (for matches)</label><input id="spEditOpposition" maxlength="120" value="${spEsc(event.opposition || "")}" oninput="spUpdateMatchTitle()"></div>
        <div class="form-group"><label>Notes</label><textarea id="spEditNotes" rows="3" maxlength="1000">${spEsc(event.notes || "")}</textarea></div>
        <button class="primary-button" onclick="saveSeasonPlannerEvent(${event.id})">Save changes</button>
        <button class="secondary-button" onclick="document.getElementById('spEventEditor').remove()">Close</button>`;
    root.appendChild(editor);
    const type=document.getElementById("spEditType");
    const title=document.getElementById("spEditTitle");
    if(type && title) {
        type.dataset.lastValue=event.event_type;
        if(event.event_type==="match" && (!event.title || event.title==="Match" || event.title.startsWith("Opposition: "))) {
            title.dataset.matchAuto="true";
            spUpdateMatchTitle();
        }
    }
    editor.scrollIntoView({behavior:"smooth",block:"start"});
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
