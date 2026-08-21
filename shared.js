/* ========================================================================
   SHARED.JS — Counting Loaves
   Loaded by BOTH the counting page (/) and the admin page (/admin).
   Contains: iOS12 compat layer, Firebase config, constants, pure helper
   functions, data hooks (useCollection/useSettingsDoc/useLogs), and small
   shared UI atoms (buttons, badges, modals, password/login gates).

   Editing rule of thumb: if a change here affects BOTH pages, edit this
   file. If it only affects the counting page, edit count.js. If it only
   affects the admin dashboard, edit admin.js.
   ======================================================================== */

const { useState, useEffect, useMemo, useRef } = React;

/* ============================ iOS 12 COMPATIBILITY LAYER ============================ */
// This app needs to render correctly on iOS 12 (Safari 12 / WebKit ~605), which is missing a
// few things the rest of this file (and Tailwind's CDN build) otherwise assumes. Everything
// below is either a no-op or an invisible fallback on modern browsers.
//
// 1. Flexbox `gap` isn't supported until Safari 14.1 / iOS 14.5 (Grid `gap` has been fine much
//    longer, which is why `@supports (gap: 1px)` can't be used to detect this - it's true on
//    iOS 12 too, just for the wrong reason). Every `flex ... gap-N` combo in this file (there
//    are ~90) would render with zero spacing without a fallback.
// 2. `position: sticky` needs the `-webkit-sticky` prefix on Safari 12 and below - confirmed by
//    Tailwind's own tracker (tailwindlabs/tailwindcss#1385), where the bare utility silently
//    failed on iOS 12.4.5 until the prefix was added.
// 3. `backdrop-filter` needs `-webkit-backdrop-filter` on Safari.
// 4. Tailwind's opacity-modifier utilities (e.g. `bg-primary-900/50`) compile to the modern CSS
//    Color 4 syntax (`rgb(r g b / a)`). Safari 12's parser doesn't recognize the space/slash
//    form and drops the whole declaration, so the intended translucent overlay is just
//    invisible. Rather than hardcoding colors (which live in this project's Tailwind config,
//    not this file), this reads the real color Tailwind resolved for the *solid* class (e.g.
//    `bg-primary-900`) off an offscreen probe element, then re-declares the translucent variants
//    with old-school `rgba()` - so it stays correct even if the theme colors change later.
// 5. `Object.fromEntries` is ES2019 and only shipped in Safari 12.2 - devices stuck on iOS
//    12.0/12.1 don't have it.
if (typeof Object.fromEntries !== 'function') {
  Object.fromEntries = function (entries) {
    const obj = {};
    for (const pair of entries) obj[pair[0]] = pair[1];
    return obj;
  };
}

(function ios12CompatFixes() {
  function supportsFlexGap() {
    try {
      const flex = document.createElement('div');
      flex.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden;';
      flex.appendChild(document.createElement('div'));
      flex.appendChild(document.createElement('div'));
      document.body.appendChild(flex);
      const supported = flex.scrollHeight === 1;
      document.body.removeChild(flex);
      return supported;
    } catch (e) { return true; } // fail open - assume modern browser
  }

  // Classic "negative outer margin + positive margin on every child" gutter trick. Reproduces
  // both row- and column-direction gaps, wrapped or not, without needing to know each
  // container's flex-direction.
  function buildGapFallbackCSS() {
    const sizes = { '1': 0.25, '1\\.5': 0.375, '2': 0.5, '3': 0.75, '4': 1, '5': 1.25 }; // Tailwind default scale: gap-N = N * 0.25rem
    let css = '';
    Object.keys(sizes).forEach(function (key) {
      const half = sizes[key] / 2;
      css += 'html.no-flexbox-gap .flex.gap-' + key + '{margin:-' + half + 'rem !important;}\n';
      css += 'html.no-flexbox-gap .flex.gap-' + key + '>*{margin:' + half + 'rem !important;}\n';
    });
    return css;
  }

  function injectCSS(css) {
    const style = document.createElement('style');
    style.setAttribute('data-ios12-compat', '');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildOpacityFallbackCSS(done) {
    const probeSpecs = [
      { cls: 'bg-primary-900', variants: [['bg-primary-900\\/50', 0.5], ['bg-primary-900\\/40', 0.4]] },
      { cls: 'bg-secondary',   variants: [['bg-secondary\\/95', 0.95]] },
      { cls: 'bg-white',       variants: [['bg-white\\/60', 0.6], ['bg-white\\/40', 0.4]] }
    ];
    const probes = probeSpecs.map(function (spec) {
      const el = document.createElement('div');
      el.className = spec.cls;
      el.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;pointer-events:none;';
      document.body.appendChild(el);
      return { el: el, spec: spec };
    });

    // Tailwind's CDN/JIT compiler generates matching CSS asynchronously (it watches the DOM via
    // MutationObserver), so poll briefly instead of assuming it's ready on the next frame.
    let attempts = 0;
    (function poll() {
      attempts++;
      const allResolved = probes.every(function (p) {
        return /rgb/.test(getComputedStyle(p.el).backgroundColor);
      });
      if (allResolved || attempts > 20) {
        let css = '';
        probes.forEach(function (p) {
          const rgb = getComputedStyle(p.el).backgroundColor; // serializes as "rgb(r, g, b)"
          const m = rgb.match(/\d+/g);
          if (m && m.length >= 3) {
            const r = m[0], g = m[1], b = m[2];
            p.spec.variants.forEach(function (v) {
              css += '.' + v[0] + '{background-color:rgba(' + r + ',' + g + ',' + b + ',' + v[1] + ') !important;}\n';
            });
          }
          p.el.parentNode.removeChild(p.el);
        });
        done(css);
      } else {
        setTimeout(poll, 100);
      }
    })();
  }

  function run() {
    let css = '.sticky{position:-webkit-sticky !important;position:sticky !important;}\n'
      + '.backdrop-blur{-webkit-backdrop-filter:blur(8px) !important;backdrop-filter:blur(8px) !important;}\n';
    if (!supportsFlexGap()) {
      document.documentElement.classList.add('no-flexbox-gap');
      css += buildGapFallbackCSS();
    }
    injectCSS(css);
    buildOpacityFallbackCSS(injectCSS);
  }

  if (document.body) run(); else document.addEventListener('DOMContentLoaded', run);
})();

/* ============================ FIREBASE CONFIGURATION ============================ */
// TODO: replace with your Firebase project's web app config.
// 1. Create a project at https://console.firebase.google.com
// 2. Enable "Cloud Firestore" (Build > Firestore Database)
// 3. Enable "Authentication" > Sign-in method > Email/Password
// 4. Add at least one admin user under Authentication > Users
// 5. Copy the config object from Project Settings > General > Your apps > SDK setup
// FUTURE MULTI-SCHOOL NOTE: if this app ever supports more than one school
// (e.g. stmarygc.countingloaves.com, otherschool.countingloaves.com), the
// cleanest approach is one Firebase project PER school, selected by
// window.location.hostname. Replace the single object below with something
// like:
//   const FIREBASE_CONFIGS = { 'stmarygc.countingloaves.com': {...}, 'otherschool.countingloaves.com': {...} };
//   const firebaseConfig = FIREBASE_CONFIGS[window.location.hostname] || FIREBASE_CONFIGS['default'];
// This keeps each school's data fully isolated with no query-level filtering
// needed. Not needed today — just noting where the change belongs.
const firebaseConfig = {
  apiKey: "AIzaSyDG_8ye42ss0VT1WgS4HjVjJxk_9t1Om_0",
  authDomain: "counting-loaves.firebaseapp.com",
  projectId: "counting-loaves",
  storageBucket: "counting-loaves.firebasestorage.app",
  messagingSenderId: "634372628765",
  appId: "1:634372628765:web:4c6c9266c19cc3e126c1f4"
};

/*
  Suggested Firestore security rules (Firebase Console > Firestore > Rules):

  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /classrooms/{id} { allow read: if true; allow write: if request.auth != null; }
      match /students/{id}   { allow read: if true; allow write: if request.auth != null; }
      match /settings/{id}   { allow read: if true; allow write: if request.auth != null; }
      match /logs/{id}       { allow read: if true; allow write: if true; }
    }
  }

  This lets any teacher device read/write daily counts without signing in, while
  classroom rosters, student rosters, and term settings can only be changed by an
  authenticated admin. Consider tightening further (e.g. Firebase App Check, or
  requiring auth on log writes too) before using this in production.

  NOTE ON CONCURRENCY: every daily log document is keyed deterministically as
  "YYYY-MM-DD__classroomId" (see logId() below) and every read uses a live
  onSnapshot listener, so two teachers (or a teacher and an admin) working at the
  same time always see each other's updates immediately and never collide on a
  document ID.
*/

const FIREBASE_NOT_CONFIGURED = firebaseConfig.apiKey === 'YOUR_API_KEY';

let db = null;
let auth = null;
if (!FIREBASE_NOT_CONFIGURED) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  auth = firebase.auth();
}

