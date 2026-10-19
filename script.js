// ── DATA ──────────────────────────────────────────────────
// 旧キー(cal2026_*)からの引き継ぎ（タイトル以外）
['events','colorhist'].forEach(function(k){
  try {
    if(localStorage.getItem('taku_cal_'+k) === null && localStorage.getItem('cal2026_'+k) !== null)
      localStorage.setItem('taku_cal_'+k, localStorage.getItem('cal2026_'+k));
  } catch(e) {}
});
var DEFAULT_TITLE = '卓カレンダー';
var viewYear = new Date().getFullYear();
var events = JSON.parse(localStorage.getItem('taku_cal_events') || '[]');
var BG_DEFAULT = {
  mode: 'gradient',
  colors: ['#fff5f8','#fde7ee','#fbd5e1'],
  angle: 135,
  pattern: { type: 'dots', base: '#fff5f8', color: '#f08aa8', size: 36, alpha: 45 },
  image: { data: '', fade: 50, fit: 'cover' }
};
var bgSettings = (function(){
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('taku_cal_bg') || 'null'); } catch(e) {}
  var d = JSON.parse(JSON.stringify(BG_DEFAULT));
  if(saved) {
    if(saved.mode)   d.mode   = saved.mode;
    if(saved.colors) d.colors = saved.colors;
    if(saved.angle !== undefined) d.angle = saved.angle;
    if(saved.pattern) Object.assign(d.pattern, saved.pattern);
    if(saved.image)   Object.assign(d.image, saved.image);
  }
  return d;
})();
var bgDraft = null;
var calColors = JSON.parse(localStorage.getItem('taku_cal_colors') || 'null') || {
  text:    '#4a3b42',
  muted:   '#8a7881',
  border:  '#f3d3dd',
  cardBg:  '#ffffff',
  cardAlpha: 82
};
// カラーヒストリー（最大10件）: [{mode, c1, c2}]
var colorHistory = JSON.parse(localStorage.getItem('taku_cal_colorhist') || '[]');

// CPカラー（グラデーションの保存）: [{id, name, c1, c2}]
var cpColors = [];
try { cpColors = JSON.parse(localStorage.getItem('taku_cal_cpcolors') || '[]'); } catch(e) {}
function saveCpColors() { try { localStorage.setItem('taku_cal_cpcolors', JSON.stringify(cpColors)); } catch(e) {} }

function saveCpColor() {
  if(colorMode !== 'gradient') { showToast('「2色グラデーション」を選んでから保存してください'); return; }
  var c1 = document.getElementById('evColor1').value;
  var c2 = document.getElementById('evColor2').value;
  var nameEl = document.getElementById('cpName');
  var name = nameEl.value.trim() || 'CPカラー' + (cpColors.length + 1);
  cpColors.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: name, c1: c1, c2: c2 });
  saveCpColors();
  nameEl.value = '';
  renderCpColors();
  showToast('CPカラーを保存しました');
}
function renderCpColors() {
  var row = document.getElementById('cpColorRow');
  if(!row) return;
  row.innerHTML = '';
  if(cpColors.length === 0) {
    row.innerHTML = '<span style="font-size:0.7rem;color:var(--text-muted)">まだ保存されていません</span>';
    return;
  }
  cpColors.forEach(function(cp){
    var item = document.createElement('div');
    item.className = 'cp-item';
    var sw = document.createElement('div');
    sw.className = 'cp-swatch';
    sw.style.background = 'linear-gradient(90deg,' + cp.c1 + ',' + cp.c2 + ')';
    sw.title = cp.c1 + ' → ' + cp.c2;
    sw.addEventListener('click', function(){
      setColorMode('gradient');
      document.getElementById('evColor1').value = cp.c1;
      document.getElementById('evColor2').value = cp.c2;
      updateColorPreview();
    });
    var nm = document.createElement('span');
    nm.textContent = cp.name;
    var del = document.createElement('button');
    del.textContent = '×';
    del.title = '削除';
    del.addEventListener('click', function(){
      cpColors = cpColors.filter(function(x){ return x.id !== cp.id; });
      saveCpColors();
      renderCpColors();
    });
    item.appendChild(sw); item.appendChild(nm); item.appendChild(del);
    row.appendChild(item);
  });
}

function saveColorHistory() { localStorage.setItem('taku_cal_colorhist', JSON.stringify(colorHistory)); }

function pushColorHistory(mode, c1, c2) {
  // 同一エントリ除去
  colorHistory = colorHistory.filter(function(h){
    return !(h.mode===mode && h.c1===c1 && h.c2===c2);
  });
  colorHistory.unshift({mode:mode, c1:c1, c2:c2});
  if(colorHistory.length > 10) colorHistory = colorHistory.slice(0,10);
  saveColorHistory();
}

function renderColorHistory() {
  var row = document.getElementById('colorHistoryRow');
  if(!row) return;
  row.innerHTML = '';
  if(colorHistory.length === 0) {
    row.innerHTML = '<span style="font-size:0.7rem;color:var(--text-muted)">まだ履歴がありません</span>';
    return;
  }
  colorHistory.forEach(function(h){
    var sw = document.createElement('div');
    sw.className = 'history-swatch' + (h.mode==='gradient' ? ' grad' : '');
    sw.title = h.mode==='gradient' ? h.c1+' → '+h.c2 : h.c1;
    if(h.mode==='gradient') sw.style.background = 'linear-gradient(90deg,'+h.c1+','+h.c2+')';
    else sw.style.background = h.c1;
    sw.addEventListener('click', function(){
      setColorMode(h.mode);
      document.getElementById('evColor1').value = h.c1;
      document.getElementById('evColor2').value = h.c2;
      updateColorPreview();
    });
    row.appendChild(sw);
  });
}

var editingId = null;
var colorMode = 'solid';
var dragStartDate = null;
var dragEndDate = null;
var isDragging = false;
var currentMonth = 0;

// イベント移動ドラッグ用
var isMovingEvent = false;
var movingEventId = null;
var movingEventOriginDate = null; // ドラッグ開始日
var movingEventOffset = 0;        // 開始日からつかんだ日までのオフセット（日数）

