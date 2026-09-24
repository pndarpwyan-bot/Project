import './style.css';
import { createIcons, Crosshair, BriefcaseBusiness, ChartNoAxesCombined, VolumeX, Volume2, UserRound, Layers2, BarChart3, SlidersHorizontal, CircleHelp, CloudMoon, ScanEye, Box, Target, Timer, ArrowUpLeft, ShieldPlus, SignalHigh, ChevronDown, ArrowLeft, Headphones, Keyboard, Pause, HeartPulse, RotateCw, X, Flag, Trophy, ScanLine, HardDrive, Check, ShieldCheck, MousePointer2, Move, Monitor, Play, Home } from 'lucide';
import { Game, WEAPONS } from './game.js';

const icons = { Crosshair, BriefcaseBusiness, ChartNoAxesCombined, VolumeX, Volume2, UserRound, Layers2, BarChart3, SlidersHorizontal, CircleHelp, CloudMoon, ScanEye, Box, Target, Timer, ArrowUpLeft, ShieldPlus, SignalHigh, ChevronDown, ArrowLeft, Headphones, Keyboard, Pause, HeartPulse, RotateCw, X, Flag, Trophy, ScanLine, HardDrive, Check, ShieldCheck, MousePointer2, Move, Monitor, Play, Home };
const refreshIcons = () => createIcons({ icons });
const $ = (s) => document.querySelector(s);
const fa = (n) => Number(n).toLocaleString('fa-IR');
const defaults = { weapon:'m4', difficulty:'normal', sensitivity:1, quality:'medium', sound:false, volume:.28, stats:{ games:0, kills:0, wins:0, accuracy:0 } };
let saved;
try { saved=JSON.parse(localStorage.getItem('zero-line-v1')||'null'); } catch { saved=null; }
const settings={...defaults,...saved,stats:{...defaults.stats,...saved?.stats}};
if(!WEAPONS[settings.weapon])settings.weapon='m4';
if(!['easy','normal','hard'].includes(settings.difficulty))settings.difficulty='normal';
settings.sensitivity=Math.min(2.5,Math.max(.4,Number(settings.sensitivity)||1));
settings.volume=Math.min(.7,Math.max(0,Number(settings.volume)||0));
for(const key of Object.keys(defaults.stats))settings.stats[key]=Math.max(0,Number(settings.stats[key])||0);
const persist=()=>{try{localStorage.setItem('zero-line-v1',JSON.stringify(settings));}catch{/* Private browsing may disable persistent storage. */}};
let game, modalMode='', lastFocus=null, toastTimer, waveTimer, hitTimer, damageTimer, feedTimer;

const rifleSVG=(key)=>{
  const colors=key==='scar'?['#9d9378','#67614e']:key==='mp5'?['#9aa68d','#58614f']:['#a8b29a','#66705b'];
  return `<svg viewBox="0 0 320 85" aria-hidden="true"><g fill="${colors[0]}" stroke="${colors[1]}" stroke-width="1.2" transform="${key==='mp5'?'translate(20 0) scale(.88 1)':''}"><path d="M13 23 L60 24 L72 32 L111 31 L115 26 L208 26 L211 30 L256 30 L256 38 L209 38 L207 43 L149 43 L138 47 L124 47 L118 70 L108 71 L103 64 L111 44 L72 44 L57 51 L13 48 Z"/><path d="M145 43 L174 43 L176 66 L165 77 L144 73 Z"/><path d="M15 28 L53 29 L59 34 L51 41 L15 42Z" fill="${colors[1]}"/><path d="M260 31 L294 31 L294 29 L304 29 L304 39 L295 39 L294 37 L260 37Z"/><path d="M113 22H211V26H113Z M209 22H215V32H209Z M150 13H176V23H150Z M151 9H173V15H151Z M152 13H156V21H152Z M102 27H112V37H102Z"/><path d="M120 33H139V37H120Z M187 31H198V35H187Z M169 31H180V35H169Z M152 31H163V35H152Z" fill="${colors[1]}"/><path d="M122 43L121 55H139L144 43 M148 53L171 53 M148 60L171 60 M148 67L168 68" fill="none"/><path d="M79 31V43 M85 31V43 M91 31V43 M97 31V43 M219 30V38 M225 30V38 M231 30V38 M237 30V38 M243 30V38"/><path d="M105 29L109 20H113V29"/></g></svg>`;
};

