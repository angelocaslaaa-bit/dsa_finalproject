/* ======================================================
   BILLIARD & KTV STORE — FULL MANAGEMENT SYSTEM
   Store setup: exactly 3 Billiard Tables + 1 KTV Room
====================================================== */

const RATE = { Billiard: 150, KTV: 300 }; // per hour
const BUSINESS_NAME = "Billiard & KTV Store";

/* ---------- DATA ---------- */
let accounts = [{ staffId:"A001", username:"admin", password:"admin123", name:"Store Admin", role:"Admin" }];
let loggedInUser = null;
let nextStaffId = 1;

let facilities = [
  { id:"B1", name:"Billiard Table 1", type:"Billiard", manualStatus:null },
  { id:"B2", name:"Billiard Table 2", type:"Billiard", manualStatus:null },
  { id:"B3", name:"Billiard Table 3", type:"Billiard", manualStatus:null },
  { id:"K1", name:"KTV Room 1",       type:"KTV",      manualStatus:null },
];

let reservations = [];       // {id, customerName, contact, facilityId, facilityName, facilityType, date, scheduledStart, scheduledEnd, durationMinutes, price, status, actualStart}
let nextResId = 1;

let walkIns = [];            // {id, customerName, facilityType, durationMinutes, timeAdded, status, queueNumber, assignedFacilityId}
let nextWalkInId = 1;
let nextQueueNumber = 1;

let sessions = {};           // keyed by facilityId -> active session object

// Category-level notes (freebies / inclusions) shown on the inventory list & receipts
const CATEGORY_NOTES = {
  "Buckets":      "Includes 1 Free Snack (Choose 1: Fishball, Crackers, or French Fries)",
  "Liquor":       "Includes Free 1.5L Coke + 1 Snack Choice (Sisig, Pusit, or Calamares)",
  "Bottled Beer": "",
  "Soft Drinks":  "",
};
const DRINK_CATEGORIES = ["Buckets", "Liquor", "Bottled Beer", "Soft Drinks", "Other"];

let drinks = [
  // ---- Buckets ----
  { id:"D1",  category:"Buckets",      name:"SMB Pilsen (Bucket)",       price:420, stock:10, status:"Available" },
  { id:"D2",  category:"Buckets",      name:"SM Light (Bucket)",         price:480, stock:10, status:"Available" },
  { id:"D3",  category:"Buckets",      name:"SM Apple (Bucket)",         price:480, stock:10, status:"Available" },
  { id:"D4",  category:"Buckets",      name:"RH Stallion (Bucket)",      price:480, stock:10, status:"Available" },
  // ---- Liquor ----
  { id:"D5",  category:"Liquor",       name:"Alfonso Light",             price:800, stock:8,  status:"Available" },
  { id:"D6",  category:"Liquor",       name:"Escobar Light",             price:700, stock:8,  status:"Available" },
  { id:"D7",  category:"Liquor",       name:"Fundador Light",            price:800, stock:8,  status:"Available" },
  // ---- Bottled Beer ----
  { id:"D8",  category:"Bottled Beer", name:"Tanduay Ice Blue Fresh",    price:80,  stock:24, status:"Available" },
  { id:"D9",  category:"Bottled Beer", name:"Tanduay Ice Red Energy",    price:80,  stock:24, status:"Available" },
  { id:"D10", category:"Bottled Beer", name:"Tanduay Ice Light",         price:80,  stock:24, status:"Available" },
  { id:"D11", category:"Bottled Beer", name:"SMB Pilsen",                price:70,  stock:24, status:"Available" },
  { id:"D12", category:"Bottled Beer", name:"SM Light",                  price:80,  stock:24, status:"Available" },
  { id:"D13", category:"Bottled Beer", name:"SM Apple",                  price:80,  stock:24, status:"Available" },
  { id:"D14", category:"Bottled Beer", name:"RH Stallion",               price:80,  stock:24, status:"Available" },
  { id:"D15", category:"Bottled Beer", name:"Soju",                      price:150, stock:20, status:"Available" },
  // ---- Soft Drinks ----
  { id:"D16", category:"Soft Drinks",  name:"Coca Cola",                 price:25,  stock:40, status:"Available" },
  { id:"D17", category:"Soft Drinks",  name:"RC Cola",                   price:20,  stock:40, status:"Available" },
  { id:"D18", category:"Soft Drinks",  name:"Refresh Water",             price:15,  stock:40, status:"Available" },
  { id:"D19", category:"Soft Drinks",  name:"Mountain Dew",              price:25,  stock:40, status:"Available" },
  { id:"D20", category:"Soft Drinks",  name:"Sprite",                    price:25,  stock:40, status:"Available" },
  { id:"D21", category:"Soft Drinks",  name:"1.5L Coke",                 price:100, stock:20, status:"Available" },
];
let nextDrinkId = 22;

let drinkOnlyOrders = [];    // {id, drinks:[{drinkId,name,qty,price}], createdAt}
let nextDrinkOnlyId = 1;

let transactions = [];       // full transaction records
let nextTransId = 1;

let dashboardInterval = null;

/* ======================================================
   HELPERS: time & duration
====================================================== */
function pad2(n){ return String(n).padStart(2,"0"); }
function fmtHMS(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}
function fmtClock(date){ return date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function fmtDateTime(date){ return date.toLocaleString(); }
function minutesToHM(mins){
  const h = Math.floor(mins/60), m = mins%60;
  const parts = [];
  if (h) parts.push(h + " hour" + (h>1?"s":""));
  if (m) parts.push(m + " minute" + (m>1?"s":""));
  return parts.length ? parts.join(" ") : "0 minutes";
}
function timeToMinutes(t){ const [h,m] = t.split(":").map(Number); return h*60+m; }
function overlaps(aS,aE,bS,bE){ return aS < bE && bS < aE; }
function computeEndTimeStr(dateStr, timeStr, minutes){
  const start = new Date(`${dateStr}T${timeStr}`);
  const end = new Date(start.getTime() + minutes*60000);
  return pad2(end.getHours()) + ":" + pad2(end.getMinutes());
}
function computePrice(type, minutes){ return Math.round((minutes/60) * RATE[type]); }

function parseDurationInput(text){
  text = text.trim().toLowerCase();
  if (!text) return null;
  let total = 0, matched = false;
  const hourMatch = text.match(/(\d+(\.\d+)?)\s*h/);
  const minMatch = text.match(/(\d+)\s*m/);
  if (hourMatch) { total += parseFloat(hourMatch[1]) * 60; matched = true; }
  if (minMatch)  { total += parseInt(minMatch[1]); matched = true; }
  if (!matched) {
    const n = parseFloat(text);
    if (!isNaN(n)) { total = n; matched = true; }
  }
  return matched && total > 0 ? Math.round(total) : null;
}
function getFlexibleDuration(selectId, manualId){
  const manual = document.getElementById(manualId).value.trim();
  if (manual) {
    const parsed = parseDurationInput(manual);
    if (parsed) return parsed;
  }
  return parseInt(document.getElementById(selectId).value);
}

/* ======================================================
   STAFF LOGIN / AUTHENTICATION — Linear Search
====================================================== */
function linearSearchAuthenticate(records, username, password){
  for (let i=0;i<records.length;i++) if (records[i].username===username && records[i].password===password) return records[i];
  return null;
}
function findAccountIndexByUsername(username){
  for (let i=0;i<accounts.length;i++) if (accounts[i].username===username) return i;
  return -1;
}
function handleLogin(){
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const match = linearSearchAuthenticate(accounts, username, password);
  if (match){
    loggedInUser = match;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "flex";
    document.getElementById("whoText").textContent = `${loggedInUser.name} (${loggedInUser.role})`;
    document.querySelectorAll(".adminOnly").forEach(el => el.style.display = loggedInUser.role==="Admin" ? "block" : "none");
    document.getElementById("resDate").value = new Date().toISOString().split("T")[0];
    populateFacilitySelect("resFacilitySelect", "Billiard");
    populateAllSelects();
    renderAll();
    showTab("dashboard");
    if (dashboardInterval) clearInterval(dashboardInterval);
    dashboardInterval = setInterval(renderDashboard, 1000);
  } else {
    showMsg("msgLogin", "Access Denied: Invalid username or password.", "error");
  }
}
function handleLogout(){
  loggedInUser = null;
  if (dashboardInterval) clearInterval(dashboardInterval);
  document.getElementById("loginUsername").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("app").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  showMsg("msgLogin", "Logged out.", "warn");
}
function requireAdmin(){ return loggedInUser && loggedInUser.role==="Admin"; }

function handleCreateStaff(){
  if (!requireAdmin()) return;
  const name = document.getElementById("newStaffName").value.trim();
  const username = document.getElementById("newStaffUsername").value.trim();
  const password = document.getElementById("newStaffPassword").value.trim();
  if (!name || !username || !password){ showMsg("staffMsg","Fill in all fields.","warn"); return; }
  if (findAccountIndexByUsername(username) !== -1){ showMsg("staffMsg", `Username "${username}" already exists.`,"warn"); return; }
  accounts.push({ staffId:`S${String(nextStaffId).padStart(3,"0")}`, username, password, name, role:"Staff" });
  nextStaffId++;
  document.getElementById("newStaffName").value = "";
  document.getElementById("newStaffUsername").value = "";
  document.getElementById("newStaffPassword").value = "";
  showMsg("staffMsg", `Staff account created: ${name}`, "success");
  renderStaff();
}
function handleDeleteStaff(username){
  if (!requireAdmin()) return;
  const idx = findAccountIndexByUsername(username);
  if (idx===-1) return;
  if (accounts[idx].role==="Admin"){ showMsg("staffMsg","Cannot delete Admin.","error"); return; }
  const removed = accounts.splice(idx,1)[0];
  showMsg("staffMsg", `Deleted: ${removed.name}`, "warn");
  renderStaff();
}
function renderStaff(){
  const tbody = document.getElementById("staffBody"); tbody.innerHTML = "";
  accounts.forEach(acc => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${acc.staffId}</td><td>${acc.username}</td><td>${acc.name}</td><td>${acc.role}</td>
      <td>${acc.role!=="Admin" ? `<button class="small danger" onclick="handleDeleteStaff('${acc.username}')">Delete</button>` : "protected"}</td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   FACILITY STATUS (computed, not stored)
====================================================== */
function getFacilityStatus(facilityId){
  if (sessions[facilityId]) return sessions[facilityId].actualEnd ? "Ended - Awaiting Payment" : "Occupied";
  const f = facilities.find(x => x.id===facilityId);
  if (f && f.manualStatus) return f.manualStatus; // e.g. Cleaning/Unavailable
  const now = new Date();
  const upcoming = reservations.find(r => r.facilityId===facilityId && r.status==="Reserved" &&
    new Date(`${r.date}T${r.scheduledStart}`) - now < 2*60*60*1000 && new Date(`${r.date}T${r.scheduledStart}`) - now > -30*60000);
  if (upcoming) return "Reserved";
  return "Available";
}
function toggleCleaning(facilityId){
  if (!requireAdmin()) return;
  const f = facilities.find(x => x.id===facilityId);
  if (!f) return;
  f.manualStatus = f.manualStatus ? null : "Cleaning/Unavailable";
  renderDashboard();
}

/* ======================================================
   LIVE DASHBOARD (Requirements 11, 13-17)
====================================================== */
function getTotalMinutes(session){
  return session.bookedDurationMinutes + session.extensions.reduce((s,e)=>s+e.minutes,0);
}
function getExtensionTotal(session){ return session.extensions.reduce((s,e)=>s+e.price,0); }

/* ---- Extension proration: if a customer extends but leaves before using the
   full extension, only the actual extension minutes consumed are charged. ---- */
function getProratedExtensionBilling(session, totalPlayingMinutes){
  const ratePerMinute = RATE[session.facilityType] / 60;
  let remainingUsed = Math.max(0, totalPlayingMinutes - session.bookedDurationMinutes);
  const items = [];
  let totalExtensionCost = 0;
  session.extensions.forEach(e => {
    const usedMinutes = Math.min(e.minutes, remainingUsed);
    remainingUsed -= usedMinutes;
    const chargedPrice = Math.round(usedMinutes * ratePerMinute);
    items.push({
      minutes: e.minutes,        // originally requested extension length
      fullPrice: e.price,        // what it would cost if fully used
      usedMinutes,                // minutes actually consumed within this extension
      price: chargedPrice,       // prorated amount actually charged
      prorated: usedMinutes < e.minutes,
    });
    totalExtensionCost += chargedPrice;
  });
  return { items, totalExtensionCost };
}

function getSessionFeeTotal(session, totalPlayingMinutesOverride){
  let totalPlayingMinutes = totalPlayingMinutesOverride;
  if (totalPlayingMinutes == null){
    const now = new Date();
    const elapsedMs = (session.actualEnd || now) - session.actualStart;
    totalPlayingMinutes = Math.max(0, Math.round(elapsedMs/60000));
  }
  const { totalExtensionCost } = getProratedExtensionBilling(session, totalPlayingMinutes);
  return session.baseSessionPrice + totalExtensionCost;
}

function renderDashboard(){
  const grid = document.getElementById("dashboardGrid");
  if (!grid) return;
  grid.innerHTML = "";
  facilities.forEach(f => {
    const session = sessions[f.id];
    const status = getFacilityStatus(f.id);
    const div = document.createElement("div");
    let cls = "available";
    if (status==="Occupied" || status==="Ended - Awaiting Payment") cls = "occupied";
    else if (status==="Reserved") cls = "reserved";
    div.className = "dashCard " + cls;

    if (session){
      const now = new Date();
      const elapsedMs = (session.actualEnd || now) - session.actualStart;
      const totalMin = getTotalMinutes(session);
      const remainingMs = totalMin*60000 - elapsedMs;
      const expired = remainingMs <= 0;
      let timerClass = "timerBig";
      let warnText = "";
      if (!session.actualEnd){
        if (expired){ timerClass += " dangerT"; warnText = "Time expired"; }
        else if (remainingMs <= 5*60000){ timerClass += " dangerT"; warnText = "5 minutes remaining"; }
        else if (remainingMs <= 15*60000){ timerClass += " warnT"; warnText = "15 minutes remaining"; }
      }
      const expectedEnd = new Date(session.actualStart.getTime() + totalMin*60000);
      div.innerHTML = `
        <b>${f.name}</b> <span class="badge occupied">${status}</span><br>
        <span class="small-note">Customer: ${session.customerName}</span><br>
        <div class="timerBig ${timerClass.replace('timerBig','').trim()}">${fmtHMS(elapsedMs)}</div>
        <span class="small-note">Elapsed / Booked: ${minutesToHM(totalMin)} | Remaining: ${expired ? "00:00:00" : fmtHMS(remainingMs)}</span><br>
        <span class="small-note">Start: ${fmtClock(session.actualStart)} | Expected End: ${fmtClock(expectedEnd)}</span><br>
        <span class="small-note">Current Charge: ₱${getSessionFeeTotal(session)}</span><br>
        ${warnText ? `<div class="msg warn">${warnText}</div>` : ""}
        <div class="row" style="margin-top:8px;">
          <button class="small secondary" onclick="handleExtendSession('${f.id}',30)">+30min</button>
          <button class="small secondary" onclick="handleExtendSession('${f.id}',60)">+1hr</button>
          <button class="small danger" onclick="handleEndSession('${f.id}')">End Session</button>
        </div>`;
    } else {
      div.innerHTML = `
        <b>${f.name}</b> <span class="badge ${status==='Available'?'free':(status==='Reserved'?'reserved':'occupied')}">${status}</span><br>
        <span class="small-note">${f.type} — ₱${RATE[f.type]}/hr</span><br>
        <div class="row" style="margin-top:8px;">
          <button class="small secondary" onclick="toggleCleaning('${f.id}')">${f.manualStatus ? "Mark Available" : "Mark Cleaning/Unavailable"}</button>
        </div>`;
    }
    grid.appendChild(div);
  });
}

/* ======================================================
   RESERVATIONS (Requirement 4)
====================================================== */
function populateFacilitySelect(selectId, type){
  const sel = document.getElementById(selectId);
  sel.innerHTML = "";
  facilities.filter(f => f.type===type).forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.id; opt.textContent = f.name;
    sel.appendChild(opt);
  });
}
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("resFacilityType").addEventListener("change", () => populateFacilitySelect("resFacilitySelect", document.getElementById("resFacilityType").value));
});

