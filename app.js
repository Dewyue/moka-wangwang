const KEY = "jineng-huan-v1";
const SKILLS = ["吉他","摄影","Python","日语","烘焙","健身","瑜伽","UI设计","声乐"];

function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function now() { return Date.now(); }

const SEED_USERS = [
  { email:"demo@jineng.local", name:"林夏", city:"北京", bio:"写代码的人，想把木吉他捡回来。", hue:214, credits:6,
    offers:[{skill:"Python",kind:"teach",level:"进阶",blurb:"从零到小工具"},{skill:"吉他",kind:"learn",level:"入门",blurb:"想学弹唱"}] },
  { email:"zhou@jineng.local", name:"周衡", city:"北京", bio:"民谣吉他十年。想用 Python 整理曲谱。", hue:18, credits:4,
    offers:[{skill:"吉他",kind:"teach",level:"精通",blurb:"指弹与弹唱"},{skill:"Python",kind:"learn",level:"入门",blurb:"自动化整理谱子"}] },
  { email:"su@jineng.local", name:"苏晚", city:"上海", bio:"拍人像，也拍食物。", hue:330, credits:5,
    offers:[{skill:"摄影",kind:"teach",level:"进阶",blurb:"自然光人像"},{skill:"烘焙",kind:"learn",level:"入门",blurb:"先学会戚风"}] },
  { email:"chen@jineng.local", name:"陈麦", city:"上海", bio:"面点店学徒。想用相机记菜单。", hue:38, credits:3,
    offers:[{skill:"烘焙",kind:"teach",level:"进阶",blurb:"吐司与司康"},{skill:"摄影",kind:"learn",level:"入门",blurb:"食物光线"}] },
  { email:"takahashi@jineng.local", name:"高桥葵", city:"线上", bio:"日语教师。想重新会喘气。", hue:152, credits:4,
    offers:[{skill:"日语",kind:"teach",level:"精通",blurb:"会话与 JLPT"},{skill:"健身",kind:"learn",level:"入门",blurb:"居家力量"}] },
  { email:"ma@jineng.local", name:"马力", city:"北京", bio:"力量训练教练。", hue:0, credits:5,
    offers:[{skill:"健身",kind:"teach",level:"精通",blurb:"动作纠正"},{skill:"日语",kind:"learn",level:"入门",blurb:"先混个耳熟"}] },
  { email:"ye@jineng.local", name:"叶宁", city:"上海", bio:"后端。周末想出门拍照。", hue:260, credits:4,
    offers:[{skill:"Python",kind:"teach",level:"精通",blurb:"接口和脚本"},{skill:"摄影",kind:"learn",level:"入门",blurb:"城市扫街"}] },
  { email:"ruan@jineng.local", name:"阮清", city:"线上", bio:"教瑜伽。想做预约小工具。", hue:175, credits:4,
    offers:[{skill:"瑜伽",kind:"teach",level:"进阶",blurb:"哈他与肩颈"},{skill:"Python",kind:"learn",level:"入门",blurb:"能写表格"}] },
  { email:"gu@jineng.local", name:"顾川", city:"北京", bio:"做界面。晚上想把吉他从墙上下来。", hue:200, credits:4,
    offers:[{skill:"UI设计",kind:"teach",level:"进阶",blurb:"App 结构"},{skill:"吉他",kind:"learn",level:"入门",blurb:"三首歌"}] },
  { email:"song@jineng.local", name:"宋词", city:"上海", bio:"声乐。想把课包装得更好看。", hue:280, credits:5,
    offers:[{skill:"声乐",kind:"teach",level:"精通",blurb:"气息与流行唱法"},{skill:"UI设计",kind:"learn",level:"入门",blurb:"个人页"}] },
];