// 月曜始まり: 月火水木金土日
var DOWS_HEADER = ['月','火','水','木','金','土','日'];
var MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function saveEvents() { localStorage.setItem('taku_cal_events', JSON.stringify(events)); }
function saveBg() {
  try { localStorage.setItem('taku_cal_bg', JSON.stringify(bgSettings)); return true; }
  catch(e) { showToast('背景の保存に失敗しました（画像が大きすぎる可能性があります）'); return false; }
}
function saveColors() { localStorage.setItem('taku_cal_colors', JSON.stringify(calColors)); }

// ── カラーユーティリティ ──────────────────────────────────
// hex → {r,g,b}
function hexToRgb(hex) {
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  return { r: parseInt(hex.slice(0,2),16), g: parseInt(hex.slice(2,4),16), b: parseInt(hex.slice(4,6),16) };
}
// 相対輝度 (0〜1)
function luminance(hex) {
  var c = hexToRgb(hex);
  var r = c.r/255, g = c.g/255, b = c.b/255;
  r = r<=0.04045 ? r/12.92 : Math.pow((r+0.055)/1.055,2.4);
  g = g<=0.04045 ? g/12.92 : Math.pow((g+0.055)/1.055,2.4);
  b = b<=0.04045 ? b/12.92 : Math.pow((b+0.055)/1.055,2.4);
  return 0.2126*r + 0.7152*g + 0.0722*b;
}
// 複数色の平均輝度
function avgLuminance(colors) {
  var sum = colors.reduce(function(acc,c){ return acc + luminance(c); }, 0);
  return sum / colors.length;
}
// hex を明度調整して返す（amt: -1〜1）
function adjustLightness(hex, amt) {
  var c = hexToRgb(hex);
  function clamp(v){ return Math.max(0,Math.min(255,Math.round(v))); }
  return '#' + [c.r,c.g,c.b].map(function(v){
    return clamp(v + amt*255).toString(16).padStart(2,'0');
  }).join('');
}
// 背景色から自動でカレンダーカラーを計算
function calcAutoCalColors(colors) {
  var lum = avgLuminance(colors);
  var dark = lum > 0.4; // 明るい背景 → 暗いテキスト
  var base = colors[0];
  if(dark) {
    // 明るい背景: テキストを暗く
    return {
      text:      adjustLightness(base, -0.65),
      muted:     adjustLightness(base, -0.40),
      border:    adjustLightness(base, -0.18),
      cardBg:    '#ffffff',
      cardAlpha: 82
    };
  } else {
    // 暗い背景: テキストを明るく
    return {
      text:      adjustLightness(base, 0.85),
      muted:     adjustLightness(base, 0.55),
      border:    adjustLightness(base, 0.30),
      cardBg:    '#000000',
      cardAlpha: 30
    };
  }
}
// CSS変数に適用
function applyCalColors() {
  var root = document.documentElement;
  var alpha = Math.round((calColors.cardAlpha / 100) * 255).toString(16).padStart(2,'0');
  var cardBgWithAlpha = calColors.cardBg + alpha;
  root.style.setProperty('--cal-text',       calColors.text);
  root.style.setProperty('--cal-text-muted',  calColors.muted);
  root.style.setProperty('--cal-border',      calColors.border);
  root.style.setProperty('--cal-card-bg',     cardBgWithAlpha);
  root.style.setProperty('--cal-title',       calColors.text);
}
// モーダル内のピッカーへ反映
function syncColorPickersFromCalColors() {
  document.getElementById('calTextColor').value   = calColors.text;
  document.getElementById('calMutedColor').value  = calColors.muted;
  document.getElementById('calBorderColor').value = calColors.border;
  document.getElementById('calCardBgColor').value = calColors.cardBg;
  document.getElementById('calCardAlpha').value   = calColors.cardAlpha;
  document.getElementById('calCardAlphaVal').textContent = calColors.cardAlpha + '%';
}
// 自動ボタン
function autoCalColors() {
  collectBgDraft();
  var colors = bgDraft.mode === 'pattern' ? [bgDraft.pattern.base]
             : bgDraft.mode === 'image'   ? ['#ffffff']
             : bgDraft.colors;
  var auto = calcAutoCalColors(colors);
  calColors = auto;
  syncColorPickersFromCalColors();
  previewCalColors();
  showToast('背景色から自動設定しました');
}
// ピッカー変更時のプレビュー（まだ確定しない）
function previewCalColors() {
  calColors.text      = document.getElementById('calTextColor').value;
  calColors.muted     = document.getElementById('calMutedColor').value;
  calColors.border    = document.getElementById('calBorderColor').value;
  calColors.cardBg    = document.getElementById('calCardBgColor').value;
  calColors.cardAlpha = parseInt(document.getElementById('calCardAlpha').value);
  document.getElementById('calCardAlphaVal').textContent = calColors.cardAlpha + '%';
  applyCalColors();
}

// ── 日本の祝日（年ごとに計算） ────────────────────────────
var holidayCache = {};
function pad2(n) { return String(n).padStart(2,'0'); }
function nthMonday(y, m, n) {            // m: 0始まり
  var first = new Date(y, m, 1).getDay();
  return 1 + ((8 - first) % 7) + (n - 1) * 7;
}
function calcHolidays(y) {
  var map = {};
  function add(m, d, name) { map[y + '-' + pad2(m+1) + '-' + pad2(d)] = name; }
  add(0, 1, '元日');
  add(0, nthMonday(y,0,2), '成人の日');
  add(1, 11, '建国記念の日');
  if(y >= 2020) add(1, 23, '天皇誕生日');
  var spring = Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  var autumn = Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  add(2, spring, '春分の日');
  add(3, 29, '昭和の日');
  add(4, 3, '憲法記念日');
  add(4, 4, 'みどりの日');
  add(4, 5, 'こどもの日');
  add(6, nthMonday(y,6,3), '海の日');
  if(y >= 2016) add(7, 11, '山の日');
  add(8, nthMonday(y,8,3), '敬老の日');
  add(8, autumn, '秋分の日');
  add(9, nthMonday(y,9,2), 'スポーツの日');
  add(10, 3, '文化の日');
  add(10, 23, '勤労感謝の日');
  // 振替休日（日曜の祝日 → 次の祝日でない日）
  Object.keys(map).forEach(function(k){
    var p = k.split('-').map(Number);
    var dt = new Date(p[0], p[1]-1, p[2]);
    if(dt.getDay() === 0) {
      do { dt.setDate(dt.getDate() + 1); }
      while(map[dt.getFullYear() + '-' + pad2(dt.getMonth()+1) + '-' + pad2(dt.getDate())]);
      map[dt.getFullYear() + '-' + pad2(dt.getMonth()+1) + '-' + pad2(dt.getDate())] = '振替休日';
    }
  });
  // 国民の休日（祝日に挟まれた平日）
  Object.keys(map).forEach(function(k){
    var p = k.split('-').map(Number);
    var dt = new Date(p[0], p[1]-1, p[2] + 2);
    var k2 = dt.getFullYear() + '-' + pad2(dt.getMonth()+1) + '-' + pad2(dt.getDate());
    var mid = new Date(p[0], p[1]-1, p[2] + 1);
    var km = mid.getFullYear() + '-' + pad2(mid.getMonth()+1) + '-' + pad2(mid.getDate());
    if(map[k2] && !map[km] && mid.getDay() !== 0) map[km] = '国民の休日';
  });
  return map;
}
function isHoliday(ds) {
  var y = parseInt(ds.slice(0,4));
  if(!holidayCache[y]) holidayCache[y] = calcHolidays(y);
  return holidayCache[y][ds] || null;
}
function dateStr(y,m,d) {
  return y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}
