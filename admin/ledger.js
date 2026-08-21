/* ========================================================================
   LEDGER.JS — Counting Loaves (Student Lunch Account ledger) — v2
   Loaded on the admin page ONLY, AFTER shared.js and BEFORE export.js,
   lunch-accounts.js, and admin.js.

   v2 changes from the original design:
   - No more "credit" / running balance. This is a DUE model: every
     transaction is a charge (>= $0). "Total Due" for a month = sum of that
     month's charges. Payments are handled outside this app.
   - Settings now has exactly 3 rates: hotLunchFull, reducedLunchRate,
     extraMilkSack. Free status is always $0. Reduced status pays the same
     reducedLunchRate whether the day was hot lunch or a milk-with-sack day
     (matches how reduced-price meal programs usually work) — see
     rateForEntry() below if that assumption doesn't match your policy.
   - Transactions are keyed by `kind`: 'hotLunch' | 'sackMilk' | 'custom',
     not by credit/debit. A plain sack lunch with no milk is $0 and not
     billable, so it never gets a ledger transaction at all (attendance-only,
     pulled straight from the verified log for exports/calendar instead).
   ======================================================================== */

/*
  ------------------------------------------------------------------------
  DATA MODEL
  ------------------------------------------------------------------------

  // Lives on the existing settings/config doc, alongside settings.terms etc.
  interface LunchAccountRates {
    hotLunchFull: number;      // Hot Lunch — Full Pay Rate ($)
    reducedLunchRate: number;  // Reduced Lunch Rate ($) — applies to any billable meal
    extraMilkSack: number;     // Extra Milk — Sack Lunch Rate ($)
  }

  // New top-level Firestore collection: "ledgerTransactions"
  interface LedgerTransaction {
    id: string;
    studentId: string;
    classroomId: string | null;   // denormalized for filtering/reporting
    date: string;                 // 'YYYY-MM-DD'
    kind: 'hotLunch' | 'sackMilk' | 'custom';
    amount: number;                // dollars owed for this single event, >= 0
    note: string | null;           // free text; shown in history, useful for 'custom'
    source: 'auto' | 'manual';
    logId: string | null;          // set only on 'auto' entries, ties back to the verified log
    createdAt: string;
    createdBy: string | null;
    updatedAt?: string | null;
    updatedBy?: string | null;
  }

  Auto-debit ids are deterministic: `auto_<logId>_<studentId>`. Re-verifying a
  corrected day, or un-verifying it, overwrites/deletes that exact doc — so a
  classroom's count can be corrected and re-verified any number of times
  without ever double-charging a student.
*/

/* ============================ RATES ============================ */

function rateForEntry(settings, status, meal, milk) {
  if (status === 'free') return 0;
  const rates = (settings && settings.rates) || {};
  if (meal === 'hot') {
    return Number((status === 'reduced' ? rates.reducedLunchRate : rates.hotLunchFull) || 0);
  }
  if (meal === 'sack' && milk === 'yes') {
    return Number(rates.extraMilkSack || 0);
  }
  return 0; // plain sack lunch, no milk — not billable
}

// What kind of billable event (if any) a day's entry represents. Returns
// null for a plain sack lunch (no milk) or an absence — those aren't
// charged and don't get a ledger transaction, though they still show up on
// exports pulled straight from the verified log.
function kindForEntry(entry) {
  if (!entry || entry.absent) return null;
  if (entry.meal === 'hot') return 'hotLunch';
  if (entry.meal === 'sack' && entry.milk === 'yes') return 'sackMilk';
  return null;
}

const KIND_LABELS = { hotLunch: 'Hot Lunch', sackMilk: 'Sack Lunch + Milk', custom: 'Custom' };
function kindLabel(kind) { return KIND_LABELS[kind] || kind; }

function toCents(amount) { return Math.round(Number(amount || 0) * 100) / 100; }
function formatCurrency(amount) {
  const n = Number(amount || 0);
  const sign = n < 0 ? '-' : '';
  return sign + '$' + Math.abs(n).toFixed(2);
}

/* ============================ FIRESTORE ACCESS ============================ */

function useLedger() {
  const { items, loading } = useCollection('ledgerTransactions');
  return { transactions: items, loading };
}

async function saveLedgerTxn(txn) {
  const id = txn.id || uid('txn');
  const payload = {
    studentId: txn.studentId,
    classroomId: txn.classroomId || null,
    date: txn.date,
    kind: txn.kind,
    amount: toCents(txn.amount),
    note: txn.note || null,
    source: txn.source || 'manual',
    logId: txn.logId || null,
    createdAt: txn.createdAt || new Date().toISOString(),
    createdBy: txn.createdBy || null
  };
  if (txn.updatedAt) payload.updatedAt = txn.updatedAt;
  if (txn.updatedBy) payload.updatedBy = txn.updatedBy;
  await db.collection('ledgerTransactions').doc(id).set(payload);
  return id;
}

async function deleteLedgerTxn(id) { await db.collection('ledgerTransactions').doc(id).delete(); }
async function deleteLedgerTxnIfExists(id) {
  try { await deleteLedgerTxn(id); } catch (e) { /* already gone; fine */ }
}

// Admin-facing add/edit from the "Add/Edit Transaction" modal. Pass the
// existing transaction's `id`, `createdAt`, and `createdBy` when editing so
// history is preserved; omit them for a brand-new manual entry.
async function saveManualTxn({ id, student, kind, amount, date, note, createdBy, createdAt, isEdit }) {
  const amt = toCents(amount);
  if (!(amt >= 0)) throw new Error('Enter a valid amount.');
  if (!date) throw new Error('Pick a date.');
  if (kind === 'custom' && !(note && note.trim())) throw new Error('A note is required for a custom transaction.');
  return saveLedgerTxn({
    id,
    studentId: student.id,
    classroomId: student.classroomId,
    date,
    kind,
    amount: amt,
    note: note || null,
    source: 'manual',
    logId: null,
    createdAt: createdAt || new Date().toISOString(),
    createdBy: isEdit ? undefined : createdBy,
    updatedAt: isEdit ? new Date().toISOString() : undefined,
    updatedBy: isEdit ? createdBy : undefined
  });
}