/* ============================ CONSTANTS ============================ */
const DAILY_PASSWORD = 'stmaryloaves';
const DEVICE_AUTH_STORAGE_KEY = 'countingloaves_device_auth_date';
const TERM_KEYS = ['S1','S2','Q1','Q2','Q3','Q4'];
const TERM_LABELS = { Q1: 'Quarter 1', Q2: 'Quarter 2', Q3: 'Quarter 3', Q4: 'Quarter 4', S1: 'Semester 1', S2: 'Semester 2' };
// Canonical K-8 grade order used to sort classrooms everywhere they're listed (Home Page,
// dropdowns, Analytics, Verification, etc). Index 0 = Kindergarten, 1-8 = 1st through 8th grade.
const GRADE_ORDER = ['K','1','2','3','4','5','6','7','8'];

/* ============================ HELPERS ============================ */
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function toDateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function todayStr() { return toDateStr(new Date()); }
function parseDateStr(s) { const parts = s.split('-').map(Number); return new Date(parts[0], parts[1] - 1, parts[2]); }
function addDays(d, n) { const nd = new Date(d); nd.setDate(nd.getDate() + n); return nd; }
function formatDisplayDate(dateStr) {
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}
function formatShortDate(dateStr) {
  const d = parseDateStr(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2,9); }
function classroomLabel(cls) { return cls ? (cls.grade + ' — ' + cls.teacher) : 'Unknown Classroom'; }
// Whether each stage is enabled for a classroom. Missing/undefined fields default to true (an
// older classroom doc created before this feature existed behaves exactly as before). Admins can
// flip these off per classroom under Admin -> Classrooms.
function stageEnabled(cls, stage) {
  if (!cls) return true;
  const key = stage === 'pre' ? 'enablePre' : stage === 'breakfast' ? 'enableBreakfast' : 'enableFinal';
  return cls[key] !== false;
}
// The ordered list of stages actually offered for a classroom: Breakfast Pre-Count never applies
// to Staff & Adults classrooms, nor does a separate Final Lunch Count — each staff member's own
// Hot Lunch Yes/No submission IS the definitive record for that day, so there's nothing to
// re-confirm afterward. Any stage an admin has disabled is skipped entirely for non-staff
// classrooms (not just locked) — including from the "you must submit X first" gating for the
// stages that remain.
function activeStages(cls) {
  const isStaff = !!(cls && cls.type === 'staff');
  const stages = [];
  if (stageEnabled(cls, 'pre')) stages.push('pre');
  if (!isStaff && stageEnabled(cls, 'breakfast')) stages.push('breakfast');
  if (!isStaff && stageEnabled(cls, 'final')) stages.push('final');
  return stages;
}
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthNameOf(m) { return MONTH_NAMES[m - 1] || ''; }
function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
// Maps a classroom's free-text "grade" value to an Elementary / Middle School / High School
// band using the admin-configured settings.gradeBands map (Admin -> Grade Bands). Any grade
// that hasn't been explicitly assigned yet defaults to "elementary" so nothing silently drops
// out of the monthly report.
function bandForGrade(settings, grade) {
  const bands = (settings && settings.gradeBands) || {};
  return bands[grade] || 'elementary';
}
const LUNCH_STATUS_LABELS = { paid: 'Paid', reduced: 'Reduced', free: 'Free' };
function lunchStatusLabel(status) { return LUNCH_STATUS_LABELS[status] || 'Paid'; }
function logId(dateStr, classroomId) { return dateStr + '__' + classroomId; }
function studentName(s) { return s ? (s.firstName + ' ' + s.lastName) : ''; }
function studentNumberOf(s) { return (s && s.number != null) ? s.number : 0; }
function sortStudents(list, sortBy) {
  const arr = (list || []).slice();
  if (sortBy === 'first') arr.sort((a,b) => a.firstName.localeCompare(b.firstName) || a.lastName.localeCompare(b.lastName));
  else if (sortBy === 'last') arr.sort((a,b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
  else if (sortBy === 'position') arr.sort((a,b) => (a.position || '').localeCompare(b.position || '') || a.firstName.localeCompare(b.firstName));
  else if (sortBy === 'order') arr.sort((a,b) => {
    const ao = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
    const bo = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;
    return ao - bo || a.firstName.localeCompare(b.firstName);
  });
  else arr.sort((a,b) => studentNumberOf(a) - studentNumberOf(b));
  return arr;
}
function defaultEntry() { return { absent: false, meal: 'hot', milk: 'yes' }; }
// Breakfast defaults to "No Breakfast" (meal: 'sack', milk: 'no') since fewer students take
// breakfast than lunch — teachers only need to flip the students who ARE eating breakfast,
// rather than flipping everyone who isn't.
function defaultBreakfastEntry() { return { absent: false, meal: 'sack', milk: 'no' }; }
// Used for the morning-of Breakfast Verification (breakfastFinal). Defaults to "Picked Up"
// since every student shown here already requested breakfast in the prior day's pre-count —
// the teacher/staff member only needs to flip the exceptions (no-shows, absences).
function defaultBreakfastFinalEntry() { return { absent: false, meal: 'hot' }; }
function emptyEntries(roster) {
  const e = {};
  roster.forEach(s => { e[s.id] = defaultEntry(); });
  return e;
}
function emptyBreakfastEntries(roster) {
  const e = {};
  roster.forEach(s => { e[s.id] = defaultBreakfastEntry(); });
  return e;
}
// defaultEntryFn lets callers supply a different fallback (e.g. defaultBreakfastEntry) for
// students missing from the entries map, without duplicating the tally logic.
function tallyEntries(entries, roster, defaultEntryFn) {
  const fallback = defaultEntryFn || defaultEntry;
  let hot = 0, sack = 0, absent = 0, milk = 0;
  roster.forEach(s => {
    const e = (entries && entries[s.id]) || fallback();
    if (e.absent) { absent++; return; }
    if (e.meal === 'hot') hot++; else if (e.meal === 'sack') sack++;
    if (e.milk === 'yes') milk++;
  });
  return { hot, sack, absent, milk, total: roster.length };
}
// Like tallyEntries, but splits milk counts out by meal type (hot vs sack) instead of a single
// combined milk total. Used by the Admin Analytics "Today" snapshot cards, where hot-lunch milk
// and sack-lunch milk are reported separately.
function tallyEntriesSplitMilk(entries, roster, defaultEntryFn) {
  const fallback = defaultEntryFn || defaultEntry;
  let hot = 0, sack = 0, absent = 0, milkHot = 0, milkSack = 0;
  roster.forEach(s => {
    const e = (entries && entries[s.id]) || fallback();
    if (e.absent) { absent++; return; }
    if (e.meal === 'hot') { hot++; if (e.milk === 'yes') milkHot++; }
    else if (e.meal === 'sack') { sack++; if (e.milk === 'yes') milkSack++; }
  });
  return { hot, sack, absent, milkHot, milkSack, total: roster.length };
}
// "Staff & Adults" classrooms use a much simpler per-person entry than students: just whether
// that staff member is eating lunch today (yes/no). Each staff member submits their own card
// individually, so an entry also carries `submitted` — a roster member with no entry at all
// simply hasn't answered yet, which is different from having answered "no".
function defaultStaffEntry() { return { attending: false, submitted: false }; }
function emptyStaffEntries(roster) {
  const e = {};
  roster.forEach(s => { e[s.id] = defaultStaffEntry(); });
  return e;
}
// yes/no/total describe the whole roster (unanswered people fall into `no`, preserving the old
// behavior every existing caller expects). submittedYes/submittedNo/submittedCount describe only
// the people who have actually submitted their own card, which is what the admin Analytics
// snapshots count so that staff who never answered aren't silently reported as a real "no".
function tallyStaffEntries(entries, roster) {
  let yes = 0, no = 0, submittedYes = 0, submittedNo = 0, submittedCount = 0;
  roster.forEach(s => {
    const e = (entries && entries[s.id]) || defaultStaffEntry();
    if (e.attending) yes++; else no++;
    if (e.submitted) {
      submittedCount++;
      if (e.attending) submittedYes++; else submittedNo++;
    }
  });
  return { yes, no, total: roster.length, submittedYes, submittedNo, submittedCount };
}
function entryChanged(preE, finalE) {
  const a = preE || defaultEntry(), b = finalE || defaultEntry();
  return a.absent !== b.absent || a.meal !== b.meal || a.milk !== b.milk;
}
function entryStatusLabel(e) {
  if (e.absent) return 'Absent';
  return e.meal === 'hot' ? 'Hot Lunch' : 'Sack Lunch';
}
function entryMilkLabel(e) {
  if (e.absent) return '—';
  return e.milk === 'yes' ? 'Yes' : 'No';
}
function getWeekRange(dateStr) {
  const d = parseDateStr(dateStr);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = addDays(d, diffToMonday);
  const friday = addDays(monday, 4);
  return { start: monday, end: friday };
}
function getMonthRange(monthStr) {
  const parts = monthStr.split('-').map(Number);
  const y = parts[0], m = parts[1];
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0) };
}
function getTermRange(settings, key) {
  const t = settings && settings.terms && settings.terms[key];
  if (!t || !t.start) return null;
  return { start: parseDateStr(t.start), end: t.end ? parseDateStr(t.end) : parseDateStr(todayStr()) };
}
function getSchoolYearRange(settings) {
  const terms = (settings && settings.terms) || {};
  let minStart = null, maxEnd = null;
  Object.keys(terms).forEach(k => {
    const t = terms[k];
    if (t && t.start) { const s = parseDateStr(t.start); if (!minStart || s < minStart) minStart = s; }
    if (t && t.end) { const e = parseDateStr(t.end); if (!maxEnd || e > maxEnd) maxEnd = e; }
  });
  if (!minStart) return null;
  return { start: minStart, end: maxEnd || parseDateStr(todayStr()) };
}
function getStartOfYearToNow(settings) {
  const terms = (settings && settings.terms) || {};
  let minStart = null;
  Object.keys(terms).forEach(k => {
    const t = terms[k];
    if (t && t.start) { const s = parseDateStr(t.start); if (!minStart || s < minStart) minStart = s; }
  });
  if (!minStart) return null;
  return { start: minStart, end: parseDateStr(todayStr()) };
}