function reservationConflict(facilityId, date, startTime, endTime, excludeId){
  const newS = timeToMinutes(startTime), newE = timeToMinutes(endTime);
  return reservations.find(r => r.id!==excludeId && r.facilityId===facilityId && r.date===date &&
    (r.status==="Reserved" || r.status==="Started") &&
    overlaps(newS,newE, timeToMinutes(r.scheduledStart), timeToMinutes(r.scheduledEnd)));
}

function handleCreateReservation(){
  const customer = document.getElementById("resCustomer").value.trim();
  const contact = document.getElementById("resContact").value.trim();
  const facilityType = document.getElementById("resFacilityType").value;
  const facilityId = document.getElementById("resFacilitySelect").value;
  const date = document.getElementById("resDate").value;
  const startTime = document.getElementById("resStartTime").value;
  const duration = getFlexibleDuration("resDurationSelect","resDurationManual");

  if (!customer || !facilityId || !date || !startTime || !duration){
    showMsg("resMsg","Fill in customer name, date, start time, and duration.","warn"); return;
  }
  const facility = facilities.find(f => f.id===facilityId);
  const endTime = computeEndTimeStr(date, startTime, duration);

  const conflict = reservationConflict(facilityId, date, startTime, endTime, null);
  if (conflict){
    showMsg("resMsg", `Time slot conflicts with existing reservation ${conflict.id} for ${facility.name} (${conflict.scheduledStart}-${conflict.scheduledEnd}).`, "error");
    return;
  }

  const price = computePrice(facilityType, duration);
  const res = {
    id:`RES${String(nextResId).padStart(3,"0")}`, customerName:customer, contact,
    facilityId, facilityName:facility.name, facilityType,
    date, scheduledStart:startTime, scheduledEnd:endTime, durationMinutes:duration,
    price, status:"Reserved", actualStart:null,
  };
  nextResId++;
  reservations.push(res);

  document.getElementById("resCustomer").value = "";
  document.getElementById("resContact").value = "";
  document.getElementById("resDurationManual").value = "";
  showMsg("resMsg", `${res.id}: ${facility.name} reserved for ${customer} — ${date} ${startTime}-${endTime} (${minutesToHM(duration)}) = ₱${price}`, "success");
  renderReservations(); renderDashboard(); populateAllSelects();
}

function handleStartReservationEarly(resId){
  const res = reservations.find(r => r.id===resId);
  if (!res || res.status!=="Reserved") return;
  if (sessions[res.facilityId]){
    showMsg("resMsg", `Cannot start — ${res.facilityName} is currently occupied.`, "error"); return;
  }
  const actualStart = new Date();
  sessions[res.facilityId] = {
    sourceType:"Reservation", sourceId:res.id,
    customerName:res.customerName, facilityId:res.facilityId, facilityName:res.facilityName, facilityType:res.facilityType,
    scheduledStart:res.scheduledStart, scheduledEnd:res.scheduledEnd,
    actualStart, actualEnd:null,
    bookedDurationMinutes:res.durationMinutes, baseSessionPrice:res.price,
    extensions:[], drinks:[],
  };
  res.status = "Started"; res.actualStart = actualStart;
  showMsg("resMsg", `Session started early for ${res.customerName} on ${res.facilityName} at ${fmtClock(actualStart)}.`, "success");
  renderReservations(); renderDashboard(); populateAllSelects();
}

function handleCancelReservation(resId){
  const res = reservations.find(r => r.id===resId);
  if (!res) return;
  res.status = "Cancelled";
  showMsg("resMsg", `${res.id} cancelled.`, "warn");
  renderReservations(); renderDashboard();
}

function linearSearchReservation(query){
  const q = query.trim().toLowerCase();
  for (let i=0;i<reservations.length;i++)
    if (reservations[i].customerName.toLowerCase().includes(q) || reservations[i].id.toLowerCase()===q) return reservations[i];
  return null;
}
function handleReservationSearch(){
  const query = document.getElementById("resSearchInput").value;
  if (!query.trim()){ showMsg("resSearchMsg","Enter a name or reservation ID.","warn"); return; }
  const found = linearSearchReservation(query);
  if (found) showMsg("resSearchMsg", `${found.id} - ${found.customerName}, ${found.facilityName}, ${found.date} ${found.scheduledStart}, ${minutesToHM(found.durationMinutes)}, ₱${found.price}, Status: ${found.status}`, "success");
  else showMsg("resSearchMsg", "No matching reservation found.", "error");
}

function renderReservations(){
  const tbody = document.getElementById("reservationsBody"); tbody.innerHTML = "";
  reservations.filter(r => r.status==="Reserved" || r.status==="Started").forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.id}</td><td>${r.customerName}</td><td>${r.facilityName}</td><td>${r.date}</td>
      <td>${r.scheduledStart}</td><td>${r.scheduledEnd}</td><td>${minutesToHM(r.durationMinutes)}</td><td>₱${r.price}</td>
      <td><span class="badge ${r.status==='Started'?'occupied':'reserved'}">${r.status}</span></td>
      <td>
        ${r.status==="Reserved" ? `<button class="small" onclick="handleStartReservationEarly('${r.id}')">Start Session</button>` : ""}
        <button class="small danger" onclick="handleCancelReservation('${r.id}')">Cancel</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   WALK-IN QUEUE (Requirement 5)
====================================================== */
function handleAddWalkIn(){
  const customer = document.getElementById("wiCustomer").value.trim();
  const facilityType = document.getElementById("wiFacilityType").value;
  const duration = getFlexibleDuration("wiDurationSelect","wiDurationManual");
  if (!customer || !duration){ showMsg("wiMsg","Enter customer name and duration.","warn"); return; }

  const walkIn = { id:`WI${String(nextWalkInId).padStart(3,"0")}`, customerName:customer, facilityType,
    durationMinutes:duration, timeAdded:new Date(), status:"Waiting", queueNumber:nextQueueNumber++, assignedFacilityId:null };
  nextWalkInId++;
  walkIns.push(walkIn);
  document.getElementById("wiCustomer").value = "";
  document.getElementById("wiDurationManual").value = "";
  showMsg("wiMsg", `${customer} added to queue (#${walkIn.queueNumber}) — wants ${facilityType}, ${minutesToHM(duration)}.`, "success");
  renderWalkIns();
}

function handleStartWalkIn(walkInId){
  const wi = walkIns.find(w => w.id===walkInId);
  if (!wi || wi.status!=="Waiting") return;
  const freeFacility = facilities.find(f => f.type===wi.facilityType && !sessions[f.id] && !f.manualStatus);
  if (!freeFacility){
    showMsg("wiMsg", `No available ${wi.facilityType} facility yet. ${wi.customerName} stays in queue.`, "warn"); return;
  }
  const actualStart = new Date();
  sessions[freeFacility.id] = {
    sourceType:"Walk-In", sourceId:wi.id,
    customerName:wi.customerName, facilityId:freeFacility.id, facilityName:freeFacility.name, facilityType:wi.facilityType,
    scheduledStart:null, scheduledEnd:null,
    actualStart, actualEnd:null,
    bookedDurationMinutes:wi.durationMinutes, baseSessionPrice:computePrice(wi.facilityType, wi.durationMinutes),
    extensions:[], drinks:[],
  };
  wi.status = "Playing"; wi.assignedFacilityId = freeFacility.id;
  showMsg("wiMsg", `${wi.customerName} started on ${freeFacility.name} at ${fmtClock(actualStart)}.`, "success");
  renderWalkIns(); renderDashboard(); populateAllSelects();
}

function handleCancelWalkIn(walkInId){
  const wi = walkIns.find(w => w.id===walkInId);
  if (!wi) return;
  wi.status = "Cancelled";
  showMsg("wiMsg", `${wi.customerName}'s queue entry cancelled.`, "warn");
  renderWalkIns();
}

