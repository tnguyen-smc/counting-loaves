/* ========================================================================
   ADMIN.JS — Counting Loaves (admin dashboard)
   Loaded ONLY by the admin page (/admin). Requires shared.js to be loaded
   first. Contains: Firebase-auth login modal, every admin tab (analytics,
   verification, classroom/student/staff management, settings, export,
   data management, promote students), and this page's NavBar + root App.
   ======================================================================== */

function AdminLoginModal({ onSuccess }) {
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
    <div className="max-w-sm mx-auto px-4 py-16">
      <div className="bg-white rounded-2xl card-shadow-lg p-6 w-full">
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
          <PrimaryButton type="submit" disabled={busy} className="w-full mt-2">{busy ? 'Signing In…' : 'Log In'}</PrimaryButton>
        </form>
      </div>
    </div>
  );
}
function LunchVerificationTab({ data }) {
  const [dateVal, setDateVal] = useState(todayStr());
  const [expanded, setExpanded] = useState({});
  const [collapsed, setCollapsed] = useState({});

  function toggleExpand(id) { setExpanded(prev => ({ ...prev, [id]: !prev[id] })); }
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }

  // A classroom is "ready to verify" on different terms depending on its type: ordinary
  // classrooms need a submitted Final Lunch Count, while Staff & Adults classrooms have no final
  // stage at all — they're ready once every staff member has submitted their own Hot Lunch card.
  function readyToVerify(cls, log) {
    if (cls.type === 'staff') {
      const roster = data.students.filter(s => s.classroomId === cls.id);
      if (roster.length === 0) return false;
      const entries = (log && log.pre && log.pre.entries) || {};
      return tallyStaffEntries(entries, roster).submittedCount >= roster.length;
    }
    // Respect the admin's per-classroom stage configuration: a class with Lunch Final disabled is
    // ready once its Pre-Count is submitted, and a class with no lunch stages at all (e.g. a
    // breakfast-only Pre-K room) has nothing to hold verification up.
    if (stageEnabled(cls, 'final')) return !!(log && log.final && log.final.submitted);
    if (stageEnabled(cls, 'pre')) return !!(log && log.pre && log.pre.submitted);
    return true;
  }

  async function verifyClassroom(cls) {
    const log = data.logsById[logId(dateVal, cls.id)];
    if (!readyToVerify(cls, log)) {
      const what = cls.type === 'staff'
        ? 'Not every staff member in ' + classroomLabel(cls) + ' has submitted their own lunch count'
        : "Today's Final Lunch Count for " + classroomLabel(cls) + ' has not been submitted (or was not submitted properly)';
      const proceed = confirm(what + ' for ' + formatDisplayDate(dateVal) + '.\n\nVerify and finalize it anyway?');
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
      return readyToVerify(cls, log);
    });
    const notSubmitted = unverified.filter(cls => submitted.indexOf(cls) === -1);

    let toVerify;
    if (notSubmitted.length === 0) {
      if (!confirm('Verify and finalize ' + submitted.length + ' classroom(s) for ' + formatDisplayDate(dateVal) + '?')) return;
      toVerify = submitted;
    } else {
      const names = notSubmitted.map(classroomLabel).join(', ');
      const proceed = confirm(
        "The following classroom(s) are not fully submitted for " +
        formatDisplayDate(dateVal) + " (ordinary classrooms are missing Today's Final Lunch Count; Staff & Adults classrooms have staff who haven't submitted their own card yet):\n\n" + names +
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
            const finalEntriesRaw = (log && log.final && log.final.entries) || {};
            // A classroom's Final Lunch Count mirrors its Pre-Count until a teacher actually edits
            // it (see StudentClassroomWorkspace), so an empty final map means "same as pre", not
            // "nobody eating".
            const finalEntries = Object.keys(finalEntriesRaw).length ? finalEntriesRaw : preEntries;
            // Which counts this classroom is actually required to take. An admin can disable any
            // stage per classroom (e.g. a Pre-K class that only takes a breakfast count), and a
            // disabled stage must not be summarized here at all.
            const preEnabled = isStaffCls || stageEnabled(cls, 'pre');
            const finalEnabled = !isStaffCls && stageEnabled(cls, 'final');
            const breakfastEnabled = !isStaffCls && stageEnabled(cls, 'breakfast');
            // tallyLiveEntries (not tallyEntries) so students with no recorded entry stay
            // uncounted instead of being silently defaulted to Hot Lunch — that default-filling
            // was why a breakfast-only classroom reported a full roster of hot lunches here.
            const preT = isStaffCls ? tallyStaffEntries(preEntries, roster) : tallyLiveEntries(preEntries, roster);
            const finalT = isStaffCls ? tallyStaffEntries(finalEntries, roster) : tallyLiveEntries(finalEntries, roster);
            const preAdultsCount = (log && log.pre && log.pre.adultsCount) || 0;
            const finalAdultsCount = (log && log.final && typeof log.final.adultsCount === 'number') ? log.final.adultsCount : preAdultsCount;
            const preSubmitted = !!(log && log.pre && log.pre.submitted);
            const finalSubmitted = !!(log && log.final && log.final.submitted);
            const verified = !!(log && log.verified);
            // Staff & Adults classrooms have no Final Lunch Count stage: progress is measured by
            // how many staff have submitted their own individual Hot Lunch card.
            const staffAllIn = isStaffCls && roster.length > 0 && preT.submittedCount >= roster.length;
            // With Lunch Final disabled, the Pre-Count is the last required lunch step, so a
            // submitted Pre-Count already means this classroom is Completed.
            const lunchDone = finalEnabled ? finalSubmitted : (preEnabled ? preSubmitted : true);
            const lunchStarted = preSubmitted || finalSubmitted;
            const status = verified ? 'Verified' :
              isStaffCls ? (staffAllIn ? 'Completed' : (preT.submittedCount > 0 ? 'In Progress' : 'Not Started')) :
              (lunchDone ? 'Completed' : (lunchStarted ? 'In Progress' : 'Not Started'));
            const isCollapsed = isSectionCollapsed(collapsed, cls.id);

            const changedStudents = (!isStaffCls && finalSubmitted) ? roster.filter(s => entryChanged(preEntries[s.id], finalEntries[s.id])) : [];
            const summaryDiffs = [];
            if (!isStaffCls && finalSubmitted) {
              [['Hot Lunch','hot'],['Sack Lunch','sack'],['Absent','absent'],['Milk','milk']].forEach(([label,key]) => {
                if (preT[key] !== finalT[key]) {
                  const delta = finalT[key] - preT[key];
                  summaryDiffs.push(label + ': ' + preT[key] + ' \u2192 ' + finalT[key] + ' (' + (delta > 0 ? '+' : '') + delta + ')');
                }
              });
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
                      <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Verified Staff Lunch Count</p>
                      <p className="font-bold text-primary-900 text-sm leading-snug">Staff Count: {preT.submittedYes}</p>
                      {cls.showAdultCard && <p className="font-bold text-primary-900 text-sm leading-snug">Adult Count: {preAdultsCount}</p>}
                      <p className="font-bold text-purple-700 text-sm leading-snug mt-1">Verified</p>
                    </div>
                  ) : (
                    <div className="bg-primary-50 rounded-xl p-3 mb-4">
                      <p className="text-xs font-semibold text-primary-700 uppercase mb-1">
                        Staff Lunch Count {staffAllIn ? '' : '(' + (roster.length - preT.submittedCount) + ' still to submit)'}
                      </p>
                      <p className="text-sm text-primary-800">
                        Staff Count {preT.submittedYes}{cls.showAdultCard ? (' \u00b7 Adult Count ' + preAdultsCount) : ''} &middot; {preT.submittedCount} of {roster.length} submitted
                      </p>
                      {!staffAllIn && roster.length > 0 && (
                        <p className="text-xs font-light text-primary-500 mt-1">
                          Not yet submitted: {roster.filter(s => !(preEntries[s.id] && preEntries[s.id].submitted)).map(s => s.firstName + ' ' + s.lastName).join(', ')}
                        </p>
                      )}
                    </div>
                  )
                ) : verified ? (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
                    <p className="text-xs font-semibold text-purple-700 uppercase mb-2">Verified Final Count</p>
                    {(preEnabled || finalEnabled) ? (
                      <React.Fragment>
                        <p className="font-bold text-primary-900 text-sm leading-snug">Hot: {finalT.hot}</p>
                        <p className="font-bold text-primary-900 text-sm leading-snug">Sack: {finalT.sack}</p>
                        <p className="font-bold text-primary-900 text-sm leading-snug">Absent: {finalT.absent}</p>
                        <p className="font-bold text-primary-900 text-sm leading-snug">Milk: {finalT.milk}</p>
                      </React.Fragment>
                    ) : (
                      <p className="text-sm font-light text-primary-600">No lunch count required for this classroom.</p>
                    )}
                    <p className="font-bold text-purple-700 text-sm leading-snug mt-1">Verified</p>
                  </div>
                ) : (
                  <div className="grid sm:grid-cols-2 gap-4 mb-4">
                    {preEnabled && (
                      <div className="bg-primary-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-primary-700 uppercase mb-1">Today's Lunch Count {preSubmitted ? '' : '(not submitted)'}</p>
                        <p className="text-sm text-primary-800">Hot {preT.hot} &middot; Sack {preT.sack} &middot; Absent {preT.absent} &middot; Milk {preT.milk}</p>
                      </div>
                    )}
                    {finalEnabled && (
                      <div className="bg-primary-50 rounded-xl p-3">
                        <p className="text-xs font-semibold text-primary-700 uppercase mb-1">Today's Final Lunch Count {finalSubmitted ? '' : '(not submitted)'}</p>
                        <p className="text-sm text-primary-800">Hot {finalT.hot} &middot; Sack {finalT.sack} &middot; Absent {finalT.absent} &middot; Milk {finalT.milk}</p>
                      </div>
                    )}
                    {!preEnabled && !finalEnabled && (
                      <p className="text-sm font-light text-primary-500">
                        No lunch count is required for this classroom{breakfastEnabled ? ' \u2014 breakfast pre-count only' : ''}. Nothing to verify here.
                      </p>
                    )}
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
  const TABS = [['lunch', "Today's Lunch"], ['breakfast', "Today's Breakfast"], ['tomorrowBreakfast', "Tomorrow's Breakfast Summary"]];
  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Daily Verification &amp; Finalization</h3>
      <div className="flex bg-primary-50 rounded-xl p-1 gap-1 mb-6 w-full sm:w-auto sm:inline-flex flex-wrap">
        {TABS.map(([val, label]) => (
          <button
            key={val}
            onClick={() => setTab(val)}
            className={"btn-touch px-5 py-2 rounded-lg font-semibold text-sm transition-fast flex-1 sm:flex-initial " + (tab === val ? 'bg-white text-primary card-shadow' : 'text-primary-600 hover:bg-white/60')}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'lunch' && <LunchVerificationTab data={data} />}
      {tab === 'breakfast' && <BreakfastVerificationTab data={data} />}
      {tab === 'tomorrowBreakfast' && <TomorrowBreakfastSummaryTab data={data} />}
    </div>
  );
}

/* ============================ ADMIN: TOMORROW'S BREAKFAST SUMMARY (VIEW-ONLY) ============================ */
// Read-only companion to the two verification tabs. Breakfast pre-counts are taken the school day
// BEFORE the food is served, so this shows what each classroom has requested for the next school
// day. There is deliberately no verify action here: the morning-of pickups get verified the next
// day under Today's Breakfast, and pre-counts themselves are never verified.
function TomorrowBreakfastSummaryTab({ data }) {
  const today = todayStr();
  const targetDate = useMemo(() => nextSchoolDay(data.settings, today), [data.settings, today]);
  const [collapsed, setCollapsed] = useState({});
  function toggleCollapse(id) { toggleSection(setCollapsed, id); }

  const groups = useMemo(() => {
    return sortClassroomsByGrade(data.classrooms.filter(c => c.type !== 'staff' && stageEnabled(c, 'breakfast'))).map(cls => {
      const roster = sortStudents(data.students.filter(s => s.classroomId === cls.id), 'number');
      const log = data.logsById[logId(today, cls.id)];
      const entries = (log && log.breakfast && log.breakfast.entries) || {};
      const submitted = !!(log && log.breakfast && log.breakfast.submitted);
      const requested = roster.filter(s => { const e = entries[s.id]; return e && !e.absent && e.meal === 'hot'; });
      return { cls, roster, requested, submitted };
    });
  }, [data, today]);

  const totalRequested = groups.reduce((n, g) => n + g.requested.length, 0);
  const notSubmitted = groups.filter(g => !g.submitted && g.roster.length > 0);

  return (
    <div>
      <div className="mb-4 bg-primary-50 border border-primary-200 text-primary-700 rounded-xl p-4 text-sm font-medium">
        Summary viewing only &mdash; there is nothing to verify here. Tomorrow's breakfast pre-count is
        just what each classroom has requested for {formatDisplayDate(targetDate)}. Actual pickups get
        verified the morning they happen, under Today's Breakfast.
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <StatCard label="Total Breakfast Requested" value={totalRequested} />
        <StatCard label="Classrooms Submitted" value={groups.filter(g => g.submitted).length} />
        <StatCard label="Classrooms Pending" value={notSubmitted.length} />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm font-light text-primary-500">No classrooms take a breakfast pre-count.</p>
      ) : (
        <div className="grid gap-4">
          {groups.map(g => {
            const isCollapsed = isSectionCollapsed(collapsed, g.cls.id);
            return (
              <div key={g.cls.id} className="bg-white rounded-2xl card-shadow border border-primary-100 p-5">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div onClick={() => toggleCollapse(g.cls.id)} className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer">
                    <CollapseToggle collapsed={isCollapsed} onClick={() => toggleCollapse(g.cls.id)} />
                    <div className="min-w-0">
                      <h4 className="font-bold text-primary-900 truncate">{classroomLabel(g.cls)}</h4>
                      <p className="text-xs font-light text-primary-500">{g.requested.length} of {g.roster.length} requested breakfast</p>
                    </div>
                  </div>
                  <Badge status={g.submitted ? 'Completed' : 'Not Started'} />
                </div>
                {!isCollapsed && (
                  <div className="border-t border-primary-50 pt-3 mt-3">
                    {g.requested.length === 0 ? (
                      <p className="text-sm font-light text-primary-500">No students requested breakfast{g.submitted ? '' : ' yet'}.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {g.requested.map(s => (
                          <span key={s.id} className="text-sm font-medium text-primary-800 bg-primary-50 rounded-lg px-2.5 py-1">
                            #{s.number} {s.firstName} {s.lastName}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================ ADMIN: ANALYTICS ============================ */
// "Today" snapshot cards: a live PreCount card (fills in as teachers actually enter Today's Lunch
// Count, before anything is submitted or verified), a Verified Count card (only shows numbers for
// classroom-days an admin has actually verified), and the breakfast counterparts of each.
function TodaySnapshotCards({ data }) {
  const pre = useMemo(() => computeTodayPreCountSnapshot(data), [data]);
  const ver = useMemo(() => computeTodayVerifiedSnapshot(data), [data]);
  const staffAdult = useMemo(() => computeTodayStaffAdultSnapshot(data), [data]);
  const verStaffAdult = useMemo(() => computeTodayVerifiedStaffAdultSnapshot(data), [data]);
  const breakfastPre = useMemo(() => computeTomorrowBreakfastPreCountSnapshot(data), [data]);
  const breakfastVer = useMemo(() => computeTodayVerifiedBreakfastSnapshot(data), [data]);
  return (
    <div className="grid md:grid-cols-2 gap-4 mb-8">
      <div className="bg-white rounded-2xl card-shadow border-2 border-amber-200 p-5">
        <h4 className="font-bold text-primary-900 mb-1">Today's PreCount</h4>
        <p className="text-xs font-light text-primary-500 mb-4">Live &mdash; reflects only what teachers have actually entered so far into Today's Lunch Count, before Final Count / verification. Total Hot Lunch combines student, staff, and adult hot lunches.</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard label="Today's Total Hot Lunch" value={pre.hot + staffAdult.staffLunch + staffAdult.adultLunch} />
          <StatCard label="Today's Sack Lunch" value={pre.sack} />
          <StatCard label="Today's Absences" value={pre.absent} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Hot Lunch Milk" value={pre.milkHot} />
          <StatCard label="Sack Lunch Milk" value={pre.milkSack} />
        </div>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard label="Student Hot Lunch" value={pre.hot} />
          <StatCard label="Staff Lunch" value={staffAdult.staffLunch} />
          <StatCard label="Adult Lunch" value={staffAdult.adultLunch} />
        </div>
        {pre.notSubmitted.length > 0 && (
          <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Classes not submitted: {pre.notSubmitted.join(', ')}
          </p>
        )}
      </div>
      <div className="bg-white rounded-2xl card-shadow border-2 border-purple-200 p-5">
        <h4 className="font-bold text-primary-900 mb-1">Today's Verified Count</h4>
        <p className="text-xs font-light text-primary-500 mb-4">Only populates once a classroom's Final Lunch Count has been submitted AND an admin has verified it. Mirrors the same markers as Today's PreCount so the two reconcile exactly. Total Hot Lunch combines student, staff, and adult hot lunches.</p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <StatCard label="Today's Total Hot Lunch" value={ver.hot + verStaffAdult.staffLunch + verStaffAdult.adultLunch} />
          <StatCard label="Today's Sack Lunch" value={ver.sack} />
          <StatCard label="Today's Absences" value={ver.absent} />
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <StatCard label="Hot Lunch Milk" value={ver.milkHot} />
          <StatCard label="Sack Lunch Milk" value={ver.milkSack} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Student Hot Lunch" value={ver.hot} />
          <StatCard label="Staff Lunch" value={verStaffAdult.staffLunch} />
          <StatCard label="Adult Lunch" value={verStaffAdult.adultLunch} />
        </div>
      </div>
      <div className="bg-white rounded-2xl card-shadow border-2 border-amber-200 p-5">
        <h4 className="font-bold text-primary-900 mb-1">Tomorrow's Breakfast Pre-Count</h4>
        <p className="text-xs font-light text-primary-500 mb-4">Live &mdash; total students precounted for breakfast so far, for the next school day.</p>
        <StatCard label="Total Breakfast Pre-Count" value={breakfastPre.hot} />
        {breakfastPre.notSubmitted.length > 0 && (
          <p className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            Classes not submitted: {breakfastPre.notSubmitted.join(', ')}
          </p>
        )}
      </div>
      <div className="bg-white rounded-2xl card-shadow border-2 border-purple-200 p-5">
        <h4 className="font-bold text-primary-900 mb-1">Today's Verified Breakfast Count</h4>
        <p className="text-xs font-light text-primary-500 mb-4">Only populates once a classroom's morning-of Breakfast Verification has been submitted AND an admin has verified it.</p>
        <StatCard label="Total Picked Up Breakfast" value={breakfastVer.pickedUp} />
      </div>
    </div>
  );
}

function AnalyticsDashboard({ data }) {
  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Analytics &amp; Reporting</h3>

      <TodaySnapshotCards data={data} />

      <hr className="my-8 border-primary-100" />

      <StudentRecordEditor data={data} />
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
      <p className="text-sm font-light text-primary-600 mb-4">Classrooms are identified by grade and teacher. Choose Type: "Staff &amp; Adults" for a classroom where each staff member submits their own Hot Lunch Yes/No individually (Today's Lunch Count only &mdash; no breakfast, no separate Final Lunch Count).</p>
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
          {form.type !== 'staff' && (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
              <input type="checkbox" checked={form.enableFinal} onChange={e => setForm({ ...form, enableFinal: e.target.checked })} />
              Lunch Final Count
            </label>
          )}
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
                  {editForm.type !== 'staff' && (
                    <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                      <input type="checkbox" checked={editForm.enableFinal} onChange={e => setEditForm({ ...editForm, enableFinal: e.target.checked })} />
                      Lunch Final Count
                    </label>
                  )}
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
                    {c.type !== 'staff' && (
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                        <input type="checkbox" checked={c.enableFinal !== false} onChange={() => toggleStage(c, 'enableFinal')} />
                        Lunch Final Count
                      </label>
                    )}
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

  // Non-staff classrooms only — Staff & Adults classrooms track plain Yes/No attendance with no
  // Hot/Sack distinction, so a per-student Hot/Sack grid doesn't apply to them.
  const classroomOptions = useMemo(
    () => sortClassroomsByGrade(data.classrooms.filter(c => c.type !== 'staff')),
    [data.classrooms]
  );
  const [classroomYear, setClassroomYear] = useState(now.getFullYear());
  const [classroomMonth, setClassroomMonth] = useState(now.getMonth() + 1);
  const [classroomId, setClassroomId] = useState('');
  const [classroomExporting, setClassroomExporting] = useState(false);
  const [classroomExportError, setClassroomExportError] = useState('');
  const selectedClassroom = classroomId || (classroomOptions[0] && classroomOptions[0].id) || '';

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

  async function runClassroomExport() {
    if (!selectedClassroom) { alert('Choose a classroom first.'); return; }
    setClassroomExportError('');
    setClassroomExporting(true);
    try {
      await downloadClassroomLunchXLSX(data, classroomYear, classroomMonth, selectedClassroom);
    } catch (err) {
      setClassroomExportError(err.message || 'Something went wrong building the export.');
    } finally {
      setClassroomExporting(false);
    }
  }

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  async function runExport() {
    if (unverifiedDays.length > 0) {
      alert(
        'Export blocked: ' + unverifiedDays.length + ' classroom-day' + (unverifiedDays.length === 1 ? '' : 's') +
        ' in ' + monthNameOf(month) + ' ' + year + ' ' + (unverifiedDays.length === 1 ? 'has' : 'have') +
        " a submitted count that has not been verified by an admin yet. See the list below \u2014 verify " +
        (unverifiedDays.length === 1 ? 'it' : 'them') + ' in Admin \u2192 Daily Verification & Finalization (Lunch tab) first.'
      );
      return;
    }
    setExportError('');
    setExporting(true);
    try {
      await downloadMonthlyMealCountXLSX(data, year, month);
    } catch (err) {
      setExportError(err.message || 'Something went wrong building the export.');
    } finally {
      setExporting(false);
    }
  }
  function runBreakfastExport() {
    downloadMonthlyBreakfastCountXLSX(data, breakfastYear, breakfastMonth);
  }

  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">Monthly Lunch Meal Count Export</h3>
      <p className="text-sm font-light text-primary-600 mb-6">
        Pick a month and year to download the reimbursable meal count report using your official
        monthly form itself &mdash; Elementary / Middle / High School Paid, Reduced Price, Free, and
        Staff &amp; Adult Lunches, one row per day, with the same live formulas, merges, and
        formatting already built into the template. Only Hot Lunches count toward Paid / Reduced /
        Free &mdash; a Sack Lunch isn't a reimbursable hot meal, so it's left out of those columns.
        This always reflects the current saved data, so anything deleted or corrected in Admin
        &rarr; Data Management is already accounted for before you download. Only classroom-days an
        admin has actually verified are included &mdash; anything submitted but not yet verified is
        left blank, just like the paper form.
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
          <PrimaryButton disabled={unverifiedDays.length > 0 || exporting} onClick={runExport}>
            {exporting ? 'Preparing\u2026' : 'Download Monthly Report'}
          </PrimaryButton>
        </div>
        <p className="text-xs font-light text-primary-500">
          {daysWithData} of {daysInMonth(year, month)} day{daysInMonth(year, month) === 1 ? '' : 's'} in {monthNameOf(month)} {year} have a submitted AND verified count so far.
          Days without a submitted count are left blank in the export, just like the paper form.
        </p>
        {exportError && (
          <p className="text-xs font-semibold text-rose-700 mt-2">⚠ {exportError}</p>
        )}
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

      <hr className="my-8 border-primary-100" />

      <h3 className="text-xl font-bold text-primary-900 mb-4">Student Lunch Data by Classroom Export</h3>
      <p className="text-sm font-light text-primary-600 mb-6">
        Pick a classroom, month, and year to download a per-student grid &mdash; one row per
        student starting at your template's first row, one column per day of the month, marked
        Hot or Sack for that day. Just like the other exports, only classroom-days an admin has
        actually verified are included; a day with no verified Final Lunch Count, or a student
        marked absent that day, is left blank. The Total column is each student's Hot Lunch day
        count for the month.
      </p>

      {classroomOptions.length === 0 ? (
        <p className="text-sm font-light text-primary-500">No classrooms yet &mdash; add one in Admin &rarr; School Management &rarr; Classrooms.</p>
      ) : (
        <div className="bg-white rounded-2xl card-shadow border border-primary-100 p-5">
          <div className="flex flex-wrap gap-4 items-end mb-4">
            <div>
              <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Classroom</label>
              <select value={selectedClassroom} onChange={e => setClassroomId(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
                {classroomOptions.map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Month</label>
              <select value={classroomMonth} onChange={e => setClassroomMonth(Number(e.target.value))} className="border-2 border-primary-200 rounded-xl px-3 py-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{monthNameOf(m)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Year</label>
              <select value={classroomYear} onChange={e => setClassroomYear(Number(e.target.value))} className="border-2 border-primary-200 rounded-xl px-3 py-2">
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <PrimaryButton disabled={classroomExporting} onClick={runClassroomExport}>
              {classroomExporting ? 'Preparing\u2026' : 'Download Classroom Report'}
            </PrimaryButton>
          </div>
          {classroomExportError && (
            <p className="text-xs font-semibold text-rose-700 mt-2">⚠ {classroomExportError}</p>
          )}
        </div>
      )}
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
  // Both selectors start empty with a "Select..." placeholder rather than silently defaulting to
  // the first classroom/person — an admin editing a record should make both choices deliberately.
  const [classroomId, setClassroomId] = useState('');
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
    // Clear the person whenever the chosen classroom no longer contains them; never auto-pick.
    if (studentId && !roster.some(s => s.id === studentId)) setStudentId('');
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
            {/* Keep submitted:true — an admin correcting someone's answer must not silently revert
                them to "hasn't submitted yet", which would drop them from the day's counts. */}
            <button onClick={() => setDraftFor(stageKey, { attending: true, submitted: true })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (e.attending ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>Yes</button>
            <button onClick={() => setDraftFor(stageKey, { attending: false, submitted: true })} className={"px-3 py-1.5 rounded-lg text-xs font-semibold border-2 " + (!e.attending ? 'bg-primary text-white border-primary' : 'bg-white text-primary-700 border-primary-200')}>No</button>
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
      <h3 className="text-xl font-bold text-primary-900 mb-4">Edit or Remove One Person's Record</h3>
      <p className="text-sm font-light text-primary-600 mb-4">
        Fix a mistake for a single person on a single day without touching anyone else's counts.
        Make your changes below, then tap Confirm Changes to save them. Editing the final count
        automatically un-verifies that day, so it's clear the finalized number changed.
      </p>
      <div className="flex flex-wrap gap-4 items-end mb-4">
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Classroom</label>
          <select value={classroomId} onChange={e => setClassroomId(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            <option value="">Select classroom</option>
            {sortClassroomsByGrade(data.classrooms).map(c => <option key={c.id} value={c.id}>{classroomLabel(c)}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Person</label>
          <select value={studentId} onChange={e => setStudentId(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2">
            <option value="">Select person</option>
            {roster.map(s => <option key={s.id} value={s.id}>{s.position ? (s.position + ' \u2013 ') : (s.number ? ('#' + s.number + ' ') : '')}{s.firstName} {s.lastName}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-primary-500 uppercase block mb-1">Date</label>
          <input type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} className="border-2 border-primary-200 rounded-xl px-3 py-2" />
        </div>
      </div>

      {!classroomId ? (
        <p className="text-sm font-light text-primary-500">Select a classroom to begin.</p>
      ) : !studentId ? (
        <p className="text-sm font-light text-primary-500">{roster.length === 0 ? 'This classroom has nobody assigned yet.' : 'Select a person to view or edit their record.'}</p>
      ) : !log ? (
        <p className="text-sm font-light text-primary-500">No record exists for this classroom on {formatShortDate(dateVal)}.</p>
      ) : (
        <div className={"grid gap-4 " + (isStaffClassroom ? 'sm:grid-cols-1 max-w-sm' : 'sm:grid-cols-3')}>
          <EntryEditor label={isStaffClassroom ? 'Staff Lunch Count' : "Today's Lunch Count"} savedEntry={preEntry} stageKey="pre" kind="lunch" isStaff={isStaffClassroom} />
          {!isStaffClassroom && <EntryEditor label={"Breakfast Pre-Count (for " + breakfastTargetLabel + ")"} savedEntry={breakfastEntry} stageKey="breakfast" kind="breakfast" />}
          {!isStaffClassroom && <EntryEditor label="Today's Final Lunch Count" savedEntry={finalEntry} stageKey="final" kind="lunch" isStaff={false} />}
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
/* ============================ ADMIN: SCHOOL MANAGEMENT (combined tab) ============================ */
// Combines what used to be five separate top-level Admin tabs — Classrooms, Students,
// Staff & Adults, Grade Bands, and Term Settings — into a single "School Management" tab with its
// own row of sub-section buttons underneath. Each section is still its own existing component;
// only the navigation is combined, so nothing about how each section works has changed.
function SchoolManagementPanel({ data }) {
  const [section, setSection] = useState('classrooms');
  const sections = [
    ['classrooms', 'Classrooms'],
    ['students', 'Students'],
    ['staff', 'Staff & Adults'],
    ['gradebands', 'Grade Bands'],
    ['settings', 'Term Settings'],
    ['promote', 'Promote Students']
  ];
  return (
    <div>
      <h3 className="text-xl font-bold text-primary-900 mb-4">School Management</h3>
      <div className="flex gap-2 mb-6 flex-wrap">
        {sections.map(([val, label]) => (
          <button
            key={val}
            type="button"
            onClick={() => setSection(val)}
            className={"btn-touch px-4 py-2 rounded-lg font-semibold text-sm transition-fast border-2 " + (section === val ? 'bg-primary-700 text-white border-primary-700' : 'bg-white text-primary-700 border-primary-200 hover:bg-primary-50')}
          >{label}</button>
        ))}
      </div>
      {section === 'classrooms' && <ClassroomManagement data={data} />}
      {section === 'students' && <StudentManagement data={data} />}
      {section === 'staff' && <StaffManagement data={data} />}
      {section === 'gradebands' && <GradeBandsPanel data={data} />}
      {section === 'settings' && <TermSettingsPanel settings={data.settings} />}
      {section === 'promote' && <PromoteStudentsPanel data={data} />}
    </div>
  );
}

function AdminPanel({ data, authUser, onLogout }) {
  const [tab, setTab] = useState('analytics');
  const tabs = [
    ['analytics', 'Analytics'],
    ['verification', 'Verification'],
    ['schoolmgmt', 'School Management'],
    ['export', 'Export'],
    ['datamgmt', 'Data Management']
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
      {tab === 'schoolmgmt' && <SchoolManagementPanel data={data} />}
      {tab === 'export' && <ExportPanel data={data} />}
      {tab === 'datamgmt' && <DataManagementTab data={data} />}
    </div>
  );
}

/* ============================ NAV BAR (ADMIN PAGE) ============================ */
function NavBar({ authUser, onLogout }) {
  return (
    <div className="bg-primary text-white sticky top-0 z-40 card-shadow">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/Logo-school.png"
            alt="St. Mary Catholic School Logo"
            className="h-10 w-auto"
          />
          <div>
            <h1 className="text-lg sm:text-xl font-bold leading-tight tracking-wide">St. Mary Catholic School</h1>
            <p className="text-xs sm:text-sm font-light text-primary-100">Counting Loaves · Admin</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          
          <a
            href="/"
            className="btn-touch px-4 py-2 rounded-lg font-semibold text-sm transition-fast bg-transparent border-2 border-white text-white hover:bg-white hover:text-primary-700 flex items-center justify-center text-center"
          >
            &larr; Counting Page
          </a>
          {authUser && (
            <div className="text-right">
              <p className="text-xs text-primary-100 font-light">{authUser.email}</p>
              <button onClick={onLogout} className="text-xs font-semibold text-white hover:underline">Log Out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================ ROOT APP (ADMIN PAGE) ============================ */
function ConnectedApp() {
  const { items: classrooms, loading: classroomsLoading } = useCollection('classrooms');
  const { items: students, loading: studentsLoading } = useCollection('students');
  const { settings, loading: settingsLoading } = useSettingsDoc();
  const { logs, logsById, loading: logsLoading } = useLogs();

  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setAuthUser(u);
      setAuthChecked(true);
    });
    return () => unsub();
  }, []);

  function handleLogout() {
    auth.signOut();
  }

  const data = { classrooms, students, settings, logs, logsById };
  const stillLoading = classroomsLoading || studentsLoading || settingsLoading || logsLoading || !authChecked;

  return (
    <div className="min-h-screen">
      <NavBar authUser={authUser} onLogout={handleLogout} />

      {stillLoading ? (
        <div className="max-w-6xl mx-auto px-6 py-24 text-center text-primary-500 font-light">Loading live data&hellip;</div>
      ) : authUser ? (
        <AdminPanel data={data} authUser={authUser} onLogout={handleLogout} />
      ) : (
        <AdminLoginModal onSuccess={() => {}} />
      )}

      <footer className="text-center text-xs font-light text-primary-400 py-8">
        <p>Counting Loaves · Admin Dashboard</p>
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
              <h1 className="text-2xl font-bold leading-tight">🍞 Counting Loaves — Admin</h1>
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