/* ============================ GRADE ORDERING (K -> 8th) ============================ */
// Classrooms are free-text ("Kindergarten", "1st Grade", "2nd", etc). This pulls out a
// canonical rank (0 = K, 1-8 = 1st-8th, 999 = unrecognized/beyond 8th) so classrooms can be
// sorted strictly K, 1st, 2nd ... 8th everywhere they're listed, instead of alphabetically.
function gradeSortRank(grade) {
  if (!grade) return 999;
  const g = String(grade).trim().toLowerCase();
  if (g === 'k' || g.startsWith('kind')) return 0;
  const m = g.match(/(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    const idx = GRADE_ORDER.indexOf(String(n));
    return idx === -1 ? 999 : idx;
  }
  return 999;
}
function sortClassroomsByGrade(list) {
  return (list || []).slice().sort((a, b) => {
    // Staff & Adults classrooms always sort to the end, after every real grade.
    const aStaff = a.type === 'staff', bStaff = b.type === 'staff';
    if (aStaff !== bStaff) return aStaff ? 1 : -1;
    const ra = gradeSortRank(a.grade), rb = gradeSortRank(b.grade);
    if (ra !== rb) return ra - rb;
    return (a.grade || '').localeCompare(b.grade || '', undefined, { numeric: true }) || (a.teacher || '').localeCompare(b.teacher || '');
  });
}

/* ============================ CALENDAR / "NO SCHOOL" DAYS ============================ */
// Uploaded holidays are stored on settings/config as settings.holidays: an array of
// { date: 'YYYY-MM-DD', label: 'Christmas Break' } objects, sorted by date.
function holidaysList(settings) { return (settings && settings.holidays) || []; }
function holidayFor(settings, dateStr) {
  return holidaysList(settings).find(h => h.date === dateStr) || null;
}
function isNoSchoolDay(settings, dateStr) { return !!holidayFor(settings, dateStr); }
function isWeekend(dateStr) {
  const day = parseDateStr(dateStr).getDay();
  return day === 0 || day === 6;
}
// Walks forward from (but not including) dateStr to find the next day that isn't a weekend
// or an uploaded "No School" day. Used to figure out which day a breakfast count taken today
// is actually for.
function nextSchoolDay(settings, dateStr) {
  let d = addDays(parseDateStr(dateStr), 1);
  for (let i = 0; i < 30; i++) {
    const ds = toDateStr(d);
    if (!isWeekend(ds) && !isNoSchoolDay(settings, ds)) return ds;
    d = addDays(d, 1);
  }
  return toDateStr(d);
}
async function saveHolidays(newList) {
  const sorted = newList.slice().sort((a, b) => a.date.localeCompare(b.date));
  await saveSettings({ holidays: sorted });
}
// Converts an XLSX cell (which may be a date serial number, a Date object, or plain text) or a
// raw CSV string into a YYYY-MM-DD string. Returns null if it can't be parsed as a date.
function coerceToDateStr(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) return toDateStr(val);
  if (typeof val === 'number') {
    const parsed = XLSX.SSF ? XLSX.SSF.parse_date_code(val) : null;
    if (parsed) return toDateStr(new Date(parsed.y, parsed.m - 1, parsed.d));
    return null;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return toDateStr(new Date(y, m - 1, d));
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
    const [m, d, yRaw] = s.split('/').map(Number);
    const y = yRaw < 100 ? 2000 + yRaw : yRaw;
    return toDateStr(new Date(y, m - 1, d));
  }
  const d2 = new Date(s);
  if (!isNaN(d2.getTime())) return toDateStr(d2);
  return null;
}
// Parses an uploaded CSV or XLSX calendar file into a list of { date, label } holiday rows.
// Expects a header row with a "Date" column and an optional "Label"/"Reason"/"Description"
// column; falls back to the first two columns if headers don't match those names.
function parseCalendarWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
  if (!rows.length) return [];
  let headerRow = rows[0].map(c => String(c).trim().toLowerCase());
  let dateCol = headerRow.findIndex(h => h.includes('date'));
  let labelCol = headerRow.findIndex(h => h.includes('label') || h.includes('reason') || h.includes('description') || h.includes('name'));
  let startRow = 1;
  if (dateCol === -1) { dateCol = 0; labelCol = labelCol === -1 ? 1 : labelCol; startRow = 0; }
  const out = [];
  for (let i = startRow; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const dateStr = coerceToDateStr(row[dateCol]);
    if (!dateStr) continue;
    const label = (labelCol !== -1 && row[labelCol]) ? String(row[labelCol]).trim() : 'No School';
    out.push({ date: dateStr, label });
  }
  return out;
}

/* ============================ FIRESTORE ACCESS ============================ */
function useCollection(name) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = db.collection(name).onSnapshot(
      snap => { setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); },
      err => { console.error('Firestore read error (' + name + '):', err); setLoading(false); }
    );
    return () => unsub();
    // eslint-disable-next-line
  }, [name]);
  return { items, loading };
}

function useSettingsDoc() {
  const [settings, setSettings] = useState({ terms: {} });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const unsub = db.collection('settings').doc('config').onSnapshot(
      doc => { setSettings(doc.exists ? { terms: {}, ...doc.data() } : { terms: {} }); setLoading(false); },
      err => { console.error('Firestore settings read error:', err); setLoading(false); }
    );
    return () => unsub();
  }, []);
  return { settings, loading };
}

function useLogs() {
  const { items, loading } = useCollection('logs');
  const logsById = useMemo(() => {
    const map = {};
    items.forEach(l => { map[l.id] = l; });
    return map;
  }, [items]);
  return { logs: items, logsById, loading };
}

async function saveClassroom(cls) {
  const id = cls.id || uid('c');
  await db.collection('classrooms').doc(id).set({
    grade: cls.grade,
    teacher: cls.teacher,
    type: cls.type || 'class',
    showAdultCard: !!cls.showAdultCard,
    enablePre: cls.enablePre !== false,
    enableBreakfast: cls.enableBreakfast !== false,
    enableFinal: cls.enableFinal !== false
  });
  return id;
}
async function deleteClassroomDoc(id) { await db.collection('classrooms').doc(id).delete(); }

async function saveStudent(s) {
  const id = s.id || uid('s');
  await db.collection('students').doc(id).set({
    number: s.number,
    firstName: s.firstName,
    lastName: s.lastName,
    classroomId: s.classroomId,
    lunchStatus: s.lunchStatus || 'paid',
    // position: free-text/dropdown job title, used for Staff & Adults roster only.
    // sortOrder: manual drag-and-drop position for how a staff member's card appears in the
    // classroom view; undefined for ordinary students (they use `number` instead).
    position: s.position != null ? s.position : null,
    sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : null
  }, { merge: true });
  return id;
}
async function deleteStudentDoc(id) { await db.collection('students').doc(id).delete(); }

async function saveSettings(patch) {
  await db.collection('settings').doc('config').set(patch, { merge: true });
}