function emptyState() {
  const users = SEED_USERS.map(u => ({
    id: uid(), password: "demo1234", ...u,
    offers: u.offers.map(o => ({ id: uid(), ...o, online: true, offline: u.city !== "线上" })),
  }));
  const demo = users[0], zhou = users[1];
  const [a,b] = demo.id < zhou.id ? [demo.id, zhou.id] : [zhou.id, demo.id];
  const thread = { id: uid(), a, b, updatedAt: now() };
  const messages = [
    { id: uid(), threadId: thread.id, senderId: zhou.id, body: "看到你想学吉他。周末下午可以先上一节认识指法。", createdAt: now()-3600000, read: true },
    { id: uid(), threadId: thread.id, senderId: demo.id, body: "正好。我可以教你用 Python 整理曲谱。先约 1 小时？", createdAt: now()-1800000, read: false },
  ];
  return { users, threads: [thread], messages, swaps: [], lessons: [], reviews: [], ledger: [], session: null };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = emptyState();
  save(s);
  return s;
}
function save(s) { localStorage.setItem(KEY, JSON.stringify(s)); }
let db = load();

window.addEventListener("storage", (e) => {
  if (e.key === KEY && e.newValue) {
    db = JSON.parse(e.newValue);
    render();
  }
});

function me() { return db.users.find(u => u.id === db.session) || null; }
function go(hash) { location.hash = hash; }
function route() {
  const h = (location.hash || "#/").replace(/^#/, "");
  const parts = h.split("/").filter(Boolean);
  return { path: parts[0] || "", id: parts[1] || "" };
}

function avatar(u, size=44) {
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:hsl(${u.hue} 42% 42%);font-size:${size*0.38}px">${u.name.slice(0,1)}</span>`;
}
function esc(s) { return String(s??"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function shell(active, inner) {
  const u = me();
  const unread = db.messages.filter(m => {
    const t = db.threads.find(x => x.id === m.threadId);
    if (!t || (t.a!==u.id && t.b!==u.id)) return false;
    return m.senderId !== u.id && !m.read;
  }).length;
  return `
    <header class="top"><div class="top-inner">
      <a class="brand" href="#/discover">技能互换</a>
      <nav class="nav">
        <a href="#/discover" class="${active==='discover'?'on':''}">发现</a>
        <a href="#/inbox" class="${active==='inbox'?'on':''}">消息${unread?` ${unread}`:''}</a>
        <a href="#/swaps" class="${active==='swaps'?'on':''}">互换</a>
        <a href="#/me" class="${active==='me'?'on':''}">我的</a>
      </nav>
      <span style="font-size:13px;color:var(--muted)">${esc(u.name)}</span>
    </div></header>
    <main class="wrap">${inner}</main>
    <nav class="bottom">
      <a href="#/discover" class="${active==='discover'?'on':''}">发现</a>
      <a href="#/inbox" class="${active==='inbox'?'on':''}">消息</a>
      <a href="#/swaps" class="${active==='swaps'?'on':''}">互换</a>
      <a href="#/me" class="${active==='me'?'on':''}">我的</a>
    </nav>`;
}

function needOnboard(u) {
  return !u.offers.some(o=>o.kind==='teach') || !u.offers.some(o=>o.kind==='learn');
}

function land() {
  return `<div class="hero"><div class="hero-inner">
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span class="brand">技能互换</span>
      <div style="display:flex;gap:12px;font-size:13px">
        <a href="#/login" style="color:var(--muted);font-weight:500">登录</a>
        <a class="btn" href="#/register" style="height:32px;padding:0 14px;font-size:13px">注册</a>
      </div>
    </div>
    <p style="color:var(--accent);font-size:13px;font-weight:500;margin:56px 0 0">用一小时换一小时</p>
    <h1>你能教的，正好是别人想学的。</h1>
    <p class="sub" style="max-width:42ch;font-size:16px;line-height:1.6">报班贵，自学难坚持。把你会的挂出来，系统帮你找到可以互换的人。</p>
    <div style="display:flex;gap:12px;margin-top:28px;flex-wrap:wrap">
      <a class="btn" href="#/register">免费注册</a>
      <a class="btn ghost" href="#/login">演示账号登录</a>
    </div>
    <p class="sub">demo@jineng.local / demo1234</p>
    <div class="grid2">
      <div style="background:var(--muted-bg);border-radius:28px;padding:24px">
        <p style="font-size:12px;color:var(--muted)">我能教</p>
        <p style="font-size:22px;font-weight:600;margin:8px 0">Python · 吉他 · 摄影</p>
        <p class="sub">写清楚程度、线上还是线下。</p>
      </div>
      <div style="background:var(--muted-bg);border-radius:28px;padding:24px">
        <p style="font-size:12px;color:var(--muted)">我想学</p>
        <p style="font-size:22px;font-weight:600;margin:8px 0">日语 · 烘焙 · 健身</p>
        <p class="sub">匹配优先找双向互换，否则用课时。</p>
      </div>
    </div>
  </div></div>`;
}

function authForm(mode) {
  return `<div class="wrap" style="max-width:420px;padding-top:64px">
    <a class="brand" href="#/">技能互换</a>
    <form class="tile card" style="padding:28px 24px;margin-top:20px" data-auth="${mode}">
      <h1 style="font-size:22px">${mode==='login'?'登录':'注册'}</h1>
      <p class="sub">${mode==='login'?'用邮箱进入技能互换。':'任何人都可以注册。'}</p>
      ${mode==='register'?`<label class="field">昵称<input name="name" required></label>
        <label class="field">城市<input name="city" placeholder="北京 / 上海 / 线上"></label>`:''}
      <label class="field">邮箱<input name="email" type="email" required placeholder="you@example.com"></label>
      <label class="field">密码<input name="password" type="password" required placeholder="至少 6 位"></label>
      <p class="err" data-err></p>
      <button class="btn" style="width:100%;margin-top:16px" type="submit">${mode==='login'?'进入':'创建账号'}</button>
      <p class="sub" style="text-align:center;margin-top:16px">
        ${mode==='login'?'还没有账号？ <a href="#/register" style="color:var(--accent)">注册</a>':'已有账号？ <a href="#/login" style="color:var(--accent)">登录</a>'}
      </p>
    </form>
    ${mode==='login'?'<p class="sub" style="text-align:center">演示号 demo@jineng.local / demo1234</p>':''}
  </div>`;
}

function matchList(u) {
  const myTeach = new Set(u.offers.filter(o=>o.kind==='teach').map(o=>o.skill));
  const myLearn = new Set(u.offers.filter(o=>o.kind==='learn').map(o=>o.skill));
  const cards = db.users.filter(x=>x.id!==u.id).map(other => {
    const theyTeach = other.offers.filter(o=>o.kind==='teach');
    const theyLearn = other.offers.filter(o=>o.kind==='learn');
    const theyTeachYouWant = theyTeach.filter(o=>myLearn.has(o.skill));
    const youTeachTheyWant = u.offers.filter(o=>o.kind==='teach' && theyLearn.some(t=>t.skill===o.skill));
    if (!theyTeachYouWant.length && !youTeachTheyWant.length) return null;
    const mutual = theyTeachYouWant.length && youTeachTheyWant.length;
    let score = (mutual?100:0) + theyTeachYouWant.length*12 + youTeachTheyWant.length*12 + (u.city===other.city && u.city!=='线上'?8:0);
    return { other, theyTeachYouWant, youTeachTheyWant, mutual, score, sameCity: u.city===other.city && u.city!=='线上' };
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  if (!cards.length) return `<h1>发现</h1><p class="sub">暂时没有匹配。</p>`;
  return `<h1>发现</h1><p class="sub">双向优先。你想学的出现在对方「能教」里，就会排在前面。</p>
    <div class="list">${cards.map(c => `
      <a class="tile card row" href="#/people/${c.other.id}">
        ${avatar(c.other)}
        <div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <strong>${esc(c.other.name)}</strong>
            <span class="sub">${esc(c.other.city)}</span>
            <span class="pill ${c.mutual?'accent':''}">${c.mutual?'双向互换':'单向'}</span>
            ${c.sameCity?'<span class="pill">同城</span>':''}
          </div>
          <p class="sub">${esc(c.other.bio)}</p>
          <div class="skills">${c.theyTeachYouWant.map(o=>`<span class="pill accent">可学 ${esc(o.skill)}</span>`).join("")}
            ${c.youTeachTheyWant.map(o=>`<span class="pill">可教 ${esc(o.skill)}</span>`).join("")}</div>
        </div>
      </a>`).join("")}</div>`;
}

function personView(u, id) {
  const p = db.users.find(x=>x.id===id);
  if (!p || p.id===u.id) return `<p>没有这个人</p>`;
  const teach = p.offers.filter(o=>o.kind==='teach');
  const learn = p.offers.filter(o=>o.kind==='learn');
  const myTeach = u.offers.filter(o=>o.kind==='teach');
  const myLearn = new Set(u.offers.filter(o=>o.kind==='learn').map(o=>o.skill));
  const reviews = db.reviews.filter(r=>r.toId===p.id);
  const avg = reviews.length ? (reviews.reduce((s,r)=>s+r.stars,0)/reviews.length).toFixed(1) : null;
  return `
    <div class="tile card row">${avatar(p,56)}<div>
      <h1 style="font-size:24px">${esc(p.name)}</h1>
      <p class="sub">${esc(p.city)}${avg?` · ${avg} 分 · ${reviews.length} 评`:' · 还没有评价'}</p>
      <p style="margin:12px 0">${esc(p.bio)}</p>
      <button class="btn" data-msg="${p.id}">发消息</button>
    </div></div>
    <div class="grid2" style="margin-top:12px">
      <div class="tile card"><p class="sub">能教</p>${teach.map(o=>`<p style="margin:12px 0 0"><strong>${esc(o.skill)}</strong> <span class="pill ${myLearn.has(o.skill)?'accent':''}">${esc(o.level)}</span><br><span class="sub">${esc(o.blurb)}</span></p>`).join("")}</div>
      <div class="tile card"><p class="sub">想学</p>${learn.map(o=>`<p style="margin:12px 0 0"><strong>${esc(o.skill)}</strong> <span class="pill">${esc(o.level)}</span><br><span class="sub">${esc(o.blurb)}</span></p>`).join("")}</div>
    </div>
    <form class="tile card" style="margin-top:12px" data-swap="${p.id}">
      <strong>提出互换</strong>
      <label class="field">方式
        <select name="kind"><option value="mutual">技能对技能</option><option value="credit">用课时</option></select>
      </label>
      <label class="field">我来教
        <select name="teach">${myTeach.map(o=>`<option>${esc(o.skill)}</option>`).join("")}</select>
      </label>
      <label class="field">向对方学
        <select name="learn">${teach.map(o=>`<option>${esc(o.skill)}</option>`).join("")}</select>
      </label>
      <label class="field">课时数<input name="hours" type="number" min="1" max="8" value="1"></label>
      <button class="btn" style="margin-top:12px" type="submit">发给对方</button>
    </form>
    <h1 style="font-size:15px;margin-top:24px">评价</h1>
    ${reviews.length? reviews.map(r=>`<div class="tile card" style="margin-top:8px"><strong>${esc(db.users.find(x=>x.id===r.fromId)?.name||"")} · ${r.stars} 星</strong><p class="sub">${esc(r.body||"没有文字")}</p></div>`).join("") : `<p class="sub">还没有人评价过。</p>`}
  `;
}

function offerEditor(u) {
  const teach = new Set(u.offers.filter(o=>o.kind==='teach').map(o=>o.skill));
  const learn = new Set(u.offers.filter(o=>o.kind==='learn').map(o=>o.skill));
  const block = (kind, title, set) => `
    <div class="tile card" style="margin-top:12px">
      <strong>${title}</strong>
      <div class="skills" data-kind="${kind}">
        ${SKILLS.map(s=>`<button type="button" class="chip ${set.has(s)?'on':''}" data-skill="${s}">${s}</button>`).join("")}
      </div>
    </div>`;
  return `<form data-offers>
    ${block('teach','我能教的',teach)}
    ${block('learn','我想学的',learn)}
    <button class="btn" style="margin-top:16px" type="submit">保存技能</button>
  </form>`;
}

function inboxView(u) {
  const threads = db.threads.filter(t=>t.a===u.id||t.b===u.id).sort((a,b)=>b.updatedAt-a.updatedAt);
  if (!threads.length) return `<h1>消息</h1><div class="tile card" style="margin-top:16px;text-align:center;padding:40px">还没有对话。从发现里点进主页，再点发消息。</div>`;
  return `<h1>消息</h1><div class="list">${threads.map(t=>{
    const other = db.users.find(x=>x.id===(t.a===u.id?t.b:t.a));
    const last = db.messages.filter(m=>m.threadId===t.id).sort((a,b)=>b.createdAt-a.createdAt)[0];
    const unread = last && last.senderId!==u.id && !last.read;
    return `<a class="tile card row" href="#/inbox/${t.id}">${avatar(other)}<div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between"><strong>${esc(other.name)}</strong>${unread?'<span class="pill accent">未读</span>':''}</div>
      <p class="sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(last?.body||"还没有消息")}</p>
    </div></a>`;
  }).join("")}</div>`;
}

function chatView(u, id) {
  const t = db.threads.find(x=>x.id===id);
  if (!t || (t.a!==u.id && t.b!==u.id)) return `<p>没有这场对话</p>`;
  const other = db.users.find(x=>x.id===(t.a===u.id?t.b:t.a));
  db.messages.filter(m=>m.threadId===id && m.senderId!==u.id).forEach(m=>m.read=true);
  save(db);
  const msgs = db.messages.filter(m=>m.threadId===id).sort((a,b)=>a.createdAt-b.createdAt);
  return `<a class="sub" href="#/inbox">消息</a>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h1 style="font-size:22px">${esc(other.name)}</h1>
      <a href="#/people/${other.id}" style="color:var(--accent);font-size:13px;font-weight:500">主页</a>
    </div>
    <div class="msgs" style="margin-top:16px">${msgs.map(m=>`<div class="${m.senderId===u.id?'msg-me':'msg-them'}">${esc(m.body)}</div>`).join("")}</div>
    <form class="composer" data-send="${id}"><input name="body" placeholder="写一条消息" autocomplete="off"><button class="btn" type="submit">发送</button></form>`;
}

function swapsView(u) {
  const list = db.swaps.filter(s=>s.from===u.id||s.to===u.id).sort((a,b)=>b.createdAt-a.createdAt);
  const st = {proposed:"待接受",accepted:"已接受",active:"进行中",completed:"已完成",cancelled:"已取消"};
  if (!list.length) return `<h1>互换</h1><div class="tile card" style="margin-top:16px;text-align:center;padding:40px">还没有互换。在对方主页提出即可。</div>`;
  return `<h1>互换</h1><div class="list">${list.map(s=>{
    const other = db.users.find(x=>x.id===(s.from===u.id?s.to:s.from));
    return `<a class="tile card" href="#/swaps/${s.id}" style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${esc(other.name)}</strong><p class="sub">${s.kind==='mutual'?`你教 ${esc(s.teach)} · 学 ${esc(s.learn)}`:`课时授课 ${esc(s.teach)}`} · ${s.hours} 课时</p></div>
      <span class="pill ${s.status==='completed'?'accent':''}">${st[s.status]}</span>
    </a>`;
  }).join("")}</div>`;
}

function swapDetail(u, id) {
  const s = db.swaps.find(x=>x.id===id);
  if (!s) return `<p>找不到互换</p>`;
  const other = db.users.find(x=>x.id===(s.from===u.id?s.to:s.from));
  const lessons = db.lessons.filter(l=>l.swapId===s.id);
  const settled = lessons.filter(l=>l.settled).length;
  const st = {proposed:"待接受",accepted:"已接受",active:"进行中",completed:"已完成",cancelled:"已取消"};
  const myReview = db.reviews.find(r=>r.swapId===s.id && r.fromId===u.id);
  return `<a class="sub" href="#/swaps">互换</a>
    <h1>${esc(other.name)}</h1>
    <div class="skills"><span class="pill accent">${st[s.status]}</span><span class="pill">${s.kind==='mutual'?'技能对技能':'课时'}</span><span class="pill">${settled}/${s.hours} 完成</span></div>
    <p class="sub" style="margin-top:12px">${s.kind==='mutual'?`${esc(s.teach)} ↔ ${esc(s.learn)}`:`授课 ${esc(s.teach)}，用课时结算。`}</p>
    ${s.status==='proposed' && s.to===u.id ? `<button class="btn" data-accept="${s.id}" style="margin-top:12px">接受</button>`:''}
    ${['proposed','accepted'].includes(s.status)?`<button class="btn ghost" data-cancel="${s.id}" style="margin-top:12px">取消</button>`:''}
    ${['accepted','active'].includes(s.status)?`<form class="tile card" style="margin-top:16px" data-lesson="${s.id}">
      <strong>约一节课</strong>
      <label class="field">时间<input type="datetime-local" name="start" required></label>
      <label class="field">方式<select name="mode"><option value="online">线上</option><option value="offline">线下</option></select></label>
      <label class="field">地点或会议备注<input name="place"></label>
      <button class="btn" style="margin-top:12px" type="submit">排上</button>
    </form>`:''}
    <h1 style="font-size:15px;margin-top:24px">课程</h1>
    ${lessons.length? lessons.map(l=>{
      const mine = s.from===u.id ? l.fromOk : l.toOk;
      return `<div class="tile card" style="margin-top:8px"><strong>${new Date(l.start).toLocaleString('zh-CN')}</strong>
        <p class="sub">${l.mode==='online'?'线上':'线下'}${l.place?' · '+esc(l.place):''}${l.settled?' · 已结算': mine?' · 你已确认':' · 待确认'}</p>
        ${!l.settled && !mine ? `<button class="btn ink" data-confirm="${l.id}" style="height:36px;margin-top:8px;font-size:12px">确认完成</button>`:''}
      </div>`;
    }).join("") : `<p class="sub">还没有排课。</p>`}
    ${s.status==='completed'?`<form class="tile card" style="margin-top:16px" data-review="${s.id}">
      <strong>评价 ${esc(other.name)}</strong>
      <label class="field">星级<select name="stars">${[5,4,3,2,1].map(n=>`<option ${myReview?.stars===n?'selected':''}>${n}</option>`).join("")}</select></label>
      <label class="field">短评<textarea name="body">${esc(myReview?.body||'')}</textarea></label>
      <button class="btn" style="margin-top:12px" type="submit">提交评价</button>
    </form>`:''}`;
}

function meView(u) {
  return `<div style="display:flex;justify-content:space-between"><div><h1>我的</h1><p class="sub">课时余额 ${u.credits} · <a href="#/credits" style="color:var(--accent)">流水</a></p></div>
    <button data-logout style="font-size:13px;color:var(--muted)">退出</button></div>
    <form class="tile card" style="margin-top:16px" data-profile>
      <strong>资料</strong>
      <label class="field">昵称<input name="name" value="${esc(u.name)}"></label>
      <label class="field">城市<input name="city" value="${esc(u.city)}"></label>
      <label class="field">简介<textarea name="bio">${esc(u.bio)}</textarea></label>
      <button class="btn ink" style="margin-top:12px;height:40px;font-size:13px" type="submit">保存资料</button>
    </form>
    ${offerEditor(u)}`;
}

function creditsView(u) {
  const rows = db.ledger.filter(x=>x.userId===u.id).sort((a,b)=>b.at-a.at);
  return `<a class="sub" href="#/me">我的</a><h1>课时</h1><p class="sub">当前余额 ${u.credits}。新账号送 4 课时。</p>
    ${rows.length? rows.map(r=>`<div class="tile card" style="margin-top:8px;display:flex;justify-content:space-between"><div>${esc(r.reason)}<p class="sub">${new Date(r.at).toLocaleString('zh-CN')}</p></div><strong style="color:${r.delta>=0?'var(--accent)':'var(--danger)'}">${r.delta>0?'+':''}${r.delta}</strong></div>`).join("") : `<p class="sub" style="margin-top:16px">还没有流水。</p>`}`;
}

function threadOf(a,b) {
  const [x,y] = a<b?[a,b]:[b,a];
  let t = db.threads.find(t=>t.a===x && t.b===y);
  if (!t) { t = { id: uid(), a:x, b:y, updatedAt: now() }; db.threads.push(t); }
  return t;
}

function render() {
  const app = document.getElementById("app");
  const r = route();
  const u = me();
  if (!u && !["","login","register"].includes(r.path)) { go("#/login"); return; }
  if (u && ["","login","register"].includes(r.path)) { go(needOnboard(u)?"#/onboarding":"#/discover"); return; }
  if (u && needOnboard(u) && r.path!=="onboarding") { go("#/onboarding"); }

  if (!u) {
    app.innerHTML = r.path==="login" ? authForm("login") : r.path==="register" ? authForm("register") : land();
    return;
  }
  let inner = "";
  let active = r.path;
  if (r.path==="discover") inner = matchList(u);
  else if (r.path==="people") inner = personView(u, r.id);
  else if (r.path==="inbox" && r.id) { inner = chatView(u, r.id); active="inbox"; }
  else if (r.path==="inbox") inner = inboxView(u);
  else if (r.path==="swaps" && r.id) { inner = swapDetail(u, r.id); active="swaps"; }
  else if (r.path==="swaps") inner = swapsView(u);
  else if (r.path==="credits") { inner = creditsView(u); active="me"; }
  else if (r.path==="onboarding") inner = `<h1>你能教什么，想学什么？</h1><p class="sub">各选至少一项，才能进入发现。</p>${offerEditor(u)}`;
  else inner = meView(u), active="me";
  app.innerHTML = shell(active, inner);
}

document.addEventListener("submit", (e) => {
  const f = e.target;
  if (!(f instanceof HTMLFormElement)) return;
  e.preventDefault();
  const fd = new FormData(f);
  if (f.dataset.auth) {
    const email = String(fd.get("email")||"").trim().toLowerCase();
    const password = String(fd.get("password")||"");
    const err = f.querySelector("[data-err]");
    if (f.dataset.auth==="register") {
      if (db.users.some(u=>u.email===email)) { err.textContent="这个邮箱已经注册过了"; return; }
      const user = { id:uid(), email, password, name:String(fd.get("name")||"新用户").slice(0,20), city:String(fd.get("city")||"线上"), bio:"", hue:[214,18,330,152,200][Math.floor(Math.random()*5)], credits:4, offers:[] };
      db.users.push(user); db.session = user.id; save(db); go("#/onboarding"); return;
    }
    const user = db.users.find(u=>u.email===email && u.password===password);
    if (!user) { err.textContent="邮箱或密码不对"; return; }
    db.session = user.id; save(db); go(needOnboard(user)?"#/onboarding":"#/discover"); return;
  }
  if (f.dataset.offers) {
    const u = me();
    const teach = [...f.querySelectorAll('[data-kind="teach"] .chip.on')].map(el=>el.dataset.skill);
    const learn = [...f.querySelectorAll('[data-kind="learn"] .chip.on')].map(el=>el.dataset.skill);
    if (!teach.length || !learn.length) { alert("请至少选择一个能教的和一个想学的"); return; }
    u.offers = [...teach.map(skill=>({id:uid(),skill,kind:"teach",level:"进阶",blurb:"",online:true,offline:false})),
                ...learn.map(skill=>({id:uid(),skill,kind:"learn",level:"入门",blurb:"",online:true,offline:false}))];
    save(db); go("#/discover"); return;
  }
  if (f.dataset.profile) {
    const u = me();
    u.name = String(fd.get("name")||u.name).slice(0,20);
    u.city = String(fd.get("city")||"");
    u.bio = String(fd.get("bio")||"").slice(0,200);
    save(db); render(); return;
  }
  if (f.dataset.send) {
    const body = String(fd.get("body")||"").trim();
    if (!body) return;
    const t = db.threads.find(x=>x.id===f.dataset.send);
    db.messages.push({ id:uid(), threadId:t.id, senderId:me().id, body, createdAt:now(), read:false });
    t.updatedAt = now(); save(db); render(); return;
  }
  if (f.dataset.swap) {
    const u = me(); const otherId = f.dataset.swap;
    const t = threadOf(u.id, otherId);
    const kind = String(fd.get("kind"));
    const swap = { id:uid(), threadId:t.id, from:u.id, to:otherId, kind, teach:String(fd.get("teach")), learn: kind==="mutual"?String(fd.get("learn")):"", hours: Math.min(8, Math.max(1, Number(fd.get("hours")||1))), status:"proposed", createdAt:now() };
    db.swaps.push(swap);
    db.messages.push({ id:uid(), threadId:t.id, senderId:u.id, body: kind==="mutual"?`发起了双向互换：${swap.hours} 课时`:`发起了课时互换：我来教，用 ${swap.hours} 课时结算`, createdAt:now(), read:false });
    t.updatedAt = now(); save(db); go("#/swaps/"+swap.id); return;
  }
  if (f.dataset.lesson) {
    const s = db.swaps.find(x=>x.id===f.dataset.lesson);
    db.lessons.push({ id:uid(), swapId:s.id, start: new Date(String(fd.get("start"))).getTime(), mode:String(fd.get("mode")), place:String(fd.get("place")||""), fromOk:false, toOk:false, settled:false });
    if (s.status==="accepted") s.status="active";
    save(db); render(); return;
  }
  if (f.dataset.review) {
    const u = me(); const s = db.swaps.find(x=>x.id===f.dataset.review);
    const toId = s.from===u.id?s.to:s.from;
    const existing = db.reviews.find(r=>r.swapId===s.id && r.fromId===u.id);
    const stars = Number(fd.get("stars")||5); const body = String(fd.get("body")||"");
    if (existing) { existing.stars=stars; existing.body=body; }
    else db.reviews.push({ id:uid(), swapId:s.id, fromId:u.id, toId, stars, body });
    save(db); render(); return;
  }
});

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.skill && t.closest("[data-kind]")) { t.classList.toggle("on"); return; }
  if (t.dataset.logout) { db.session=null; save(db); go("#/"); return; }
  if (t.dataset.msg) {
    const th = threadOf(me().id, t.dataset.msg); save(db); go("#/inbox/"+th.id); return;
  }
  if (t.dataset.accept) {
    const s = db.swaps.find(x=>x.id===t.dataset.accept); s.status="accepted"; save(db); render(); return;
  }
  if (t.dataset.cancel) {
    const s = db.swaps.find(x=>x.id===t.dataset.cancel); s.status="cancelled"; save(db); render(); return;
  }
  if (t.dataset.confirm) {
    const u = me(); const l = db.lessons.find(x=>x.id===t.dataset.confirm); const s = db.swaps.find(x=>x.id===l.swapId);
    if (s.from===u.id) l.fromOk=true; else l.toOk=true;
    if (l.fromOk && l.toOk && !l.settled) {
      l.settled = true;
      if (s.kind==="credit") {
        const teacher = db.users.find(x=>x.id===s.from); const learner = db.users.find(x=>x.id===s.to);
        teacher.credits += 1; learner.credits -= 1;
        db.ledger.push({ id:uid(), userId:teacher.id, delta:1, reason:"完成授课", at:now() });
        db.ledger.push({ id:uid(), userId:learner.id, delta:-1, reason:"完成学习", at:now() });
      }
      const done = db.lessons.filter(x=>x.swapId===s.id && x.settled).length;
      if (done >= s.hours) s.status="completed";
    }
    save(db); render();
  }
});

window.addEventListener("hashchange", render);
render();