function cmpDate(a,b) { return a < b ? -1 : a > b ? 1 : 0; }
function daysInMonth(m) { return new Date(viewYear, m+1, 0).getDate(); }

// 月曜始まりのオフセット: 月=0, 火=1, ..., 日=6
function firstDowMon(m) {
  var dow = new Date(viewYear, m, 1).getDay(); // 0=日, 1=月, ..., 6=土
  return (dow + 6) % 7;
}

// その日の曜日インデックス（月曜始まり）: 月=0 ... 土=5, 日=6
function dowMon(m, d) {
  var dow = new Date(viewYear, m, d).getDay();
  return (dow + 6) % 7;
}

function eventsForDay(ds) {
  return events.filter(function(e){ return cmpDate(e.start,ds)<=0 && cmpDate(e.end,ds)>=0; });
}

function getEventBg(ev) {
  if(ev.colorMode === 'gradient') return 'linear-gradient(90deg,' + ev.color1 + ',' + ev.color2 + ')';
  return ev.color1;
}

// ── BACKGROUND ───────────────────────────────────────────
var PATTERNS = [
  {id:'dots',   name:'ドット'},
  {id:'stripes',name:'ストライプ'},
  {id:'check',  name:'チェック'},
  {id:'grid',   name:'方眼'},
  {id:'heart',  name:'ハート'},
  {id:'star',   name:'星'}
];
function rgbaOf(hex, alpha) {
  var c = hexToRgb(hex);
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}
function svgTile(shape, hex, alpha, size) {
  var body = shape === 'heart'
    ? '<path transform="translate(12 12)" d="M12 21C5 16 2 12.5 2 9a5 5 0 0 1 10-1.5A5 5 0 0 1 22 9c0 3.5-3 7-10 12z"/>'
    : '<polygon points="24,10 27.7,19.5 38,20.2 30,26.8 32.6,37 24,31.5 15.4,37 18,26.8 10,20.2 20.3,19.5"/>';
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 48 48">' +
            '<g fill="' + hex + '" fill-opacity="' + alpha + '">' + body + '</g></svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';
}
// 背景設定 → {color, image, size, repeat, position}
function bgStyleOf(s) {
  if(s.mode === 'pattern') {
    var p = s.pattern, size = p.size, c = rgbaOf(p.color, p.alpha / 100), img, sz = size + 'px ' + size + 'px';
    if(p.type === 'dots')         img = 'radial-gradient(circle, ' + c + ' 0 16%, transparent 17%)';
    else if(p.type === 'stripes') { img = 'repeating-linear-gradient(45deg, ' + c + ' 0 ' + (size/4) + 'px, transparent ' + (size/4) + 'px ' + (size/2) + 'px)'; sz = 'auto'; }
    else if(p.type === 'check')   img = 'conic-gradient(' + c + ' 0 25%, transparent 0 50%, ' + c + ' 0 75%, transparent 0)';
    else if(p.type === 'grid')    { img = 'linear-gradient(' + c + ' 1.5px, transparent 1.5px), linear-gradient(90deg, ' + c + ' 1.5px, transparent 1.5px)'; sz = sz + ', ' + sz; }
    else {
      var t = Math.round(size * 1.4);
      img = svgTile(p.type, p.color, p.alpha / 100, t);
      sz = t + 'px ' + t + 'px';
    }
    return { color: p.base, image: img, size: sz, repeat: 'repeat', position: '0 0' };
  }
  if(s.mode === 'image' && s.image.data) {
    var f = 'rgba(255,255,255,' + (s.image.fade / 100) + ')';
    var tile = s.image.fit === 'tile';
    return {
      color: '#fff5f8',
      image: 'linear-gradient(' + f + ',' + f + '), url("' + s.image.data + '")',
      size: tile ? 'auto, 240px auto' : 'auto, cover',
      repeat: tile ? 'repeat, repeat' : 'repeat, no-repeat',
      position: '0 0, center'
    };
  }
  return { color: 'transparent', image: 'linear-gradient(' + s.angle + 'deg, ' + s.colors.join(', ') + ')', size: 'auto', repeat: 'no-repeat', position: '0 0' };
}
function paintBg(el, s) {
  var st = bgStyleOf(s);
  el.style.background = 'none';
  el.style.backgroundColor    = st.color;
  el.style.backgroundImage    = st.image;
  el.style.backgroundSize     = st.size;
  el.style.backgroundRepeat   = st.repeat;
  el.style.backgroundPosition = st.position;
}
function applyBgToDom() {
  paintBg(document.getElementById('bgPreview'), bgSettings);
  paintBg(document.getElementById('bgMonthPreview'), bgSettings);
  paintBg(document.body, bgSettings);
  document.body.style.backgroundAttachment = bgSettings.mode === 'image' ? 'fixed' : 'scroll';
}

