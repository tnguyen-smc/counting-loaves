/* ========================================================================
   LUNCH-ACCOUNTS.JS — Counting Loaves (Student Lunch Account ledger UI) — v2
   Loaded on the admin page ONLY, AFTER shared.js, ledger.js, and export.js,
   and BEFORE admin.js (AdminPanel renders <LunchAccountsModule /> as a tab).
   ======================================================================== */

const LUNCH_STATUS_BADGE = {
  paid: { label: 'Full Pay', className: 'bg-emerald-100 text-emerald-800 border border-emerald-300' },
  reduced: { label: 'Reduced', className: 'bg-amber-100 text-amber-800 border border-amber-300' },
  free: { label: 'Free', className: 'bg-sky-100 text-sky-800 border border-sky-300' }
};
function LunchStatusBadge({ status }) {
  const s = LUNCH_STATUS_BADGE[status] || LUNCH_STATUS_BADGE.paid;
  return <span className={'px-3 py-1 rounded-full text-xs font-semibold ' + s.className}>{s.label}</span>;
}

function Modal({ title, onClose, children, maxWidth }) {
  return (
    <div className="fixed inset-0 bg-primary-900/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={'bg-white rounded-2xl card-shadow-lg p-6 w-full ' + (maxWidth || 'max-w-sm')}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <h3 className="text-lg font-bold text-primary-900">{title}</h3>
          <button onClick={onClose} className="text-primary-400 hover:text-primary-700 font-bold text-xl leading-none">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// Prev / next month control shared by the student browser and the detail view.
function MonthCycler({ monthStr, onChange }) {
  const [year, month] = monthStr.split('-').map(Number);
  function shift(delta) {
    const d = new Date(year, month - 1 + delta, 1);
    onChange(d.getFullYear() + '-' + pad2(d.getMonth() + 1));
  }
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => shift(-1)} className="btn-touch w-8 h-8 rounded-full border-2 border-primary-200 text-primary-700 hover:bg-primary-50">&larr;</button>
      <span className="font-semibold text-primary-900 text-sm w-28 text-center">{monthNameOf(month)} {year}</span>
      <button onClick={() => shift(1)} className="btn-touch w-8 h-8 rounded-full border-2 border-primary-200 text-primary-700 hover:bg-primary-50">&rarr;</button>
    </div>
  );
}

/* ============================ ROOT MODULE (left-sidebar mini-app) ============================ */

