/* WashSync — interactive prototype
 * Everything here is simulated. Data lives in LocalStorage under one key.
 * Tables mirrored from the planned AppSheet app:
 *   Machines, Students, Reservations, Queue, LaundrySessions
 */
(function () {
  'use strict';

  /* =========================================================
   * 1. Constants
   * ======================================================= */
  const STORE_KEY = 'washsync_prototype_v1';
  const CURRENT_STUDENT_ID = 'S001'; // simulated signed-in student
  const DEFAULT_MINUTES = { Washer: 45, Dryer: 60 };

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'home' },
    { id: 'machines', label: 'Machines', icon: 'washer' },
    { id: 'reserve', label: 'Reserve', icon: 'calendar' },
    { id: 'queue', label: 'Queue', icon: 'queue' },
    { id: 'laundry', label: 'My Laundry', icon: 'basket' },
    { id: 'insights', label: 'Insights', icon: 'chart' },
    { id: 'profile', label: 'Profile', icon: 'user' }
  ];

  // Sample dataset behind BOTH the chart and the recommendation (Screen F).
  const USAGE_SAMPLE = [
    { key: 'early', name: 'Early morning', adj: 'early-morning', range: '6–9 AM', sessions: 18 },
    { key: 'late-morning', name: 'Late morning', adj: 'late-morning', range: '9 AM–12 PM', sessions: 12 },
    { key: 'afternoon', name: 'Afternoon', adj: 'afternoon', range: '12–3 PM', sessions: 22 },
    { key: 'late-afternoon', name: 'Late afternoon', adj: 'late-afternoon', range: '3–6 PM', sessions: 30 },
    { key: 'evening', name: 'Evening', adj: 'evening', range: '6–9 PM', sessions: 46 },
    { key: 'night', name: 'Night', adj: 'night', range: '9 PM–12 AM', sessions: 34 }
  ];

  const ICONS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    washer: '<rect x="4" y="2" width="16" height="20" rx="2.5"/><circle cx="12" cy="14" r="4.2"/><path d="M8 6h.01M11 6h.01"/>',
    dryer: '<rect x="4" y="2" width="16" height="20" rx="2.5"/><circle cx="12" cy="14" r="4.2"/><path d="M10 14c.8-1.2 1.6 1.2 2.4 0s1.2-.6 1.6 0"/><path d="M8 6h.01M11 6h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2.5"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    queue: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    basket: '<path d="M4 9h16l-1.6 10.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 9z"/><path d="M8.5 9l3.5-6 3.5 6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M8 17v-5M13 17V8M18 17v-8"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 18h.01"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4 2.6-2.6z"/>',
    pin: '<path d="M12 22s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
    spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  /* =========================================================
   * 2. Small helpers
   * ======================================================= */
  let state = null;
  let lastRoute = null;
  const ui = { filter: 'all', reserveMachine: null, laundryMachine: null, endEdited: false, pendingConfirm: null };

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const addMin = (d, m) => new Date(new Date(d).getTime() + m * 60000);
  const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

  // "Now" in the prototype can be shifted with the demo clock.
  function now() { return new Date(Date.now() + (state ? state.clockOffsetMs : 0)); }

  function icon(name, size) {
    const s = size || 20;
    return '<svg class="ico" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  function toLocalInput(d) { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function toDateInput(d) { return toLocalInput(d).slice(0, 10); }
  function toTimeInput(d) { return toLocalInput(d).slice(11, 16); }

  function fmtTime(d) { return new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function sameDay(a, b) { a = new Date(a); b = new Date(b); return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function dayLabel(d) {
    d = new Date(d);
    const n = now();
    if (sameDay(d, n)) return 'Today';
    if (sameDay(d, addMin(n, 1440))) return 'Tomorrow';
    if (sameDay(d, addMin(n, -1440))) return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function fmtDateTime(d) { return dayLabel(d) + ', ' + fmtTime(d); }
  function fmtRange(s, e) { return dayLabel(s) + ', ' + fmtTime(s) + ' – ' + fmtTime(e); }
  function fmtDur(min) {
    min = Math.abs(Math.round(min));
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m ? ' ' + pad(m) + ' min' : '');
  }
  function remainingText(endIso) {
    const diff = Math.round((new Date(endIso) - now()) / 60000);
    if (diff > 0) return fmtDur(diff) + ' left';
    if (diff === 0) return 'Due now';
    return 'Overdue by ' + fmtDur(-diff);
  }
  function progressPct(startIso, endIso) {
    const total = new Date(endIso) - new Date(startIso);
    if (total <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((now() - new Date(startIso)) / total) * 100)));
  }

  function newId(prefix, list, key) {
    let max = 0;
    list.forEach(function (x) {
      const n = parseInt(String(x[key]).replace(/\D/g, ''), 10);
      if (n > max) max = n;
    });
    return prefix + String(max + 1).padStart(3, '0');
  }

  const ok = (message, data) => ({ ok: true, message: message, data: data });
  const fail = (message) => ({ ok: false, message: message });

  /* =========================================================
   * 3. Data: seed, load, save
   * ======================================================= */
  function buildSeed() {
    const base = new Date();
    const at = (min) => addMin(base, min).toISOString();
    const tomorrowAt = (h, m) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, h, m).toISOString();

    const machines = [
      { MachineID: 'M001', MachineName: 'Washer 01', Type: 'Washer', Status: 'Occupied', Location: 'Laundry Room A (Ground Floor)' },
      { MachineID: 'M002', MachineName: 'Washer 02', Type: 'Washer', Status: 'Occupied', Location: 'Laundry Room A (Ground Floor)' },
      { MachineID: 'M003', MachineName: 'Washer 03', Type: 'Washer', Status: 'Available', Location: 'Laundry Room A (Ground Floor)' },
      { MachineID: 'M004', MachineName: 'Washer 04', Type: 'Washer', Status: 'Occupied', Location: 'Laundry Room B (Level 3)' },
      { MachineID: 'M005', MachineName: 'Washer 05', Type: 'Washer', Status: 'Under Maintenance', Location: 'Laundry Room B (Level 3)' },
      { MachineID: 'M006', MachineName: 'Washer 06', Type: 'Washer', Status: 'Available', Location: 'Laundry Room B (Level 3)' },
      { MachineID: 'M007', MachineName: 'Dryer 01', Type: 'Dryer', Status: 'Available', Location: 'Laundry Room A (Ground Floor)' },
      { MachineID: 'M008', MachineName: 'Dryer 02', Type: 'Dryer', Status: 'Occupied', Location: 'Laundry Room B (Level 3)' }
    ];

    const students = [
      { StudentID: 'S001', StudentName: 'Aisyah Rahman', UnitNumber: 'Block A, Unit A-12-03' },
      { StudentID: 'S002', StudentName: 'Daniel Lim', UnitNumber: 'Block A, Unit A-08-11' },
      { StudentID: 'S003', StudentName: 'Nurul Huda', UnitNumber: 'Block B, Unit B-05-02' },
      { StudentID: 'S004', StudentName: 'Farid Hakim', UnitNumber: 'Block B, Unit B-14-07' },
      { StudentID: 'S005', StudentName: 'Mei Ling Tan', UnitNumber: 'Block C, Unit C-03-09' }
    ];

    const reservations = [
      { ReservationID: 'R001', StudentID: 'S001', MachineID: 'M003', StartTime: at(150), EndTime: at(210), Status: 'Confirmed' },
      { ReservationID: 'R002', StudentID: 'S002', MachineID: 'M006', StartTime: tomorrowAt(10, 0), EndTime: tomorrowAt(11, 0), Status: 'Confirmed' },
      { ReservationID: 'R003', StudentID: 'S004', MachineID: 'M007', StartTime: at(120), EndTime: at(180), Status: 'Confirmed' },
      { ReservationID: 'R004', StudentID: 'S005', MachineID: 'M006', StartTime: at(300), EndTime: at(360), Status: 'Cancelled' }
    ];

    const queue = [
      { QueueID: 'Q001', StudentID: 'S003', MachineID: 'M001', QueueTime: at(-20), QueuePosition: 1, Status: 'Waiting' },
      { QueueID: 'Q002', StudentID: 'S005', MachineID: 'M001', QueueTime: at(-10), QueuePosition: 2, Status: 'Waiting' },
      { QueueID: 'Q003', StudentID: 'S004', MachineID: 'M002', QueueTime: at(-25), QueuePosition: 1, Status: 'Waiting' },
      { QueueID: 'Q004', StudentID: 'S002', MachineID: 'M004', QueueTime: at(-90), QueuePosition: null, Status: 'Cancelled' }
    ];

    const sessions = [
      { SessionID: 'L001', StudentID: 'S001', MachineID: 'M001', StartTime: at(-35), ExpectedEndTime: at(25), CollectionTime: null, Status: 'Active' },
      { SessionID: 'L002', StudentID: 'S002', MachineID: 'M002', StartTime: at(-75), ExpectedEndTime: at(-15), CollectionTime: null, Status: 'Overdue' },
      { SessionID: 'L003', StudentID: 'S003', MachineID: 'M004', StartTime: at(-20), ExpectedEndTime: at(30), CollectionTime: null, Status: 'Active' },
      { SessionID: 'L004', StudentID: 'S004', MachineID: 'M008', StartTime: at(-30), ExpectedEndTime: at(25), CollectionTime: null, Status: 'Active' },
      { SessionID: 'L005', StudentID: 'S001', MachineID: 'M003', StartTime: at(-1500), ExpectedEndTime: at(-1455), CollectionTime: at(-1450), Status: 'Completed' },
      { SessionID: 'L006', StudentID: 'S005', MachineID: 'M006', StartTime: at(-300), ExpectedEndTime: at(-255), CollectionTime: at(-250), Status: 'Completed' },
      { SessionID: 'L007', StudentID: 'S001', MachineID: 'M007', StartTime: at(-1440), ExpectedEndTime: at(-1380), CollectionTime: at(-1372), Status: 'Completed' },
      { SessionID: 'L008', StudentID: 'S002', MachineID: 'M004', StartTime: at(-600), ExpectedEndTime: at(-555), CollectionTime: at(-540), Status: 'Completed' }
    ];

    return {
      version: 1,
      clockOffsetMs: 0,
      machines: machines,
      students: students,
      reservations: reservations,
      queue: queue,
      sessions: sessions,
      prefs: { remindBeforeEnd: true, remindMinutes: '10', queueAlert: true, reservationReminder: false }
    };
  }

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.machines) && Array.isArray(s.sessions) && Array.isArray(s.queue) && Array.isArray(s.reservations) && Array.isArray(s.students)) {
          if (typeof s.clockOffsetMs !== 'number') s.clockOffsetMs = 0;
          if (!s.prefs) s.prefs = buildSeed().prefs;
          return s;
        }
      }
    } catch (e) { /* ignore and reseed */ }
    return null;
  }

  function saveState() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
    catch (e) { /* storage unavailable: the prototype still works for this page view */ }
  }

  /* =========================================================
   * 4. Domain logic
   * ======================================================= */
  const getMachine = (id) => state.machines.find((m) => m.MachineID === id);
  const getStudent = (id) => state.students.find((s) => s.StudentID === id);
  const me = () => getStudent(CURRENT_STUDENT_ID);
  const byTime = (key) => (a, b) => new Date(a[key]) - new Date(b[key]);

  function liveSessionsOn(machineId) {
    return state.sessions.filter((s) => s.MachineID === machineId && s.Status !== 'Completed');
  }
  function mySessions() { return state.sessions.filter((s) => s.StudentID === CURRENT_STUDENT_ID); }
  function myLiveSessions() { return mySessions().filter((s) => s.Status !== 'Completed').sort(byTime('ExpectedEndTime')); }
  function myReservations() { return state.reservations.filter((r) => r.StudentID === CURRENT_STUDENT_ID); }
  function myUpcomingReservations() {
    return myReservations().filter((r) => r.Status === 'Confirmed' && new Date(r.EndTime) > now()).sort(byTime('StartTime'));
  }
  function waitingQueue(machineId) {
    return state.queue.filter((q) => q.MachineID === machineId && q.Status === 'Waiting').sort(byTime('QueueTime'));
  }
  function myWaiting() { return state.queue.filter((q) => q.StudentID === CURRENT_STUDENT_ID && q.Status === 'Waiting').sort(byTime('QueueTime')); }
  function myQueueEntry(machineId) { return myWaiting().find((q) => q.MachineID === machineId); }

  function machineBusyUntil(machineId) {
    const live = liveSessionsOn(machineId);
    if (!live.length) return null;
    return live.map((s) => s.ExpectedEndTime).sort().slice(-1)[0];
  }

  function sessionStatus(s) {
    if (s.Status === 'Completed') return 'Completed';
    return new Date(s.ExpectedEndTime) < now() ? 'Overdue' : 'Active';
  }

  // Updates stored Active/Overdue flags. Returns the sessions that just became overdue.
  function refreshStatuses() {
    const newlyOverdue = [];
    let changed = false;
    state.sessions.forEach(function (s) {
      const next = sessionStatus(s);
      if (next !== s.Status) {
        if (next === 'Overdue') newlyOverdue.push(s);
        s.Status = next;
        changed = true;
      }
    });
    if (changed) saveState();
    return newlyOverdue;
  }

  function syncMachine(machineId) {
    const m = getMachine(machineId);
    if (!m || m.Status === 'Under Maintenance') return;
    m.Status = liveSessionsOn(machineId).length ? 'Occupied' : 'Available';
  }

  function reconcileMachines() {
    state.machines.forEach((m) => syncMachine(m.MachineID));
  }

  function renumberQueue(machineId) {
    waitingQueue(machineId).forEach((q, i) => { q.QueuePosition = i + 1; });
    state.queue.filter((q) => q.MachineID === machineId && q.Status !== 'Waiting').forEach((q) => { q.QueuePosition = null; });
  }

  const overlaps = (aS, aE, bS, bE) => aS < bE && aE > bS;

  function createReservation(machineId, dateStr, startStr, endStr) {
    const m = getMachine(machineId);
    if (!m) return fail('Please select a machine.');
    if (!dateStr || !startStr || !endStr) return fail('Please fill in the date, start time and end time.');
    if (m.Status === 'Under Maintenance') return fail(m.MachineName + ' is under maintenance and cannot be reserved. Please choose another machine.');

    const s = new Date(dateStr + 'T' + startStr);
    const e = new Date(dateStr + 'T' + endStr);
    if (isNaN(s) || isNaN(e)) return fail('Please enter a valid date and time.');
    if (e <= s) return fail('End time must be later than the start time.');
    if (minutesBetween(s, e) > 180) return fail('A reservation can be at most 3 hours long.');
    if (s < addMin(now(), -5)) return fail('That start time has already passed. Choose a time from now onwards.');

    if (m.Status === 'Occupied') {
      const until = machineBusyUntil(machineId);
      const free = until && new Date(until) > now() ? new Date(until) : now();
      if (s < free) {
        return fail(m.MachineName + ' is currently recorded as occupied' + (until && new Date(until) > now() ? ' until about ' + fmtTime(until) : '') + '. Choose a start time after that, join its queue, or pick another machine.');
      }
    }

    const clash = state.reservations.find((r) => r.MachineID === machineId && r.Status === 'Confirmed' && overlaps(s, e, new Date(r.StartTime), new Date(r.EndTime)));
    if (clash) return fail(m.MachineName + ' is already reserved ' + fmtRange(clash.StartTime, clash.EndTime) + '. Choose a different time or machine.');

    const rec = {
      ReservationID: newId('R', state.reservations, 'ReservationID'),
      StudentID: CURRENT_STUDENT_ID,
      MachineID: machineId,
      StartTime: s.toISOString(),
      EndTime: e.toISOString(),
      Status: 'Confirmed'
    };
    state.reservations.push(rec);
    saveState();
    return ok('Reservation confirmed: ' + m.MachineName + ', ' + fmtRange(rec.StartTime, rec.EndTime) + '.', rec);
  }

  function cancelReservation(id) {
    const r = state.reservations.find((x) => x.ReservationID === id);
    if (!r || r.StudentID !== CURRENT_STUDENT_ID) return fail('Reservation not found.');
    if (r.Status !== 'Confirmed') return fail('This reservation is already ' + r.Status.toLowerCase() + '.');
    r.Status = 'Cancelled';
    saveState();
    return ok('Reservation cancelled.');
  }

  function joinQueue(machineId) {
    const m = getMachine(machineId);
    if (!m) return fail('Machine not found.');
    if (m.Status === 'Under Maintenance') return fail(m.MachineName + ' is under maintenance, so there is no queue to join.');
    if (m.Status === 'Available') return fail(m.MachineName + ' is recorded as available. You can reserve it instead of queueing.');
    if (liveSessionsOn(machineId).some((s) => s.StudentID === CURRENT_STUDENT_ID)) return fail('You already have a session on ' + m.MachineName + '.');
    if (myQueueEntry(machineId)) return fail('You are already in the queue for ' + m.MachineName + '.');

    const pos = waitingQueue(machineId).length + 1;
    const rec = {
      QueueID: newId('Q', state.queue, 'QueueID'),
      StudentID: CURRENT_STUDENT_ID,
      MachineID: machineId,
      QueueTime: now().toISOString(),
      QueuePosition: pos,
      Status: 'Waiting'
    };
    state.queue.push(rec);
    renumberQueue(machineId);
    saveState();
    return ok('You joined the queue for ' + m.MachineName + '. Your position: #' + pos + '.', rec);
  }

  function cancelQueue(queueId) {
    const q = state.queue.find((x) => x.QueueID === queueId);
    if (!q || q.StudentID !== CURRENT_STUDENT_ID) return fail('Queue entry not found.');
    if (q.Status !== 'Waiting') return fail('This queue entry is no longer active.');
    q.Status = 'Cancelled';
    renumberQueue(q.MachineID);
    saveState();
    return ok('You left the queue for ' + getMachine(q.MachineID).MachineName + '.');
  }

  function createSession(machineId, startLocal, endLocal) {
    const m = getMachine(machineId);
    if (!m) return fail('Please select a machine.');
    if (!startLocal || !endLocal) return fail('Please fill in the start time and expected completion time.');
    if (m.Status === 'Under Maintenance') return fail(m.MachineName + ' is under maintenance. Please choose another machine.');
    if (m.Status === 'Occupied') return fail(m.MachineName + ' is recorded as occupied. Join its queue or choose an available machine.');

    const s = new Date(startLocal), e = new Date(endLocal);
    if (isNaN(s) || isNaN(e)) return fail('Please enter valid times.');
    if (e <= s) return fail('Expected completion must be later than the start time.');
    if (e <= now()) return fail('Expected completion must be in the future.');
    if (s > addMin(now(), 15)) return fail('Session start cannot be more than 15 minutes in the future. Use a reservation for later slots.');
    if (minutesBetween(s, e) > 360) return fail('A session can be at most 6 hours long.');

    const clash = state.reservations.find((r) => r.MachineID === machineId && r.Status === 'Confirmed' && r.StudentID !== CURRENT_STUDENT_ID && overlaps(s, e, new Date(r.StartTime), new Date(r.EndTime)));
    if (clash) return fail(m.MachineName + ' is reserved by another student ' + fmtRange(clash.StartTime, clash.EndTime) + '. Shorten the session or choose another machine.');

    const rec = {
      SessionID: newId('L', state.sessions, 'SessionID'),
      StudentID: CURRENT_STUDENT_ID,
      MachineID: machineId,
      StartTime: s.toISOString(),
      ExpectedEndTime: e.toISOString(),
      CollectionTime: null,
      Status: 'Active'
    };
    state.sessions.push(rec);

    // The student's own overlapping reservation counts as used; their queue entry is fulfilled.
    state.reservations.forEach((r) => {
      if (r.StudentID === CURRENT_STUDENT_ID && r.MachineID === machineId && r.Status === 'Confirmed' && overlaps(s, e, new Date(r.StartTime), new Date(r.EndTime))) r.Status = 'Completed';
    });
    const q = myQueueEntry(machineId);
    if (q) { q.Status = 'Fulfilled'; }
    renumberQueue(machineId);

    syncMachine(machineId);
    saveState();
    return ok('Session started on ' + m.MachineName + '. Expected completion: ' + fmtTime(rec.ExpectedEndTime) + '.', rec);
  }

  function markCollected(sessionId) {
    const s = state.sessions.find((x) => x.SessionID === sessionId);
    if (!s || s.StudentID !== CURRENT_STUDENT_ID) return fail('Session not found.');
    if (s.Status === 'Completed') return fail('This session is already completed.');
    s.Status = 'Completed';
    s.CollectionTime = now().toISOString();
    syncMachine(s.MachineID);
    saveState();
    const m = getMachine(s.MachineID);
    const next = waitingQueue(s.MachineID)[0];
    let msg = 'Marked as collected. ' + m.MachineName + ' is now recorded as ' + m.Status + '.';
    if (next && m.Status === 'Available') msg += ' The next student in the queue would be notified (simulated).';
    return ok(msg, s);
  }

  function computeInsights() {
    const data = USAGE_SAMPLE;
    const total = data.reduce((a, d) => a + d.sessions, 0);
    const sorted = data.slice().sort((a, b) => b.sessions - a.sessions);
    const busy = sorted.slice(0, 2);
    const quiet = sorted.slice(-2).reverse();
    const busiest = sorted[0];
    const quietest = sorted[sorted.length - 1];
    const max = busiest.sessions;
    const text = 'Based on the sample data, ' + busiest.adj + ' usage (' + busiest.sessions + ' sessions) is higher than ' + quietest.adj + ' usage (' + quietest.sessions + ' sessions). If your schedule allows, consider trying ' + quietest.name.toLowerCase() + ' (' + quietest.range + ').';
    return { data: data, total: total, busy: busy, quiet: quiet, busiest: busiest, quietest: quietest, max: max, text: text };
  }

  /* =========================================================
   * 5. UI building blocks
   * ======================================================= */
  const STATUS_CLASS = {
    'Available': 'available', 'Occupied': 'occupied', 'Under Maintenance': 'maintenance',
    'Active': 'active', 'Overdue': 'overdue', 'Completed': 'completed',
    'Confirmed': 'confirmed', 'Cancelled': 'cancelled', 'Waiting': 'waiting', 'Fulfilled': 'completed'
  };
  function badge(status) { return '<span class="badge badge-' + (STATUS_CLASS[status] || 'cancelled') + '">' + esc(status) + '</span>'; }
  function machineIcon(m, size) { return icon(m.Type === 'Dryer' ? 'dryer' : 'washer', size || 22); }
  function calloutHtml(type, iconName, html) { return '<div class="callout callout-' + type + '">' + icon(iconName, 18) + '<div>' + html + '</div></div>'; }
  function emptyHtml(text, btnLabel, route) {
    return '<div class="empty"><p>' + esc(text) + '</p>' + (btnLabel ? '<button type="button" class="btn btn-outline btn-sm" data-nav="' + route + '">' + esc(btnLabel) + '</button>' : '') + '</div>';
  }

  function toast(message, type, action) {
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'success');
    el.innerHTML = '<span class="toast-ico">' + icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check', 18) + '</span>' +
      '<span class="toast-msg">' + esc(message) + '</span>' +
      (action ? '<button type="button" class="toast-link" data-nav="' + action.nav + '">' + esc(action.label) + '</button>' : '') +
      '<button type="button" class="toast-x" aria-label="Dismiss">&times;</button>';
    $('#toasts').appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 6000);
  }

  function openModal(html) {
    $('#modalRoot').innerHTML = '<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true">' + html + '</div></div>';
    const focusable = $('#modalRoot .modal button, #modalRoot .modal [href]');
    if (focusable) focusable.focus();
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; ui.pendingConfirm = null; }
  function confirmDialog(title, message, confirmLabel, onConfirm) {
    ui.pendingConfirm = onConfirm;
    openModal(
      '<div class="modal-head"><h3>' + esc(title) + '</h3><button type="button" class="modal-x" data-action="close-modal" aria-label="Close">' + icon('x', 20) + '</button></div>' +
      '<p>' + esc(message) + '</p>' +
      '<div class="btn-row"><button type="button" class="btn btn-danger" data-action="confirm-yes">' + esc(confirmLabel) + '</button><button type="button" class="btn btn-outline" data-action="close-modal">Keep it</button></div>'
    );
  }

  function liveRemaining(endIso) { return '<span data-live="remaining" data-end="' + esc(endIso) + '">' + esc(remainingText(endIso)) + '</span>'; }

  /* =========================================================
   * 6. Screens
   * ======================================================= */
  function screenDashboard() {
    const washers = state.machines.filter((m) => m.Type === 'Washer');
    const dryers = state.machines.filter((m) => m.Type === 'Dryer');
    const wAvail = washers.filter((m) => m.Status === 'Available').length;
    const dAvail = dryers.filter((m) => m.Status === 'Available').length;
    const occupied = state.machines.filter((m) => m.Status === 'Occupied').length;
    const maint = state.machines.filter((m) => m.Status === 'Under Maintenance').length;

    const live = myLiveSessions();
    const primary = live[0];
    const nextRes = myUpcomingReservations()[0];
    const queues = myWaiting();
    const insights = computeInsights();

    let sessionCard;
    if (primary) {
      const m = getMachine(primary.MachineID);
      const st = sessionStatus(primary);
      sessionCard =
        '<div class="card-head"><h2 class="card-title">' + icon('clock', 20) + 'Active laundry session</h2>' + badge(st) + '</div>' +
        '<div class="row-title" style="margin-bottom:6px">' + machineIcon(m, 20) + esc(m.MachineName) + '</div>' +
        '<dl class="kv">' +
        '<dt>Expected completion</dt><dd>' + esc(fmtDateTime(primary.ExpectedEndTime)) + '</dd>' +
        '<dt>Time</dt><dd>' + liveRemaining(primary.ExpectedEndTime) + '</dd>' +
        '</dl>' +
        (live.length > 1 ? '<p class="muted small" style="margin-top:8px">+ ' + (live.length - 1) + ' more active session' + (live.length > 2 ? 's' : '') + '</p>' : '') +
        (st === 'Overdue' ? calloutHtml('warn', 'alert', '<p>Past the recorded expected completion time. Please collect your laundry when you can.</p>') : '');
    } else {
      sessionCard =
        '<div class="card-head"><h2 class="card-title">' + icon('clock', 20) + 'Active laundry session</h2></div>' +
        emptyHtml('You have no active laundry session.', 'Start a session', 'laundry');
    }

    let upNext = '<div class="card-head"><h2 class="card-title">' + icon('calendar', 20) + 'Up next</h2></div>';
    if (nextRes || queues.length) {
      upNext += '<div class="list">';
      if (nextRes) {
        const m = getMachine(nextRes.MachineID);
        upNext += '<div class="row-item"><div class="grow"><div class="row-title">Next reservation</div><div class="muted small">' + esc(m.MachineName) + ' · ' + esc(fmtRange(nextRes.StartTime, nextRes.EndTime)) + '</div></div>' + badge('Confirmed') + '</div>';
      }
      queues.forEach(function (q) {
        const m = getMachine(q.MachineID);
        const pos = waitingQueue(q.MachineID).findIndex((x) => x.QueueID === q.QueueID) + 1;
        upNext += '<div class="row-item"><div class="grow"><div class="row-title">Queue position #' + pos + '</div><div class="muted small">' + esc(m.MachineName) + ' · joined ' + esc(fmtTime(q.QueueTime)) + '</div></div>' + badge('Waiting') + '</div>';
      });
      upNext += '</div>';
    } else {
      upNext += emptyHtml('No upcoming reservation or queue entry.', 'Browse machines', 'machines');
    }

    return '' +
      '<div class="page-head"><h1>Good morning!</h1><p>Your laundry, organised.</p></div>' +
      '<div class="stats">' +
        statTile('washer', 'teal', wAvail, 'Washers available', 'of ' + washers.length + ' washers') +
        statTile('clock', 'amber', occupied, 'Machines occupied', maint ? maint + ' under maintenance' : 'recorded status') +
        statTile('dryer', 'navy', dAvail, 'Dryers available', 'of ' + dryers.length + ' dryers') +
      '</div>' +
      '<p class="muted small" style="margin-top:8px">Counts come from recorded statuses in simulated data, not from live machine sensors.</p>' +
      '<div class="hero-actions">' +
        '<button type="button" class="btn btn-primary" data-nav="machines">' + icon('washer', 18) + 'View Machines</button>' +
        (primary
          ? '<button type="button" class="btn btn-teal" data-nav="laundry">' + icon('basket', 18) + 'Track Laundry</button>'
          : '<button type="button" class="btn btn-teal" data-nav="laundry">' + icon('basket', 18) + 'Start Laundry Session</button>') +
      '</div>' +
      '<div class="grid grid-2 section">' +
        '<section class="card" aria-label="Active session">' + sessionCard + '</section>' +
        '<section class="card" aria-label="Up next">' + upNext + '</section>' +
      '</div>' +
      '<section class="card section" aria-label="Laundry insights preview">' +
        '<div class="card-head"><h2 class="card-title">' + icon('chart', 20) + 'Laundry insights</h2><span class="tag tag-demo">Demo insights</span></div>' +
        '<p>' + esc(insights.text) + '</p>' +
        '<p class="muted small" style="margin-top:8px">Based on simulated laundry records.</p>' +
        '<div class="btn-row" style="margin-top:12px"><button type="button" class="btn btn-outline btn-sm" data-nav="insights">See full insights ' + icon('arrow', 16) + '</button></div>' +
      '</section>';
  }

  function statTile(ic, tone, num, label, sub) {
    return '<div class="stat"><div class="stat-ico ' + tone + '">' + icon(ic, 22) + '</div><div><div class="stat-num">' + num + '</div><div class="stat-label">' + esc(label) + '</div><div class="stat-sub">' + esc(sub) + '</div></div></div>';
  }

  /* ---------- Machines ---------- */
  function machineCard(m) {
    const cls = STATUS_CLASS[m.Status];
    const busyUntil = machineBusyUntil(m.MachineID);
    const inQueue = myQueueEntry(m.MachineID);
    const mineLive = liveSessionsOn(m.MachineID).some((s) => s.StudentID === CURRENT_STUDENT_ID);
    const waiting = waitingQueue(m.MachineID).length;

    let meta = '';
    if (m.Status === 'Occupied') {
      meta = '<span>Recorded to finish about ' + esc(busyUntil ? fmtTime(busyUntil) : '—') + '</span><span>' + waiting + ' waiting in queue</span>';
    } else if (m.Status === 'Available') {
      meta = '<span>Recorded as free to use</span>';
    } else {
      meta = '<span>Not available for reservations</span>';
    }

    let action;
    if (m.Status === 'Available') {
      action = '<button type="button" class="btn btn-primary btn-block" data-action="reserve" data-id="' + m.MachineID + '">Reserve</button>';
    } else if (m.Status === 'Occupied') {
      if (mineLive) action = '<button type="button" class="btn btn-block" disabled>Your session</button>';
      else if (inQueue) action = '<button type="button" class="btn btn-block" disabled>In queue · #' + (waitingQueue(m.MachineID).findIndex((q) => q.QueueID === inQueue.QueueID) + 1) + '</button>';
      else action = '<button type="button" class="btn btn-teal btn-block" data-action="join-queue" data-id="' + m.MachineID + '">Join Queue</button>';
    } else {
      action = '<button type="button" class="btn btn-block" disabled aria-disabled="true">Unavailable — maintenance</button>';
    }

    return '<article class="card machine s-' + cls + '" data-action="open-machine" data-id="' + m.MachineID + '">' +
      '<div class="machine-top"><div class="machine-ico">' + machineIcon(m) + '</div>' +
      '<div class="machine-info"><button type="button" class="machine-name" data-action="open-machine" data-id="' + m.MachineID + '">' + esc(m.MachineName) + '</button>' +
      '<div style="margin-top:3px"><span class="chip-type">' + esc(m.Type) + '</span></div></div>' + badge(m.Status) + '</div>' +
      '<div class="machine-meta"><span class="row-title" style="font-weight:500;color:var(--muted)">' + icon('pin', 15) + esc(m.Location) + '</span>' + meta + '</div>' +
      '<div class="machine-actions">' + action + '</div></article>';
  }

  function screenMachines() {
    const f = ui.filter;
    const list = state.machines.filter(function (m) {
      if (f === 'Washer' || f === 'Dryer') return m.Type === f;
      if (f === 'Available') return m.Status === 'Available';
      return true;
    });
    const chips = [['all', 'All machines'], ['Washer', 'Washers'], ['Dryer', 'Dryers'], ['Available', 'Available now']]
      .map((c) => '<button type="button" class="chip" data-action="filter" data-value="' + c[0] + '" aria-pressed="' + (f === c[0]) + '">' + c[1] + '</button>').join('');
    return '' +
      '<div class="page-head"><h1>Machine availability</h1><p>Tap a machine for details, or reserve and queue straight from the card.</p></div>' +
      '<div class="filters" role="group" aria-label="Filter machines">' + chips + '</div>' +
      '<div class="grid grid-auto">' + (list.length ? list.map(machineCard).join('') : '<div class="card">' + emptyHtml('No machines match this filter.') + '</div>') + '</div>' +
      calloutHtml('info', 'info', '<p><b>Recorded statuses only.</b> This prototype uses simulated data. It does not detect whether a physical machine is really running or free.</p>');
  }

  function machineDetailHtml(id) {
    const m = getMachine(id);
    if (!m) return '';
    const until = machineBusyUntil(id);
    const waiting = waitingQueue(id).length;
    const mineLive = liveSessionsOn(id).some((s) => s.StudentID === CURRENT_STUDENT_ID);
    const inQueue = myQueueEntry(id);
    const resv = state.reservations.filter((r) => r.MachineID === id && r.Status === 'Confirmed' && new Date(r.EndTime) > now()).sort(byTime('StartTime'));

    let body = '<dl class="kv">' +
      '<dt>Type</dt><dd>' + esc(m.Type) + '</dd>' +
      '<dt>Location</dt><dd>' + esc(m.Location) + '</dd>' +
      '<dt>Recorded status</dt><dd>' + esc(m.Status) + '</dd>';
    if (m.Status === 'Occupied') {
      body += '<dt>Recorded expected finish</dt><dd>' + esc(until ? fmtDateTime(until) : '—') + '</dd>' +
        '<dt>Students waiting</dt><dd>' + waiting + '</dd>';
    }
    body += '</dl>';

    body += '<h4 style="margin:16px 0 6px">Upcoming reservations</h4>';
    body += resv.length
      ? '<ul class="rank">' + resv.map((r) => '<li><span>' + esc(fmtRange(r.StartTime, r.EndTime)) + '</span><b>' + (r.StudentID === CURRENT_STUDENT_ID ? 'You' : 'Another student') + '</b></li>').join('') + '</ul>'
      : '<p class="muted small">No upcoming reservations.</p>';

    let actions = '';
    if (m.Status === 'Available') {
      actions = '<button type="button" class="btn btn-primary" data-action="reserve" data-id="' + id + '">Reserve</button>' +
        '<button type="button" class="btn btn-teal" data-action="start-session" data-id="' + id + '">Start session now</button>';
    } else if (m.Status === 'Occupied') {
      body += calloutHtml('info', 'info', '<p>This machine is recorded as occupied. You can join its queue, reserve a later time, or choose another machine.</p>');
      if (mineLive) actions = '<button type="button" class="btn btn-teal" data-nav="laundry">Go to My Laundry</button>';
      else if (inQueue) actions = '<button type="button" class="btn btn-outline" data-nav="queue">View my queue entry</button>';
      else actions = '<button type="button" class="btn btn-teal" data-action="join-queue" data-id="' + id + '">Join Queue</button>';
      if (!mineLive) actions += '<button type="button" class="btn btn-outline" data-action="reserve" data-id="' + id + '">Reserve for later</button>';
    } else {
      body += calloutHtml('warn', 'wrench', '<p>This machine is under maintenance and cannot be reserved or queued.</p>');
    }

    return '<div class="modal-head"><div><h3>' + machineIcon(m, 20) + ' ' + esc(m.MachineName) + '</h3><div class="muted small" style="margin-top:4px">' + badge(m.Status) + '</div></div>' +
      '<button type="button" class="modal-x" data-action="close-modal" aria-label="Close">' + icon('x', 20) + '</button></div>' +
      body +
      '<div class="btn-row">' + actions + '<button type="button" class="btn btn-outline" data-action="close-modal">Close</button></div>';
  }

  /* ---------- Reservation ---------- */
  function reserveNotice(machineId) {
    const m = getMachine(machineId);
    if (!m) return '';
    let html = '';
    if (m.Status === 'Under Maintenance') {
      html += calloutHtml('error', 'wrench', '<p><b>' + esc(m.MachineName) + ' is under maintenance.</b> It cannot be reserved. Please choose another machine.</p>');
    } else if (m.Status === 'Occupied') {
      const until = machineBusyUntil(machineId);
      html += calloutHtml('warn', 'alert',
        '<p><b>' + esc(m.MachineName) + ' is currently recorded as occupied' + (until ? ' (expected to finish about ' + esc(fmtTime(until)) + ')' : '') + '.</b></p>' +
        '<p>You can join its queue or choose another machine. You may still reserve a later time slot.</p>' +
        (myQueueEntry(machineId) ? '<p>You are already in this queue.</p>' : '<div class="btn-row"><button type="button" class="btn btn-teal btn-sm" data-action="join-queue" data-id="' + machineId + '">Join Queue</button></div>'));
    } else {
      html += calloutHtml('ok', 'check', '<p>' + esc(m.MachineName) + ' is recorded as available.</p>');
    }
    const resv = state.reservations.filter((r) => r.MachineID === machineId && r.Status === 'Confirmed' && new Date(r.EndTime) > now()).sort(byTime('StartTime'));
    if (resv.length) {
      html += '<p class="muted small" style="margin-top:8px">Already reserved: ' + resv.map((r) => esc(fmtRange(r.StartTime, r.EndTime))).join('; ') + '</p>';
    }
    return html;
  }

  function reservationRow(r, withMachineIcon) {
    const m = getMachine(r.MachineID);
    const upcoming = r.Status === 'Confirmed' && new Date(r.EndTime) > now();
    const past = r.Status === 'Confirmed' && !upcoming;
    return '<div class="row-item"><div class="grow"><div class="row-title">' + (withMachineIcon ? machineIcon(m, 18) : '') + esc(m.MachineName) + '</div>' +
      '<div class="muted small">' + esc(fmtRange(r.StartTime, r.EndTime)) + '</div></div>' +
      (past ? '<span class="badge badge-completed">Past</span>' : badge(r.Status)) +
      (upcoming ? '<button type="button" class="btn btn-danger btn-sm" data-action="cancel-reservation" data-id="' + r.ReservationID + '">Cancel</button>' : '') +
      '</div>';
  }

  function screenReserve() {
    const n = now();
    let start = new Date(n);
    start.setSeconds(0, 0);
    start = addMin(start, 30 - (start.getMinutes() % 30));
    const end = addMin(start, 60);
    const selected = ui.reserveMachine || '';
    const options = '<option value="">Select a machine…</option>' + state.machines.map(function (m) {
      const dis = m.Status === 'Under Maintenance' ? ' disabled' : '';
      return '<option value="' + m.MachineID + '"' + dis + (m.MachineID === selected ? ' selected' : '') + '>' + esc(m.MachineName) + ' — ' + esc(m.Status) + '</option>';
    }).join('');

    const mine = myReservations().sort(byTime('StartTime')).reverse();
    const upcoming = mine.filter((r) => r.Status === 'Confirmed' && new Date(r.EndTime) > n);
    const other = mine.filter((r) => !(r.Status === 'Confirmed' && new Date(r.EndTime) > n)).slice(0, 4);

    return '' +
      '<div class="page-head"><h1>Reserve a machine</h1><p>Pick a machine and a time slot (up to 3 hours).</p></div>' +
      '<div class="two-col">' +
        '<section class="card" aria-label="Reservation form"><form id="reserveForm" data-form="reserve" novalidate>' +
          '<div class="form-msg" id="reserveMsg" role="alert" hidden></div>' +
          '<div class="field"><label for="rsMachine">Machine</label><select id="rsMachine" name="machine" class="input">' + options + '</select></div>' +
          '<div id="rsNotice">' + (selected ? reserveNotice(selected) : '') + '</div>' +
          '<div class="field" style="margin-top:14px"><label for="rsDate">Reservation date</label><input id="rsDate" name="date" type="date" class="input" min="' + toDateInput(n) + '" value="' + toDateInput(start) + '"></div>' +
          '<div class="field-row">' +
            '<div class="field"><label for="rsStart">Start time</label><input id="rsStart" name="start" type="time" class="input" value="' + toTimeInput(start) + '"></div>' +
            '<div class="field"><label for="rsEnd">End time</label><input id="rsEnd" name="end" type="time" class="input" value="' + toTimeInput(end) + '"></div>' +
          '</div>' +
          '<div class="btn-row"><button type="submit" class="btn btn-primary">Confirm Reservation</button><button type="button" class="btn btn-outline" data-action="cancel-reserve-form">Cancel</button></div>' +
        '</form></section>' +
        '<section class="card" aria-label="My reservations"><div class="card-head"><h2 class="card-title">' + icon('calendar', 20) + 'My reservations</h2></div>' +
          (upcoming.length ? '<div class="list">' + upcoming.map((r) => reservationRow(r, true)).join('') + '</div>' : emptyHtml('You have no upcoming reservations.')) +
          (other.length ? '<h4 style="margin:16px 0 8px" class="muted">Earlier</h4><div class="list">' + other.map((r) => reservationRow(r, false)).join('') + '</div>' : '') +
        '</section>' +
      '</div>';
  }

  /* ---------- Queue ---------- */
  function screenQueue() {
    const mine = myWaiting();
    const occupied = state.machines.filter((m) => m.Status === 'Occupied');
    const history = state.queue.filter((q) => q.StudentID === CURRENT_STUDENT_ID && q.Status !== 'Waiting').sort(byTime('QueueTime')).reverse().slice(0, 4);

    const mineHtml = mine.length ? '<div class="list">' + mine.map(function (q) {
      const m = getMachine(q.MachineID);
      const pos = waitingQueue(q.MachineID).findIndex((x) => x.QueueID === q.QueueID) + 1;
      const until = machineBusyUntil(q.MachineID);
      let note;
      if (m.Status === 'Available') {
        note = pos === 1 ? 'Recorded as available now — you are next in line.' : 'Recorded as available. Students ahead of you are first in line.';
      } else if (until && new Date(until) > now()) {
        note = 'Recorded to finish about ' + fmtTime(until) + '.';
      } else {
        note = 'Past the recorded finish time; waiting for the current student to collect.';
      }
      const canStart = m.Status === 'Available' && pos === 1;
      return '<div class="row-item"><div class="queue-pos" aria-label="Position ' + pos + '">#' + pos + '</div>' +
        '<div class="grow"><div class="row-title">' + machineIcon(m, 18) + esc(m.MachineName) + '</div>' +
        '<div class="muted small">Joined ' + esc(fmtDateTime(q.QueueTime)) + '</div>' +
        '<div class="muted small">' + esc(note) + '</div></div>' +
        '<div class="btn-row">' +
          (canStart ? '<button type="button" class="btn btn-teal btn-sm" data-action="start-session" data-id="' + m.MachineID + '">Start session</button>' : '') +
          '<button type="button" class="btn btn-danger btn-sm" data-action="cancel-queue" data-id="' + q.QueueID + '">Cancel</button>' +
        '</div></div>';
    }).join('') + '</div>' : emptyHtml('You are not in any queue.', 'Browse machines', 'machines');

    const optionsHtml = occupied.length ? '<div class="list">' + occupied.map(function (m) {
      const until = machineBusyUntil(m.MachineID);
      const waiting = waitingQueue(m.MachineID).length;
      const mineLive = liveSessionsOn(m.MachineID).some((s) => s.StudentID === CURRENT_STUDENT_ID);
      const joined = !!myQueueEntry(m.MachineID);
      let btn;
      if (mineLive) btn = '<button type="button" class="btn btn-sm" disabled>Your session</button>';
      else if (joined) btn = '<button type="button" class="btn btn-sm" disabled>Already in queue</button>';
      else btn = '<button type="button" class="btn btn-teal btn-sm" data-action="join-queue" data-id="' + m.MachineID + '">Join Queue</button>';
      return '<div class="row-item"><div class="grow"><div class="row-title">' + machineIcon(m, 18) + esc(m.MachineName) + ' ' + badge('Occupied') + '</div>' +
        '<div class="muted small">' + esc(m.Location) + ' · ' + waiting + ' waiting · recorded to finish about ' + esc(until ? fmtTime(until) : '—') + '</div></div>' + btn + '</div>';
    }).join('') + '</div>' : emptyHtml('No machines are currently recorded as occupied, so there is nothing to queue for.', 'Reserve a machine', 'reserve');

    return '' +
      '<div class="page-head"><h1>Queue</h1><p>Join a queue for a machine that is currently occupied.</p></div>' +
      '<div class="two-col">' +
        '<section class="card" aria-label="My queue entries"><div class="card-head"><h2 class="card-title">' + icon('queue', 20) + 'My queue entries</h2></div>' + mineHtml + '</section>' +
        '<section class="card" aria-label="Queue options"><div class="card-head"><h2 class="card-title">' + icon('washer', 20) + 'Queue options</h2></div>' + optionsHtml + '</section>' +
      '</div>' +
      (history.length ? '<section class="card section"><h2 style="margin-bottom:10px">Recent queue history</h2><div class="list">' + history.map(function (q) {
        const m = getMachine(q.MachineID);
        return '<div class="row-item"><div class="grow"><div class="row-title">' + esc(m.MachineName) + '</div><div class="muted small">Joined ' + esc(fmtDateTime(q.QueueTime)) + '</div></div>' + badge(q.Status) + '</div>';
      }).join('') + '</div></section>' : '') +
      calloutHtml('info', 'info', '<p>Queues here are informational and simulated. A queue does not physically lock or control access to any machine.</p>');
  }

  /* ---------- My Laundry ---------- */
  function sessionCard(s) {
    const m = getMachine(s.MachineID);
    const st = sessionStatus(s);
    const cls = st === 'Overdue' ? 'overdue' : 'active';
    return '<div class="session ' + cls + '">' +
      '<div class="session-top"><div class="row-title">' + machineIcon(m, 20) + esc(m.MachineName) + '</div>' + badge(st) + '</div>' +
      '<div class="session-times"><span>Started <b>' + esc(fmtDateTime(s.StartTime)) + '</b></span><span>Expected completion <b>' + esc(fmtDateTime(s.ExpectedEndTime)) + '</b></span></div>' +
      '<div class="remaining">' + liveRemaining(s.ExpectedEndTime) + '</div>' +
      '<div class="progress" aria-hidden="true"><span data-live="progress" data-start="' + esc(s.StartTime) + '" data-end="' + esc(s.ExpectedEndTime) + '" style="width:' + progressPct(s.StartTime, s.ExpectedEndTime) + '%"></span></div>' +
      '<div class="btn-row"><button type="button" class="btn btn-primary btn-sm" data-action="collect" data-id="' + s.SessionID + '">' + icon('check', 16) + 'Mark as Collected</button></div>' +
      (st === 'Overdue' ? '<p class="muted small" style="margin-top:8px">Overdue is based on the recorded expected completion time, not a sensor.</p>' : '') +
      '</div>';
  }

  function screenLaundry() {
    const n = now();
    const selected = ui.laundryMachine && getMachine(ui.laundryMachine) && getMachine(ui.laundryMachine).Status === 'Available' ? ui.laundryMachine : '';
    const sel = selected ? getMachine(selected) : null;
    const startVal = toLocalInput(n);
    const endVal = toLocalInput(addMin(n, DEFAULT_MINUTES[sel ? sel.Type : 'Washer']));

    const options = '<option value="">Select an available machine…</option>' + state.machines.map(function (m) {
      const ok2 = m.Status === 'Available';
      return '<option value="' + m.MachineID + '"' + (ok2 ? '' : ' disabled') + (m.MachineID === selected ? ' selected' : '') + '>' + esc(m.MachineName) + ' — ' + esc(m.Status) + '</option>';
    }).join('');

    const live = myLiveSessions();
    const done = mySessions().filter((s) => s.Status === 'Completed').sort(byTime('CollectionTime')).reverse().slice(0, 5);
    const upcoming = myUpcomingReservations();

    return '' +
      '<div class="page-head"><h1>My Laundry</h1><p>Register a session, track it, and mark it collected.</p></div>' +
      '<div class="two-col">' +
        '<section class="card" aria-label="Register a session"><div class="card-head"><h2 class="card-title">' + icon('basket', 20) + 'Register a laundry session</h2></div>' +
        '<form id="sessionForm" data-form="session" novalidate>' +
          '<div class="form-msg" id="sessionMsg" role="alert" hidden></div>' +
          '<div class="field"><label for="lsMachine">Machine</label><select id="lsMachine" name="machine" class="input">' + options + '</select><span class="hint">Only machines recorded as available can be selected.</span></div>' +
          '<div class="field"><label for="lsStart">Session start time</label><input id="lsStart" name="start" type="datetime-local" class="input" value="' + startVal + '"></div>' +
          '<div class="field"><label for="lsEnd">Expected completion time</label><input id="lsEnd" name="end" type="datetime-local" class="input" value="' + endVal + '"><span class="hint">Suggested: 45 min for washers, 60 min for dryers. You can change it.</span></div>' +
          '<div class="btn-row"><button type="submit" class="btn btn-primary">Start Session</button></div>' +
        '</form></section>' +
        '<section class="card" aria-label="Active sessions"><div class="card-head"><h2 class="card-title">' + icon('clock', 20) + 'Active sessions</h2></div>' +
          (live.length ? '<div class="list">' + live.map(sessionCard).join('') + '</div>' : emptyHtml('No active sessions right now.')) +
        '</section>' +
      '</div>' +
      '<div class="two-col section">' +
        '<section class="card" aria-label="Upcoming reservations"><div class="card-head"><h2 class="card-title">' + icon('calendar', 20) + 'Upcoming reservations</h2></div>' +
          (upcoming.length ? '<div class="list">' + upcoming.map((r) => reservationRow(r, true)).join('') + '</div>' : emptyHtml('No upcoming reservations.', 'Reserve a machine', 'reserve')) +
        '</section>' +
        '<section class="card" aria-label="Session history"><div class="card-head"><h2 class="card-title">' + icon('check', 20) + 'Completed sessions</h2></div>' +
          (done.length ? '<div class="list">' + done.map(function (s) {
            const m = getMachine(s.MachineID);
            return '<div class="row-item"><div class="grow"><div class="row-title">' + esc(m.MachineName) + '</div><div class="muted small">Started ' + esc(fmtDateTime(s.StartTime)) + '</div><div class="muted small">Collected ' + esc(fmtDateTime(s.CollectionTime)) + '</div></div>' + badge('Completed') + '</div>';
          }).join('') + '</div>' : emptyHtml('No completed sessions yet.')) +
        '</section>' +
      '</div>';
  }

  /* ---------- Insights ---------- */
  function screenInsights() {
    const ins = computeInsights();
    const busyKeys = ins.busy.map((d) => d.key);
    const quietKeys = ins.quiet.map((d) => d.key);

    const bars = ins.data.map(function (d) {
      const cls = busyKeys.indexOf(d.key) > -1 ? 'busy' : quietKeys.indexOf(d.key) > -1 ? 'quiet' : '';
      const h = Math.round((d.sessions / ins.max) * 82);
      return '<div class="bar-col"><span class="bar-val">' + d.sessions + '</span><div class="bar ' + cls + '" style="height:' + h + '%"></div></div>';
    }).join('');
    const labels = ins.data.map((d) => '<div>' + esc(d.name) + '<small>' + esc(d.range) + '</small></div>').join('');
    const rows = ins.data.map((d) => '<tr><td>' + esc(d.name) + ' <span class="muted">(' + esc(d.range) + ')</span></td><td class="num">' + d.sessions + '</td><td class="num">' + Math.round((d.sessions / ins.total) * 100) + '%</td></tr>').join('');

    return '' +
      '<div class="page-head"><h1>Laundry insights</h1><p>How historical usage can help you plan a quieter laundry time.</p></div>' +
      '<div class="demo-banner"><span class="tag tag-proto">Demo</span> DEMO INSIGHTS — Based on simulated laundry records.</div>' +
      '<section class="card section" aria-label="Usage chart"><div class="card-head"><h2 class="card-title">' + icon('chart', 20) + 'Recorded laundry sessions by time period</h2></div>' +
        '<div class="chart-wrap" role="img" aria-label="Bar chart of simulated laundry sessions by time period. Evening has the most sessions and late morning the fewest.">' +
        '<div class="bars">' + bars + '</div><div class="bar-labels">' + labels + '</div></div>' +
        '<div class="legend"><span><i style="background:var(--navy)"></i>Historically busier</span><span><i style="background:var(--teal)"></i>Historically quieter</span><span><i style="background:#9db3d1"></i>In between</span></div>' +
        '<p class="muted small" style="margin-top:10px">Sample dataset: ' + ins.total + ' simulated sessions. These figures do not represent real UNIMAS usage.</p>' +
      '</section>' +
      '<div class="two-col section">' +
        '<section class="card"><h2 style="margin-bottom:10px">Historically busy periods</h2><ul class="rank">' + ins.busy.map((d) => '<li><span>' + esc(d.name) + ' <span class="muted">' + esc(d.range) + '</span></span><b>' + d.sessions + ' sessions</b></li>').join('') + '</ul></section>' +
        '<section class="card"><h2 style="margin-bottom:10px">Historically quieter periods</h2><ul class="rank">' + ins.quiet.map((d) => '<li><span>' + esc(d.name) + ' <span class="muted">' + esc(d.range) + '</span></span><b>' + d.sessions + ' sessions</b></li>').join('') + '</ul></section>' +
      '</div>' +
      '<section class="card section"><div class="card-head"><h2 class="card-title">' + icon('spark', 20) + 'Recommendation</h2><span class="tag tag-planned">Planned Gemini feature</span></div>' +
        '<div class="reco"><p>' + esc(ins.text) + '</p></div>' +
        '<p class="muted small" style="margin-top:10px">This sentence is generated by simple rules from the sample data above. In a future version, Gemini could explain summarised usage patterns in natural language. This prototype is not connected to Gemini or any AI service.</p>' +
      '</section>' +
      '<section class="card section"><h2 style="margin-bottom:10px">Sample data behind the chart</h2><table class="data"><thead><tr><th>Time period</th><th class="num">Sessions</th><th class="num">Share</th></tr></thead><tbody>' + rows + '</tbody></table></section>';
  }

  /* ---------- Profile ---------- */
  function switchRow(id, title, desc, checked) {
    return '<div class="switch-row"><div class="sw-text"><strong>' + esc(title) + '</strong><span>' + esc(desc) + '</span></div>' +
      '<label class="switch"><input type="checkbox" id="' + id + '" name="' + id + '"' + (checked ? ' checked' : '') + ' aria-label="' + esc(title) + '"><span class="track"></span><span class="thumb"></span></label></div>';
  }

  function screenProfile() {
    const s = me();
    const p = state.prefs;
    const initials = s.StudentName.split(' ').map((w) => w[0]).slice(0, 2).join('');
    return '' +
      '<div class="page-head"><h1>Profile and preferences</h1><p>A simulated signed-in student. No password or real account is used.</p></div>' +
      '<div class="two-col">' +
        '<section class="card"><div class="profile-head"><div class="avatar" aria-hidden="true">' + esc(initials) + '</div><div><h2>' + esc(s.StudentName) + '</h2><span class="tag tag-proto">Fictional demo student</span></div></div>' +
          '<dl class="kv"><dt>Student ID</dt><dd>' + esc(s.StudentID) + '</dd><dt>Residential unit</dt><dd>' + esc(s.UnitNumber) + '</dd><dt>Residential college</dt><dd>Demo Residential College</dd></dl>' +
        '</section>' +
        '<section class="card"><div class="card-head"><h2 class="card-title">Notification preferences</h2></div>' +
          '<form id="prefsForm" data-form="prefs">' +
            switchRow('pfRemind', 'Remind me before my session ends', 'Simulated preference only', p.remindBeforeEnd) +
            '<div class="field" style="margin:4px 0 10px"><label for="pfMinutes">Reminder lead time</label><select id="pfMinutes" name="pfMinutes" class="input">' +
              ['5', '10', '15', '30'].map((v) => '<option value="' + v + '"' + (p.remindMinutes === v ? ' selected' : '') + '>' + v + ' minutes before</option>').join('') + '</select></div>' +
            switchRow('pfQueue', 'Alert me when my queued machine is available', 'Simulated preference only', p.queueAlert) +
            switchRow('pfRes', 'Remind me before reservations', 'Simulated preference only', p.reservationReminder) +
            '<div class="btn-row" style="margin-top:14px"><button type="submit" class="btn btn-primary">Save preferences</button></div>' +
          '</form>' +
          calloutHtml('info', 'info', '<p>The prototype does not send real notifications. These switches only save your choices.</p>') +
        '</section>' +
      '</div>' +
      '<section class="card section"><h2 style="margin-bottom:6px">Prototype data</h2><p class="muted small">All records are fictional and stored only in this browser (LocalStorage). Resetting restores the original sample data and the demo clock.</p>' +
        '<div class="btn-row" style="margin-top:12px"><button type="button" class="btn btn-danger" data-action="reset-data">Reset demo data</button></div></section>';
  }

  const SCREENS = {
    dashboard: screenDashboard, machines: screenMachines, reserve: screenReserve,
    queue: screenQueue, laundry: screenLaundry, insights: screenInsights, profile: screenProfile
  };
  const TITLES = {
    dashboard: 'Dashboard', machines: 'Machines', reserve: 'Reserve', queue: 'Queue',
    laundry: 'My Laundry', insights: 'Insights', profile: 'Profile'
  };

  /* =========================================================
   * 7. Rendering, routing, live updates
   * ======================================================= */
  function currentRoute() {
    const r = (window.location.hash || '').replace('#', '');
    return SCREENS[r] ? r : 'dashboard';
  }

  function renderNav(route) {
    const items = (cls, size) => NAV.map(function (n) {
      return '<a href="#' + n.id + '" data-nav="' + n.id + '" class="' + (n.id === route ? 'active' : '') + '"' + (n.id === route ? ' aria-current="page"' : '') + '>' + icon(n.icon, size) + '<span>' + n.label + '</span></a>';
    }).join('');
    $('#sideNav').innerHTML = items('side', 20);
    $('#bottomNav').innerHTML = items('bottom', 21);
  }

  function renderDemoBar() {
    const off = Math.round(state.clockOffsetMs / 60000);
    $('#demoBar').innerHTML =
      '<strong>Prototype</strong><span>Simulated data · demo time <b id="demoTime">' + esc(fmtTime(now())) + '</b>' + (off ? ' (+' + fmtDur(off) + ')' : '') + '</span>' +
      '<span class="spacer"></span>' +
      '<button type="button" data-action="clock-skip" data-min="15" title="Move the demo clock forward 15 minutes">+15 min</button>' +
      '<button type="button" data-action="clock-skip" data-min="60" title="Move the demo clock forward 1 hour">+1 hour</button>' +
      (off ? '<button type="button" data-action="clock-reset">Reset clock</button>' : '');
  }

  function snapshotInputs() {
    const snap = {};
    $$('#app input[id], #app select[id]').forEach(function (el) { snap[el.id] = el.type === 'checkbox' ? el.checked : el.value; });
    return snap;
  }
  function restoreInputs(snap) {
    Object.keys(snap).forEach(function (id) {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.type === 'checkbox') el.checked = snap[id];
      else if (el.tagName === 'SELECT') {
        const opt = Array.prototype.find.call(el.options, (o) => o.value === snap[id] && !o.disabled);
        if (opt) el.value = snap[id];
      } else el.value = snap[id];
    });
  }

  function render(opts) {
    const keep = !(opts && opts.fresh);
    const route = currentRoute();
    const snap = keep && route === lastRoute ? snapshotInputs() : null;
    $('#app').innerHTML = SCREENS[route]();
    if (snap) restoreInputs(snap);
    renderNav(route);
    renderDemoBar();
    document.title = TITLES[route] + ' · WashSync (Prototype)';
    if (route !== lastRoute) { window.scrollTo(0, 0); }
    lastRoute = route;
  }

  function go(route) {
    if (!SCREENS[route]) route = 'dashboard';
    if (window.location.hash === '#' + route) render({ fresh: true });
    else window.location.hash = route;
  }

  function updateLive() {
    $$('[data-live="remaining"]').forEach(function (el) { el.textContent = remainingText(el.getAttribute('data-end')); });
    $$('[data-live="progress"]').forEach(function (el) { el.style.width = progressPct(el.getAttribute('data-start'), el.getAttribute('data-end')) + '%'; });
    const t = $('#demoTime');
    if (t) t.textContent = fmtTime(now());
  }

  function tick() {
    const newly = refreshStatuses();
    if (newly.length) {
      newly.filter((s) => s.StudentID === CURRENT_STUDENT_ID).forEach(function (s) {
        toast('Your ' + getMachine(s.MachineID).MachineName + ' session is past its expected completion time.', 'info', { label: 'View', nav: 'laundry' });
      });
      render();
    } else {
      updateLive();
    }
  }

  /* =========================================================
   * 8. Events
   * ======================================================= */
  function setFormMsg(id, type, text) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!text) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML = '<div class="callout callout-' + type + '" style="margin-top:0">' + icon(type === 'error' ? 'alert' : 'check', 18) + '<div>' + esc(text) + '</div></div>';
  }

  function afterMutation(result, successActionNav) {
    if (result.ok) toast(result.message, 'success', successActionNav);
    else toast(result.message, 'error');
    render();
  }

  function handleAction(action, ds) {
    switch (action) {
      case 'close-modal': closeModal(); break;

      case 'confirm-yes': {
        const fn = ui.pendingConfirm;
        closeModal();
        if (fn) fn();
        break;
      }

      case 'open-machine':
        openModal(machineDetailHtml(ds.id));
        break;

      case 'filter':
        ui.filter = ds.value;
        render();
        break;

      case 'reserve':
        ui.reserveMachine = ds.id;
        closeModal();
        go('reserve');
        if (currentRoute() === 'reserve') render({ fresh: true });
        break;

      case 'start-session':
        ui.laundryMachine = ds.id;
        ui.endEdited = false;
        closeModal();
        go('laundry');
        if (currentRoute() === 'laundry') render({ fresh: true });
        break;

      case 'cancel-reserve-form':
        ui.reserveMachine = null;
        go('dashboard');
        break;

      case 'join-queue': {
        closeModal();
        const r = joinQueue(ds.id);
        afterMutation(r, r.ok ? { label: 'View queue', nav: 'queue' } : null);
        break;
      }

      case 'cancel-queue':
        confirmDialog('Leave this queue?', 'You will lose your place in line for this machine.', 'Leave queue', function () {
          afterMutation(cancelQueue(ds.id));
        });
        break;

      case 'cancel-reservation':
        confirmDialog('Cancel this reservation?', 'The time slot will become available to other students.', 'Cancel reservation', function () {
          afterMutation(cancelReservation(ds.id));
        });
        break;

      case 'collect': {
        const r = markCollected(ds.id);
        afterMutation(r);
        break;
      }

      case 'clock-skip':
        state.clockOffsetMs += parseInt(ds.min, 10) * 60000;
        saveState();
        toast('Demo clock moved forward ' + fmtDur(parseInt(ds.min, 10)) + '.', 'info');
        tick();
        render();
        break;

      case 'clock-reset':
        state.clockOffsetMs = 0;
        refreshStatuses();
        saveState();
        render();
        break;

      case 'reset-data':
        confirmDialog('Reset all demo data?', 'This restores the original sample reservations, queues and sessions, and resets the demo clock.', 'Reset data', function () {
          state = buildSeed();
          ui.reserveMachine = null; ui.laundryMachine = null; ui.endEdited = false;
          reconcileMachines();
          saveState();
          toast('Demo data reset.', 'info');
          render({ fresh: true });
        });
        break;

      default: break;
    }
  }

  document.addEventListener('click', function (e) {
    const x = e.target.closest('.toast-x');
    if (x) { const t = x.closest('.toast'); if (t) t.remove(); return; }

    const navEl = e.target.closest('[data-nav]');
    if (navEl) {
      e.preventDefault();
      closeModal();
      go(navEl.getAttribute('data-nav'));
      return;
    }

    const a = e.target.closest('[data-action]');
    if (!a || a.disabled) return;
    if (a.classList.contains('modal-backdrop') && e.target !== a) return; // click inside the dialog
    handleAction(a.getAttribute('data-action'), a.dataset);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('#modalRoot .modal')) closeModal();
  });

  document.addEventListener('change', function (e) {
    const t = e.target;
    if (t.id === 'rsMachine') {
      ui.reserveMachine = t.value || null;
      $('#rsNotice').innerHTML = t.value ? reserveNotice(t.value) : '';
      setFormMsg('reserveMsg', 'error', '');
    }
    if (t.id === 'lsMachine' || t.id === 'lsStart') {
      if (t.id === 'lsMachine') ui.laundryMachine = t.value || null;
      if (!ui.endEdited) {
        const m = getMachine($('#lsMachine').value);
        const startVal = $('#lsStart').value;
        if (startVal) $('#lsEnd').value = toLocalInput(addMin(new Date(startVal), DEFAULT_MINUTES[m ? m.Type : 'Washer']));
      }
    }
    if (t.id === 'lsEnd') ui.endEdited = true;
  });

  document.addEventListener('submit', function (e) {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();

    if (f.dataset.form === 'reserve') {
      const r = createReservation(f.elements.machine.value, f.elements.date.value, f.elements.start.value, f.elements.end.value);
      if (!r.ok) { setFormMsg('reserveMsg', 'error', r.message); return; }
      ui.reserveMachine = null;
      toast(r.message, 'success', { label: 'View in My Laundry', nav: 'laundry' });
      render({ fresh: true });
      setFormMsg('reserveMsg', 'ok', r.message);
    }

    if (f.dataset.form === 'session') {
      const r = createSession(f.elements.machine.value, f.elements.start.value, f.elements.end.value);
      if (!r.ok) { setFormMsg('sessionMsg', 'error', r.message); return; }
      ui.laundryMachine = null; ui.endEdited = false;
      toast(r.message, 'success');
      render({ fresh: true });
    }

    if (f.dataset.form === 'prefs') {
      state.prefs = {
        remindBeforeEnd: f.elements.pfRemind.checked,
        remindMinutes: f.elements.pfMinutes.value,
        queueAlert: f.elements.pfQueue.checked,
        reservationReminder: f.elements.pfRes.checked
      };
      saveState();
      toast('Preferences saved (simulated).', 'success');
    }
  });

  window.addEventListener('hashchange', function () { render(); });

  /* =========================================================
   * 9. Start
   * ======================================================= */
  function init() {
    state = loadState();
    if (!state) { state = buildSeed(); }
    refreshStatuses();
    reconcileMachines();
    saveState();
    render({ fresh: true });
    setInterval(tick, 15000);
  }

  init();
})();
