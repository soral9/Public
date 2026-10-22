(function () {
  'use strict';
  var S = window.App, $ = S.$;
  var id = S.roomId();
  var room = null, timer = null, resetArmed = false, textFilled = false;

  function show(el, on) { el.hidden = !on; }
  function setErr(msg) { $('err').textContent = msg || ''; show($('err'), !!msg); }

  function render() {
    show($('noRoom'), !id);
    if (id) { try { localStorage.setItem('app-room', id); } catch (e) {} }
    else { var last = ''; try { last = localStorage.getItem('app-room') || ''; } catch (e) {} if (last) { $('lastRoom').href = S.pageUrl('index.html', last); show($('lastRoomBox'), true); } }
    if (!id && S.storeName() === 'firebase' && !$('dbUrl').value) $('dbUrl').value = S.dbUrl();
    ['dates', 'yearly', 'people', 'tools'].forEach(function (k) { show($(k), !!id); });
    if (!id) { show($('secR'), false); show($('waiting'), false); return; }
    $('linkA').href = S.pageUrl('a.html', id);
    $('linkB').href = S.pageUrl('b.html', id);
    $('nameA').textContent = S.NAMES.a; $('nameB').textContent = S.NAMES.b;
    $('linkA').textContent = S.NAMES.a + 'の選択ページ'; $('linkB').textContent = S.NAMES.b + 'の選択ページ';
    if (!room) return;
    $('h1').textContent = S.title(); document.title = S.title();
    $('nameA').textContent = S.NAMES.a; $('nameB').textContent = S.NAMES.b;
    $('linkA').textContent = S.NAMES.a + 'の選択ページ'; $('linkB').textContent = S.NAMES.b + 'の選択ページ';
    $('yearlyHint').textContent = room.text.hint || '届いた一覧をそのまま貼り付けてください。';
    if (!textFilled) { textFilled = true; $('txtA').value = room.text.a || ''; $('txtB').value = room.text.b || ''; $('txtTitle').value = room.text.title || ''; $('txtHint').value = room.text.hint || ''; }
    var v = S.view(room);
    show($('autoDates'), v.auto); show($('manualDates'), !v.auto);
    if (v.auto) {
      $('auto1').textContent = v.d1 || '(今年のリストは終了。新しいリストを貼り付けてください)';
      $('auto2').textContent = v.d2 || '(次の候補日がありません)';
    } else {
      if (document.activeElement !== $('d1')) $('d1').value = room.d1;
      if (document.activeElement !== $('d2')) $('d2').value = room.d2;
    }
    if (document.activeElement !== $('yearlyText') && !$('yearlyText').value && room.dates.length) {
      $('yearlyText').value = room.dates.map(function (iso) { return S.fmtDate(iso, true); }).join('\n');
    }
    renderDateList(room.dates, v.next);
    $('yearlyBox').open = !room.dates.length || $('yearlyBox').open;
    setPill($('pillA'), v.a !== null); setPill($('pillB'), v.b !== null);
    // 回答済みの人には選択ページのリンクを出さない
    show($('linkA'), v.a === null); show($('linkB'), v.b === null);
    // 2人とも回答済みなら枠ごと消す
    show($('people'), v.a === null || v.b === null);
    var r = S.renderResultInto($('result'), room);
    show($('secR'), !!r); show($('waiting'), !r);
    if (!r) {
      var left = [];
      if (v.a === null) left.push(S.NAMES.a);
      if (v.b === null) left.push(S.NAMES.b);
      $('waitMsg').textContent = left.join('と') + 'の選択待ちです。2人とも選ぶと、ここに結果が表示されます。';
    }
  }
  function renderDateList(dates, next) {
    var ol = $('dateList'); ol.innerHTML = '';
    dates.forEach(function (iso) {
      var li = document.createElement('li'); li.textContent = S.fmtDate(iso, true);
      var i = next.indexOf(iso);
      if (i >= 0) { li.className = 'now'; li.textContent += i === 0 ? '　← ①' : '　← ②'; }
      else if (S.upcoming([iso]).length === 0) li.className = 'past';
      ol.appendChild(li);
    });
  }
  function setPill(el, done) { el.textContent = done ? '選択済み' : '未回答'; el.className = 'pill ' + (done ? 'done' : 'todo'); }

  function refresh() {
    if (!id) return Promise.resolve();
    return S.loadRoom(id).then(function (r) { room = r; setErr(''); render(); })
      .catch(function (e) { setErr('読み込みに失敗しました。部屋が見つからないか、通信エラーです。(' + e.message + ')'); });
  }

  function create(btn) {
    btn.disabled = true; show($('createErr'), false);
    S.createRoom().then(function (newId) {
      location.replace(S.pageUrl('index.html', newId));
    }).catch(function (e) {
      btn.disabled = false;
      $('createErr').textContent = '部屋を作れませんでした。URLとデータベースのルール、通信環境を確認してください。(' + e.message + ')';
      show($('createErr'), true);
    });
  }
  $('btnCreate').addEventListener('click', function () {
    if (!S.setDbUrl($('dbUrl').value)) {
      $('createErr').textContent = 'URLの形式が違います。https://～.firebaseio.com または https://～.firebasedatabase.app の形で貼り付けてください。';
      show($('createErr'), true); return;
    }
    create($('btnCreate'));
  });
  $('btnCreateBlob').addEventListener('click', function () { create($('btnCreateBlob')); });
  $('btnSaveDates').addEventListener('click', function () {
    var d1 = $('d1').value.trim(), d2 = $('d2').value.trim();
    $('btnSaveDates').disabled = true;
    S.updateRoom(id, { d1: d1, d2: d2 }).then(function (r) { room = r; render(); toast('dateToast', '保存しました。'); })
      .catch(function (e) { setErr('保存に失敗しました。(' + e.message + ')'); })
      .then(function () { $('btnSaveDates').disabled = false; });
  });
  $('btnSaveYearly').addEventListener('click', function () {
    var dates = S.parseDatesAuto($('yearlyText').value);
    if (!dates.length) { toast('yearlyToast', '日付を読み取れませんでした。「10月25日11時30分」の形で貼り付けてください。'); return; }
    $('btnSaveYearly').disabled = true;
    S.updateRoom(id, { dates: dates, a: null, b: null, round: '' }).then(function (r) { room = r; $('yearlyText').value = ''; render(); toast('yearlyToast', dates.length + '件を保存しました。'); })
      .catch(function (e) { setErr('保存に失敗しました。(' + e.message + ')'); })
      .then(function () { $('btnSaveYearly').disabled = false; });
  });
  $('btnSaveText').addEventListener('click', function () {
    var text = { a: $('txtA').value, b: $('txtB').value, title: $('txtTitle').value, hint: $('txtHint').value };
    $('btnSaveText').disabled = true;
    S.updateRoom(id, { text: text }).then(function (r) { room = r; render(); toast('textToast', '保存しました。'); })
      .catch(function (e) { setErr('保存に失敗しました。(' + e.message + ')'); })
      .then(function () { $('btnSaveText').disabled = false; });
  });
  var resetTimer = null;
  function disarmReset() { resetArmed = false; show($('resetConfirm'), false); $('btnReset').textContent = '選択をリセット'; if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; } }
  $('btnReset').addEventListener('click', function () {
    if (!resetArmed) {
      resetArmed = true; show($('resetConfirm'), true); $('btnReset').textContent = 'もう一度押すとリセット';
      resetTimer = setTimeout(disarmReset, 8000); // 8秒たったら取り消し
      return;
    }
    disarmReset();
    S.updateRoom(id, { a: null, b: null, round: '' }).then(function (r) { room = r; render(); })
      .catch(function (e) { setErr('リセットに失敗しました。(' + e.message + ')'); });
  });

  function toast(elId, m) { $(elId).textContent = m; setTimeout(function () { $(elId).textContent = ''; }, 3000); }
  function wireCopy(copyBtn, textFn, toastId) {
    $(copyBtn).addEventListener('click', function () { S.copyText(textFn()).then(function () { toast(toastId, 'コピーしました。'); }); });
  }
  function wireShare(lineBtn, copyBtn, textFn, toastId) {
    $(lineBtn).addEventListener('click', function () {
      var t = textFn();
      if (navigator.share) navigator.share({ text: t }).catch(function () {});
      else window.open(S.lineShareUrl(t), '_blank');
    });
    wireCopy(copyBtn, textFn, toastId);
  }
  wireShare('btnLineResult', 'btnCopyResult', function () { return S.shareTextFor(room, S.decide(room)) + location.href; }, 'resultToast');

  // 自動更新: 20秒ごと、および画面に戻ったとき
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  if (id) timer = setInterval(refresh, 20000);

  render();
  refresh();
})();