// Logs are always written as a full document (rather than partial merges) since the
// UI already holds the latest synced copy locally; last write wins, which is fine for
// this app's scale (a handful of teachers editing their own classroom's counts).
//
// breakfastFinal / breakfastVerified / breakfastVerifiedAt: added for the morning-of Breakfast
// Verification workflow. breakfastFinal lives on the log doc for the day the food is actually
// served (NOT the day the breakfast pre-count was taken) and mirrors, once submitted, which
// students actually picked up breakfast that morning. breakfastVerified/breakfastVerifiedAt
// are the admin's sign-off on that, exactly parallel to verified/verifiedAt for lunch. Every
// caller of saveLogFull MUST pass these through from the existing log doc (when one exists) or
// they will silently reset to blank/false, since this function always writes a full document.
//
// pre.adultsCount / final.adultsCount: for "Staff & Adults" classrooms with the adult/parent
// card enabled, a simple running count of adults eating lunch that day, separate from the
// per-person roster entries above. Lives inside the pre/final objects themselves so no schema
// change is needed elsewhere.
async function saveLogFull(dateStr, classroomId, obj) {
  const id = logId(dateStr, classroomId);
  const payload = {
    date: dateStr,
    classroomId,
    pre: obj.pre || { entries: {}, submitted: false, submittedAt: null },
    breakfast: obj.breakfast || { entries: {}, submitted: false, submittedAt: null, targetDate: null },
    final: obj.final || { entries: {}, submitted: false, submittedAt: null },
    verified: obj.verified || false,
    verifiedAt: obj.verifiedAt || null,
    breakfastFinal: obj.breakfastFinal || { entries: {}, submitted: false, submittedAt: null, sourceDate: null },
    breakfastVerified: obj.breakfastVerified || false,
    breakfastVerifiedAt: obj.breakfastVerifiedAt || null
  };
  await db.collection('logs').doc(id).set(payload);
}

/* ============================ ADMIN DATA MANAGEMENT (delete / edit historical counts) ============================ */
// Everything below writes to the same "logs" collection that powers Analytics and the Monthly
// Meal Count Export. Because both of those read live Firestore data on every render, deleting or
// editing records here is automatically reflected there — no separate "recalculate" step needed.

async function deleteLogDoc(id) { await db.collection('logs').doc(id).delete(); }

// Returns every log whose date falls within [startDate, endDate], optionally restricted to a
// single classroom. Pass classroomId = null (or '') to match all classrooms.
function findLogsInRange(data, startDate, endDate, classroomId) {
  return data.logs.filter(log => {
    const d = parseDateStr(log.date);
    if (d < startDate || d > endDate) return false;
    if (classroomId && log.classroomId !== classroomId) return false;
    return true;
  });
}

async function clearPreCountForLogs(logs) {
  for (const log of logs) {
    await saveLogFull(log.date, log.classroomId, {
      pre: { entries: {}, submitted: false, submittedAt: null },
      breakfast: log.breakfast,
      final: log.final,
      verified: log.verified,
      verifiedAt: log.verifiedAt,
      breakfastFinal: log.breakfastFinal,
      breakfastVerified: log.breakfastVerified,
      breakfastVerifiedAt: log.breakfastVerifiedAt
    });
  }
}

// Clears just the breakfast pre-count (taken today, for the next school day) without touching
// that day's lunch pre/final counts.
async function clearBreakfastCountForLogs(logs) {
  for (const log of logs) {
    await saveLogFull(log.date, log.classroomId, {
      pre: log.pre,
      breakfast: { entries: {}, submitted: false, submittedAt: null, targetDate: (log.breakfast && log.breakfast.targetDate) || null },
      final: log.final,
      verified: log.verified,
      verifiedAt: log.verifiedAt,
      breakfastFinal: log.breakfastFinal,
      breakfastVerified: log.breakfastVerified,
      breakfastVerifiedAt: log.breakfastVerifiedAt
    });
  }
}

// Clearing the final count also un-verifies the day, since a verified count with no final
// data behind it would be misleading in Analytics/Export.
async function clearFinalCountForLogs(logs) {
  for (const log of logs) {
    await saveLogFull(log.date, log.classroomId, {
      pre: log.pre,
      breakfast: log.breakfast,
      final: { entries: {}, submitted: false, submittedAt: null },
      verified: false,
      verifiedAt: null,
      breakfastFinal: log.breakfastFinal,
      breakfastVerified: log.breakfastVerified,
      breakfastVerifiedAt: log.breakfastVerifiedAt
    });
  }
}

async function deleteWholeLogs(logs) {
  for (const log of logs) {
    await deleteLogDoc(logId(log.date, log.classroomId));
  }
}

// Removes a single student's entry from the pre and/or final entries of every matching log,
// without touching any other student's data in that same log. This is the "fix one kid's
// mistake" tool, as opposed to the bulk deletes above which wipe a whole classroom-day.
async function clearStudentFromLogs(logs, studentId, target) {
  for (const log of logs) {
    const basePre = log.pre || { entries: {}, submitted: false, submittedAt: null };
    const baseBreakfast = log.breakfast || { entries: {}, submitted: false, submittedAt: null, targetDate: null };
    const baseFinal = log.final || { entries: {}, submitted: false, submittedAt: null };
    const newPre = { ...basePre, entries: { ...(basePre.entries || {}) } };
    const newBreakfast = { ...baseBreakfast, entries: { ...(baseBreakfast.entries || {}) } };
    const newFinal = { ...baseFinal, entries: { ...(baseFinal.entries || {}) } };
    let finalTouched = false;
    if (target === 'pre' || target === 'both' || target === 'all') delete newPre.entries[studentId];
    if (target === 'breakfast' || target === 'all') delete newBreakfast.entries[studentId];
    if (target === 'final' || target === 'both' || target === 'all') { delete newFinal.entries[studentId]; finalTouched = true; }
    await saveLogFull(log.date, log.classroomId, {
      pre: newPre,
      breakfast: newBreakfast,
      final: newFinal,
      verified: finalTouched ? false : log.verified,
      verifiedAt: finalTouched ? null : log.verifiedAt,
      breakfastFinal: log.breakfastFinal,
      breakfastVerified: log.breakfastVerified,
      breakfastVerifiedAt: log.breakfastVerifiedAt
    });
  }
}

// Bulk end-of-year promotion: moves every student currently in fromClassroomId to
// toClassroomId, or deletes the student doc entirely when toClassroomId is null (e.g.
// graduating 8th graders off the roster). Historical logs intentionally keep referencing the
// OLD classroomId, so past years' reports and exports stay accurate after the move.
async function promoteClassroom(data, fromClassroomId, toClassroomId) {
  const roster = data.students.filter(s => s.classroomId === fromClassroomId);
  for (const s of roster) {
    if (toClassroomId) {
      await saveStudent({ id: s.id, number: s.number, firstName: s.firstName, lastName: s.lastName, classroomId: toClassroomId, lunchStatus: s.lunchStatus });
    } else {
      await deleteStudentDoc(s.id);
    }
  }
  return roster.length;
}

/* ============================ AGGREGATION NOTE (EXPORT) ============================ */
// Staff & Adults classrooms are explicitly excluded from student meal-count reporting below:
// those classrooms track adult/staff lunches, which shouldn't be mixed into student
// reimbursement analytics or the official Monthly Meal Count Export.

