(function () {
  "use strict";

  var STORAGE_KEY = "dog-feed-theme";
  var root = document.documentElement;
  var toggle = document.querySelector("[data-theme-toggle]");
  var label = document.querySelector("[data-theme-label]");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    if (label) label.textContent = theme;
  }

  var stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    stored = null;
  }

  var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
  applyTheme(stored || (prefersLight ? "light" : "dark"));

  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch (err) {
        /* storage unavailable */
      }
    });
  }

  /* Royal Canin Dachshund feeding charts, grams per day.
     The two bags differ in kibble density and energy, so each stage
     carries its own cup weight and kcal figure. */
  var CHARTS = {
    puppy: {
      name: "Royal Canin Dachshund Puppy",
      cupGrams: 86, // one 240 ml cup
      kcalPerKg: 3887,
      // Columns are age in months, keyed by expected adult weight.
      columns: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      keys: [3, 6, 10],
      grams: {
        3: [67, 75, 79, 79, 71, 64, 57, 56, 56],
        6: [108, 125, 131, 132, 131, 118, 106, 95, 93],
        10: [153, 180, 191, 195, 194, 175, 157, 140, 139]
      }
    },
    adult: {
      name: "Royal Canin Dachshund Adult",
      cupGrams: 77,
      kcalPerKg: 3726,
      // Columns are current weight in kg, keyed by activity level.
      columns: [2, 5, 8, 10],
      kibble: {
        normal: [43, 85, 121, 143],
        active: [50, 99, 140, 166],
        veryActive: [56, 112, 160, 189]
      },
      // Reduced kibble when feeding alongside a wet pouch.
      mixed: {
        normal: [31, 72, 97, 118],
        active: [37, 86, 115, 140],
        veryActive: [44, 99, 134, 163]
      },
      pouches: [0.5, 0.5, 1, 1]
    }
  };

  // The bag only labels the ends of the activity triangle.
  var ACTIVITY_ORDER = ["normal", "active", "veryActive"];
  var ACTIVITY_LABELS = {
    normal: "Normal",
    active: "Active",
    veryActive: "Very active"
  };

  var form = document.getElementById("feeding-form");
  if (!form) return;

  var chartTable = document.querySelector("[data-chart-table]");
  var chartTag = document.querySelector("[data-chart-tag]");
  var chartNote = document.querySelector("[data-chart-note]");
  var working = document.querySelector("[data-working]");

  var panels = {
    puppy: form.querySelector('[data-stage-panel="puppy"]'),
    adult: form.querySelector('[data-stage-panel="adult"]')
  };
  var note = form.querySelector("[data-form-note]");
  var out = {
    value: document.querySelector("[data-result-value]"),
    cups: document.querySelector("[data-result-cups]"),
    meal: document.querySelector("[data-result-meal]"),
    meals: document.querySelector("[data-result-meals]"),
    energy: document.querySelector("[data-result-energy]"),
    pouch: document.querySelector("[data-result-pouch]"),
    pouchRow: document.querySelector("[data-result-pouch-row]"),
    source: document.querySelector("[data-result-source]")
  };

  // Charts only list a few reference points, so read between them.
  // Returns the bracketing columns too, so the working can be shown.
  function interpolate(columns, values, target) {
    var i = 0;
    while (i < columns.length - 2 && target > columns[i + 1]) i++;

    var span = columns[i + 1] - columns[i];
    var ratio = span === 0 ? 0 : (target - columns[i]) / span;

    return {
      value: values[i] + (values[i + 1] - values[i]) * ratio,
      lower: i,
      upper: i + 1,
      ratio: ratio,
      exact: ratio === 0 ? i : (ratio === 1 ? i + 1 : -1)
    };
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function nearestIndex(columns, target) {
    var best = 0;
    for (var i = 1; i < columns.length; i++) {
      if (Math.abs(columns[i] - target) < Math.abs(columns[best] - target)) best = i;
    }
    return best;
  }

  // Both bags measure in eighths of a cup, so match them.
  function formatCups(grams, cupGrams) {
    var eighths = Math.round((grams / cupGrams) * 8);
    var whole = Math.floor(eighths / 8);
    var rest = eighths % 8;

    if (rest === 0) return String(whole);
    if (whole === 0) return rest + "/8";
    return whole + " + " + rest + "/8";
  }

  function formatPouches(count) {
    if (count === 0.5) return "½ per day";
    if (count === 1) return "1 per day";
    return count + " per day";
  }

  function setNote(message) {
    note.textContent = message || "";
    note.hidden = !message;
  }

  function clear() {
    out.value.textContent = "—";
    out.cups.textContent = "—";
    out.meal.textContent = "—";
    out.meals.textContent = "—";
    out.energy.textContent = "—";
    out.pouch.textContent = "—";
    out.pouchRow.hidden = true;
    resetWorking();
    highlight([]);
  }

  function selectedStage() {
    var checked = form.querySelector('input[name="stage"]:checked');
    return checked ? checked.value : "puppy";
  }

  function setSource(stage) {
    var chart = CHARTS[stage];
    out.source.textContent =
      chart.name + " · " + chart.kcalPerKg + " kcal/kg · 1 cup = 240 ml = " +
      chart.cupGrams + " g";
  }

  function syncStage() {
    var stage = selectedStage();
    panels.puppy.hidden = stage !== "puppy";
    panels.adult.hidden = stage !== "adult";
    setSource(stage);
    renderChart(stage);
    setNote("");
    clear();
  }

  // Clamp to the chart's range rather than extrapolating past it.
  function clampWeight(chart, weight) {
    var min = chart.columns[0];
    var max = chart.columns[chart.columns.length - 1];
    return Math.min(Math.max(weight, min), max);
  }

  function rangeNote(chart, weight, clamped) {
    if (clamped === weight) return "";
    return "The chart covers " + chart.columns[0] + "–" +
      chart.columns[chart.columns.length - 1] + " kg, so this uses the " +
      clamped + " kg column.";
  }

  function calcPuppy() {
    var chart = CHARTS.puppy;
    var weight = parseFloat(form.elements.adultWeight.value);
    var age = parseInt(form.elements.age.value, 10);

    if (!isFinite(weight) || weight <= 0 || !age) {
      return { error: "Enter an expected adult weight and an age." };
    }

    var clamped = Math.min(Math.max(weight, chart.keys[0]), chart.keys[chart.keys.length - 1]);
    var column = chart.columns.indexOf(age);
    var values = chart.keys.map(function (key) {
      return chart.grams[key][column];
    });
    var read = interpolate(chart.keys, values, clamped);
    var meals = age <= 5 ? 3 : 2;

    return {
      chart: chart,
      grams: read.value,
      meals: meals,
      cells: (read.exact >= 0 ? [read.exact] : [read.lower, read.upper]).map(function (i) {
        return "p-" + chart.keys[i] + "-" + age;
      }),
      steps: readingSteps(
        read,
        chart.keys.map(function (key) { return key + " kg"; }),
        values,
        clamped + " kg"
      ).concat([
        "At " + age + " months the bag splits the daily amount into <b>" + meals +
          " meals</b>, so " + Math.round(read.value) + " ÷ " + meals + " = <b>" +
          Math.round(read.value / meals) + " g</b> per meal."
      ]),
      note: clamped !== weight
        ? "The chart covers " + chart.keys[0] + "–" + chart.keys[chart.keys.length - 1] +
          " kg expected adult weight, so this uses the " + clamped + " kg row."
        : ""
    };
  }

  function calcAdult() {
    var chart = CHARTS.adult;
    var weight = parseFloat(form.elements.weight.value);
    var activity = form.elements.activity.value;
    var food = form.querySelector('input[name="food"]:checked').value;

    if (!isFinite(weight) || weight <= 0 || !activity) {
      return { error: "Enter a weight and an activity level." };
    }

    var clamped = clampWeight(chart, weight);
    var values = chart[food][activity];
    var read = interpolate(chart.columns, values, clamped);
    var result = {
      chart: chart,
      grams: read.value,
      meals: 2,
      cells: (read.exact >= 0 ? [read.exact] : [read.lower, read.upper]).map(function (i) {
        return "a-" + food + "-" + activity + "-" + chart.columns[i];
      }),
      steps: readingSteps(
        read,
        chart.columns.map(function (kg) { return kg + " kg"; }),
        values,
        clamped + " kg",
        ACTIVITY_LABELS[activity] + " row, " +
          (food === "mixed" ? "kibble alongside a pouch" : "kibble only")
      ).concat([
        "The adult bag splits the day into <b>2 meals</b>, so " +
          Math.round(read.value) + " ÷ 2 = <b>" + Math.round(read.value / 2) +
          " g</b> per meal."
      ]),
      note: rangeNote(chart, weight, clamped)
    };

    if (food === "mixed") {
      // The bag steps the pouch count rather than scaling it.
      var nearest = nearestIndex(chart.columns, clamped);
      result.pouches = chart.pouches[nearest];
      result.steps.push(
        "The bag steps the pouch count instead of scaling it, so this takes the " +
          "nearest column (" + chart.columns[nearest] + " kg): <b>" +
          formatPouches(result.pouches) + "</b>."
      );
      result.note = (result.note ? result.note + " " : "") +
        "Pouch count follows the nearest column. Energy shown is kibble only.";
    }

    return result;
  }

  /* Reference table, built from the same data the calculator reads. */

  function cell(id, grams, cupGrams, groupStart) {
    return '<td id="' + id + '"' + (groupStart ? ' class="group-start"' : "") + ">" +
      '<span class="cell-g">' + grams + "</span>" +
      '<span class="cell-cups">' + formatCups(grams, cupGrams) + "</span></td>";
  }

  function buildPuppyTable() {
    var chart = CHARTS.puppy;
    var html = '<table class="chart-table"><thead><tr><th scope="col">Adult weight</th>';

    chart.columns.forEach(function (month) {
      html += '<th scope="col">' + month + " m</th>";
    });
    html += "</tr></thead><tbody>";

    chart.keys.forEach(function (key) {
      html += '<tr><th scope="row">' + key + " kg</th>";
      chart.grams[key].forEach(function (grams, i) {
        html += cell("p-" + key + "-" + chart.columns[i], grams, chart.cupGrams, false);
      });
      html += "</tr>";
    });

    return html + "</tbody></table>";
  }

  function buildAdultTable() {
    var chart = CHARTS.adult;
    var html = '<table class="chart-table"><thead><tr><th rowspan="2" scope="col">Activity</th>';

    chart.columns.forEach(function (kg) {
      html += '<th colspan="2" scope="colgroup" class="group-start">' + kg + " kg</th>";
    });
    html += "</tr><tr>";
    chart.columns.forEach(function () {
      html += '<th scope="col" class="group-start">kibble</th><th scope="col">+ pouch</th>';
    });
    html += "</tr></thead><tbody>";

    ACTIVITY_ORDER.forEach(function (activity) {
      html += '<tr><th scope="row">' + ACTIVITY_LABELS[activity] + "</th>";
      chart.columns.forEach(function (kg, i) {
        html += cell("a-kibble-" + activity + "-" + kg, chart.kibble[activity][i], chart.cupGrams, true);
        html += cell("a-mixed-" + activity + "-" + kg, chart.mixed[activity][i], chart.cupGrams, false);
      });
      html += "</tr>";
    });

    return html + "</tbody></table>";
  }

  var CHART_NOTES = {
    puppy: "Grams per day, cups underneath. Three meals a day up to 5 months, " +
      "two from 6 months. From 11 months, use the adult chart.",
    adult: "Grams of kibble per day, cups underneath. The pouch columns assume " +
      "half a pouch at 2 and 5 kg, and a whole one at 8 and 10 kg."
  };

  function renderChart(stage) {
    chartTable.innerHTML = stage === "puppy" ? buildPuppyTable() : buildAdultTable();
    chartTag.textContent = stage;
    chartNote.textContent = CHART_NOTES[stage];
  }

  function highlight(ids) {
    var used = chartTable.querySelectorAll(".is-used");
    for (var i = 0; i < used.length; i++) used[i].classList.remove("is-used");

    (ids || []).forEach(function (id) {
      var target = document.getElementById(id);
      if (target) target.classList.add("is-used");
    });
  }

  /* Working out, so the number can be traced back to the chart. */

  function readingSteps(read, labels, values, target, context) {
    var steps = [];
    var lowLabel = labels[read.lower];
    var highLabel = labels[read.upper];

    if (read.exact >= 0) {
      steps.push(
        "The chart" + (context ? " (" + context + ")" : "") + " lists <b>" +
        labels[read.exact] + "</b> directly: <b>" + values[read.exact] + " g</b> a day."
      );
      return steps;
    }

    steps.push(
      "The chart" + (context ? " (" + context + ")" : "") + " jumps from <b>" +
      lowLabel + "</b> (" + values[read.lower] + " g) to <b>" + highLabel + "</b> (" +
      values[read.upper] + " g). There is no " + target + " column."
    );
    steps.push(
      target + " sits " + Math.round(read.ratio * 100) + "% of the way between them, so " +
      "reading between the two: <code>" + values[read.lower] + " + (" +
      values[read.upper] + " − " + values[read.lower] + ") × " + round1(read.ratio * 100) / 100 +
      " = " + round1(read.value) + " g</code>."
    );

    return steps;
  }

  function renderWorking(result) {
    var chart = result.chart;
    var grams = result.grams;
    var steps = result.steps.slice();

    steps.push(
      "A cup is " + chart.cupGrams + " g of this food, so " + Math.round(grams) + " ÷ " +
      chart.cupGrams + " = <b>" + formatCups(grams, chart.cupGrams) +
      "</b> cups, rounded to the nearest eighth like the bag."
    );
    steps.push(
      "At " + chart.kcalPerKg + " kcal/kg, that is <code>" + Math.round(grams) +
      " g × " + (chart.kcalPerKg / 1000) + " = " + Math.round((grams / 1000) * chart.kcalPerKg) +
      " kcal</code> a day."
    );

    working.innerHTML = steps.map(function (step) {
      return "<li>" + step + "</li>";
    }).join("");
  }

  function resetWorking() {
    working.innerHTML = "<li>Run a calculation to see the steps.</li>";
  }

  form.addEventListener("change", function (event) {
    if (event.target.name === "stage") syncStage();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();

    var result = selectedStage() === "puppy" ? calcPuppy() : calcAdult();

    if (result.error) {
      setNote(result.error);
      clear();
      return;
    }

    setNote(result.note);

    var grams = result.grams;
    out.value.textContent = Math.round(grams);
    out.cups.textContent = formatCups(grams, result.chart.cupGrams);
    out.meal.textContent = Math.round(grams / result.meals) + " g";
    out.meals.textContent = result.meals;
    out.energy.textContent = Math.round((grams / 1000) * result.chart.kcalPerKg) + " kcal";

    out.pouchRow.hidden = !result.pouches;
    if (result.pouches) out.pouch.textContent = formatPouches(result.pouches);

    renderWorking(result);
    highlight(result.cells);
  });

  form.addEventListener("reset", function () {
    window.setTimeout(syncStage, 0);
  });

  syncStage();
})();