function updateLoadout(){
  $('#selected-weapon-art').innerHTML=rifleSVG(settings.weapon);
  $('#selected-weapon-name').textContent=WEAPONS[settings.weapon].name;
  $('#selected-weapon-type').textContent=WEAPONS[settings.weapon].title;
  const stats={m4:[68,76,72],scar:[97,53,86],mp5:[50,96,61]};
  $('#armory-grid').innerHTML=Object.entries(WEAPONS).map(([key,w])=>`<button class="armory-card ${settings.weapon===key?'selected':''}" data-weapon="${key}" aria-pressed="${settings.weapon===key}"><div class="armory-tag"><span>${settings.weapon===key?'انتخاب‌شده':'قابل انتخاب'}</span><i data-lucide="${settings.weapon===key?'check':'arrow-up-left'}"></i></div><div class="weapon-silhouette">${rifleSVG(key)}</div><h3 dir="ltr">${w.name}</h3><p>${w.title} · خشاب ${fa(w.magazine)} تیر</p>${['قدرت','سرعت','دقت'].map((label,i)=>`<div class="weapon-stat"><span>${label}</span><div><b style="width:${stats[key][i]}%"></b></div></div>`).join('')}</button>`).join('');
  refreshIcons();
}

function updateDifficulty(){
  const texts={easy:['کم','برای شروع و آشنایی با میدان'],normal:['متوسط','تعادل بین چالش و هیجان'],hard:['بالا','دشمنان سریع‌تر، فرصت کمتر']};
  $('#difficulty-label').textContent=texts[settings.difficulty][0];
  $('#difficulty-description').textContent=texts[settings.difficulty][1];
  $('#difficulty-select').value=settings.difficulty;
  document.querySelectorAll('.difficulty-bars b').forEach((b,i)=>b.style.background=i<({easy:1,normal:3,hard:5}[settings.difficulty])?'#e8844480':'#d4d9be1c');
}

function updateStats(){
  for(const key of ['games','kills','wins','accuracy'])$(`#stat-${key}`).textContent=fa(settings.stats[key])+(key==='accuracy'?'٪':'');
}

function setView(view){
  if(game?.active)return;
  for(const v of ['operations','loadout','stats'])$(`#${v}-view`).classList.toggle('hidden',v!==view);
  document.querySelectorAll('.nav-item,.rail-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if(view==='stats')updateStats();
  if(innerWidth<601)window.scrollTo({top:0,behavior:'smooth'});
}

document.addEventListener('click',(e)=>{
  const nav=e.target.closest('[data-view]');if(nav)setView(nav.dataset.view);
  const weapon=e.target.closest('[data-weapon]');if(weapon){settings.weapon=weapon.dataset.weapon;persist();updateLoadout();toast(`سلاح ${WEAPONS[settings.weapon].name} انتخاب شد.`);}
});
$('.brand').addEventListener('click',e=>{e.preventDefault();setView('operations');});
$('#difficulty-select').addEventListener('change',e=>{settings.difficulty=e.target.value;updateDifficulty();persist();});

function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2800);}

