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
// to Staff & Adults classrooms, and any stage an admin has disabled is skipped entirely (not just
// locked) — including from the "you must submit X first" gating for the stages that remain.
function activeStages(cls) {
  const isStaff = !!(cls && cls.type === 'staff');
  const stages = [];
  if (stageEnabled(cls, 'pre')) stages.push('pre');
  if (!isStaff && stageEnabled(cls, 'breakfast')) stages.push('breakfast');
  if (stageEnabled(cls, 'final')) stages.push('final');
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
// that staff member is eating lunch today (yes/no), defaulting to "no" so the teacher/admin only
// needs to flip on the people who ARE eating. No absent/sack/hot/milk options apply to staff.
function defaultStaffEntry() { return { attending: false }; }
function emptyStaffEntries(roster) {
  const e = {};
  roster.forEach(s => { e[s.id] = defaultStaffEntry(); });
  return e;
}
function tallyStaffEntries(entries, roster) {
  let yes = 0, no = 0;
  roster.forEach(s => {
    const e = (entries && entries[s.id]) || defaultStaffEntry();
    if (e.attending) yes++; else no++;
  });
  return { yes, no, total: roster.length };
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

/* ============================ AGGREGATION (ANALYTICS + EXPORT) ============================ */
// Everywhere below explicitly excludes "Staff & Adults" classrooms (cls.type === 'staff') from
// student meal-count reporting: those classrooms track adult/staff lunches, which shouldn't be
// mixed into student reimbursement analytics or the official Monthly Meal Count Export.
function aggregateRange(data, startDate, endDate) {
  const result = {};
  data.classrooms.forEach(c => { if (c.type !== 'staff') result[c.id] = { hot: 0, sack: 0, absent: 0, milk: 0 }; });
  data.logs.forEach(log => {
    const d = parseDateStr(log.date);
    if (d < startDate || d > endDate) return;
    if (!result[log.classroomId]) return;
    if (!log.final || !log.final.submitted) return;
    const roster = data.students.filter(s => s.classroomId === log.classroomId);
    const t = tallyEntries(log.final.entries, roster);
    result[log.classroomId].hot += t.hot;
    result[log.classroomId].sack += t.sack;
    result[log.classroomId].absent += t.absent;
    result[log.classroomId].milk += t.milk;
  });
  return result;
}
function aggregateRangeByStudent(data, startDate, endDate) {
  const staffClassroomIds = new Set(data.classrooms.filter(c => c.type === 'staff').map(c => c.id));
  const result = {};
  data.students.forEach(s => { if (!staffClassroomIds.has(s.classroomId)) result[s.id] = { hot: 0, sack: 0, absent: 0, milk: 0 }; });
  data.logs.forEach(log => {
    const d = parseDateStr(log.date);
    if (d < startDate || d > endDate) return;
    if (!log.final || !log.final.submitted) return;
    const roster = data.students.filter(s => s.classroomId === log.classroomId);
    roster.forEach(s => {
      if (!result[s.id]) return;
      const e = (log.final.entries && log.final.entries[s.id]) || defaultEntry();
      if (e.absent) { result[s.id].absent++; return; }
      if (e.meal === 'hot') result[s.id].hot++; else result[s.id].sack++;
      if (e.milk === 'yes') result[s.id].milk++;
    });
  });
  return result;
}

/* ============================ TODAY SNAPSHOT (ADMIN ANALYTICS "TODAY" CARDS) ============================ */
// Live, cross-classroom snapshot for today only, powering the two Analytics cards: a
// PreCount card (fills in live as teachers work through Today's Lunch Count, before anyone
// submits or verifies anything) and a Verified Count card (only counts classroom-days an admin
// has actually verified). Staff & Adults classrooms are excluded, same reasoning as
// aggregateRange above.
function computeTodayPreCountSnapshot(data) {
  const today = todayStr();
  let hot = 0, sack = 0, absent = 0, milkHot = 0, milkSack = 0;
  data.classrooms.forEach(cls => {
    if (cls.type === 'staff') return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const log = data.logsById[logId(today, cls.id)];
    const entries = (log && log.pre && log.pre.entries) || {};
    const t = tallyEntriesSplitMilk(entries, roster, defaultEntry);
    hot += t.hot; sack += t.sack; absent += t.absent; milkHot += t.milkHot; milkSack += t.milkSack;
  });
  return { hot, sack, absent, milkHot, milkSack };
}
// IMPORTANT: this must tally the *same way* computeTodayPreCountSnapshot does (split milk by
// meal type, same fallback-entry rules) so that once a classroom is verified, "Today's Verified
// Count" reconciles exactly against what "Today's PreCount" showed live for that classroom
// earlier in the day — no silent unit mismatch between the two cards (e.g. one combining milk
// into a single number while the other splits it, which made the two totals impossible to
// reconcile even when nothing about the underlying counts had actually changed).
function computeTodayVerifiedSnapshot(data) {
  const today = todayStr();
  let hot = 0, sack = 0, absent = 0, milkHot = 0, milkSack = 0;
  data.classrooms.forEach(cls => {
    if (cls.type === 'staff') return;
    const log = data.logsById[logId(today, cls.id)];
    if (!log || !log.verified) return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const t = tallyEntriesSplitMilk((log.final && log.final.entries) || {}, roster, defaultEntry);
    hot += t.hot; sack += t.sack; absent += t.absent; milkHot += t.milkHot; milkSack += t.milkSack;
  });
  return { hot, sack, absent, milkHot, milkSack };
}

// Live snapshot of today's Staff & Adults lunch counts, for the admin "Today's PreCount" card.
// Mirrors computeTodayPreCountSnapshot above but reads the staff Yes/No entries plus each
// classroom's separate adults/parents counter, since those are a different shape of data.
function computeTodayStaffAdultSnapshot(data) {
  const today = todayStr();
  let staffLunch = 0, adultLunch = 0;
  data.classrooms.forEach(cls => {
    if (cls.type !== 'staff') return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const log = data.logsById[logId(today, cls.id)];
    const entries = (log && log.pre && log.pre.entries) || {};
    const t = tallyStaffEntries(entries, roster);
    staffLunch += t.yes;
    if (cls.showAdultCard) adultLunch += (log && log.pre && log.pre.adultsCount) || 0;
  });
  return { staffLunch, adultLunch };
}

// Verified counterpart to computeTodayStaffAdultSnapshot: only counts a Staff & Adults
// classroom's Final Lunch Count once an admin has verified that classroom for today, reading
// the same final entries / adultsCount fields the Verification tab locks in. Without this, the
// Verified Count card had no staff/adult figures at all, even though the PreCount card does.
function computeTodayVerifiedStaffAdultSnapshot(data) {
  const today = todayStr();
  let staffLunch = 0, adultLunch = 0;
  data.classrooms.forEach(cls => {
    if (cls.type !== 'staff') return;
    const log = data.logsById[logId(today, cls.id)];
    if (!log || !log.verified) return;
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const entries = (log.final && log.final.entries) || {};
    const t = tallyStaffEntries(entries, roster);
    staffLunch += t.yes;
    if (cls.showAdultCard) {
      const preAdultsCount = (log.pre && log.pre.adultsCount) || 0;
      adultLunch += (log.final && typeof log.final.adultsCount === 'number') ? log.final.adultsCount : preAdultsCount;
    }
  });
  return { staffLunch, adultLunch };
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
// Staff & Adults classrooms are excluded (see AGGREGATION note above).
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
      if (!log || !log.final || !log.final.submitted) return;
      hasData = true;
      const band = bandForGrade(data.settings, cls.grade);
      const roster = data.students.filter(s => s.classroomId === cls.id);
      roster.forEach(s => {
        const e = (log.final.entries && log.final.entries[s.id]) || defaultEntry();
        if (e.absent) return;
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
// official reimbursement report. Returns [{ date, classroom }, ...] sorted by date.
function findUnverifiedLunchDays(data, year, month) {
  const numDays = daysInMonth(year, month);
  const problems = [];
  for (let day = 1; day <= numDays; day++) {
    const dateStr = year + '-' + pad2(month) + '-' + pad2(day);
    sortClassroomsByGrade(data.classrooms).forEach(cls => {
      const log = data.logsById[logId(dateStr, cls.id)];
      if (log && log.final && log.final.submitted && !log.verified) {
        problems.push({ date: dateStr, classroom: cls });
      }
    });
  }
  return problems;
}

// Builds a SheetJS workbook that mirrors the official monthly reimbursable meal count sheet:
// same headers, same merged cells (Day of the Month / Student Lunches / Reimbursable), a Month
// and Year field, one row per day 1-31 with live =SUM() formulas for Total Paid and Total, and
// a Total row at the bottom that sums every column. Note: the free/community build of SheetJS
// (loaded from the CDN) writes values, formulas, and merges faithfully, but it does not persist
// cell styling (bold headers, borders) the way the original template file has them — the numbers
// and formulas will match exactly, but you may want to re-apply borders/bold once opened in Excel.
function buildMonthlyMealCountWorkbook(data, year, month) {
  const days = buildMonthlyMealCountDays(data, year, month);
  const ws = {};
  function setCell(addr, value, isFormula) {
    if (value === undefined || value === null) return;
    if (isFormula) { ws[addr] = { t: 'n', f: value }; return; }
    if (typeof value === 'number') { ws[addr] = { t: 'n', v: value }; return; }
    ws[addr] = { t: 's', v: String(value) };
  }

  setCell('A1', 'Day of the Month');
  setCell('B1', 'Student Lunches');
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
    const r = day + 3; // day 1 -> row 4, matching the template
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

function downloadMonthlyMealCountXLSX(data, year, month) {
  const wb = buildMonthlyMealCountWorkbook(data, year, month);
  const filename = 'lunch-count-' + year + '-' + pad2(month) + '.xlsx';
  XLSX.writeFile(wb, filename);
}

/* ============================ MONTHLY BREAKFAST COUNT EXPORT ============================ */
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
function SuccessModal({ title, message, onDone, children }) {
  return (
    <div className="fixed inset-0 bg-primary-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl card-shadow-lg p-8 w-full max-w-sm text-center border-4 border-green-500">
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

/* ============================ LOGIN MODAL (FIREBASE AUTH) ============================ */
function AdminLoginModal({ onClose, onSuccess }) {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.signInWithEmailAndPassword(email.trim(), pw);
      onSuccess();
    } catch (err) {
      setError((err && err.message) ? err.message : 'Sign-in failed. Check your email and password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-primary-900/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl card-shadow-lg p-6 w-full max-w-sm">
        <h2 className="text-xl font-bold text-primary-900 mb-1">Admin Access</h2>
        <p className="text-sm font-light text-primary-700 mb-4">Sign in with your administrator account to continue.</p>
        <form onSubmit={submit}>
          <input
            autoFocus
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setError(''); }}
            placeholder="Email"
            className="w-full border-2 border-primary-200 rounded-xl px-4 py-3 mb-2 focus:outline-none focus:border-primary"
          />
          <input
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setError(''); }}
            placeholder="Password"
            className="w-full border-2 border-primary-200 rounded-xl px-4 py-3 mb-2 focus:outline-none focus:border-primary"
          />
          {error && <p className="text-sm text-rose-600 mb-2">{error}</p>}
          <div className="flex gap-2 mt-2">
            <GhostButton onClick={onClose} className="flex-1">Cancel</GhostButton>
            <PrimaryButton type="submit" disabled={busy} className="flex-1">{busy ? 'Signing In…' : 'Log In'}</PrimaryButton>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ============================ NAV BAR ============================ */
function NavBar({ role, onRequestRole }) {
  return (
    <div className="bg-primary text-white sticky top-0 z-40 card-shadow">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <img
            src="Logo-school.png"
            alt="St. Mary Catholic School Logo"
            className="h-10 w-auto"
          />
          <div>
            <h1 className="text-lg sm:text-xl font-bold leading-tight tracking-wide">St. Mary Catholic School</h1>
            <p className="text-xs sm:text-sm font-light text-primary-100">Counting Loaves · Lunch Counter App</p>
          </div>
        </div>
        <div className="flex bg-primary-700 rounded-xl p-1 gap-1">
          <button
            onClick={() => onRequestRole('teacher')}
            className={"btn-touch px-4 py-2 rounded-lg font-semibold text-sm transition-fast " + (role === 'teacher' ? 'bg-white text-primary' : 'text-white hover:bg-primary-600')}
          >
            Teacher View
          </button>
          <button
            onClick={() => onRequestRole('admin')}
            className={"btn-touch px-4 py-2 rounded-lg font-semibold text-sm transition-fast " + (role === 'admin' ? 'bg-white text-primary' : 'text-white hover:bg-primary-600')}
          >
            Admin View
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================ NO SCHOOL BANNER ============================ */
function NoSchoolBanner({ label }) {
  return (
    <div className="mb-6 bg-rose-50 border-2 border-rose-300 text-rose-800 rounded-2xl p-5 text-center">
      <p className="text-lg font-bold">🚫 No School Today</p>
      {label && label !== 'No School' && <p className="text-sm font-light mt-1">{label}</p>}
      <p className="text-sm font-light mt-1">Count entry is locked for today. Check back on the next school day.</p>
    </div>
  );
}

/* ============================ TEACHER: OVERVIEW ============================ */
function TeacherOverview({ data, onOpenClassroom, onOpenBreakfastFinal }) {
  const today = todayStr();
  const noSchool = isNoSchoolDay(data.settings, today);
  const holiday = holidayFor(data.settings, today);
  const sortedClassrooms = useMemo(() => sortClassroomsByGrade(data.classrooms), [data.classrooms]);

  // Summarizes today's cross-classroom Breakfast Verification workload: how many classrooms
  // actually have a breakfast pre-count that targeted today (i.e. submitted the prior school
  // day for today), how many students that adds up to, and how many of those classrooms have
  // already had their pickups verified/submitted for today.
  const breakfastSummary = useMemo(() => {
    let totalRequested = 0, classroomsWithData = 0, classroomsCompleted = 0;
    data.classrooms.forEach(cls => {
      const sourceLog = data.logs.find(l => l.classroomId === cls.id && l.breakfast && l.breakfast.submitted && l.breakfast.targetDate === today);
      if (!sourceLog) return;
      const roster = data.students.filter(s => s.classroomId === cls.id);
      const requested = roster.filter(s => {
        const e = (sourceLog.breakfast.entries || {})[s.id] || defaultBreakfastEntry();
        return !e.absent && e.meal === 'hot';
      });
      if (requested.length === 0) return;
      classroomsWithData++;
      totalRequested += requested.length;
      const todayLog = data.logsById[logId(today, cls.id)];
      if (todayLog && todayLog.breakfastFinal && todayLog.breakfastFinal.submitted) classroomsCompleted++;
    });
    return { totalRequested, classroomsWithData, classroomsCompleted };
  }, [data, today]);
  const breakfastStatus = breakfastSummary.classroomsWithData === 0 ? 'Not Started' :
    (breakfastSummary.classroomsCompleted >= breakfastSummary.classroomsWithData ? 'Completed' : 'In Progress');

  if (data.classrooms.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">No classrooms yet</h2>
        <p className="text-primary-600 font-light">Ask your administrator to add classrooms under Admin View &rarr; Classrooms.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-primary-900">Today is {formatDisplayDate(today)}</h2>
        <p className="text-primary-600 font-light">Select a classroom to take Today's Lunch Count, the Breakfast Pre-Count, or Today's Final Lunch Count.</p>
      </div>

      {noSchool && <NoSchoolBanner label={holiday && holiday.label} />}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {sortedClassrooms.map(cls => {
          const isStaff = cls.type === 'staff';
          const roster = data.students.filter(s => s.classroomId === cls.id);
          const log = data.logsById[logId(today, cls.id)];
          const preStatus = (log && log.pre && log.pre.submitted) ? 'Completed' : (log && log.pre ? 'In Progress' : 'Not Started');
          const classroomBreakfastStatus = (log && log.breakfast && log.breakfast.submitted) ? 'Completed' : (log && log.breakfast ? 'In Progress' : 'Not Started');
          const finalStatus = (log && log.final && log.final.submitted) ? 'Completed' : (log && log.final ? 'In Progress' : 'Not Started');
          const verified = !!(log && log.verified);
          // Admin-configured required counts (Admin -> Classrooms) override the default
          // pre/breakfast/final trio entirely: only show the badges for stages actually enabled
          // for this classroom, exactly like the entry-step modal already does.
          const activeSteps = activeStages(cls);
          return (
            <button
              key={cls.id}
              onClick={() => { if (!noSchool) onOpenClassroom(cls.id); }}
              disabled={noSchool}
              className={"text-left bg-white rounded-2xl card-shadow p-6 border transition-fast btn-touch " + (noSchool ? 'opacity-50 cursor-not-allowed border-primary-100' : 'hover:card-shadow-lg border-primary-100 hover:border-primary-300')}
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-xl font-bold text-primary-900">{cls.grade}{isStaff && ' 🧑‍🏫'}</h3>
                  <p className="text-sm font-medium text-primary-500">{cls.teacher}</p>
                </div>
                {verified && <Badge status="Verified" />}
              </div>
              {activeSteps.indexOf('pre') !== -1 && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-primary-400 uppercase w-28">Today's Lunch Count</span>
                  <Badge status={preStatus} />
                </div>
              )}
              {activeSteps.indexOf('breakfast') !== -1 && (
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-primary-400 uppercase w-28">Breakfast Pre-Count</span>
                  <Badge status={classroomBreakfastStatus} />
                </div>
              )}
              {activeSteps.indexOf('final') !== -1 && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-primary-400 uppercase w-28">Final Lunch Count</span>
                  <Badge status={finalStatus} />
                </div>
              )}
              {activeSteps.length === 0 && (
                <p className="text-xs font-medium text-primary-400 uppercase mb-3">No counts enabled</p>
              )}
              <p className="text-sm font-light text-primary-600">{roster.length} {isStaff ? 'staff' : 'students'}</p>
            </button>
          );
        })}
      </div>

      {/* Spacer separating each teacher's own classroom counts from the cross-classroom, morning-of
          Breakfast Verification workflow below. */}
      <div className="my-10 border-t-2 border-primary-100"></div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-primary-900">Breakfast Count</h2>
        <p className="text-primary-600 font-light">This is for morning of breakfast count only. Teachers, your breakfast pre-count is in your class' classroom tab.</p>
      </div>

      <button
        onClick={() => { if (!noSchool) onOpenBreakfastFinal(); }}
        disabled={noSchool}
        className={"text-left bg-white rounded-2xl card-shadow p-6 border transition-fast btn-touch w-full sm:w-auto sm:min-w-[340px] " + (noSchool ? 'opacity-50 cursor-not-allowed border-primary-100' : 'hover:card-shadow-lg border-primary-100 hover:border-primary-300')}
      >
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold text-primary-900">Breakfast Verification</h3>
          <Badge status={breakfastStatus} />
        </div>
        <p className="text-sm font-light text-primary-600 mb-1">
          Verify which students picked up breakfast this morning, {formatDisplayDate(today)}.
        </p>
        <p className="text-sm font-light text-primary-500">
          {breakfastSummary.classroomsWithData === 0 ? 'No classrooms have a breakfast pre-count for today yet.' : (breakfastSummary.totalRequested + ' student' + (breakfastSummary.totalRequested === 1 ? '' : 's') + ' across ' + breakfastSummary.classroomsWithData + ' classroom' + (breakfastSummary.classroomsWithData === 1 ? '' : 's'))}
        </p>
      </button>
    </div>
  );
}

/* ============================ BREAKFAST VERIFICATION (CROSS-CLASSROOM, MORNING-OF) ============================ */
// This is the "Breakfast Count" tile from the Home page. Unlike everything else in
// ClassroomWorkspace (which is scoped to one classroom), this screen spans every classroom at
// once: it's for whoever runs breakfast that morning to confirm which students who requested
// breakfast in YESTERDAY's (or the last school day's) Breakfast Pre-Count actually picked it up
// TODAY. Data is written into TODAY's log doc per classroom, under `breakfastFinal`, entirely
// separate from that classroom's own Lunch Pre-Count / Breakfast Pre-Count / Lunch Final Count.

// A small pill-button row card, distinct from StudentEntryCard's meal-toggle layout, since this
// screen shows many students across many classrooms and needs to stay scannable in one column.
function BreakfastFinalCard({ student, entry, onChange, disabled }) {
  const e = entry || defaultBreakfastFinalEntry();
  function set(patch) { if (!disabled) onChange({ ...e, ...patch }); }
  const cardColor = e.absent ? 'bg-gray-100 border-gray-300' : (e.meal === 'hot' ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300');
  return (
    <div className={"rounded-xl card-shadow p-3 border flex items-center justify-between gap-3 transition-fast " + cardColor}>
      <p className={"font-semibold text-primary-900 text-sm truncate " + (e.absent ? 'opacity-60' : '')}>
        <span className="text-primary-400 font-medium">#{student.number}</span> {student.firstName} {student.lastName}
      </p>
      <div className="flex gap-1.5 shrink-0">
        <button
          type="button"
          disabled={disabled}
          onClick={() => set({ absent: false, meal: 'hot' })}
          className={"btn-touch px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 transition-fast " + (!e.absent && e.meal === 'hot' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-primary-600 border-primary-200 hover:bg-primary-50')}
        >
          Picked Up
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => set({ absent: false, meal: 'sack' })}
          className={"btn-touch px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 transition-fast " + (!e.absent && e.meal === 'sack' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-primary-600 border-primary-200 hover:bg-primary-50')}
        >
          No Show
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => set({ absent: !e.absent })}
          className={"btn-touch px-2.5 py-1.5 rounded-lg text-xs font-bold transition-fast " + (e.absent ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100')}
        >
          {e.absent ? 'Undo Absent' : 'Absent'}
        </button>
      </div>
    </div>
  );
}

// Aggregated 3-column review across every classroom, mirroring the look of the Lunch Count's
// ReviewScreen (colored bordered columns, stat totals, sticky submit bar) before the final
// "Submit Breakfast Verification" writes breakfastFinal for every classroom shown at once.
function BreakfastFinalReview({ groups, onEdit, onSubmit, dateLabel }) {
  const pickedUp = [], noShow = [], absent = [];
  groups.forEach(g => {
    g.roster.forEach(s => {
      const e = (g.bf.entries && g.bf.entries[s.id]) || defaultBreakfastFinalEntry();
      const item = { student: s, cls: g.cls };
      if (e.absent) absent.push(item);
      else if (e.meal === 'hot') pickedUp.push(item);
      else noShow.push(item);
    });
  });
  const columns = [
    { key: 'picked', label: 'Picked Up', items: pickedUp, color: 'border-green-300 bg-green-50' },
    { key: 'noshow', label: 'No Show', items: noShow, color: 'border-amber-300 bg-amber-50' },
    { key: 'absent', label: 'Absent', items: absent, color: 'border-gray-300 bg-gray-50' }
  ];
  return (
    <div>
      <button onClick={onEdit} className="text-primary font-semibold text-sm mb-4 hover:underline">&larr; Edit / Go Back</button>
      <h2 className="text-2xl font-bold text-primary-900 mb-1">Review Breakfast Verification</h2>
      <p className="text-primary-600 font-light mb-6">For today &middot; {dateLabel}</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Picked Up" value={pickedUp.length} />
        <StatCard label="No Show" value={noShow.length} />
        <StatCard label="Absent" value={absent.length} />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {columns.map(col => (
          <div key={col.key} className={"rounded-2xl border-2 p-3 " + col.color}>
            <div className="flex justify-between items-center mb-3 px-1">
              <h3 className="font-bold text-primary-900 text-sm uppercase tracking-wide">{col.label}</h3>
              <span className="text-sm font-bold text-primary-900 bg-white rounded-full px-2.5 py-0.5 border border-primary-100">{col.items.length}</span>
            </div>
            <div className="flex flex-col gap-2 min-h-[60px]">
              {col.items.length === 0 && <p className="text-xs font-light text-primary-400 text-center py-4">No students</p>}
              {col.items.map(({ student, cls }) => (
                <div key={cls.id + '_' + student.id} className="bg-white rounded-xl card-shadow border border-primary-100 p-3">
                  <p className="font-medium text-primary-900 truncate text-sm"><span className="text-primary-400">#{student.number}</span> {student.firstName} {student.lastName}</p>
                  <p className="text-xs font-light text-primary-500">{cls.grade}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 bg-secondary/95 backdrop-blur pt-4 pb-2 border-t border-primary-100">
        <div className="flex justify-end gap-3">
          <GhostButton onClick={onEdit}>Edit / Go Back</GhostButton>
          <PrimaryButton onClick={onSubmit}>Submit Breakfast Verification</PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function BreakfastFinalView({ data, onBack }) {
  const today = todayStr();
  const noSchool = isNoSchoolDay(data.settings, today);
  const holiday = holidayFor(data.settings, today);
  const [reviewing, setReviewing] = useState(false);
  const [successInfo, setSuccessInfo] = useState(false);

  const sortedClassrooms = useMemo(() => sortClassroomsByGrade(data.classrooms), [data.classrooms]);

  // One group per classroom, in K -> 8th order. A classroom only shows up here if it actually
  // has a Breakfast Pre-Count that targeted TODAY (submitted on the prior school day); only the
  // students who requested breakfast in that pre-count (not absent, meal === 'hot') are listed.
  const groups = useMemo(() => sortedClassrooms.map(cls => {
    const roster = data.students.filter(s => s.classroomId === cls.id);
    const sourceLog = data.logs.find(l => l.classroomId === cls.id && l.breakfast && l.breakfast.submitted && l.breakfast.targetDate === today);
    const requested = sourceLog
      ? roster.filter(s => {
          const e = (sourceLog.breakfast.entries || {})[s.id] || defaultBreakfastEntry();
          return !e.absent && e.meal === 'hot';
        })
      : [];
    const todayLog = data.logsById[logId(today, cls.id)];
    const bf = (todayLog && todayLog.breakfastFinal) || { entries: {}, submitted: false, submittedAt: null, sourceDate: sourceLog ? sourceLog.date : null };
    return { cls, roster: sortStudents(requested, 'number'), sourceLog, bf, todayLog, verified: !!(todayLog && todayLog.breakfastVerified) };
  }).filter(g => g.sourceLog && g.roster.length > 0), [sortedClassrooms, data.students, data.logs, data.logsById, today]);

  const anyStudents = groups.length > 0;

  async function updateEntry(classroomId, studentId, entry) {
    const group = groups.find(g => g.cls.id === classroomId);
    const log = group.todayLog;
    const baseBF = group.bf;
    const newBF = { ...baseBF, entries: { ...baseBF.entries, [studentId]: entry }, sourceDate: baseBF.sourceDate || (group.sourceLog && group.sourceLog.date) };
    await saveLogFull(today, classroomId, {
      pre: log ? log.pre : undefined,
      breakfast: log ? log.breakfast : undefined,
      final: log ? log.final : undefined,
      verified: log ? log.verified : false,
      verifiedAt: log ? log.verifiedAt : null,
      breakfastFinal: newBF,
      breakfastVerified: log ? log.breakfastVerified : false,
      breakfastVerifiedAt: log ? log.breakfastVerifiedAt : null
    });
  }

  async function submitAll() {
    for (const g of groups) {
      const log = g.todayLog;
      const fullEntries = {};
      g.roster.forEach(s => { fullEntries[s.id] = (g.bf.entries && g.bf.entries[s.id]) || defaultBreakfastFinalEntry(); });
      await saveLogFull(today, g.cls.id, {
        pre: log ? log.pre : undefined,
        breakfast: log ? log.breakfast : undefined,
        final: log ? log.final : undefined,
        verified: log ? log.verified : false,
        verifiedAt: log ? log.verifiedAt : null,
        breakfastFinal: { entries: fullEntries, submitted: true, submittedAt: new Date().toISOString(), sourceDate: g.sourceLog.date },
        breakfastVerified: log ? log.breakfastVerified : false,
        breakfastVerifiedAt: log ? log.breakfastVerifiedAt : null
      });
    }
    setReviewing(false);
    setSuccessInfo(true);
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <button onClick={onBack} className="text-primary font-semibold text-sm mb-4 hover:underline">&larr; Back to Overview</button>

      {/* Make it unmistakable this screen is for TODAY, not the next school day (which is what
          the per-classroom Breakfast Pre-Count is for) — the two are easy to confuse otherwise. */}
      <div className="mb-6 bg-primary text-white rounded-2xl p-5 text-center card-shadow">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-100 mb-1">Breakfast Verification</p>
        <p className="text-xl font-bold">🍳 You are taking breakfast for TODAY — {formatDisplayDate(today)}</p>
      </div>

      {noSchool && <NoSchoolBanner label={holiday && holiday.label} />}

      {!noSchool && !anyStudents && (
        <div className="bg-white rounded-2xl card-shadow p-8 text-center border border-primary-100">
          <p className="text-primary-600 font-light">No classroom has a Breakfast Pre-Count on file for today yet, so there's nothing to verify.</p>
        </div>
      )}

      {!noSchool && anyStudents && (
        reviewing ? (
          <BreakfastFinalReview groups={groups} onEdit={() => setReviewing(false)} onSubmit={submitAll} dateLabel={formatDisplayDate(today)} />
        ) : (
          <React.Fragment>
            {groups.map(g => (
              <div key={g.cls.id} className="mb-8">
                <h3 className="text-lg font-bold text-primary-900 mb-3 pb-2 border-b-2 border-primary-100">
                  {g.cls.grade} &middot; {g.cls.teacher}{' '}
                  <span className="text-sm font-light text-primary-500">({g.roster.length} requested breakfast)</span>
                  {g.verified && <span className="ml-2"><Badge status="Verified" /></span>}
                </h3>
                <div className="flex flex-col gap-2 max-w-2xl">
                  {g.roster.map(s => (
                    <BreakfastFinalCard
                      key={s.id}
                      student={s}
                      entry={(g.bf.entries && g.bf.entries[s.id]) || defaultBreakfastFinalEntry()}
                      onChange={(entry) => updateEntry(g.cls.id, s.id, entry)}
                      disabled={g.verified}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div className="sticky bottom-0 bg-secondary/95 backdrop-blur pt-4 pb-2 border-t border-primary-100">
              <div className="flex justify-end gap-3">
                <GhostButton onClick={onBack}>Cancel</GhostButton>
                <PrimaryButton onClick={() => setReviewing(true)}>Review Breakfast Verification &rarr;</PrimaryButton>
              </div>
            </div>
          </React.Fragment>
        )
      )}

      {successInfo && (
        <SuccessModal title="Breakfast Verification Submitted!" message={"Today's breakfast pickups have been recorded for " + formatDisplayDate(today) + "."}>
          <button
            onClick={onBack}
            className="btn-touch w-full px-5 py-3 rounded-xl bg-green-600 text-white font-semibold text-base transition-fast hover:bg-green-700 active:scale-[0.98]"
          >
            Back to Home
          </button>
        </SuccessModal>
      )}
    </div>
  );
}

/* ============================ STUDENT ENTRY CARD ============================ */
// kind: 'lunch' (default), 'breakfast', or 'final'. All three share the same entry shape
// ({ absent, meal, milk }) and interaction model — only the meal-option labels, the presence of
// the Milk Choice section, and the card's color coding differ:
//  - 'breakfast': labeled "Breakfast" / "No Breakfast" and has NO milk choice at all (breakfast
//     only tracks status, never milk).
//  - 'final': the Lunch Final Count card. Color-coded so a teacher scrolling a long single-column
//     list can tell status at a glance — warm orange for Hot Lunch, blueish for Sack Lunch, and
//     greyed-out for Absent with a distinct red "Undo Absent" box in the card's top-right corner.
//  - 'lunch' (default, used for the Lunch Pre-Count): the original neutral white/grey styling.
// Staff & Adults classrooms use a plain Yes/No card: is this staff member eating lunch today?
// No absent option, no hot/sack choice, no milk choice — just attending or not, default No.
function StaffEntryCard({ student, entry, onChange, disabled }) {
  const e = entry || defaultStaffEntry();
  function set(attending) { if (!disabled) onChange({ attending }); }
  return (
    <div className={"relative rounded-2xl card-shadow p-4 border flex items-center justify-between gap-3 transition-fast " + (e.attending ? 'bg-green-50 border-green-300' : 'bg-white border-primary-100')}>
      <p className="font-semibold text-primary-900 truncate">
        {student.position ? <span className="text-primary-400 font-medium">{student.position} &middot; </span> : null}{student.firstName} {student.lastName}
      </p>
      <div className="flex gap-2 shrink-0">
        {[[true,'Yes'],[false,'No']].map(([val,label]) => (
          <button
            key={String(val)}
            type="button"
            disabled={disabled}
            onClick={() => set(val)}
            className={"btn-touch px-4 py-2 rounded-xl font-semibold text-sm transition-fast border-2 " + ((!!e.attending) === val ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StudentEntryCard({ student, entry, onChange, disabled, kind, isStaff }) {
  const isBreakfast = kind === 'breakfast';
  const isFinal = kind === 'final';
  if (isStaff) return <StaffEntryCard student={student} entry={entry} onChange={onChange} disabled={disabled} />;
  const e = entry || (isBreakfast ? defaultBreakfastEntry() : defaultEntry());
  function set(patch) { if (!disabled) onChange({ ...e, ...patch }); }
  function setMeal(meal) { set({ meal, milk: meal === 'hot' ? 'yes' : 'no' }); }

  const cardColor = e.absent
    ? 'bg-gray-100 border-gray-300'
    : isFinal
      ? (e.meal === 'hot' ? 'bg-orange-50 border-orange-300' : 'bg-blue-50 border-blue-300')
      : 'bg-white border-primary-100';

  return (
    <div className={"relative rounded-2xl card-shadow p-4 border flex flex-col gap-3 transition-fast " + cardColor}>
      <div className="flex items-start justify-between gap-2">
        <p className={"font-semibold text-primary-900 truncate " + (e.absent ? 'opacity-60' : '')}>
          <span className="text-primary-400 font-medium">#{student.number}</span> {student.firstName} {student.lastName}
        </p>
        {isFinal ? (
          e.absent ? (
            <button
              type="button"
              disabled={disabled}
              onClick={() => set({ absent: false })}
              className="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg bg-white border-2 border-red-300 text-red-600 hover:bg-red-50 transition-fast cursor-pointer"
            >
              Undo Absent
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => set({ absent: true })}
              className="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100 transition-fast cursor-pointer"
            >
              Mark Absent
            </button>
          )
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => set({ absent: !e.absent })}
            className={"shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-full transition-fast cursor-pointer " + (e.absent ? 'bg-rose-600 text-white' : 'bg-rose-50 text-rose-600 hover:bg-rose-100')}
          >
            {e.absent ? 'Undo Absent' : 'Mark Absent'}
          </button>
        )}
      </div>

      <div className={e.absent ? 'opacity-40 pointer-events-none select-none' : ''}>
        <p className="text-xs font-medium text-primary-500 mb-1 uppercase tracking-wide">{isBreakfast ? 'Breakfast' : 'Meal'}</p>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMeal('hot')}
            className={"flex-1 btn-touch rounded-xl font-semibold text-sm transition-fast border-2 " + (e.meal === 'hot' ? (isFinal ? 'bg-orange-500 text-white border-orange-500' : 'bg-primary text-white border-primary') : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100')}
          >
            {isBreakfast ? 'Breakfast' : 'Hot Lunch'}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setMeal('sack')}
            className={"flex-1 btn-touch rounded-xl font-semibold text-sm transition-fast border-2 " + (e.meal === 'sack' ? (isFinal ? 'bg-blue-500 text-white border-blue-500' : 'bg-gray-200 text-blue-700 border-gray-300') : 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100')}
          >
            {isBreakfast ? 'No Breakfast' : 'Sack Lunch'}
          </button>
        </div>
        {!isBreakfast && (
          <React.Fragment>
            <p className="text-xs font-medium text-primary-500 mb-1 uppercase tracking-wide">Milk Choice</p>
            <div className="flex gap-2">
              {[['yes','Yes'],['no','No']].map(([val,label]) => (
                <button
                  type="button"
                  key={val}
                  disabled={disabled}
                  onClick={() => set({ milk: val })}
                  className={"flex-1 btn-touch rounded-xl font-semibold text-xs transition-fast border-2 " + (e.milk === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}
                >
                  {label}
                </button>
              ))}
            </div>
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

/* ============================ TEACHER: 3-COLUMN REVIEW SCREEN ============================ */
function ReviewStatusControl({ entry, onChange, kind }) {
  const isBreakfast = kind === 'breakfast';
  const options = isBreakfast
    ? [['hot','Breakfast'], ['sack','No Breakfast'], ['absent','Absent']]
    : [['hot','Hot Lunch'], ['sack','Sack Lunch'], ['absent','Absent']];
  const current = entry.absent ? 'absent' : entry.meal;
  return (
    <select
      value={current}
      onChange={e => {
        const v = e.target.value;
        if (v === 'absent') onChange({ ...entry, absent: true });
        else onChange({ ...entry, absent: false, meal: v, milk: v === 'hot' ? 'yes' : 'no' });
      }}
      className="text-xs font-semibold border-2 border-primary-200 rounded-lg px-2 py-1 bg-white"
    >
      {options.map(([val,label]) => <option key={val} value={val}>{label}</option>)}
    </select>
  );
}

function ReviewStudentCard({ student, entry, onChange, kind }) {
  const isBreakfast = kind === 'breakfast';
  return (
    <div className="bg-white rounded-xl card-shadow border border-primary-100 p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-primary-900 truncate text-sm"><span className="text-primary-400">#{student.number}</span> {student.firstName} {student.lastName}</p>
        {!entry.absent && !isBreakfast && (
          <div className="flex gap-1 mt-1">
            {[['yes','Milk: Yes'],['no','Milk: No']].map(([val,label]) => (
              <button
                key={val}
                type="button"
                onClick={() => onChange({ ...entry, milk: val })}
                className={"px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-fast " + (entry.milk === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-600 border-primary-200 hover:bg-primary-50')}
              >{label}</button>
            ))}
          </div>
        )}
      </div>
      <ReviewStatusControl entry={entry} onChange={onChange} kind={kind} />
    </div>
  );
}

// Simple Yes/No pill for a staff member's row inside the Staff & Adults review screen — no
// milk/meal-type controls apply here.
function StaffReviewCard({ student, entry, onChange }) {
  const e = entry || defaultStaffEntry();
  return (
    <div className="bg-white rounded-xl card-shadow border border-primary-100 p-3 flex items-center gap-3">
      <p className="font-medium text-primary-900 truncate text-sm flex-1 min-w-0">{student.position ? <span className="text-primary-400">{student.position} &middot; </span> : null}{student.firstName} {student.lastName}</p>
      <select
        value={e.attending ? 'yes' : 'no'}
        onChange={ev => onChange({ attending: ev.target.value === 'yes' })}
        className="text-xs font-semibold border-2 border-primary-200 rounded-lg px-2 py-1 bg-white"
      >
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </div>
  );
}

function ReviewScreen({ stage, cls, roster, entries, onChangeEntry, onEdit, onSubmit, targetDateLabel, adultsCount, onChangeAdults, showAdultCard, isStaff }) {
  const isBreakfast = stage === 'breakfast';

  if (isStaff) {
    const staffTotals = tallyStaffEntries(entries, roster);
    const yesStaff = [], noStaff = [];
    roster.forEach(s => {
      const e = entries[s.id] || defaultStaffEntry();
      (e.attending ? yesStaff : noStaff).push(s);
    });
    const titles = { pre: "Review Today's Lunch Count", final: "Review Today's Final Lunch Count" };
    const submitLabels = { pre: "Submit Today's Lunch Count", final: "Submit Today's Final Lunch Count" };
    return (
      <div>
        <FloatingSummary isStaff staffCount={staffTotals.yes} adultsCount={showAdultCard ? adultsCount : null} />
        <button onClick={onEdit} className="text-primary font-semibold text-sm mb-4 hover:underline">&larr; Edit / Go Back</button>
        <h2 className="text-2xl font-bold text-primary-900 mb-1">{titles[stage]}</h2>
        <p className="text-primary-600 font-light mb-6">{cls.grade} &middot; {cls.teacher} &middot; {formatDisplayDate(todayStr())}</p>

        {showAdultCard && (
          <div className="mb-6">
            <AdultsCounterCard count={adultsCount} onChange={onChangeAdults} />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6 sm:max-w-sm">
          <StatCard label="Staff Count" value={staffTotals.yes} />
          <StatCard label="Adult Count" value={adultsCount || 0} />
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {[{ key: 'yes', label: 'Yes', students: yesStaff, color: 'border-green-300 bg-green-50' }, { key: 'no', label: 'No', students: noStaff, color: 'border-gray-300 bg-gray-50' }].map(col => (
            <div key={col.key} className={"rounded-2xl border-2 p-3 " + col.color}>
              <div className="flex justify-between items-center mb-3 px-1">
                <h3 className="font-bold text-primary-900 text-sm uppercase tracking-wide">{col.label}</h3>
                <span className="text-sm font-bold text-primary-900 bg-white rounded-full px-2.5 py-0.5 border border-primary-100">{col.students.length}</span>
              </div>
              <div className="flex flex-col gap-2 min-h-[60px]">
                {col.students.length === 0 && <p className="text-xs font-light text-primary-400 text-center py-4">No staff</p>}
                {col.students.map(s => (
                  <StaffReviewCard key={s.id} student={s} entry={entries[s.id] || defaultStaffEntry()} onChange={(entry) => onChangeEntry(s.id, entry)} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 bg-secondary/95 backdrop-blur pt-4 pb-2 border-t border-primary-100">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <p className="text-sm text-primary-600 font-light lg:hidden">Staff Count {staffTotals.yes}{showAdultCard ? (' \u00b7 Adult Count ' + (adultsCount || 0)) : ''}</p>
            <div className="flex gap-3 ml-auto">
              <GhostButton onClick={onEdit}>Edit / Go Back</GhostButton>
              <PrimaryButton onClick={onSubmit}>{submitLabels[stage]}</PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const defaultFn = isBreakfast ? defaultBreakfastEntry : defaultEntry;
  const totals = tallyEntries(entries, roster, defaultFn);
  const hotStudents = [], sackStudents = [], absentStudents = [];
  roster.forEach(s => {
    const e = entries[s.id] || defaultFn();
    if (e.absent) absentStudents.push(s);
    else if (e.meal === 'hot') hotStudents.push(s);
    else sackStudents.push(s);
  });

  const titles = { pre: "Review Today's Lunch Count", breakfast: 'Review Breakfast Pre-Count', final: "Review Today's Final Lunch Count" };
  const submitLabels = { pre: "Submit Today's Lunch Count", breakfast: 'Submit Breakfast Pre-Count', final: "Submit Today's Final Lunch Count" };
  const title = titles[stage];
  const submitLabel = submitLabels[stage];

  const columns = isBreakfast
    ? [
        { key: 'hot', label: 'Breakfast', students: hotStudents, color: 'border-green-300 bg-green-50' },
        { key: 'sack', label: 'No Breakfast', students: sackStudents, color: 'border-amber-300 bg-amber-50' },
        { key: 'absent', label: 'Absent', students: absentStudents, color: 'border-gray-300 bg-gray-50' }
      ]
    : [
        { key: 'hot', label: 'Hot Lunch', students: hotStudents, color: 'border-green-300 bg-green-50' },
        { key: 'sack', label: 'Sack Lunch', students: sackStudents, color: 'border-amber-300 bg-amber-50' },
        { key: 'absent', label: 'Absent', students: absentStudents, color: 'border-gray-300 bg-gray-50' }
      ];

  return (
    <div>
      <FloatingSummary totals={totals} hideMilk={isBreakfast} />
      <button onClick={onEdit} className="text-primary font-semibold text-sm mb-4 hover:underline">&larr; Edit / Go Back</button>
      <h2 className="text-2xl font-bold text-primary-900 mb-1">{title}</h2>
      <p className="text-primary-600 font-light mb-6">
        {cls.grade} &middot; {cls.teacher} &middot; {isBreakfast ? ('For ' + targetDateLabel) : formatDisplayDate(todayStr())}
      </p>

      {showAdultCard && (
        <div className="mb-6">
          <AdultsCounterCard count={adultsCount} onChange={onChangeAdults} />
        </div>
      )}

      <div className={"grid grid-cols-2 gap-3 mb-6 " + (isBreakfast ? 'sm:grid-cols-3' : 'sm:grid-cols-4')}>
        <StatCard label={isBreakfast ? 'Breakfast' : 'Hot Lunch'} value={totals.hot} />
        <StatCard label={isBreakfast ? 'No Breakfast' : 'Sack Lunch'} value={totals.sack} />
        <StatCard label="Absent" value={totals.absent} />
        {!isBreakfast && <StatCard label="Milk" value={totals.milk} />}
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {columns.map(col => (
          <div key={col.key} className={"rounded-2xl border-2 p-3 " + col.color}>
            <div className="flex justify-between items-center mb-3 px-1">
              <h3 className="font-bold text-primary-900 text-sm uppercase tracking-wide">{col.label}</h3>
              <span className="text-sm font-bold text-primary-900 bg-white rounded-full px-2.5 py-0.5 border border-primary-100">{col.students.length}</span>
            </div>
            <div className="flex flex-col gap-2 min-h-[60px]">
              {col.students.length === 0 && <p className="text-xs font-light text-primary-400 text-center py-4">No students</p>}
              {col.students.map(s => (
                <ReviewStudentCard
                  key={s.id}
                  student={s}
                  entry={entries[s.id] || defaultFn()}
                  onChange={(entry) => onChangeEntry(s.id, entry)}
                  kind={isBreakfast ? 'breakfast' : 'lunch'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 bg-secondary/95 backdrop-blur pt-4 pb-2 border-t border-primary-100">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <p className="text-sm text-primary-600 font-light lg:hidden">
            {isBreakfast ? 'Breakfast' : 'Hot'} {totals.hot} &middot; {isBreakfast ? 'No Breakfast' : 'Sack'} {totals.sack} &middot; Absent {totals.absent}{!isBreakfast ? (' \u00b7 Milk ' + totals.milk) : ''}
          </p>
          <div className="flex gap-3 ml-auto">
            <GhostButton onClick={onEdit}>Edit / Go Back</GhostButton>
            <PrimaryButton onClick={onSubmit}>{submitLabel}</PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ TEACHER: CLASSROOM ENTRY MODAL ============================ */
// Enforces the required order: Today's Lunch Count -> Breakfast Pre-Count (for the next school day) ->
// Today's Final Lunch Count. Each step unlocks only once the one before it has been submitted.
// For "Staff & Adults" classrooms (isStaff), the Breakfast Pre-Count step is skipped entirely -
// only Today's Lunch Count and Today's Final Lunch Count are offered.
// steps: the ordered list of stages actually offered for this classroom (see activeStages()) —
// disabled stages (an admin unchecked them under Admin -> Classrooms) are skipped entirely, not
// just locked, and the "submit X first" gating only looks at whichever stage remains before it.
function ClassroomEntryModal({ cls, isStaff, steps, preSubmitted, breakfastSubmitted, finalSubmitted, targetDateLabel, onSelectPre, onSelectBreakfast, onSelectFinal, onClose }) {
  const [lockedError, setLockedError] = useState('');

  const submittedMap = { pre: preSubmitted, breakfast: breakfastSubmitted, final: finalSubmitted };
  const selectFns = { pre: onSelectPre, breakfast: onSelectBreakfast, final: onSelectFinal };
  const labels = { pre: "Today's Lunch Count", breakfast: "Breakfast Pre-Count (for " + targetDateLabel + ")", final: "Today's Final Lunch Count" };

  function handleClick(stage, idx) {
    const prevStage = steps[idx - 1];
    if (prevStage && !submittedMap[prevStage]) { setLockedError(stage); return; }
    selectFns[stage]();
  }

  function StepButton({ step, label, done, locked, sublabel, onClick }) {
    return (
      <div>
        <button
          type="button"
          onClick={onClick}
          className={"btn-touch w-full px-5 py-3 rounded-xl font-semibold text-base border-2 transition-fast flex items-center justify-center gap-2 " +
            (locked ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' :
              done ? 'bg-green-100 text-green-800 border-green-400' : 'bg-primary text-white border-primary hover:bg-primary-700')}
        >
          <span className="text-xs font-bold uppercase bg-white/40 rounded-full px-2 py-0.5">{step}</span>
          <span>{label}</span>
          {done && <span className="text-xs font-bold uppercase">✓ Done</span>}
          {locked && <span>🔒</span>}
        </button>
        {sublabel && <p className="text-xs text-primary-500 font-light mt-2 text-center">{sublabel}</p>}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-primary-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl card-shadow-lg p-6 w-full max-w-sm">
        <div className="flex justify-between items-start gap-3 mb-1">
          <div>
            <h2 className="text-xl font-bold text-primary-900">{cls.grade}</h2>
            <p className="text-sm font-light text-primary-600">{cls.teacher}</p>
          </div>
          <button onClick={onClose} className="text-primary-400 hover:text-primary-700 text-2xl leading-none">&times;</button>
        </div>
        <p className="text-sm font-light text-primary-600 mb-5 mt-2">Complete these steps in order.</p>

        <div className="flex flex-col gap-3">
          {steps.map((stage, idx) => {
            const prevStage = steps[idx - 1];
            const locked = !!prevStage && !submittedMap[prevStage];
            const done = submittedMap[stage];
            return (
              <StepButton
                key={stage}
                step={String(idx + 1)}
                label={labels[stage]}
                done={done}
                locked={locked}
                sublabel={lockedError === stage ? ('Submit ' + labels[prevStage] + ' first.') : (!locked && !done && idx > 0 ? ('Ready for ' + labels[stage] + '.') : null)}
                onClick={() => handleClick(stage, idx)}
              />
            );
          })}
          {steps.length === 0 && <p className="text-sm font-light text-primary-500 text-center py-4">All counts are disabled for this classroom. Ask your admin to enable one under Admin &rarr; Classrooms.</p>}
        </div>

        <button onClick={onClose} className="text-primary font-semibold text-sm mt-5 hover:underline w-full text-center">Close &amp; Return Home</button>
      </div>
    </div>
  );
}

/* ============================ TEACHER: CLASSROOM WORKSPACE ============================ */
// Enforces the required step order for every day: Today's Lunch Count -> Breakfast Pre-Count (for
// the next school day, skipped entirely for Staff & Adults classrooms) -> Today's Final Lunch
// Count. The final count automatically carries over the pre-count's entries until the teacher
// changes something, exactly like before; breakfast is its own independent count each day,
// targeting whichever day is next on the school calendar.
function ClassroomWorkspace({ data, classroomId, onBack }) {
  const cls = data.classrooms.find(c => c.id === classroomId);
  const isStaff = !!(cls && cls.type === 'staff');
  const showAdultCard = isStaff && !!(cls && cls.showAdultCard);
  const roster = data.students.filter(s => s.classroomId === classroomId);
  const today = todayStr();
  const todayLog = data.logsById[logId(today, classroomId)];
  const verified = !!(todayLog && todayLog.verified);
  const noSchool = isNoSchoolDay(data.settings, today);
  const holiday = holidayFor(data.settings, today);
  const breakfastTargetDate = useMemo(() => nextSchoolDay(data.settings, today), [data.settings, today]);

  const [stage, setStage] = useState('pre');
  const [reviewing, setReviewing] = useState(false);
  const [successInfo, setSuccessInfo] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(!verified);
  const [sortBy, setSortBy] = useState('number');

  const steps = useMemo(() => activeStages(cls), [cls]);

  useEffect(() => {
    if (steps.length && steps.indexOf(stage) === -1) setStage(steps[0]);
    // eslint-disable-next-line
  }, [steps.join(',')]);

  useEffect(() => {
    if (!todayLog) {
      saveLogFull(today, classroomId, {
        pre: { entries: isStaff ? emptyStaffEntries(roster) : emptyEntries(roster), submitted: false, submittedAt: null, adultsCount: 0 },
        breakfast: { entries: emptyBreakfastEntries(roster), submitted: false, submittedAt: null, targetDate: breakfastTargetDate },
        // NOTE: final.entries starts as a truly empty {} — NOT emptyEntries(roster). If it were
        // pre-filled with generic default entries here, `hasOwnFinalEntries` below would see a
        // non-empty map immediately and treat that as "the teacher's own final count", so the
        // Lunch Final Count screen would show generic Hot-Lunch-for-everyone defaults instead of
        // mirroring the morning Pre-Count. Leaving this {} lets `finalEntries` fall through to
        // `preEntries` (and stay in sync with it) until the teacher actually touches Final.
        final: { entries: {}, submitted: false, submittedAt: null },
        verified: false,
        verifiedAt: null
      });
    }
    // eslint-disable-next-line
  }, []);

  if (!cls) return null;

  const locked = verified || noSchool;

  const preEntries = (todayLog && todayLog.pre && todayLog.pre.entries) || (isStaff ? emptyStaffEntries(roster) : emptyEntries(roster));
  const breakfastEntries = (todayLog && todayLog.breakfast && todayLog.breakfast.entries) || emptyBreakfastEntries(roster);
  // True only once the teacher has actually put their own data into Final (by editing a card
  // while on the Final stage, or by submitting Final at least once). Until then this stays
  // false, so `finalEntries` below live-mirrors whatever is in the Pre-Count — including any
  // pre-count edits made after the daily log was first created.
  const hasOwnFinalEntries = todayLog && todayLog.final && todayLog.final.entries && Object.keys(todayLog.final.entries).length > 0;
  const finalEntries = hasOwnFinalEntries ? todayLog.final.entries : preEntries;

  const preAdultsCount = (todayLog && todayLog.pre && todayLog.pre.adultsCount) || 0;
  const finalAdultsCount = (todayLog && todayLog.final && typeof todayLog.final.adultsCount === 'number') ? todayLog.final.adultsCount : preAdultsCount;

  const preSubmitted = !!(todayLog && todayLog.pre && todayLog.pre.submitted);
  const breakfastSubmitted = !!(todayLog && todayLog.breakfast && todayLog.breakfast.submitted);
  const finalSubmitted = !!(todayLog && todayLog.final && todayLog.final.submitted);

  function emptyBase() {
    return {
      pre: { entries: isStaff ? emptyStaffEntries(roster) : emptyEntries(roster), submitted: false, submittedAt: null, adultsCount: 0 },
      breakfast: { entries: emptyBreakfastEntries(roster), submitted: false, submittedAt: null, targetDate: breakfastTargetDate },
      // Same reasoning as the useEffect above: keep this {} so a fresh/never-touched Final Count
      // mirrors the Pre-Count instead of generic defaults.
      final: { entries: {}, submitted: false, submittedAt: null },
      verified: false,
      verifiedAt: null
    };
  }

  async function updateEntry(targetStage, studentId, entry) {
    if (locked) return;
    const base = todayLog || emptyBase();
    if (targetStage === 'pre') {
      const newPre = { ...base.pre, entries: { ...base.pre.entries, [studentId]: entry } };
      await saveLogFull(today, classroomId, { ...base, pre: newPre });
    } else if (targetStage === 'breakfast') {
      const newBreakfast = { ...base.breakfast, entries: { ...(base.breakfast ? base.breakfast.entries : {}), [studentId]: entry }, targetDate: (base.breakfast && base.breakfast.targetDate) || breakfastTargetDate };
      await saveLogFull(today, classroomId, { ...base, breakfast: newBreakfast });
    } else {
      const currentFinalEntries = (base.final && Object.keys(base.final.entries || {}).length) ? base.final.entries : preEntries;
      const newFinal = { ...(base.final || {}), entries: { ...currentFinalEntries, [studentId]: entry } };
      await saveLogFull(today, classroomId, { ...base, final: newFinal });
    }
  }

  async function updateAdults(targetStage, count) {
    if (locked) return;
    const base = todayLog || emptyBase();
    if (targetStage === 'pre') {
      await saveLogFull(today, classroomId, { ...base, pre: { ...base.pre, adultsCount: count } });
    } else {
      const currentFinalEntries = (base.final && Object.keys(base.final.entries || {}).length) ? base.final.entries : preEntries;
      await saveLogFull(today, classroomId, { ...base, final: { ...(base.final || {}), entries: currentFinalEntries, adultsCount: count } });
    }
  }

  async function submitPre() {
    const base = todayLog || emptyBase();
    await saveLogFull(today, classroomId, { ...base, pre: { entries: preEntries, submitted: true, submittedAt: new Date().toISOString(), adultsCount: preAdultsCount } });
    setSuccessInfo({ stage: 'pre' });
  }

  async function submitBreakfast() {
    const base = todayLog || emptyBase();
    await saveLogFull(today, classroomId, { ...base, breakfast: { entries: breakfastEntries, submitted: true, submittedAt: new Date().toISOString(), targetDate: breakfastTargetDate } });
    setSuccessInfo({ stage: 'breakfast' });
  }

  async function submitFinal() {
    const base = todayLog || emptyBase();
    await saveLogFull(today, classroomId, { ...base, final: { entries: finalEntries, submitted: true, submittedAt: new Date().toISOString(), adultsCount: finalAdultsCount } });
    setSuccessInfo({ stage: 'final' });
  }

  function handleDone() {
    setSuccessInfo(null);
    setReviewing(false);
    onBack();
  }

  // After Today's Lunch Count is submitted, keep the teacher in this workspace and drop them
  // straight into the Breakfast Pre-Count instead of sending them back Home (skipped for staff
  // classrooms, which go straight to Today's Final Lunch Count instead).
  function goToBreakfastFromSuccess() {
    setSuccessInfo(null);
    setReviewing(false);
    setStage('breakfast');
  }
  function goToFinalFromSuccess() {
    setSuccessInfo(null);
    setReviewing(false);
    setStage('final');
  }

  const submitFns = { pre: submitPre, breakfast: submitBreakfast, final: submitFinal };
  const activeEntries = stage === 'pre' ? preEntries : stage === 'breakfast' ? breakfastEntries : finalEntries;
  const activeAdultsCount = stage === 'final' ? finalAdultsCount : preAdultsCount;
  const staffTotals = isStaff ? tallyStaffEntries(activeEntries, roster) : null;
  const totals = isStaff ? null : tallyEntries(activeEntries, roster, stage === 'breakfast' ? defaultBreakfastEntry : defaultEntry);
  const sortedRoster = isStaff ? sortStudents(roster, 'order') : sortStudents(roster, sortBy);
  const stageLabels = { pre: "Today's Lunch Count", breakfast: 'Breakfast Pre-Count', final: "Today's Final Lunch Count" };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 lg:pl-40">
      {!reviewing && roster.length > 0 && (
        <FloatingSummary
          totals={totals}
          hideMilk={stage === 'breakfast'}
          isStaff={isStaff}
          staffCount={staffTotals && staffTotals.yes}
          adultsCount={showAdultCard ? activeAdultsCount : null}
        />
      )}

      {showEntryModal && roster.length > 0 && (
        <ClassroomEntryModal
          cls={cls}
          isStaff={isStaff}
          steps={steps}
          preSubmitted={preSubmitted}
          breakfastSubmitted={breakfastSubmitted}
          finalSubmitted={finalSubmitted}
          targetDateLabel={formatShortDate(breakfastTargetDate)}
          onSelectPre={() => { setStage('pre'); setReviewing(false); setShowEntryModal(false); }}
          onSelectBreakfast={() => { setStage('breakfast'); setReviewing(false); setShowEntryModal(false); }}
          onSelectFinal={() => { setStage('final'); setReviewing(false); setShowEntryModal(false); }}
          onClose={onBack}
        />
      )}

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <button onClick={onBack} className="text-primary font-semibold text-sm mb-2 hover:underline">&larr; Back to Overview</button>
          <h2 className="text-2xl font-bold text-primary-900">{cls.grade}</h2>
          <p className="text-primary-600 font-light">{cls.teacher} &middot; {formatDisplayDate(today)}</p>
        </div>
        {verified && <Badge status="Verified" />}
      </div>

      {noSchool && <NoSchoolBanner label={holiday && holiday.label} />}

      {verified && (
        <div className="mb-6 bg-purple-50 border border-purple-300 text-purple-800 rounded-xl p-4 text-sm font-medium">
          An administrator has verified and finalized today's counts for this classroom. Counts can no longer be edited.
        </div>
      )}

      {roster.length === 0 ? (
        <div className="bg-white rounded-2xl card-shadow p-8 text-center border border-primary-100">
          <p className="text-primary-600 font-light">No {isStaff ? 'staff' : 'students'} assigned to this classroom yet. Ask your admin to add {isStaff ? 'staff' : 'students'} under Admin View &rarr; {isStaff ? 'Staff & Adults' : 'Students'}.</p>
        </div>
      ) : reviewing ? (
        <ReviewScreen
          stage={stage}
          cls={cls}
          roster={sortedRoster}
          entries={activeEntries}
          targetDateLabel={formatDisplayDate(breakfastTargetDate)}
          onChangeEntry={(studentId, entry) => updateEntry(stage, studentId, entry)}
          onEdit={() => setReviewing(false)}
          onSubmit={submitFns[stage]}
          adultsCount={activeAdultsCount}
          onChangeAdults={(count) => updateAdults(stage, count)}
          showAdultCard={showAdultCard && stage !== 'breakfast'}
          isStaff={isStaff}
        />
      ) : (
        <React.Fragment>
          <div className="flex gap-2 mb-6 flex-wrap">
            {steps.length === 0 && (
              <p className="text-sm font-light text-primary-500">All counts are disabled for this classroom. Ask your admin to enable one under Admin &rarr; Classrooms.</p>
            )}
            {(() => {
              const stepLabels = { pre: "Today's Lunch Count", breakfast: 'Breakfast Pre-Count', final: "Today's Final Lunch Count" };
              const submittedMap = { pre: preSubmitted, breakfast: breakfastSubmitted, final: finalSubmitted };
              return steps.map((stg, idx) => {
                const prevStage = steps[idx - 1];
                const isLocked = !!prevStage && !submittedMap[prevStage];
                return (
                  <button
                    key={stg}
                    onClick={() => { if (!isLocked) setStage(stg); }}
                    disabled={isLocked}
                    title={isLocked ? ('Submit ' + stepLabels[prevStage] + ' first') : ''}
                    className={"btn-touch px-5 py-2.5 rounded-xl font-semibold text-sm transition-fast border-2 disabled:opacity-40 disabled:cursor-not-allowed " + (stage === stg ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}
                  >
                    {idx + 1}. {stepLabels[stg]} {submittedMap[stg] ? '✓' : ''}{isLocked ? ' 🔒' : ''}
                  </button>
                );
              });
            })()}
          </div>

          {!preSubmitted && stage === 'pre' && !isStaff && (
            <div className="mb-6 bg-primary-50 border border-primary-200 text-primary-700 rounded-xl p-4 text-sm font-medium">
              Complete and submit Today's Lunch Count before the Breakfast Pre-Count unlocks.
            </div>
          )}
          {stage === 'pre' && preSubmitted && !locked && (
            <div className="mb-6 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-4 text-sm font-medium">
              Today's Lunch Count was already submitted. You can still make corrections and re-submit.
            </div>
          )}
          {stage === 'breakfast' && (
            <div className="mb-6 bg-primary-50 border border-primary-200 text-primary-700 rounded-xl p-4 text-sm font-medium">
              This breakfast pre-count is for the next school day: {formatDisplayDate(breakfastTargetDate)}.
            </div>
          )}
          {stage === 'breakfast' && breakfastSubmitted && !locked && (
            <div className="mb-6 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-4 text-sm font-medium">
              The breakfast pre-count was already submitted for {formatShortDate(breakfastTargetDate)}. You can still make corrections and re-submit.
            </div>
          )}
          {stage === 'final' && finalSubmitted && !locked && (
            <div className="mb-6 bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-4 text-sm font-medium">
              Today's Final Lunch Count was already submitted. You can still switch any status and re-submit before it's verified by an admin.
            </div>
          )}
          {stage === 'final' && !hasOwnFinalEntries && (
            <div className="mb-6 bg-primary-50 border border-primary-200 text-primary-700 rounded-xl p-4 text-sm font-medium">
              Starting from Today's Lunch Count. Switch any status below before submitting.
            </div>
          )}

          {showAdultCard && stage !== 'breakfast' && (
            <div className="mb-6">
              <AdultsCounterCard count={activeAdultsCount} onChange={(count) => updateAdults(stage, count)} disabled={locked} />
            </div>
          )}

          {isStaff ? (
            <p className="text-xs font-light text-primary-500 mb-4 text-right">Card order is set by your admin under Staff &amp; Adults Management.</p>
          ) : (
            <div className="flex items-center justify-end gap-2 mb-4">
              <label className="text-xs font-medium text-primary-500 uppercase">Sort by</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1.5 text-sm">
                <option value="number">Student #</option>
                <option value="first">First Name</option>
                <option value="last">Last Name</option>
              </select>
            </div>
          )}

          <div className={stage === 'final' ? 'flex flex-col gap-4 mb-8 max-w-2xl' : 'grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8'}>
            {sortedRoster.map(s => (
              <StudentEntryCard
                key={s.id}
                student={s}
                entry={activeEntries[s.id] || (isStaff ? defaultStaffEntry() : stage === 'breakfast' ? defaultBreakfastEntry() : defaultEntry())}
                onChange={(entry) => updateEntry(stage, s.id, entry)}
                disabled={locked}
                kind={stage === 'breakfast' ? 'breakfast' : stage === 'final' ? 'final' : 'lunch'}
                isStaff={isStaff}
              />
            ))}
          </div>

          <div className="sticky bottom-0 bg-secondary/95 backdrop-blur pt-4 pb-2 border-t border-primary-100">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <p className="text-sm text-primary-600 font-light lg:hidden">
                {isStaff ? ('Staff count ' + (staffTotals ? staffTotals.yes : 0) + (showAdultCard ? (' \u00b7 Adult count ' + (activeAdultsCount || 0)) : '')) :
                  (totals.hot + ' \u00b7 ' + totals.sack + ' \u00b7 Absent ' + totals.absent + (stage !== 'breakfast' ? (' \u00b7 Milk ' + totals.milk) : ''))}
              </p>
              <div className="flex gap-3 ml-auto">
                <GhostButton onClick={onBack}>Cancel</GhostButton>
                <PrimaryButton disabled={locked} onClick={() => setReviewing(true)}>
                  Review {stageLabels[stage]} &rarr;
                </PrimaryButton>
              </div>
            </div>
          </div>
        </React.Fragment>
      )}

      {successInfo && successInfo.stage === 'pre' && (() => {
        const nextStage = steps[steps.indexOf('pre') + 1];
        if (!nextStage) {
          return (
            <SuccessModal title="Lunch Count Submitted!" message="Today's Lunch Count has been saved." onDone={handleDone} />
          );
        }
        const isNextBreakfast = nextStage === 'breakfast';
        return (
          <SuccessModal
            title="Lunch Count Submitted!"
            message={isNextBreakfast
              ? ("Today's Lunch Count has been saved. Next, take the Breakfast Pre-Count for " + formatShortDate(breakfastTargetDate) + '.')
              : "Today's Lunch Count has been saved. Next, take Today's Final Lunch Count."}
          >
            <div className="flex flex-col gap-3">
              <button
                onClick={isNextBreakfast ? goToBreakfastFromSuccess : goToFinalFromSuccess}
                className="btn-touch w-full px-5 py-3 rounded-xl bg-green-600 text-white font-semibold text-base transition-fast hover:bg-green-700 active:scale-[0.98]"
              >
                {isNextBreakfast ? 'Take Breakfast Pre-Count Next \u2192' : "Take Today's Final Lunch Count Next \u2192"}
              </button>
              <button
                onClick={handleDone}
                className="btn-touch w-full px-4 py-2.5 rounded-xl bg-gray-100 text-gray-400 font-medium text-sm border border-gray-200 hover:bg-gray-200 hover:text-gray-500 transition-fast"
              >
                Return Home
              </button>
            </div>
          </SuccessModal>
        );
      })()}

      {successInfo && successInfo.stage !== 'pre' && (
        <SuccessModal
          title={successInfo.stage === 'breakfast' ? 'Breakfast Pre-Count Submitted!' : 'Final Count Submitted!'}
          message={
            successInfo.stage === 'breakfast' ? 'The Breakfast Pre-Count has been saved for ' + formatShortDate(breakfastTargetDate) + ". Next, complete Today's Final Lunch Count." :
            "Today's Final Lunch Count has been saved for today."
          }
          onDone={handleDone}
        />
      )}
    </div>
  );
}

/* ============================ ADMIN: VERIFICATION ============================ */
function LunchVerificationTab({ data }) {
  const [dateVal, setDateVal] = useState(todayStr());
  const [expanded, setExpanded] = useState({});
  const [collapsed, setCollapsed] = useState({});

  function toggleExpand(id) { setExpanded(prev => ({ ...prev, [id]: !prev[id] })); }
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }

  async function verifyClassroom(cls) {
    const log = data.logsById[logId(dateVal, cls.id)];
    const finalSubmitted = !!(log && log.final && log.final.submitted);
    if (!finalSubmitted) {
      const proceed = confirm(
        "Today's Final Lunch Count for " + classroomLabel(cls) + ' has not been submitted (or was not submitted properly) for ' +
        formatDisplayDate(dateVal) + '.\n\nVerify and finalize it anyway?'
      );
      if (!proceed) return;
    }
    await saveLogFull(dateVal, cls.id, { ...(log || {}), verified: true, verifiedAt: new Date().toISOString() });
  }
  async function unverifyClassroom(cls) {
    const log = data.logsById[logId(dateVal, cls.id)];
    if (!log) return;
    await saveLogFull(dateVal, cls.id, { ...log, verified: false, verifiedAt: null });
  }
  async function verifyAll() {
    const unverified = data.classrooms.filter(cls => {
      const log = data.logsById[logId(dateVal, cls.id)];
      return !(log && log.verified);
    });
    if (unverified.length === 0) { alert('No unverified classrooms remain for this date.'); return; }
    const submitted = unverified.filter(cls => {
      const log = data.logsById[logId(dateVal, cls.id)];
      return !!(log && log.final && log.final.submitted);
    });
    const notSubmitted = unverified.filter(cls => submitted.indexOf(cls) === -1);

    let toVerify;
    if (notSubmitted.length === 0) {
      if (!confirm('Verify and finalize ' + submitted.length + ' classroom(s) for ' + formatDisplayDate(dateVal) + '?')) return;
      toVerify = submitted;
    } else {
      const names = notSubmitted.map(classroomLabel).join(', ');
      const proceed = confirm(
        "The following classroom(s) have not submitted (or did not submit properly) Today's Final Lunch Count for " +
        formatDisplayDate(dateVal) + ':\n\n' + names +
        '\n\nClick Cancel to leave them unverified, or OK to verify and finalize ALL ' + unverified.length + ' classroom(s) anyway, including these.'
      );
      if (!proceed) return;
      toVerify = unverified;
    }
    for (const cls of toVerify) {
      const log = data.logsById[logId(dateVal, cls.id)];
      await saveLogFull(dateVal, cls.id, { ...(log || {}), verified: true, verifiedAt: new Date().toISOString() });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        <PrimaryButton onClick={verifyAll}>Verify &amp; Finalize All</PrimaryButton>
      </div>

      {data.classrooms.length === 0 ? (
        <p className="text-sm font-light text-primary-500">No classrooms yet.</p>
      ) : (
        <div className="grid gap-4">
          {sortClassroomsByGrade(data.classrooms).map(cls => {
            const isStaffCls = cls.type === 'staff';
            const roster = sortStudents(data.students.filter(s => s.classroomId === cls.id), 'number');
            const log = data.logsById[logId(dateVal, cls.id)];
            const preEntries = (log && log.pre && log.pre.entries) || {};
            const finalEntries = (log && log.final && log.final.entries) || {};
            const preT = isStaffCls ? tallyStaffEntries(preEntries, roster) : tallyEntries(preEntries, roster);
            const finalT = isStaffCls ? tallyStaffEntries(finalEntries, roster) : tallyEntries(finalEntries, roster);
            const preAdultsCount = (log && log.pre && log.pre.adultsCount) || 0;
            const finalAdultsCount = (log && log.final && typeof log.final.adultsCount === 'number') ? log.final.adultsCount : preAdultsCount;
            const preSubmitted = !!(log && log.pre && log.pre.submitted);
            const finalSubmitted = !!(log && log.final && log.final.submitted);
            const verified = !!(log && log.verified);
            const status = verified ? 'Verified' : (finalSubmitted ? 'Completed' : (preSubmitted ? 'In Progress' : 'Not Started'));
            const isCollapsed = isSectionCollapsed(collapsed, cls.id);

            const changedStudents = (!isStaffCls && finalSubmitted) ? roster.filter(s => entryChanged(preEntries[s.id], finalEntries[s.id])) : [];
            const summaryDiffs = [];
            if (finalSubmitted) {
              if (isStaffCls) {
                if (preT.yes !== finalT.yes) summaryDiffs.push('Staff Count: ' + preT.yes + ' \u2192 ' + finalT.yes + ' (' + (finalT.yes - preT.yes > 0 ? '+' : '') + (finalT.yes - preT.yes) + ')');
                if (cls.showAdultCard && preAdultsCount !== finalAdultsCount) summaryDiffs.push('Adult Count: ' + preAdultsCount + ' \u2192 ' + finalAdultsCount + ' (' + (finalAdultsCount - preAdultsCount > 0 ? '+' : '') + (finalAdultsCount - preAdultsCount) + ')');
              } else {
                [['Hot Lunch','hot'],['Sack Lunch','sack'],['Absent','absent'],['Milk','milk']].forEach(([label,key]) => {
                  if (preT[key] !== finalT[key]) {
                    const delta = finalT[key] - preT[key];
                    summaryDiffs.push(label + ': ' + preT[key] + ' \u2192 ' + finalT[key] + ' (' + (delta > 0 ? '+' : '') + delta + ')');
                  }
                });
              }
            }

            return (
              <div key={cls.id} className="bg-white rounded-2xl card-shadow border border-primary-100 p-5">
                <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                  <div onClick={() => toggleCollapse(cls.id)} className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer">
                    <CollapseToggle collapsed={isCollapsed} onClick={() => toggleCollapse(cls.id)} />
                    <div className="min-w-0">
                      <h4 className="font-bold text-primary-900 truncate">{classroomLabel(cls)}</h4>
                      <p className="text-xs font-light text-primary-500">{roster.length} {isStaffCls ? 'staff' : 'students'}{changedStudents.length > 0 ? ' \u00b7 ' + changedStudents.length + ' changed since morning' : ''}</p>
                    </div>
                  </div>
                  <Badge status={status} />
                </div>

                {!isCollapsed && (
                <React.Fragment>
                {isStaffCls ? (
                  verified ? (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
                      <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Verified Final Count</p>
                      <p className="font-bold text-primary-900 text-sm leading-snug">Staff Count: {finalT.yes}</p>
                      {cls.showAdultCard && <p className="font-bold text-primary-900 text-sm leading-snug">Adult Count: {finalAdultsCount}</p>}
                      <p className="font-bold text-purple-700 text-sm leading-snug mt-1">Verified</p>
                    </div>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-4 mb-4">
                      <div className="bg-primary-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-primary-700 uppercase mb-1">Today's Lunch Count {preSubmitted ? '' : '(not submitted)'}</p>
                        <p className="text-sm text-primary-800">Staff Count {preT.yes}{cls.showAdultCard ? (' \u00b7 Adult Count ' + preAdultsCount) : ''}</p>
                      </div>
                      <div className="bg-primary-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-primary-700 uppercase mb-1">Today's Final Lunch Count {finalSubmitted ? '' : '(not submitted)'}</p>
                        <p className="text-sm text-primary-800">Staff Count {finalT.yes}{cls.showAdultCard ? (' \u00b7 Adult Count ' + finalAdultsCount) : ''}</p>
                      </div>
                    </div>
                  )
                ) : verified ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Verified Final Count</p>
                    <p className="font-bold text-primary-900 text-sm leading-snug">Hot: {finalT.hot}</p>
                    <p className="font-bold text-primary-900 text-sm leading-snug">Sack: {finalT.sack}</p>
                    <p className="font-bold text-primary-900 text-sm leading-snug">Absent: {finalT.absent}</p>
                    <p className="font-bold text-primary-900 text-sm leading-snug">Milk: {finalT.milk}</p>
                    <p className="font-bold text-purple-700 text-sm leading-snug mt-1">Verified</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4 mb-4">
                    <div className="bg-primary-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-primary-700 uppercase mb-1">Today's Lunch Count {preSubmitted ? '' : '(not submitted)'}</p>
                      <p className="text-sm text-primary-800">Hot {preT.hot} &middot; Sack {preT.sack} &middot; Absent {preT.absent} &middot; Milk {preT.milk}</p>
                    </div>
                    <div className="bg-primary-50 rounded-xl p-3">
                      <p className="text-xs font-semibold text-primary-700 uppercase mb-1">Today's Final Lunch Count {finalSubmitted ? '' : '(not submitted)'}</p>
                      <p className="text-sm text-primary-800">Hot {finalT.hot} &middot; Sack {finalT.sack} &middot; Absent {finalT.absent} &middot; Milk {finalT.milk}</p>
                    </div>
                  </div>
                )}

                {finalSubmitted && summaryDiffs.length > 0 && (
                  <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl p-3">
                    <p className="text-xs font-semibold text-amber-800 uppercase mb-1">Changed Since Morning</p>
                    <p className="text-sm text-amber-800">{summaryDiffs.join(' \u00b7 ')}</p>
                  </div>
                )}

                {!isStaffCls && finalSubmitted && (
                  <button onClick={() => toggleExpand(cls.id)} className="text-xs font-semibold text-primary hover:underline mb-3">
                    {expanded[cls.id] ? 'Hide Student Detail \u25b2' : 'Show Student Detail \u25bc'}
                  </button>
                )}

                {!isStaffCls && finalSubmitted && expanded[cls.id] && (
                  <div className="border border-primary-100 rounded-xl overflow-hidden mb-4 overflow-x-auto">
                    <p className="text-xs font-semibold text-primary-500 uppercase px-2 pt-2 bg-primary-50">Verified Final Count</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-primary-50 text-primary-700 text-left">
                          <th className="p-2 font-semibold">Student</th>
                          <th className="p-2 font-semibold">Final Count</th>
                          <th className="p-2 font-semibold">Milk</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-primary-50">
                        {roster.map(s => {
                          const pe = preEntries[s.id] || defaultEntry();
                          const fe = finalEntries[s.id] || defaultEntry();
                          const changed = entryChanged(pe, fe);
                          const mealColor = fe.absent ? 'text-primary-700' : (fe.meal === 'hot' ? 'text-gray-400' : 'text-blue-600');
                          const milkOn = !fe.absent && fe.milk === 'yes';
                          const milkColor = !milkOn ? 'text-primary-300' : (fe.meal === 'sack' ? 'text-blue-600' : 'text-gray-400');
                          return (
                            <tr key={s.id}>
                              <td className="p-2 font-medium text-primary-900">
                                #{s.number} {s.firstName} {s.lastName}{changed && <span className="ml-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Changed</span>}
                              </td>
                              <td className={"p-2 font-semibold " + mealColor}>{entryStatusLabel(fe)}</td>
                              <td className={"p-2 font-semibold " + milkColor}>{entryMilkLabel(fe)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  {verified ? (
                    <GhostButton onClick={() => unverifyClassroom(cls)}>Unlock (Undo Verification)</GhostButton>
                  ) : (
                    <PrimaryButton onClick={() => verifyClassroom(cls)}>Verify &amp; Finalize</PrimaryButton>
                  )}
                </div>
                </React.Fragment>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Mirrors LunchVerificationTab, but verifies the morning-of Breakfast Verification
// (breakfastFinal) instead of the Lunch Final Count. Distinct fields throughout
// (breakfastVerified/breakfastVerifiedAt vs verified/verifiedAt) so verifying one never
// touches the other.
function BreakfastVerificationTab({ data }) {
  const [dateVal, setDateVal] = useState(todayStr());
  const [collapsed, setCollapsed] = useState({});
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }

  function tallyBreakfastFinal(entries, roster) {
    let pickedUp = 0, noShow = 0, absent = 0;
    roster.forEach(s => {
      const e = (entries && entries[s.id]) || defaultBreakfastFinalEntry();
      if (e.absent) { absent++; return; }
      if (e.meal === 'hot') pickedUp++; else noShow++;
    });
    return { pickedUp, noShow, absent };
  }

  async function verifyClassroom(cls) {
    const log = data.logsById[logId(dateVal, cls.id)];
    const bfSubmitted = !!(log && log.breakfastFinal && log.breakfastFinal.submitted);
    if (!bfSubmitted) {
      const proceed = confirm(
        'Breakfast Verification for ' + classroomLabel(cls) + ' has not been submitted (or was not submitted properly) for ' +
        formatDisplayDate(dateVal) + '.\n\nVerify and finalize it anyway?'
      );
      if (!proceed) return;
    }
    await saveLogFull(dateVal, cls.id, { ...(log || {}), breakfastVerified: true, breakfastVerifiedAt: new Date().toISOString() });
  }
  async function unverifyClassroom(cls) {
    const log = data.logsById[logId(dateVal, cls.id)];
    if (!log) return;
    await saveLogFull(dateVal, cls.id, { ...log, breakfastVerified: false, breakfastVerifiedAt: null });
  }
  async function verifyAll() {
    const unverified = data.classrooms.filter(cls => {
      const log = data.logsById[logId(dateVal, cls.id)];
      return !(log && log.breakfastVerified);
    });
    if (unverified.length === 0) { alert('No unverified Breakfast Verifications remain for this date.'); return; }
    const submitted = unverified.filter(cls => {
      const log = data.logsById[logId(dateVal, cls.id)];
      return !!(log && log.breakfastFinal && log.breakfastFinal.submitted);
    });
    const notSubmitted = unverified.filter(cls => submitted.indexOf(cls) === -1);

    let toVerify;
    if (notSubmitted.length === 0) {
      if (!confirm('Verify and finalize Breakfast Verification for ' + submitted.length + ' classroom(s) for ' + formatDisplayDate(dateVal) + '?')) return;
      toVerify = submitted;
    } else {
      const names = notSubmitted.map(classroomLabel).join(', ');
      const proceed = confirm(
        'The following classroom(s) have not submitted (or did not submit properly) a Breakfast Verification for ' +
        formatDisplayDate(dateVal) + ':\n\n' + names +
        '\n\nClick Cancel to leave them unverified, or OK to verify and finalize ALL ' + unverified.length + ' classroom(s) anyway, including these.'
      );
      if (!proceed) return;
      toVerify = unverified;
    }
    for (const cls of toVerify) {
      const log = data.logsById[logId(dateVal, cls.id)];
      await saveLogFull(dateVal, cls.id, { ...(log || {}), breakfastVerified: true, breakfastVerifiedAt: new Date().toISOString() });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        <PrimaryButton onClick={verifyAll}>Verify &amp; Finalize All</PrimaryButton>
      </div>

      {data.classrooms.length === 0 ? (
        <p className="text-sm font-light text-primary-500">No classrooms yet.</p>
      ) : (
        <div className="grid gap-4">
          {sortClassroomsByGrade(data.classrooms).filter(cls => cls.type !== 'staff').map(cls => {
            const roster = sortStudents(data.students.filter(s => s.classroomId === cls.id), 'number');
            const log = data.logsById[logId(dateVal, cls.id)];
            const bf = log && log.breakfastFinal;
            const bfEntries = (bf && bf.entries) || {};
            // Only students actually present in bfEntries were part of that day's Breakfast
            // Verification (i.e. requested breakfast in the prior pre-count); an empty roster
            // here just means no one requested breakfast, not "not submitted".
            const bfRoster = roster.filter(s => bfEntries[s.id]);
            const t = tallyBreakfastFinal(bfEntries, bfRoster);
            const bfSubmitted = !!(bf && bf.submitted);
            const verified = !!(log && log.breakfastVerified);
            const status = verified ? 'Verified' : (bfSubmitted ? 'Completed' : 'Not Started');
            const isCollapsed = isSectionCollapsed(collapsed, cls.id);

            return (
              <div key={cls.id} className="bg-white rounded-2xl card-shadow border border-primary-100 p-5">
                <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
                  <div onClick={() => toggleCollapse(cls.id)} className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer">
                    <CollapseToggle collapsed={isCollapsed} onClick={() => toggleCollapse(cls.id)} />
                    <div className="min-w-0">
                      <h4 className="font-bold text-primary-900 truncate">{classroomLabel(cls)}</h4>
                      <p className="text-xs font-light text-primary-500">{bfRoster.length} student{bfRoster.length === 1 ? '' : 's'} requested breakfast for this day</p>
                    </div>
                  </div>
                  <Badge status={status} />
                </div>

                {!isCollapsed && (
                <React.Fragment>
                {bfSubmitted ? (
                  <div className={"rounded-xl p-4 mb-4 border " + (verified ? 'bg-purple-50 border-purple-200' : 'bg-primary-50 border-primary-100')}>
                    <p className={"text-xs font-semibold uppercase mb-2 " + (verified ? 'text-purple-700' : 'text-primary-700')}>Breakfast Verification</p>
                    <p className="text-sm text-primary-800">Picked Up {t.pickedUp} &middot; No Show {t.noShow} &middot; Absent {t.absent}</p>
                    {verified && <p className="font-bold text-purple-700 text-sm leading-snug mt-1">Verified</p>}
                  </div>
                ) : (
                  <div className="bg-primary-50 rounded-xl p-3 mb-4">
                    <p className="text-sm text-primary-600 font-light">Breakfast Verification not submitted yet for this date.</p>
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  {verified ? (
                    <GhostButton onClick={() => unverifyClassroom(cls)}>Unlock (Undo Verification)</GhostButton>
                  ) : (
                    <PrimaryButton onClick={() => verifyClassroom(cls)}>Verify &amp; Finalize</PrimaryButton>
                  )}
                </div>
                </React.Fragment>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VerificationPanel({ data }) {
  const [tab, setTab] = useState('lunch');
  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Daily Verification &amp; Finalization</h3>
      <div className="flex bg-primary-50 rounded-xl p-1 gap-1 mb-6 w-full sm:w-auto sm:inline-flex">
        <button
          onClick={() => setTab('lunch')}
          className={"btn-touch px-5 py-2 rounded-lg font-semibold text-sm transition-fast flex-1 sm:flex-initial " + (tab === 'lunch' ? 'bg-white text-primary card-shadow' : 'text-primary-600 hover:bg-white/60')}
        >
          Lunch
        </button>
        <button
          onClick={() => setTab('breakfast')}
          className={"btn-touch px-5 py-2 rounded-lg font-semibold text-sm transition-fast flex-1 sm:flex-initial " + (tab === 'breakfast' ? 'bg-white text-primary card-shadow' : 'text-primary-600 hover:bg-white/60')}
        >
          Breakfast
        </button>
      </div>
      {tab === 'lunch' ? <LunchVerificationTab data={data} /> : <BreakfastVerificationTab data={data} />}
    </div>
  );
}

/* ============================ ADMIN: ANALYTICS ============================ */
// "Today" snapshot cards: a live PreCount card (fills in as teachers work through Today's Lunch
// Count, before anything is submitted or verified) and a Verified Count card (only shows numbers
// for classroom-days an admin has actually verified). These sit above the date-range picker
// since they're always about today, regardless of what range the rest of Analytics is showing.
function TodaySnapshotCards({ data }) {
  const pre = useMemo(() => computeTodayPreCountSnapshot(data), [data]);
  const ver = useMemo(() => computeTodayVerifiedSnapshot(data), [data]);
  const staffAdult = useMemo(() => computeTodayStaffAdultSnapshot(data), [data]);
  const verStaffAdult = useMemo(() => computeTodayVerifiedStaffAdultSnapshot(data), [data]);
  return (
    <div className="grid md:grid-cols-2 gap-4 mb-8">
      <div className="bg-white rounded-2xl card-shadow border-2 border-amber-200 p-5">
        <h4 className="font-bold text-primary-900 mb-1">Today's PreCount</h4>
        <p className="text-xs font-light text-primary-500 mb-4">Live &mdash; fills in as teachers submit Today's Lunch Count, before Final Count / verification.</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard label="Today's Total Hot Lunch" value={pre.hot} />
          <StatCard label="Today's Sack Lunch" value={pre.sack} />
          <StatCard label="Today's Absences" value={pre.absent} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Hot Lunch Milk" value={pre.milkHot} />
          <StatCard label="Sack Lunch Milk" value={pre.milkSack} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Staff Lunch" value={staffAdult.staffLunch} />
          <StatCard label="Adult Lunch" value={staffAdult.adultLunch} />
        </div>
      </div>
      <div className="bg-white rounded-2xl card-shadow border-2 border-purple-200 p-5">
        <h4 className="font-bold text-primary-900 mb-1">Today's Verified Count</h4>
        <p className="text-xs font-light text-primary-500 mb-4">Only populates once an admin verifies a classroom's Final Lunch Count for today. Mirrors the same markers as Today's PreCount so the two reconcile exactly.</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard label="Today's Total Hot Lunch" value={ver.hot} />
          <StatCard label="Today's Sack Lunch" value={ver.sack} />
          <StatCard label="Today's Absences" value={ver.absent} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Hot Lunch Milk" value={ver.milkHot} />
          <StatCard label="Sack Lunch Milk" value={ver.milkSack} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Staff Lunch" value={verStaffAdult.staffLunch} />
          <StatCard label="Adult Lunch" value={verStaffAdult.adultLunch} />
        </div>
      </div>
    </div>
  );
}

function AnalyticsDashboard({ data }) {
  const [range, setRange] = useState('daily');
  const [dateVal, setDateVal] = useState(todayStr());
  const [monthVal, setMonthVal] = useState(todayStr().slice(0,7));
  const [termKey, setTermKey] = useState('Q1');
  const [customStart, setCustomStart] = useState(todayStr());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [collapsed, setCollapsed] = useState({});
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }

  let startDate, endDate, periodLabel, rangeError = null;

  if (range === 'daily') {
    startDate = parseDateStr(dateVal); endDate = parseDateStr(dateVal);
    periodLabel = formatDisplayDate(dateVal);
  } else if (range === 'weekly') {
    const wr = getWeekRange(dateVal); startDate = wr.start; endDate = wr.end;
    periodLabel = formatShortDate(toDateStr(wr.start)) + ' \u2013 ' + formatShortDate(toDateStr(wr.end));
  } else if (range === 'monthly') {
    const mr = getMonthRange(monthVal); startDate = mr.start; endDate = mr.end;
    periodLabel = mr.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else if (range === 'quarter' || range === 'semester') {
    const r = getTermRange(data.settings, termKey);
    if (!r) {
      rangeError = 'No dates set for ' + TERM_LABELS[termKey] + ' yet. Set them in Admin \u2192 Term Settings.';
      startDate = parseDateStr(todayStr()); endDate = startDate; periodLabel = '';
    } else {
      startDate = r.start; endDate = r.end;
      periodLabel = TERM_LABELS[termKey] + ': ' + formatShortDate(toDateStr(r.start)) + ' \u2013 ' + formatShortDate(toDateStr(r.end));
    }
  } else {
    startDate = parseDateStr(customStart); endDate = parseDateStr(customEnd);
    if (endDate < startDate) endDate = startDate;
    periodLabel = formatShortDate(customStart) + ' \u2013 ' + formatShortDate(toDateStr(endDate));
  }

  const agg = useMemo(() => aggregateRange(data, startDate, endDate), [data, startDate.getTime(), endDate.getTime()]);
  const studentAgg = useMemo(() => aggregateRangeByStudent(data, startDate, endDate), [data, startDate.getTime(), endDate.getTime()]);

  const sortedClassrooms = useMemo(() => sortClassroomsByGrade(data.classrooms.filter(c => c.type !== 'staff')), [data.classrooms]);

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Analytics &amp; Reporting</h3>

      <TodaySnapshotCards data={data} />

      <div className="flex flex-wrap gap-2 mb-4">
        {[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly'],['quarter','This Quarter'],['semester','This Semester'],['custom','Custom Date Range']].map(([val,label]) => (
          <button
            key={val}
            onClick={() => setRange(val)}
            className={"px-4 py-2 rounded-xl font-semibold text-sm border-2 transition-fast " + (range === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}
          >{label}</button>
        ))}
      </div>

      <div className="mb-6 flex items-center gap-2 flex-wrap">
        {(range === 'daily' || range === 'weekly') && (
          <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        )}
        {range === 'monthly' && (
          <input type="month" value={monthVal} onChange={e => setMonthVal(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        )}
        {range === 'quarter' && ['Q1','Q2','Q3','Q4'].map(k => (
          <button key={k} onClick={() => setTermKey(k)} className={"px-3 py-1.5 rounded-lg text-sm font-semibold border-2 " + (termKey === k ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>{k}</button>
        ))}
        {range === 'semester' && ['S1','S2'].map(k => (
          <button key={k} onClick={() => setTermKey(k)} className={"px-3 py-1.5 rounded-lg text-sm font-semibold border-2 " + (termKey === k ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>{k}</button>
        ))}
        {range === 'custom' && (
          <React.Fragment>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
            <span className="text-sm text-primary-500">to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
          </React.Fragment>
        )}
        {!rangeError && <span className="text-sm font-light italic text-primary-500">Showing: {periodLabel}</span>}
      </div>

      {rangeError ? (
        <div className="bg-amber-50 border border-amber-300 text-amber-800 rounded-xl p-4 text-sm font-medium mb-6">{rangeError}</div>
      ) : (
        <React.Fragment>
          {sortedClassrooms.length === 0 ? (
            <p className="text-sm font-light text-primary-500">No classrooms yet.</p>
          ) : (
            <div className="grid gap-4">
              {sortedClassrooms.map(c => {
                const v = agg[c.id] || { hot: 0, sack: 0, absent: 0, milk: 0 };
                const roster = sortStudents(data.students.filter(s => s.classroomId === c.id), 'number');
                const isCollapsed = isSectionCollapsed(collapsed, c.id);
                return (
                  <div key={c.id} className="bg-white rounded-2xl card-shadow border border-primary-100 p-5">
                    <div className="flex justify-between items-start mb-3 flex-wrap gap-2">
                      <div onClick={() => toggleCollapse(c.id)} className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer">
                        <CollapseToggle collapsed={isCollapsed} onClick={() => toggleCollapse(c.id)} />
                        <div className="min-w-0">
                          <h4 className="font-bold text-primary-900 truncate">{classroomLabel(c)}</h4>
                          <p className="text-xs font-light text-primary-500">{roster.length} students</p>
                        </div>
                      </div>
                      <p className="text-sm text-primary-700 font-medium">Hot {v.hot} &middot; Sack {v.sack} &middot; Absent {v.absent} &middot; Milk {v.milk}</p>
                    </div>
                    {!isCollapsed && roster.length > 0 && (
                      <div className="border-t border-primary-50 pt-3 mt-2">
                        <p className="text-xs font-semibold text-primary-500 uppercase mb-2">Student Detail</p>
                        <div className="divide-y divide-primary-50">
                          {roster.map(s => {
                            const sv = studentAgg[s.id] || { hot: 0, sack: 0, absent: 0, milk: 0 };
                            return (
                              <div key={s.id} className="flex items-center gap-3 py-2">
                                <p className="font-medium text-primary-900 flex-1 min-w-0 truncate text-sm">#{s.number} {s.firstName} {s.lastName}</p>
                                <p className="text-xs text-primary-600 font-light">Hot {sv.hot} &middot; Sack {sv.sack} &middot; Absent {sv.absent} &middot; Milk {sv.milk}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </React.Fragment>
      )}
    </div>
  );
}

/* ============================ ADMIN: TERM & CALENDAR SETTINGS ============================ */
function TermSettingsPanel({ settings }) {
  const terms = settings.terms || {};
  const [activeTerm, setActiveTerm] = useState('S1');
  const [start, setStart] = useState((terms.S1 && terms.S1.start) || '');
  const [end, setEnd] = useState((terms.S1 && terms.S1.end) || '');
  const [savedMsg, setSavedMsg] = useState('');

  useEffect(() => {
    const t = terms[activeTerm] || {};
    setStart(t.start || '');
    setEnd(t.end || '');
    // eslint-disable-next-line
  }, [activeTerm, settings.terms]);

  async function save() {
    const newTerms = { ...terms, [activeTerm]: { start, end } };
    await saveSettings({ terms: newTerms });
    setSavedMsg('Saved!');
    setTimeout(() => setSavedMsg(''), 2000);
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Term &amp; Calendar Settings</h3>
      <p className="text-sm font-light text-primary-600 mb-4">Set the start and end date for each term. These dates power "This Quarter" / "This Semester" in Analytics, and the Quarter / Semester / School Year exports.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {TERM_KEYS.map(k => (
          <button
            key={k}
            onClick={() => setActiveTerm(k)}
            className={"px-4 py-2 rounded-xl font-semibold text-sm border-2 transition-fast " + (activeTerm === k ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}
          >{k}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl card-shadow border border-primary-100 p-5 flex flex-wrap gap-4 items-end">
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">{TERM_LABELS[activeTerm]} Start Date</label>
          <input type="date" value={start} onChange={e => setStart(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">{TERM_LABELS[activeTerm]} End Date</label>
          <input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        </div>
        <PrimaryButton onClick={save}>Save {TERM_LABELS[activeTerm]}</PrimaryButton>
        {savedMsg && <span className="text-sm font-semibold text-green-600">{savedMsg}</span>}
      </div>

      <div className="mt-6 bg-primary-50 rounded-2xl p-4">
        <p className="text-xs font-semibold text-primary-700 uppercase mb-2">All Configured Terms</p>
        <div className="grid sm:grid-cols-2 gap-2 text-sm text-primary-800">
          {TERM_KEYS.map(k => {
            const t = terms[k];
            return (
              <p key={k}><span className="font-semibold">{TERM_LABELS[k]}:</span> {(t && t.start) ? formatShortDate(t.start) : '—'} to {(t && t.end) ? formatShortDate(t.end) : '—'}</p>
            );
          })}
        </div>
      </div>

      <hr className="my-8 border-primary-100" />
      <SchoolCalendarPanel settings={settings} />
    </div>
  );
}

/* ============================ ADMIN: SCHOOL CALENDAR / "NO SCHOOL" DAYS ============================ */
// Lets an admin upload a CSV or XLSX school calendar of No School / holiday dates. Saved to
// settings/config as settings.holidays (an array of { date, label }). Any uploaded/added date
// automatically shows the "No School Today" banner and locks count entry on the Teacher Home
// Page and entry screens for that date, and is skipped when computing the next school day for
// breakfast counts.
function SchoolCalendarPanel({ settings }) {
  const holidays = holidaysList(settings);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [manualDate, setManualDate] = useState('');
  const [manualLabel, setManualLabel] = useState('');
  const fileInputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    setBusy(true);
    setMsg('');
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseCalendarWorkbook(buffer);
      if (parsed.length === 0) {
        setMsg('No valid dates were found in that file. Make sure it has a "Date" column.');
      } else {
        const merged = { ...Object.fromEntries(holidays.map(h => [h.date, h])), ...Object.fromEntries(parsed.map(h => [h.date, h])) };
        await saveHolidays(Object.values(merged));
        setMsg('Imported ' + parsed.length + ' No School date(s).');
      }
    } catch (err) {
      console.error('Calendar import error:', err);
      setMsg('Could not read that file. Please upload a CSV or Excel (.xlsx) file.');
    }
    setBusy(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function addManual(e) {
    e.preventDefault();
    if (!manualDate) return;
    const merged = { ...Object.fromEntries(holidays.map(h => [h.date, h])) };
    merged[manualDate] = { date: manualDate, label: manualLabel.trim() || 'No School' };
    await saveHolidays(Object.values(merged));
    setManualDate('');
    setManualLabel('');
  }

  async function removeDate(dateStr) {
    await saveHolidays(holidays.filter(h => h.date !== dateStr));
  }

  const sortedHolidays = holidays.slice().sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-2">School Calendar &amp; "No School" Days</h3>
      <p className="text-sm font-light text-primary-600 mb-4">
        Upload your school calendar (CSV or Excel) with a "Date" column (and an optional "Label"
        column) to mark holidays and other No School days. On any of these dates, the Teacher Home
        Page and classroom entry screens show a "No School Today" banner and count entry is locked.
        These dates are also used to figure out which day a Breakfast Pre-Count taken today is for.
      </p>

      <div className="bg-white rounded-2xl card-shadow border border-primary-100 p-5 mb-4">
        <label className="text-xs font-medium text-primary-500 uppercase block mb-2">Upload Calendar (CSV or .xlsx)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          disabled={busy}
          className="text-sm text-primary-700 file:btn-touch file:mr-3 file:px-4 file:py-2 file:rounded-xl file:border-0 file:bg-primary file:text-white file:font-semibold hover:file:bg-primary-700"
        />
        {busy && <p className="text-xs text-primary-400 mt-2">Importing…</p>}
        {msg && <p className="text-sm font-medium text-primary-700 mt-2">{msg}</p>}
      </div>

      <form onSubmit={addManual} className="bg-white rounded-2xl card-shadow border border-primary-100 p-5 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Add a Single Date</label>
          <input type="date" value={manualDate} onChange={e => setManualDate(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Label (optional)</label>
          <input value={manualLabel} onChange={e => setManualLabel(e.target.value)} placeholder="Christmas Break" className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        </div>
        <PrimaryButton type="submit">Add No School Day</PrimaryButton>
      </form>

      <div className="bg-primary-50 rounded-2xl p-4">
        <p className="text-xs font-semibold text-primary-700 uppercase mb-2">{sortedHolidays.length} Upcoming/Configured No School Day(s)</p>
        {sortedHolidays.length === 0 ? (
          <p className="text-sm font-light text-primary-500">None uploaded yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-2">
            {sortedHolidays.map(h => (
              <div key={h.date} className="flex items-center justify-between bg-white rounded-xl border border-primary-100 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-primary-900">{formatDisplayDate(h.date)}</p>
                  <p className="text-xs font-light text-primary-500">{h.label}</p>
                </div>
                <button onClick={() => removeDate(h.date)} className="text-xs font-semibold text-rose-600 hover:underline">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ ADMIN: GRADE BANDS ============================ */
function GradeBandsPanel({ data }) {
  const settings = data.settings;
  const bands = settings.gradeBands || {};

  const gradesInUse = useMemo(() => {
    const set = new Set();
    data.classrooms.forEach(c => { if (c.grade && c.type !== 'staff') set.add(c.grade); });
    return Array.from(set).sort((a, b) => gradeSortRank(a) - gradeSortRank(b) || a.localeCompare(b, undefined, { numeric: true }));
  }, [data.classrooms]);

  async function setBand(grade, band) {
    const newBands = { ...bands, [grade]: band };
    await saveSettings({ gradeBands: newBands });
  }

  const bandOptions = [['elementary', 'Elementary'], ['middle', 'Middle School'], ['high', 'High School']];

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Grade Bands</h3>
      <p className="text-sm font-light text-primary-600 mb-4">
        Assign each grade used by your classrooms to Elementary, Middle School, or High School.
        This decides which "Paid" column a student's paid lunch counts toward on the Monthly Meal
        Count Export. Any grade you haven't assigned yet defaults to Elementary.
      </p>
      <div className="grid gap-2">
        {gradesInUse.length === 0 && (
          <p className="text-sm font-light text-primary-500">No classrooms yet &mdash; add a classroom first in Admin &rarr; Classrooms.</p>
        )}
        {gradesInUse.map(grade => {
          const current = bands[grade] || 'elementary';
          return (
            <div key={grade} className="bg-white rounded-2xl card-shadow border border-primary-100 p-4 flex items-center justify-between flex-wrap gap-3">
              <p className="font-semibold text-primary-900">{grade}</p>
              <div className="flex gap-2">
                {bandOptions.map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setBand(grade, val)}
                    className={"px-3 py-1.5 rounded-lg text-sm font-semibold border-2 transition-fast " + (current === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}
                  >{label}</button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ ADMIN: STUDENT MANAGEMENT ============================ */
function StudentManagement({ data }) {
  const nonStaffClassrooms = useMemo(() => data.classrooms.filter(c => c.type !== 'staff'), [data.classrooms]);
  const [newNumber, setNewNumber] = useState('');
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newClass, setNewClass] = useState(nonStaffClassrooms[0] ? nonStaffClassrooms[0].id : '');
  const [newLunchStatus, setNewLunchStatus] = useState('paid');
  const [editingId, setEditingId] = useState(null);
  const [editNumber, setEditNumber] = useState('');
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');

  const [search, setSearch] = useState('');
  const [filterClassroom, setFilterClassroom] = useState('');
  const [sortBy, setSortBy] = useState('classroom');
  const [studentSortBy, setStudentSortBy] = useState('number');
  const [collapsed, setCollapsed] = useState({});
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }

  const [importRows, setImportRows] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!newClass && nonStaffClassrooms[0]) setNewClass(nonStaffClassrooms[0].id);
    // eslint-disable-next-line
  }, [data.classrooms]);

  async function addStudent(e) {
    e.preventDefault();
    if (!newNumber.trim() || !newFirst.trim() || !newLast.trim() || !newClass) return;
    await saveStudent({ number: newNumber.trim(), firstName: newFirst.trim(), lastName: newLast.trim(), classroomId: newClass, lunchStatus: newLunchStatus });
    setNewNumber(''); setNewFirst(''); setNewLast(''); setNewLunchStatus('paid');
  }

  async function deleteStudent(id) {
    if (!confirm('Remove this student? This cannot be undone.')) return;
    await deleteStudentDoc(id);
  }

  async function moveStudent(id, classroomId) {
    const s = data.students.find(x => x.id === id);
    if (!s) return;
    await saveStudent({ id, number: s.number, firstName: s.firstName, lastName: s.lastName, classroomId, lunchStatus: s.lunchStatus });
  }

  // Quick-set from the roster card, no need to enter edit mode just to annotate reduced/free.
  async function setLunchStatus(id, status) {
    const s = data.students.find(x => x.id === id);
    if (!s) return;
    await saveStudent({ id, number: s.number, firstName: s.firstName, lastName: s.lastName, classroomId: s.classroomId, lunchStatus: status });
  }

  function startEdit(s) { setEditingId(s.id); setEditNumber(String(s.number)); setEditFirst(s.firstName); setEditLast(s.lastName); }
  async function saveEdit(id) {
    const s = data.students.find(x => x.id === id);
    if (!s) return;
    await saveStudent({
      id,
      number: editNumber.trim() || s.number,
      firstName: editFirst.trim() || s.firstName,
      lastName: editLast.trim() || s.lastName,
      classroomId: s.classroomId,
      lunchStatus: s.lunchStatus
    });
    setEditingId(null);
  }

  const visibleClassrooms = useMemo(() => {
    let list = nonStaffClassrooms.slice();
    if (filterClassroom) list = list.filter(c => c.id === filterClassroom);
    if (sortBy === 'classroom') list.sort((a,b) => classroomLabel(a).localeCompare(classroomLabel(b)));
    if (sortBy === 'grade') list = sortClassroomsByGrade(list);
    return list;
  }, [nonStaffClassrooms, filterClassroom, sortBy]);

  function studentsFor(classroomId) {
    let list = data.students.filter(s => s.classroomId === classroomId);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(s => (s.firstName + ' ' + s.lastName).toLowerCase().includes(q) || String(s.number).includes(q));
    }
    return sortStudents(list, studentSortBy);
  }

  function handleFileSelected(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        if (!rows.length) { alert('That file appears to be empty.'); return; }
        const header = rows[0].map(h => String(h).trim().toLowerCase());
        const numberIdx = header.indexOf('student #');
        const firstIdx = header.indexOf('first name');
        const lastIdx = header.indexOf('last name');
        const classroomIdx = header.indexOf('classroom');
        const lunchStatusIdx = header.indexOf('lunch status'); // optional column
        if (numberIdx === -1 || firstIdx === -1 || lastIdx === -1 || classroomIdx === -1) {
          alert('The file must have a header row with columns: Student #, First Name, Last Name, Classroom');
          return;
        }
        const parsed = rows.slice(1).filter(r => r.length && (String(r[firstIdx]).trim() || String(r[lastIdx]).trim())).map(r => {
          const number = String(r[numberIdx]).trim();
          const firstName = String(r[firstIdx]).trim();
          const lastName = String(r[lastIdx]).trim();
          const classroomVal = String(r[classroomIdx]).trim().toLowerCase();
          const match = nonStaffClassrooms.find(c => classroomLabel(c).trim().toLowerCase() === classroomVal);
          const rawStatus = lunchStatusIdx !== -1 ? String(r[lunchStatusIdx]).trim().toLowerCase() : 'paid';
          const lunchStatus = (rawStatus === 'reduced' || rawStatus === 'free') ? rawStatus : 'paid';
          return { number, firstName, lastName, classroomText: String(r[classroomIdx]).trim(), classroomId: match ? match.id : null, lunchStatus };
        });
        setImportRows(parsed);
      } catch (err) {
        console.error(err);
        alert('Could not read that file. Please upload a CSV or Excel (.xlsx) file with columns: Student #, First Name, Last Name, Classroom.');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function confirmImport() {
    if (!importRows) return;
    setImportBusy(true);
    const matched = importRows.filter(r => r.classroomId);
    for (const r of matched) {
      await saveStudent({ number: r.number, firstName: r.firstName, lastName: r.lastName, classroomId: r.classroomId, lunchStatus: r.lunchStatus });
    }
    setImportBusy(false);
    setImportRows(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    alert('Imported ' + matched.length + ' student(s).');
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Student Management</h3>

      {nonStaffClassrooms.length === 0 ? (
        <p className="text-sm font-light text-primary-500 mb-4">Add a classroom first before adding students.</p>
      ) : (
        <form onSubmit={addStudent} className="bg-white rounded-2xl card-shadow p-4 border border-primary-100 mb-4 flex flex-wrap gap-3 items-end">
          <div className="w-24">
            <label className="text-xs font-medium text-primary-500 uppercase">Student #</label>
            <input value={newNumber} onChange={e => setNewNumber(e.target.value)} placeholder="#" className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-primary-500 uppercase">First Name</label>
            <input value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="First" className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs font-medium text-primary-500 uppercase">Last Name</label>
            <input value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Last" className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-primary-500 uppercase">Classroom</label>
            <select value={newClass} onChange={e => setNewClass(e.target.value)} className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary">
              {sortClassroomsByGrade(nonStaffClassrooms).map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-primary-500 uppercase">Lunch Status</label>
            <select value={newLunchStatus} onChange={e => setNewLunchStatus(e.target.value)} className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary">
              <option value="paid">Paid</option>
              <option value="reduced">Reduced</option>
              <option value="free">Free</option>
            </select>
          </div>
          <PrimaryButton type="submit">Add Student</PrimaryButton>
        </form>
      )}

      <div className="bg-white rounded-2xl card-shadow p-4 border border-primary-100 mb-6">
        <p className="text-sm font-semibold text-primary-800 mb-2">Batch Upload Roster (CSV or Excel)</p>
        <p className="text-xs font-light text-primary-500 mb-3">File must include a header row with columns named exactly: <span className="font-semibold">Student #</span>, <span className="font-semibold">First Name</span>, <span className="font-semibold">Last Name</span>, <span className="font-semibold">Classroom</span>. Classroom must match an existing classroom's "Grade — Teacher" label exactly. You can optionally add a <span className="font-semibold">Lunch Status</span> column with values <span className="font-semibold">Paid</span>, <span className="font-semibold">Reduced</span>, or <span className="font-semibold">Free</span> &mdash; anything left blank or unrecognized imports as Paid.</p>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelected} className="text-sm" />
        {importRows && (
          <div className="mt-4 border border-primary-100 rounded-xl overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-50 text-primary-700 text-left">
                  <th className="p-2 font-semibold">Student #</th>
                  <th className="p-2 font-semibold">First Name</th>
                  <th className="p-2 font-semibold">Last Name</th>
                  <th className="p-2 font-semibold">Classroom</th>
                  <th className="p-2 font-semibold">Lunch Status</th>
                  <th className="p-2 font-semibold">Match</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-primary-50">
                {importRows.map((r,i) => (
                  <tr key={i} className={!r.classroomId ? 'bg-rose-50' : ''}>
                    <td className="p-2">{r.number}</td>
                    <td className="p-2">{r.firstName}</td>
                    <td className="p-2">{r.lastName}</td>
                    <td className="p-2">{r.classroomText}</td>
                    <td className="p-2">{lunchStatusLabel(r.lunchStatus)}</td>
                    <td className="p-2">{r.classroomId ? <span className="text-green-700 font-semibold">Matched</span> : <span className="text-rose-600 font-semibold">No matching classroom</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-3 flex justify-end gap-2 bg-primary-50">
              <GhostButton onClick={() => { setImportRows(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>Cancel</GhostButton>
              <PrimaryButton disabled={importBusy} onClick={confirmImport}>{importBusy ? 'Importing…' : 'Confirm Import (' + importRows.filter(r => r.classroomId).length + ')'}</PrimaryButton>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Search Students</label>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or #…" className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Filter by Classroom</label>
          <select value={filterClassroom} onChange={e => setFilterClassroom(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            <option value="">All Classrooms</option>
            {sortClassroomsByGrade(nonStaffClassrooms).map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Sort Groups By</label>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            <option value="classroom">Classroom Name (A–Z)</option>
            <option value="grade">Grade (A–Z)</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Sort Students By</label>
          <select value={studentSortBy} onChange={e => setStudentSortBy(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            <option value="number">Student #</option>
            <option value="first">First Name</option>
            <option value="last">Last Name</option>
          </select>
        </div>
      </div>

      <div className="grid gap-5">
        {visibleClassrooms.length === 0 && <p className="text-sm font-light text-primary-500">No classrooms match.</p>}
        {visibleClassrooms.map(c => {
          const students = studentsFor(c.id);
          if (search.trim() && students.length === 0) return null;
          const isCollapsed = isSectionCollapsed(collapsed, c.id);
          return (
            <div key={c.id} className="bg-white rounded-2xl card-shadow border border-primary-100 overflow-hidden">
              <div onClick={() => toggleCollapse(c.id)} className="w-full bg-primary-50 px-4 py-2.5 border-b border-primary-100 flex items-center gap-3 text-left cursor-pointer">
                <CollapseToggle collapsed={isCollapsed} onClick={() => toggleCollapse(c.id)} />
                <h4 className="font-bold text-primary-900 text-sm flex-1">{classroomLabel(c)} <span className="font-light text-primary-500">({students.length})</span></h4>
              </div>
              {!isCollapsed && (
              <div className="divide-y divide-primary-50">
                {students.length === 0 && <p className="p-4 text-sm font-light text-primary-500">No students.</p>}
                {students.map(s => (
                  <div key={s.id} className="flex items-center gap-3 p-4 flex-wrap">
                    {editingId === s.id ? (
                      <React.Fragment>
                        <input value={editNumber} onChange={e => setEditNumber(e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1 w-20" placeholder="#" autoFocus />
                        <input value={editFirst} onChange={e => setEditFirst(e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1 flex-1 min-w-[110px]" placeholder="First" />
                        <input value={editLast} onChange={e => setEditLast(e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1 flex-1 min-w-[110px]" placeholder="Last" />
                      </React.Fragment>
                    ) : (
                      <p className="font-medium text-primary-900 flex-1 min-w-[140px]"><span className="text-primary-400">#{s.number}</span> {s.firstName} {s.lastName}</p>
                    )}
                    <select
                      value={s.classroomId}
                      onChange={e => moveStudent(s.id, e.target.value)}
                      className="border-2 border-primary-200 rounded-lg px-2 py-1 text-sm"
                    >
                      {sortClassroomsByGrade(nonStaffClassrooms).map(cc => <option key={cc.id} value={cc.id}>{classroomLabel(cc)}</option>)}
                    </select>
                    <div className="flex gap-1">
                      {[['paid','Paid','bg-primary-50 text-primary border-primary-200'],['reduced','Reduced','bg-amber-50 text-amber-700 border-amber-300'],['free','Free','bg-green-50 text-green-700 border-green-300']].map(([val,label,activeClass]) => {
                        const current = s.lunchStatus || 'paid';
                        const isActive = current === val;
                        return (
                          <button
                            key={val}
                            onClick={() => setLunchStatus(s.id, val)}
                            title={"Mark as " + label + " lunch"}
                            className={"px-2.5 py-1.5 rounded-lg text-xs font-semibold border-2 transition-fast " + (isActive ? activeClass : 'bg-white text-primary-400 border-primary-100 hover:bg-primary-50')}
                          >{label}</button>
                        );
                      })}
                    </div>
                    {editingId === s.id ? (
                      <button onClick={() => saveEdit(s.id)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold">Save</button>
                    ) : (
                      <button onClick={() => startEdit(s)} className="px-3 py-1.5 rounded-lg bg-primary-50 text-primary text-sm font-semibold hover:bg-primary-100">Edit</button>
                    )}
                    <button onClick={() => deleteStudent(s.id)} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-sm font-semibold hover:bg-rose-100">Delete</button>
                  </div>
                ))}
              </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ ADMIN: STAFF & ADULTS MANAGEMENT ============================ */
// Mirrors StudentManagement, but scoped to classrooms of type 'staff' only. Staff members are
// stored in the same 'students' collection (they're just the "roster" of a Staff & Adults
// classroom) so all of the existing entry-taking / verification / tallying logic works for them
// without any changes. Lunch status (paid/reduced/free) isn't relevant for staff, so it's left
// out here and always saved as 'paid'.
// Common job titles offered as <datalist> suggestions on the Position field below — it's still
// a free-text input (so any title can be typed), the datalist just makes it behave like a
// dropdown for the common cases.
const STAFF_POSITION_SUGGESTIONS = ['Teacher', 'Teacher Aide', 'Administrator', 'Front Office', 'Custodian', 'Cafeteria Staff', 'Nurse', 'Counselor', 'Parent/Volunteer'];

function StaffManagement({ data }) {
  const staffClassrooms = useMemo(() => sortClassroomsByGrade(data.classrooms.filter(c => c.type === 'staff')), [data.classrooms]);
  const [newPosition, setNewPosition] = useState('');
  const [newFirst, setNewFirst] = useState('');
  const [newLast, setNewLast] = useState('');
  const [newClass, setNewClass] = useState(staffClassrooms[0] ? staffClassrooms[0].id : '');
  const [editingId, setEditingId] = useState(null);
  const [editPosition, setEditPosition] = useState('');
  const [editFirst, setEditFirst] = useState('');
  const [editLast, setEditLast] = useState('');
  const [collapsed, setCollapsed] = useState({});
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }
  // Per-classroom sort choice: 'order' is the admin's manual drag-and-drop order (the order staff
  // cards will actually appear in the classroom view); 'name' and 'position' are simple alphabetical
  // sorts for finding someone quickly, without touching the underlying manual order.
  const [sortByClass, setSortByClass] = useState({});
  const [dragState, setDragState] = useState({ classroomId: null, draggedId: null });

  useEffect(() => {
    if (!newClass && staffClassrooms[0]) setNewClass(staffClassrooms[0].id);
    // eslint-disable-next-line
  }, [data.classrooms]);

  async function addStaff(e) {
    e.preventDefault();
    if (!newFirst.trim() || !newLast.trim() || !newClass) return;
    const existingCount = data.students.filter(s => s.classroomId === newClass).length;
    await saveStudent({ position: newPosition.trim(), firstName: newFirst.trim(), lastName: newLast.trim(), classroomId: newClass, lunchStatus: 'paid', sortOrder: existingCount });
    setNewPosition(''); setNewFirst(''); setNewLast('');
  }

  async function deleteStaff(id) {
    if (!confirm('Remove this staff member? This cannot be undone.')) return;
    await deleteStudentDoc(id);
  }

  async function toggleParentCard(cls) {
    await saveClassroom({ id: cls.id, grade: cls.grade, teacher: cls.teacher, type: 'staff', showAdultCard: !cls.showAdultCard });
  }

  function startEdit(s) { setEditingId(s.id); setEditPosition(s.position || ''); setEditFirst(s.firstName); setEditLast(s.lastName); }
  async function saveEdit(id) {
    const s = data.students.find(x => x.id === id);
    if (!s) return;
    await saveStudent({ id, position: editPosition.trim(), firstName: editFirst.trim() || s.firstName, lastName: editLast.trim() || s.lastName, classroomId: s.classroomId, lunchStatus: 'paid', sortOrder: s.sortOrder });
    setEditingId(null);
  }

  function sortByFor(classroomId) { return sortByClass[classroomId] || 'order'; }
  function setSortBy(classroomId, val) { setSortByClass(prev => ({ ...prev, [classroomId]: val })); }

  // Persists a full drag-and-drop reorder: every staff member in the classroom gets a fresh
  // sortOrder matching their new position in the list, so the classroom view (which orders staff
  // by sortOrder) reflects the exact order the admin dragged them into.
  async function persistOrder(classroomId, orderedRoster) {
    for (let i = 0; i < orderedRoster.length; i++) {
      const s = orderedRoster[i];
      if (s.sortOrder !== i) {
        await saveStudent({ id: s.id, position: s.position || '', firstName: s.firstName, lastName: s.lastName, classroomId: s.classroomId, lunchStatus: s.lunchStatus || 'paid', sortOrder: i });
      }
    }
  }

  function handleDragStart(classroomId, studentId) { setDragState({ classroomId, draggedId: studentId }); }
  function handleDragOver(e) { e.preventDefault(); }
  async function handleDrop(classroomId, targetId, currentRoster) {
    const { draggedId } = dragState;
    setDragState({ classroomId: null, draggedId: null });
    if (!draggedId || draggedId === targetId) return;
    const list = currentRoster.slice();
    const fromIdx = list.findIndex(s => s.id === draggedId);
    const toIdx = list.findIndex(s => s.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    await persistOrder(classroomId, list);
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Staff &amp; Adults</h3>
      <p className="text-sm font-light text-primary-600 mb-4">
        Manage the roster of staff who need lunch each day. Create a "Staff &amp; Adults" classroom
        under Admin &rarr; Classrooms first, then add staff here &mdash; it works just like Student
        Management, but only Today's Lunch Count and Today's Final Lunch Count apply (no breakfast).
      </p>

      {staffClassrooms.length === 0 ? (
        <p className="text-sm font-light text-primary-500 mb-4">No "Staff &amp; Adults" classroom yet. Create one under Admin &rarr; Classrooms (choose Type: Staff &amp; Adults).</p>
      ) : (
        <React.Fragment>
          <datalist id="staff-position-suggestions">
            {STAFF_POSITION_SUGGESTIONS.map(p => <option key={p} value={p} />)}
          </datalist>

          <form onSubmit={addStaff} className="bg-white rounded-2xl card-shadow p-4 border border-primary-100 mb-6 flex flex-wrap gap-3 items-end">
            <div className="w-44">
              <label className="text-xs font-medium text-primary-500 uppercase">Position</label>
              <input list="staff-position-suggestions" value={newPosition} onChange={e => setNewPosition(e.target.value)} placeholder="e.g. Custodian" className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-primary-500 uppercase">First Name</label>
              <input value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="First" className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary" />
            </div>
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs font-medium text-primary-500 uppercase">Last Name</label>
              <input value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Last" className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs font-medium text-primary-500 uppercase">Staff Classroom</label>
              <select value={newClass} onChange={e => setNewClass(e.target.value)} className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 focus:outline-none focus:border-primary">
                {staffClassrooms.map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
              </select>
            </div>
            <PrimaryButton type="submit">Add Staff Member</PrimaryButton>
          </form>

          <div className="grid gap-5">
            {staffClassrooms.map(c => {
              const sortBy = sortByFor(c.id);
              const roster = sortStudents(data.students.filter(s => s.classroomId === c.id), sortBy);
              const isCollapsed = isSectionCollapsed(collapsed, c.id);
              const dragEnabled = sortBy === 'order';
              return (
                <div key={c.id} className="bg-white rounded-2xl card-shadow border border-primary-100 overflow-hidden">
                  <div className="w-full bg-primary-50 px-4 py-2.5 border-b border-primary-100 flex items-center gap-3 flex-wrap">
                    <div onClick={() => toggleCollapse(c.id)} className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer">
                      <CollapseToggle collapsed={isCollapsed} onClick={() => toggleCollapse(c.id)} />
                      <h4 className="font-bold text-primary-900 text-sm">{classroomLabel(c)} <span className="font-light text-primary-500">({roster.length})</span></h4>
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-primary-500 uppercase">Sort</label>
                      <select value={sortBy} onChange={e => setSortBy(c.id, e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1 text-xs">
                        <option value="order">Manual Order</option>
                        <option value="first">Name (First)</option>
                        <option value="last">Name (Last)</option>
                        <option value="position">Position</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-primary-700 pr-1">
                      <input type="checkbox" checked={!!c.showAdultCard} onChange={() => toggleParentCard(c)} />
                      Enable Parent/Adult Card
                    </label>
                  </div>
                  {!isCollapsed && (
                  <div className="divide-y divide-primary-50">
                    {roster.length === 0 && <p className="p-4 text-sm font-light text-primary-500">No staff added yet.</p>}
                    {dragEnabled && roster.length > 1 && (
                      <p className="px-4 pt-3 text-xs font-light text-primary-500">Drag &amp; drop rows below (using the ⠿ handle) to set the order staff cards appear in the classroom view.</p>
                    )}
                    {roster.map(s => (
                      <div
                        key={s.id}
                        draggable={dragEnabled && editingId !== s.id}
                        onDragStart={() => handleDragStart(c.id, s.id)}
                        onDragOver={dragEnabled ? handleDragOver : undefined}
                        onDrop={dragEnabled ? () => handleDrop(c.id, s.id, roster) : undefined}
                        className={"flex items-center gap-3 p-4 flex-wrap " + (dragEnabled ? 'cursor-move' : '')}
                      >
                        {dragEnabled && <span className="text-primary-300 select-none" title="Drag to reorder">⠿</span>}
                        {editingId === s.id ? (
                          <React.Fragment>
                            <input list="staff-position-suggestions" value={editPosition} onChange={e => setEditPosition(e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1 w-36" placeholder="Position" autoFocus />
                            <input value={editFirst} onChange={e => setEditFirst(e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1 flex-1 min-w-[110px]" placeholder="First" />
                            <input value={editLast} onChange={e => setEditLast(e.target.value)} className="border-2 border-primary-200 rounded-lg px-2 py-1 flex-1 min-w-[110px]" placeholder="Last" />
                          </React.Fragment>
                        ) : (
                          <p className="font-medium text-primary-900 flex-1 min-w-[140px]">{s.position ? <span className="text-primary-400">{s.position} &middot; </span> : null}{s.firstName} {s.lastName}</p>
                        )}
                        {editingId === s.id ? (
                          <button onClick={() => saveEdit(s.id)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold">Save</button>
                        ) : (
                          <button onClick={() => startEdit(s)} className="px-3 py-1.5 rounded-lg bg-primary-50 text-primary text-sm font-semibold hover:bg-primary-100">Edit</button>
                        )}
                        <button onClick={() => deleteStaff(s.id)} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-sm font-semibold hover:bg-rose-100">Delete</button>
                      </div>
                    ))}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </React.Fragment>
      )}
    </div>
  );
}

/* ============================ ADMIN: CLASSROOM MANAGEMENT ============================ */
function ClassroomManagement({ data }) {
  const [form, setForm] = useState({ grade: '', teacher: '', type: 'class', showAdultCard: false, enablePre: true, enableBreakfast: true, enableFinal: true });
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ grade: '', teacher: '', type: 'class', showAdultCard: false, enablePre: true, enableBreakfast: true, enableFinal: true });
  const [collapsed, setCollapsed] = useState({});
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }

  async function addClassroom(e) {
    e.preventDefault();
    if (!form.grade.trim() || !form.teacher.trim()) return;
    await saveClassroom({ grade: form.grade.trim(), teacher: form.teacher.trim(), type: form.type, showAdultCard: form.type === 'staff' && form.showAdultCard, enablePre: form.enablePre, enableBreakfast: form.enableBreakfast, enableFinal: form.enableFinal });
    setForm({ grade: '', teacher: '', type: 'class', showAdultCard: false, enablePre: true, enableBreakfast: true, enableFinal: true });
  }

  async function deleteClassroom(id) {
    const hasStudents = data.students.some(s => s.classroomId === id);
    if (hasStudents) { alert('Cannot delete a classroom that still has students assigned. Move students first.'); return; }
    if (!confirm('Delete this classroom?')) return;
    await deleteClassroomDoc(id);
  }

  function startEdit(c) { setEditingId(c.id); setEditForm({ grade: c.grade, teacher: c.teacher, type: c.type || 'class', showAdultCard: !!c.showAdultCard, enablePre: c.enablePre !== false, enableBreakfast: c.enableBreakfast !== false, enableFinal: c.enableFinal !== false }); }
  async function saveEdit(id) {
    await saveClassroom({ id, grade: editForm.grade.trim(), teacher: editForm.teacher.trim(), type: editForm.type, showAdultCard: editForm.type === 'staff' && editForm.showAdultCard, enablePre: editForm.enablePre, enableBreakfast: editForm.enableBreakfast, enableFinal: editForm.enableFinal });
    setEditingId(null);
  }

  // Quick inline toggle for the enable/disable checkboxes shown on every classroom card, without
  // needing to enter Edit mode first.
  async function toggleStage(c, stageField) {
    await saveClassroom({
      id: c.id, grade: c.grade, teacher: c.teacher, type: c.type || 'class', showAdultCard: !!c.showAdultCard,
      enablePre: stageField === 'enablePre' ? !(c.enablePre !== false) : (c.enablePre !== false),
      enableBreakfast: stageField === 'enableBreakfast' ? !(c.enableBreakfast !== false) : (c.enableBreakfast !== false),
      enableFinal: stageField === 'enableFinal' ? !(c.enableFinal !== false) : (c.enableFinal !== false)
    });
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Classroom Management</h3>
      <p className="text-sm font-light text-primary-600 mb-4">Classrooms are identified by grade and teacher. Choose Type: "Staff &amp; Adults" for a classroom that tracks staff/adult lunches instead of a student roster (Today's Lunch Count and Today's Final Lunch Count only &mdash; no breakfast).</p>
      <form onSubmit={addClassroom} className="bg-white rounded-2xl card-shadow p-4 border border-primary-100 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase">Grade / Name</label>
          <input value={form.grade} onChange={e => setForm({ ...form, grade: e.target.value })} placeholder={form.type === 'staff' ? 'Staff & Adults' : '2nd Grade'} className="border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 w-40 focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase">Teacher / Contact</label>
          <input value={form.teacher} onChange={e => setForm({ ...form, teacher: e.target.value })} placeholder="Mrs. Smith" className="border-2 border-primary-200 rounded-xl px-3 py-2 mt-1 w-48 focus:outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase">Type</label>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="border-2 border-primary-200 rounded-xl px-3 py-2 mt-1">
            <option value="class">Classroom</option>
            <option value="staff">Staff &amp; Adults</option>
          </select>
        </div>
        {form.type === 'staff' && (
          <label className="flex items-center gap-2 text-sm font-medium text-primary-700 pb-2">
            <input type="checkbox" checked={form.showAdultCard} onChange={e => setForm({ ...form, showAdultCard: e.target.checked })} />
            Enable Parent/Adult Card
          </label>
        )}
        <div className="flex flex-wrap gap-3 pb-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
            <input type="checkbox" checked={form.enablePre} onChange={e => setForm({ ...form, enablePre: e.target.checked })} />
            Morning Pre-Count
          </label>
          {form.type !== 'staff' && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
              <input type="checkbox" checked={form.enableBreakfast} onChange={e => setForm({ ...form, enableBreakfast: e.target.checked })} />
              Breakfast Count
            </label>
          )}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
            <input type="checkbox" checked={form.enableFinal} onChange={e => setForm({ ...form, enableFinal: e.target.checked })} />
            Lunch Final Count
          </label>
        </div>
        <PrimaryButton type="submit">Add Classroom</PrimaryButton>
      </form>

      <div className="grid sm:grid-cols-2 gap-4">
        {data.classrooms.length === 0 && <p className="text-sm font-light text-primary-500">No classrooms yet.</p>}
        {sortClassroomsByGrade(data.classrooms).map(c => (
          <div key={c.id} className="bg-white rounded-2xl card-shadow border border-primary-100 p-4">
            {editingId === c.id ? (
              <div className="flex flex-col gap-2">
                <input value={editForm.grade} onChange={e => setEditForm({ ...editForm, grade: e.target.value })} className="border-2 border-primary-200 rounded-lg px-2 py-1" placeholder="Grade" />
                <input value={editForm.teacher} onChange={e => setEditForm({ ...editForm, teacher: e.target.value })} className="border-2 border-primary-200 rounded-lg px-2 py-1" placeholder="Teacher" />
                <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value })} className="border-2 border-primary-200 rounded-lg px-2 py-1">
                  <option value="class">Classroom</option>
                  <option value="staff">Staff &amp; Adults</option>
                </select>
                {editForm.type === 'staff' && (
                  <label className="flex items-center gap-2 text-sm font-medium text-primary-700">
                    <input type="checkbox" checked={editForm.showAdultCard} onChange={e => setEditForm({ ...editForm, showAdultCard: e.target.checked })} />
                    Enable Parent/Adult Card
                  </label>
                )}
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                    <input type="checkbox" checked={editForm.enablePre} onChange={e => setEditForm({ ...editForm, enablePre: e.target.checked })} />
                    Morning Pre-Count
                  </label>
                  {editForm.type !== 'staff' && (
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                      <input type="checkbox" checked={editForm.enableBreakfast} onChange={e => setEditForm({ ...editForm, enableBreakfast: e.target.checked })} />
                      Breakfast Count
                    </label>
                  )}
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                    <input type="checkbox" checked={editForm.enableFinal} onChange={e => setEditForm({ ...editForm, enableFinal: e.target.checked })} />
                    Lunch Final Count
                  </label>
                </div>
                <div className="flex gap-2 mt-1">
                  <button onClick={() => saveEdit(c.id)} className="px-3 py-1.5 rounded-lg bg-primary text-white text-sm font-semibold">Save</button>
                  <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-sm font-semibold">Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div onClick={() => toggleCollapse(c.id)} className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer">
                    <CollapseToggle collapsed={isSectionCollapsed(collapsed, c.id)} onClick={() => toggleCollapse(c.id)} />
                    <div>
                      <p className="font-bold text-primary-900">{c.grade}{c.type === 'staff' && ' 🧑‍🏫'}</p>
                      {!isSectionCollapsed(collapsed, c.id) && (
                        <React.Fragment>
                          <p className="text-sm text-primary-600 font-light">{c.teacher}</p>
                          <p className="text-xs text-primary-400 font-light mt-1">{data.students.filter(s => s.classroomId === c.id).length} {c.type === 'staff' ? 'staff' : 'students'}{c.type === 'staff' && c.showAdultCard ? ' \u00b7 Adult card enabled' : ''}</p>
                        </React.Fragment>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(c)} className="px-3 py-1.5 rounded-lg bg-primary-50 text-primary text-sm font-semibold hover:bg-primary-100">Edit</button>
                    <button onClick={() => deleteClassroom(c.id)} className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-sm font-semibold hover:bg-rose-100">Delete</button>
                  </div>
                </div>
                {!isSectionCollapsed(collapsed, c.id) && (
                  <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-primary-50">
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                      <input type="checkbox" checked={c.enablePre !== false} onChange={() => toggleStage(c, 'enablePre')} />
                      Morning Pre-Count
                    </label>
                    {c.type !== 'staff' && (
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                        <input type="checkbox" checked={c.enableBreakfast !== false} onChange={() => toggleStage(c, 'enableBreakfast')} />
                        Breakfast Count
                      </label>
                    )}
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                      <input type="checkbox" checked={c.enableFinal !== false} onChange={() => toggleStage(c, 'enableFinal')} />
                      Lunch Final Count
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ ADMIN: EXPORT ============================ */
function ExportPanel({ data }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [breakfastYear, setBreakfastYear] = useState(now.getFullYear());
  const [breakfastMonth, setBreakfastMonth] = useState(now.getMonth() + 1);

  const yearOptions = [];
  for (let y = now.getFullYear() - 2; y <= now.getFullYear() + 1; y++) yearOptions.push(y);

  const preview = useMemo(() => buildMonthlyMealCountDays(data, year, month), [data, year, month]);
  const daysWithData = preview.filter(Boolean).length;

  // Blocks the Lunch export entirely while any classroom-day in this month has a submitted
  // Lunch Final Count that an admin hasn't verified yet — an unverified count could still
  // change and shouldn't be locked into an official reimbursement report.
  const unverifiedDays = useMemo(() => findUnverifiedLunchDays(data, year, month), [data, year, month]);

  const breakfastPreview = useMemo(() => buildMonthlyBreakfastCountDays(data, breakfastYear, breakfastMonth), [data, breakfastYear, breakfastMonth]);
  const breakfastDaysWithData = breakfastPreview.filter(Boolean).length;

  function runExport() {
    if (unverifiedDays.length > 0) {
      alert(
        'Export blocked: ' + unverifiedDays.length + ' classroom-day' + (unverifiedDays.length === 1 ? '' : 's') +
        ' in ' + monthNameOf(month) + ' ' + year + ' ' + (unverifiedDays.length === 1 ? 'has' : 'have') +
        " a submitted Final Lunch Count that has not been verified by an admin yet. See the list below \u2014 verify " +
        (unverifiedDays.length === 1 ? 'it' : 'them') + ' in Admin \u2192 Daily Verification & Finalization (Lunch tab) first.'
      );
      return;
    }
    downloadMonthlyMealCountXLSX(data, year, month);
  }
  function runBreakfastExport() {
    downloadMonthlyBreakfastCountXLSX(data, breakfastYear, breakfastMonth);
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Monthly Lunch Meal Count Export</h3>
      <p className="text-sm font-light text-primary-600 mb-6">
        Pick a month and year to download the reimbursable meal count report in the exact layout of
        your official monthly form &mdash; Elementary / Middle / High School Paid, Reduced Price, Free,
        and Total, one row per day, with the same live formulas. This always reflects the current
        saved data, so anything deleted or corrected in Admin &rarr; Data Management is already
        accounted for before you download. Staff &amp; Adults classrooms are excluded from this report.
      </p>

      {unverifiedDays.length > 0 && (
        <div className="mb-4 bg-rose-50 border-2 border-rose-300 text-rose-800 rounded-xl p-4">
          <p className="text-sm font-bold mb-2">
            ⚠ Export blocked &mdash; {unverifiedDays.length} unverified Final Lunch Count{unverifiedDays.length === 1 ? '' : 's'} in {monthNameOf(month)} {year}:
          </p>
          <ul className="text-sm font-light list-disc list-inside max-h-40 overflow-y-auto">
            {unverifiedDays.map((p, i) => (
              <li key={i}>{formatShortDate(p.date)} &middot; {classroomLabel(p.classroom)}</li>
            ))}
          </ul>
          <p className="text-xs font-light mt-2">
            Verify these in Admin &rarr; Daily Verification &amp; Finalization (Lunch tab) before exporting.
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl card-shadow border border-primary-100 p-5">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div>
            <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Month</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border-2 border-primary-200 rounded-xl px-3 py-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{monthNameOf(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Year</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="border-2 border-primary-200 rounded-xl px-3 py-2">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <PrimaryButton disabled={unverifiedDays.length > 0} onClick={runExport}>Download Monthly Report</PrimaryButton>
        </div>
        <p className="text-xs font-light text-primary-500">
          {daysWithData} of {daysInMonth(year, month)} day{daysInMonth(year, month) === 1 ? '' : 's'} in {monthNameOf(month)} {year} have a final, submitted count so far.
          Days without a submitted count are left blank in the export, just like the paper form.
        </p>
      </div>

      <p className="text-xs font-light text-primary-400 mt-3">
        Elementary / Middle / High School bands come from Admin &rarr; Grade Bands. Reduced and Free
        counts come from each student's lunch status, set in Admin &rarr; Students.
      </p>

      <hr className="my-8 border-primary-100" />

      <h3 className="text-xl font-bold text-primary-900 mb-4">Monthly Breakfast Pre-Count Export</h3>
      <p className="text-sm font-light text-primary-600 mb-6">
        Same layout as the Monthly Lunch Meal Count Export, but for Breakfast Pre-Counts. Each
        classroom's breakfast count is taken the day before and recorded against the day it's
        actually for, so this report is bucketed by that target day, not the day it was taken.
      </p>

      <div className="bg-white rounded-2xl card-shadow border border-primary-100 p-5">
        <div className="flex flex-wrap gap-4 items-end mb-4">
          <div>
            <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Month</label>
            <select value={breakfastMonth} onChange={e => setBreakfastMonth(Number(e.target.value))} className="border-2 border-primary-200 rounded-xl px-3 py-2">
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <option key={m} value={m}>{monthNameOf(m)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Year</label>
            <select value={breakfastYear} onChange={e => setBreakfastYear(Number(e.target.value))} className="border-2 border-primary-200 rounded-xl px-3 py-2">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <PrimaryButton onClick={runBreakfastExport}>Download Breakfast Report</PrimaryButton>
        </div>
        <p className="text-xs font-light text-primary-500">
          {breakfastDaysWithData} of {daysInMonth(breakfastYear, breakfastMonth)} day{daysInMonth(breakfastYear, breakfastMonth) === 1 ? '' : 's'} in {monthNameOf(breakfastMonth)} {breakfastYear} have a submitted breakfast pre-count so far.
        </p>
      </div>
    </div>
  );
}

/* ============================ ADMIN: DATA MANAGEMENT (delete / fix counts) ============================ */
// Bulk delete/reset for a whole scope (day/week/month/quarter/semester/custom range), for one
// classroom or all classrooms. Uses the same range pickers as Analytics for a familiar feel.
function DataManagementPanel({ data }) {
  const [scope, setScope] = useState('daily');
  const [dateVal, setDateVal] = useState(todayStr());
  const [monthVal, setMonthVal] = useState(todayStr().slice(0, 7));
  const [termKey, setTermKey] = useState('Q1');
  const [customStart, setCustomStart] = useState(todayStr());
  const [customEnd, setCustomEnd] = useState(todayStr());
  const [classroomId, setClassroomId] = useState('');
  const [target, setTarget] = useState('both');
  const [includeVerified, setIncludeVerified] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  function resetPreview() { setPreview(null); }

  function resolveRange() {
    if (scope === 'daily') return { start: parseDateStr(dateVal), end: parseDateStr(dateVal), label: formatDisplayDate(dateVal) };
    if (scope === 'weekly') {
      const r = getWeekRange(dateVal);
      return { start: r.start, end: r.end, label: formatShortDate(toDateStr(r.start)) + ' – ' + formatShortDate(toDateStr(r.end)) };
    }
    if (scope === 'monthly') {
      const r = getMonthRange(monthVal);
      return { start: r.start, end: r.end, label: r.start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    }
    if (scope === 'quarter' || scope === 'semester') {
      const r = getTermRange(data.settings, termKey);
      if (!r) return null;
      return { start: r.start, end: r.end, label: TERM_LABELS[termKey] + ': ' + formatShortDate(toDateStr(r.start)) + ' – ' + formatShortDate(toDateStr(r.end)) };
    }
    const start = parseDateStr(customStart);
    let end = parseDateStr(customEnd);
    if (end < start) end = start;
    return { start, end, label: formatShortDate(customStart) + ' – ' + formatShortDate(toDateStr(end)) };
  }

  function runPreview() {
    const range = resolveRange();
    if (!range) { alert('No dates set for ' + TERM_LABELS[termKey] + ' yet. Set them in Admin \u2192 Term Settings.'); return; }
    let matches = findLogsInRange(data, range.start, range.end, classroomId || null);
    if (!includeVerified) matches = matches.filter(l => !l.verified);
    setPreview({ range, matches });
  }

  async function runDelete() {
    if (!preview || preview.matches.length === 0) return;
    const verifiedCount = preview.matches.filter(l => l.verified).length;
    const whatMap = { both: "the entire day's record", pre: "today's lunch count", breakfast: 'the breakfast pre-count', final: "today's final lunch count" };
    const what = whatMap[target];
    const msg = 'This will permanently delete ' + what + ' for ' + preview.matches.length +
      ' classroom-day record(s) in ' + preview.range.label +
      (verifiedCount ? ' (including ' + verifiedCount + ' already verified/finalized)' : '') +
      '. This cannot be undone. Continue?';
    if (!confirm(msg)) return;
    setBusy(true);
    if (target === 'both') await deleteWholeLogs(preview.matches);
    else if (target === 'pre') await clearPreCountForLogs(preview.matches);
    else if (target === 'breakfast') await clearBreakfastCountForLogs(preview.matches);
    else await clearFinalCountForLogs(preview.matches);
    setBusy(false);
    setPreview(null);
    alert('Done. Analytics and the Monthly Meal Count / Breakfast Pre-Count Exports will reflect this immediately.');
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Delete or Reset Count Data</h3>
      <p className="text-sm font-light text-primary-600 mb-4">
        Remove lunch count data for a day, week, month, quarter, or semester &mdash; for one
        classroom or all of them at once. Analytics and the Monthly Meal Count Export always read
        the latest saved data, so they update automatically once something is removed here.
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {[['daily', 'Day'], ['weekly', 'Week'], ['monthly', 'Month'], ['quarter', 'Quarter'], ['semester', 'Semester'], ['custom', 'Custom Range']].map(([val, label]) => (
          <button key={val} onClick={() => { setScope(val); resetPreview(); }} className={"px-4 py-2 rounded-xl font-semibold text-sm border-2 transition-fast " + (scope === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}>{label}</button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-4">
        {(scope === 'daily' || scope === 'weekly') && (
          <input type="date" value={dateVal} onChange={e => { setDateVal(e.target.value); resetPreview(); }} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        )}
        {scope === 'monthly' && (
          <input type="month" value={monthVal} onChange={e => { setMonthVal(e.target.value); resetPreview(); }} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        )}
        {scope === 'quarter' && ['Q1', 'Q2', 'Q3', 'Q4'].map(k => (
          <button key={k} onClick={() => { setTermKey(k); resetPreview(); }} className={"px-3 py-1.5 rounded-lg text-sm font-semibold border-2 " + (termKey === k ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>{k}</button>
        ))}
        {scope === 'semester' && ['S1', 'S2'].map(k => (
          <button key={k} onClick={() => { setTermKey(k); resetPreview(); }} className={"px-3 py-1.5 rounded-lg text-sm font-semibold border-2 " + (termKey === k ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>{k}</button>
        ))}
        {scope === 'custom' && (
          <React.Fragment>
            <input type="date" value={customStart} onChange={e => { setCustomStart(e.target.value); resetPreview(); }} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
            <span className="text-sm text-primary-500">to</span>
            <input type="date" value={customEnd} onChange={e => { setCustomEnd(e.target.value); resetPreview(); }} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
          </React.Fragment>
        )}
      </div>

      <div className="flex flex-wrap gap-4 items-end mb-4">
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Classroom</label>
          <select value={classroomId} onChange={e => { setClassroomId(e.target.value); resetPreview(); }} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            <option value="">All Classrooms</option>
            {sortClassroomsByGrade(data.classrooms).map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">What to Remove</label>
          <select value={target} onChange={e => { setTarget(e.target.value); resetPreview(); }} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            <option value="both">Both (delete entire day's record)</option>
            <option value="pre">Today's Lunch Count only</option>
            <option value="breakfast">Breakfast Pre-Count only</option>
            <option value="final">Today's Final Lunch Count only</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-primary-700 font-medium pb-2">
          <input type="checkbox" checked={includeVerified} onChange={e => { setIncludeVerified(e.target.checked); resetPreview(); }} />
          Include already-verified/finalized days
        </label>
        <GhostButton onClick={runPreview}>Preview Matches</GhostButton>
      </div>

      {preview && (
        <div className="bg-white rounded-2xl card-shadow border border-primary-100 p-4">
          {preview.matches.length === 0 ? (
            <p className="text-sm font-light text-primary-500">No matching records found for {preview.range.label}.</p>
          ) : (
            <React.Fragment>
              <p className="text-sm font-semibold text-primary-800 mb-2">{preview.matches.length} classroom-day record(s) match in {preview.range.label}:</p>
              <ul className="text-sm text-primary-700 font-light max-h-48 overflow-y-auto mb-4 list-disc list-inside">
                {preview.matches.map(l => {
                  const cls = data.classrooms.find(c => c.id === l.classroomId);
                  return <li key={l.id}>{formatShortDate(l.date)} &mdash; {classroomLabel(cls)}{l.verified ? ' (Verified)' : ''}</li>;
                })}
              </ul>
              <DangerButton disabled={busy} onClick={runDelete}>{busy ? 'Deleting…' : 'Delete Matching Data'}</DangerButton>
            </React.Fragment>
          )}
        </div>
      )}
    </div>
  );
}

// Fix-one-record tool: pick a classroom + student + date and edit or remove just that
// student's pre-count / breakfast / final-count entry, without touching anyone else's data for
// that day.
function StudentRecordEditor({ data }) {
  const [classroomId, setClassroomId] = useState(data.classrooms[0] ? data.classrooms[0].id : '');
  const [studentId, setStudentId] = useState('');
  const [dateVal, setDateVal] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  // Locally-staged, not-yet-saved edits per stage. null for a stage means "no pending edit —
  // show whatever's actually saved in the log". Cleared whenever classroom/student/date changes,
  // or once a Confirm Changes save succeeds for that stage.
  const [draft, setDraft] = useState({ pre: null, breakfast: null, final: null });
  const [confirmedStage, setConfirmedStage] = useState(null);

  const roster = useMemo(() => sortStudents(data.students.filter(s => s.classroomId === classroomId), 'number'), [data.students, classroomId]);

  useEffect(() => {
    if (roster.length && !roster.some(s => s.id === studentId)) setStudentId(roster[0].id);
    if (!roster.length) setStudentId('');
    // eslint-disable-next-line
  }, [classroomId, data.students]);

  // Switching classroom, student, or date abandons any unconfirmed edits rather than silently
  // carrying them over to a different record.
  useEffect(() => {
    setDraft({ pre: null, breakfast: null, final: null });
    // eslint-disable-next-line
  }, [classroomId, studentId, dateVal]);

  const log = data.logsById[logId(dateVal, classroomId)];
  const preEntry = (log && log.pre && log.pre.entries && log.pre.entries[studentId]) || null;
  const breakfastEntry = (log && log.breakfast && log.breakfast.entries && log.breakfast.entries[studentId]) || null;
  const finalEntry = (log && log.final && log.final.entries && log.final.entries[studentId]) || null;

  function setDraftFor(stageKey, entry) {
    setDraft(prev => ({ ...prev, [stageKey]: entry }));
  }

  async function confirmChanges(stageKey, entry) {
    if (!log) { alert("There is no saved record for this classroom on this date yet."); return; }
    setBusy(true);
    const basePre = log.pre || { entries: {}, submitted: false, submittedAt: null };
    const baseBreakfast = log.breakfast || { entries: {}, submitted: false, submittedAt: null, targetDate: nextSchoolDay(data.settings, dateVal) };
    const baseFinal = log.final || { entries: {}, submitted: false, submittedAt: null };
    if (stageKey === 'pre') {
      await saveLogFull(dateVal, classroomId, {
        pre: { ...basePre, entries: { ...basePre.entries, [studentId]: entry } },
        breakfast: baseBreakfast,
        final: baseFinal,
        verified: log.verified,
        verifiedAt: log.verifiedAt,
        breakfastFinal: log.breakfastFinal,
        breakfastVerified: log.breakfastVerified,
        breakfastVerifiedAt: log.breakfastVerifiedAt
      });
    } else if (stageKey === 'breakfast') {
      await saveLogFull(dateVal, classroomId, {
        pre: basePre,
        breakfast: { ...baseBreakfast, entries: { ...baseBreakfast.entries, [studentId]: entry } },
        final: baseFinal,
        verified: log.verified,
        verifiedAt: log.verifiedAt,
        breakfastFinal: log.breakfastFinal,
        breakfastVerified: log.breakfastVerified,
        breakfastVerifiedAt: log.breakfastVerifiedAt
      });
    } else {
      await saveLogFull(dateVal, classroomId, {
        pre: basePre,
        breakfast: baseBreakfast,
        final: { ...baseFinal, entries: { ...baseFinal.entries, [studentId]: entry } },
        verified: false,
        verifiedAt: null,
        breakfastFinal: log.breakfastFinal,
        breakfastVerified: log.breakfastVerified,
        breakfastVerifiedAt: log.breakfastVerifiedAt
      });
    }
    setBusy(false);
    setDraftFor(stageKey, null);
    setConfirmedStage(stageKey);
  }

  async function clearEntry(stageKey) {
    if (!log) return;
    const labelMap = { pre: "today's lunch count", breakfast: 'breakfast pre-count', final: "today's final lunch count" };
    if (!confirm("Remove this student's " + labelMap[stageKey] + ' entry for this day?')) return;
    setBusy(true);
    await clearStudentFromLogs([log], studentId, stageKey);
    setBusy(false);
    setDraftFor(stageKey, null);
  }

  function EntryEditor({ label, savedEntry, stageKey, kind, isStaff }) {
    const draftEntry = draft[stageKey];
    const hasPendingChanges = draftEntry !== null;
    if (isStaff) {
      const e = draftEntry || savedEntry || defaultStaffEntry();
      return (
        <div className="bg-primary-50 rounded-xl p-4">
          <p className="text-xs font-semibold text-primary-700 uppercase mb-2">{label}{!savedEntry && !hasPendingChanges && ' (no entry saved)'}</p>
          <div className="flex flex-wrap gap-2 mb-2">
            <button onClick={() => setDraftFor(stageKey, { attending: true })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (e.attending ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>Yes</button>
            <button onClick={() => setDraftFor(stageKey, { attending: false })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (!e.attending ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>No</button>
            {savedEntry && <button onClick={() => clearEntry(stageKey)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 bg-white text-rose-600 border-rose-200">Remove Entry</button>}
          </div>
          {hasPendingChanges && (
            <button onClick={() => confirmChanges(stageKey, e)} disabled={busy} className="w-full px-3 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
              Confirm Changes
            </button>
          )}
        </div>
      );
    }
    const isBreakfast = kind === 'breakfast';
    const e = draftEntry || savedEntry || (isBreakfast ? defaultBreakfastEntry() : defaultEntry());
    return (
      <div className="bg-primary-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-primary-700 uppercase mb-2">{label}{!savedEntry && !hasPendingChanges && ' (no entry saved)'}</p>
        <div className="flex flex-wrap gap-2 mb-2">
          <button onClick={() => setDraftFor(stageKey, { ...e, absent: !e.absent })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (e.absent ? 'bg-rose-600 text-white border-rose-600' : 'bg-white text-rose-600 border-rose-200')}>
            {e.absent ? 'Absent' : 'Mark Absent'}
          </button>
          {!e.absent && (
            <React.Fragment>
              <button onClick={() => setDraftFor(stageKey, { ...e, meal: 'hot', milk: e.milk === 'no' ? 'no' : 'yes' })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (e.meal === 'hot' ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>{isBreakfast ? 'Breakfast' : 'Hot Lunch'}</button>
              <button onClick={() => setDraftFor(stageKey, { ...e, meal: 'sack' })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (e.meal === 'sack' ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>{isBreakfast ? 'No Breakfast' : 'Sack Lunch'}</button>
              {!isBreakfast && (
                <React.Fragment>
                  <span className="w-full basis-full h-0"></span>
                  <span className="text-xs font-semibold text-primary-500 self-center mr-1">Milk:</span>
                  <button onClick={() => setDraftFor(stageKey, { ...e, milk: 'yes' })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (e.milk === 'yes' ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>Yes</button>
                  <button onClick={() => setDraftFor(stageKey, { ...e, milk: 'no' })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (e.milk === 'no' ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>No</button>
                </React.Fragment>
              )}
            </React.Fragment>
          )}
          {savedEntry && <button onClick={() => clearEntry(stageKey)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border-2 bg-white text-rose-600 border-rose-200">Remove Entry</button>}
        </div>
        {hasPendingChanges && (
          <button onClick={() => confirmChanges(stageKey, e)} disabled={busy} className="w-full px-3 py-2 rounded-lg text-sm font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
            Confirm Changes
          </button>
        )}
      </div>
    );
  }

  const breakfastTargetLabel = log && log.breakfast && log.breakfast.targetDate ? formatShortDate(log.breakfast.targetDate) : formatShortDate(nextSchoolDay(data.settings, dateVal));
  const isStaffClassroom = (data.classrooms.find(c => c.id === classroomId) || {}).type === 'staff';
  const confirmedLabels = { pre: "Today's Lunch Count", breakfast: 'Breakfast Pre-Count', final: "Today's Final Lunch Count" };

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Edit or Remove One Student's Record</h3>
      <p className="text-sm font-light text-primary-600 mb-4">
        Fix a mistake for a single student on a single day without touching anyone else's counts.
        Make your changes below, then tap Confirm Changes to save them. Editing the final count
        automatically un-verifies that day, so it's clear the finalized number changed.
      </p>
      <div className="flex flex-wrap gap-4 items-end mb-4">
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Classroom</label>
          <select value={classroomId} onChange={e => setClassroomId(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            {sortClassroomsByGrade(data.classrooms).map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Student</label>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            {roster.map(s => <option key={s.id} value={s.id}>{s.position ? (s.position + ' \u2013 ') : (s.number ? ('#' + s.number + ' ') : '')}{s.firstName} {s.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Date</label>
          <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        </div>
      </div>

      {!log ? (
        <p className="text-sm font-light text-primary-500">No record exists for this classroom on {formatShortDate(dateVal)}.</p>
      ) : !studentId ? (
        <p className="text-sm font-light text-primary-500">This classroom has no students yet.</p>
      ) : (
        <div className={"grid gap-4 " + (isStaffClassroom ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
          <EntryEditor label="Today's Lunch Count" savedEntry={preEntry} stageKey="pre" kind="lunch" isStaff={isStaffClassroom} />
          {!isStaffClassroom && <EntryEditor label={"Breakfast Pre-Count (for " + breakfastTargetLabel + ")"} savedEntry={breakfastEntry} stageKey="breakfast" kind="breakfast" />}
          <EntryEditor label="Today's Final Lunch Count" savedEntry={finalEntry} stageKey="final" kind="lunch" isStaff={isStaffClassroom} />
        </div>
      )}
      {busy && <p className="text-xs text-primary-400 mt-2">Saving…</p>}

      {confirmedStage && (
        <SuccessModal
          title="Changes Confirmed"
          message={confirmedLabels[confirmedStage] + " has been updated for this student on " + formatShortDate(dateVal) + "."}
          onDone={() => setConfirmedStage(null)}
        />
      )}
    </div>
  );
}

function DataManagementTab({ data }) {
  return (
    <div>
      <DataManagementPanel data={data} />
      <hr className="my-10 border-primary-100" />
      <StudentRecordEditor data={data} />
    </div>
  );
}

/* ============================ ADMIN: PROMOTE STUDENTS (end-of-year rollover) ============================ */
function PromoteStudentsPanel({ data }) {
  const sortedClassrooms = useMemo(() => sortClassroomsByGrade(data.classrooms), [data.classrooms]);
  const [targets, setTargets] = useState({}); // classroomId -> 'keep' | otherClassroomId | 'graduate'
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  function setTarget(fromId, val) { setResult(null); setTargets(prev => ({ ...prev, [fromId]: val })); }

  const plan = sortedClassrooms
    .map(c => ({ from: c, to: targets[c.id] || 'keep' }))
    .filter(p => p.to !== 'keep');

  async function applyPromotion() {
    if (plan.length === 0) { alert('Choose at least one classroom to promote.'); return; }
    const lines = plan.map(p => {
      const count = data.students.filter(s => s.classroomId === p.from.id).length;
      const toLabel = p.to === 'graduate' ? 'Remove from roster (graduating)' : classroomLabel(data.classrooms.find(c => c.id === p.to));
      return classroomLabel(p.from) + ' (' + count + ' students) \u2192 ' + toLabel;
    });
    const confirmed = confirm(
      "This will move students for the school year rollover:\n\n" + lines.join('\n') +
      "\n\nPast lunch counts stay attached to the classroom they were recorded under, so historical Analytics and exports for prior dates are unaffected. Continue?"
    );
    if (!confirmed) return;
    setBusy(true);
    const summary = [];
    for (const p of plan) {
      const count = await promoteClassroom(data, p.from.id, p.to === 'graduate' ? null : p.to);
      summary.push(classroomLabel(p.from) + ': ' + count + ' student(s) moved');
    }
    setBusy(false);
    setResult(summary);
    setTargets({});
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Promote Students to Next Grade</h3>
      <p className="text-sm font-light text-primary-600 mb-4">
        Run this once, at the end of the school year, to move every student out of this year's
        classroom and into next year's in one step. Create next year's classrooms first under
        Admin &rarr; Classrooms if they don't exist yet &mdash; then come back here and point each
        current classroom at where its students should land.
      </p>

      {sortedClassrooms.length === 0 ? (
        <p className="text-sm font-light text-primary-500">No classrooms yet.</p>
      ) : (
        <div className="grid gap-3 mb-6">
          {sortedClassrooms.map(c => {
            const count = data.students.filter(s => s.classroomId === c.id).length;
            const val = targets[c.id] || 'keep';
            return (
              <div key={c.id} className="bg-white rounded-2xl card-shadow border border-primary-100 p-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-bold text-primary-900">{classroomLabel(c)}</p>
                  <p className="text-xs font-light text-primary-500">{count} students</p>
                </div>
                <select value={val} onChange={e => setTarget(c.id, e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2 text-sm">
                  <option value="keep">Keep as-is (no change)</option>
                  {data.classrooms.filter(cc => cc.id !== c.id).map(cc => (
                    <option key={cc.id} value={cc.id}>Move to: {classroomLabel(cc)}</option>
                  ))}
                  <option value="graduate">Remove from roster (graduating)</option>
                </select>
              </div>
            );
          })}
        </div>
      )}

      <PrimaryButton disabled={busy || plan.length === 0} onClick={applyPromotion}>
        {busy ? 'Applying…' : 'Apply Promotion (' + plan.length + ' classroom(s))'}
      </PrimaryButton>

      {result && (
        <div className="mt-4 bg-green-50 border border-green-300 rounded-xl p-4 text-sm text-green-800">
          {result.map((line, i) => <p key={i}>{line}</p>)}
        </div>
      )}
    </div>
  );
}

/* ============================ ADMIN PANEL ============================ */
function AdminPanel({ data, authUser, onLogout }) {
  const [tab, setTab] = useState('analytics');
  const tabs = [
    ['analytics', 'Analytics'],
    ['verification', 'Verification'],
    ['classrooms', 'Classrooms'],
    ['students', 'Students'],
    ['staff', 'Staff & Adults'],
    ['gradebands', 'Grade Bands'],
    ['settings', 'Term Settings'],
    ['export', 'Export'],
    ['datamgmt', 'Data Management'],
    ['promote', 'Promote Students']
  ];
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-primary-900">Admin Dashboard</h2>
        <div className="text-right">
          <p className="text-xs text-primary-500 font-light">Signed in as {authUser && authUser.email}</p>
          <button onClick={onLogout} className="text-xs font-semibold text-primary hover:underline">Log Out</button>
        </div>
      </div>
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(([val,label]) => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={"btn-touch px-5 py-2.5 rounded-xl font-semibold text-sm transition-fast border-2 " + (tab === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}
          >{label}</button>
        ))}
      </div>

      {tab === 'analytics' && <AnalyticsDashboard data={data} />}
      {tab === 'verification' && <VerificationPanel data={data} />}
      {tab === 'classrooms' && <ClassroomManagement data={data} />}
      {tab === 'students' && <StudentManagement data={data} />}
      {tab === 'staff' && <StaffManagement data={data} />}
      {tab === 'gradebands' && <GradeBandsPanel data={data} />}
      {tab === 'settings' && <TermSettingsPanel settings={data.settings} />}
      {tab === 'export' && <ExportPanel data={data} />}
      {tab === 'datamgmt' && <DataManagementTab data={data} />}
      {tab === 'promote' && <PromoteStudentsPanel data={data} />}
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

/* ============================ ROOT APP ============================ */
function ConnectedApp() {
  const { items: classrooms, loading: classroomsLoading } = useCollection('classrooms');
  const { items: students, loading: studentsLoading } = useCollection('students');
  const { settings, loading: settingsLoading } = useSettingsDoc();
  const { logs, logsById, loading: logsLoading } = useLogs();

  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [role, setRole] = useState('teacher');
  const [showLogin, setShowLogin] = useState(false);
  const [view, setView] = useState({ screen: 'overview', classroomId: null });

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setAuthUser(u);
      setAuthChecked(true);
      if (!u) setRole('teacher');
    });
    return () => unsub();
  }, []);

  function requestRole(r) {
    if (r === 'admin') {
      if (authUser) setRole('admin'); else setShowLogin(true);
      return;
    }
    setRole('teacher');
    setView({ screen: 'overview', classroomId: null });
  }

  function handleLogout() {
    auth.signOut();
    setRole('teacher');
    setView({ screen: 'overview', classroomId: null });
  }

  const data = { classrooms, students, settings, logs, logsById };
  const stillLoading = classroomsLoading || studentsLoading || settingsLoading || logsLoading || !authChecked;

  return (
    <div className="min-h-screen">
      <NavBar role={role} onRequestRole={requestRole} />

      {showLogin && (
        <AdminLoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => { setRole('admin'); setShowLogin(false); }}
        />
      )}

      {stillLoading ? (
        <div className="max-w-6xl mx-auto px-6 py-24 text-center text-primary-500 font-light">Loading live data&hellip;</div>
      ) : (
        <React.Fragment>
          {role === 'teacher' && view.screen === 'overview' && (
            <TeacherOverview
              data={data}
              onOpenClassroom={(id) => setView({ screen: 'workspace', classroomId: id })}
              onOpenBreakfastFinal={() => setView({ screen: 'breakfastFinal', classroomId: null })}
            />
          )}
          {role === 'teacher' && view.screen === 'workspace' && (
            <ClassroomWorkspace
              key={view.classroomId}
              data={data}
              classroomId={view.classroomId}
              onBack={() => setView({ screen: 'overview', classroomId: null })}
            />
          )}
          {role === 'teacher' && view.screen === 'breakfastFinal' && (
            <BreakfastFinalView
              data={data}
              onBack={() => setView({ screen: 'overview', classroomId: null })}
            />
          )}
          {role === 'admin' && authUser && (
            <AdminPanel data={data} authUser={authUser} onLogout={handleLogout} />
          )}
        </React.Fragment>
      )}

      <footer className="text-center text-xs font-light text-primary-400 py-8">
        <p>Counting Loaves · Lunch Counter App</p>
        <p className="mt-1">Made only for St. Mary Catholic School</p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <DailyPasswordGate>
      {FIREBASE_NOT_CONFIGURED ? (
        <div className="min-h-screen">
          <div className="bg-primary text-white">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
              <h1 className="text-2xl font-bold leading-tight">🍞 Counting Loaves</h1>
            </div>
          </div>
          <SetupRequiredScreen />
        </div>
      ) : (
        <ConnectedApp />
      )}
    </DailyPasswordGate>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);