/* ============================ TODAY SNAPSHOT (ADMIN ANALYTICS "TODAY" CARDS) ============================ */
// Live, cross-classroom snapshot for today only, powering the two Analytics cards: a
// PreCount card (fills in live as teachers work through Today's Lunch Count, before anyone
// submits or verifies anything) and a Verified Count card (only counts classroom-days an admin
// has actually verified). Staff & Adults classrooms are excluded, same reasoning as
// aggregateRange above.
// Tallies ONLY students who actually have a recorded entry in `entries` — unlike
// tallyEntries/tallyEntriesSplitMilk, a missing student is simply "not yet entered" rather than
// defaulted to Hot Lunch. This is what makes the PreCount card genuinely "live": a classroom a
// teacher has opened but not yet touched (or not yet submitted) contributes only the students
// they've actually flipped, instead of silently claiming every untouched student as a Hot Lunch +
// Milk Yes default the moment the classroom's log document exists.
function tallyLiveEntries(entries, roster) {
  let hot = 0, sack = 0, absent = 0, milkHot = 0, milkSack = 0, entered = 0;
  roster.forEach(s => {
    const e = entries && entries[s.id];
    if (!e) return;
    entered++;
    if (e.absent) { absent++; return; }
    if (e.meal === 'hot') { hot++; if (e.milk === 'yes') milkHot++; }
    else if (e.meal === 'sack') { sack++; if (e.milk === 'yes') milkSack++; }
  });
  return { hot, sack, absent, milk: milkHot + milkSack, milkHot, milkSack, entered, total: roster.length };
}
function computeTodayPreCountSnapshot(data) {
  const today = todayStr();
  const noSchool = isNoSchoolDay(data.settings, today);
  let hot = 0, sack = 0, absent = 0, milkHot = 0, milkSack = 0;
  const notSubmitted = [];
  data.classrooms.forEach(cls => {
    if (cls.type === 'staff') return;
    if (!stageEnabled(cls, 'pre')) return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const log = data.logsById[logId(today, cls.id)];
    const entries = (log && log.pre && log.pre.entries) || {};
    const t = tallyLiveEntries(entries, roster);
    hot += t.hot; sack += t.sack; absent += t.absent; milkHot += t.milkHot; milkSack += t.milkSack;
    if (!noSchool && roster.length > 0 && !(log && log.pre && log.pre.submitted)) notSubmitted.push(classroomLabel(cls));
  });
  return { hot, sack, absent, milkHot, milkSack, notSubmitted };
}
// Only counts a classroom once its Final Lunch Count has actually been submitted AND an admin has
// verified it — verifying a classroom that was never submitted (an admin can force this from the
// Verification tab) leaves final.entries empty, and defaulting every missing student to Hot Lunch
// in that case was the source of the Verified card's inflated "off" hot-lunch totals. Requiring
// `final.submitted` closes that gap; the split-milk tally still matches the PreCount card's units.
function computeTodayVerifiedSnapshot(data) {
  const today = todayStr();
  let hot = 0, sack = 0, absent = 0, milkHot = 0, milkSack = 0;
  data.classrooms.forEach(cls => {
    if (cls.type === 'staff') return;
    const log = data.logsById[logId(today, cls.id)];
    if (!log || !log.verified || !(log.final && log.final.submitted)) return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const t = tallyEntriesSplitMilk(log.final.entries || {}, roster, defaultEntry);
    hot += t.hot; sack += t.sack; absent += t.absent; milkHot += t.milkHot; milkSack += t.milkSack;
  });
  return { hot, sack, absent, milkHot, milkSack };
}

// Live snapshot of today's Staff & Adults lunch counts, for the admin "Today's PreCount" card.
// Mirrors computeTodayPreCountSnapshot above but reads the staff Yes/No entries plus each
// classroom's separate adults/parents counter, since those are a different shape of data. Counts
// only staff who have actually submitted their own card — a staff member who hasn't answered yet
// is genuinely unanswered, not a "no", and shouldn't be treated as settled data either way.
function computeTodayStaffAdultSnapshot(data) {
  const today = todayStr();
  let staffLunch = 0, adultLunch = 0;
  data.classrooms.forEach(cls => {
    if (cls.type !== 'staff') return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const log = data.logsById[logId(today, cls.id)];
    const entries = (log && log.pre && log.pre.entries) || {};
    const t = tallyStaffEntries(entries, roster);
    staffLunch += t.submittedYes;
    if (cls.showAdultCard) adultLunch += (log && log.pre && log.pre.adultsCount) || 0;
  });
  return { staffLunch, adultLunch };
}

// Verified counterpart to computeTodayStaffAdultSnapshot. Staff & Adults classrooms have NO
// separate Final Lunch Count — each staff member's own submitted Hot Lunch Yes/No (stored under
// `pre`) is the definitive record for the day — so this reads pre.entries and gates purely on an
// admin having verified the classroom, rather than looking for a final count that never exists.
function computeTodayVerifiedStaffAdultSnapshot(data) {
  const today = todayStr();
  let staffLunch = 0, adultLunch = 0;
  data.classrooms.forEach(cls => {
    if (cls.type !== 'staff') return;
    const log = data.logsById[logId(today, cls.id)];
    if (!log || !log.verified) return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const entries = (log.pre && log.pre.entries) || {};
    const t = tallyStaffEntries(entries, roster);
    staffLunch += t.submittedYes;
    if (cls.showAdultCard) adultLunch += (log.pre && log.pre.adultsCount) || 0;
  });
  return { staffLunch, adultLunch };
}

// Live snapshot of TOMORROW's (next school day's) Breakfast Pre-Count: how many students have
// actually been marked as requesting breakfast so far, across every non-staff classroom whose
// Breakfast Pre-Count is enabled. Lives on TODAY's log doc (breakfast pre-counts are taken the
// school day before they're for), same live-only counting rule as the lunch PreCount card above.
function computeTomorrowBreakfastPreCountSnapshot(data) {
  const today = todayStr();
  const noSchool = isNoSchoolDay(data.settings, today);
  let hot = 0;
  const notSubmitted = [];
  data.classrooms.forEach(cls => {
    if (cls.type === 'staff') return;
    if (!stageEnabled(cls, 'breakfast')) return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const log = data.logsById[logId(today, cls.id)];
    const entries = (log && log.breakfast && log.breakfast.entries) || {};
    roster.forEach(s => {
      const e = entries[s.id];
      if (e && !e.absent && e.meal === 'hot') hot++;
    });
    if (!noSchool && roster.length > 0 && !(log && log.breakfast && log.breakfast.submitted)) notSubmitted.push(classroomLabel(cls));
  });
  return { hot, notSubmitted };
}

// Verified snapshot of TODAY's breakfast pickups: how many students actually picked up
// breakfast this morning, only counting a classroom once its morning-of Breakfast Verification
// (breakfastFinal) has been submitted AND an admin has verified it (breakfastVerified).
function computeTodayVerifiedBreakfastSnapshot(data) {
  const today = todayStr();
  let pickedUp = 0;
  data.classrooms.forEach(cls => {
    if (cls.type === 'staff') return;
    const log = data.logsById[logId(today, cls.id)];
    if (!log || !log.breakfastVerified || !(log.breakfastFinal && log.breakfastFinal.submitted)) return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const entries = log.breakfastFinal.entries || {};
    roster.forEach(s => {
      const e = entries[s.id];
      if (e && !e.absent && e.meal === 'hot') pickedUp++;
    });
  });
  return { pickedUp };
}

/* ============================ MONTHLY MEAL COUNT EXPORT (matches official template) ============================ */
// For every day of the given month, tallies how many *not-absent* students on submitted/final
// logs fall into each reporting bucket: Elementary Paid, Middle School Paid, High School Paid,
// Reduced Price, and Free. Grade band comes from settings.gradeBands (Admin -> Grade Bands);
// reduced/free comes from each student's own lunchStatus (Admin -> Students).
// Days with no submitted final log anywhere are left out entirely (null) so the exported sheet
// leaves that day's row blank, exactly like the paper form would. Because this reads straight
// from data.logsById / data.students (live Firestore data), anything deleted or edited in Admin
// -> Data Management is reflected here automatically the next time this is computed.
// Staff & Adults classrooms are excluded (see AGGREGATION note above). Only VERIFIED days are
// counted — a submitted-but-unverified Final Lunch Count is left out entirely (blank row) rather
// than populating the export with a count an admin hasn't signed off on yet. In practice the
// Export tab's unverified-day guard already blocks running the export until everything submitted
// is verified, but this check makes the export itself independently correct regardless of that.
// Only HOT lunches count toward the reimbursement report — a student marked Sack Lunch didn't
// take a reimbursable hot meal that day, same as breakfast's `e.meal !== 'hot'` check below. This
// keeps the export's Total (E+F+G) equal to "Today's Verified Count" -> Student Hot Lunch for any
// day it's checked against, rather than double-counting sack lunches into Paid/Reduced/Free.
function buildMonthlyMealCountDays(data, year, month) {
  const numDays = daysInMonth(year, month);
  const days = [];
  for (let day = 1; day <= 31; day++) {
    if (day > numDays) { days.push(null); continue; }
    const dateStr = year + '-' + pad2(month) + '-' + pad2(day);
    let hasData = false;
    const counts = { elem: 0, mid: 0, high: 0, reduced: 0, free: 0 };
    data.classrooms.forEach(cls => {
      if (cls.type === 'staff') return;
      const log = data.logsById[logId(dateStr, cls.id)];
      if (!log || !log.final || !log.final.submitted || !log.verified) return;
      hasData = true;
      const band = bandForGrade(data.settings, cls.grade);
      const roster = data.students.filter(s => s.classroomId === cls.id);
      roster.forEach(s => {
        const e = (log.final.entries && log.final.entries[s.id]) || defaultEntry();
        if (e.absent) return;
        if (e.meal !== 'hot') return; // Sack Lunch isn't part of the reimbursable hot lunch count
        const status = s.lunchStatus || 'paid';
        if (status === 'free') { counts.free++; return; }
        if (status === 'reduced') { counts.reduced++; return; }
        if (band === 'middle') counts.mid++;
        else if (band === 'high') counts.high++;
        else counts.elem++;
      });
    });
    days.push(hasData ? counts : null);
  }
  return days;
}

