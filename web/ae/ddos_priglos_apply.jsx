/*  DDoS priglos — применение заявки к проекту приглашения
    Запуск: откройте проект приглашения (new_priglashenit_*.aep) → File → Scripts → Run Script File… → этот файл.
    Скрипт спросит JSON заявки (скачивается из формы Motion Studio) и сделает:
      1. Тексты: запишет «master text.csv» рядом с JSON и подменит им файл в проекте — все форматы обновятся.
         Если выражение текстового слоя не находит колонку, оно переключается на чтение по номеру колонки.
      2. Видео спикера: подставит новую запись в композицию «speaker» с обрезкой из заявки
         (масштаб пересчитывается, если у новой записи другое разрешение).
      3. Логошот: в каждом формате (16_9, 1_1, 4_5, 9_16) ставит его в момент конца речи,
         рабочую область — до конца логошота; удлиняет композицию и фоновые слои, если ролик стал длиннее.
      4. Добавит выбранные форматы в очередь рендера (если в заявке render_queue: true).
    Всё делается одной операцией отмены (Ctrl/Cmd+Z откатывает целиком).
*/
(function () {

var MAIN_COMPS = ["16_9", "1_1", "4_5", "9_16"];
var SPEAKER_COMP = "speaker";
var CSV_NAME = "master text.csv";
var CSV_COLUMNS = ["Family name and Name", "Job title", "Title", "Сontent 1", "Сontent 2", "Сontent 3", "Day", "Time"];
// имя текстового слоя → номер колонки CSV (для запасного выражения)
var LAYER_COLUMN = {
    "Family name and Name": 0, "Job title": 1, "Title": 2,
    "Сontent 1": 3, "Сontent 2": 4, "Сontent 3": 5,
    "Content 1": 3, "Content 2": 4, "Content 3": 5,
    "Day": 6, "Calendar": 6, "Date": 6, "Time": 7
};
// лимиты из брифа (те же, что в форме): текст не выходит за поля блоков
var LIMITS = {
    "Family name and Name": [5, 30], "Job title": [15, 75], "Title": [30, 75],
    "\u0421ontent 1": [25, 75], "\u0421ontent 2": [25, 75], "\u0421ontent 3": [25, 75]
};
var LOG = [], WARN = [];

// ------------------------------------------------------------------ JSON (ExtendScript без JSON — свой парсер, без eval)
function parseJSON(s) {
    var i = 0;
    function err(m) { throw new Error("JSON: " + m + " (символ " + i + ")"); }
    function ws() { while (i < s.length && " \t\r\n﻿".indexOf(s.charAt(i)) >= 0) i++; }
    function val() {
        ws(); var c = s.charAt(i);
        if (c === "{") return obj();
        if (c === "[") return arr();
        if (c === '"') return str();
        if (c === "t" && s.substr(i, 4) === "true") { i += 4; return true; }
        if (c === "f" && s.substr(i, 5) === "false") { i += 5; return false; }
        if (c === "n" && s.substr(i, 4) === "null") { i += 4; return null; }
        return num();
    }
    function obj() {
        var o = {}; i++; ws();
        if (s.charAt(i) === "}") { i++; return o; }
        while (true) {
            ws(); if (s.charAt(i) !== '"') err("ожидался ключ");
            var k = str(); ws(); if (s.charAt(i) !== ":") err("ожидалось ':'"); i++;
            o[k] = val(); ws();
            if (s.charAt(i) === ",") { i++; continue; }
            if (s.charAt(i) === "}") { i++; return o; }
            err("ожидалось ',' или '}'");
        }
    }
    function arr() {
        var a = []; i++; ws();
        if (s.charAt(i) === "]") { i++; return a; }
        while (true) {
            a.push(val()); ws();
            if (s.charAt(i) === ",") { i++; continue; }
            if (s.charAt(i) === "]") { i++; return a; }
            err("ожидалось ',' или ']'");
        }
    }
    function str() {
        var r = ""; i++;
        while (i < s.length) {
            var c = s.charAt(i++);
            if (c === '"') return r;
            if (c === "\\") {
                var e = s.charAt(i++);
                if (e === "u") { r += String.fromCharCode(parseInt(s.substr(i, 4), 16)); i += 4; }
                else r += ({ '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" })[e];
            } else r += c;
        }
        err("незакрытая строка");
    }
    function num() {
        var m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(s.substr(i));
        if (!m) err("неожиданный символ");
        i += m[0].length; return parseFloat(m[0]);
    }
    var v = val(); ws(); if (i < s.length) err("лишние символы в конце");
    return v;
}

// ------------------------------------------------------------------ helpers
function findItem(name, type) {
    for (var i = 1; i <= app.project.numItems; i++) {
        var it = app.project.item(i);
        if (it.name === name && (!type || it instanceof type)) return it;
    }
    return null;
}
function isLogoSource(src) {
    if (!src) return false;
    if (/logoshot/i.test(src.name)) return true;
    if (src instanceof CompItem) {
        for (var i = 1; i <= src.numLayers; i++) { var s = src.layer(i).source; if (s && /logoshot/i.test(s.name)) return true; }
    }
    return false;
}
function findLogoLayer(comp) {
    for (var i = 1; i <= comp.numLayers; i++) { var L = comp.layer(i); if (L.name === "Logoshot") return L; }
    for (var j = 1; j <= comp.numLayers; j++) { var M = comp.layer(j); if (isLogoSource(M.source)) return M; }
    return null;
}
function findLayerBySource(comp, src) {
    for (var i = 1; i <= comp.numLayers; i++) if (comp.layer(i).source === src) return comp.layer(i);
    return null;
}
function csvField(v) {
    v = String(v === undefined || v === null ? "" : v).replace(/[\r\n]+/g, " ");
    return /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function r2(t) { return Math.round(t * 100) / 100; }
function fmtT(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); }
// слои с ключами в окне [a, b] — показываем в отчёте, чтобы дизайнер проверил анимацию перед логошотом
function keysInWindow(layer, a, b) {
    var found = false;
    function walk(p) {
        if (found) return;
        try {
            if (p.propertyType === PropertyType.PROPERTY) {
                if (p.numKeys > 0) for (var k = 1; k <= p.numKeys; k++) { var t = p.keyTime(k); if (t >= a && t <= b) { found = true; return; } }
            } else for (var i = 1; i <= p.numProperties; i++) walk(p.property(i));
        } catch (e) { }
    }
    walk(layer);
    return found;
}

// ------------------------------------------------------------------ main
if (!app.project || app.project.numItems === 0) { alert("Откройте проект приглашения и запустите скрипт ещё раз."); return; }
var jf = File.openDialog("JSON заявки DDoS priglos", "JSON:*.json,*.*");
if (!jf) return;
jf.encoding = "UTF-8"; jf.open("r"); var raw = jf.read(); jf.close();
var J;
try { J = parseJSON(raw); } catch (e) { alert("Не получилось прочитать JSON:\n" + e.message); return; }
if (J.type !== "ddos_priglos") { alert("Это не заявка DDoS priglos (type = " + J.type + ")."); return; }
var dir = jf.parent.fsName;

app.beginUndoGroup("DDoS priglos: " + (J.csv && J.csv["Family name and Name"] || "заявка"));
try {

    // ---------------- 0. длины текстов
    for (var lk in LIMITS) {
        var tv = String(J.csv[lk] || "").replace(/^\s+|\s+$/g, ""), lm = LIMITS[lk];
        if (tv.length > lm[1]) WARN.push("«" + lk + "»: " + tv.length + " знаков при лимите " + lm[1] + " — текст может выйти за поля блока.");
        else if (tv.length < lm[0]) WARN.push("«" + lk + "»: " + tv.length + " знаков — меньше " + lm[0] + ", блок будет выглядеть пустым.");
    }

    // ---------------- 1. CSV
    var csvItem = findItem(CSV_NAME, FootageItem);
    var csvFile = new File(dir + "/" + CSV_NAME);
    var row = [];
    for (var c = 0; c < CSV_COLUMNS.length; c++) row.push(csvField(J.csv[CSV_COLUMNS[c]]));
    csvFile.encoding = "UTF-8"; csvFile.lineFeed = "Windows";
    csvFile.open("w");
    csvFile.write(CSV_COLUMNS.join(",") + "\r\n" + row.join(",") + "\r\n" + new Array(61).join(" "));
    csvFile.close();
    if (csvItem) {
        csvItem.replace(csvFile);
        LOG.push("Тексты: " + csvFile.fsName);
    } else WARN.push("В проекте нет «" + CSV_NAME + "» — тексты не обновлены. CSV записан: " + csvFile.fsName);

    // ---------------- 2. видео спикера
    var spk = findItem(SPEAKER_COMP, CompItem);
    if (!spk) throw new Error("Нет композиции «" + SPEAKER_COMP + "».");
    var VL = null;
    for (var v = 1; v <= spk.numLayers; v++) { var s0 = spk.layer(v).source; if (s0 instanceof FootageItem && s0.hasVideo && !(s0.mainSource instanceof SolidSource)) { VL = spk.layer(v); break; } }
    if (!VL) throw new Error("В «" + SPEAKER_COMP + "» не найден слой с видео.");

    var vf = J.video && J.video.file ? new File(dir + "/" + J.video.file) : null;
    if (!vf || !vf.exists) vf = File.openDialog("Видео спикера" + (J.video && J.video.file ? " (" + J.video.file + ")" : ""));
    if (!vf) throw new Error("Видео спикера не выбрано.");
    var oldSrc = VL.source, newSrc = null;
    if (oldSrc.file && oldSrc.file.fsName === vf.fsName) newSrc = oldSrc;
    else {
        newSrc = app.project.importFile(new ImportOptions(vf));
        try { newSrc.parentFolder = oldSrc.parentFolder; } catch (e) { }
        var sc = VL.property("ADBE Transform Group").property("ADBE Scale");
        VL.replaceSource(newSrc, false);
        if (oldSrc.width && newSrc.width && oldSrc.width !== newSrc.width) {
            if (sc.numKeys > 0) WARN.push("У видео спикера ключи масштаба — проверьте кадрирование: новая запись " + newSrc.width + "×" + newSrc.height + ", была " + oldSrc.width + "×" + oldSrc.height + ".");
            else { var k0 = oldSrc.width / newSrc.width, s1 = sc.value; sc.setValue([s1[0] * k0, s1[1] * k0, s1.length > 2 ? s1[2] : 100]); }
        }
        LOG.push("Видео: " + vf.fsName + " (" + newSrc.width + "×" + newSrc.height + ", " + r2(newSrc.duration) + " с)");
    }

    var srcDur = newSrc.duration;
    var tin = Math.max(0, Number(J.video.trim_in) || 0);
    var tout = Math.min(srcDur, Number(J.video.trim_out) || srcDur);
    if (tout - tin < 1) throw new Error("Слишком короткая речь после обрезки: " + r2(tout - tin) + " с.");
    if (Number(J.video.trim_out) > srcDur + 0.05) WARN.push("Конец обрезки " + r2(J.video.trim_out) + " с больше длины записи " + r2(srcDur) + " с — взят конец записи.");
    var speech = tout - tin;                         // речь в главных композициях идёт с 0 до speech

    // ---------------- 3. главные композиции
    var done = {}, logoDurUsed = null, total = speech;
    for (var m = 0; m < MAIN_COMPS.length; m++) {
        var C = findItem(MAIN_COMPS[m], CompItem);
        if (!C) { WARN.push("Нет композиции «" + MAIN_COMPS[m] + "»."); continue; }
        var LG = findLogoLayer(C);
        var SL = findLayerBySource(C, spk);
        if (!LG) { WARN.push(C.name + ": не найден слой логошота."); continue; }

        var oldLogoIn = LG.inPoint;
        var oldEnd = C.workAreaStart + C.workAreaDuration;
        var logoDur = oldEnd - oldLogoIn;
        if (!(logoDur > 0.5 && logoDur < 15)) logoDur = Number(J.timeline && J.timeline.logoshot_duration) || 3.68;
        logoDurUsed = logoDur;
        var newEnd = speech + logoDur, delta = speech - oldLogoIn;
        total = newEnd;

        // анимации у конца речи — только в отчёт
        var warnLayers = [];
        for (var a = 1; a <= C.numLayers; a++) {
            var A = C.layer(a);
            if (A === LG || A === SL || (A.source && A.source.name === CSV_NAME)) continue;
            if (keysInWindow(A, oldLogoIn - 4, oldEnd)) warnLayers.push(A.name);
        }
        if (warnLayers.length && Math.abs(delta) > 0.04) WARN.push(C.name + ": у слоёв есть ключи в последние 4 с перед логошотом — проверьте, что анимация не уходит раньше конца речи: " + warnLayers.join(", "));

        if (newEnd + 1 > C.duration) C.duration = newEnd + 1;

        // логошот — в конец речи
        LG.startTime += delta;
        if (LG.source instanceof CompItem && !done[LG.source.id]) {
            done[LG.source.id] = true;
            for (var w = 1; w <= LG.source.numLayers; w++) { var W = LG.source.layer(w); if (W.startTime < -0.001) W.startTime -= delta; }
        }

        // спикер — с 0, виден до конца логошота или до конца записи
        if (SL) { SL.startTime = 0; SL.inPoint = 0; } else WARN.push(C.name + ": не найден слой «" + SPEAKER_COMP + "».");

        // фоновые слои, которые шли до старого конца, тянем до нового
        for (var b = 1; b <= C.numLayers; b++) {
            var B = C.layer(b);
            if (B === LG || B === SL) continue;
            if (B.outPoint >= oldEnd - 0.05 && B.outPoint < newEnd + 0.5) { try { B.outPoint = newEnd + 0.5; } catch (e) { } }
        }

        C.workAreaStart = 0; C.workAreaDuration = newEnd;
        LOG.push(C.name + ": речь 0:00–" + fmtT(speech) + ", логошот " + fmtT(speech) + "–" + fmtT(newEnd) + " (было " + fmtT(oldLogoIn) + ")");
    }

    // видео в speaker: старт со сдвигом на обрезку; под логошотом запись продолжается, пока есть кадры
    var visEnd = Math.min(srcDur - tin, total);
    if (visEnd > spk.duration) spk.duration = visEnd;
    VL.startTime = -tin; VL.inPoint = 0; VL.outPoint = visEnd;
    spk.workAreaStart = 0; spk.workAreaDuration = visEnd;
    for (var n = 0; n < MAIN_COMPS.length; n++) {
        var C2 = findItem(MAIN_COMPS[n], CompItem); if (!C2) continue;
        var S2 = findLayerBySource(C2, spk); if (S2) S2.outPoint = Math.min(visEnd, S2.startTime + spk.duration);
    }
    LOG.push("Обрезка записи: " + fmtT(tin) + " – " + fmtT(tout) + " (речь " + r2(speech) + " с, логошот " + r2(logoDurUsed || 0) + " с, итого " + r2(total) + " с)");

    // ---------------- 4. тексты: проверяем выражения
    var fixed = 0, broken = [];
    for (var q = 0; q < MAIN_COMPS.length; q++) {
        var C3 = findItem(MAIN_COMPS[q], CompItem); if (!C3) continue;
        for (var l = 1; l <= C3.numLayers; l++) {
            var T = C3.layer(l);
            if (!(T instanceof TextLayer)) continue;
            var st = T.property("ADBE Text Properties").property("ADBE Text Document");
            if (!st.expressionEnabled || st.expression.indexOf(CSV_NAME) < 0) continue;
            try { st.valueAtTime(1, false); } catch (e) { }
            if (st.expressionError) {
                var col = LAYER_COLUMN[T.name];
                if (col === undefined) { broken.push(C3.name + " / " + T.name); continue; }
                st.expression = 'footage("' + CSV_NAME + '").dataValue([' + col + ',0])';
                fixed++;
            }
        }
    }
    if (fixed) LOG.push("Выражения текстов переключены на номер колонки: " + fixed);
    if (broken.length) WARN.push("Выражение не работает, колонку не определить: " + broken.join(", "));

    // ---------------- 5. очередь рендера
    if (J.render_queue) {
        var base = (J.output_name || "DDoS_priglos").replace(/[\\\/:*?"<>|]+/g, "_");
        var fm = J.formats || MAIN_COMPS;
        for (var r = 0; r < fm.length; r++) {
            var RC = findItem(fm[r], CompItem); if (!RC) continue;
            var it = app.project.renderQueue.items.add(RC);
            it.timeSpanStart = 0; it.timeSpanDuration = total;
            try {
                var om = it.outputModule(1), ext = /\.[^.]+$/.exec(om.file ? om.file.name : "");
                om.file = new File(dir + "/" + base + "_" + fm[r] + (ext ? ext[0] : ".mov"));
            } catch (e) { }
        }
        LOG.push("В очередь рендера: " + fm.join(", "));
    }

} catch (e) {
    app.endUndoGroup();
    alert("Остановлено: " + e.message + (LOG.length ? "\n\nУспели:\n" + LOG.join("\n") : ""));
    return;
}
app.endUndoGroup();
alert("Готово.\n\n" + LOG.join("\n") + (WARN.length ? "\n\nПроверьте:\n• " + WARN.join("\n• ") : ""));
})();