function showBgModal() {
  bgDraft = JSON.parse(JSON.stringify(bgSettings));
  var inputs = document.querySelectorAll('#bgColorRow .bgc');
  bgDraft.colors.forEach(function(c,i){ if(inputs[i]) inputs[i].value = c; });
  document.getElementById('bgAngle').value = bgDraft.angle;
  var p = bgDraft.pattern;
  document.getElementById('patBase').value  = p.base;
  document.getElementById('patColor').value = p.color;
  document.getElementById('patSize').value  = p.size;
  document.getElementById('patAlpha').value = p.alpha;
  document.getElementById('imgFade').value  = bgDraft.image.fade;
  buildPatternGrid();
  setImgFit(bgDraft.image.fit, true);
  syncColorPickersFromCalColors();
  setBgMode(bgDraft.mode);
  document.getElementById('bgModal').classList.add('open');
}
function closeBgModal() { document.getElementById('bgModal').classList.remove('open'); bgDraft = null; }

function setBgMode(mode) {
  bgDraft.mode = mode;
  ['Gradient','Pattern','Image'].forEach(function(n){
    document.getElementById('bgTab' + n).classList.toggle('active', mode === n.toLowerCase());
    document.getElementById('bgPane' + n).style.display = mode === n.toLowerCase() ? '' : 'none';
  });
  updateBgPreview();
}
function setImgFit(fit, silent) {
  bgDraft.image.fit = fit;
  document.getElementById('imgFitCover').classList.toggle('active', fit === 'cover');
  document.getElementById('imgFitTile').classList.toggle('active', fit === 'tile');
  if(!silent) updateBgPreview();
}
function buildPatternGrid() {
  var grid = document.getElementById('patternGrid');
  grid.innerHTML = '';
  PATTERNS.forEach(function(pt){
    var b = document.createElement('button');
    b.className = 'pattern-opt';
    b.dataset.type = pt.id;
    b.textContent = pt.name;
    b.addEventListener('click', function(){ bgDraft.pattern.type = pt.id; updateBgPreview(); });
    grid.appendChild(b);
  });
}
// 入力値をドラフトへ集める
function collectBgDraft() {
  var inputs = document.querySelectorAll('#bgColorRow .bgc');
  bgDraft.colors = Array.from(inputs).map(function(i){ return i.value; });
  bgDraft.angle  = parseInt(document.getElementById('bgAngle').value);
  bgDraft.pattern.base  = document.getElementById('patBase').value;
  bgDraft.pattern.color = document.getElementById('patColor').value;
  bgDraft.pattern.size  = parseInt(document.getElementById('patSize').value);
  bgDraft.pattern.alpha = parseInt(document.getElementById('patAlpha').value);
  bgDraft.image.fade    = parseInt(document.getElementById('imgFade').value);
}
function updateBgPreview() {
  if(!bgDraft) return;
  collectBgDraft();
  document.getElementById('bgAngleVal').textContent = bgDraft.angle + '°';
  document.getElementById('patSizeVal').textContent = bgDraft.pattern.size + 'px';
  document.getElementById('patAlphaVal').textContent = bgDraft.pattern.alpha + '%';
  document.getElementById('imgFadeVal').textContent = bgDraft.image.fade + '%';
  document.querySelectorAll('#patternGrid .pattern-opt').forEach(function(b){
    b.classList.toggle('active', b.dataset.type === bgDraft.pattern.type);
    var mini = JSON.parse(JSON.stringify(bgDraft));
    mini.mode = 'pattern'; mini.pattern.type = b.dataset.type; mini.pattern.size = 16;
    paintBg(b, mini);
  });
  paintBg(document.getElementById('bgPreviewBar'), bgDraft);
}
// 画像を読み込み、長辺1600pxに縮小して保存用にする
function loadBgImage(e) {
  var file = e.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var max = 1600, r = Math.min(1, max / Math.max(img.width, img.height));
      var cv = document.createElement('canvas');
      cv.width = Math.round(img.width * r);
      cv.height = Math.round(img.height * r);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      bgDraft.image.data = cv.toDataURL('image/jpeg', 0.82);
      updateBgPreview();
    };
    img.onerror = function(){ showToast('画像を読み込めませんでした'); };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}
function applyBg() {
  collectBgDraft();
  if(bgDraft.mode === 'image' && !bgDraft.image.data) { showToast('画像を選んでください'); return; }
  var prev = bgSettings;
  bgSettings = bgDraft;
  if(!saveBg()) { bgSettings = prev; return; }
  saveColors();
  applyBgToDom();
  applyCalColors();
  closeBgModal();
  renderYearView();
}

// ── YEAR VIEW ────────────────────────────────────────────
function renderYearView() {
  var t = localStorage.getItem('taku_cal_title');
  if(t === null) t = DEFAULT_TITLE;
  document.getElementById('titleInput').value = t;
  document.getElementById('yearTitle').textContent = t;
  document.getElementById('yearLabel').textContent = viewYear + '年';
  applyBgToDom();

  var grid = document.getElementById('yearGrid');
  grid.innerHTML = '';
  for(var m = 0; m < 12; m++) {
    (function(mo){
      var card = document.createElement('div');
      card.className = 'month-card';
      card.innerHTML = '<h3>' + viewYear + ' ' + MONTHS[mo] + '</h3><div class="mini-cal" id="mini-' + mo + '"></div>';
      card.addEventListener('click', function(){ openMonth(mo); });
      grid.appendChild(card);
      renderMiniCal(mo);
    })(m);
  }
}

function renderMiniCal(m) {
  var el = document.getElementById('mini-' + m);
  if(!el) return;
  el.innerHTML = '';

  // ヘッダー: 月火水木金土日
  DOWS_HEADER.forEach(function(d){
    var s = document.createElement('div');
    s.className = 'dow';
    s.textContent = d;
    el.appendChild(s);
  });

  // 月曜始まりの空白
  var fd = firstDowMon(m);
  for(var i = 0; i < fd; i++) {
    var b = document.createElement('div');
    el.appendChild(b);
  }

  var dim = daysInMonth(m);
  for(var d = 1; d <= dim; d++) {
    var ds = dateStr(viewYear, m, d);
    var div = document.createElement('div');
    div.className = 'mini-day';

    var dw = dowMon(m, d); // 0=月...5=土,6=日
    if(dw === 6) div.classList.add('sun');
    if(dw === 5) div.classList.add('sat');
    if(isHoliday(ds)) div.classList.add('holiday');

    div.textContent = d;

    var evs = eventsForDay(ds);
    if(evs.length > 0) {
      var ev = evs[0];
      var isStart = ev.start === ds;
      var isEnd   = ev.end   === ds;
      div.style.background = getEventBg(ev);
      div.classList.add('has-event');
      if(isStart && isEnd)    div.classList.add('event-solo');
      else if(isStart)        div.classList.add('event-start');
      else if(isEnd)          div.classList.add('event-end');
      else                    div.classList.add('event-mid');
    }
    el.appendChild(div);
  }
}

