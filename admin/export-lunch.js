/* ========================================================================
   EXPORT-LUNCH.JS — Counting Loaves (Student Lunch Account exports)
   Loaded on the admin page ONLY, AFTER ledger.js and BEFORE lunch-accounts.js. (Filename: export-lunch.js)
   Requires the SheetJS CDN script (window.XLSX) — see admin/index.html.

   Produces one worksheet matching student-account-summary-template.xlsx:
     Row 1: 'Student Account Summary' ... 'Classroom:' <scope> 'Month' <name> 'Year' <year>
     Row 2: 'Student First Name' | 'Student Last Name' | 1..31 | 'Total Due'
     Row 3+: one row per student

   Day-column codes (per-day attendance, pulled straight from the verified
   log — NOT from ledgerTransactions, so absences show up even though they
   are never billed): 'A' = absent, 'S' = sack lunch (no milk), 'SM' = sack
   lunch + milk, 'H' = hot lunch 
   ======================================================================== */

// One student's day-by-day row for a given 'YYYY-MM' month.
function buildLunchAccountRow(student, monthStr, data, transactions) {
  const [year, month] = monthStr.split('-').map(Number);
  const total = daysInMonth(year, month);
  const days = new Array(31).fill('');
  for (let day = 1; day <= total; day++) {
    const dateStr = year + '-' + pad2(month) + '-' + pad2(day);
    const log = data.logsById[logId(dateStr, student.classroomId)];
    const entry = (log && log.verified && log.final && log.final.entries) ? log.final.entries[student.id] : null;
    if (!entry) continue;
    if (entry.absent) days[day - 1] = 'A';
    else if (entry.meal === 'sack' && entry.milk === 'yes') days[day - 1] = 'SM';
    else if (entry.meal === 'sack') days[day - 1] = 'S';
    else if (entry.meal === 'hot') days[day - 1] = 'H'; // or 'HOT'
  }
  const due = computeDueForMonth(transactions, student.id, monthStr);
  return [student.firstName, student.lastName, ...days, due];
}

// scopeLabel is just the human-readable header text ('All Students',
// a classroom label, or a student's name) — it doesn't filter anything
// itself; pass the already-filtered `students` array.
function exportLunchAccountWorkbook(students, data, transactions, monthStr, scopeLabel) {
  if (typeof XLSX === 'undefined') {
    throw new Error('Export library not loaded — check that the SheetJS <script> tag is present in admin/index.html.');
  }
  const [year, month] = monthStr.split('-').map(Number);
  const header1 = ['Student Account Summary', '', '', '', 'Classroom:', scopeLabel, '', '', 'Month', monthNameOf(month), 'Year', year];
  const header2 = ['Student First Name', 'Student Last Name', ...Array.from({ length: 31 }, (_, i) => i + 1), 'Total Due'];
  const sorted = sortStudents(students, 'last');
  const rows = sorted.map(s => buildLunchAccountRow(s, monthStr, data, transactions));

  const ws = XLSX.utils.aoa_to_sheet([header1, header2, ...rows]);
  ws['!cols'] = [{ wch: 14 }, { wch: 14 }, ...Array(31).fill({ wch: 4 }), { wch: 12 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

  const safeScope = scopeLabel.replace(/[^a-z0-9]+/gi, '_');
  XLSX.writeFile(wb, 'lunch-account_' + safeScope + '_' + monthStr + '.xlsx');
}

// Convenience wrappers for the three Settings export scopes.
function exportAllStudents(data, transactions, monthStr) {
  const students = data.students.filter(s => {
    const cls = data.classrooms.find(c => c.id === s.classroomId);
    return !cls || cls.type !== 'staff';
  });
  exportLunchAccountWorkbook(students, data, transactions, monthStr, 'All Students');
}
function exportByClassroom(data, transactions, monthStr, classroomId) {
  const cls = data.classrooms.find(c => c.id === classroomId);
  const students = data.students.filter(s => s.classroomId === classroomId);
  exportLunchAccountWorkbook(students, data, transactions, monthStr, classroomLabel(cls));
}
function exportIndividualStudent(data, transactions, monthStr, student) {
  exportLunchAccountWorkbook([student], data, transactions, monthStr, studentName(student));
}