// Scans every day/classroom in the given month for a submitted Lunch Final Count that an admin
// has NOT yet verified. The Monthly Lunch Meal Count Export refuses to run while this list is
// non-empty, since an unverified final count could still change and shouldn't be locked into an
// official reimbursement report. Staff & Adults classrooms have no Final Lunch Count of their own
// (see readyToVerify in LunchVerificationTab) — they're "fully submitted" once every staff member
// has turned in their own Hot Lunch card — so they're checked the same way here, otherwise a fully
// submitted but unverified Staff & Adults day would silently be left out of the export instead of
// blocking it like every other unverified day does. Returns [{ date, classroom }, ...] sorted by date.
function findUnverifiedLunchDays(data, year, month) {
  const numDays = daysInMonth(year, month);
  const problems = [];
  for (let day = 1; day <= numDays; day++) {
    const dateStr = year + '-' + pad2(month) + '-' + pad2(day);
    sortClassroomsByGrade(data.classrooms).forEach(cls => {
      const log = data.logsById[logId(dateStr, cls.id)];
      if (!log || log.verified) return;
      if (cls.type === 'staff') {
        const roster = data.students.filter(s => s.classroomId === cls.id);
        if (roster.length === 0) return;
        const entries = (log.pre && log.pre.entries) || {};
        if (tallyStaffEntries(entries, roster).submittedCount >= roster.length) {
          problems.push({ date: dateStr, classroom: cls });
        }
        return;
      }
      if (log.final && log.final.submitted) {
        problems.push({ date: dateStr, classroom: cls });
      }
    });
  }
  return problems;
}

// Per-day Staff & Adult lunch counts for the Monthly Lunch Meal Count Export, counted the same
// verified-only way as buildMonthlyMealCountDays. Staff & Adults classrooms have no separate Final
// Lunch Count — each staff member's own submitted Hot Lunch Yes/No (stored under `pre`) is the
// definitive record for the day — so a day only counts once an admin has verified that classroom's
// log for that date, mirroring computeTodayVerifiedStaffAdultSnapshot but across a whole month.
function buildMonthlyStaffAdultDays(data, year, month) {
  const numDays = daysInMonth(year, month);
  const days = [];
  for (let day = 1; day <= 31; day++) {
    days.push(day > numDays ? null : { staff: 0, adult: 0, hasData: false });
  }
  data.classrooms.forEach(cls => {
    if (cls.type !== 'staff') return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    for (let day = 1; day <= numDays; day++) {
      const dateStr = year + '-' + pad2(month) + '-' + pad2(day);
      const log = data.logsById[logId(dateStr, cls.id)];
      if (!log || !log.verified) continue;
      const entries = (log.pre && log.pre.entries) || {};
      const t = tallyStaffEntries(entries, roster);
      const bucket = days[day - 1];
      bucket.hasData = true;
      bucket.staff += t.submittedYes;
      if (cls.showAdultCard) bucket.adult += (log.pre && log.pre.adultsCount) || 0;
    }
  });
  return days.map(d => (d && d.hasData) ? d : null);
}

// Path to the actual official monthly reimbursable meal count workbook, uploaded once by the
// school and served as a static file at the site root (same level as shared.js/style.css). The
// export loads THIS file fresh every time and only edits data cells, so every formula, merge,
// border, font, and column width from the original template survives untouched — nothing is
// rebuilt from scratch.
const LUNCH_TEMPLATE_PATH = '/lunch-export-template.xlsx';

// Fetches and parses a template workbook. Thrown errors are meant to be caught by the caller and
// shown to the admin (e.g. the file hasn't been uploaded to the site yet, or the path is wrong).
async function fetchTemplateWorkbook(path) {
  const resp = await fetch(path);
  if (!resp.ok) {
    throw new Error('Could not load the export template at "' + path + '" (' + resp.status + '). Make sure lunch-export-template.xlsx has been uploaded to the site.');
  }
  const buf = await resp.arrayBuffer();
  return XLSX.read(buf, { type: 'array' });
}

// Writes a value into a template cell, or clears it when there's no data for that day — matching
// the "left blank, just like the paper form" behavior for days with no submitted-and-verified count.
function setTemplateCell(ws, addr, value) {
  if (value === undefined || value === null) { delete ws[addr]; return; }
  ws[addr] = (typeof value === 'string') ? { t: 's', v: value } : { t: 'n', v: value };
}

// Sets a formula cell but ALSO bakes in the correct computed value as its cached result. This
// matters because the free/CDN build of SheetJS cannot write the workbook's <calcPr> element (so
// fullCalcOnLoad can't be set), which means whatever cached value a formula cell already has when
// read keeps showing until something forces a recalculation — inconsistent across Excel, Google
// Sheets, and quick-look previews. The template's formula cells start with a cached 0 (from the
// blank form), so without this, every Total Paid / Total / bottom Total cell would keep showing
// 0 instead of the real sum until the user forced a manual recalculation. Baking in the correct
// value here means the numbers are right the instant the file opens, while the formula itself is
// left in place so the cell still recalculates normally if the school edits a number by hand later.
function setFormulaCell(ws, addr, formula, value) {
  ws[addr] = { t: 'n', f: formula, v: value };
}

// Fills the official template (see LUNCH_TEMPLATE_PATH) with this month's data, using ONLY
// classroom-days that are both submitted AND admin-verified (buildMonthlyMealCountDays /
// buildMonthlyStaffAdultDays already enforce this — an unverified submitted count is left blank
// rather than exported). Populates:
//   B/C/D/F/G  — Elem/Mid/High Paid, Reduced, Free (Student Lunches)
//   H/I        — Staff, Adult (Staff & Adult Lunches)
//   L2/M2      — Month name / Year
//   E/J        — Total Paid / Total per row, and the bottom Total row (still =SUM() formulas,
//                but see setFormulaCell above for why their cached values are recomputed too)
// Every merge, border, font, and column width from the original template is left exactly as-is.
async function downloadMonthlyMealCountXLSX(data, year, month) {
  const wb = await fetchTemplateWorkbook(LUNCH_TEMPLATE_PATH);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const days = buildMonthlyMealCountDays(data, year, month);
  const staffDays = buildMonthlyStaffAdultDays(data, year, month);

  setTemplateCell(ws, 'L2', monthNameOf(month));
  setTemplateCell(ws, 'M2', year);

  const colTotals = { B: 0, C: 0, D: 0, E: 0, F: 0, G: 0, H: 0, I: 0 };

  for (let day = 1; day <= 31; day++) {
    const r = day + 3; // day 1 -> row 4, matching the template
    const d = days[day - 1];
    const sd = staffDays[day - 1];
    const elem = d ? d.elem : null, mid = d ? d.mid : null, high = d ? d.high : null;
    const reduced = d ? d.reduced : null, free = d ? d.free : null;
    const staff = sd ? sd.staff : null, adult = sd ? sd.adult : null;

    setTemplateCell(ws, 'B' + r, elem);
    setTemplateCell(ws, 'C' + r, mid);
    setTemplateCell(ws, 'D' + r, high);
    setTemplateCell(ws, 'F' + r, reduced);
    setTemplateCell(ws, 'G' + r, free);
    setTemplateCell(ws, 'H' + r, staff);
    setTemplateCell(ws, 'I' + r, adult);

    const totalPaid = (elem || 0) + (mid || 0) + (high || 0);
    const total = totalPaid + (reduced || 0) + (free || 0) + (staff || 0) + (adult || 0);
    setFormulaCell(ws, 'E' + r, 'SUM(B' + r + ':D' + r + ')', totalPaid);
    setFormulaCell(ws, 'J' + r, 'SUM(E' + r + ':I' + r + ')', total);

    colTotals.B += elem || 0; colTotals.C += mid || 0; colTotals.D += high || 0;
    colTotals.E += totalPaid; colTotals.F += reduced || 0; colTotals.G += free || 0;
    colTotals.H += staff || 0; colTotals.I += adult || 0;
  }

  ['B','C','D','E','F','G','H','I'].forEach(col => {
    setFormulaCell(ws, col + '35', 'SUM(' + col + '4:' + col + '34)', colTotals[col]);
  });
  const grandTotal = colTotals.E + colTotals.F + colTotals.G + colTotals.H + colTotals.I;
  setFormulaCell(ws, 'J35', 'SUM(E35:I35)', grandTotal);

  const filename = 'lunch-count-' + year + '-' + pad2(month) + '.xlsx';
  XLSX.writeFile(wb, filename);
}

/* ============================ STUDENT LUNCH DATA BY CLASSROOM EXPORT ============================ */
// Path to the per-classroom student-level template, uploaded once by the school and served as a
// static file at the site root, same convention as LUNCH_TEMPLATE_PATH above. Layout: A1 title,
// A2 "Student Name" with day-of-month headers 1-31 across B2:AF2 and "Total" at AG2, one student
// per row starting at A3.
const CLASSROOM_TEMPLATE_PATH = '/Student-Lunch-Data-by-Classroom-Template.xlsx';