// ── MONTH VIEW ───────────────────────────────────────────
function changeYear(delta) {
  viewYear += delta;
  renderYearView();
}
function openMonth(m) {
  currentMonth = m;
  document.getElementById('yearView').style.display  = 'none';
  document.getElementById('monthView').style.display = 'block';
  document.getElementById('monthViewTitle').textContent = viewYear + '年 ' + MONTHS[m];
  renderMonthFull(m);
}
function backToYear() {
  document.getElementById('yearView').style.display  = 'block';
  document.getElementById('monthView').style.display = 'none';
  renderYearView();
}

function renderMonthFull(m) {
  var cal = document.getElementById('monthFullCal');
  cal.innerHTML = '';

  // ヘッダー: 月火水木金土日
  DOWS_HEADER.forEach(function(d, i){
    var lbl = document.createElement('div');
    lbl.className = 'dow-label';
    if(i === 5) lbl.classList.add('sat');
    if(i === 6) lbl.classList.add('sun');
    lbl.textContent = d;
    cal.appendChild(lbl);
  });

  // 月曜始まりの空白
  var fd = firstDowMon(m);
  for(var i = 0; i < fd; i++) {
    var b = document.createElement('div');
    b.className = 'cal-day empty';
    cal.appendChild(b);
  }

  var dim = daysInMonth(m);
  var today = new Date();

  for(var d = 1; d <= dim; d++) {
    var ds = dateStr(viewYear, m, d);
    var dw = dowMon(m, d); // 0=月...5=土,6=日

    var cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.dataset.date = ds;

    if(dw === 6) cell.classList.add('sun');
    if(dw === 5) cell.classList.add('sat');
    var hName = isHoliday(ds);
    if(hName) cell.classList.add('holiday');
    if(today.getFullYear()===viewYear && today.getMonth()===m && today.getDate()===d)
      cell.classList.add('today');

    var numSpan = document.createElement('span');
    numSpan.className = 'day-num';
    numSpan.textContent = d;
    cell.appendChild(numSpan);

    if(hName) {
      var hSpan = document.createElement('div');
      hSpan.className = 'holiday-name';
      hSpan.textContent = hName;
      cell.appendChild(hSpan);
    }

    // event bars
    var evs = eventsForDay(ds);
    evs.forEach(function(ev){
      var bar = document.createElement('div');
      bar.className = 'event-bar';
      bar.style.background = getEventBg(ev);
      bar.title = ev.title;
      bar.dataset.evid = ev.id;
      if(ev.start === ds) {
        var lbl = document.createElement('div');
        lbl.className = 'event-label-inline';
        lbl.textContent = ev.title;
        bar.appendChild(lbl);
      }
      // クリック → 編集（移動ドラッグ後は無視）
      bar.addEventListener('click', function(e){
        e.stopPropagation();
        if(isMovingEvent) return;
        openEditEvent(ev.id);
      });
      // バードラッグ開始（PC）
      bar.addEventListener('mousedown', function(e){
        e.stopPropagation();
        startMoveEvent(ev.id, bar.closest('.cal-day').dataset.date, bar);
      });
      // バータッチ開始（スマホ）
      bar.addEventListener('touchstart', function(e){
        e.stopPropagation();
        e.preventDefault();
        startMoveEvent(ev.id, bar.closest('.cal-day').dataset.date, bar);
      }, {passive:false});
      cell.appendChild(bar);
    });

    // drag（新規範囲選択）
    cell.addEventListener('mousedown', function(e){
      if(e.target.classList.contains('event-bar') || e.target.classList.contains('event-label-inline')) return;
      if(isMovingEvent) return;
      startDrag(this.dataset.date);
    });
    cell.addEventListener('mouseover', function(){
      if(isMovingEvent) { hoverMoveTarget(this.dataset.date); return; }
      if(isDragging) continueDrag(this.dataset.date);
    });
    cell.addEventListener('mouseup', function(){
      if(isMovingEvent) { endMoveEvent(this.dataset.date); return; }
      if(isDragging) endDrag(this.dataset.date);
    });
    cell.addEventListener('touchstart', function(e){
      if(isMovingEvent) return;
      e.preventDefault();
      startDrag(this.dataset.date);
    }, {passive:false});
    cell.addEventListener('touchmove', function(e){
      e.preventDefault();
      var t = e.touches[0];
      var el = document.elementFromPoint(t.clientX, t.clientY);
      var targetDate = null;
      if(el && el.dataset.date) targetDate = el.dataset.date;
      else if(el && el.closest && el.closest('.cal-day')) {
        var p = el.closest('.cal-day');
        if(p && p.dataset.date) targetDate = p.dataset.date;
      }
      if(!targetDate) return;
      if(isMovingEvent) hoverMoveTarget(targetDate);
      else if(isDragging) continueDrag(targetDate);
    }, {passive:false});
    cell.addEventListener('touchend', function(e){
      var t = e.changedTouches[0];
      var el = document.elementFromPoint(t.clientX, t.clientY);
      var targetDate = this.dataset.date;
      if(el && el.dataset.date) targetDate = el.dataset.date;
      else if(el && el.closest && el.closest('.cal-day')) {
        var p = el.closest('.cal-day');
        if(p && p.dataset.date) targetDate = p.dataset.date;
      }
      if(isMovingEvent) { endMoveEvent(targetDate); return; }
      if(isDragging) endDrag(targetDate || dragEndDate);
    });
    cell.addEventListener('click', function(e){
      if(isDragging || isMovingEvent) return;
      if(e.target.classList.contains('event-bar') || e.target.classList.contains('event-label-inline')) return;
      openNewEvent(this.dataset.date, this.dataset.date);
    });

    cal.appendChild(cell);
  }
}

