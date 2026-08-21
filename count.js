/* ========================================================================
   COUNT.JS — Counting Loaves (teacher-facing counting page)
   Loaded ONLY by the root page (/). Requires shared.js to be loaded first.
   Contains: the teacher overview, classroom workspaces (pre-count, review,
   staff/adults, breakfast final), and this page's NavBar + root App.
   ======================================================================== */

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
  const pickedUp = e.meal === 'hot';
  function toggle() { if (!disabled) onChange({ meal: pickedUp ? 'sack' : 'hot' }); }
  const cardColor = pickedUp ? 'bg-green-50 border-green-400' : 'bg-amber-50 border-amber-400';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={toggle}
      className={"btn-touch w-full text-left rounded-xl border-2 p-2.5 flex items-center gap-2 transition-fast " + cardColor}
    >
      <span className={"shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold " +
        (pickedUp ? 'bg-green-600 text-white' : 'bg-amber-500 text-white')}>
        {pickedUp ? '✓' : '✕'}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-primary-900 text-xs truncate">
          <span className="text-primary-400 font-medium">#{student.number}</span> {student.firstName} {student.lastName}
        </span>
        <span className={"block text-[11px] font-bold uppercase tracking-wide " + (pickedUp ? 'text-green-700' : 'text-amber-700')}>
          {pickedUp ? 'Picked Up' : 'No Show'}
        </span>
      </span>
    </button>
  );
}