function renderWalkIns(){
  const tbody = document.getElementById("walkinBody"); tbody.innerHTML = "";
  walkIns.filter(w => w.status==="Waiting" || w.status==="Playing").forEach(w => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>#${w.queueNumber}</td><td>${w.customerName}</td><td>${w.facilityType}</td><td>${minutesToHM(w.durationMinutes)}</td>
      <td>${fmtClock(w.timeAdded)}</td>
      <td><span class="badge ${w.status==='Playing'?'occupied':'reserved'}">${w.status}</span></td>
      <td>
        ${w.status==="Waiting" ? `<button class="small" onclick="handleStartWalkIn('${w.id}')">Start Session</button><button class="small danger" onclick="handleCancelWalkIn('${w.id}')">Cancel</button>` : ""}
      </td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   SESSION EXTEND / END (Requirements 7, 14, 15, 21)
====================================================== */
function handleExtendSession(facilityId, minutes){
  const session = sessions[facilityId];
  if (!session || session.actualEnd) return;
  const currentEnd = new Date(session.actualStart.getTime() + getTotalMinutes(session)*60000);
  const newEnd = new Date(currentEnd.getTime() + minutes*60000);

  const conflict = reservations.find(r => r.facilityId===facilityId && r.status==="Reserved" &&
    new Date(`${r.date}T${r.scheduledStart}`) > session.actualStart && new Date(`${r.date}T${r.scheduledStart}`) < newEnd);
  if (conflict){
    alert("Cannot extend session because the table/KTV room is already reserved for another customer.");
    return;
  }
  const price = computePrice(session.facilityType, minutes);
  session.extensions.push({ minutes, price });
  renderDashboard();
}

function handleEndSession(facilityId){
  const session = sessions[facilityId];
  if (!session) return;
  session.actualEnd = new Date();
  renderDashboard(); populateAllSelects();
  showTab("billing");
  document.getElementById("billTarget").value = "session:" + facilityId;
  renderBillPreview();
}

/* ======================================================
   DRINKS & INVENTORY (Requirements 1, 6)
====================================================== */
function syncDrinkStatus(drink){ drink.status = drink.stock > 0 ? "Available" : "Out of Stock"; }

function populateCategorySelects(){
  ["newDrinkCategory","editDrinkCategory"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value; sel.innerHTML = "";
    DRINK_CATEGORIES.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat; opt.textContent = cat;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
  });
}

function handleAddDrink(){
  const name = document.getElementById("newDrinkName").value.trim();
  const category = document.getElementById("newDrinkCategory").value || "Other";
  const stock = parseInt(document.getElementById("newDrinkStock").value);
  const price = parseFloat(document.getElementById("newDrinkPrice").value);
  if (!name || isNaN(stock) || isNaN(price) || stock<0 || price<0){ showMsg("addDrinkMsg","Enter valid name, stock, price.","warn"); return; }
  const drink = { id:`D${nextDrinkId}`, category, name, price, stock, status: stock>0 ? "Available" : "Out of Stock" };
  nextDrinkId++;
  drinks.push(drink);
  document.getElementById("newDrinkName").value = "";
  document.getElementById("newDrinkStock").value = "10";
  document.getElementById("newDrinkPrice").value = "50";
  showMsg("addDrinkMsg", `Added new drink: ${name} (${category}) — ₱${price} (Stock: ${stock})`, "success");
  renderInventory(); populateAllSelects();
}

function handleRestock(){
  const id = document.getElementById("restockDrinkSelect").value;
  const qty = parseInt(document.getElementById("restockQty").value);
  const drink = drinks.find(d => d.id===id);
  if (!drink || isNaN(qty) || qty<=0){ showMsg("restockMsg","Select a drink and valid quantity.","warn"); return; }
  drink.stock += qty; syncDrinkStatus(drink);
  showMsg("restockMsg", `Restocked ${drink.name} +${qty} (now ${drink.stock})`, "success");
  renderInventory(); populateAllSelects();
}

function loadDrinkForEdit(){
  const id = document.getElementById("editDrinkSelect").value;
  const drink = drinks.find(d => d.id===id);
  if (!drink) return;
  document.getElementById("editDrinkName").value = drink.name;
  document.getElementById("editDrinkCategory").value = drink.category || "Other";
  document.getElementById("editDrinkPrice").value = drink.price;
  document.getElementById("editDrinkStock").value = drink.stock;
}
function handleEditDrink(){
  const id = document.getElementById("editDrinkSelect").value;
  const drink = drinks.find(d => d.id===id);
  if (!drink){ showMsg("editDrinkMsg","Select a drink to edit.","warn"); return; }
  const name = document.getElementById("editDrinkName").value.trim();
  const category = document.getElementById("editDrinkCategory").value || "Other";
  const price = parseFloat(document.getElementById("editDrinkPrice").value);
  const stock = parseInt(document.getElementById("editDrinkStock").value);
  if (!name || isNaN(price) || isNaN(stock) || price<0 || stock<0){ showMsg("editDrinkMsg","Enter valid values.","warn"); return; }
  drink.name = name; drink.category = category; drink.price = price; drink.stock = stock; syncDrinkStatus(drink);
  showMsg("editDrinkMsg", `Updated ${drink.name}.`, "success");
  renderInventory(); populateAllSelects();
}
function handleDeleteDrink(){
  const id = document.getElementById("editDrinkSelect").value;
  const idx = drinks.findIndex(d => d.id===id);
  if (idx===-1){ showMsg("editDrinkMsg","Select a drink to delete.","warn"); return; }
  const confirmDel = confirm(`Delete "${drinks[idx].name}" from the menu?`);
  if (!confirmDel) return;
  const removed = drinks.splice(idx,1)[0];
  showMsg("editDrinkMsg", `Deleted ${removed.name} from the menu.`, "warn");
  renderInventory(); populateAllSelects();
}

function populateDrinkOrderTargetSelect(){
  const sel = document.getElementById("drinkOrderTarget");
  const prev = sel.value; sel.innerHTML = "";
  const newOpt = document.createElement("option");
  newOpt.value = "new_drinkonly"; newOpt.textContent = "New Drink-Only Order";
  sel.appendChild(newOpt);
  Object.values(sessions).forEach(s => {
    const opt = document.createElement("option");
    opt.value = "session:" + s.facilityId;
    opt.textContent = `${s.facilityName} — ${s.customerName}`;
    sel.appendChild(opt);
  });
  drinkOnlyOrders.forEach(o => {
    const opt = document.createElement("option");
    opt.value = "do:" + o.id;
    opt.textContent = `Drink-Only Order ${o.id} (${o.drinks.length} items)`;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
}
function populateDrinkSelect(){
  ["drinkSelect","restockDrinkSelect","editDrinkSelect"].forEach(id => {
    const sel = document.getElementById(id);
    const prev = sel.value; sel.innerHTML = "";
    const list = id==="drinkSelect" ? drinks.filter(d => d.status==="Available" && d.stock>0) : drinks;
    list.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = id==="drinkSelect" ? `${d.name} (₱${d.price}) — Stock: ${d.stock}` : `${d.name} (Stock: ${d.stock})`;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
  });
}

function handleDrinkOrder(){
  const targetRaw = document.getElementById("drinkOrderTarget").value;
  const drinkId = document.getElementById("drinkSelect").value;
  const qty = parseInt(document.getElementById("drinkQty").value) || 1;
  const drink = drinks.find(d => d.id===drinkId);
  if (!drink){ showMsg("drinkOrderMsg","Select a drink.","warn"); return; }
  if (drink.status==="Out of Stock" || drink.stock < qty){ showMsg("drinkOrderMsg", `Not enough stock for ${drink.name}. Only ${drink.stock} left.`, "error"); return; }

  drink.stock -= qty; syncDrinkStatus(drink);
  const line = { drinkId: drink.id, name: drink.name, qty, price: drink.price };

  if (targetRaw === "new_drinkonly"){
    const order = { id:`DO${String(nextDrinkOnlyId).padStart(3,"0")}`, drinks:[line], createdAt:new Date() };
    nextDrinkOnlyId++;
    drinkOnlyOrders.push(order);
    showMsg("drinkOrderMsg", `New Drink-Only Order ${order.id} created: ${qty}x ${drink.name}`, "success");
  } else if (targetRaw.startsWith("do:")){
    const order = drinkOnlyOrders.find(o => o.id === targetRaw.slice(3));
    if (order){ order.drinks.push(line); showMsg("drinkOrderMsg", `Added ${qty}x ${drink.name} to ${order.id}`, "success"); }
  } else if (targetRaw.startsWith("session:")){
    const session = sessions[targetRaw.slice(8)];
    if (session){ session.drinks.push(line); showMsg("drinkOrderMsg", `Added ${qty}x ${drink.name} to ${session.facilityName} (${session.customerName})`, "success"); }
  }
  renderInventory(); populateAllSelects();
}

function linearSearchDrink(query){
  const q = query.trim().toLowerCase();
  for (let i=0;i<drinks.length;i++) if (drinks[i].name.toLowerCase().includes(q)) return drinks[i];
  return null;
}
function getFilteredDrinks(term){
  const q = (term||"").trim().toLowerCase();
  if (!q) return drinks;
  return drinks.filter(d => d.name.toLowerCase().includes(q) || (d.category||"").toLowerCase().includes(q));
}
function handleDrinkSearch(){
  const query = document.getElementById("drinkSearchInput").value;
  renderInventory();
  if (!query.trim()){ showMsg("drinkSearchMsg", `Showing all ${drinks.length} drinks.`, "success"); return; }
  const results = getFilteredDrinks(query);
  if (results.length) showMsg("drinkSearchMsg", `Found ${results.length} matching drink(s).`, "success");
  else showMsg("drinkSearchMsg", "No drinks match your search.", "error");
}

function renderInventory(){
  const term = document.getElementById("drinkSearchInput") ? document.getElementById("drinkSearchInput").value : "";
  const list = getFilteredDrinks(term).slice().sort((a,b) =>
    (a.category||"Other").localeCompare(b.category||"Other") || a.name.localeCompare(b.name));
  const tbody = document.getElementById("inventoryBody"); tbody.innerHTML = "";
  if (!list.length){
    tbody.innerHTML = `<tr><td colspan="5" class="small-note" style="text-align:center;">No drinks found.</td></tr>`;
    return;
  }
  let lastCategory = null;
  list.forEach(d => {
    const category = d.category || "Other";
    if (category !== lastCategory){
      lastCategory = category;
      const note = CATEGORY_NOTES[category];
      const catRow = document.createElement("tr");
      catRow.innerHTML = `<td colspan="5" class="categoryRow">${category}${note ? " — " + note : ""}</td>`;
      tbody.appendChild(catRow);
    }
    const isLow = d.stock > 0 && d.stock <= 5;
    const badgeClass = d.status==="Out of Stock" ? "occupied" : (isLow ? "low" : "free");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${category}</td><td>${d.name}</td><td>₱${d.price}</td><td>${d.stock}</td>
      <td><span class="badge ${badgeClass}">${d.status==="Out of Stock" ? "Out of Stock" : (isLow ? "Low Stock" : "Available")}</span></td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   BILLING (Requirements 8, 9)
====================================================== */
function populateBillTargetSelect(){
  const sel = document.getElementById("billTarget");
  const prev = sel.value; sel.innerHTML = "";
  Object.values(sessions).forEach(s => {
    const opt = document.createElement("option");
    opt.value = "session:" + s.facilityId;
    opt.textContent = `${s.facilityName} — ${s.customerName}${s.actualEnd ? " (Ended)" : ""}`;
    sel.appendChild(opt);
  });
  drinkOnlyOrders.forEach(o => {
    const opt = document.createElement("option");
    opt.value = "do:" + o.id;
    opt.textContent = `Drink-Only Order ${o.id}`;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
  renderBillPreview();
}

function computeBillData(targetRaw){
  if (targetRaw && targetRaw.startsWith("session:")){
    const facilityId = targetRaw.slice(8);
    const session = sessions[facilityId];
    if (!session) return null;
    const end = session.actualEnd || new Date();
    const totalPlayingMinutes = Math.max(1, Math.round((end - session.actualStart)/60000));
    const drinksCost = session.drinks.reduce((s,d)=>s+d.price*d.qty,0);
    const extensionBilling = getProratedExtensionBilling(session, totalPlayingMinutes);
    const sessionFee = session.baseSessionPrice + extensionBilling.totalExtensionCost;
    return {
      type:"session", session, facilityName:session.facilityName, customerName:session.customerName,
      actualStart:session.actualStart, actualEnd:end, scheduledStart:session.scheduledStart, scheduledEnd:session.scheduledEnd,
      bookedMinutes:session.bookedDurationMinutes, extensions:extensionBilling.items, totalPlayingMinutes,
      sessionFee, drinks:session.drinks, drinksCost, grandTotal: sessionFee+drinksCost,
      transType: session.sourceType || "Walk-In",
    };
  } else if (targetRaw && targetRaw.startsWith("do:")){
    const order = drinkOnlyOrders.find(o => o.id===targetRaw.slice(3));
    if (!order) return null;
    const drinksCost = order.drinks.reduce((s,d)=>s+d.price*d.qty,0);
    return { type:"drinkonly", order, facilityName:null, customerName:"Walk-in Customer",
      actualStart:order.createdAt, actualEnd:new Date(), drinks:order.drinks, drinksCost,
      sessionFee:0, grandTotal:drinksCost, transType:"Drink Only" };
  }
  return null;
}

function renderBillPreview(){
  const targetRaw = document.getElementById("billTarget").value;
  const data = computeBillData(targetRaw);
  const div = document.getElementById("billPreview");
  if (!data){ div.innerHTML = "<p class='small-note'>No active session or order selected.</p>"; return; }

  let html = `<div class="card">`;
  if (data.type==="session"){
    html += `<h3 style="margin-top:0;">${data.facilityName} — ${data.customerName}</h3>
      <p class="small-note">Start: ${fmtClock(data.actualStart)} ${data.actualEnd ? "| End: " + fmtClock(data.actualEnd) : "(ongoing)"}</p>
      <p class="small-note">Total Playing Time: ${minutesToHM(data.totalPlayingMinutes)}</p>
      <p>Base (${minutesToHM(data.bookedMinutes)}): ₱${data.session.baseSessionPrice}</p>`;
    data.extensions.forEach(e => {
      const label = e.prorated
        ? `Extension (${minutesToHM(e.minutes)} requested, ${minutesToHM(e.usedMinutes)} used — prorated)`
        : `Extension (${minutesToHM(e.minutes)})`;
      html += `<p>${label}: ₱${e.price}</p>`;
    });
  } else {
    html += `<h3 style="margin-top:0;">Drink-Only Order ${data.order.id}</h3>`;
  }
  if (data.drinks.length){
    html += `<hr><p><b>Drinks:</b></p>`;
    data.drinks.forEach(d => html += `<p>${d.qty}x ${d.name} — ₱${d.price*d.qty}</p>`);
  }
  html += `<hr><p><b>GRAND TOTAL: ₱${data.grandTotal}</b></p></div>`;
  div.innerHTML = html;
}

function handleCompletePayment(){
  const targetRaw = document.getElementById("billTarget").value;
  const data = computeBillData(targetRaw);
  if (!data){ showMsg("billMsg","No active session or order selected.","warn"); return; }

  const paymentMethod = document.getElementById("paymentMethod").value;
  const amountPaid = parseFloat(document.getElementById("amountPaid").value) || 0;
  const change = amountPaid - data.grandTotal;
  if (paymentMethod==="Cash" && amountPaid < data.grandTotal){
    showMsg("billMsg", `Amount paid (₱${amountPaid}) is less than the total (₱${data.grandTotal}).`, "warn"); return;
  }

  const transaction = {
    id:`T${String(nextTransId).padStart(4,"0")}`, type:data.transType,
    customerName:data.customerName, facilityName:data.facilityName,
    date:new Date().toLocaleDateString(),
    actualStart:data.actualStart, actualEnd:data.actualEnd,
    scheduledStart:data.scheduledStart||null, scheduledEnd:data.scheduledEnd||null,
    bookedMinutes:data.bookedMinutes||0,
    extensions:data.extensions||[], totalPlayingMinutes:data.totalPlayingMinutes||0,
    sessionFee:data.sessionFee, drinks:data.drinks, drinksCost:data.drinksCost,
    grandTotal:data.grandTotal, paymentMethod, amountPaid, change,
    time:new Date().toLocaleString(),
  };
  nextTransId++;
  transactions.push(transaction);

  // free up facility / clear source
  if (data.type==="session"){
    const session = data.session;
    delete sessions[session.facilityId];
    if (session.sourceType==="Reservation"){
      const res = reservations.find(r => r.id===session.sourceId);
      if (res) res.status = "Completed";
    } else if (session.sourceType==="Walk-In"){
      const wi = walkIns.find(w => w.id===session.sourceId);
      if (wi) wi.status = "Completed";
    }
  } else {
    const idx = drinkOnlyOrders.findIndex(o => o.id===data.order.id);
    if (idx!==-1) drinkOnlyOrders.splice(idx,1);
  }

  document.getElementById("amountPaid").value = "";
  showMsg("billMsg", `Payment complete (${transaction.id}). Change: ₱${change.toFixed(2)}`, "success");
  document.getElementById("receiptActions").innerHTML =
    `<button class="secondary" onclick="downloadReceiptPDF('${transaction.id}')">Download Receipt PDF</button>`;
  document.getElementById("billPreview").innerHTML = "";

  renderReservations(); renderWalkIns(); renderDashboard(); renderHistory(); populateAllSelects();
}

/* ======================================================
   PDF RECEIPT (Requirement 9)
====================================================== */
function downloadReceiptPDF(transId){
  const t = transactions.find(x => x.id===transId);
  if (!t) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"mm", format:[80, 180] });
  let y = 10;
  const line = (text, size=9, bold=false) => {
    doc.setFontSize(size);
    doc.setFont(undefined, bold ? "bold" : "normal");
    doc.text(String(text), 5, y);
    y += size/2 + 2.5;
  };
  line(BUSINESS_NAME, 12, true);
  line("Official Receipt", 9);
  line("--------------------------------", 8);
  line(`Trans #: ${t.id}`);
  line(`Date: ${t.time}`);
  line(`Customer: ${t.customerName}`);
  line(`Type: ${t.type}`);
  if (t.facilityName){
    line(`Facility: ${t.facilityName}`);
    line(`Start: ${fmtClock(t.actualStart)}  End: ${fmtClock(t.actualEnd)}`);
    line(`Total Playing Time: ${minutesToHM(t.totalPlayingMinutes)}`);
    line(`Base Charge: P${(t.sessionFee - t.extensions.reduce((s,e)=>s+e.price,0))}`);
    t.extensions.forEach(e => {
      const label = e.prorated
        ? `Extension (${minutesToHM(e.minutes)} req, ${minutesToHM(e.usedMinutes)} used)`
        : `Extension (${minutesToHM(e.minutes)})`;
      line(`${label}: P${e.price}`);
    });
  }
  if (t.drinks.length){
    line("--------------------------------", 8);
    line("Drinks:", 9, true);
    t.drinks.forEach(d => line(`${d.qty}x ${d.name} = P${d.price*d.qty}`));
  }
  line("--------------------------------", 8);
  line(`Session/Drinks Subtotal: P${t.sessionFee}`);
  line(`Drinks Total: P${t.drinksCost}`);
  line(`GRAND TOTAL: P${t.grandTotal}`, 11, true);
  line(`Payment: ${t.paymentMethod}`);
  line(`Amount Paid: P${t.amountPaid.toFixed(2)}`);
  line(`Change: P${t.change.toFixed(2)}`);
  line("--------------------------------", 8);
  line("Thank you and come again!", 9);
  doc.save(`Receipt-${t.id}.pdf`);
}

/* ======================================================
   PRINTABLE PDF TABLE REPORTS (Sales & Inventory)
====================================================== */
function exportTablePDF(title, columns, rows, filename){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"mm", format:"a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const usableWidth = pageWidth - marginX*2;
  const colWidth = usableWidth / columns.length;
  let y = 15;

  function drawHeaderBlock(){
    doc.setFontSize(14); doc.setFont(undefined,"bold");
    doc.text(BUSINESS_NAME, marginX, y); y += 6;
    doc.setFontSize(11);
    doc.text(title, marginX, y); y += 5;
    doc.setFontSize(8.5); doc.setFont(undefined,"normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y); y += 4;
    doc.text(`Total records: ${rows.length}`, marginX, y); y += 6;
  }
  function drawColumnHeader(){
    doc.setFont(undefined,"bold"); doc.setFontSize(8.5);
    columns.forEach((c,i) => doc.text(String(c), marginX + i*colWidth, y));
    y += 2;
    doc.setLineWidth(0.2);
    doc.line(marginX, y, marginX+usableWidth, y);
    y += 4.5;
    doc.setFont(undefined,"normal"); doc.setFontSize(8.5);
  }

  drawHeaderBlock();
  drawColumnHeader();

  if (!rows.length){
    doc.setFont(undefined,"italic");
    doc.text("No records found.", marginX, y);
  }
  rows.forEach(row => {
    if (y > pageHeight - 15){
      doc.addPage(); y = 15; drawColumnHeader();
    }
    row.forEach((cell,i) => {
      let text = String(cell);
      const maxChars = Math.max(6, Math.floor(colWidth / 1.9));
      if (text.length > maxChars) text = text.slice(0, maxChars-1) + "…";
      doc.text(text, marginX + i*colWidth, y);
    });
    y += 5.5;
  });

  doc.save(filename);
}

function exportSalesReportPDF(){
  const searchEl = document.getElementById("historySearchInput");
  const term = searchEl ? searchEl.value : "";
  const list = getFilteredTransactions(term);
  const rows = list.map(t => [t.id, t.type, t.customerName, t.facilityName || "—", `P${t.grandTotal}`, t.paymentMethod, t.time]);
  const title = term.trim() ? `Sales Report — Transaction History (filtered: "${term.trim()}")` : "Sales Report — Transaction History (All)";
  exportTablePDF(title, ["Trans. ID","Type","Customer","Facility","Total","Payment","Time"], rows, `Sales-Report-${Date.now()}.pdf`);
}

function exportInventoryReportPDF(){
  const searchEl = document.getElementById("drinkSearchInput");
  const term = searchEl ? searchEl.value : "";
  const list = getFilteredDrinks(term).slice().sort((a,b) =>
    (a.category||"Other").localeCompare(b.category||"Other") || a.name.localeCompare(b.name));
  const rows = list.map(d => {
    const isLow = d.stock > 0 && d.stock <= 5;
    const statusLabel = d.status==="Out of Stock" ? "Out of Stock" : (isLow ? "Low Stock" : "Available");
    return [d.category || "Other", d.name, `P${d.price}`, d.stock, statusLabel];
  });
  const title = term.trim() ? `Inventory Report — Drinks & Stock (filtered: "${term.trim()}")` : "Inventory Report — Drinks & Stock (All)";
  exportTablePDF(title, ["Category","Drink","Price","Stock","Status"], rows, `Inventory-Report-${Date.now()}.pdf`);
}

/* ======================================================
   TRANSACTION HISTORY (Requirement 10) — Stack
====================================================== */
function getFilteredTransactions(term){
  const q = (term||"").trim().toLowerCase();
  let list = transactions.slice().reverse(); // most recent first (stack order)
  if (q){
    list = list.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      (t.facilityName||"").toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q) ||
      t.paymentMethod.toLowerCase().includes(q)
    );
  }
  return list;
}
function renderHistory(){
  const searchEl = document.getElementById("historySearchInput");
  const list = getFilteredTransactions(searchEl ? searchEl.value : "");
  const tbody = document.getElementById("historyBody"); tbody.innerHTML = "";
  if (!list.length){
    tbody.innerHTML = `<tr><td colspan="8" class="small-note" style="text-align:center;">No transactions found.</td></tr>`;
    return;
  }
  list.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.id}</td><td>${t.type}</td><td>${t.customerName}</td><td>${t.facilityName||"—"}</td>
      <td>₱${t.grandTotal}</td><td>${t.paymentMethod}</td><td>${t.time}</td>
      <td><button class="small secondary" onclick="viewTransaction('${t.id}')">View</button></td>`;
    tbody.appendChild(tr);
  });
}
function viewTransaction(transId){
  const t = transactions.find(x => x.id===transId);
  if (!t) return;
  let html = `<div class="card">
    <h3 style="margin-top:0;">${t.id} — ${t.customerName} (${t.type})</h3>
    <p class="small-note">Date: ${t.time}</p>`;
  if (t.facilityName){
    html += `<p>Facility: ${t.facilityName}</p>
      <p>Start: ${fmtClock(t.actualStart)} | End: ${fmtClock(t.actualEnd)}</p>
      <p>Total Playing Time: ${minutesToHM(t.totalPlayingMinutes)}</p>
      <p>Base Duration: ${minutesToHM(t.bookedMinutes)}</p>`;
    t.extensions.forEach(e => {
      const label = e.prorated
        ? `Extension: ${minutesToHM(e.minutes)} requested, ${minutesToHM(e.usedMinutes)} used (prorated — left early)`
        : `Extension: ${minutesToHM(e.minutes)}`;
      html += `<p>${label} — ₱${e.price}</p>`;
    });
    html += `<p>Session Fee: ₱${t.sessionFee}</p>`;
  }
  if (t.drinks.length){
    html += `<hr><p><b>Drinks:</b></p>`;
    t.drinks.forEach(d => html += `<p>${d.qty}x ${d.name} — ₱${d.price*d.qty}</p>`);
  }
  html += `<hr><p><b>Grand Total: ₱${t.grandTotal}</b></p>
    <p>Payment Method: ${t.paymentMethod} | Paid: ₱${t.amountPaid.toFixed(2)} | Change: ₱${t.change.toFixed(2)}</p>
    <button class="secondary" onclick="downloadReceiptPDF('${t.id}')">Reprint PDF Receipt</button>
    </div>`;
  document.getElementById("historyDetail").innerHTML = html;
}

/* ======================================================
   UI HELPERS / NAVIGATION
====================================================== */
function showMsg(elId, text, type){
  const el = document.getElementById(elId);
  el.textContent = text; el.className = "msg " + type;
}
function showTab(tab){
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelectorAll("#sidebar button[data-tab]").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`#sidebar button[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");
  if (tab==="dashboard") renderDashboard();
  if (tab==="billing") populateBillTargetSelect();
  closeSidebar();
}
function toggleSidebar(){
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("open");
}
function closeSidebar(){
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.remove("open");
}
function populateAllSelects(){
  populateDrinkOrderTargetSelect();
  populateDrinkSelect();
  populateCategorySelects();
  populateBillTargetSelect();
}
function renderAll(){
  renderDashboard(); renderReservations(); renderWalkIns();
  renderInventory(); renderHistory(); renderStaff();
}
document.getElementById("loginPassword").addEventListener("keyup", e => { if (e.key==="Enter") handleLogin(); });const DRINK_CATEGORIES = ["Buckets", "Liquor", "Bottled Beer", "Soft Drinks", "Other"];

let drinks = [
  // ---- Buckets ----
  { id:"D1",  category:"Buckets",      name:"SMB Pilsen (Bucket)",       price:420, stock:10, status:"Available" },
  { id:"D2",  category:"Buckets",      name:"SM Light (Bucket)",         price:480, stock:10, status:"Available" },
  { id:"D3",  category:"Buckets",      name:"SM Apple (Bucket)",         price:480, stock:10, status:"Available" },
  { id:"D4",  category:"Buckets",      name:"RH Stallion (Bucket)",      price:480, stock:10, status:"Available" },
  // ---- Liquor ----
  { id:"D5",  category:"Liquor",       name:"Alfonso Light",             price:800, stock:8,  status:"Available" },
  { id:"D6",  category:"Liquor",       name:"Escobar Light",             price:700, stock:8,  status:"Available" },
  { id:"D7",  category:"Liquor",       name:"Fundador Light",            price:800, stock:8,  status:"Available" },
  // ---- Bottled Beer ----
  { id:"D8",  category:"Bottled Beer", name:"Tanduay Ice Blue Fresh",    price:80,  stock:24, status:"Available" },
  { id:"D9",  category:"Bottled Beer", name:"Tanduay Ice Red Energy",    price:80,  stock:24, status:"Available" },
  { id:"D10", category:"Bottled Beer", name:"Tanduay Ice Light",         price:80,  stock:24, status:"Available" },
  { id:"D11", category:"Bottled Beer", name:"SMB Pilsen",                price:70,  stock:24, status:"Available" },
  { id:"D12", category:"Bottled Beer", name:"SM Light",                  price:80,  stock:24, status:"Available" },
  { id:"D13", category:"Bottled Beer", name:"SM Apple",                  price:80,  stock:24, status:"Available" },
  { id:"D14", category:"Bottled Beer", name:"RH Stallion",               price:80,  stock:24, status:"Available" },
  { id:"D15", category:"Bottled Beer", name:"Soju",                      price:150, stock:20, status:"Available" },
  // ---- Soft Drinks ----
  { id:"D16", category:"Soft Drinks",  name:"Coca Cola",                 price:25,  stock:40, status:"Available" },
  { id:"D17", category:"Soft Drinks",  name:"RC Cola",                   price:20,  stock:40, status:"Available" },
  { id:"D18", category:"Soft Drinks",  name:"Refresh Water",             price:15,  stock:40, status:"Available" },
  { id:"D19", category:"Soft Drinks",  name:"Mountain Dew",              price:25,  stock:40, status:"Available" },
  { id:"D20", category:"Soft Drinks",  name:"Sprite",                    price:25,  stock:40, status:"Available" },
  { id:"D21", category:"Soft Drinks",  name:"1.5L Coke",                 price:100, stock:20, status:"Available" },
];
let nextDrinkId = 22;

let drinkOnlyOrders = [];    // {id, drinks:[{drinkId,name,qty,price}], createdAt}
let nextDrinkOnlyId = 1;

let transactions = [];       // full transaction records
let nextTransId = 1;

let dashboardInterval = null;

/* ======================================================
   HELPERS: time & duration
====================================================== */
function pad2(n){ return String(n).padStart(2,"0"); }
function fmtHMS(ms){
  const s = Math.max(0, Math.floor(ms/1000));
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}
function fmtClock(date){ return date.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}); }
function fmtDateTime(date){ return date.toLocaleString(); }
function minutesToHM(mins){
  const h = Math.floor(mins/60), m = mins%60;
  const parts = [];
  if (h) parts.push(h + " hour" + (h>1?"s":""));
  if (m) parts.push(m + " minute" + (m>1?"s":""));
  return parts.length ? parts.join(" ") : "0 minutes";
}
function timeToMinutes(t){ const [h,m] = t.split(":").map(Number); return h*60+m; }
function overlaps(aS,aE,bS,bE){ return aS < bE && bS < aE; }
function computeEndTimeStr(dateStr, timeStr, minutes){
  const start = new Date(`${dateStr}T${timeStr}`);
  const end = new Date(start.getTime() + minutes*60000);
  return pad2(end.getHours()) + ":" + pad2(end.getMinutes());
}
function computePrice(type, minutes){ return Math.round((minutes/60) * RATE[type]); }

function parseDurationInput(text){
  text = text.trim().toLowerCase();
  if (!text) return null;
  let total = 0, matched = false;
  const hourMatch = text.match(/(\d+(\.\d+)?)\s*h/);
  const minMatch = text.match(/(\d+)\s*m/);
  if (hourMatch) { total += parseFloat(hourMatch[1]) * 60; matched = true; }
  if (minMatch)  { total += parseInt(minMatch[1]); matched = true; }
  if (!matched) {
    const n = parseFloat(text);
    if (!isNaN(n)) { total = n; matched = true; }
  }
  return matched && total > 0 ? Math.round(total) : null;
}
function getFlexibleDuration(selectId, manualId){
  const manual = document.getElementById(manualId).value.trim();
  if (manual) {
    const parsed = parseDurationInput(manual);
    if (parsed) return parsed;
  }
  return parseInt(document.getElementById(selectId).value);
}

/* ======================================================
   STAFF LOGIN / AUTHENTICATION — Linear Search
====================================================== */
function linearSearchAuthenticate(records, username, password){
  for (let i=0;i<records.length;i++) if (records[i].username===username && records[i].password===password) return records[i];
  return null;
}
function findAccountIndexByUsername(username){
  for (let i=0;i<accounts.length;i++) if (accounts[i].username===username) return i;
  return -1;
}
function handleLogin(){
  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  const match = linearSearchAuthenticate(accounts, username, password);
  if (match){
    loggedInUser = match;
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("app").style.display = "flex";
    document.getElementById("whoText").textContent = `${loggedInUser.name} (${loggedInUser.role})`;
    document.querySelectorAll(".adminOnly").forEach(el => el.style.display = loggedInUser.role==="Admin" ? "block" : "none");
    document.getElementById("resDate").value = new Date().toISOString().split("T")[0];
    populateFacilitySelect("resFacilitySelect", "Billiard");
    populateAllSelects();
    renderAll();
    showTab("dashboard");
    if (dashboardInterval) clearInterval(dashboardInterval);
    dashboardInterval = setInterval(renderDashboard, 1000);
  } else {
    showMsg("msgLogin", "Access Denied: Invalid username or password.", "error");
  }
}
function handleLogout(){
  loggedInUser = null;
  if (dashboardInterval) clearInterval(dashboardInterval);
  document.getElementById("loginUsername").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("app").style.display = "none";
  document.getElementById("loginScreen").style.display = "flex";
  showMsg("msgLogin", "Logged out.", "warn");
}
function requireAdmin(){ return loggedInUser && loggedInUser.role==="Admin"; }

function handleCreateStaff(){
  if (!requireAdmin()) return;
  const name = document.getElementById("newStaffName").value.trim();
  const username = document.getElementById("newStaffUsername").value.trim();
  const password = document.getElementById("newStaffPassword").value.trim();
  if (!name || !username || !password){ showMsg("staffMsg","Fill in all fields.","warn"); return; }
  if (findAccountIndexByUsername(username) !== -1){ showMsg("staffMsg", `Username "${username}" already exists.`,"warn"); return; }
  accounts.push({ staffId:`S${String(nextStaffId).padStart(3,"0")}`, username, password, name, role:"Staff" });
  nextStaffId++;
  document.getElementById("newStaffName").value = "";
  document.getElementById("newStaffUsername").value = "";
  document.getElementById("newStaffPassword").value = "";
  showMsg("staffMsg", `Staff account created: ${name}`, "success");
  renderStaff();
}
function handleDeleteStaff(username){
  if (!requireAdmin()) return;
  const idx = findAccountIndexByUsername(username);
  if (idx===-1) return;
  if (accounts[idx].role==="Admin"){ showMsg("staffMsg","Cannot delete Admin.","error"); return; }
  const removed = accounts.splice(idx,1)[0];
  showMsg("staffMsg", `Deleted: ${removed.name}`, "warn");
  renderStaff();
}
function renderStaff(){
  const tbody = document.getElementById("staffBody"); tbody.innerHTML = "";
  accounts.forEach(acc => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${acc.staffId}</td><td>${acc.username}</td><td>${acc.name}</td><td>${acc.role}</td>
      <td>${acc.role!=="Admin" ? `<button class="small danger" onclick="handleDeleteStaff('${acc.username}')">Delete</button>` : "protected"}</td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   FACILITY STATUS (computed, not stored)
====================================================== */
function getFacilityStatus(facilityId){
  if (sessions[facilityId]) return sessions[facilityId].actualEnd ? "Ended - Awaiting Payment" : "Occupied";
  const f = facilities.find(x => x.id===facilityId);
  if (f && f.manualStatus) return f.manualStatus; // e.g. Cleaning/Unavailable
  const now = new Date();
  const upcoming = reservations.find(r => r.facilityId===facilityId && r.status==="Reserved" &&
    new Date(`${r.date}T${r.scheduledStart}`) - now < 2*60*60*1000 && new Date(`${r.date}T${r.scheduledStart}`) - now > -30*60000);
  if (upcoming) return "Reserved";
  return "Available";
}
function toggleCleaning(facilityId){
  if (!requireAdmin()) return;
  const f = facilities.find(x => x.id===facilityId);
  if (!f) return;
  f.manualStatus = f.manualStatus ? null : "Cleaning/Unavailable";
  renderDashboard();
}

/* ======================================================
   LIVE DASHBOARD (Requirements 11, 13-17)
====================================================== */
function getTotalMinutes(session){
  return session.bookedDurationMinutes + session.extensions.reduce((s,e)=>s+e.minutes,0);
}
function getExtensionTotal(session){ return session.extensions.reduce((s,e)=>s+e.price,0); }

/* ---- Extension proration: if a customer extends but leaves before using the
   full extension, only the actual extension minutes consumed are charged. ---- */
function getProratedExtensionBilling(session, totalPlayingMinutes){
  const ratePerMinute = RATE[session.facilityType] / 60;
  let remainingUsed = Math.max(0, totalPlayingMinutes - session.bookedDurationMinutes);
  const items = [];
  let totalExtensionCost = 0;
  session.extensions.forEach(e => {
    const usedMinutes = Math.min(e.minutes, remainingUsed);
    remainingUsed -= usedMinutes;
    const chargedPrice = Math.round(usedMinutes * ratePerMinute);
    items.push({
      minutes: e.minutes,        // originally requested extension length
      fullPrice: e.price,        // what it would cost if fully used
      usedMinutes,                // minutes actually consumed within this extension
      price: chargedPrice,       // prorated amount actually charged
      prorated: usedMinutes < e.minutes,
    });
    totalExtensionCost += chargedPrice;
  });
  return { items, totalExtensionCost };
}

function getSessionFeeTotal(session, totalPlayingMinutesOverride){
  let totalPlayingMinutes = totalPlayingMinutesOverride;
  if (totalPlayingMinutes == null){
    const now = new Date();
    const elapsedMs = (session.actualEnd || now) - session.actualStart;
    totalPlayingMinutes = Math.max(0, Math.round(elapsedMs/60000));
  }
  const { totalExtensionCost } = getProratedExtensionBilling(session, totalPlayingMinutes);
  return session.baseSessionPrice + totalExtensionCost;
}

function renderDashboard(){
  const grid = document.getElementById("dashboardGrid");
  if (!grid) return;
  grid.innerHTML = "";
  facilities.forEach(f => {
    const session = sessions[f.id];
    const status = getFacilityStatus(f.id);
    const div = document.createElement("div");
    let cls = "available";
    if (status==="Occupied" || status==="Ended - Awaiting Payment") cls = "occupied";
    else if (status==="Reserved") cls = "reserved";
    div.className = "dashCard " + cls;

    if (session){
      const now = new Date();
      const elapsedMs = (session.actualEnd || now) - session.actualStart;
      const totalMin = getTotalMinutes(session);
      const remainingMs = totalMin*60000 - elapsedMs;
      const expired = remainingMs <= 0;
      let timerClass = "timerBig";
      let warnText = "";
      if (!session.actualEnd){
        if (expired){ timerClass += " dangerT"; warnText = "Time expired"; }
        else if (remainingMs <= 5*60000){ timerClass += " dangerT"; warnText = "5 minutes remaining"; }
        else if (remainingMs <= 15*60000){ timerClass += " warnT"; warnText = "15 minutes remaining"; }
      }
      const expectedEnd = new Date(session.actualStart.getTime() + totalMin*60000);
      div.innerHTML = `
        <b>${f.name}</b> <span class="badge occupied">${status}</span><br>
        <span class="small-note">Customer: ${session.customerName}</span><br>
        <div class="timerBig ${timerClass.replace('timerBig','').trim()}">${fmtHMS(elapsedMs)}</div>
        <span class="small-note">Elapsed / Booked: ${minutesToHM(totalMin)} | Remaining: ${expired ? "00:00:00" : fmtHMS(remainingMs)}</span><br>
        <span class="small-note">Start: ${fmtClock(session.actualStart)} | Expected End: ${fmtClock(expectedEnd)}</span><br>
        <span class="small-note">Current Charge: ₱${getSessionFeeTotal(session)}</span><br>
        ${warnText ? `<div class="msg warn">${warnText}</div>` : ""}
        <div class="row" style="margin-top:8px;">
          <button class="small secondary" onclick="handleExtendSession('${f.id}',30)">+30min</button>
          <button class="small secondary" onclick="handleExtendSession('${f.id}',60)">+1hr</button>
          <button class="small danger" onclick="handleEndSession('${f.id}')">End Session</button>
        </div>`;
    } else {
      div.innerHTML = `
        <b>${f.name}</b> <span class="badge ${status==='Available'?'free':(status==='Reserved'?'reserved':'occupied')}">${status}</span><br>
        <span class="small-note">${f.type} — ₱${RATE[f.type]}/hr</span><br>
        <div class="row" style="margin-top:8px;">
          <button class="small secondary" onclick="toggleCleaning('${f.id}')">${f.manualStatus ? "Mark Available" : "Mark Cleaning/Unavailable"}</button>
        </div>`;
    }
    grid.appendChild(div);
  });
}

/* ======================================================
   RESERVATIONS (Requirement 4)
====================================================== */
function populateFacilitySelect(selectId, type){
  const sel = document.getElementById(selectId);
  sel.innerHTML = "";
  facilities.filter(f => f.type===type).forEach(f => {
    const opt = document.createElement("option");
    opt.value = f.id; opt.textContent = f.name;
    sel.appendChild(opt);
  });
}
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("resFacilityType").addEventListener("change", () => populateFacilitySelect("resFacilitySelect", document.getElementById("resFacilityType").value));
});

function reservationConflict(facilityId, date, startTime, endTime, excludeId){
  const newS = timeToMinutes(startTime), newE = timeToMinutes(endTime);
  return reservations.find(r => r.id!==excludeId && r.facilityId===facilityId && r.date===date &&
    (r.status==="Reserved" || r.status==="Started") &&
    overlaps(newS,newE, timeToMinutes(r.scheduledStart), timeToMinutes(r.scheduledEnd)));
}

function handleCreateReservation(){
  const customer = document.getElementById("resCustomer").value.trim();
  const contact = document.getElementById("resContact").value.trim();
  const facilityType = document.getElementById("resFacilityType").value;
  const facilityId = document.getElementById("resFacilitySelect").value;
  const date = document.getElementById("resDate").value;
  const startTime = document.getElementById("resStartTime").value;
  const duration = getFlexibleDuration("resDurationSelect","resDurationManual");

  if (!customer || !facilityId || !date || !startTime || !duration){
    showMsg("resMsg","Fill in customer name, date, start time, and duration.","warn"); return;
  }
  const facility = facilities.find(f => f.id===facilityId);
  const endTime = computeEndTimeStr(date, startTime, duration);

  const conflict = reservationConflict(facilityId, date, startTime, endTime, null);
  if (conflict){
    showMsg("resMsg", `Time slot conflicts with existing reservation ${conflict.id} for ${facility.name} (${conflict.scheduledStart}-${conflict.scheduledEnd}).`, "error");
    return;
  }

  const price = computePrice(facilityType, duration);
  const res = {
    id:`RES${String(nextResId).padStart(3,"0")}`, customerName:customer, contact,
    facilityId, facilityName:facility.name, facilityType,
    date, scheduledStart:startTime, scheduledEnd:endTime, durationMinutes:duration,
    price, status:"Reserved", actualStart:null,
  };
  nextResId++;
  reservations.push(res);

  document.getElementById("resCustomer").value = "";
  document.getElementById("resContact").value = "";
  document.getElementById("resDurationManual").value = "";
  showMsg("resMsg", `${res.id}: ${facility.name} reserved for ${customer} — ${date} ${startTime}-${endTime} (${minutesToHM(duration)}) = ₱${price}`, "success");
  renderReservations(); renderDashboard(); populateAllSelects();
}

function handleStartReservationEarly(resId){
  const res = reservations.find(r => r.id===resId);
  if (!res || res.status!=="Reserved") return;
  if (sessions[res.facilityId]){
    showMsg("resMsg", `Cannot start — ${res.facilityName} is currently occupied.`, "error"); return;
  }
  const actualStart = new Date();
  sessions[res.facilityId] = {
    sourceType:"Reservation", sourceId:res.id,
    customerName:res.customerName, facilityId:res.facilityId, facilityName:res.facilityName, facilityType:res.facilityType,
    scheduledStart:res.scheduledStart, scheduledEnd:res.scheduledEnd,
    actualStart, actualEnd:null,
    bookedDurationMinutes:res.durationMinutes, baseSessionPrice:res.price,
    extensions:[], drinks:[],
  };
  res.status = "Started"; res.actualStart = actualStart;
  showMsg("resMsg", `Session started early for ${res.customerName} on ${res.facilityName} at ${fmtClock(actualStart)}.`, "success");
  renderReservations(); renderDashboard(); populateAllSelects();
}

function handleCancelReservation(resId){
  const res = reservations.find(r => r.id===resId);
  if (!res) return;
  res.status = "Cancelled";
  showMsg("resMsg", `${res.id} cancelled.`, "warn");
  renderReservations(); renderDashboard();
}

function linearSearchReservation(query){
  const q = query.trim().toLowerCase();
  for (let i=0;i<reservations.length;i++)
    if (reservations[i].customerName.toLowerCase().includes(q) || reservations[i].id.toLowerCase()===q) return reservations[i];
  return null;
}
function handleReservationSearch(){
  const query = document.getElementById("resSearchInput").value;
  if (!query.trim()){ showMsg("resSearchMsg","Enter a name or reservation ID.","warn"); return; }
  const found = linearSearchReservation(query);
  if (found) showMsg("resSearchMsg", `${found.id} - ${found.customerName}, ${found.facilityName}, ${found.date} ${found.scheduledStart}, ${minutesToHM(found.durationMinutes)}, ₱${found.price}, Status: ${found.status}`, "success");
  else showMsg("resSearchMsg", "No matching reservation found.", "error");
}

function renderReservations(){
  const tbody = document.getElementById("reservationsBody"); tbody.innerHTML = "";
  reservations.filter(r => r.status==="Reserved" || r.status==="Started").forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.id}</td><td>${r.customerName}</td><td>${r.facilityName}</td><td>${r.date}</td>
      <td>${r.scheduledStart}</td><td>${r.scheduledEnd}</td><td>${minutesToHM(r.durationMinutes)}</td><td>₱${r.price}</td>
      <td><span class="badge ${r.status==='Started'?'occupied':'reserved'}">${r.status}</span></td>
      <td>
        ${r.status==="Reserved" ? `<button class="small" onclick="handleStartReservationEarly('${r.id}')">Start Session</button>` : ""}
        <button class="small danger" onclick="handleCancelReservation('${r.id}')">Cancel</button>
      </td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   WALK-IN QUEUE (Requirement 5)
====================================================== */
function handleAddWalkIn(){
  const customer = document.getElementById("wiCustomer").value.trim();
  const facilityType = document.getElementById("wiFacilityType").value;
  const duration = getFlexibleDuration("wiDurationSelect","wiDurationManual");
  if (!customer || !duration){ showMsg("wiMsg","Enter customer name and duration.","warn"); return; }

  const walkIn = { id:`WI${String(nextWalkInId).padStart(3,"0")}`, customerName:customer, facilityType,
    durationMinutes:duration, timeAdded:new Date(), status:"Waiting", queueNumber:nextQueueNumber++, assignedFacilityId:null };
  nextWalkInId++;
  walkIns.push(walkIn);
  document.getElementById("wiCustomer").value = "";
  document.getElementById("wiDurationManual").value = "";
  showMsg("wiMsg", `${customer} added to queue (#${walkIn.queueNumber}) — wants ${facilityType}, ${minutesToHM(duration)}.`, "success");
  renderWalkIns();
}

function handleStartWalkIn(walkInId){
  const wi = walkIns.find(w => w.id===walkInId);
  if (!wi || wi.status!=="Waiting") return;
  const freeFacility = facilities.find(f => f.type===wi.facilityType && !sessions[f.id] && !f.manualStatus);
  if (!freeFacility){
    showMsg("wiMsg", `No available ${wi.facilityType} facility yet. ${wi.customerName} stays in queue.`, "warn"); return;
  }
  const actualStart = new Date();
  sessions[freeFacility.id] = {
    sourceType:"Walk-In", sourceId:wi.id,
    customerName:wi.customerName, facilityId:freeFacility.id, facilityName:freeFacility.name, facilityType:wi.facilityType,
    scheduledStart:null, scheduledEnd:null,
    actualStart, actualEnd:null,
    bookedDurationMinutes:wi.durationMinutes, baseSessionPrice:computePrice(wi.facilityType, wi.durationMinutes),
    extensions:[], drinks:[],
  };
  wi.status = "Playing"; wi.assignedFacilityId = freeFacility.id;
  showMsg("wiMsg", `${wi.customerName} started on ${freeFacility.name} at ${fmtClock(actualStart)}.`, "success");
  renderWalkIns(); renderDashboard(); populateAllSelects();
}

function handleCancelWalkIn(walkInId){
  const wi = walkIns.find(w => w.id===walkInId);
  if (!wi) return;
  wi.status = "Cancelled";
  showMsg("wiMsg", `${wi.customerName}'s queue entry cancelled.`, "warn");
  renderWalkIns();
}

function renderWalkIns(){
  const tbody = document.getElementById("walkinBody"); tbody.innerHTML = "";
  walkIns.filter(w => w.status==="Waiting" || w.status==="Playing").forEach(w => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>#${w.queueNumber}</td><td>${w.customerName}</td><td>${w.facilityType}</td><td>${minutesToHM(w.durationMinutes)}</td>
      <td>${fmtClock(w.timeAdded)}</td>
      <td><span class="badge ${w.status==='Playing'?'occupied':'reserved'}">${w.status}</span></td>
      <td>
        ${w.status==="Waiting" ? `<button class="small" onclick="handleStartWalkIn('${w.id}')">Start Session</button><button class="small danger" onclick="handleCancelWalkIn('${w.id}')">Cancel</button>` : ""}
      </td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   SESSION EXTEND / END (Requirements 7, 14, 15, 21)
====================================================== */
function handleExtendSession(facilityId, minutes){
  const session = sessions[facilityId];
  if (!session || session.actualEnd) return;
  const currentEnd = new Date(session.actualStart.getTime() + getTotalMinutes(session)*60000);
  const newEnd = new Date(currentEnd.getTime() + minutes*60000);

  const conflict = reservations.find(r => r.facilityId===facilityId && r.status==="Reserved" &&
    new Date(`${r.date}T${r.scheduledStart}`) > session.actualStart && new Date(`${r.date}T${r.scheduledStart}`) < newEnd);
  if (conflict){
    alert("Cannot extend session because the table/KTV room is already reserved for another customer.");
    return;
  }
  const price = computePrice(session.facilityType, minutes);
  session.extensions.push({ minutes, price });
  renderDashboard();
}

function handleEndSession(facilityId){
  const session = sessions[facilityId];
  if (!session) return;
  session.actualEnd = new Date();
  renderDashboard(); populateAllSelects();
  showTab("billing");
  document.getElementById("billTarget").value = "session:" + facilityId;
  renderBillPreview();
}

/* ======================================================
   DRINKS & INVENTORY (Requirements 1, 6)
====================================================== */
function syncDrinkStatus(drink){ drink.status = drink.stock > 0 ? "Available" : "Out of Stock"; }

function populateCategorySelects(){
  ["newDrinkCategory","editDrinkCategory"].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value; sel.innerHTML = "";
    DRINK_CATEGORIES.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat; opt.textContent = cat;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
  });
}

function handleAddDrink(){
  const name = document.getElementById("newDrinkName").value.trim();
  const category = document.getElementById("newDrinkCategory").value || "Other";
  const stock = parseInt(document.getElementById("newDrinkStock").value);
  const price = parseFloat(document.getElementById("newDrinkPrice").value);
  if (!name || isNaN(stock) || isNaN(price) || stock<0 || price<0){ showMsg("addDrinkMsg","Enter valid name, stock, price.","warn"); return; }
  const drink = { id:`D${nextDrinkId}`, category, name, price, stock, status: stock>0 ? "Available" : "Out of Stock" };
  nextDrinkId++;
  drinks.push(drink);
  document.getElementById("newDrinkName").value = "";
  document.getElementById("newDrinkStock").value = "10";
  document.getElementById("newDrinkPrice").value = "50";
  showMsg("addDrinkMsg", `Added new drink: ${name} (${category}) — ₱${price} (Stock: ${stock})`, "success");
  renderInventory(); populateAllSelects();
}

function handleRestock(){
  const id = document.getElementById("restockDrinkSelect").value;
  const qty = parseInt(document.getElementById("restockQty").value);
  const drink = drinks.find(d => d.id===id);
  if (!drink || isNaN(qty) || qty<=0){ showMsg("restockMsg","Select a drink and valid quantity.","warn"); return; }
  drink.stock += qty; syncDrinkStatus(drink);
  showMsg("restockMsg", `Restocked ${drink.name} +${qty} (now ${drink.stock})`, "success");
  renderInventory(); populateAllSelects();
}

function loadDrinkForEdit(){
  const id = document.getElementById("editDrinkSelect").value;
  const drink = drinks.find(d => d.id===id);
  if (!drink) return;
  document.getElementById("editDrinkName").value = drink.name;
  document.getElementById("editDrinkCategory").value = drink.category || "Other";
  document.getElementById("editDrinkPrice").value = drink.price;
  document.getElementById("editDrinkStock").value = drink.stock;
}
function handleEditDrink(){
  const id = document.getElementById("editDrinkSelect").value;
  const drink = drinks.find(d => d.id===id);
  if (!drink){ showMsg("editDrinkMsg","Select a drink to edit.","warn"); return; }
  const name = document.getElementById("editDrinkName").value.trim();
  const category = document.getElementById("editDrinkCategory").value || "Other";
  const price = parseFloat(document.getElementById("editDrinkPrice").value);
  const stock = parseInt(document.getElementById("editDrinkStock").value);
  if (!name || isNaN(price) || isNaN(stock) || price<0 || stock<0){ showMsg("editDrinkMsg","Enter valid values.","warn"); return; }
  drink.name = name; drink.category = category; drink.price = price; drink.stock = stock; syncDrinkStatus(drink);
  showMsg("editDrinkMsg", `Updated ${drink.name}.`, "success");
  renderInventory(); populateAllSelects();
}
function handleDeleteDrink(){
  const id = document.getElementById("editDrinkSelect").value;
  const idx = drinks.findIndex(d => d.id===id);
  if (idx===-1){ showMsg("editDrinkMsg","Select a drink to delete.","warn"); return; }
  const confirmDel = confirm(`Delete "${drinks[idx].name}" from the menu?`);
  if (!confirmDel) return;
  const removed = drinks.splice(idx,1)[0];
  showMsg("editDrinkMsg", `Deleted ${removed.name} from the menu.`, "warn");
  renderInventory(); populateAllSelects();
}

function populateDrinkOrderTargetSelect(){
  const sel = document.getElementById("drinkOrderTarget");
  const prev = sel.value; sel.innerHTML = "";
  const newOpt = document.createElement("option");
  newOpt.value = "new_drinkonly"; newOpt.textContent = "New Drink-Only Order";
  sel.appendChild(newOpt);
  Object.values(sessions).forEach(s => {
    const opt = document.createElement("option");
    opt.value = "session:" + s.facilityId;
    opt.textContent = `${s.facilityName} — ${s.customerName}`;
    sel.appendChild(opt);
  });
  drinkOnlyOrders.forEach(o => {
    const opt = document.createElement("option");
    opt.value = "do:" + o.id;
    opt.textContent = `Drink-Only Order ${o.id} (${o.drinks.length} items)`;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
}
function populateDrinkSelect(){
  ["drinkSelect","restockDrinkSelect","editDrinkSelect"].forEach(id => {
    const sel = document.getElementById(id);
    const prev = sel.value; sel.innerHTML = "";
    const list = id==="drinkSelect" ? drinks.filter(d => d.status==="Available" && d.stock>0) : drinks;
    list.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = id==="drinkSelect" ? `${d.name} (₱${d.price}) — Stock: ${d.stock}` : `${d.name} (Stock: ${d.stock})`;
      sel.appendChild(opt);
    });
    if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
  });
}

function handleDrinkOrder(){
  const targetRaw = document.getElementById("drinkOrderTarget").value;
  const drinkId = document.getElementById("drinkSelect").value;
  const qty = parseInt(document.getElementById("drinkQty").value) || 1;
  const drink = drinks.find(d => d.id===drinkId);
  if (!drink){ showMsg("drinkOrderMsg","Select a drink.","warn"); return; }
  if (drink.status==="Out of Stock" || drink.stock < qty){ showMsg("drinkOrderMsg", `Not enough stock for ${drink.name}. Only ${drink.stock} left.`, "error"); return; }

  drink.stock -= qty; syncDrinkStatus(drink);
  const line = { drinkId: drink.id, name: drink.name, qty, price: drink.price };

  if (targetRaw === "new_drinkonly"){
    const order = { id:`DO${String(nextDrinkOnlyId).padStart(3,"0")}`, drinks:[line], createdAt:new Date() };
    nextDrinkOnlyId++;
    drinkOnlyOrders.push(order);
    showMsg("drinkOrderMsg", `New Drink-Only Order ${order.id} created: ${qty}x ${drink.name}`, "success");
  } else if (targetRaw.startsWith("do:")){
    const order = drinkOnlyOrders.find(o => o.id === targetRaw.slice(3));
    if (order){ order.drinks.push(line); showMsg("drinkOrderMsg", `Added ${qty}x ${drink.name} to ${order.id}`, "success"); }
  } else if (targetRaw.startsWith("session:")){
    const session = sessions[targetRaw.slice(8)];
    if (session){ session.drinks.push(line); showMsg("drinkOrderMsg", `Added ${qty}x ${drink.name} to ${session.facilityName} (${session.customerName})`, "success"); }
  }
  renderInventory(); populateAllSelects();
}

function linearSearchDrink(query){
  const q = query.trim().toLowerCase();
  for (let i=0;i<drinks.length;i++) if (drinks[i].name.toLowerCase().includes(q)) return drinks[i];
  return null;
}
function getFilteredDrinks(term){
  const q = (term||"").trim().toLowerCase();
  if (!q) return drinks;
  return drinks.filter(d => d.name.toLowerCase().includes(q) || (d.category||"").toLowerCase().includes(q));
}
function handleDrinkSearch(){
  const query = document.getElementById("drinkSearchInput").value;
  renderInventory();
  if (!query.trim()){ showMsg("drinkSearchMsg", `Showing all ${drinks.length} drinks.`, "success"); return; }
  const results = getFilteredDrinks(query);
  if (results.length) showMsg("drinkSearchMsg", `Found ${results.length} matching drink(s).`, "success");
  else showMsg("drinkSearchMsg", "No drinks match your search.", "error");
}

function renderInventory(){
  const term = document.getElementById("drinkSearchInput") ? document.getElementById("drinkSearchInput").value : "";
  const list = getFilteredDrinks(term).slice().sort((a,b) =>
    (a.category||"Other").localeCompare(b.category||"Other") || a.name.localeCompare(b.name));
  const tbody = document.getElementById("inventoryBody"); tbody.innerHTML = "";
  if (!list.length){
    tbody.innerHTML = `<tr><td colspan="5" class="small-note" style="text-align:center;">No drinks found.</td></tr>`;
    return;
  }
  let lastCategory = null;
  list.forEach(d => {
    const category = d.category || "Other";
    if (category !== lastCategory){
      lastCategory = category;
      const note = CATEGORY_NOTES[category];
      const catRow = document.createElement("tr");
      catRow.innerHTML = `<td colspan="5" class="categoryRow">${category}${note ? " — " + note : ""}</td>`;
      tbody.appendChild(catRow);
    }
    const isLow = d.stock > 0 && d.stock <= 5;
    const badgeClass = d.status==="Out of Stock" ? "occupied" : (isLow ? "low" : "free");
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${category}</td><td>${d.name}</td><td>₱${d.price}</td><td>${d.stock}</td>
      <td><span class="badge ${badgeClass}">${d.status==="Out of Stock" ? "Out of Stock" : (isLow ? "Low Stock" : "Available")}</span></td>`;
    tbody.appendChild(tr);
  });
}

/* ======================================================
   BILLING (Requirements 8, 9)
====================================================== */
function populateBillTargetSelect(){
  const sel = document.getElementById("billTarget");
  const prev = sel.value; sel.innerHTML = "";
  Object.values(sessions).forEach(s => {
    const opt = document.createElement("option");
    opt.value = "session:" + s.facilityId;
    opt.textContent = `${s.facilityName} — ${s.customerName}${s.actualEnd ? " (Ended)" : ""}`;
    sel.appendChild(opt);
  });
  drinkOnlyOrders.forEach(o => {
    const opt = document.createElement("option");
    opt.value = "do:" + o.id;
    opt.textContent = `Drink-Only Order ${o.id}`;
    sel.appendChild(opt);
  });
  if ([...sel.options].some(o => o.value===prev)) sel.value = prev;
  renderBillPreview();
}

function computeBillData(targetRaw){
  if (targetRaw && targetRaw.startsWith("session:")){
    const facilityId = targetRaw.slice(8);
    const session = sessions[facilityId];
    if (!session) return null;
    const end = session.actualEnd || new Date();
    const totalPlayingMinutes = Math.max(1, Math.round((end - session.actualStart)/60000));
    const drinksCost = session.drinks.reduce((s,d)=>s+d.price*d.qty,0);
    const extensionBilling = getProratedExtensionBilling(session, totalPlayingMinutes);
    const sessionFee = session.baseSessionPrice + extensionBilling.totalExtensionCost;
    return {
      type:"session", session, facilityName:session.facilityName, customerName:session.customerName,
      actualStart:session.actualStart, actualEnd:end, scheduledStart:session.scheduledStart, scheduledEnd:session.scheduledEnd,
      bookedMinutes:session.bookedDurationMinutes, extensions:extensionBilling.items, totalPlayingMinutes,
      sessionFee, drinks:session.drinks, drinksCost, grandTotal: sessionFee+drinksCost,
      transType: session.sourceType || "Walk-In",
    };
  } else if (targetRaw && targetRaw.startsWith("do:")){
    const order = drinkOnlyOrders.find(o => o.id===targetRaw.slice(3));
    if (!order) return null;
    const drinksCost = order.drinks.reduce((s,d)=>s+d.price*d.qty,0);
    return { type:"drinkonly", order, facilityName:null, customerName:"Walk-in Customer",
      actualStart:order.createdAt, actualEnd:new Date(), drinks:order.drinks, drinksCost,
      sessionFee:0, grandTotal:drinksCost, transType:"Drink Only" };
  }
  return null;
}

function renderBillPreview(){
  const targetRaw = document.getElementById("billTarget").value;
  const data = computeBillData(targetRaw);
  const div = document.getElementById("billPreview");
  if (!data){ div.innerHTML = "<p class='small-note'>No active session or order selected.</p>"; return; }

  let html = `<div class="card">`;
  if (data.type==="session"){
    html += `<h3 style="margin-top:0;">${data.facilityName} — ${data.customerName}</h3>
      <p class="small-note">Start: ${fmtClock(data.actualStart)} ${data.actualEnd ? "| End: " + fmtClock(data.actualEnd) : "(ongoing)"}</p>
      <p class="small-note">Total Playing Time: ${minutesToHM(data.totalPlayingMinutes)}</p>
      <p>Base (${minutesToHM(data.bookedMinutes)}): ₱${data.session.baseSessionPrice}</p>`;
    data.extensions.forEach(e => {
      const label = e.prorated
        ? `Extension (${minutesToHM(e.minutes)} requested, ${minutesToHM(e.usedMinutes)} used — prorated)`
        : `Extension (${minutesToHM(e.minutes)})`;
      html += `<p>${label}: ₱${e.price}</p>`;
    });
  } else {
    html += `<h3 style="margin-top:0;">Drink-Only Order ${data.order.id}</h3>`;
  }
  if (data.drinks.length){
    html += `<hr><p><b>Drinks:</b></p>`;
    data.drinks.forEach(d => html += `<p>${d.qty}x ${d.name} — ₱${d.price*d.qty}</p>`);
  }
  html += `<hr><p><b>GRAND TOTAL: ₱${data.grandTotal}</b></p></div>`;
  div.innerHTML = html;
}

function handleCompletePayment(){
  const targetRaw = document.getElementById("billTarget").value;
  const data = computeBillData(targetRaw);
  if (!data){ showMsg("billMsg","No active session or order selected.","warn"); return; }

  const paymentMethod = document.getElementById("paymentMethod").value;
  const amountPaid = parseFloat(document.getElementById("amountPaid").value) || 0;
  const change = amountPaid - data.grandTotal;
  if (paymentMethod==="Cash" && amountPaid < data.grandTotal){
    showMsg("billMsg", `Amount paid (₱${amountPaid}) is less than the total (₱${data.grandTotal}).`, "warn"); return;
  }

  const transaction = {
    id:`T${String(nextTransId).padStart(4,"0")}`, type:data.transType,
    customerName:data.customerName, facilityName:data.facilityName,
    date:new Date().toLocaleDateString(),
    actualStart:data.actualStart, actualEnd:data.actualEnd,
    scheduledStart:data.scheduledStart||null, scheduledEnd:data.scheduledEnd||null,
    bookedMinutes:data.bookedMinutes||0,
    extensions:data.extensions||[], totalPlayingMinutes:data.totalPlayingMinutes||0,
    sessionFee:data.sessionFee, drinks:data.drinks, drinksCost:data.drinksCost,
    grandTotal:data.grandTotal, paymentMethod, amountPaid, change,
    time:new Date().toLocaleString(),
  };
  nextTransId++;
  transactions.push(transaction);

  // free up facility / clear source
  if (data.type==="session"){
    const session = data.session;
    delete sessions[session.facilityId];
    if (session.sourceType==="Reservation"){
      const res = reservations.find(r => r.id===session.sourceId);
      if (res) res.status = "Completed";
    } else if (session.sourceType==="Walk-In"){
      const wi = walkIns.find(w => w.id===session.sourceId);
      if (wi) wi.status = "Completed";
    }
  } else {
    const idx = drinkOnlyOrders.findIndex(o => o.id===data.order.id);
    if (idx!==-1) drinkOnlyOrders.splice(idx,1);
  }

  document.getElementById("amountPaid").value = "";
  showMsg("billMsg", `Payment complete (${transaction.id}). Change: ₱${change.toFixed(2)}`, "success");
  document.getElementById("receiptActions").innerHTML =
    `<button class="secondary" onclick="downloadReceiptPDF('${transaction.id}')">Download Receipt PDF</button>`;
  document.getElementById("billPreview").innerHTML = "";

  renderReservations(); renderWalkIns(); renderDashboard(); renderHistory(); populateAllSelects();
}

/* ======================================================
   PDF RECEIPT (Requirement 9)
====================================================== */
function downloadReceiptPDF(transId){
  const t = transactions.find(x => x.id===transId);
  if (!t) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"mm", format:[80, 180] });
  let y = 10;
  const line = (text, size=9, bold=false) => {
    doc.setFontSize(size);
    doc.setFont(undefined, bold ? "bold" : "normal");
    doc.text(String(text), 5, y);
    y += size/2 + 2.5;
  };
  line(BUSINESS_NAME, 12, true);
  line("Official Receipt", 9);
  line("--------------------------------", 8);
  line(`Trans #: ${t.id}`);
  line(`Date: ${t.time}`);
  line(`Customer: ${t.customerName}`);
  line(`Type: ${t.type}`);
  if (t.facilityName){
    line(`Facility: ${t.facilityName}`);
    line(`Start: ${fmtClock(t.actualStart)}  End: ${fmtClock(t.actualEnd)}`);
    line(`Total Playing Time: ${minutesToHM(t.totalPlayingMinutes)}`);
    line(`Base Charge: P${(t.sessionFee - t.extensions.reduce((s,e)=>s+e.price,0))}`);
    t.extensions.forEach(e => {
      const label = e.prorated
        ? `Extension (${minutesToHM(e.minutes)} req, ${minutesToHM(e.usedMinutes)} used)`
        : `Extension (${minutesToHM(e.minutes)})`;
      line(`${label}: P${e.price}`);
    });
  }
  if (t.drinks.length){
    line("--------------------------------", 8);
    line("Drinks:", 9, true);
    t.drinks.forEach(d => line(`${d.qty}x ${d.name} = P${d.price*d.qty}`));
  }
  line("--------------------------------", 8);
  line(`Session/Drinks Subtotal: P${t.sessionFee}`);
  line(`Drinks Total: P${t.drinksCost}`);
  line(`GRAND TOTAL: P${t.grandTotal}`, 11, true);
  line(`Payment: ${t.paymentMethod}`);
  line(`Amount Paid: P${t.amountPaid.toFixed(2)}`);
  line(`Change: P${t.change.toFixed(2)}`);
  line("--------------------------------", 8);
  line("Thank you and come again!", 9);
  doc.save(`Receipt-${t.id}.pdf`);
}

/* ======================================================
   PRINTABLE PDF TABLE REPORTS (Sales & Inventory)
====================================================== */
function exportTablePDF(title, columns, rows, filename){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:"mm", format:"a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const usableWidth = pageWidth - marginX*2;
  const colWidth = usableWidth / columns.length;
  let y = 15;

  function drawHeaderBlock(){
    doc.setFontSize(14); doc.setFont(undefined,"bold");
    doc.text(BUSINESS_NAME, marginX, y); y += 6;
    doc.setFontSize(11);
    doc.text(title, marginX, y); y += 5;
    doc.setFontSize(8.5); doc.setFont(undefined,"normal");
    doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, y); y += 4;
    doc.text(`Total records: ${rows.length}`, marginX, y); y += 6;
  }
  function drawColumnHeader(){
    doc.setFont(undefined,"bold"); doc.setFontSize(8.5);
    columns.forEach((c,i) => doc.text(String(c), marginX + i*colWidth, y));
    y += 2;
    doc.setLineWidth(0.2);
    doc.line(marginX, y, marginX+usableWidth, y);
    y += 4.5;
    doc.setFont(undefined,"normal"); doc.setFontSize(8.5);
  }

  drawHeaderBlock();
  drawColumnHeader();

  if (!rows.length){
    doc.setFont(undefined,"italic");
    doc.text("No records found.", marginX, y);
  }
  rows.forEach(row => {
    if (y > pageHeight - 15){
      doc.addPage(); y = 15; drawColumnHeader();
    }
    row.forEach((cell,i) => {
      let text = String(cell);
      const maxChars = Math.max(6, Math.floor(colWidth / 1.9));
      if (text.length > maxChars) text = text.slice(0, maxChars-1) + "…";
      doc.text(text, marginX + i*colWidth, y);
    });
    y += 5.5;
  });

  doc.save(filename);
}

function exportSalesReportPDF(){
  const searchEl = document.getElementById("historySearchInput");
  const term = searchEl ? searchEl.value : "";
  const list = getFilteredTransactions(term);
  const rows = list.map(t => [t.id, t.type, t.customerName, t.facilityName || "—", `P${t.grandTotal}`, t.paymentMethod, t.time]);
  const title = term.trim() ? `Sales Report — Transaction History (filtered: "${term.trim()}")` : "Sales Report — Transaction History (All)";
  exportTablePDF(title, ["Trans. ID","Type","Customer","Facility","Total","Payment","Time"], rows, `Sales-Report-${Date.now()}.pdf`);
}

function exportInventoryReportPDF(){
  const searchEl = document.getElementById("drinkSearchInput");
  const term = searchEl ? searchEl.value : "";
  const list = getFilteredDrinks(term).slice().sort((a,b) =>
    (a.category||"Other").localeCompare(b.category||"Other") || a.name.localeCompare(b.name));
  const rows = list.map(d => {
    const isLow = d.stock > 0 && d.stock <= 5;
    const statusLabel = d.status==="Out of Stock" ? "Out of Stock" : (isLow ? "Low Stock" : "Available");
    return [d.category || "Other", d.name, `P${d.price}`, d.stock, statusLabel];
  });
  const title = term.trim() ? `Inventory Report — Drinks & Stock (filtered: "${term.trim()}")` : "Inventory Report — Drinks & Stock (All)";
  exportTablePDF(title, ["Category","Drink","Price","Stock","Status"], rows, `Inventory-Report-${Date.now()}.pdf`);
}

/* ======================================================
   TRANSACTION HISTORY (Requirement 10) — Stack
====================================================== */
function getFilteredTransactions(term){
  const q = (term||"").trim().toLowerCase();
  let list = transactions.slice().reverse(); // most recent first (stack order)
  if (q){
    list = list.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.customerName.toLowerCase().includes(q) ||
      (t.facilityName||"").toLowerCase().includes(q) ||
      t.type.toLowerCase().includes(q) ||
      t.paymentMethod.toLowerCase().includes(q)
    );
  }
  return list;
}
function renderHistory(){
  const searchEl = document.getElementById("historySearchInput");
  const list = getFilteredTransactions(searchEl ? searchEl.value : "");
  const tbody = document.getElementById("historyBody"); tbody.innerHTML = "";
  if (!list.length){
    tbody.innerHTML = `<tr><td colspan="8" class="small-note" style="text-align:center;">No transactions found.</td></tr>`;
    return;
  }
  list.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.id}</td><td>${t.type}</td><td>${t.customerName}</td><td>${t.facilityName||"—"}</td>
      <td>₱${t.grandTotal}</td><td>${t.paymentMethod}</td><td>${t.time}</td>
      <td><button class="small secondary" onclick="viewTransaction('${t.id}')">View</button></td>`;
    tbody.appendChild(tr);
  });
}
function viewTransaction(transId){
  const t = transactions.find(x => x.id===transId);
  if (!t) return;
  let html = `<div class="card">
    <h3 style="margin-top:0;">${t.id} — ${t.customerName} (${t.type})</h3>
    <p class="small-note">Date: ${t.time}</p>`;
  if (t.facilityName){
    html += `<p>Facility: ${t.facilityName}</p>
      <p>Start: ${fmtClock(t.actualStart)} | End: ${fmtClock(t.actualEnd)}</p>
      <p>Total Playing Time: ${minutesToHM(t.totalPlayingMinutes)}</p>
      <p>Base Duration: ${minutesToHM(t.bookedMinutes)}</p>`;
    t.extensions.forEach(e => {
      const label = e.prorated
        ? `Extension: ${minutesToHM(e.minutes)} requested, ${minutesToHM(e.usedMinutes)} used (prorated — left early)`
        : `Extension: ${minutesToHM(e.minutes)}`;
      html += `<p>${label} — ₱${e.price}</p>`;
    });
    html += `<p>Session Fee: ₱${t.sessionFee}</p>`;
  }
  if (t.drinks.length){
    html += `<hr><p><b>Drinks:</b></p>`;
    t.drinks.forEach(d => html += `<p>${d.qty}x ${d.name} — ₱${d.price*d.qty}</p>`);
  }
  html += `<hr><p><b>Grand Total: ₱${t.grandTotal}</b></p>
    <p>Payment Method: ${t.paymentMethod} | Paid: ₱${t.amountPaid.toFixed(2)} | Change: ₱${t.change.toFixed(2)}</p>
    <button class="secondary" onclick="downloadReceiptPDF('${t.id}')">Reprint PDF Receipt</button>
    </div>`;
  document.getElementById("historyDetail").innerHTML = html;
}

/* ======================================================
   UI HELPERS / NAVIGATION
====================================================== */
function showMsg(elId, text, type){
  const el = document.getElementById(elId);
  el.textContent = text; el.className = "msg " + type;
}
function showTab(tab){
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  document.getElementById("tab-" + tab).classList.add("active");
  document.querySelectorAll("#sidebar button[data-tab]").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`#sidebar button[data-tab="${tab}"]`);
  if (btn) btn.classList.add("active");
  if (tab==="dashboard") renderDashboard();
  if (tab==="billing") populateBillTargetSelect();
}
function populateAllSelects(){
  populateDrinkOrderTargetSelect();
  populateDrinkSelect();
  populateCategorySelects();
  populateBillTargetSelect();
}
function renderAll(){
  renderDashboard(); renderReservations(); renderWalkIns();
  renderInventory(); renderHistory(); renderStaff();
}
document.getElementById("loginPassword").addEventListener("keyup", e => { if (e.key==="Enter") handleLogin(); });