// For a single classroom, builds each student's day-by-day Hot/Sack Lunch status across the given
// month. Uses ONLY classroom-days that are both submitted AND admin-verified — same verified-only
// rule as buildMonthlyMealCountDays — so a day with no verified Final Lunch Count is left blank
// for every student that day, rather than guessing. An absent student is also left blank for that
// day (no lunch of either kind was actually served). `hotCount` is each student's total Hot Lunch
// days for the month, which is what the template's "Total" column is for.
function buildClassroomLunchGrid(data, year, month, classroomId) {
  const numDays = daysInMonth(year, month);
  const cls = data.classrooms.find(c => c.id === classroomId);
  const roster = sortStudents(data.students.filter(s => s.classroomId === classroomId), 'number');
  const rows = roster.map(s => {
    const days = [];
    let hotCount = 0;
    for (let day = 1; day <= 31; day++) {
      if (day > numDays) { days.push(null); continue; }
      const dateStr = year + '-' + pad2(month) + '-' + pad2(day);
      const log = data.logsById[logId(dateStr, classroomId)];
      if (!log || !log.final || !log.final.submitted || !log.verified) { days.push(null); continue; }
      const e = (log.final.entries && log.final.entries[s.id]) || defaultEntry();
      if (e.absent) { days.push(null); continue; }
      const label = e.meal === 'hot' ? 'Hot' : 'Sack';
      if (e.meal === 'hot') hotCount++;
      days.push(label);
    }
    return { student: s, days, hotCount };
  });
  return { cls, rows };
}

// Fills the per-classroom template (see CLASSROOM_TEMPLATE_PATH) with one row per student,
// starting at A3, and a Hot/Sack/blank value in each day column B:AF for that month, using ONLY
// verified data (see buildClassroomLunchGrid). Every column width, header, and title cell already
// in the template is left as-is other than the title, which gets the classroom/month/year appended
// so multiple downloaded reports are easy to tell apart.
async function downloadClassroomLunchXLSX(data, year, month, classroomId) {
  const wb = await fetchTemplateWorkbook(CLASSROOM_TEMPLATE_PATH);
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const { cls, rows } = buildClassroomLunchGrid(data, year, month, classroomId);

  const dayCols = [];
  for (let i = 0; i < 31; i++) dayCols.push(XLSX.utils.encode_col(1 + i)); // B..AF for day 1..31

  const titleSuffix = (cls ? classroomLabel(cls) : 'Classroom') + ' \u2014 ' + monthNameOf(month) + ' ' + year;
  setTemplateCell(ws, 'A1', 'Student Lunch Data by Classroom \u2014 ' + titleSuffix);

  rows.forEach((row, idx) => {
    const r = idx + 3; // A3 is the first student row
    setTemplateCell(ws, 'A' + r, studentName(row.student));
    row.days.forEach((val, i) => setTemplateCell(ws, dayCols[i] + r, val));
    setTemplateCell(ws, 'AG' + r, row.hotCount);
  });

  const lastRow = Math.max(2, 2 + rows.length);
  ws['!ref'] = 'A1:AG' + lastRow;

  const safeClsName = (cls ? (cls.grade + '-' + cls.teacher) : 'classroom').replace(/[^a-z0-9]+/gi, '_');
  const filename = 'lunch-by-classroom-' + safeClsName + '-' + year + '-' + pad2(month) + '.xlsx';
  XLSX.writeFile(wb, filename);
}
// Mirrors buildMonthlyMealCountDays, but a breakfast count taken on log.date is recorded
// against log.breakfast.targetDate (the next school day), so days here are bucketed by
// targetDate rather than the log document's own date.
function buildMonthlyBreakfastCountDays(data, year, month) {
  const numDays = daysInMonth(year, month);
  const days = [];
  for (let day = 1; day <= 31; day++) {
    if (day > numDays) { days.push(null); continue; }
    days.push({ elem: 0, mid: 0, high: 0, reduced: 0, free: 0, hasData: false });
  }
  data.logs.forEach(log => {
    if (!log.breakfast || !log.breakfast.submitted || !log.breakfast.targetDate) return;
    const target = parseDateStr(log.breakfast.targetDate);
    if (target.getFullYear() !== year || target.getMonth() + 1 !== month) return;
    const day = target.getDate();
    const bucket = days[day - 1];
    if (!bucket) return;
    const cls = data.classrooms.find(c => c.id === log.classroomId);
    if (!cls || cls.type === 'staff') return;
    bucket.hasData = true;
    const band = bandForGrade(data.settings, cls.grade);
    const roster = data.students.filter(s => s.classroomId === cls.id);
    roster.forEach(s => {
      const e = (log.breakfast.entries && log.breakfast.entries[s.id]) || defaultBreakfastEntry();
      if (e.absent) return;
      if (e.meal !== 'hot') return; // meal === 'hot' represents "ate breakfast"
      const status = s.lunchStatus || 'paid';
      if (status === 'free') { bucket.free++; return; }
      if (status === 'reduced') { bucket.reduced++; return; }
      if (band === 'middle') bucket.mid++;
      else if (band === 'high') bucket.high++;
      else bucket.elem++;
    });
  });
  return days.map(d => (d && d.hasData) ? d : null);
}

function buildMonthlyBreakfastCountWorkbook(data, year, month) {
  const days = buildMonthlyBreakfastCountDays(data, year, month);
  const ws = {};
  function setCell(addr, value, isFormula) {
    if (value === undefined || value === null) return;
    if (isFormula) { ws[addr] = { t: 'n', f: value }; return; }
    if (typeof value === 'number') { ws[addr] = { t: 'n', v: value }; return; }
    ws[addr] = { t: 's', v: String(value) };
  }

  setCell('A1', 'Day of the Month');
  setCell('B1', 'Student Breakfasts');
  setCell('B2', 'Reimbursable');
  setCell('I2', 'Month');
  setCell('J2', monthNameOf(month));
  setCell('K2', 'Year');
  setCell('L2', year);
  setCell('B3', 'Elem. School Paid');
  setCell('C3', 'Middle School Paid');
  setCell('D3', 'High School Paid');
  setCell('E3', 'Total Paid');
  setCell('F3', 'Reduced Price');
  setCell('G3', 'Free');
  setCell('H3', 'Total');

  for (let day = 1; day <= 31; day++) {
    const r = day + 3;
    setCell('A' + r, day);
    const d = days[day - 1];
    if (d) {
      setCell('B' + r, d.elem);
      setCell('C' + r, d.mid);
      setCell('D' + r, d.high);
      setCell('F' + r, d.reduced);
      setCell('G' + r, d.free);
    }
    setCell('E' + r, 'SUM(B' + r + ':D' + r + ')', true);
    setCell('H' + r, 'SUM(E' + r + ':G' + r + ')', true);
  }

  setCell('A35', 'Total');
  ['B','C','D','E','F','G','H'].forEach(col => setCell(col + '35', 'SUM(' + col + '4:' + col + '34)', true));

  ws['!ref'] = 'A1:L35';
  ws['!merges'] = [
    XLSX.utils.decode_range('B1:H1'),
    XLSX.utils.decode_range('A1:A3'),
    XLSX.utils.decode_range('B2:H2')
  ];
  ws['!cols'] = [{ wch: 14 }, { wch: 15 }, { wch: 17 }, { wch: 15 }, { wch: 11 }, { wch: 13 }, { wch: 9 }, { wch: 9 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return wb;
}

function downloadMonthlyBreakfastCountXLSX(data, year, month) {
  const wb = buildMonthlyBreakfastCountWorkbook(data, year, month);
  const filename = 'breakfast-count-' + year + '-' + pad2(month) + '.xlsx';
  XLSX.writeFile(wb, filename);
}

/* ============================ SMALL UI PRIMITIVES ============================ */
function Badge({ status }) {
  const styles = {
    'Completed': 'bg-green-100 text-green-800 border border-green-300',
    'In Progress': 'bg-amber-100 text-amber-800 border border-amber-300',
    'Not Started': 'bg-gray-100 text-gray-600 border border-gray-300',
    'Verified': 'bg-purple-100 text-purple-800 border border-purple-300'
  };
  return (
    <span className={"px-3 py-1 rounded-full text-xs font-semibold " + styles[status]}>{status}</span>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-2xl card-shadow p-4 text-center border border-primary-100">
      <p className="text-3xl font-bold text-primary">{value}</p>
      <p className="text-xs font-medium text-primary-500 uppercase mt-1">{label}</p>
    </div>
  );
}

// A small chevron-in-a-circle button used to collapse/expand a classroom card across the
// various Admin panels (Verification, Analytics, Student Management). Purely a UI toggle -
// collapsing never affects underlying data, just what's rendered.
function CollapseToggle({ collapsed, onClick, label }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={collapsed ? 'Expand' : 'Collapse'}
      className="shrink-0 w-8 h-8 rounded-full bg-primary-50 text-primary-600 hover:bg-primary-100 flex items-center justify-center font-bold text-sm transition-fast"
      aria-label={label || (collapsed ? 'Expand' : 'Collapse')}
    >
      {collapsed ? '▸' : '▾'}
    </button>
  );
}

// Shared collapse/expand state helpers used by every admin list (Classrooms, Staff & Adults,
// Verification, Analytics). A section is treated as collapsed by default — only an explicit
// `false` in the map (the user clicked to expand it) counts as expanded — so long lists open
// fully collapsed instead of dumping every card open at once.
function isSectionCollapsed(map, id) { return map[id] !== false; }
function toggleSection(setMap, id) {
  setMap(prev => ({ ...prev, [id]: isSectionCollapsed(prev, id) ? false : true }));
}

// isStaff switches this to the simplified Staff & Adults summary: just Staff count (how many
// staff are marked "Yes" for lunch) and Adult count (the separate adults/parents counter, when
// that card is enabled for this classroom) — no hot/sack/absent/milk breakdown applies to staff.
function FloatingSummary({ totals, hideMilk, isStaff, staffCount, adultsCount }) {
  if (isStaff) {
    return (
      <div className="hidden lg:flex flex-col gap-2 fixed left-4 top-28 z-30 bg-white rounded-2xl card-shadow-lg border border-primary-100 p-4 w-36">
        <p className="font-bold text-primary-900 text-sm leading-tight">Staff count: {staffCount || 0}</p>
        {adultsCount != null && <p className="font-bold text-primary-900 text-sm leading-tight">Adult count: {adultsCount || 0}</p>}
      </div>
    );
  }
  return (
    <div className="hidden lg:flex flex-col gap-2 fixed left-4 top-28 z-30 bg-white rounded-2xl card-shadow-lg border border-primary-100 p-4 w-36">
      <p className="font-bold text-primary-900 text-sm leading-tight">Hot: {totals.hot}</p>
      <p className="font-bold text-primary-900 text-sm leading-tight">Sack: {totals.sack}</p>
      <p className="font-bold text-primary-900 text-sm leading-tight">Absent: {totals.absent}</p>
      {!hideMilk && <p className="font-bold text-primary-900 text-sm leading-tight">Milk: {totals.milk}</p>}
    </div>
  );
}

function PrimaryButton({ children, onClick, className, disabled, type }) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      disabled={disabled}
      className={"btn-touch px-5 py-3 rounded-xl bg-primary text-white font-semibold text-base transition-fast hover:bg-primary-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed " + (className || '')}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick, className, type }) {
  return (
    <button
      type={type || 'button'}
      onClick={onClick}
      className={"btn-touch px-5 py-3 rounded-xl bg-white text-primary font-semibold text-base border-2 border-primary-200 transition-fast hover:bg-primary-50 active:scale-[0.98] " + (className || '')}
    >
      {children}
    </button>
  );
}

