
(function () {
  "use strict";

  var PALETTE = [
    "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f", "#edc948",
    "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac", "#6c5b7b", "#c55a11"
  ];
  var STORE_KEY = "enroll_calendar_entries";

  /* Timeline window: 8:00 AM – 8:00 PM (minutes from midnight) */
  var DAY_START_MIN = 8 * 60;    // 480
  var DAY_END_MIN = 20 * 60;     // 1200
  var DAY_SPAN_MIN = DAY_END_MIN - DAY_START_MIN; // 720

  var cal = document.getElementById("calendar");
  var historyList = document.getElementById("historyList");
  var conflictsList = document.getElementById("conflictsList");
  var semesterCreditEl = document.getElementById("semesterCredit");
  var monthTitle = document.getElementById("monthTitle");
  var statusEl = document.getElementById("status");
  var inputText = document.getElementById("inputText");
  var addBtn = document.getElementById("addBtn");
  var clearAllBtn = document.getElementById("clearAll");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var todayBtn = document.getElementById("todayBtn");
  var viewToggle = document.getElementById("viewToggle");
  var viewMode = "pattern";
  var patternSem = "all";
  var patternSemEl = document.getElementById("patternSem");
  var stagedList = document.getElementById("stagedList");
  var planStatus = document.getElementById("planStatus");
  var planResultEl = document.getElementById("planResult");
  var applyPlanBtn = document.getElementById("applyPlanBtn");
  var stageBtn = document.getElementById("stageBtn");
  var stageListBtn = document.getElementById("stageListBtn");
  var findPlanBtn = document.getElementById("findPlanBtn");
  var clearPlanBtn = document.getElementById("clearPlanBtn");

  window.onerror = function (msg, src, line) {
    if (statusEl) {
      statusEl.textContent = "Error: " + msg + " (line " + line + ")";
      statusEl.className = "error";
    }
    return false;
  };

  var stagedCourses = [];
  var locks = {};
  var planResult = null;
  var planMode = "standard";
  var holidays = [];
  var PLANNER_KEY = "enroll_planner_courses";
  var PLANNER_LOCK_KEY = "enroll_planner_locks";
  var PLANNER_MODE_KEY = "enroll_planner_mode";
  var PLANNER_HOLIDAY_KEY = "enroll_planner_holidays";
  var APP_VERSION = "v13";
  var planModeEl = document.getElementById("planMode");
  var holidayInput = document.getElementById("holidayInput");
  var holidayAddBtn = document.getElementById("holidayAddBtn");
  var holidayListEl = document.getElementById("holidayList");
  var appVersionEl = document.getElementById("appVersion");

  var entries = load();
  var viewDate = anchorToFirst();

  /* ---------- utilities ---------- */

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "e" + Date.now() + "-" + Math.floor(Math.random() * 1e9);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return arr.map(function (e) {
        return {
          id: e.id, section: e.section, component: e.component, topic: e.topic,
          days: e.days, dayStr: e.dayStr, timeStr: e.timeStr, room: e.room,
          instructor: e.instructor, startMin: e.startMin, endMin: e.endMin,
          start: new Date(e.start), end: new Date(e.end), course: e.course || null,
          batchId: e.batchId || e.id || null, sem: e.sem || null
        };
      });
    } catch (e) { return []; }
  }

  function save() {
    var data = entries.map(function (e) {
      return {
        id: e.id, section: e.section, component: e.component, topic: e.topic,
        days: e.days, dayStr: e.dayStr, timeStr: e.timeStr, room: e.room,
        instructor: e.instructor, startMin: e.startMin, endMin: e.endMin,
        start: e.start.getTime(), end: e.end.getTime(), course: e.course || null,
        batchId: e.batchId || e.id, sem: e.sem || null
      };
    });
    try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) {}
  }

  function parseDate(s) {
    var m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return null;
    return new Date(+m[3], +m[2] - 1, +m[1]);
  }

  function parseTime(t) {
    var m = String(t).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!m) return null;
    var h = +m[1], min = +m[2];
    var ap = (m[3] || "").toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return h * 60 + min;
  }

  var DAY_CODES = { M: 1, T: 2, W: 3, F: 5 };

  function parseDays(str) {
    var out = [];
    var s = String(str);
    while (s.length) {
      if (s.indexOf("Th") === 0) { out.push(4); s = s.slice(2); }
      else if (s.indexOf("Sa") === 0) { out.push(6); s = s.slice(2); }
      else if (s.indexOf("Su") === 0) { out.push(0); s = s.slice(2); }
      else if (DAY_CODES[s[0]] !== undefined) { out.push(DAY_CODES[s[0]]); s = s.slice(1); }
      else break;
    }
    return out;
  }

  function fmtTime(m) {
    if (m == null) return "";
    var h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? "PM" : "AM";
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + ":" + ("0" + mm).slice(-2) + ap;
  }

  function fmtDate(d) {
    return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
  }

  function dateKey(d) {
    return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
  }

  /* ---------- parsing input ---------- */

  var SECTION_RE = /^[\w./-]+-[\w./-]+(\s*\(\d+\))?$/;
  var TIME_ONLY_RE = /^\d{1,2}:\d{2}\s*[APap]M\s*$/;
  var RANGE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}$/;
  var DAYS_HEADER_RE = /^days\s+start\s+end\s+room\s+instructor\s+dates$/i;
  var COURSE_TITLE_RE = /^([A-Z]{2,6})\s*(\d{4})\s*-\s*\((\d+(?:\.\d+)?)\)/;
  var UNITS_NUM_RE = /^(\d+(?:\.\d+)?)$/;

  function detectCourse(lines) {
    var end = lines.length;
    for (var i = 0; i < lines.length; i++) {
      if (DAYS_HEADER_RE.test(lines[i]) || /^section\s+component\s+topic/i.test(lines[i])) {
        end = i;
        break;
      }
    }
    var code = null, name = "", credits = null;
    for (var j = 0; j < end; j++) {
      var m = lines[j].match(COURSE_TITLE_RE);
      if (m) {
        code = m[1] + " " + m[2];
        name = lines[j].slice(lines[j].indexOf(")") + 1).trim();
        credits = parseFloat(m[3]);
        break;
      }
    }
    if (credits == null) {
      for (var k = 0; k < end - 2; k++) {
        if (/^units$/i.test(lines[k]) && /^units$/i.test(lines[k + 1]) && UNITS_NUM_RE.test(lines[k + 2])) {
          credits = parseFloat(lines[k + 2]);
          break;
        }
      }
    }
    return code ? { code: code, name: name, credits: credits } : null;
  }

  function lastSectionLabel(buf) {
    for (var i = buf.length - 1; i >= 0; i--) {
      if (SECTION_RE.test(buf[i])) return buf[i];
    }
    return "";
  }

  function parseBlocks(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
    if (lines.length && /section/i.test(lines[0])) lines.shift();
    var course = detectCourse(lines);
    var blocks = [];
    var buf = [];
    var currentSection = "";
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (RANGE_RE.test(line)) {
        var b;
        if (buf.length >= 5 && TIME_ONLY_RE.test(buf[buf.length - 3])) {
          // Section Details format: Days, Start, End, Room, Instructor, Dates
          var sec = currentSection || lastSectionLabel(buf);
          b = {
            section: sec, component: "", topic: sec, course: course,
            daysTime: buf[buf.length - 5] + " " + buf[buf.length - 4] + " - " + buf[buf.length - 3],
            room: buf[buf.length - 2], instructor: buf[buf.length - 1], range: line
          };
        } else {
          // Original format: [Section, Component,] Topic, Days & Times, Room, Instructor, Dates
          var o = { section: "", component: "", topic: "", daysTime: "", room: "", instructor: "", range: line, course: course };
          if (buf.length >= 4) {
            o.instructor = buf[buf.length - 1];
            o.room = buf[buf.length - 2];
            o.daysTime = buf[buf.length - 3];
            o.topic = buf[buf.length - 4];
            var rest = buf.slice(0, buf.length - 4);
            if (rest.length >= 2) { o.component = rest[rest.length - 1]; o.section = rest[rest.length - 2]; }
            else if (rest.length === 1) { o.section = rest[0]; }
          }
          b = o;
        }
        blocks.push(b);
        buf = [];
      } else if (DAYS_HEADER_RE.test(line)) {
        var lbl = lastSectionLabel(buf);
        if (lbl) currentSection = lbl;
        buf = [];
      } else {
        buf.push(line);
      }
    }
    return blocks;
  }

  function blockToEntry(b, id) {
    var tokens = b.daysTime.split(/\s+/);
    var days = [];
    var idx = 0;
    while (idx < tokens.length) {
      var d = parseDays(tokens[idx]);
      if (d.length) { days = days.concat(d); idx++; }
      else break;
    }
    var timeStr = idx > 0 ? tokens.slice(idx).join(" ") : b.daysTime;
    var tm = timeStr.match(/(\d{1,2}:\d{2}\s*[APap]M)\s*-\s*(\d{1,2}:\d{2}\s*[APap]M)/);
    var startMin = tm ? parseTime(tm[1]) : null;
    var endMin = tm ? parseTime(tm[2]) : null;

    var parts = b.range.split("-");
    var start = parseDate(parts[0]);
    var end = parseDate((parts[1] || parts[0]).trim());
    if (start && end && start > end) { var tmp = start; start = end; end = tmp; }

    return {
      id: id, section: b.section, component: b.component, topic: b.topic,
      days: days, dayStr: tokens.slice(0, idx).join(" "), timeStr: timeStr,
      room: b.room, instructor: b.instructor, startMin: startMin, endMin: endMin,
      start: start, end: end, course: b.course || null
    };
  }

  function validEntry(e) {
    return e && e.start && e.end && e.startMin != null && e.endMin != null && e.days.length > 0;
  }

  /* ---------- scheduling ---------- */

  function occurrences(e) {
    var out = [];
    var cur = new Date(e.start);
    while (cur <= e.end) {
      if (e.days.indexOf(cur.getDay()) !== -1) out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function datesOverlap(a, b) {
    var s = a.start > b.start ? a.start : b.start;
    var e = a.end < b.end ? a.end : b.end;
    return s <= e;
  }

  function computeConflicts() {
    var map = {};
    entries.forEach(function (e) {
      occurrences(e).forEach(function (o) {
        var k = dateKey(o);
        (map[k] = map[k] || []).push({ e: e, o: o });
      });
    });
    var out = [];
    for (var k in map) {
      var list = map[k];
      for (var i = 0; i < list.length; i++) {
        for (var j = i + 1; j < list.length; j++) {
          var a = list[i], b = list[j];
          if (a.e.id === b.e.id) continue;
          if (a.e.startMin < b.e.endMin && b.e.startMin < a.e.endMin) {
            /* Skip false conflicts between duplicate copies of the same
               session (same topic, same day & time, overlapping dates). */
            if (a.e.topic === b.e.topic &&
                a.e.startMin === b.e.startMin &&
                a.e.endMin === b.e.endMin &&
                datesOverlap(a.e, b.e)) {
              continue;
            }
            out.push({
              a: a.e, b: b.e, date: new Date(a.o),
              overlapStart: Math.max(a.e.startMin, b.e.startMin),
              overlapEnd: Math.min(a.e.endMin, b.e.endMin)
            });
          }
        }
      }
    }
    return out;
  }

  /* ---------- rendering ---------- */

  function colorOf(entry) {
    return PALETTE[entries.indexOf(entry) % PALETTE.length];
  }

  function courseLabel(e) {
    var code = e.course && e.course.code ? e.course.code : "";
    var t = e.topic || "";
    return (code && t.indexOf(code) !== 0 ? code + " " : "") + t;
  }

  function chipHeight(durMin) {
    if (!durMin || durMin <= 0) durMin = 50;
    var h = Math.round(16 + durMin * 0.28);
    return Math.max(18, Math.min(h, 72));
  }

  function fmtClock(m) {
    var h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? "PM" : "AM";
    var hh = h % 12; if (hh === 0) hh = 12;
    return hh + (mm ? ":" + ("0" + mm).slice(-2) : "") + ap;
  }

  /* Greedy column layout for overlapping blocks on a single day.
     Returns [{ e, col, cols }] — cols = number of columns the widest
     overlap group needs, so overlapping entries sit side by side. */
  function layoutOverlaps(evs) {
    var sorted = evs.slice().sort(function (a, b) {
      return a.startMin - b.startMin || a.endMin - b.endMin;
    });
    var clusters = [];
    var cur = null, curEnd = -1;
    sorted.forEach(function (e) {
      if (!cur || e.startMin >= curEnd) {
        cur = [];
        curEnd = e.endMin;
        clusters.push(cur);
      }
      if (e.endMin > curEnd) curEnd = e.endMin;
      cur.push(e);
    });

    var result = [];
    clusters.forEach(function (cluster) {
      var colEnds = [];
      var placed = [];
      cluster.forEach(function (e) {
        var col = -1;
        for (var c = 0; c < colEnds.length; c++) {
          if (colEnds[c] <= e.startMin) { col = c; break; }
        }
        if (col === -1) { col = colEnds.length; colEnds.push(e.endMin); }
        else { colEnds[col] = e.endMin; }
        placed.push({ e: e, col: col });
      });
      var cols = Math.max(1, colEnds.length);
      placed.forEach(function (p) { result.push({ e: p.e, col: p.col, cols: cols }); });
    });
    return result;
  }

  function renderWeekdays() {
    var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var el = document.getElementById("weekdays");
    el.innerHTML = "";
    names.forEach(function (n) {
      var d = document.createElement("div");
      d.textContent = n;
      el.appendChild(d);
    });
  }

  function buildDayCell(label, evs) {
    var cell = document.createElement("div");
    cell.className = "day-cell";

    var num = document.createElement("div");
    num.className = "day-num";
    num.textContent = label;
    cell.appendChild(num);

    /* Timeline: 8 AM – 8 PM grid */
    var tl = document.createElement("div");
    tl.className = "tl";
    for (var hh = DAY_START_MIN; hh <= DAY_END_MIN; hh += 60) {
      var line = document.createElement("div");
      line.className = "hour-line";
      line.style.top = ((hh - DAY_START_MIN) / DAY_SPAN_MIN * 100) + "%";
      if (hh < DAY_END_MIN) {
        var lbl = document.createElement("span");
        lbl.className = "label";
        lbl.textContent = fmtClock(hh);
        line.appendChild(lbl);
      }
      tl.appendChild(line);

      var half = document.createElement("div");
      half.className = "hour-line";
      half.style.top = (((hh + 30) - DAY_START_MIN) / DAY_SPAN_MIN * 100) + "%";
      half.style.background = "#f7f8fa";
      tl.appendChild(half);
    }

    layoutOverlaps(evs || []).forEach(function (item) {
      var e = item.e;
      var topPct = Math.max(0, (e.startMin - DAY_START_MIN) / DAY_SPAN_MIN * 100);
      var botPct = Math.min(100, (e.endMin - DAY_START_MIN) / DAY_SPAN_MIN * 100);
      var hPct = Math.max(1.2, botPct - topPct);
      var wPct = 100 / item.cols;
      var block = document.createElement("div");
      block.className = "week-block";
      block.style.background = colorOf(e);
      block.style.top = topPct + "%";
      block.style.height = hPct + "%";
      block.style.left = (item.col * wPct) + "%";
      block.style.width = wPct + "%";
      var dur = e.endMin - e.startMin;
      block.title = e.topic + " \u00b7 " + e.dayStr + " " + e.timeStr + " \u00b7 " + e.room +
        " (" + Math.round(dur) + " min)";
      block.textContent = fmtClock(e.startMin) + "\u2013" + fmtClock(e.endMin) + " " + e.topic;
      tl.appendChild(block);
    });

    cell.appendChild(tl);
    return cell;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function collectDayData() {
    var occMap = {};
    entries.forEach(function (e) {
      occurrences(e).forEach(function (o) {
        var k = dateKey(o);
        (occMap[k] = occMap[k] || []).push(e);
      });
    });
    var conflicts = computeConflicts();
    var conflictDays = {};
    conflicts.forEach(function (c) { conflictDays[dateKey(c.date)] = true; });
    return { occMap: occMap, conflictDays: conflictDays };
  }

  function weekLabel() {
    var ws = startOfWeek(viewDate);
    var we = new Date(ws); we.setDate(we.getDate() + 6);
    return ws.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " \u2013 " +
      we.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function patternSlots() {
    var map = {};
    entries.forEach(function (e) {
      if (patternSem !== "all" && String(e.sem == null ? semOfEntry(e) : e.sem) !== String(patternSem)) return;
      e.days.forEach(function (d) {
        if (!map[d]) map[d] = {};
        var key = d + "|" + e.startMin + "|" + e.endMin + "|" + e.topic;
        if (!map[d][key]) map[d][key] = e;
      });
    });
    var out = [];
    for (var d = 0; d < 7; d++) {
      out[d] = map[d] ? Object.keys(map[d]).map(function (k) { return map[d][k]; }) : [];
    }
    return out;
  }

  function semOfEntry(e) {
    if (e.sem) return e.sem;
    if (!e.start) return 1;
    var mo = e.start.getMonth();
    return (mo >= 0 && mo <= 4) ? 2 : 1;
  }

  function renderPattern() {
    var names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    cal.className = "calendar pattern";
    monthTitle.textContent = "Weekly Pattern" + (patternSem === "all" ? "" : " \u2014 Sem " + patternSem);
    prevBtn.style.display = "none";
    nextBtn.style.display = "none";
    todayBtn.style.display = "none";
    if (patternSemEl) patternSemEl.style.display = "";
    var wd = document.getElementById("weekdays");
    if (wd) wd.classList.add("hidden");
    var slots = patternSlots();
    cal.innerHTML = "";
    for (var d = 0; d < 7; d++) {
      var cell = buildDayCell(names[d], slots[d]);
      cal.appendChild(cell);
    }
  }

  function renderMonth() {
    var today = new Date();
    var data = collectDayData();
    cal.className = "calendar";
    monthTitle.textContent = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
    prevBtn.style.display = "";
    nextBtn.style.display = "";
    todayBtn.style.display = "";
    var wd = document.getElementById("weekdays");
    if (wd) wd.classList.remove("hidden");
    if (patternSemEl) patternSemEl.style.display = "none";
    prevBtn.title = "Previous month";
    nextBtn.title = "Next month";
    var y = viewDate.getFullYear(), m = viewDate.getMonth();
    var first = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    cal.innerHTML = "";
    for (var i = 0; i < first + daysInMonth; i++) {
      var day = i - first + 1;
      if (day < 1) {
        var ec = document.createElement("div");
        ec.className = "day-cell empty";
        cal.appendChild(ec);
        continue;
      }
      var k = y + "-" + m + "-" + day;
      var cell = buildDayCell(day, data.occMap[k] || []);
      if (data.conflictDays[k]) {
        cell.classList.add("has-conflict");
        var dot = document.createElement("div");
        dot.className = "conflict-dot";
        dot.title = "Time conflict on this day";
        cell.appendChild(dot);
      }
      if (y === today.getFullYear() && m === today.getMonth() && day === today.getDate()) {
        cell.classList.add("today");
      }
      cal.appendChild(cell);
    }
  }

  function renderCalendar() {
    if (viewMode === "pattern") {
      renderPattern();
      return;
    }
    renderMonth();
  }

  function batchGrouping() {
    var groups = [];
    var map = {};
    entries.forEach(function (e) {
      var key = e.batchId || e.id;
      var g = map[key];
      if (!g) { g = map[key] = { id: key, sessions: [] }; groups.push(g); }
      g.sessions.push(e);
    });
    groups.forEach(function (g) {
      g.sessions.sort(function (a, b) { return a.startMin - b.startMin || a.start - b.start; });
      g.course = g.sessions[0].course;
      g.first = g.sessions[0].start;
      g.last = g.sessions[0].end;
      g.sessions.forEach(function (e) {
        if (e.start < g.first) g.first = e.start;
        if (e.end > g.last) g.last = e.end;
      });
    });
    groups.sort(function (a, b) { return a.first - b.first; });
    return groups;
  }

  function renderHistory() {
    historyList.innerHTML = "";
    var groups = batchGrouping();
    if (!groups.length) {
      var none = document.createElement("li");
      none.className = "none";
      none.textContent = "No entries yet.";
      historyList.appendChild(none);
      return;
    }

    groups.forEach(function (g) {
      var li = document.createElement("li");
      li.className = "hist-item batch";

      var head = document.createElement("div");
      head.className = "hist-head";

      var sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = colorOf(g.sessions[0]);

      var info = document.createElement("div");
      info.className = "hist-info";
      var t = document.createElement("div");
      t.className = "hist-topic";
      var raw = g.sessions[0].topic;
      var title = (g.course && g.course.code && raw.indexOf(g.course.code) !== 0 ? g.course.code + " " : "") + raw;
      t.textContent = title;
      var meta = document.createElement("div");
      meta.className = "hist-meta";
      meta.textContent = (g.course && g.course.name ? g.course.name + " \u00b7 " : "") +
        fmtDate(g.first) + " \u2013 " + fmtDate(g.last) + " \u00b7 " + g.sessions.length + " session" +
        (g.sessions.length > 1 ? "s" : "");
      info.appendChild(t);
      info.appendChild(meta);

      var del = document.createElement("button");
      del.className = "del";
      del.title = "Delete this input";
      del.textContent = "\u00d7";
      del.onclick = function () {
        entries = entries.filter(function (x) { return (x.batchId || x.id) !== g.id; });
        save();
        render();
      };

      head.appendChild(sw);
      head.appendChild(info);
      head.appendChild(del);
      li.appendChild(head);

      if (g.sessions.length > 1) {
        var sub = document.createElement("ul");
        sub.className = "hist-sublist";
        g.sessions.forEach(function (e) {
          var subli = document.createElement("li");
          subli.className = "hist-item sub";
          var ssw = document.createElement("span");
          ssw.className = "swatch";
          ssw.style.background = colorOf(e);
          var sinfo = document.createElement("div");
          sinfo.className = "hist-info";
          var st = document.createElement("div");
          st.className = "hist-topic";
          st.textContent = e.topic;
          var smeta = document.createElement("div");
          smeta.className = "hist-meta";
          smeta.textContent = e.dayStr + " " + e.timeStr + " \u00b7 " + e.room +
            " \u00b7 " + fmtDate(e.start) + " \u2013 " + fmtDate(e.end);
          sinfo.appendChild(st);
          sinfo.appendChild(smeta);
          var sdel = document.createElement("button");
          sdel.className = "del";
          sdel.title = "Delete session";
          sdel.textContent = "\u00d7";
          sdel.onclick = function () {
            entries = entries.filter(function (x) { return x.id !== e.id; });
            save();
            render();
          };
          subli.appendChild(ssw);
          subli.appendChild(sinfo);
          subli.appendChild(sdel);
          sub.appendChild(subli);
        });
        li.appendChild(sub);
      }

      historyList.appendChild(li);
    });
  }

  function renderConflicts() {
    var groups = {};
    computeConflicts().forEach(function (c) {
      var key = [c.a.id, c.b.id].sort().join("|");
      var g = groups[key];
      if (!g) { g = groups[key] = { a: c.a, b: c.b, dates: [], start: null, end: null }; }
      g.dates.push(c.date);
      if (g.start == null) { g.start = c.overlapStart; g.end = c.overlapEnd; }
    });

    conflictsList.innerHTML = "";
    var keys = Object.keys(groups);
    if (!keys.length) {
      var p = document.createElement("p");
      p.className = "none";
      p.textContent = "No conflicts. \u2705";
      conflictsList.appendChild(p);
      return;
    }
    keys.forEach(function (key) {
      var g = groups[key];
      var dates = {};
      g.dates.forEach(function (d) { dates[fmtDate(d)] = true; });
      var div = document.createElement("div");
      div.className = "conflict";
      div.innerHTML = "<b>" + esc(courseLabel(g.a)) + "</b> vs <b>" + esc(courseLabel(g.b)) + "</b> \u2014 " +
        fmtTime(g.start) + "\u2013" + fmtTime(g.end) + " on " + esc(Object.keys(dates).join(", "));
      conflictsList.appendChild(div);
    });
  }

  function semesterCredits() {
    var seen = {};
    var total = 0;
    var breakdown = [];
    entries.forEach(function (e) {
      if (e.course && e.course.code && e.course.credits != null && !seen[e.course.code]) {
        seen[e.course.code] = true;
        total += e.course.credits;
        breakdown.push({ code: e.course.code, credits: e.course.credits });
      }
    });
    return { total: total, breakdown: breakdown };
  }

  function renderSemesterCredit() {
    var sc = semesterCredits();
    if (!sc.breakdown.length) {
      semesterCreditEl.innerHTML = "";
      return;
    }
    var parts = sc.breakdown.map(function (b) {
      return b.code + " (" + b.credits + ")";
    });
    semesterCreditEl.innerHTML =
      "Semester Credits: <span class=\"credit-value\">" + sc.total + "</span>" +
      (parts.length ? " &middot; " + esc(parts.join(" + ")) : "");
  }

  /* ---------- planner ---------- */

  var COURSE_CODE_RE = /^([A-Z]{2,6})\s*(\d{4}[A-Za-z]{0,3})(?:\s+-\s*(.+))?$/;
  var SECTION_HEADER_RE = /^([A-Za-z0-9]+-[A-Za-z0-9]+)\s*\(\d+\)/;
  var DAY_TOK = "(Mo|Tu|We|Th|Fr|Sa|Su|Mon|Tue|Wed|Thu|Fri|Sat|Sun)";
  var TIME_TOK = "(\\d{1,2}:\\d{2}(?:AM|PM))";
  var DATE_TOK = "(\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\s*-\\s*\\d{1,2}\\/\\d{1,2}\\/\\d{4})";
  var SESSION_ROW_RE = new RegExp("^" + DAY_TOK + TIME_TOK + TIME_TOK + "(.+?)" + DATE_TOK + "$");
  var SESSION_ROW_TAB_RE = new RegExp("^" + DAY_TOK + "\\t" + TIME_TOK + "\\t" + TIME_TOK + "\\t(.+?)\\t(.+?)\\t" + DATE_TOK + "$");
  var SESSION_ROW_SPACE_RE = new RegExp("^" + DAY_TOK + "\\s+" + TIME_TOK + "\\s+" + TIME_TOK + "\\s+(.+?)\\s+" + DATE_TOK + "$");
  var DAY_MAP = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };

  function splitRoomInstructor(mid) {
    if (/Staff$/.test(mid)) return { room: mid.slice(0, -5), instructor: "Staff" };
    if (/^TBA$/.test(mid)) return { room: "TBA", instructor: "" };
    return { room: mid, instructor: "" };
  }

  function parseCoursePage(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
    var semM = text.match(/Sem(?:ester)?\s+([12])\b/i);
    var pageSem = semM ? +semM[1] : null;
    var courses = [];
    var cur = null;
    var curSection = null;
    var pendingUnits = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      if (/^units$/i.test(ln) && i + 1 < lines.length && /^(\d+(?:\.\d+)?)$/.test(lines[i + 1])) {
        var uv = parseFloat(lines[i + 1]);
        if (cur) { cur.units = uv; } else { pendingUnits = uv; }
        continue;
      }
      var cm = ln.match(COURSE_CODE_RE);
      if (cm) {
        if (!courses.length) {
          cur = { code: cm[1] + " " + cm[2], units: pendingUnits, name: cm[3] || "", sem: pageSem, key: "", sections: [] };
          pendingUnits = null;
          courses.push(cur);
          curSection = null;
        }
        continue;
      }
      if (!cur) continue;
      var sh = ln.match(SECTION_HEADER_RE);
      if (sh) {
        curSection = { code: sh[1], num: "", sessions: [] };
        var numM = ln.match(/\((\d+)\)/);
        if (numM) curSection.num = numM[1];
        cur.sections.push(curSection);
        continue;
      }
      if (!curSection) continue;

      /* Multi-line format: each cell on its own line, repeating
         Day / Start / End / Room / Instructor / Dates */
      var daym = ln.match(/^(Mo|Tu|We|Th|Fr|Sa|Su|Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/);
      if (daym && i + 5 < lines.length &&
          /^\d{1,2}:\d{2}(?:AM|PM)$/i.test(lines[i + 1]) &&
          /^\d{1,2}:\d{2}(?:AM|PM)$/i.test(lines[i + 2]) &&
          RANGE_RE.test(lines[i + 5])) {
        var rparts = lines[i + 5].split("-");
        curSection.sessions.push({
          dayCode: DAY_MAP[daym[1]], dayStr: daym[1],
          startMin: parseTime(lines[i + 1]), endMin: parseTime(lines[i + 2]),
          room: lines[i + 3], instructor: lines[i + 4],
          startDate: parseDate(rparts[0]), endDate: parseDate(rparts[1].trim())
        });
        i += 5;
        continue;
      }

      var sr = ln.match(SESSION_ROW_RE);
      var st = sr ? null : ln.match(SESSION_ROW_TAB_RE);
      var sp = sr || st ? null : ln.match(SESSION_ROW_SPACE_RE);
      if (sr || st || sp) {
        var m = sr || st || sp;
        var room, instructor, parts;
        if (st) {
          room = st[4]; instructor = st[5]; parts = st[6].split("-");
        } else if (sp) {
          var mid = splitRoomInstructor(sp[4]);
          room = mid.room; instructor = mid.instructor; parts = sp[5].split("-");
        } else {
          var mid = splitRoomInstructor(sr[4]);
          room = mid.room; instructor = mid.instructor; parts = sr[5].split("-");
        }
        curSection.sessions.push({
          dayCode: DAY_MAP[m[1]], dayStr: m[1],
          startMin: parseTime(m[2]), endMin: parseTime(m[3]),
          room: room, instructor: instructor,
          startDate: parseDate(parts[0]), endDate: parseDate(parts[1].trim())
        });
      }
    }
    return courses.filter(function (c) { return c.sections.length; }).map(function (c) {
      if (c.sem == null) {
        var d = null;
        for (var s = 0; s < c.sections.length && !d; s++) {
          if (c.sections[s].sessions.length) d = c.sections[s].sessions[0].startDate;
        }
        c.sem = d && d.getMonth() <= 4 ? 2 : 1;
      }
      c.key = c.code + "|" + c.sem;
      return c;
    });
  }

  /* Temporary Course List format:
     2026-27 Sem 1 Temporary Course List
     Delete  Class  Days/Times  Room  Instructor  Units  Status
     Delete
     AILT 1001-1A
     (4383)
     We 9:00AM - 9:50AM
     We 9:00AM - 9:50AM
     Centennial Campus CPD-LG.01
     Centennial Campus CPD-LG.01
     Staff
     3.00
     Open
     ... */
  var TEMP_HEADER_RE = /Temporary Course List/i;
  var TEMP_SECTION_RE = /^([A-Z]{2,6}\s*\d{4}[A-Za-z]{0,3})-([A-Za-z0-9]+)$/;
  var TEMP_DT_RE = /^(Mo|Tu|We|Th|Fr|Sa|Su|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2}:\d{2}(?:AM|PM))\s*-\s*(\d{1,2}:\d{2}(?:AM|PM))$/i;
  var TEMP_UNITS_RE = /^\d+(?:\.\d+)?$/;

  function parseTempList(text) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length; });
    var semM = text.match(/Sem(?:ester)?\s+([12])\b/i);
    var pageSem = semM ? +semM[1] : null;
    var blocks = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var sm = ln.match(TEMP_SECTION_RE);
      if (sm) {
        cur = { code: sm[1], section: sm[2], times: [], rooms: [], units: null };
        blocks.push(cur);
        continue;
      }
      if (!cur) continue;
      if (TEMP_DT_RE.test(ln)) { cur.times.push(ln); continue; }
      if (/Staff/i.test(ln)) { continue; }
      if (TEMP_UNITS_RE.test(ln) && cur.units == null) { cur.units = parseFloat(ln); continue; }
      if (/^(Open|Closed|Wait)/i.test(ln)) { continue; }
      if (TEMP_HEADER_RE.test(ln)) { cur = null; continue; }
      if (/^(Delete|Class|Days)/i.test(ln)) { cur = null; continue; }
      if (/^\(\d+\)$/.test(ln)) { continue; }
      /* remaining lines are room names (only within an active block after times) */
      if (cur.times.length) cur.rooms.push(ln);
    }

    var courses = [];
    blocks.forEach(function (b) {
      if (!b.times.length) return;
      var sec = { code: b.section, num: "", sessions: [] };
      var seen = {};
      for (var t = 0; t < b.times.length; t++) {
        var tm = b.times[t].match(TEMP_DT_RE);
        if (!tm) continue;
        var dkey = tm[1] + "|" + parseTime(tm[2]) + "|" + parseTime(tm[3]);
        if (seen[dkey]) continue;
        seen[dkey] = true;
        var room = b.rooms[Math.min(t, b.rooms.length - 1)] || "";
        sec.sessions.push({
          dayCode: DAY_MAP[tm[1]], dayStr: tm[1],
          startMin: parseTime(tm[2]), endMin: parseTime(tm[3]),
          room: room, instructor: "Staff",
          startDate: null, endDate: null
        });
      }
      var existing = courses.filter(function (c) { return c.code === b.code; })[0];
      if (existing) { existing.sections.push(sec); }
      else {
        var c = { code: b.code, units: b.units, name: "", sem: pageSem, key: "", sections: [sec] };
        courses.push(c);
      }
    });

    return courses.map(function (c) {
      if (c.sem == null) c.sem = 1;
      c.key = c.code + "|" + c.sem;
      return c;
    });
  }

  function sessionConflict(a, b) {
    if (a.dayCode !== b.dayCode) return false;
    if (a.endMin <= b.startMin || b.endMin <= a.startMin) return false;
    if (!a.startDate || !b.startDate) return true;
    var s = a.startDate > b.startDate ? a.startDate : b.startDate;
    var e = a.endDate < b.endDate ? a.endDate : b.endDate;
    return s <= e;
  }

  function sectionsConflict(s1, s2) {
    for (var i = 0; i < s1.sessions.length; i++) {
      for (var j = 0; j < s2.sessions.length; j++) {
        if (sessionConflict(s1.sessions[i], s2.sessions[j])) return true;
      }
    }
    return false;
  }

  function sessionSummary(sec) {
    var uniq = [];
    sec.sessions.forEach(function (x) {
      var v = x.dayStr + " " + fmtTime(x.startMin) + "\u2013" + fmtTime(x.endMin);
      if (uniq.indexOf(v) === -1) uniq.push(v);
    });
    return uniq.join(" + ");
  }

  function prepSections() {
    stagedCourses.forEach(function (c) {
      c.sections.forEach(function (s) {
        s._minByDay = [0, 0, 0, 0, 0, 0, 0];
        s._totalMin = 0;
        s._holidayMin = 0;
        s.sessions.forEach(function (ss) {
          var dur = ss.endMin - ss.startMin;
          s._minByDay[ss.dayCode] += dur;
          s._totalMin += dur;
        });
        holidays.forEach(function (h) {
          s.sessions.forEach(function (ss) {
            if (ss.startDate && ss.endDate && h >= ss.startDate && h <= ss.endDate && h.getDay() === ss.dayCode) {
              s._holidayMin += (ss.endMin - ss.startMin);
            }
          });
        });
      });
    });
  }

  function ssdOf(loads) {
    var mean = 0, d;
    for (d = 0; d < 7; d++) mean += loads[d];
    mean /= 7;
    var ssd = 0;
    for (d = 0; d < 7; d++) { var v = loads[d] - mean; ssd += v * v; }
    return ssd;
  }

  /* Weighted score: conflicts always dominate, then the secondary objective
     (holiday minutes first, then daily-load balance). */
  function scoreForMode(conflicts, holidayMin, loads) {
    var base = conflicts * 1000000000;
    if (planMode === "standard") return base;
    if (planMode === "holidays") return base + holidayMin * 1000000 + ssdOf(loads);
    return base + ssdOf(loads); /* balanced */
  }

  function secondaryOf(assign) {
    if (planMode === "standard") return 0;
    var hol = 0, loads = [0, 0, 0, 0, 0, 0, 0];
    stagedCourses.forEach(function (c) {
      var si = assign[c.key];
      if (si == null) return;
      var sec = c.sections[si];
      hol += sec._holidayMin;
      for (var d = 0; d < 7; d++) loads[d] += sec._minByDay[d];
    });
    return (planMode === "holidays" ? hol * 1000000 : 0) + ssdOf(loads);
  }

  function findSchedule() {
    var n = stagedCourses.length;
    if (!n) return { assign: null, conflicts: Infinity, secondary: Infinity };
    prepSections();
    var order = [];
    for (var i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) {
      var la = locks[stagedCourses[a].key] != null ? 0 : 1;
      var lb = locks[stagedCourses[b].key] != null ? 0 : 1;
      if (la !== lb) return la - lb;
      return stagedCourses[a].sections.length - stagedCourses[b].sections.length;
    });

    /* Phase 1: exact zero-conflict search, keeping the best secondary score */
    var best = null;
    (function () {
      var cur = {};
      var nodes = 0, BUDGET = 250000;
      function dfs(pos) {
        if (nodes++ > BUDGET) return;
        if (pos === order.length) {
          var sec = secondaryOf(cur);
          if (!best || sec < best.secondary) best = { assign: Object.assign({}, cur), secondary: sec };
          return;
        }
        var ci = order[pos];
        var c = stagedCourses[ci];
        var opts = locks[c.key] != null ? [locks[c.key]] : c.sections.map(function (_, j) { return j; });
        opts.sort(function (a, b) {
          var ka = planMode === "holidays" ? c.sections[a]._holidayMin : c.sections[a]._totalMin;
          var kb = planMode === "holidays" ? c.sections[b]._holidayMin : c.sections[b]._totalMin;
          return ka - kb;
        });
        for (var k = 0; k < opts.length; k++) {
          var si = opts[k];
          var ok = true;
          for (var p = 0; p < pos; p++) {
            var pci = order[p];
            var pkey = stagedCourses[pci].key;
            if (cur[pkey] == null) continue;
            if (sectionsConflict(stagedCourses[pci].sections[cur[pkey]], c.sections[si])) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          cur[c.key] = si;
          dfs(pos + 1);
          delete cur[c.key];
          if (nodes > BUDGET) return;
        }
      }
      dfs(0);
    })();
    if (best) return { assign: best.assign, conflicts: 0, secondary: best.secondary };

    /* Phase 2: no zero-conflict combo — greedy + incremental local search on the score */
    var cur = {};
    var loads = [0, 0, 0, 0, 0, 0, 0];
    var conflicts = 0, holidayTotal = 0;
    order.forEach(function (ci) {
      var c = stagedCourses[ci];
      var opts = locks[c.key] != null ? [locks[c.key]] : c.sections.map(function (_, j) { return j; });
      var bestSi = opts[0], bestScore = Infinity;
      opts.forEach(function (si) {
        var sec = c.sections[si];
        var addC = 0;
        order.forEach(function (pci) {
          if (pci === ci || cur[stagedCourses[pci].key] == null) return;
          if (sectionsConflict(stagedCourses[pci].sections[cur[stagedCourses[pci].key]], sec)) addC++;
        });
        var tLoads = loads.slice();
        for (var d = 0; d < 7; d++) tLoads[d] += sec._minByDay[d];
        var sc = scoreForMode(conflicts + addC, holidayTotal + sec._holidayMin, tLoads);
        if (sc < bestScore) { bestScore = sc; bestSi = si; }
      });
      cur[c.key] = bestSi;
      var picked = c.sections[bestSi];
      for (var d2 = 0; d2 < 7; d2++) loads[d2] += picked._minByDay[d2];
      holidayTotal += picked._holidayMin;
      order.forEach(function (pci) {
        if (pci === ci || cur[stagedCourses[pci].key] == null) return;
        if (sectionsConflict(stagedCourses[pci].sections[cur[stagedCourses[pci].key]], picked)) conflicts++;
      });
    });

    var currentScore = scoreForMode(conflicts, holidayTotal, loads);
    var improved = true, iters = 0;
    while (improved && iters++ < 400) {
      improved = false;
      for (var a = 0; a < order.length; a++) {
        var ci = order[a];
        if (locks[stagedCourses[ci].key] != null) continue;
        var c = stagedCourses[ci];
        var curSi = cur[c.key];
        for (var j = 0; j < c.sections.length; j++) {
          if (j === curSi) continue;
          var aSec = c.sections[curSi], jSec = c.sections[j];
          var deltaC = 0;
          for (var b = 0; b < order.length; b++) {
            if (b === a) continue;
            var bc = stagedCourses[order[b]];
            var bkey = bc.key;
            if (cur[bkey] == null) continue;
            var bSec = bc.sections[cur[bkey]];
            if (sectionsConflict(jSec, bSec)) deltaC++;
            if (sectionsConflict(aSec, bSec)) deltaC--;
          }
          var nConf = conflicts + deltaC;
          var nLoads = loads.slice();
          for (var d3 = 0; d3 < 7; d3++) nLoads[d3] += (jSec._minByDay[d3] - aSec._minByDay[d3]);
          var nHol = holidayTotal + (jSec._holidayMin - aSec._holidayMin);
          var nScore = scoreForMode(nConf, nHol, nLoads);
          if (nScore < currentScore) {
            cur[c.key] = j;
            conflicts = nConf; holidayTotal = nHol; loads = nLoads;
            currentScore = nScore;
            improved = true;
            break;
          }
        }
      }
    }
    return { assign: cur, conflicts: conflicts, secondary: secondaryOf(cur) };
  }

  function fmtMin(m) {
    if (!m || m <= 0) return "0h";
    var h = Math.floor(m / 60), mm = m % 60;
    return h + "h" + (mm ? " " + mm + "m" : "");
  }

  function planStats(assign) {
    var perSem = { 1: { loads: [0, 0, 0, 0, 0, 0, 0], total: 0, active: 0 }, 2: { loads: [0, 0, 0, 0, 0, 0, 0], total: 0, active: 0 } };
    stagedCourses.forEach(function (c) {
      var si = assign[c.key];
      if (si == null) return;
      var md = c.sections[si]._minByDay;
      var box = perSem[c.sem] || perSem[1];
      for (var d = 0; d < 7; d++) { box.loads[d] += md[d]; box.total += md[d]; }
    });
    perSem[1].active = perSem[1].loads.filter(function (v) { return v > 0; }).length;
    perSem[2].active = perSem[2].loads.filter(function (v) { return v > 0; }).length;
    var holDates = [], holidayTotal = 0;
    holidays.forEach(function (h) {
      var on = false;
      stagedCourses.forEach(function (c) {
        if (on) return;
        var si = assign[c.key];
        if (si == null) return;
        c.sections[si].sessions.forEach(function (ss) {
          if (ss.startDate && ss.endDate && h >= ss.startDate && h <= ss.endDate && h.getDay() === ss.dayCode) {
            on = true;
            holidayTotal += (ss.endMin - ss.startMin);
          }
        });
      });
      if (on) holDates.push(fmtDate(h));
    });
    perSem[1].avg = perSem[1].active ? perSem[1].total / perSem[1].active : 0;
    perSem[2].avg = perSem[2].active ? perSem[2].total / perSem[2].active : 0;
    return { perSem: perSem, holDates: holDates, holidayTotal: holidayTotal };
  }

  function planToEntries(assign) {
    var out = [];
    var planBatch = "plan-" + uid();
    stagedCourses.forEach(function (c) {
      var si = assign[c.key];
      if (si == null) return;
      var sec = c.sections[si];
      sec.sessions.forEach(function (ss) {
        var start, end;
        if (ss.startDate && ss.endDate) {
          start = new Date(ss.startDate);
          end = new Date(ss.endDate);
        } else {
          /* No explicit dates (temp list): use the semester window */
          start = c.sem === 2 ? new Date(2027, 0, 1) : new Date(2026, 8, 1);
          end = c.sem === 2 ? new Date(2027, 3, 30) : new Date(2026, 11, 31);
        }
        out.push({
          id: uid(), section: sec.code, component: "", topic: c.code + " " + sec.code,
          days: [ss.dayCode], dayStr: ss.dayStr,
          timeStr: fmtTime(ss.startMin) + " - " + fmtTime(ss.endMin),
          room: ss.room, instructor: ss.instructor,
          startMin: ss.startMin, endMin: ss.endMin,
          start: start, end: end,
          course: { code: c.code, name: c.name, credits: c.units },
          batchId: planBatch, sem: c.sem || 1
        });
      });
    });
    return out;
  }

  function savePlanner() {
    var data = stagedCourses.map(function (c) {
      return {
        code: c.code, units: c.units, name: c.name, sem: c.sem || 1,
        sections: c.sections.map(function (s) {
          return {
            code: s.code, num: s.num,
            sessions: s.sessions.map(function (x) {
              return {
                dayCode: x.dayCode, dayStr: x.dayStr, startMin: x.startMin, endMin: x.endMin,
                room: x.room, instructor: x.instructor,
                startDate: x.startDate ? x.startDate.getTime() : null,
                endDate: x.endDate ? x.endDate.getTime() : null
              };
            })
          };
        })
      };
    });
    try { localStorage.setItem(PLANNER_KEY, JSON.stringify(data)); } catch (e) {}
    try { localStorage.setItem(PLANNER_LOCK_KEY, JSON.stringify(locks)); } catch (e) {}
    try { localStorage.setItem(PLANNER_MODE_KEY, planMode); } catch (e) {}
    try { localStorage.setItem(PLANNER_HOLIDAY_KEY, JSON.stringify(holidays.map(function (h) { return h.getTime(); }))); } catch (e) {}
  }

  function loadPlanner() {
    try {
      var raw = localStorage.getItem(PLANNER_KEY);
      if (raw) {
        stagedCourses = JSON.parse(raw).map(function (c) {
          var sem = c.sem || 1;
          var obj = {
            code: c.code, units: c.units, name: c.name || "", sem: sem, key: c.code + "|" + sem,
            sections: c.sections.map(function (s) {
              return {
                code: s.code, num: s.num || "",
                sessions: s.sessions.map(function (x) {
                  return {
                    dayCode: x.dayCode, dayStr: x.dayStr, startMin: x.startMin, endMin: x.endMin,
                    room: x.room, instructor: x.instructor,
                    startDate: x.startDate ? new Date(x.startDate) : null,
                    endDate: x.endDate ? new Date(x.endDate) : null
                  };
                })
              };
            })
          };
          return obj;
        });
      }
    } catch (e) { stagedCourses = []; }
    try { locks = JSON.parse(localStorage.getItem(PLANNER_LOCK_KEY) || "{}"); } catch (e) { locks = {}; }
    try { planMode = localStorage.getItem(PLANNER_MODE_KEY) || "standard"; } catch (e) { planMode = "standard"; }
    if (planModeEl) planModeEl.value = planMode;
    try {
      var rawH = localStorage.getItem(PLANNER_HOLIDAY_KEY);
      holidays = rawH ? JSON.parse(rawH).map(function (t) { return new Date(t); }) : [];
    } catch (e) { holidays = []; }
    renderHolidayList();
  }

  function renderHolidayList() {
    holidayListEl.innerHTML = "";
    if (!holidays.length) return;
    var wrap = document.createElement("div");
    wrap.className = "holiday-list";
    holidays.forEach(function (h) {
      var chip = document.createElement("span");
      chip.className = "holiday-chip";
      chip.textContent = fmtDate(h);
      var x = document.createElement("button");
      x.className = "x";
      x.textContent = "\u00d7";
      x.title = "Remove holiday";
      x.onclick = function (d) {
        return function () {
          holidays = holidays.filter(function (y) { return y.getTime() !== d.getTime(); });
          planResult = null;
          savePlanner();
          renderHolidayList();
          renderPlanner();
          renderPlanResult();
        };
      }(h);
      chip.appendChild(x);
      wrap.appendChild(chip);
    });
    holidayListEl.appendChild(wrap);
  }

  function renderPlanner() {
    stagedList.innerHTML = "";
    planStatus.innerHTML = "";
    if (!stagedCourses.length) {
      var p = document.createElement("p");
      p.className = "none";
      p.textContent = "No courses staged yet. Paste a course page and press \u201cStage Course\u201d.";
      stagedList.appendChild(p);
    } else {
      var groups = { 1: [], 2: [] };
      stagedCourses.forEach(function (c) { groups[c.sem === 2 ? 2 : 1].push(c); });
      [1, 2].forEach(function (sem) {
        var list = groups[sem];
        if (!list.length) return;
        var ghead = document.createElement("div");
        ghead.className = "plan-group";
        ghead.textContent = "Semester " + sem;
        stagedList.appendChild(ghead);
        list.forEach(function (c, ci) {
          var card = document.createElement("div");
          card.className = "staged-course";
          var head = document.createElement("div");
          head.className = "staged-head";
          var sw = document.createElement("span");
          sw.className = "swatch";
          sw.style.background = PALETTE[ci % PALETTE.length];
          var info = document.createElement("div");
          info.className = "hist-info";
          var t = document.createElement("div");
          t.className = "hist-topic";
          t.textContent = c.code + (c.units != null ? " \u00b7 " + c.units + " units" : "");
          var meta = document.createElement("div");
          meta.className = "hist-meta";
          meta.textContent = c.sections.length + " section" + (c.sections.length > 1 ? "s" : "");
          info.appendChild(t); info.appendChild(meta);
          var del = document.createElement("button");
          del.className = "del";
          del.title = "Remove course";
          del.textContent = "\u00d7";
          del.onclick = function (key) {
            return function () {
              stagedCourses = stagedCourses.filter(function (x) { return x.key !== key; });
              delete locks[key];
              planResult = null;
              savePlanner();
              renderPlanner();
              renderPlanResult();
            };
          }(c.key);
          head.appendChild(sw); head.appendChild(info); head.appendChild(del);
          card.appendChild(head);

          var secs = document.createElement("div");
          secs.className = "staged-sections";
          var chosenIdx = planResult && planResult.assign ? planResult.assign[c.key] : null;
          c.sections.forEach(function (sec, si) {
            var label = document.createElement("label");
            label.className = "sec-row";
            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = locks[c.key] === si;
            cb.title = "Lock this section";
            cb.onchange = function (key, idx) {
              return function () {
                if (cb.checked) locks[key] = idx; else delete locks[key];
                planResult = null;
                savePlanner();
                renderPlanner();
                renderPlanResult();
              };
            }(c.key, si);
            var codeEl = document.createElement("span");
            codeEl.className = "sec-code";
            codeEl.textContent = sec.code;
            var m = document.createElement("span");
            m.className = "sec-meta";
            var sum = sessionSummary(sec);
            m.title = sum;
            m.textContent = sum;
            label.appendChild(cb); label.appendChild(codeEl); label.appendChild(m);
            if (locks[c.key] === si) label.classList.add("locked");
            if (chosenIdx === si) label.classList.add("chosen");
            if (!sec.sessions.length) label.classList.add("empty");
            secs.appendChild(label);
          });
          card.appendChild(secs);
          stagedList.appendChild(card);
        });
      });
    }

    var lockList = [];
    stagedCourses.forEach(function (c) {
      if (locks[c.key] != null) lockList.push(c);
    });
    var badPairs = [];
    for (var a = 0; a < lockList.length; a++) {
      for (var b = a + 1; b < lockList.length; b++) {
        if (sectionsConflict(lockList[a].sections[locks[lockList[a].key]], lockList[b].sections[locks[lockList[b].key]])) {
          badPairs.push(lockList[a].code + " " + lockList[a].sections[locks[lockList[a].key]].code + " vs " +
            lockList[b].code + " " + lockList[b].sections[locks[lockList[b].key]].code);
        }
      }
    }
    if (badPairs.length) {
      var w = document.createElement("div");
      w.className = "plan-msg warn";
      w.textContent = "\u26a0 Locked sections conflict: " + badPairs.join("; ");
      planStatus.appendChild(w);
    }
  }

  function renderPlanResult() {
    planResultEl.innerHTML = "";
    applyPlanBtn.style.display = (planResult && planResult.assign && stagedCourses.length) ? "block" : "none";
    if (!planResult || !planResult.assign || !stagedCourses.length) return;

    var emptyChosen = stagedCourses.filter(function (c) {
      var si = planResult.assign[c.key];
      return si == null || !c.sections[si].sessions.length;
    }).length;
    if (emptyChosen) {
      var ew = document.createElement("div");
      ew.className = "plan-msg warn";
      ew.textContent = "\u26a0 " + emptyChosen + " course" + (emptyChosen > 1 ? "s" : "") +
        " were assigned sections with no session times \u2014 the weekly load is missing those hours. Re-stage those course pages.";
      planResultEl.appendChild(ew);
    }

    if (planResult.conflicts === 0) {
      var ok = document.createElement("div");
      ok.className = "plan-msg ok";
      ok.textContent = "\u2713 Conflict-free schedule found for all " + stagedCourses.length +
        " course" + (stagedCourses.length > 1 ? "s" : "") + ".";
      planResultEl.appendChild(ok);
    } else {
      var warn = document.createElement("div");
      warn.className = "plan-msg warn";
      warn.textContent = "No fully conflict-free schedule. Closest pick has " + planResult.conflicts +
        " overlap" + (planResult.conflicts > 1 ? "s" : "") + ".";
      planResultEl.appendChild(warn);
    }

    var groups = { 1: [], 2: [] };
    stagedCourses.forEach(function (c) { groups[c.sem === 2 ? 2 : 1].push(c); });
    [1, 2].forEach(function (sem) {
      if (!groups[sem].length) return;
      var ghead = document.createElement("div");
      ghead.className = "plan-group";
      ghead.textContent = "Semester " + sem;
      planResultEl.appendChild(ghead);
      var list = document.createElement("div");
      list.className = "plan-assign";
      groups[sem].forEach(function (c) {
        var si = planResult.assign[c.key];
        var line = document.createElement("div");
        line.textContent = c.code + " \u2192 " + c.sections[si].code;
        list.appendChild(line);
      });
      planResultEl.appendChild(list);
    });

    var stats = planStats(planResult.assign);
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    var st = document.createElement("div");
    st.className = "plan-stats";
    var lines = [];
    [1, 2].forEach(function (sem) {
      var box = stats.perSem[sem];
      if (!box || !box.total) return;
      var parts = [];
      for (var d = 0; d < 7; d++) parts.push(days[d] + " " + fmtMin(box.loads[d]));
      lines.push("<b>Sem " + sem + " load:</b> " + esc(parts.join(" \u00b7 ")) +
        "<br><b>Sem " + sem + " avg:</b> " + fmtMin(Math.round(box.avg)) + "/day");
    });
    st.innerHTML = lines.join("<br>");
    planResultEl.appendChild(st);

    if (planMode === "holidays") {
      if (stats.holDates.length) {
        var hw = document.createElement("div");
        hw.className = "plan-msg warn";
        hw.textContent = "\u26a0 Classes fall on holidays (" + fmtMin(stats.holidayTotal) + "): " + stats.holDates.join(", ");
        planResultEl.appendChild(hw);
      } else {
        var ho = document.createElement("div");
        ho.className = "plan-msg ok";
        ho.textContent = "\u2713 All " + holidays.length + " holiday date" + (holidays.length === 1 ? "" : "s") + " free of classes.";
        planResultEl.appendChild(ho);
      }
    }
  }

  function render() {
    renderCalendar();
    renderHistory();
    renderConflicts();
    renderSemesterCredit();
  }

  /* ---------- actions ---------- */

  function startOfWeek(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dow = x.getDay();
    if (dow === 0) return x;
    x.setDate(x.getDate() - dow);
    return x;
  }

  function anchorToFirst() {
    var d;
    if (entries.length) {
      var first = entries.slice().sort(function (a, b) { return a.start - b.start; })[0];
      d = first.start;
    } else {
      d = new Date();
    }
    return viewMode === "week" || viewMode === "pattern" ? startOfWeek(d) : new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function setStatus(msg, isError) {
    statusEl.textContent = msg;
    statusEl.className = isError ? "error" : "";
  }

  addBtn.onclick = function () {
    var blocks = parseBlocks(inputText.value);
    var added = 0;
    var batchId = uid();
    blocks.forEach(function (b) {
      var e = blockToEntry(b, uid());
      if (!validEntry(e)) return;
      var dup = entries.some(function (x) {
        return x.topic === e.topic &&
          x.start.getTime() === e.start.getTime() &&
          x.end.getTime() === e.end.getTime() &&
          x.startMin === e.startMin;
      });
      if (dup) return;
      e.batchId = batchId;
      entries.push(e);
      added++;
    });
    save();
    inputText.value = "";
    if (added) {
      viewDate = anchorToFirst();
      setStatus("Added " + added + " entr" + (added > 1 ? "ies." : "y."));
    } else {
      setStatus("Nothing new to add \u2014 check the format.", blocks.length > 0);
    }
    render();
  };

  clearAllBtn.onclick = function () {
    if (!entries.length) return;
    if (confirm("Delete all entries?")) {
      entries = [];
      save();
      viewDate = anchorToFirst();
      render();
    }
  };

  prevBtn.onclick = function () {
    viewDate = (viewMode === "month")
      ? new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1)
      : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() - 7);
    render();
  };
  nextBtn.onclick = function () {
    viewDate = (viewMode === "month")
      ? new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1)
      : new Date(viewDate.getFullYear(), viewDate.getMonth(), viewDate.getDate() + 7);
    render();
  };
  todayBtn.onclick = function () {
    var t = new Date();
    viewDate = (viewMode === "week" || viewMode === "pattern") ? startOfWeek(t) : new Date(t.getFullYear(), t.getMonth(), 1);
    render();
  };
  viewToggle.onclick = function () {
    viewMode = (viewMode === "month") ? "pattern" : "month";
    viewToggle.textContent = (viewMode === "month") ? "Pattern" : "Month";
    render();
  };
  if (patternSemEl) {
    patternSemEl.onchange = function () {
      patternSem = patternSemEl.value;
      if (viewMode === "pattern") render();
    };
  }

  stageBtn.onclick = function () {
    var parsed = parseCoursePage(inputText.value);    if (!parsed.length) {
      setStatus("No course sections found \u2014 paste a full course page first.", true);
      return;
    }
    var total = 0;
    parsed.forEach(function (c) {
      total += c.sections.length;
      var idx = -1;
      for (var i = 0; i < stagedCourses.length; i++) {
        if (stagedCourses[i].key === c.key) { idx = i; break; }
      }
      if (idx >= 0) stagedCourses[idx] = c; else stagedCourses.push(c);
    });
    planResult = null;
    savePlanner();
    inputText.value = "";
    var sems = {};
    parsed.forEach(function (c) { sems[c.sem] = true; });
    setStatus("Staged " + parsed.length + " course" + (parsed.length > 1 ? "s" : "") + " (" + total + " sections)" +
      " for Sem " + Object.keys(sems).sort().join(" & ") + ".");
    renderPlanner();
    renderPlanResult();
  };

  stageListBtn.onclick = function () {
    var parsed = parseTempList(inputText.value);
    if (!parsed.length) {
      setStatus("No temp-list entries found \u2014 paste a Temporary Course List.", true);
      return;
    }
    var total = 0;
    parsed.forEach(function (c) {
      total += c.sections.length;
      var idx = -1;
      for (var i = 0; i < stagedCourses.length; i++) {
        if (stagedCourses[i].key === c.key) { idx = i; break; }
      }
      if (idx >= 0) stagedCourses[idx] = c; else stagedCourses.push(c);
    });
    planResult = null;
    savePlanner();
    inputText.value = "";
    setStatus("Staged temp list \u2014 " + parsed.length + " course" + (parsed.length > 1 ? "s" : "") +
      " (" + total + " sections) for Sem " + (parsed[0].sem || 1) + ".");
    renderPlanner();
    renderPlanResult();
  };

  clearPlanBtn.onclick = function () {
    if (!stagedCourses.length) return;
    if (confirm("Clear all staged courses?")) {
      stagedCourses = [];
      locks = {};
      planResult = null;
      savePlanner();
      renderPlanner();
      renderPlanResult();
    }
  };

  findPlanBtn.onclick = function () {
    if (!stagedCourses.length) { setStatus("Stage at least one course first.", true); return; }
    planResult = findSchedule();
    renderPlanner();
    renderPlanResult();
    if (planResult.assign) {
      setStatus(planResult.conflicts ? "Found closest schedule (" + planResult.conflicts + " conflicts)." : "Found a conflict-free schedule!");
    } else {
      setStatus("Could not build a schedule.", true);
    }
  };

  planModeEl.onchange = function () {
    planMode = planModeEl.value;
    planResult = null;
    savePlanner();
    renderPlanner();
    renderPlanResult();
  };

  holidayAddBtn.onclick = function () {
    var raw = holidayInput.value;
    var parts = raw.split(/[\s,;]+/).filter(Boolean);
    var added = 0;
    parts.forEach(function (p) {
      var d = parseDate(p);
      if (!d) return;
      var dup = holidays.some(function (h) { return h.getTime() === d.getTime(); });
      if (dup) return;
      holidays.push(d);
      added++;
    });
    holidays.sort(function (a, b) { return a - b; });
    holidayInput.value = "";
    if (added) {
      planResult = null;
      savePlanner();
      renderHolidayList();
      renderPlanner();
      renderPlanResult();
      setStatus("Added " + added + " holiday date" + (added > 1 ? "s" : "") + ".");
    } else {
      setStatus("No valid dates found \u2014 use dd/mm/yyyy.", true);
    }
  };

  applyPlanBtn.onclick = function () {
    if (!planResult || !planResult.assign) return;
    doApplyPlan();
  };

  function doApplyPlan() {
    try {
      var prevCount = entries.length;
      entries = planToEntries(planResult.assign);
      save();
      viewMode = "month";
      viewToggle.textContent = "Week";
      viewDate = anchorToFirst();
      render();
      setStatus("Planned schedule loaded \u2014 " + entries.length + " session" + (entries.length > 1 ? "s" : "") +
        " on the calendar (" + (prevCount ? "replaced " + prevCount + " previous" : "calendar was empty") + ").");
      if (cal.scrollIntoView) cal.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      if (window.console && window.console.error) window.console.error(err);
      setStatus("Error loading the plan: " + (err && err.message ? err.message : err), true);
    }
  }

  renderWeekdays();
  if (appVersionEl) appVersionEl.textContent = APP_VERSION;
  loadPlanner();
  renderPlanner();
  renderPlanResult();
  render();
})();