// ── DRAG SELECT ──────────────────────────────────────────
function startDrag(ds) {
  isDragging = true;
  dragStartDate = ds;
  dragEndDate   = ds;
  updateSelectionHighlight();
}
function continueDrag(ds) {
  if(!isDragging) return;
  dragEndDate = ds;
  updateSelectionHighlight();
}
function endDrag(ds) {
  dragEndDate = ds;
  isDragging = false;
  clearSelectionHighlight();
  var s = dragStartDate, e = dragEndDate;
  if(s > e) { var tmp=s; s=e; e=tmp; }
  openNewEvent(s, e);
}
function updateSelectionHighlight() {
  var s = dragStartDate, e = dragEndDate;
  if(s > e) { var tmp=s; s=e; e=tmp; }
  document.querySelectorAll('.cal-day').forEach(function(cell){
    var d = cell.dataset.date;
    if(!d) return;
    if(d >= s && d <= e) cell.classList.add('in-selection');
    else cell.classList.remove('in-selection');
  });
}
function clearSelectionHighlight() {
  document.querySelectorAll('.cal-day').forEach(function(c){ c.classList.remove('in-selection'); });
}
// ── EVENT MOVE DRAG ──────────────────────────────────────
function dateDiffDays(ds1, ds2) {
  var a = new Date(ds1), b = new Date(ds2);
  return Math.round((b - a) / 86400000);
}
function addDays(ds, n) {
  var d = new Date(ds);
  d.setDate(d.getDate() + n);
  return dateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

function startMoveEvent(evId, grabbedDate, barEl) {
  var ev = events.find(function(e){ return e.id === evId; });
  if(!ev) return;
  isMovingEvent = true;
  movingEventId = evId;
  movingEventOriginDate = grabbedDate;
  // つかんだ日が開始日から何日目か
  movingEventOffset = dateDiffDays(ev.start, grabbedDate);
  // バーを半透明に
  document.querySelectorAll('.event-bar[data-evid="' + evId + '"]').forEach(function(b){
    b.classList.add('moving');
  });
  document.body.style.cursor = 'grabbing';
}

function hoverMoveTarget(ds) {
  if(!isMovingEvent || !ds) return;
  document.querySelectorAll('.cal-day.move-target').forEach(function(c){ c.classList.remove('move-target'); });
  // 移動先の開始日を計算
  var ev = events.find(function(e){ return e.id === movingEventId; });
  if(!ev) return;
  var newStart = addDays(ds, -movingEventOffset);
  var duration = dateDiffDays(ev.start, ev.end);
  var newEnd = addDays(newStart, duration);
  // 対象月内のセルにハイライト
  document.querySelectorAll('.cal-day[data-date]').forEach(function(cell){
    var d = cell.dataset.date;
    if(d >= newStart && d <= newEnd) cell.classList.add('move-target');
  });
}

function endMoveEvent(ds) {
  if(!isMovingEvent) return;
  var ev = events.find(function(e){ return e.id === movingEventId; });

  // クリーンアップ
  document.querySelectorAll('.event-bar.moving').forEach(function(b){ b.classList.remove('moving'); });
  document.querySelectorAll('.cal-day.move-target').forEach(function(c){ c.classList.remove('move-target'); });
  document.body.style.cursor = '';
  isMovingEvent = false;

  if(!ev || !ds) { movingEventId = null; return; }

  var newStart = addDays(ds, -movingEventOffset);
  var duration = dateDiffDays(ev.start, ev.end);
  var newEnd = addDays(newStart, duration);

  // 同じ場所なら何もしない → クリックとして扱う
  if(newStart === ev.start) {
    movingEventId = null;
    return;
  }

  ev.start = newStart;
  ev.end   = newEnd;
  saveEvents();
  renderMonthFull(currentMonth);
  renderMiniCal(currentMonth);
  showToast('移動しました');
  movingEventId = null;
}

// mouseupをdocumentでも拾う（セル外でドロップした場合）
document.addEventListener('mouseup', function(e){
  if(isMovingEvent) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var targetDate = null;
    if(el && el.dataset.date) targetDate = el.dataset.date;
    else if(el && el.closest && el.closest('.cal-day')) {
      var p = el.closest('.cal-day');
      if(p) targetDate = p.dataset.date;
    }
    endMoveEvent(targetDate);
    return;
  }
  if(isDragging){ isDragging=false; clearSelectionHighlight(); }
});

// ── EVENT MODAL ──────────────────────────────────────────
function openNewEvent(start, end) {
  editingId = null;
  document.getElementById('eventModalTitle').textContent = '予定を追加';
  document.getElementById('evTitle').value  = '';
  document.getElementById('evMemo').value   = '';
  document.getElementById('evStart').value  = start;
  document.getElementById('evEnd').value    = end;
  document.getElementById('evColor1').value = '#f08aa8';
  document.getElementById('evColor2').value = '#d9547e';
  document.getElementById('deleteEvBtn').style.display = 'none';
  setColorMode('solid');
  updateColorPreview();
  renderColorHistory();
  renderCpColors();
  document.getElementById('eventModal').classList.add('open');
  setTimeout(function(){ document.getElementById('evTitle').focus(); }, 100);
}
function openEditEvent(id) {
  var ev = events.find(function(e){ return e.id === id; });
  if(!ev) return;
  editingId = id;
  document.getElementById('eventModalTitle').textContent = '予定を編集';
  document.getElementById('evTitle').value  = ev.title;
  document.getElementById('evMemo').value   = ev.memo || '';
  document.getElementById('evStart').value  = ev.start;
  document.getElementById('evEnd').value    = ev.end;
  document.getElementById('evColor1').value = ev.color1 || '#f08aa8';
  document.getElementById('evColor2').value = ev.color2 || '#d9547e';
  document.getElementById('deleteEvBtn').style.display = '';
  setColorMode(ev.colorMode || 'solid');
  updateColorPreview();
  renderColorHistory();
  renderCpColors();
  document.getElementById('eventModal').classList.add('open');
}
function closeEventModal() { document.getElementById('eventModal').classList.remove('open'); }

function setColorMode(mode) {
  colorMode = mode;
  document.getElementById('tabSolid').classList.toggle('active', mode==='solid');
  document.getElementById('tabGrad').classList.toggle('active',  mode==='gradient');
  document.getElementById('color2Wrap').style.display = mode==='gradient' ? '' : 'none';
  updateColorPreview();
}
function updateColorPreview() {
  var c1 = document.getElementById('evColor1').value;
  var c2 = document.getElementById('evColor2').value;
  var prev = document.getElementById('colorPreview');
  if(colorMode==='gradient') prev.style.background = 'linear-gradient(90deg,' + c1 + ',' + c2 + ')';
  else prev.style.background = c1;
}