// Reserved for destructive actions (bulk deletes) so they're visually distinct from the
// everyday primary/ghost buttons used everywhere else.
function DangerButton({ children, onClick, disabled, className }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={"btn-touch px-5 py-3 rounded-xl bg-rose-600 text-white font-semibold text-base transition-fast hover:bg-rose-700 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed " + (className || '')}
    >
      {children}
    </button>
  );
}

// Manual-dismiss only: the teacher must tap a button to leave this modal, it never auto-closes.
// Pass `children` to replace the default single "Back to Home" button with custom navigation
// options (see the post-Lunch-Pre-Count flow in ClassroomWorkspace) while keeping the same
// classic green success styling.
function SuccessModal({ title, message, onDone, children, topLeftLabel, onTopLeft }) {
  return (
    <div className="fixed inset-0 bg-primary-900/50 flex items-center justify-center z-50 p-4">
      <div className="relative bg-white rounded-2xl card-shadow-lg p-8 w-full max-w-sm text-center border-4 border-green-500">
        {topLeftLabel && (
          <button
            onClick={onTopLeft}
            className="absolute top-4 left-4 text-primary font-semibold text-xs hover:underline"
          >
            &larr; {topLeftLabel}
          </button>
        )}
        <div className="w-16 h-16 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-3xl mx-auto mb-4">✓</div>
        <h2 className="text-xl font-bold text-green-700 mb-2">{title}</h2>
        <p className="text-sm font-light text-primary-600 mb-6">{message}</p>
        {children ? children : (
          <button
            onClick={onDone}
            className="btn-touch w-full px-5 py-3 rounded-xl bg-green-600 text-white font-semibold text-base transition-fast hover:bg-green-700 active:scale-[0.98]"
          >
            Back to Home
          </button>
        )}
      </div>
    </div>
  );
}

// Simple plus/minus counter card used for the "Staff & Adults" classroom's adult/parent lunch
// count. count is a plain number (>= 0); onChange receives the new number.
function AdultsCounterCard({ count, onChange, disabled, label }) {
  const c = count || 0;
  function set(next) { if (!disabled) onChange(Math.max(0, next)); }
  return (
    <div className="rounded-2xl card-shadow p-5 border-2 border-dashed border-primary-200 bg-primary-50 flex items-center justify-between gap-4 max-w-sm">
      <div>
        <p className="font-bold text-primary-900">{label || 'Adults / Parents Eating'}</p>
        <p className="text-xs font-light text-primary-500">Tap +/- to adjust the count</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={disabled}
          onClick={() => set(c - 1)}
          className="btn-touch w-11 h-11 rounded-full bg-white border-2 border-primary-300 text-primary-700 font-bold text-xl flex items-center justify-center hover:bg-primary-100 disabled:opacity-40"
        >−</button>
        <span className="text-2xl font-bold text-primary-900 w-8 text-center">{c}</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => set(c + 1)}
          className="btn-touch w-11 h-11 rounded-full bg-white border-2 border-primary-300 text-primary-700 font-bold text-xl flex items-center justify-center hover:bg-primary-100 disabled:opacity-40"
        >+</button>
      </div>
    </div>
  );
}

/* ============================ DAILY DEVICE PASSWORD GATE ============================ */
function DailyPasswordGate({ children }) {
  const [authed, setAuthed] = useState(() => {
    try { return localStorage.getItem(DEVICE_AUTH_STORAGE_KEY) === todayStr(); } catch (e) { return false; }
  });
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');

  function submit(e) {
    e.preventDefault();
    if (pw === DAILY_PASSWORD) {
      try { localStorage.setItem(DEVICE_AUTH_STORAGE_KEY, todayStr()); } catch (e) {}
      setAuthed(true);
      setError('');
    } else {
      setError('Incorrect password. Please try again.');
      setPw('');
    }
  }

  if (authed) return children;

  return (
    <div className="fixed inset-0 bg-primary-900 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl card-shadow-lg p-8 w-full max-w-sm text-center">
        <div className="text-4xl mb-3">🍞</div>
        <h2 className="text-xl font-bold text-primary-900 mb-1">Counting Loaves - St. Mary</h2>
        <p className="text-sm font-light text-primary-600 mb-6">Enter the access password to continue.</p>
        <form onSubmit={submit}>
          <input
            autoFocus
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(''); }}
            placeholder="Access password"
            className="w-full border-2 border-primary-200 rounded-xl px-4 py-3 mb-3 text-center focus:outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
          <PrimaryButton type="submit" className="w-full">Unlock for Today</PrimaryButton>
        </form>
      </div>
    </div>
  );
}

/* ============================ SETUP SCREEN (NO FIREBASE CONFIG YET) ============================ */
function SetupRequiredScreen() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <h2 className="text-2xl font-bold text-primary-900 mb-3 text-center">Connect Firebase to get started</h2>
      <p className="text-primary-600 font-light mb-6 text-center">
        This app stores all data in Firebase so every teacher and admin sees the same live counts.
        Open the &lt;script&gt; block near the top of this file and replace the <code>firebaseConfig</code> placeholder
        values with your project's config.
      </p>
      <ol className="text-sm text-primary-700 font-light list-decimal list-inside space-y-2 bg-white rounded-2xl card-shadow p-6 border border-primary-100">
        <li>Create a project at console.firebase.google.com</li>
        <li>Enable Cloud Firestore (Build &rarr; Firestore Database)</li>
        <li>Enable Authentication &rarr; Sign-in method &rarr; Email/Password</li>
        <li>Create at least one admin user under Authentication &rarr; Users</li>
        <li>Copy your Web App config into <code>firebaseConfig</code> in this file</li>
        <li>Apply the suggested Firestore security rules included as a comment near the config</li>
      </ol>
    </div>
  );
}