// Aggregated 2-column review across every classroom, mirroring the look of the Lunch Count's
// ReviewScreen (colored bordered columns, stat totals, sticky submit bar) before the final
// "Submit Breakfast Verification" writes breakfastFinal for every classroom shown at once.
function BreakfastFinalReview({ groups, onEdit, onSubmit, dateLabel }) {
  const pickedUp = [], noShow = [];
  groups.forEach(g => {
    g.roster.forEach(s => {
      const e = (g.bf.entries && g.bf.entries[s.id]) || defaultBreakfastFinalEntry();
      const item = { student: s, cls: g.cls };
      if (e.meal === 'hot') pickedUp.push(item);
      else noShow.push(item);
    });
  });
  const columns = [
    { key: 'picked', label: 'Picked Up', items: pickedUp, color: 'border-green-300 bg-green-50' },
    { key: 'noshow', label: 'No Show', items: noShow, color: 'border-amber-300 bg-amber-50' }
  ];
  return (
    <div>
      <button onClick={onEdit} className="text-primary font-semibold text-sm mb-4 hover:underline">&larr; Edit / Go Back</button>
      <h2 className="text-2xl font-bold text-primary-900 mb-1">Review Breakfast Verification</h2>
      <p className="text-primary-600 font-light mb-6">For today &middot; {dateLabel}</p>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard label="Picked Up" value={pickedUp.length} />
        <StatCard label="No Show" value={noShow.length} />
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        {columns.map(col => (
          <div key={col.key} className={"rounded-2xl border-2 p-3 " + col.color}>
            <div className="flex justify-between items-center mb-3 px-1">
              <h3 className="font-bold text-primary-900 text-sm uppercase tracking-wide">{col.label}</h3>
              <span className="text-sm font-bold text-primary-900 bg-white rounded-full px-2.5 py-0.5 border border-primary-100">{col.items.length}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 min-h-[60px]">
              {col.items.length === 0 && <p className="text-xs font-light text-primary-400 text-center py-4 col-span-2">No students</p>}
              {col.items.map(({ student, cls }) => (
                <div key={cls.id + '_' + student.id} className="bg-white rounded-xl card-shadow border border-primary-100 p-2.5">
                  <p className="font-medium text-primary-900 truncate text-xs"><span className="text-primary-400">#{student.number}</span> {student.firstName} {student.lastName}</p>
                  <p className="text-[11px] font-light text-primary-500 truncate">{cls.grade}</p>
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

  // This screen is opened from a tile near the BOTTOM of the Home page, and the browser preserves
  // that scroll offset when the view swaps — landing the user mid-list. Force the top.
  useEffect(() => { window.scrollTo(0, 0); }, []);

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

  // "Everyone picked up" is by far the most common outcome for a classroom, so offer it as a
  // single tap instead of making staff confirm each student individually.
  async function markGroupAllPickedUp(classroomId) {
    const group = groups.find(g => g.cls.id === classroomId);
    if (!group || group.verified) return;
    const log = group.todayLog;
    const newEntries = { ...group.bf.entries };
    group.roster.forEach(s => { newEntries[s.id] = { absent: false, meal: 'hot' }; });
    await saveLogFull(today, classroomId, {
      pre: log ? log.pre : undefined,
      breakfast: log ? log.breakfast : undefined,
      final: log ? log.final : undefined,
      verified: log ? log.verified : false,
      verifiedAt: log ? log.verifiedAt : null,
      breakfastFinal: { ...group.bf, entries: newEntries, sourceDate: group.bf.sourceDate || (group.sourceLog && group.sourceLog.date) },
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
            <p className="text-sm font-light text-primary-600 mb-5 max-w-2xl">
              Everyone starts marked <span className="font-semibold text-green-700">Picked Up</span>. Tap a student to
              switch it to <span className="font-semibold text-amber-700">No Show</span>.
            </p>
            {groups.map(g => {
              const gPicked = g.roster.filter(s => { const e = (g.bf.entries && g.bf.entries[s.id]) || defaultBreakfastFinalEntry(); return !e.absent && e.meal === 'hot'; }).length;
              return (
              <div key={g.cls.id} className="mb-8">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3 pb-2 border-b-2 border-primary-100">
                  <h3 className="text-lg font-bold text-primary-900">
                    {g.cls.grade} &middot; {g.cls.teacher}{' '}
                    <span className="text-sm font-light text-primary-500">({gPicked} of {g.roster.length} picked up)</span>
                    {g.verified && <span className="ml-2"><Badge status="Verified" /></span>}
                  </h3>
                  {!g.verified && gPicked < g.roster.length && (
                    <button
                      type="button"
                      onClick={() => markGroupAllPickedUp(g.cls.id)}
                      className="btn-touch px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-bold hover:bg-green-700 transition-fast"
                    >
                      All Picked Up
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
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
              );
            })}
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

/* ============================ TEACHER: CLASSROOM WORKSPACE (DISPATCH) ============================ */
// Staff & Adults classrooms use a completely different, per-person submission flow (see
// StaffAdultsWorkspace below) instead of the ordered pre/breakfast/final steps students use, so
// this just decides which real implementation to mount. No hooks live here — each real
// implementation is its own component so hooks rules stay clean on either branch.
function ClassroomWorkspace({ data, classroomId, onBack }) {
  const cls = data.classrooms.find(c => c.id === classroomId);
  if (cls && cls.type === 'staff') {
    return <StaffAdultsWorkspace data={data} cls={cls} onBack={onBack} />;
  }
  return <StudentClassroomWorkspace data={data} classroomId={classroomId} onBack={onBack} />;
}

/* ============================ TEACHER: STAFF & ADULTS WORKSPACE ============================ */
// Each staff member taps their own name/card, gets a small "Hot Lunch" Yes/No popup, and submits
// individually — there's no ordered multi-stage flow and no separate Final Lunch Count for staff.
// A submitted card turns yellow and shows "Submitted"; tapping it again lets them change and
// re-submit their answer up until an admin verifies the classroom for the day.
function StaffAdultsWorkspace({ data, cls, onBack }) {
  const roster = data.students.filter(s => s.classroomId === cls.id);
  const today = todayStr();
  const todayLog = data.logsById[logId(today, cls.id)];
  const verified = !!(todayLog && todayLog.verified);
  const noSchool = isNoSchoolDay(data.settings, today);
  const holiday = holidayFor(data.settings, today);
  const showAdultCard = !!cls.showAdultCard;
  const locked = verified || noSchool;

  const [openStudentId, setOpenStudentId] = useState(null);
  const [pendingChoice, setPendingChoice] = useState(null);
  const [successId, setSuccessId] = useState(null);
  const [sortBy, setSortBy] = useState('order');

  function emptyBase() {
    return {
      pre: { entries: {}, submitted: false, submittedAt: null, adultsCount: 0 },
      breakfast: { entries: {}, submitted: false, submittedAt: null, targetDate: nextSchoolDay(data.settings, today) },
      final: { entries: {}, submitted: false, submittedAt: null },
      verified: false,
      verifiedAt: null
    };
  }

  useEffect(() => {
    if (!todayLog) saveLogFull(today, cls.id, emptyBase());
    // eslint-disable-next-line
  }, []);

  const entries = (todayLog && todayLog.pre && todayLog.pre.entries) || {};
  const adultsCount = (todayLog && todayLog.pre && todayLog.pre.adultsCount) || 0;
  const sortedRoster = sortStudents(roster, sortBy);
  const submittedCount = roster.filter(s => entries[s.id] && entries[s.id].submitted).length;
  const attendingCount = roster.filter(s => entries[s.id] && entries[s.id].submitted && entries[s.id].attending).length;

  function openPopup(studentId) {
    if (locked) return;
    const existing = entries[studentId];
    setPendingChoice(existing && existing.submitted ? !!existing.attending : null);
    setOpenStudentId(studentId);
  }

  async function submitEntry() {
    if (pendingChoice === null || !openStudentId) return;
    const base = todayLog || emptyBase();
    const newEntries = { ...(base.pre ? base.pre.entries : {}), [openStudentId]: { attending: pendingChoice, submitted: true } };
    await saveLogFull(today, cls.id, { ...base, pre: { ...(base.pre || emptyBase().pre), entries: newEntries } });
    setSuccessId(openStudentId);
    setOpenStudentId(null);
    setPendingChoice(null);
  }

  async function updateAdultsCount(count) {
    if (locked) return;
    const base = todayLog || emptyBase();
    await saveLogFull(today, cls.id, { ...base, pre: { ...(base.pre || emptyBase().pre), adultsCount: count } });
  }

  const openStudent = openStudentId ? roster.find(s => s.id === openStudentId) : null;
  const successStudent = successId ? roster.find(s => s.id === successId) : null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
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
          <p className="text-primary-600 font-light">No staff assigned to this classroom yet. Ask your admin to add staff under Admin View &rarr; Staff &amp; Adults.</p>
        </div>
      ) : (
        <React.Fragment>
          {showAdultCard && (
            <div className="mb-6">
              <AdultsCounterCard count={adultsCount} onChange={updateAdultsCount} disabled={locked} />
            </div>
          )}

          <p className="text-sm font-medium text-primary-600 mb-4">
            {submittedCount} of {roster.length} submitted their own Hot Lunch count &middot; {attendingCount} eating lunch today
          </p>

          <p className="text-sm font-light text-primary-500 mb-4">Tap your name below to submit today's Hot Lunch Yes/No.</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedRoster.map(s => {
              const e = entries[s.id];
              const submitted = !!(e && e.submitted);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => openPopup(s.id)}
                  disabled={locked}
                  className={"text-left rounded-2xl card-shadow p-4 border-2 transition-fast btn-touch " +
                    (locked ? 'opacity-60 cursor-not-allowed border-primary-100 bg-white' :
                      submitted ? 'bg-yellow-100 border-yellow-400 hover:border-yellow-500' : 'bg-white border-primary-100 hover:border-primary-300')}
                >
                  <p className="font-semibold text-primary-900 truncate">
                    {s.position ? <span className="text-primary-400 font-medium">{s.position} &middot; </span> : null}{s.firstName} {s.lastName}
                  </p>
                  {submitted ? (
                    <p className="text-xs font-bold text-yellow-800 mt-1">Submitted &middot; {e.attending ? 'Hot Lunch: Yes' : 'Hot Lunch: No'}</p>
                  ) : (
                    <p className="text-xs font-light text-primary-500 mt-1">Tap to submit</p>
                  )}
                </button>
              );
            })}
          </div>
        </React.Fragment>
      )}

      {openStudent && (
        <div className="fixed inset-0 bg-primary-900/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl card-shadow-lg p-6 w-full max-w-sm">
            <h2 className="text-xl font-bold text-primary-900 mb-1">Hot Lunch</h2>
            <p className="text-sm font-light text-primary-600 mb-5">{openStudent.firstName} {openStudent.lastName}</p>
            <div className="flex gap-3 mb-5">
              {[[true,'Yes'],[false,'No']].map(([val,label]) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setPendingChoice(val)}
                  className={"flex-1 btn-touch py-3 rounded-xl font-semibold text-base border-2 transition-fast " + (pendingChoice === val ? 'bg-primary text-white border-primary' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <GhostButton onClick={() => { setOpenStudentId(null); setPendingChoice(null); }}>Cancel</GhostButton>
              <PrimaryButton disabled={pendingChoice === null} onClick={submitEntry}>Submit</PrimaryButton>
            </div>
          </div>
        </div>
      )}

      {successStudent && (
        <SuccessModal
          title="Lunch Count Submitted!"
          message={successStudent.firstName + "'s Hot Lunch count has been saved for today."}
          topLeftLabel="Return to Staff & Adults"
          onTopLeft={() => setSuccessId(null)}
          onDone={() => { setSuccessId(null); onBack(); }}
        />
      )}
    </div>
  );
}

/* ============================ TEACHER: CLASSROOM WORKSPACE ============================ */
// Enforces the required step order for every day: Today's Lunch Count -> Breakfast Pre-Count (for
// the next school day) -> Today's Final Lunch Count. The final count automatically carries over
// the pre-count's entries until the teacher changes something, exactly like before; breakfast is
// its own independent count each day, targeting whichever day is next on the school calendar.
// Staff & Adults classrooms never reach this component — see StaffAdultsWorkspace above.
function StudentClassroomWorkspace({ data, classroomId, onBack }) {
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
        // NOTE: pre/breakfast entries start as a truly empty {}, same reasoning as final.entries
        // below — if this pre-filled every student with a generic Hot Lunch default the instant a
        // teacher merely opened the classroom (before touching or submitting anything), that
        // default data would get written straight to Firestore and inflate the Admin Analytics
        // "Today's PreCount" live snapshot with counts nobody actually entered.
        pre: { entries: {}, submitted: false, submittedAt: null, adultsCount: 0 },
        breakfast: { entries: {}, submitted: false, submittedAt: null, targetDate: breakfastTargetDate },
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

  // Raw persisted entries (possibly partial/empty — only what teachers have actually entered so
  // far) merged with roster-wide defaults purely for on-screen display/submission purposes. The
  // merge happens here, in the UI layer, so what's actually stored in Firestore before a teacher
  // submits stays a true reflection of live input (see the useEffect above and emptyBase below).
  const preEntriesRaw = (todayLog && todayLog.pre && todayLog.pre.entries) || {};
  const preEntries = { ...(isStaff ? emptyStaffEntries(roster) : emptyEntries(roster)), ...preEntriesRaw };
  const breakfastEntriesRaw = (todayLog && todayLog.breakfast && todayLog.breakfast.entries) || {};
  const breakfastEntries = { ...emptyBreakfastEntries(roster), ...breakfastEntriesRaw };
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
      pre: { entries: {}, submitted: false, submittedAt: null, adultsCount: 0 },
      breakfast: { entries: {}, submitted: false, submittedAt: null, targetDate: breakfastTargetDate },
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


/* ============================ NAV BAR (COUNTING PAGE) ============================ */
function NavBar() {
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
        
        <a
          href="/admin"
          className="btn-touch px-4 py-2 rounded-lg font-semibold text-sm transition-fast bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary-700 flex items-center justify-center text-center"
        >
          Admin Login &rarr;
        </a>
      </div>
    </div>
  );
}

/* ============================ ROOT APP (COUNTING PAGE) ============================ */
function ConnectedApp() {
  const { items: classrooms, loading: classroomsLoading } = useCollection('classrooms');
  const { items: students, loading: studentsLoading } = useCollection('students');
  const { settings, loading: settingsLoading } = useSettingsDoc();
  const { logs, logsById, loading: logsLoading } = useLogs();

  const [view, setView] = useState({ screen: 'overview', classroomId: null });

  const data = { classrooms, students, settings, logs, logsById };
  const stillLoading = classroomsLoading || studentsLoading || settingsLoading || logsLoading;

  return (
    <div className="min-h-screen">
      <NavBar />

      {stillLoading ? (
        <div className="max-w-6xl mx-auto px-6 py-24 text-center text-primary-500 font-light">Loading live data&hellip;</div>
      ) : (
        <React.Fragment>
          {view.screen === 'overview' && (
            <TeacherOverview
              data={data}
              onOpenClassroom={(id) => setView({ screen: 'workspace', classroomId: id })}
              onOpenBreakfastFinal={() => setView({ screen: 'breakfastFinal', classroomId: null })}
            />
          )}
          {view.screen === 'workspace' && (
            <ClassroomWorkspace
              key={view.classroomId}
              data={data}
              classroomId={view.classroomId}
              onBack={() => setView({ screen: 'overview', classroomId: null })}
            />
          )}
          {view.screen === 'breakfastFinal' && (
            <BreakfastFinalView
              data={data}
              onBack={() => setView({ screen: 'overview', classroomId: null })}
            />
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