function saveEvent() {
  var title = document.getElementById('evTitle').value.trim() || '（無題）';
  var s = document.getElementById('evStart').value;
  var e = document.getElementById('evEnd').value;
  if(s > e){ var tmp=s; s=e; e=tmp; }

  var c1 = document.getElementById('evColor1').value;
  var c2 = document.getElementById('evColor2').value;

  var evData = {
    id:        editingId || (Date.now().toString(36) + Math.random().toString(36).slice(2)),
    title:     title,
    memo:      document.getElementById('evMemo').value,
    start:     s,
    end:       e,
    colorMode: colorMode,
    color1:    c1,
    color2:    c2,
  };

  if(editingId) {
    var idx = events.findIndex(function(ev){ return ev.id===editingId; });
    if(idx > -1) events[idx] = evData;
  } else {
    events.push(evData);
  }

  pushColorHistory(colorMode, c1, c2);
  saveEvents();
  closeEventModal();
  renderMonthFull(currentMonth);
  renderMiniCal(currentMonth);
  showToast('保存しました');
}

function deleteEvent() {
  if(!editingId) return;
  events = events.filter(function(ev){ return ev.id !== editingId; });
  saveEvents();
  closeEventModal();
  renderMonthFull(currentMonth);
  renderMiniCal(currentMonth);
  showToast('削除しました');
}

document.getElementById('eventModal').addEventListener('click', function(e){
  // 画面外クリックでは閉じない（保存・キャンセルボタンのみ）
});
document.getElementById('bgModal').addEventListener('click', function(e){
  if(e.target === this) closeBgModal();
});

// ── EXPORT / IMPORT ──────────────────────────────────────
function exportEvents() {
  var data = {
    title:  localStorage.getItem('taku_cal_title') || DEFAULT_TITLE,
    events: events,
    cpColors: cpColors,
    exportedAt: new Date().toISOString()
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'taku_calendar_events.json';
  a.click();
  showToast('エクスポートしました');
}

function importEvents(e) {
  var file = e.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var data = JSON.parse(ev.target.result);
      if(Array.isArray(data.events)) {
        events = data.events;
        saveEvents();
      } else if(Array.isArray(data)) {
        // eventsの配列直接の場合も対応
        events = data;
        saveEvents();
      } else {
        showToast('形式が正しくありません');
        return;
      }
      if(Array.isArray(data.cpColors)) { cpColors = data.cpColors; saveCpColors(); }
      if(data.title) {
        localStorage.setItem('taku_cal_title', data.title);
      }
      renderYearView();
      showToast('インポートしました（' + events.length + '件）');
    } catch(err) {
      showToast('読み込みエラー: ' + err.message);
    }
    // ファイル選択をリセット（同じファイルを再インポートできるよう）
    e.target.value = '';
  };
  reader.readAsText(file);
}

// ── MONTH SCREENSHOT ─────────────────────────────────────
function takeMonthScreenshot() {
  showToast('スクショ撮影中...');
  var target = document.getElementById('bgMonthPreview');
  setTimeout(function(){
    html2canvas(target, {
      scale: 2, useCORS: true, backgroundColor: null
    }).then(function(canvas){
      canvas.toBlob(function(blob){
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        var mName = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'][currentMonth];
        a.download = 'taku_calendar_' + viewYear + '_' + mName + '.png';
        a.click();
        showToast('ダウンロードしました！');
      }, 'image/png');
    });
  }, 200);
}

// ── FREE DAYS STATE ───────────────────────────────────────
var fdMode = 'single';
var fdSelectedMonths = [];
var fdExcludeDow = [];
var fdExcludeDates = [];
var exclCalMonth = 0;
var DOW_NAMES_FD = ['月','火','水','木','金','土','日'];
var MONTH_NAMES_FD = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function showFreeDaysModal() {
  fdExcludeDow = [];
  fdExcludeDates = [];
  document.querySelectorAll('#fdDowRow .dow-toggle').forEach(function(b){ b.classList.remove('active'); });
  document.getElementById('freeDaysOutput').value = '';
  setFdMode('single');
  exclCalMonth = currentMonth;
  renderExclCal();
  renderExclTags();
  buildMonthGrid();
  document.getElementById('freeDaysModal').classList.add('open');
}
function closeFreeDaysModal() {
  document.getElementById('freeDaysModal').classList.remove('open');
}
document.getElementById('freeDaysModal').addEventListener('click', function(e){
  if(e.target === this) closeFreeDaysModal();
});

function setFdMode(mode) {
  fdMode = mode;
  document.getElementById('fdMode1').classList.toggle('active', mode==='single');
  document.getElementById('fdMode2').classList.toggle('active', mode==='multi');
  document.getElementById('fdMultiMonths').style.display = mode==='multi' ? '' : 'none';
  if(mode==='multi' && fdSelectedMonths.length===0) fdSelectedMonths = [currentMonth];
  updateMonthGrid();
}

function buildMonthGrid() {
  var grid = document.getElementById('fdMonthGrid');
  grid.innerHTML = '';
  for(var m=0; m<12; m++){
    (function(mo){
      var btn = document.createElement('button');
      btn.className = 'month-check-btn';
      btn.textContent = MONTH_NAMES_FD[mo];
      btn.dataset.m = mo;
      btn.addEventListener('click', function(){
        var idx = fdSelectedMonths.indexOf(mo);
        if(idx===-1) fdSelectedMonths.push(mo);
        else fdSelectedMonths.splice(idx,1);
        updateMonthGrid();
      });
      grid.appendChild(btn);
    })(m);
  }
  updateMonthGrid();
}
function updateMonthGrid() {
  document.querySelectorAll('#fdMonthGrid .month-check-btn').forEach(function(btn){
    btn.classList.toggle('active', fdSelectedMonths.indexOf(parseInt(btn.dataset.m)) !== -1);
  });
}

function toggleDow(btn) {
  var dw = parseInt(btn.dataset.dw);
  var idx = fdExcludeDow.indexOf(dw);
  if(idx===-1){ fdExcludeDow.push(dw); btn.classList.add('active'); }
  else        { fdExcludeDow.splice(idx,1); btn.classList.remove('active'); }
}