function openModal(title,html,mode='info',eyebrow='FIELD MANUAL'){
  if($('#modal-backdrop').classList.contains('hidden'))lastFocus=document.activeElement;
  modalMode=mode;$('#modal-title').textContent=title;$('#modal-eyebrow').textContent=eyebrow;$('#modal-body').innerHTML=html;
  $('#modal-backdrop').classList.remove('hidden');refreshIcons();$('#modal-close').focus();
}
function closeModal(){
  const mode=modalMode;modalMode='';$('#modal-backdrop').classList.add('hidden');
  if(mode==='pause')game?.resume();else if(mode==='result')returnToLobby();
  lastFocus?.focus();
}
$('#modal-close').addEventListener('click',closeModal);
$('#modal-backdrop').addEventListener('click',e=>{if(e.target===$('#modal-backdrop'))closeModal();});
document.addEventListener('keydown',e=>{
  if($('#modal-backdrop').classList.contains('hidden'))return;
  if(e.code==='Escape'){e.preventDefault();closeModal();return;}
  if(e.key==='Tab'){
    const elements=Array.from($('.modal').querySelectorAll('button,input,select,[tabindex="0"]')).filter(el=>!el.disabled);
    const first=elements[0],last=elements[elements.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});

const controls=()=>{
  openModal('کنترل میدان دست توست.',`<div class="controls-list"><div class="control-row"><span>حرکت در محیط</span><kbd dir="ltr">W &nbsp; A &nbsp; S &nbsp; D</kbd></div><div class="control-row"><span>نگاه کردن و نشانه‌گیری</span><kbd>MOUSE</kbd></div><div class="control-row"><span>شلیک / نشانه‌گیری دقیق</span><kbd>LEFT / RIGHT CLICK</kbd></div><div class="control-row"><span>تعویض خشاب</span><kbd>R</kbd></div><div class="control-row"><span>دویدن / پریدن</span><kbd>SHIFT / SPACE</kbd></div><div class="control-row"><span>توقف و آزاد کردن نشانگر</span><kbd>ESC</kbd></div></div><p class="mobile-tip">موبایل: با جوی‌استیک سمت چپ حرکت کن. سمت راست صفحه را برای نگاه کردن بکش و دکمهٔ نشانه را برای شلیک نگه دار.</p><p>سه موج دشمن را از بین ببر. بین موج‌ها ۲۵ واحد سلامت بازیابی می‌کنی. از کانتینرها و موانع برای پناه گرفتن استفاده کن.</p><button class="modal-primary" id="got-it">فهمیدم، آماده‌ام</button>`);
  $('#got-it').onclick=closeModal;
};
$('#help-button').onclick=controls;$('#controls-button').onclick=controls;
$('#equipment-button').onclick=()=>{
  openModal('جلیقهٔ تاکتیکی',`<div class="equipment-details"><i data-lucide="shield-check"></i><div><h3>آماده برای ورود به میدان</h3><p>سلامت اولیه: ۱۰۰ واحد<br>بازیابی بین موج‌ها: ۲۵ واحد<br>ذخیرهٔ مهمات: نامحدود، با تعویض خشاب</p></div></div><p>این تجهیزات به‌صورت خودکار همراه شماست. پشت موانع بمان؛ جلیقه تو را شکست‌ناپذیر نمی‌کند.</p><button class="modal-primary" id="equipment-ok">تأیید تجهیزات</button>`,'info','TACTICAL EQUIPMENT');
  $('#equipment-ok').onclick=closeModal;
};
function updateSound(){
  const b=$('.sound-button');b.innerHTML=`<i data-lucide="${settings.sound?'volume-2':'volume-x'}"></i>`;
  b.title=settings.sound?'خاموش کردن صدا':'روشن کردن صدا';b.setAttribute('aria-label',b.title);game?.setAudio(settings.sound);refreshIcons();
}
$('.sound-button').onclick=()=>{settings.sound=!settings.sound;updateSound();persist();toast(settings.sound?'صدای بازی روشن شد.':'صدای بازی خاموش شد.');};
$('#settings-button').onclick=()=>{
  openModal('تنظیمات تجربهٔ تو',`<div class="setting-row"><label for="sensitivity">حساسیت ماوس و لمس</label><input id="sensitivity" aria-label="حساسیت" type="range" min="0.4" max="2.5" step="0.1" value="${settings.sensitivity}"></div><div class="setting-row"><label for="quality">کیفیت گرافیک</label><select id="quality"><option value="low">سبک</option><option value="medium">متعادل</option><option value="high">بالا</option></select></div><div class="setting-row"><label for="sound-toggle">صدای بازی</label><input id="sound-toggle" type="checkbox" ${settings.sound?'checked':''}></div><div class="setting-row"><label for="volume">بلندی صدا</label><input id="volume" type="range" min="0" max="0.7" step="0.05" value="${settings.volume}" aria-label="بلندی صدا"></div><p>برای دستگاه‌های ضعیف‌تر، کیفیت «سبک» را انتخاب کن. تنظیمات به‌صورت خودکار ذخیره می‌شوند.</p><button class="modal-primary" id="save-settings">ذخیره و بازگشت</button>`,'info','SYSTEM CONFIGURATION');
  $('#quality').value=settings.quality;
  $('#save-settings').onclick=()=>{settings.sensitivity=Number($('#sensitivity').value);settings.quality=$('#quality').value;settings.sound=$('#sound-toggle').checked;settings.volume=Number($('#volume').value);if(game){game.sensitivity=settings.sensitivity;game.audioVolume=settings.volume;game.setQuality(settings.quality);}updateSound();persist();closeModal();toast('تنظیمات ذخیره شد.');};
};

function showWave(wave){
  clearTimeout(waveTimer);$('#wave-message').innerHTML=`موج ${fa(wave)}<small>ELIMINATE ALL HOSTILES</small>`;$('#wave-message').style.opacity='1';
  waveTimer=setTimeout(()=>$('#wave-message').style.opacity='0',3000);
}
function showPause(){
  openModal('عملیات متوقف شد.',`<p>نفسی تازه کن. میدان منتظر توست.</p><button class="modal-primary" id="resume-game">ادامهٔ عملیات</button><button class="modal-secondary" id="leave-game">خروج به مرکز فرماندهی</button>`,'pause','OPERATION PAUSED');
  $('#resume-game').onclick=closeModal;$('#leave-game').onclick=()=>{modalMode='';$('#modal-backdrop').classList.add('hidden');returnToLobby();};
}
function showResult(result){
  settings.stats.games++;settings.stats.kills+=result.kills;if(result.won)settings.stats.wins++;settings.stats.accuracy=Math.max(settings.stats.accuracy,result.accuracy);persist();updateStats();
  clearTimeout(waveTimer);$('#wave-message').style.opacity='0';
  const minutes=Math.floor(result.time/60),seconds=Math.floor(result.time%60);
  openModal(result.won?'مأموریت با موفقیت انجام شد.':'اپراتور از دست رفت.',`<p>${result.won?'بندر پاک‌سازی شد. هر سه موج دشمن را شکست دادی. به خانه خوش آمدی، اپراتور.':'این پایان کار نیست. سلاحت را آماده کن و دوباره وارد میدان شو. استفاده از موانع و نشانه‌گیری به سر، تفاوت را رقم می‌زند.'}</p><div class="result-grid"><div><strong>${fa(result.kills)}</strong><small>دشمن از بین رفته</small></div><div><strong>${fa(result.accuracy)}٪</strong><small>دقت تیراندازی</small></div><div><strong>${fa(minutes)}:${String(seconds).padStart(2,'0').replace(/\d/g,d=>fa(d))}</strong><small>زمان عملیات</small></div></div><button class="modal-primary" id="retry-game">${result.won?'عملیات دوباره':'دوباره تلاش کن'}</button><button class="modal-secondary" id="result-lobby">بازگشت به مرکز فرماندهی</button>`,'result',result.won?'MISSION COMPLETE':'OPERATOR DOWN');
  $('#retry-game').onclick=()=>{modalMode='';$('#modal-backdrop').classList.add('hidden');startGame();};$('#result-lobby').onclick=closeModal;
}

function startGame(){
  if(!game){toast('مرورگر شما نتوانست محیط سه‌بعدی را اجرا کند. WebGL را فعال کنید.');return;}
  $('#lobby').classList.add('hidden');$('#game-ui').classList.remove('hidden');document.body.classList.add('playing');
  $('#kill-feed').textContent='';$('#damage-overlay').style.opacity='0';$('#hit-marker').style.opacity='0';
  game.start(settings.weapon,settings.difficulty);window.scrollTo(0,0);
}
function returnToLobby(){
  game?.returnToLobby();document.body.classList.remove('playing');$('#lobby').classList.remove('hidden');$('#game-ui').classList.add('hidden');
  clearTimeout(waveTimer);$('#wave-message').style.opacity='0';setView('operations');$('#start-button').focus();
}
$('#start-button').onclick=startGame;
$('#pause-button').onclick=()=>game?.pause();
$('#touch-reload').onclick=()=>game?.reload();
const fireButton=$('#touch-fire');
fireButton.addEventListener('pointerdown',e=>{e.preventDefault();if(game?.active&&!game.paused){fireButton.setPointerCapture(e.pointerId);game.firing=true;}});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])fireButton.addEventListener(ev,()=>{if(game)game.firing=false;});
const joystick=$('#joystick'),knob=$('#joystick-knob');let joystickId=null;
function moveJoystick(e){
  if(!game||joystickId!==e.pointerId)return;
  const r=joystick.getBoundingClientRect();let x=(e.clientX-r.left-r.width/2)/36,y=(e.clientY-r.top-r.height/2)/36;
  const length=Math.hypot(x,y);if(length>1){x/=length;y/=length;}
  game.touchMove={x,y};knob.style.transform=`translate(${x*31}px,${y*31}px)`;
}
joystick.addEventListener('pointerdown',e=>{if(!game?.active||game.paused)return;e.preventDefault();joystickId=e.pointerId;joystick.setPointerCapture(e.pointerId);moveJoystick(e);});
joystick.addEventListener('pointermove',moveJoystick);
for(const ev of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(ev,()=>{joystickId=null;if(game)game.touchMove={x:0,y:0};knob.style.transform='';});

updateLoadout();updateDifficulty();updateStats();updateSound();refreshIcons();
try {
  game=new Game($('#world'),{
    onState(s){$('#health-value').textContent=s.health;$('#health-bar').style.width=`${s.health}%`;$('#health-bar').style.background=s.health<30?'#e88444':'#bbcda1';$('#ammo-value').textContent=String(s.ammo).padStart(2,'0');$('#wave-number').textContent=fa(s.wave);$('#enemies-left').textContent=fa(s.enemies);$('#hud-weapon').textContent=s.weapon;$('#reload-hint').textContent=s.reloading?'تعویض خشاب…':s.ammo===0?'برای تعویض خشاب R بزن':'خشاب آماده';},
    onWave:showWave,onPause:showPause,onEnd:showResult,
    onHit(headshot){clearTimeout(hitTimer);$('#hit-marker').style.opacity='1';$('#hit-marker').style.color=headshot?'#ffb05e':'#e7ead7';hitTimer=setTimeout(()=>$('#hit-marker').style.opacity='0',120);},
    onKill(kills){clearTimeout(feedTimer);$('#kill-feed').textContent=`تهدید حذف شد  +۱۰۰  /  ${fa(kills)} هدف`;feedTimer=setTimeout(()=>$('#kill-feed').textContent='',2400);},
    onDamage(){clearTimeout(damageTimer);$('#damage-overlay').style.opacity='.5';damageTimer=setTimeout(()=>$('#damage-overlay').style.opacity='0',230);},
    onClear(wave){clearTimeout(waveTimer);$('#wave-message').innerHTML=`${wave===3?'منطقه امن شد.':'موج پاک‌سازی شد.'}<small>${wave===3?'MISSION COMPLETE':'HEALTH +25 / NEXT WAVE INCOMING'}</small>`;$('#wave-message').style.opacity='1';},
    onLock(locked){$('#game-hint').textContent=locked?'کلیک راست: نشانه‌گیری دقیق · R: تعویض خشاب':'کلیک: قفل ماوس و شلیک · اگر قفل نشد، کلیک راست را برای نگاه کردن نگه دار';},
    onFPS(fps){$('#fps').textContent=fps;},
  });
  game.sensitivity=settings.sensitivity;game.audioVolume=settings.volume;game.setQuality(settings.quality);game.audioEnabled=settings.sound;
  requestAnimationFrame(()=>{setTimeout(()=>{$('#loading').style.opacity='0';setTimeout(()=>$('#loading').remove(),650);},250);});
} catch(error) {
  console.error('3D initialization failed:',error);
  $('#loading').remove();$('#start-button').disabled=true;$('#start-button').style.opacity='.45';
  openModal('محیط سه‌بعدی در دسترس نیست.',`<p>برای اجرای بازی به مرورگر دارای WebGL و شتاب‌دهی سخت‌افزاری نیاز داری. Chrome، Firefox یا Safari به‌روز را امتحان کن و شتاب‌دهی گرافیکی را در تنظیمات مرورگر فعال کن.</p><button class="modal-primary" id="retry-load">تلاش دوباره</button>`,'info','GRAPHICS INITIALIZATION');
  $('#retry-load').onclick=()=>location.reload();
}
