
const STORE_KEY = 'semi-vocab-dashboard-v1';
const DAY = 24*60*60*1000;
let state = loadState();
let mode = 'due';
let currentDeck = [];
let currentIndex = 0;
let showingAnswer = false;

function todayStart(){ const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); }
function uid(){ return 'card-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
function normalizeCard(raw, i=0){
  const term = raw.term || raw.prompt || raw.용어 || raw['약어/영어'] || raw.front || '';
  const korean = raw.korean || raw.한국어 || raw['한국어 번역'] || '';
  const expansion = raw.expansion || raw.원어 || raw['원어/확장'] || '';
  const category = raw.category || raw.분야 || raw['세부 분야'] || '사용자 추가';
  const field = raw.field || raw['대분류'] || macroField(category, term);
  const answer = raw.answer || raw.back || [expansion,korean].filter(Boolean).join(' / ') || term;
  return {
    id: raw.id || uid(), term, prompt: raw.prompt || term, answer,
    expansion, korean, field, category,
    importance: raw.importance || raw.중요도 || '사용자', source: raw.source || '',
    note: raw.note || raw.메모 || '', tags: raw.tags || [],
    interval: Number(raw.interval || 0), ease: Number(raw.ease || 2.5), reps: Number(raw.reps || 0),
    due: Number(raw.due || todayStart()), last: raw.last || null
  };
}
function macroField(category='', term=''){
  const c = String(category || '').toLowerCase();
  const t = String(term || '').toLowerCase();
  if(/패키징|후공정|테스트|test|packaging|tsv|rdl|cowos|ucie|kgd|kgsd|cte|interposer|bump|bonding|i\/o/.test(c+' '+t)) return '후공정';
  if(/소자|물성|메모리|ai 메모리|스토리지|컴퓨팅|device|mos|dram|nand|hbm|pim|cxl|eot|hkmg|gaa|finfet|band|vt|sce|dibl|gidl|hci|bti/.test(c+' '+t)) return '소자';
  return '전공정';
}
function loadState(){
  const saved = localStorage.getItem(STORE_KEY);
  if(saved){
    try {
      const parsed = JSON.parse(saved);
      parsed.cards = (parsed.cards || []).map(c => ({...c, field: c.field || macroField(c.category, c.term)}));
      return parsed;
    } catch(e){}
  }
  const seed = (window.SEMI_VOCAB_SEED?.cards || []).map(normalizeCard);
  return {cards: seed, created: new Date().toISOString()};
}
function save(){ localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
function dueCards(){ const t=todayStart(); return state.cards.filter(c => (c.due || 0) <= t); }
function newCards(){ return state.cards.filter(c => !c.reps); }
function activeFilterValue(desktopId, mobileId){
  const mobileVisible = window.matchMedia('(max-width: 900px)').matches;
  const mobile = document.querySelector('#'+mobileId);
  const desktop = document.querySelector('#'+desktopId);
  return mobileVisible && mobile ? mobile.value : desktop ? desktop.value : '';
}
function setSelectOptions(sel, placeholder, options, prev){
  if(!sel) return;
  sel.innerHTML=`<option value="">${placeholder}</option>`+options.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
  sel.value = options.includes(prev) ? prev : '';
}
function filteredCards(){
  const q = activeFilterValue('search','mobileSearch').trim().toLowerCase();
  const field = activeFilterValue('fieldFilter','mobileFieldFilter');
  const cat = activeFilterValue('categoryFilter','mobileCategoryFilter');
  const imp = activeFilterValue('importanceFilter','mobileImportanceFilter');
  let base = mode==='due' ? dueCards() : mode==='new' ? newCards() : state.cards;
  return base.filter(c => {
    if(field && (c.field || macroField(c.category, c.term))!==field) return false;
    if(cat && c.category!==cat) return false;
    if(imp && c.importance!==imp) return false;
    const hay = [c.term,c.prompt,c.answer,c.expansion,c.korean,c.category,c.note].join(' ').toLowerCase();
    return !q || hay.includes(q);
  }).sort((a,b)=>(a.due||0)-(b.due||0));
}
function refreshFilters(){
  const desktopSel=document.querySelector('#categoryFilter');
  const mobileSel=document.querySelector('#mobileCategoryFilter');
  const field=activeFilterValue('fieldFilter','mobileFieldFilter');
  const cardsForField = field ? state.cards.filter(c => (c.field || macroField(c.category,c.term))===field) : state.cards;
  const cats=[...new Set(cardsForField.map(c=>c.category).filter(Boolean))].sort();
  setSelectOptions(desktopSel, '전체 세부 분야', cats, desktopSel?.value || '');
  setSelectOptions(mobileSel, '전체 세부 분야', cats, mobileSel?.value || '');
}
function escapeHtml(s=''){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function render(){
  refreshFilters();
  currentDeck = filteredCards();
  if(currentIndex >= currentDeck.length) currentIndex = 0;
  document.querySelector('#statTotal').textContent=state.cards.length;
  document.querySelector('#statDue').textContent=dueCards().length;
  document.querySelector('#statMastered').textContent=state.cards.filter(c=>c.reps>=5 && c.interval>=14).length;
  const titles={due:['오늘 복습','복습 예정일이 오늘 이전인 카드부터 보여줍니다.'],new:['새 카드','아직 학습하지 않은 새 카드입니다.'],all:['전체 카드','검색/필터로 원하는 용어를 골라 볼 수 있습니다.']};
  document.querySelector('#deckTitle').textContent=titles[mode][0];
  document.querySelector('#deckHint').textContent=titles[mode][1];
  renderCard(); renderList(); renderSchedule();
}
function renderCard(){
  const c=currentDeck[currentIndex]; showingAnswer=false;
  document.querySelector('.front').classList.remove('hidden');
  document.querySelector('.back').classList.add('hidden');
  document.querySelector('#progressText').textContent = currentDeck.length ? `${currentIndex+1} / ${currentDeck.length}` : '0 / 0';
  document.querySelector('#progressBar').style.width = currentDeck.length ? `${((currentIndex+1)/currentDeck.length)*100}%` : '0%';
  if(!c){
    document.querySelector('#cardBadge').textContent='EMPTY';
    document.querySelector('#cardPrompt').textContent='표시할 카드가 없어요';
    document.querySelector('#cardMeta').textContent='필터를 바꾸거나 새 학습 콘텐츠를 드롭해보세요.';
    document.querySelector('#cardAnswer').textContent=''; document.querySelector('#cardNote').textContent=''; return;
  }
  document.querySelector('#cardBadge').textContent=c.field || c.category || 'CARD';
  document.querySelector('#cardPrompt').textContent=c.prompt || c.term;
  document.querySelector('#cardMeta').textContent=[c.category, c.importance, c.reps?`복습 ${c.reps}회`:'새 카드', `간격 ${c.interval||0}일`].filter(Boolean).join(' · ');
  document.querySelector('#cardAnswer').textContent=c.answer;
  document.querySelector('#cardNote').textContent=c.note || [c.expansion,c.korean,c.source].filter(Boolean).join(' · ');
}
function renderList(){
  const el=document.querySelector('#cardList');
  el.innerHTML=currentDeck.slice(0,250).map((c,i)=>`<button class="cardItem ${i===currentIndex?'active':''}" data-jump="${i}"><strong>${escapeHtml(c.term)}</strong><span>${escapeHtml(c.korean || c.expansion || c.category)} · ${dateLabel(c.due)}</span></button>`).join('') || '<p class="muted">카드 없음</p>';
  el.querySelectorAll('[data-jump]').forEach(b=>b.addEventListener('click',()=>{currentIndex=Number(b.dataset.jump);renderCard();renderList();}));
}
function renderSchedule(){
  const t=todayStart();
  const buckets=[['오늘',0,0],['내일',1,1],['7일 내',2,7],['이후',8,99999]];
  document.querySelector('#scheduleList').innerHTML=buckets.map(([name,a,b])=>{
    const n=state.cards.filter(c=>{const d=Math.floor(((c.due||t)-t)/DAY); return d>=a && d<=b;}).length;
    return `<div><strong>${n}</strong><span>${name}</span></div>`;
  }).join('');
}
function dateLabel(ts){ const d=Math.floor(((ts||todayStart())-todayStart())/DAY); if(d<=0)return '오늘'; if(d===1)return '내일'; return `${d}일 뒤`; }
function flip(){ if(!currentDeck[currentIndex]) return; showingAnswer=!showingAnswer; document.querySelector('.front').classList.toggle('hidden',showingAnswer); document.querySelector('.back').classList.toggle('hidden',!showingAnswer); }
function grade(g){
  const c=currentDeck[currentIndex]; if(!c) return;
  const map={again:[0,Math.max(1,c.ease-.2)],hard:[1,Math.max(1.3,c.ease-.15)],good:[null,c.ease],easy:[null,c.ease+.15]};
  c.reps=(c.reps||0)+1; c.ease=map[g][1];
  if(g==='again') c.interval=0;
  else if(g==='hard') c.interval=Math.max(1, Math.round((c.interval||1)*1.2));
  else if(g==='good') c.interval=c.interval?Math.round(c.interval*c.ease):1;
  else c.interval=c.interval?Math.round(c.interval*c.ease*1.5):4;
  c.due=todayStart()+c.interval*DAY; c.last=new Date().toISOString();
  save(); currentIndex=Math.min(currentIndex+1, currentDeck.length-1); render();
}
function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(l=>l.trim()); if(!lines.length) return [];
  const split=l=>l.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(x=>x.replace(/^\"|\"$/g,'').trim());
  const head=split(lines[0]);
  return lines.slice(1).map(line=>{const vals=split(line); const o={}; head.forEach((h,i)=>o[h]=vals[i]||''); return normalizeCard(o);}).filter(c=>c.term);
}
function parseMarkdownTable(text){
  const rows=text.split(/\r?\n/).filter(l=>/^\s*\|.*\|\s*$/.test(l) && !/^\s*\|\s*-+/.test(l));
  if(rows.length<2) return [];
  const cells=l=>l.trim().slice(1,-1).split('|').map(x=>x.trim().replace(/`/g,''));
  const head=cells(rows[0]);
  return rows.slice(1).map(r=>{const vals=cells(r); const o={}; head.forEach((h,i)=>o[h]=vals[i]||''); return normalizeCard(o);}).filter(c=>c.term);
}
function importText(text, name='paste'){
  let cards=[];
  try { const obj=JSON.parse(text); cards=(Array.isArray(obj)?obj:obj.cards||obj.terms||[]).map(normalizeCard).filter(c=>c.term); } catch(e){
    cards = text.includes('|') ? parseMarkdownTable(text) : parseCSV(text);
  }
  if(!cards.length){ alert('가져올 카드를 찾지 못했어요. JSON, CSV(term,korean,expansion,category), Markdown 표를 사용해주세요.'); return; }
  const existing=new Set(state.cards.map(c=>c.term+'|'+c.answer));
  let added=0;
  for(const c of cards){ const key=c.term+'|'+c.answer; if(!existing.has(key)){state.cards.push(c); existing.add(key); added++;} }
  save(); alert(`${name}: ${added}개 카드 추가 완료`); render();
}
function exportDeck(){
  const blob=new Blob([JSON.stringify({cards:state.cards},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='semiconductor-vocab-deck.json'; a.click(); URL.revokeObjectURL(a.href);
}
function downloadCsvTemplate(){
  const rows=[
    ['term','korean','expansion','field','category','importance','note'],
    ['EOT','등가 산화막 두께','Equivalent Oxide Thickness','소자','소자/증착','필수','High-k를 SiO2 기준 두께로 환산한 값'],
    ['CD','핵심 치수/임계 치수','Critical Dimension','전공정','포토','필수','포토/식각 후 목표 선폭'],
    ['CTE','열팽창계수','Coefficient of Thermal Expansion','후공정','패키징/신뢰성','필수','온도 변화에 따른 팽창 정도']
  ];
  const csv=rows.map(r=>r.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='semiconductor-vocab-template.csv'; a.click(); URL.revokeObjectURL(a.href);
}

document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active')); b.classList.add('active'); mode=b.dataset.mode; currentIndex=0; render();}));
document.querySelector('#flipBtn').addEventListener('click',flip);
document.querySelector('#card').addEventListener('keydown',e=>{ if(e.key===' '||e.key==='Enter'){e.preventDefault(); flip();} });
document.querySelectorAll('[data-grade]').forEach(b=>b.addEventListener('click',()=>grade(b.dataset.grade)));
['search','fieldFilter','categoryFilter','importanceFilter','mobileSearch','mobileFieldFilter','mobileCategoryFilter','mobileImportanceFilter'].forEach(id=>{const el=document.querySelector('#'+id); if(el) el.addEventListener('input',()=>{currentIndex=0;render();});});
document.querySelector('#resetProgress').addEventListener('click',()=>{ if(confirm('학습 진도를 초기화할까요? 카드 자체는 유지됩니다.')){state.cards.forEach(c=>{c.interval=0;c.ease=2.5;c.reps=0;c.due=todayStart();c.last=null;});save();render();} });
document.querySelector('#exportDeck').addEventListener('click',exportDeck);
document.querySelector('#downloadCsvTemplate').addEventListener('click',downloadCsvTemplate);
document.querySelector('#importPaste').addEventListener('click',()=>importText(document.querySelector('#pasteBox').value,'붙여넣기'));
const dz=document.querySelector('#dropzone');
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag');}));
dz.addEventListener('drop',e=>{[...e.dataTransfer.files].forEach(file=>{const r=new FileReader(); r.onload=()=>importText(r.result,file.name); r.readAsText(file);});});
render();