function exclCalPrev() { exclCalMonth = (exclCalMonth+11)%12; renderExclCal(); }
function exclCalNext() { exclCalMonth = (exclCalMonth+1)%12;  renderExclCal(); }

function renderExclCal() {
  document.getElementById('exclCalTitle').textContent = viewYear + '年 ' + MONTH_NAMES_FD[exclCalMonth];
  var cal = document.getElementById('exclMiniCal');
  cal.innerHTML = '';
  DOW_NAMES_FD.forEach(function(d){
    var el = document.createElement('div');
    el.className = 'edow'; el.textContent = d; cal.appendChild(el);
  });
  var fd = firstDowMon(exclCalMonth);
  for(var i=0;i<fd;i++){ cal.appendChild(document.createElement('div')); }
  var dim = daysInMonth(exclCalMonth);
  for(var d=1; d<=dim; d++){
    var ds = dateStr(viewYear, exclCalMonth, d);
    var dw = dowMon(exclCalMonth, d);
    var el = document.createElement('div');
    el.className = 'excl-day';
    el.textContent = d;
    if(dw===5) el.classList.add('sat');
    if(dw===6) el.classList.add('sun');
    if(isHoliday(ds) && dw!==5 && dw!==6) el.classList.add('sun'); // 祝日も赤
    if(eventsForDay(ds).length > 0) {
      el.classList.add('has-ev');
    } else {
      if(fdExcludeDates.indexOf(ds) !== -1) el.classList.add('excluded');
      (function(dsCopy, elCopy){
        elCopy.addEventListener('click', function(){
          var idx = fdExcludeDates.indexOf(dsCopy);
          if(idx===-1) fdExcludeDates.push(dsCopy);
          else fdExcludeDates.splice(idx,1);
          renderExclCal();
          renderExclTags();
        });
      })(ds, el);
    }
    cal.appendChild(el);
  }
}

function renderExclTags() {
  var wrap = document.getElementById('exclTags');
  wrap.innerHTML = '';
  if(fdExcludeDates.length===0){
    wrap.innerHTML = '<span style="font-size:0.72rem;color:var(--text-muted)">なし</span>';
    return;
  }
  fdExcludeDates.slice().sort().forEach(function(ds){
    var a = ds.split('-').map(Number);
    var m = a[1]-1; var d = a[2];
    var label = (m+1)+'/'+d+'('+DOW_NAMES_FD[dowMon(m,d)]+')';
    var tag = document.createElement('div');
    tag.className = 'excl-tag';
    var btn = document.createElement('button');
    btn.textContent = '×';
    btn.onclick = (function(dsCopy){ return function(){ removeExclDate(dsCopy); }; })(ds);
    tag.innerHTML = label + ' ';
    tag.appendChild(btn);
    wrap.appendChild(tag);
  });
}
function removeExclDate(ds) {
  var idx = fdExcludeDates.indexOf(ds);
  if(idx !== -1) fdExcludeDates.splice(idx,1);
  renderExclCal(); renderExclTags();
}

function generateFreeDays() {
  var months = fdMode==='multi'
    ? fdSelectedMonths.slice().sort(function(a,b){return a-b;})
    : [currentMonth];
  if(fdMode==='multi' && months.length===0){ showToast('月を選択してください'); return; }
  var exclHoliday = document.getElementById('fdExclHoliday').checked;
  var lines = [];
  months.forEach(function(m){
    var dim = daysInMonth(m);
    for(var d=1; d<=dim; d++){
      var ds = dateStr(viewYear, m, d);
      var dw = dowMon(m, d);
      if(fdExcludeDow.indexOf(dw) !== -1) continue;
      if(fdExcludeDates.indexOf(ds) !== -1) continue;
      if(exclHoliday && isHoliday(ds)) continue;
      if(eventsForDay(ds).length > 0) continue;
      lines.push((m+1)+'/'+d+'('+DOW_NAMES_FD[dw]+')');
    }
  });
  document.getElementById('freeDaysOutput').value = lines.length > 0 ? lines.join('\n') : '（空き日程なし）';
}

function copyFreeDays() {
  var text = document.getElementById('freeDaysOutput').value;
  if(!text || text==='（空き日程なし）'){ showToast('コピーする内容がありません'); return; }
  navigator.clipboard.writeText(text).then(function(){
    showToast('コピーしました！');
  }).catch(function(){
    var ta = document.getElementById('freeDaysOutput');
    ta.select(); document.execCommand('copy');
    showToast('コピーしました！');
  });
}

// ── SCREENSHOT ───────────────────────────────────────────
function takeScreenshot() {
  document.getElementById('yearView').style.display  = 'block';
  document.getElementById('monthView').style.display = 'none';
  renderYearView();
  showToast('スクショ撮影中...');
  setTimeout(function(){
    html2canvas(document.getElementById('bgPreview'), {
      scale: 2, useCORS: true, backgroundColor: null
    }).then(function(canvas){
      canvas.toBlob(function(blob){
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'taku_calendar_' + viewYear + '.png';
        a.click();
        showToast('ダウンロードしました！');
      }, 'image/png');
    });
  }, 300);
}

// ── TITLE SYNC ───────────────────────────────────────────
document.getElementById('titleInput').addEventListener('input', function(){
  localStorage.setItem('taku_cal_title', this.value);
  document.getElementById('yearTitle').textContent = this.value || DEFAULT_TITLE;
});

// ── TOAST ────────────────────────────────────────────────
function showToast(msg) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 2200);
}

// ── INIT ─────────────────────────────────────────────────
function setCalWidth(v, noSave) {
  v = parseInt(v) || 1200;
  document.documentElement.style.setProperty('--cal-width', v + 'px');
  document.getElementById('widthSlider').value = v;
  document.getElementById('widthVal').textContent = v + 'px';
  if(!noSave) { try { localStorage.setItem('taku_cal_width', v); } catch(e) {} }
}
document.addEventListener('DOMContentLoaded', function() {
  var w = null;
  try { w = localStorage.getItem('taku_cal_width'); } catch(e) {}
  setCalWidth(w || 1200, true);
  var savedTitle = localStorage.getItem('taku_cal_title');
  document.getElementById('titleInput').value = (savedTitle !== null) ? savedTitle : DEFAULT_TITLE;
  applyBgToDom();
  applyCalColors();
  renderYearView();
});