function LunchAccountsModule({ data, authUser }) {
  const [view, setView] = useState('summary');
  const { transactions, loading } = useLedger();

  const NAV = [
    ['summary', 'Summary', '📊'],
    ['students', 'Student Lunch Accounts', '🍽️'],
    ['settings', 'Settings', '⚙️']
  ];

  if (loading) {
    return <div className="py-16 text-center text-primary-500 font-light">Loading lunch account data&hellip;</div>;
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      <div className="md:w-56 shrink-0">
        <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible">
          {NAV.map(([val, label, icon]) => (
            <button
              key={val}
              onClick={() => setView(val)}
              className={
                'btn-touch text-left whitespace-nowrap px-4 py-3 rounded-xl font-semibold text-sm transition-fast border-2 flex items-center gap-2 ' +
                (view === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')
              }
            >
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-w-0">
        {view === 'summary' && <LunchSummaryView data={data} />}
        {view === 'students' && <StudentAccountsView data={data} transactions={transactions} authUser={authUser} />}
        {view === 'settings' && <LunchSettingsView data={data} transactions={transactions} />}
      </div>
    </div>
  );
}

/* ============================ TAB 1: SUMMARY ============================ */

function LunchSummaryView({ data }) {
  const metrics = useMemo(() => {
    const nonStaffStudents = data.students.filter(s => {
      const cls = data.classrooms.find(c => c.id === s.classroomId);
      return !cls || cls.type !== 'staff';
    });
    const staff = data.students.filter(s => {
      const cls = data.classrooms.find(c => c.id === s.classroomId);
      return cls && cls.type === 'staff';
    });
    const byStatus = status => nonStaffStudents.filter(s => (s.lunchStatus || 'paid') === status).length;
    return {
      totalStudents: nonStaffStudents.length,
      totalStaff: staff.length,
      full: byStatus('paid'),
      reduced: byStatus('reduced'),
      free: byStatus('free')
    };
  }, [data.students, data.classrooms]);

  return (
    <div>
      <h2 className="text-xl font-bold text-primary-900 mb-4">Summary</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Total Students" value={metrics.totalStudents} />
        <StatCard label="Total Staff" value={metrics.totalStaff} />
        <StatCard label="Full Pay Students" value={metrics.full} />
        <StatCard label="Reduced Pay Students" value={metrics.reduced} />
        <StatCard label="Free Students" value={metrics.free} />
      </div>
    </div>
  );
}

/* ============================ TAB 2: STUDENT LUNCH ACCOUNTS ============================ */

const SORT_OPTIONS = [['number', 'Student #'], ['first', 'First Name'], ['last', 'Last Name']];

function StudentAccountsView({ data, transactions, authUser }) {
  const [classroomFilter, setClassroomFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('last');
  const [selectedId, setSelectedId] = useState(null);
  const [monthStr, setMonthStr] = useState(todayStr().slice(0, 7));
  const [collapsedMap, setCollapsedMap] = useState({});

  const nonStaffClassrooms = useMemo(
    () => sortClassroomsByGrade(data.classrooms.filter(c => c.type !== 'staff')),
    [data.classrooms]
  );

  const searching = search.trim().length > 0;
  const q = search.trim().toLowerCase();

  // Classroom -> filtered/sorted student list, skipping empty groups.
  const groups = useMemo(() => {
    return nonStaffClassrooms
      .filter(c => !classroomFilter || c.id === classroomFilter)
      .map(c => {
        let list = data.students.filter(s => s.classroomId === c.id);
        if (searching) list = list.filter(s => studentName(s).toLowerCase().includes(q));
        list = sortStudents(list, sortBy);
        return { classroom: c, students: list };
      })
      .filter(g => g.students.length > 0 || (!searching && !classroomFilter));
  }, [nonStaffClassrooms, data.students, classroomFilter, searching, q, sortBy]);

  const selectedStudent = data.students.find(s => s.id === selectedId) || null;

  function toggle(classroomId) {
    setCollapsedMap(prev => ({ ...prev, [classroomId]: !isCollapsed(classroomId) }));
  }
  // Default: expanded while searching or filtered to one classroom, collapsed otherwise.
  function isCollapsed(classroomId) {
    if (classroomId in collapsedMap) return collapsedMap[classroomId];
    return !(searching || classroomFilter);
  }

  if (selectedStudent) {
    return (
      <StudentAccountDetail
        student={selectedStudent}
        classroom={data.classrooms.find(c => c.id === selectedStudent.classroomId)}
        data={data}
        transactions={transactions}
        authUser={authUser}
        monthStr={monthStr}
        onMonthChange={setMonthStr}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      <div className="bg-white rounded-2xl card-shadow p-4 border border-primary-100 mb-5 flex flex-wrap items-center gap-3">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by student name&hellip;"
          className="flex-1 min-w-[12rem] border-2 border-primary-200 rounded-xl px-3 py-2 text-sm"
        />
        <select value={classroomFilter} onChange={e => setClassroomFilter(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2 text-sm">
          <option value="">All Classrooms</option>
          {nonStaffClassrooms.map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2 text-sm">
          {SORT_OPTIONS.map(([val, label]) => <option key={val} value={val}>Sort: {label}</option>)}
        </select>
        <MonthCycler monthStr={monthStr} onChange={setMonthStr} />
      </div>

      <div className="space-y-4">
        {groups.map(({ classroom, students }) => (
          <div key={classroom.id} className="bg-white rounded-2xl card-shadow border border-primary-100 overflow-hidden">
            <button
              onClick={() => toggle(classroom.id)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-primary-50 transition-fast"
            >
              <div className="text-left">
                <p className="font-bold text-primary-900">{classroomLabel(classroom)}</p>
                <p className="text-xs font-light text-primary-500">{students.length} student{students.length === 1 ? '' : 's'}</p>
              </div>
              <CollapseToggle collapsed={isCollapsed(classroom.id)} onClick={() => toggle(classroom.id)} />
            </button>
            {!isCollapsed(classroom.id) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 pt-0">
                {students.map(s => {
                  const due = computeDueForMonth(transactions, s.id, monthStr);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className="text-left bg-primary-50 hover:bg-primary-100 rounded-xl p-4 transition-fast border border-primary-100"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-primary-900 text-sm">{studentName(s)}</p>
                        <LunchStatusBadge status={s.lunchStatus || 'paid'} />
                      </div>
                      <p className="text-xs font-light text-primary-500 mt-1">Student # {studentNumberOf(s)}</p>
                      <p className={'text-sm font-bold mt-2 ' + (due > 0 ? 'text-rose-600' : 'text-primary-700')}>
                        Due ({monthNameOf(Number(monthStr.split('-')[1]))}): {formatCurrency(due)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        {groups.every(g => g.students.length === 0) && (
          <p className="text-sm font-light text-primary-500 text-center py-10">No students match.</p>
        )}
      </div>
    </div>
  );
}

/* ---------------------- Selected student: header, calendar, actions ---------------------- */

function StudentAccountDetail({ student, classroom, data, transactions, authUser, monthStr, onMonthChange, onBack }) {
  const [modal, setModal] = useState(null); // null | { mode: 'add' } | { mode: 'edit', txn }

  const due = computeDueForMonth(transactions, student.id, monthStr);
  const usage = useMemo(
    () => computeUsageMetrics(transactions, data.settings, student.id, monthStr + '-01'),
    [transactions, data.settings, student.id, monthStr]
  );
  const history = useMemo(() => ledgerHistoryForStudent(transactions, student.id), [transactions, student.id]);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm font-semibold text-primary hover:underline">&larr; Back to all students</button>

      <div className="bg-white rounded-2xl card-shadow p-5 border border-primary-100">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-primary-900">{studentName(student)}</h2>
            <p className="text-sm font-light text-primary-500">{classroomLabel(classroom)}</p>
            <div className="mt-2"><LunchStatusBadge status={student.lunchStatus || 'paid'} /></div>
          </div>
          <div className="text-right">
            <div className="mb-2"><MonthCycler monthStr={monthStr} onChange={onMonthChange} /></div>
            <p className="text-xs font-medium text-primary-500 uppercase">Total Due ({monthNameOf(Number(monthStr.split('-')[1]))})</p>
            <p className={'text-3xl font-bold ' + (due > 0 ? 'text-rose-600' : 'text-primary')}>{formatCurrency(due)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-4">
          <PrimaryButton onClick={() => setModal({ mode: 'add' })}>+ Add Transaction</PrimaryButton>
          <GhostButton onClick={() => exportIndividualStudent(data, transactions, monthStr, student)}>Export &darr;</GhostButton>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Hot Lunches (Month)" value={usage.month.hotLunch.count} />
        <StatCard label="Hot Lunches (Semester)" value={usage.std.hotLunch.count} />
        <StatCard label="Hot Lunches (Year)" value={usage.ytd.hotLunch.count} />
        <StatCard label="Sack + Milk (Month)" value={usage.month.sackMilk.count} />
        <StatCard label="Sack + Milk (Semester)" value={usage.std.sackMilk.count} />
        <StatCard label="Sack + Milk (Year)" value={usage.ytd.sackMilk.count} />
      </div>

      <LunchCalendar student={student} transactions={transactions} monthStr={monthStr} onMonthChange={onMonthChange} />

      <LedgerHistory history={history} onEdit={txn => setModal({ mode: 'edit', txn })} />

      {modal && (
        <TransactionModal
          student={student}
          settings={data.settings}
          authUser={authUser}
          existing={modal.mode === 'edit' ? modal.txn : null}
          defaultDate={monthStr === todayStr().slice(0, 7) ? todayStr() : monthStr + '-01'}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

/* ---------------------- Monthly calendar: hot=orange, sack+milk=lavender+🐄 ---------------------- */

function LunchCalendar({ student, transactions, monthStr, onMonthChange }) {
  const kindByDate = useMemo(() => txnKindByDate(transactions, student.id), [transactions, student.id]);
  const [year, month] = monthStr.split('-').map(Number);
  const totalDays = daysInMonth(year, month);
  const firstDow = new Date(year, month - 1, 1).getDay();

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= totalDays; day++) cells.push(day);

  return (
    <div className="bg-white rounded-2xl card-shadow p-5 border border-primary-100">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-primary-900">{monthNameOf(month)} {year}</h3>
        <MonthCycler monthStr={monthStr} onChange={onMonthChange} />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-primary-500 mb-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />;
          const dateStr = year + '-' + pad2(month) + '-' + pad2(day);
          const kind = kindByDate[dateStr];
          const isToday = dateStr === todayStr();
          let cls = 'bg-primary-50 text-primary-700';
          if (kind === 'hotLunch') cls = 'bg-orange-400 text-white';
          if (kind === 'sackMilk') cls = 'bg-purple-200 text-purple-900';
          return (
            <div
              key={i}
              title={kind === 'hotLunch' ? 'Verified hot lunch' : kind === 'sackMilk' ? 'Sack lunch + milk' : ''}
              className={'aspect-square rounded-lg flex items-center justify-center text-sm font-semibold relative ' + cls + (isToday ? ' ring-2 ring-primary-700' : '')}
            >
              {day}
              {kind === 'sackMilk' && <span className="absolute bottom-0 right-0 text-[10px] leading-none">🐄</span>}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-xs font-light text-primary-500">
        <span>🟧 Hot lunch</span>
        <span>🟪🐄 Sack lunch + milk</span>
      </div>
    </div>
  );
}

/* ---------------------- Ledger history table ---------------------- */

function LedgerHistory({ history, onEdit }) {
  return (
    <div className="bg-white rounded-2xl card-shadow p-5 border border-primary-100">
      <h3 className="font-bold text-primary-900 mb-3">Transaction History</h3>
      {history.length === 0 ? (
        <p className="text-sm font-light text-primary-500 py-6 text-center">No transactions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-primary-500 uppercase border-b border-primary-100">
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 pr-3">Note</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-primary-50">
              {history.map(t => (
                <tr key={t.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatShortDate(t.date)}</td>
                  <td className="py-2 pr-3">{kindLabel(t.kind)}{t.source === 'auto' ? <span className="text-primary-400 text-xs"> (auto)</span> : ''}</td>
                  <td className="py-2 pr-3 text-primary-500 font-light">{t.note || '—'}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-rose-600">{formatCurrency(t.amount)}</td>
                  <td className="py-2 pr-3 text-right">
                    <button onClick={() => onEdit(t)} className="text-xs font-semibold text-primary hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ---------------------- Add / Edit Transaction modal ---------------------- */

function TransactionModal({ student, settings, authUser, existing, defaultDate, onClose }) {
  const isEdit = !!existing;
  const [kind, setKind] = useState(existing ? existing.kind : 'hotLunch');
  const [amount, setAmount] = useState(existing ? String(existing.amount) : String(rateForEntry(settings, student.lunchStatus, 'hot', 'no')));
  const [date, setDate] = useState(existing ? existing.date : defaultDate);
  const [note, setNote] = useState(existing ? (existing.note || '') : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function pickKind(nextKind) {
    setKind(nextKind);
    if (nextKind === 'hotLunch') setAmount(String(rateForEntry(settings, student.lunchStatus, 'hot', 'no')));
    else if (nextKind === 'sackMilk') setAmount(String(rateForEntry(settings, student.lunchStatus, 'sack', 'yes')));
    // 'custom' leaves whatever the admin has typed
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await saveManualTxn({
        id: existing ? existing.id : undefined,
        student, kind, amount: parseFloat(amount), date, note,
        createdBy: authUser && authUser.email,
        createdAt: existing ? existing.createdAt : undefined,
        isEdit
      });
      setSaved(true);
    } catch (err) {
      setError(err.message || 'Could not save transaction.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteLedgerTxn(existing.id);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not delete transaction.');
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <SuccessModal
        title={isEdit ? 'Transaction Updated' : 'Transaction Added'}
        message={studentName(student) + ' — ' + kindLabel(kind) + ' on ' + formatShortDate(date) + ' for ' + formatCurrency(parseFloat(amount) || 0) + '.'}
        onDone={onClose}
      />
    );
  }

  return (
    <Modal title={(isEdit ? 'Edit' : 'Add') + ' Transaction — ' + studentName(student)} onClose={onClose}>
      <form onSubmit={save}>
        <label className="block text-xs font-semibold text-primary-500 uppercase mb-1">Type</label>
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[['hotLunch', 'Hot Lunch'], ['sackMilk', 'Sack + Milk'], ['custom', 'Custom']].map(([val, label]) => (
            <button
              type="button" key={val}
              onClick={() => pickKind(val)}
              className={
                'py-2 rounded-xl text-xs font-semibold border-2 transition-fast ' +
                (kind === val ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')
              }
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-semibold text-primary-500 uppercase mb-1">Value ($)</label>
        <input
          type="number" step="0.01" min="0" required autoFocus
          value={amount} onChange={e => setAmount(e.target.value)}
          className="w-full border-2 border-primary-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:border-primary"
        />

        <label className="block text-xs font-semibold text-primary-500 uppercase mb-1">Date</label>
        <input
          type="date" required
          value={date} onChange={e => setDate(e.target.value)}
          className="w-full border-2 border-primary-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:border-primary"
        />

        <label className="block text-xs font-semibold text-primary-500 uppercase mb-1">
          Note{kind === 'custom' ? ' (required)' : ' (optional)'}
        </label>
        <textarea
          rows={2}
          value={note} onChange={e => setNote(e.target.value)}
          placeholder="e.g. Correction, family request, etc."
          className="w-full border-2 border-primary-200 rounded-xl px-4 py-3 mb-3 focus:outline-none focus:border-primary"
        />

        {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}

        <div className="flex gap-3">
          <PrimaryButton type="submit" disabled={busy} className="flex-1">{busy ? 'Saving…' : 'Save Changes'}</PrimaryButton>
          <GhostButton onClick={onClose} className="flex-1">Cancel</GhostButton>
        </div>
        {isEdit && existing.source === 'manual' && (
          <button type="button" onClick={remove} disabled={busy} className="mt-3 text-xs font-semibold text-rose-600 hover:underline">
            Delete this transaction
          </button>
        )}
        {isEdit && existing.source === 'auto' && (
          <p className="mt-3 text-xs font-light text-primary-400">
            This was created automatically from a verified lunch count. Editing it here overrides that day's amount;
            it will be corrected again automatically if the count is re-verified.
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ============================ TAB 3: SETTINGS ============================ */

function LunchSettingsView({ data, transactions }) {
  const rates = (data.settings && data.settings.rates) || {};
  const [form, setForm] = useState({
    hotLunchFull: rates.hotLunchFull != null ? String(rates.hotLunchFull) : '',
    reducedLunchRate: rates.reducedLunchRate != null ? String(rates.reducedLunchRate) : '',
    extraMilkSack: rates.extraMilkSack != null ? String(rates.extraMilkSack) : ''
  });
  const [saved, setSaved] = useState(false);

  function setField(key, val) { setForm(prev => ({ ...prev, [key]: val })); setSaved(false); }

  async function save(e) {
    e.preventDefault();
    await saveSettings({
      rates: {
        hotLunchFull: parseFloat(form.hotLunchFull) || 0,
        reducedLunchRate: parseFloat(form.reducedLunchRate) || 0,
        extraMilkSack: parseFloat(form.extraMilkSack) || 0
      }
    });
    setSaved(true);
  }

  const FIELDS = [
    ['hotLunchFull', 'Hot Lunch — Full Pay Rate ($)'],
    ['reducedLunchRate', 'Reduced Lunch Rate ($)'],
    ['extraMilkSack', 'Extra Milk — Sack Lunch Rate ($)']
  ];

  return (
    <div className="space-y-6 max-w-lg">
      <div className="bg-white rounded-2xl card-shadow p-6 border border-primary-100">
        <h2 className="text-xl font-bold text-primary-900 mb-1">Lunch Account Rates</h2>
        <p className="text-sm font-light text-primary-500 mb-5">
          Free-status students are always charged $0 and are never read from these rates.
        </p>
        <form onSubmit={save}>
          {FIELDS.map(([key, label]) => (
            <div key={key} className="mb-4">
              <label className="block text-xs font-semibold text-primary-500 uppercase mb-1">{label}</label>
              <input
                type="number" step="0.01" min="0"
                value={form[key]} onChange={e => setField(key, e.target.value)}
                className="w-full border-2 border-primary-200 rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
              />
            </div>
          ))}
          <PrimaryButton type="submit">Save Rates</PrimaryButton>
          {saved && <span className="ml-3 text-sm font-semibold text-emerald-700">Saved.</span>}
        </form>
      </div>

      <LunchBackfillPanel data={data} />

      <LunchExportPanel data={data} transactions={transactions} />
    </div>
  );
}

/* ---------------------- Settings: Backfill past verified days ---------------------- */

function LunchBackfillPanel({ data }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  async function run() {
    if (!confirm('This will scan every already-verified lunch day and create/update the matching charges. Safe to run more than once. Continue?')) return;
    setBusy(true);
    setResult(null);
    try {
      const count = await backfillAutoDebits(data);
      setResult('Done — processed ' + count + ' verified day(s).');
    } catch (err) {
      setResult('Error: ' + (err.message || 'backfill failed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl card-shadow p-6 border border-primary-100">
      <h2 className="text-xl font-bold text-primary-900 mb-1">Backfill Past Verified Days</h2>
      <p className="text-sm font-light text-primary-500 mb-4">
        Run this once after adding the Lunch Account feature (or any time you suspect a day's charges are missing) —
        it re-checks every day that was already verified and creates any transactions that should exist for it.
        Already-synced days are left unchanged, so it's safe to run more than once.
      </p>
      <PrimaryButton onClick={run} disabled={busy}>{busy ? 'Processing…' : 'Run Backfill'}</PrimaryButton>
      {result && <p className="text-sm font-semibold text-primary-700 mt-3">{result}</p>}
    </div>
  );
}

/* ---------------------- Settings: Export panel ---------------------- */

function LunchExportPanel({ data, transactions }) {
  const [scope, setScope] = useState('all'); // 'all' | 'classroom' | 'student'
  const [classroomId, setClassroomId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [monthStr, setMonthStr] = useState(todayStr().slice(0, 7));
  const [error, setError] = useState('');

  const nonStaffClassrooms = useMemo(() => sortClassroomsByGrade(data.classrooms.filter(c => c.type !== 'staff')), [data.classrooms]);
  const nonStaffStudents = useMemo(() => sortStudents(data.students.filter(s => {
    const cls = data.classrooms.find(c => c.id === s.classroomId);
    return !cls || cls.type !== 'staff';
  }), 'last'), [data.students, data.classrooms]);

  function runExport() {
    setError('');
    try {
      if (scope === 'all') exportAllStudents(data, transactions, monthStr);
      else if (scope === 'classroom') {
        if (!classroomId) return setError('Pick a classroom first.');
        exportByClassroom(data, transactions, monthStr, classroomId);
      } else {
        const student = data.students.find(s => s.id === studentId);
        if (!student) return setError('Pick a student first.');
        exportIndividualStudent(data, transactions, monthStr, student);
      }
    } catch (err) {
      setError(err.message || 'Export failed.');
    }
  }

  return (
    <div className="bg-white rounded-2xl card-shadow p-6 border border-primary-100">
      <h2 className="text-xl font-bold text-primary-900 mb-1">Export</h2>
      <p className="text-sm font-light text-primary-500 mb-5">Exports use the Student Account Summary template layout for the selected month.</p>

      <label className="block text-xs font-semibold text-primary-500 uppercase mb-1">Scope</label>
      <select value={scope} onChange={e => setError('') || setScope(e.target.value)} className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mb-3 text-sm">
        <option value="all">All Students</option>
        <option value="classroom">By Classroom</option>
        <option value="student">Individual Student</option>
      </select>

      {scope === 'classroom' && (
        <select value={classroomId} onChange={e => setClassroomId(e.target.value)} className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mb-3 text-sm">
          <option value="">Choose a classroom&hellip;</option>
          {nonStaffClassrooms.map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
        </select>
      )}
      {scope === 'student' && (
        <select value={studentId} onChange={e => setStudentId(e.target.value)} className="w-full border-2 border-primary-200 rounded-xl px-3 py-2 mb-3 text-sm">
          <option value="">Choose a student&hellip;</option>
          {nonStaffStudents.map(s => <option key={s.id} value={s.id}>{studentName(s)}</option>)}
        </select>
      )}

      <label className="block text-xs font-semibold text-primary-500 uppercase mb-1">Month</label>
      <div className="mb-4"><MonthCycler monthStr={monthStr} onChange={setMonthStr} /></div>

      {error && <p className="text-sm text-rose-600 mb-3">{error}</p>}
      <PrimaryButton onClick={runExport}>Export &darr;</PrimaryButton>
    </div>
  );
}