/* ============================ AUTO-DEBIT ENGINE ============================ */

function autoTxnId(theLogId, studentId) { return 'auto_' + theLogId + '_' + studentId; }

// Call right after saveLogFull, from VerificationPanel's verifyClassroom /
// unverifyClassroom / verifyAll (skip staff classrooms — see admin.js).
// Idempotent: safe to call repeatedly for the same log; it writes exactly
// the transactions that should exist for the current entries and removes
// any that shouldn't (corrected entries, removed students, un-verify, etc).
async function syncAutoDebitsForLog(dateStr, classroomId, roster, finalEntries, settings, verified) {
  const theLogId = logId(dateStr, classroomId);
  const entries = finalEntries || {};
  await Promise.all(roster.map(async (student) => {
    const txnId = autoTxnId(theLogId, student.id);
    if (!verified) return deleteLedgerTxnIfExists(txnId);
    const entry = entries[student.id] || null;
    const kind = kindForEntry(entry);
    if (!kind) return deleteLedgerTxnIfExists(txnId);
    const amount = rateForEntry(settings, student.lunchStatus, entry.meal, entry.milk);
    await saveLedgerTxn({
      id: txnId,
      studentId: student.id,
      classroomId,
      date: dateStr,
      kind,
      amount, // 0 for Free status — event still logged
      note: null,
      source: 'auto',
      logId: theLogId,
      createdAt: new Date().toISOString(),
      createdBy: null
    });
  }));
}

// One-time (or run-anytime) catch-up: walks every already-verified lunch log
// and calls syncAutoDebitsForLog for it, so days verified BEFORE this ledger
// feature existed (or before a student was added to it) get their
// transactions created retroactively. Safe to run repeatedly — it's exactly
// the same idempotent write as the live auto-debit engine, so already-synced
// days are just overwritten with the same values, not duplicated.
// Returns the number of logs processed.
async function backfillAutoDebits(data) {
  const verifiedLogs = (data.logs || []).filter(log => log.verified && log.classroomId && log.date);
  let count = 0;
  for (const log of verifiedLogs) {
    const cls = data.classrooms.find(c => c.id === log.classroomId);
    if (!cls || cls.type === 'staff') continue;
    const roster = data.students.filter(s => s.classroomId === log.classroomId);
    const finalEntries = (log.final && log.final.entries) || {};
    await syncAutoDebitsForLog(log.date, log.classroomId, roster, finalEntries, data.settings, true);
    count++;
  }
  return count;
}

/* ============================ QUERY / MATH HELPERS ============================ */
// Pure functions — no Firestore calls — cheap to recompute in useMemo.

function txnsForStudent(transactions, studentId) {
  return (transactions || []).filter(t => t.studentId === studentId);
}
function sortTxnsByDate(list) {
  return (list || []).slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}
function inRange(dateStr, range) {
  if (!range) return false;
  const d = parseDateStr(dateStr);
  return d >= range.start && d <= range.end;
}
function currentSemesterRange(settings, dateStr) {
  const d = parseDateStr(dateStr);
  const s1 = getTermRange(settings, 'S1');
  if (s1 && d >= s1.start && d <= s1.end) return s1;
  const s2 = getTermRange(settings, 'S2');
  if (s2 && d >= s2.start && d <= s2.end) return s2;
  return getStartOfYearToNow(settings) || getSchoolYearRange(settings);
}

// Total owed for one student in one calendar month ('YYYY-MM'), across ALL
// transaction kinds (hotLunch, sackMilk, custom) — this is "Total Due".
function computeDueForMonth(transactions, studentId, monthStr) {
  const range = getMonthRange(monthStr);
  return toCents(
    txnsForStudent(transactions, studentId)
      .filter(t => inRange(t.date, range))
      .reduce((sum, t) => sum + t.amount, 0)
  );
}

// Returns { month, std, ytd }, each { hotLunch: {count, spent}, sackMilk: {count, spent} }.
function computeUsageMetrics(transactions, settings, studentId, asOfDateStr) {
  const today = asOfDateStr || todayStr();
  const monthStr = today.slice(0, 7);
  const monthRange = getMonthRange(monthStr);
  const stdRange = currentSemesterRange(settings, today);
  const ytdRange = getStartOfYearToNow(settings) || getSchoolYearRange(settings);
  const studentTxns = txnsForStudent(transactions, studentId);

  function summarize(range) {
    const matches = studentTxns.filter(t => inRange(t.date, range));
    function forKind(kind) {
      const km = matches.filter(t => t.kind === kind);
      return { count: km.length, spent: toCents(km.reduce((s, t) => s + t.amount, 0)) };
    }
    return { hotLunch: forKind('hotLunch'), sackMilk: forKind('sackMilk') };
  }

  return { month: summarize(monthRange), std: summarize(stdRange), ytd: summarize(ytdRange) };
}

// History rows, newest first, each tagged with its kind label for display.
function ledgerHistoryForStudent(transactions, studentId) {
  return sortTxnsByDate(txnsForStudent(transactions, studentId)).reverse();
}

// date -> 'hotLunch' | 'sackMilk', used to paint the calendar.
function txnKindByDate(transactions, studentId) {
  const map = {};
  txnsForStudent(transactions, studentId).forEach(t => { map[t.date] = t.kind; });
  return map;
}