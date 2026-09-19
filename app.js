import * as Y from "https://esm.sh/yjs@13.6.21";
import { WebsocketProvider } from "https://esm.sh/y-websocket@2.1.0?deps=yjs@13.6.21";
import { IndexeddbPersistence } from "https://esm.sh/y-indexeddb@9.0.12?deps=yjs@13.6.21";

const ROOM = "dewyue-jineng-huan-v1";
const SESSION_KEY = "jineng-session";
const SKILLS = ["吉他","摄影","Python","日语","烘焙","健身","瑜伽","UI设计","声乐"];
const ydoc = new Y.Doc();
const usersY = ydoc.getMap("users");
const threadsY = ydoc.getMap("threads");
const messagesY = ydoc.getArray("messages");
const swapsY = ydoc.getMap("swaps");
const lessonsY = ydoc.getMap("lessons");
const reviewsY = ydoc.getArray("reviews");
const ledgerY = ydoc.getArray("ledger");
const activitiesY = ydoc.getArray("activities");
const projectsY = ydoc.getArray("projects");
const duelsY = ydoc.getMap("duels");

const persist = new IndexeddbPersistence(ROOM, ydoc);
const provider = new WebsocketProvider("wss://demos.yjs.dev", ROOM, ydoc, { connect: false });
const syncEl = () => document.getElementById("sync");
function setSync(ok, text) {
  const el = syncEl();
  if (!el) return;
  el.textContent = text;
  el.className = "sync" + (ok ? " on" : "");
}
provider.on("status", (e) => {
  setSync(e.status === "connected", e.status === "connected" ? "多人实时已连接" : "正在连接…");
});
provider.on("sync", () => {
  if (usersY.size === 0) seed();
  scheduleRender();
});
persist.on("synced", () => {
  if (usersY.size === 0) seed();
  scheduleRender();
});
setTimeout(() => provider.connect(), 0);

function uid(prefix="id") { return prefix + "-" + Math.random().toString(36).slice(2, 10); }
function now() { return Date.now(); }
function put(map, obj) { map.set(obj.id, obj); }
function list(map) { return [...map.values()]; }
function jlist(arr) { return arr.toArray(); }

function seed() {
  const rows = [
    { id:"u-demo", email:"demo@jineng.local", password:"demo1234", name:"林夏", city:"北京", bio:"写代码的人，想把木吉他捡回来。", hue:214, coins:240, xp:380, streak:5, lastDay:"", challengeDay:"", credits:6,
      offers:[{id:"o1",skill:"Python",kind:"teach",level:"进阶",blurb:"从零到小工具",online:true,offline:true},{id:"o2",skill:"吉他",kind:"learn",level:"入门",blurb:"想学弹唱",online:true,offline:true}] },
    { id:"u-zhou", email:"zhou@jineng.local", password:"demo1234", name:"周衡", city:"北京", bio:"民谣吉他十年。想用 Python 整理曲谱。", hue:18, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:4,
      offers:[{id:"o3",skill:"吉他",kind:"teach",level:"精通",blurb:"指弹与弹唱",online:true,offline:true},{id:"o4",skill:"Python",kind:"learn",level:"入门",blurb:"自动化整理谱子",online:true,offline:false}] },
    { id:"u-su", email:"su@jineng.local", password:"demo1234", name:"苏晚", city:"上海", bio:"拍人像，也拍食物。", hue:330, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:5,
      offers:[{id:"o5",skill:"摄影",kind:"teach",level:"进阶",blurb:"自然光人像",online:true,offline:true},{id:"o6",skill:"烘焙",kind:"learn",level:"入门",blurb:"先学会戚风",online:false,offline:true}] },
    { id:"u-chen", email:"chen@jineng.local", password:"demo1234", name:"陈麦", city:"上海", bio:"面点店学徒。想用相机记菜单。", hue:38, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:3,
      offers:[{id:"o7",skill:"烘焙",kind:"teach",level:"进阶",blurb:"吐司与司康",online:false,offline:true},{id:"o8",skill:"摄影",kind:"learn",level:"入门",blurb:"食物光线",online:true,offline:true}] },
    { id:"u-aoi", email:"takahashi@jineng.local", password:"demo1234", name:"高桥葵", city:"线上", bio:"日语教师。想重新会喘气。", hue:152, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:4,
      offers:[{id:"o9",skill:"日语",kind:"teach",level:"精通",blurb:"会话与 JLPT",online:true,offline:false},{id:"o10",skill:"健身",kind:"learn",level:"入门",blurb:"居家力量",online:true,offline:false}] },
    { id:"u-ma", email:"ma@jineng.local", password:"demo1234", name:"马力", city:"北京", bio:"力量训练教练。", hue:0, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:5,
      offers:[{id:"o11",skill:"健身",kind:"teach",level:"精通",blurb:"动作纠正",online:true,offline:true},{id:"o12",skill:"日语",kind:"learn",level:"入门",blurb:"先混个耳熟",online:true,offline:false}] },
    { id:"u-ye", email:"ye@jineng.local", password:"demo1234", name:"叶宁", city:"上海", bio:"后端。周末想出门拍照。", hue:260, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:4,
      offers:[{id:"o13",skill:"Python",kind:"teach",level:"精通",blurb:"接口和脚本",online:true,offline:false},{id:"o14",skill:"摄影",kind:"learn",level:"入门",blurb:"城市扫街",online:true,offline:true}] },
    { id:"u-ruan", email:"ruan@jineng.local", password:"demo1234", name:"阮清", city:"线上", bio:"教瑜伽。想做预约小工具。", hue:175, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:4,
      offers:[{id:"o15",skill:"瑜伽",kind:"teach",level:"进阶",blurb:"哈他与肩颈",online:true,offline:false},{id:"o16",skill:"Python",kind:"learn",level:"入门",blurb:"能写表格",online:true,offline:false}] },
    { id:"u-gu", email:"gu@jineng.local", password:"demo1234", name:"顾川", city:"北京", bio:"做界面。晚上想把吉他从墙上下来。", hue:200, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:4,
      offers:[{id:"o17",skill:"UI设计",kind:"teach",level:"进阶",blurb:"App 结构",online:true,offline:true},{id:"o18",skill:"吉他",kind:"learn",level:"入门",blurb:"三首歌",online:true,offline:true}] },
    { id:"u-song", email:"song@jineng.local", password:"demo1234", name:"宋词", city:"上海", bio:"声乐。想把课包装得更好看。", hue:280, coins:80, xp:160, streak:2, lastDay:"", challengeDay:"", credits:5,
      offers:[{id:"o19",skill:"声乐",kind:"teach",level:"精通",blurb:"气息与流行唱法",online:true,offline:true},{id:"o20",skill:"UI设计",kind:"learn",level:"入门",blurb:"个人页",online:true,offline:false}] },
  ];
  ydoc.transact(() => {
    rows.forEach((u) => usersY.set(u.id, u));
    threadsY.set("t-demo-zhou", { id:"t-demo-zhou", a:"u-demo", b:"u-zhou", updatedAt: now()-1000 });
    messagesY.push([{ id:"m1", threadId:"t-demo-zhou", senderId:"u-zhou", body:"看到你想学吉他。周末下午可以先上一节认识指法。", createdAt: now()-3600000, read:true }]);
    messagesY.push([{ id:"m2", threadId:"t-demo-zhou", senderId:"u-demo", body:"正好。我可以教你用 Python 整理曲谱。先约 1 小时？", createdAt: now()-1800000, read:false }]);
    activitiesY.push([
      { id:"a1", userId:"u-zhou", text:"周衡 完成了一节吉他课", at: now()-4000000 },
      { id:"a2", userId:"u-su", text:"苏晚 把摄影作品记进练习场", at: now()-3200000 },
      { id:"a3", userId:"u-demo", text:"林夏 发起了 Python ↔ 吉他 互换", at: now()-1800000 },
    ]);
    projectsY.push([{ id:"p1", userId:"u-zhou", skill:"吉他", body:"把《南山南》前两段拍成练习视频。", at: now()-86400000 }]);
  });
}

function me() {
  const id = localStorage.getItem(SESSION_KEY);
  return id ? usersY.get(id) : null;
}
function setMe(id) {
  if (id) localStorage.setItem(SESSION_KEY, id);
  else localStorage.removeItem(SESSION_KEY);
  provider.awareness.setLocalStateField("uid", id || null);
}
function onlineIds() {
  const s = new Set();
  provider.awareness.getStates().forEach((st) => { if (st.uid) s.add(st.uid); });
  return s;
}
function go(hash) { location.hash = hash; }
function route() {
  const h = (location.hash || "#/").replace(/^#/, "");
  const parts = h.split("/").filter(Boolean);
  return { path: parts[0] || "", id: parts[1] || "", extra: parts[2] || "" };
}
function needOnboard(u) {
  return !u.offers?.some((o) => o.kind === "teach") || !u.offers?.some((o) => o.kind === "learn");
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])); }
function avatar(u, size=44) {
  return `<span class="avatar" style="width:${size}px;height:${size}px;background:hsl(${u.hue||210} 42% 42%);font-size:${size*0.38}px">${esc(u.name).slice(0,1)}</span>`;
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function coinsOf(u) { return Number(u.coins || 0); }
function xpOf(u) { return Number(u.xp || 0); }
function rankOf(xp) {
  if (xp >= 800) return "大师";
  if (xp >= 400) return "专家";
  if (xp >= 150) return "进阶";
  return "入门";
}
function pushAct(userId, text) {
  activitiesY.push([{ id: uid("a"), userId, text, at: now() }]);
}
function grant(u, { coins=0, xp=0, extra={} } = {}) {
  usersY.set(u.id, { ...u, coins: coinsOf(u)+coins, xp: xpOf(u)+xp, ...extra });
}
function checkin(u) {
  const d = todayStr();
  if (u.lastDay === d) return u;
  const y = new Date(); y.setDate(y.getDate()-1);
  const ystr = y.toISOString().slice(0,10);
  const streak = u.lastDay === ystr ? Number(u.streak||0)+1 : 1;
  const next = { ...u, lastDay: d, streak };
  usersY.set(u.id, next);
  return next;
}
function completeChallenge(u, reason) {
  if (u.challengeDay === todayStr()) return;
  grant(usersY.get(u.id) || u, { coins: 40, xp: 15, extra: { challengeDay: todayStr() } });
  pushAct(u.id, `${u.name} 完成今日挑战：${reason}`);
}

const QUIZ = {
  "Python": [
    { q:"Python 里用什么定义函数？", a:["function","def","fun","lambda"], i:1 },
    { q:"列表末尾追加元素？", a:["add","push","append","insert"], i:2 },
    { q:"字典取值用？", a:["[] 或 get","only dot","only slice","eval"], i:0 },
    { q:"虚拟环境常见命令？", a:["pipenv only","venv","npm","cargo"], i:1 },
    { q:"for x in range(3) 循环几次？", a:["2","3","4","无限"], i:1 },
  ],
  "吉他": [
    { q:"标准调弦从粗到细？", a:["EADGBE","DADGBE","EADGBD","CGDA"], i:0 },
    { q:"C 大调和弦是？", a:["C E G","C F A","D F A","G B D"], i:0 },
    { q:"扫弦常用右手？", a:["只点弦","拨片或指甲","拳头","左手小指"], i:1 },
    { q:"空弦 6 弦是？", a:["高音 E","B","低音 E","A"], i:2 },
    { q:"入门先练什么最稳？", a:["速弹","和弦转换与节拍","只看谱不弹","调音随便"], i:1 },
  ],
  "摄影": [
    { q:"曝光三要素不含？", a:["快门","光圈","ISO","白平衡"], i:3 },
    { q:"大光圈主要带来？", a:["景深浅","更暗","更噪","透视消失"], i:0 },
    { q:"黄金时段通常指？", a:["正午","日出日落前后","午夜","阴天全天"], i:1 },
    { q:"人像常用焦段？", a:["8mm","50–85mm","400mm 必用","鱼眼"], i:1 },
    { q:"RAW 相对 JPEG？", a:["更小","后期空间更大","不能调色","没有直方图"], i:1 },
  ],
  "日语": [
    { q:"です／ます 属于？", a:["简体","敬体","关西腔","古语"], i:1 },
    { q:"「食べる」ます形？", a:["食べます","食べりす","食べるます","食ます"], i:0 },
    { q:"平假名用于？", a:["只写汉字","日语固有词与语法","商标英文","罗马音"], i:1 },
    { q:"JLPT 最高级？", a:["N5","N3","N1","N0"], i:2 },
    { q:"「私」常见读法？", a:["わたし","きみ","かれ","あなた"], i:0 },
  ],
  "烘焙": [
    { q:"戚风失败常见原因？", a:["蛋白打发不够或消泡","盐多了","只因模具贵","烤箱太干净"], i:0 },
    { q:"黄油室温软化是为了？", a:["更好乳化","蒸发","上色","杀菌"], i:0 },
    { q:" milliliter 量液体更准的是？", a:["量杯看液面","估一把","用刀背","看颜色"], i:0 },
    { q:"发酵主要靠？", a:["酵母或化学膨松","只靠烤箱灯","盐","色素"], i:0 },
    { q:"烤糊了优先检查？", a:["温度与时间","微信步数","昵称","城市"], i:0 },
  ],
  "健身": [
    { q:"深蹲优先保证？", a:["膝盖内扣","脊柱中立与髋膝轨迹","憋气到黑","只起脚尖"], i:1 },
    { q:"增肌训练组数通常？", a:["每动作 1 下","每肌群每周多次中等容量","全年每天力竭","永不休息"], i:1 },
    { q:"蛋白质作用？", a:["修复肌肉","只供甜味","替代睡眠","消除热身"], i:0 },
    { q:"热身目的？", a:["立刻力竭","提高体温与活动度","炫耀","跳过训练"], i:1 },
    { q:"卧推肩痛应？", a:["加大重量","调整轨迹或减负","完全不呼吸","锁死脖子"], i:1 },
  ],
  "瑜伽": [
    { q:"练习时呼吸原则？", a:["尽量憋气","均匀鼻吸鼻呼","只喝水代替","说话替代"], i:1 },
    { q:"下犬式主要伸展？", a:["后链与肩","只小指","耳垂","眉毛"], i:0 },
    { q:"疼痛尖锐时应？", a:["硬撑","退出或调整","加速","闭眼加时"], i:1 },
    { q:"垫子防滑是为了？", a:["稳定关节","好看","隔音","增高"], i:0 },
    { q:"冥想常放在？", a:["课末收束","必须课前吃辣","跑步机上","只节日"], i:0 },
  ],
  "UI设计": [
    { q:"对比度首先服务？", a:["可读与层级"," skeuomorphism","粒子特效","彩蛋"], i:0 },
    { q:"8pt 网格常见于？", a:["间距节奏","随机描边","印刷专色","3D 渲染"], i:0 },
    { q:"主按钮数量建议？", a:["一屏一个主操作","越多越好","禁止按钮","只有图标"], i:0 },
    { q:"空状态应该？", a:["告诉下一步","空白吓人","报错堆栈","闪屏"], i:0 },
    { q:"无障碍最小字号经验？", a:["过小装饰字当正文","正文可读","全大写必用","纯低对比"], i:1 },
  ],
  "声乐": [
    { q:"气息支撑主要来自？", a:["喉咙挤","腹与横膈","舌根硬顶","肩膀耸"], i:1 },
    { q:"开声常见练习？", a:["lip trill / 哼鸣","嘶吼一小时","冷饮灌嗓","吸烟"], i:0 },
    { q:"音准靠？", a:["只靠音响大声","听觉与稳定气息","美颜","滤镜"], i:1 },
    { q:"换声区处理？", a:["硬切喊","混声过渡","直接放弃高音","改乐器"], i:1 },
    { q:"课后嗓子沙应？", a:["继续飙高","休息补水减刺激","立刻比赛","吃辣椒"], i:1 },
  ],
};
function quizFor(skill) {
  return QUIZ[skill] || [
    { q:`关于「${skill}」，学习最有效的是？`, a:["只收藏不练","短时高频练习并反馈","一次通宵","从不请教"], i:1 },
    { q:"教别人时你应该？", a:["只炫技","拆成小步骤","嘲笑错误","不说话"], i:1 },
    { q:"卡住了怎么办？", a:["立刻放弃","缩小范围再练","换一个完全无关的技能并忘记","删账号"], i:1 },
    { q:"记录进度用？", a:["从不","笔记或作品","只发情绪","只对比别人"], i:1 },
    { q:"互换一小时最该带上？", a:["明确目标和练习作业","含糊夸奖","广告","无目标闲聊"], i:0 },
  ];
}
function shell(active, inner) {
  const u = me();
  const unread = jlist(messagesY).filter((m) => {
    const t = threadsY.get(m.threadId);
    if (!t || (t.a !== u.id && t.b !== u.id)) return false;
    return m.senderId !== u.id && !m.read;
  }).length;
  return `
    <header class="top"><div class="top-inner">
      <a class="brand" href="#/home">技能互换</a>
      <nav class="nav">
        <a href="#/home" class="${active==="home"?"on":""}">动态</a>
        <a href="#/discover" class="${active==="discover"?"on":""}">发现</a>
        <a href="#/practice" class="${active==="practice"?"on":""}">练习</a>
        <a href="#/board" class="${active==="board"?"on":""}">排行</a>
        <a href="#/inbox" class="${active==="inbox"?"on":""}">消息${unread?` ${unread}`:""}</a>
        <a href="#/swaps" class="${active==="swaps"?"on":""}">互换</a>
        <a href="#/me" class="${active==="me"?"on":""}">我的</a>
      </nav>
      <span style="font-size:13px;color:var(--muted)">${esc(u.name)} · ${coinsOf(u)}</span>
    </div></header>
    <main class="wrap">${inner}</main>
    <nav class="bottom">
      <a href="#/home" class="${active==="home"?"on":""}">动态</a>
      <a href="#/discover" class="${active==="discover"?"on":""}">发现</a>
      <a href="#/swaps" class="${active==="swaps"?"on":""}">互换</a>
      <a href="#/inbox" class="${active==="inbox"?"on":""}">消息</a>
      <a href="#/me" class="${active==="me"?"on":""}">我的</a>
    </nav>`;
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
    <p style="color:var(--accent);font-size:13px;font-weight:500;margin:56px 0 0">用一小时换一小时 · 不花钱</p>
    <h1>你能教的，正好是别人想学的。</h1>
    <p class="sub" style="max-width:44ch;font-size:16px;line-height:1.6">报班贵，自学难坚持。挂出技能、匹配、聊天、约课、评价、练习——全站共用一份实时数据。界面只有白、黑、蓝、红。</p>
    <div style="display:flex;gap:12px;margin-top:28px;flex-wrap:wrap">
      <a class="btn" href="#/register">免费注册</a>
      <a class="btn ink" href="#/login">演示账号登录</a>
    </div>
    <p class="sub">demo@jineng.local / demo1234 · 互聊 zhou@jineng.local</p>
    <div class="grid2">
      <div style="background:var(--muted-bg);border-radius:28px;padding:24px">
        <p style="font-size:12px;color:var(--accent);font-weight:600">匹配</p>
        <p style="font-size:22px;font-weight:600;margin:8px 0">双向优先</p>
        <p class="sub">你教的 ∩ 对方想学的，对不上就用课时。</p>
      </div>
      <div style="background:var(--muted-bg);border-radius:28px;padding:24px">
        <p style="font-size:12px;color:var(--ink);font-weight:600">会话与约课</p>
        <p style="font-size:22px;font-weight:600;margin:8px 0">聊完就排一小时</p>
        <p class="sub">互换协议、线上或线下、双方确认才结算。</p>
      </div>
      <div style="background:var(--muted-bg);border-radius:28px;padding:24px">
        <p style="font-size:12px;color:var(--danger);font-weight:600">技能币与连续</p>
        <p style="font-size:22px;font-weight:600;margin:8px 0">教 +50 · 学 +20</p>
        <p class="sub">断签连续天数归零。红字只用于警告和第一名。</p>
      </div>
      <div style="background:var(--muted-bg);border-radius:28px;padding:24px">
        <p style="font-size:12px;color:var(--muted);font-weight:600">练习场</p>
        <p style="font-size:22px;font-weight:600;margin:8px 0">测验 · 对决 · 作品</p>
        <p class="sub">5 题小测、1v1 对决、把练习证据贴上主页。</p>
      </div>
    </div>
  </div></div>`;
}
function authForm(mode) {
  return `<div class="wrap" style="max-width:420px;padding-top:64px">
    <a class="brand" href="#/">技能互换</a>
    <form class="tile card" style="padding:28px 24px;margin-top:20px" data-auth="${mode}">
      <h1 style="font-size:22px">${mode==="login"?"登录":"注册"}</h1>
      <p class="sub">${mode==="login"?"用邮箱进入技能互换。账号对全站用户可见。":"注册后其他人立刻能在发现里看到你。"}</p>
      ${mode==="register"?`<label class="field">昵称<input name="name" required></label>
        <label class="field">城市<input name="city" placeholder="北京 / 上海 / 线上"></label>`:""}
      <label class="field">邮箱<input name="email" type="email" required></label>
      <label class="field">密码<input name="password" type="password" required></label>
      <p class="err" data-err></p>
      <button class="btn" style="width:100%;margin-top:16px" type="submit">${mode==="login"?"进入":"创建账号"}</button>
      <p class="sub" style="text-align:center;margin-top:16px">
        ${mode==="login"?'还没有账号？ <a href="#/register" style="color:var(--accent)">注册</a>':'已有账号？ <a href="#/login" style="color:var(--accent)">登录</a>'}
      </p>
    </form>
    ${mode==="login"?'<p class="sub" style="text-align:center">演示号 demo@jineng.local / demo1234</p>':""}
  </div>`;
}

function homeView(u) {
  if (u.lastDay !== todayStr()) queueMicrotask(() => { const m = me(); if (m && m.id===u.id && m.lastDay !== todayStr()) checkin(m); });
  const feed = jlist(activitiesY).slice().sort((a,b)=>b.at-a.at).slice(0,24);
  const due = list(lessonsY).filter((l) => {
    const s = swapsY.get(l.swapId);
    if (!s || (s.from!==u.id && s.to!==u.id) || !l.settled) return false;
    const days = Math.floor((now()-l.start)/86400000);
    return [1,3,7,21].includes(days);
  });
  const challenged = u.challengeDay === todayStr();
  return `
    <h1>动态</h1>
    <p class="sub">技能币、连续天数、全站动态。练习场和排行从这里进。</p>
    <div class="stats">
      <div class="tile card"><p class="sub">技能币</p><p class="stat">${coinsOf(u)}</p></div>
      <div class="tile card"><p class="sub">课时</p><p class="stat">${u.credits||0}</p></div>
      <div class="tile card"><p class="sub">连续</p><p class="stat" style="color:var(--danger)">${u.streak||0}</p></div>
      <div class="tile card"><p class="sub">${rankOf(xpOf(u))}</p><p class="stat">${xpOf(u)} XP</p></div>
    </div>
    <div class="tile card" style="margin-top:12px">
      <strong>今日挑战</strong>
      <p class="sub">${challenged?"已完成，技能币已翻倍入账。":"完成一次小测或发出一条消息，额外 +40 币。"}</p>
      ${challenged?"":'<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><a class="btn" href="#/practice">去练习场</a><a class="btn ghost" href="#/inbox">去发消息</a></div>'}
    </div>
    <div class="skills" style="margin-top:16px">
      <a class="chip on" href="#/practice">练习场</a>
      <a class="chip" href="#/board">本周排行</a>
      <a class="chip" href="#/discover">找人互换</a>
    </div>
    ${due.length?`<div class="tile card" style="margin-top:16px;border:1px solid transparent;background:#ffeceb"><strong style="color:var(--danger)">间隔复习</strong><p class="sub">有课刚好落在 1 / 3 / 7 / 21 天。去练习场做一套题。</p></div>`:""}
    <h1 style="font-size:15px;margin-top:28px">周围的人在干什么</h1>
    <div class="list">${feed.length? feed.map((a)=>`<div class="tile card">${avatar(usersY.get(a.userId)||{name:"?",hue:210},36)}<div style="display:inline-block;vertical-align:middle;margin-left:8px"><strong>${esc(a.text)}</strong><p class="sub">${new Date(a.at).toLocaleString("zh-CN")}</p></div></div>`).join("") : `<p class="sub">还没有动态。</p>`}</div>
  `;
}

function practiceView(u) {
  const skills = [...new Set((u.offers||[]).map((o)=>o.skill))];
  const others = list(usersY).filter((x)=>x.id!==u.id);
  const mine = jlist(projectsY).filter((p)=>p.userId===u.id).sort((a,b)=>b.at-a.at);
  const myDuels = list(duelsY).filter((d)=>d.a===u.id||d.b===u.id).sort((a,b)=>b.at-a.at);
  return `
    <h1>练习场</h1>
    <p class="sub">小测巩固互换内容。对决赢了拿币。作品会出现在主页。</p>
    <div class="tile card" style="margin-top:16px">
      <strong>快速测验</strong>
      <p class="sub">5 道题。全对 +30 币，及格 +15。</p>
      <div class="skills">${skills.map((s)=>`<a class="chip on" href="#/quiz/${encodeURIComponent(s)}">${esc(s)}</a>`).join("")}
        ${SKILLS.filter((s)=>!skills.includes(s)).map((s)=>`<a class="chip" href="#/quiz/${encodeURIComponent(s)}">${esc(s)}</a>`).join("")}</div>
    </div>
    <form class="tile card" style="margin-top:12px" data-duel>
      <strong>技能对决</strong>
      <p class="sub">同一套题，分高的拿 30 币。</p>
      <label class="field">对手<select name="other">${others.map((o)=>`<option value="${o.id}">${esc(o.name)}</option>`).join("")}</select></label>
      <label class="field">技能<select name="skill">${SKILLS.map((s)=>`<option>${esc(s)}</option>`).join("")}</select></label>
      <button class="btn ink" style="margin-top:12px" type="submit">发起对决</button>
    </form>
    ${myDuels.length?`<div class="list">${myDuels.slice(0,6).map((d)=>{
      const other = usersY.get(d.a===u.id?d.b:d.a);
      const mineS = d.a===u.id?d.aScore:d.bScore;
      const theirs = d.a===u.id?d.bScore:d.aScore;
      return `<a class="tile card" href="#/quiz/${encodeURIComponent(d.skill)}/${d.id}"><strong>对决 ${esc(other?.name||"")}</strong>
        <p class="sub">${esc(d.skill)} · 你 ${mineS??"—"} / 对方 ${theirs??"—"} · ${d.winner? (d.winner===u.id?"你赢了":"对方赢了"):"进行中"}</p></a>`;
    }).join("")}</div>`:""}
    <form class="tile card" style="margin-top:12px" data-project>
      <strong>练习证据</strong>
      <label class="field">技能<select name="skill">${skills.map((s)=>`<option>${esc(s)}</option>`).join("")}${skills.length?"":SKILLS.map((s)=>`<option>${esc(s)}</option>`).join("")}</select></label>
      <label class="field">你做了什么<textarea name="body" required maxlength="200" placeholder="一段代码、一首曲子、一张照片说明…"></textarea></label>
      <button class="btn" style="margin-top:12px" type="submit">贴上主页</button>
    </form>
    ${mine.length?`<h1 style="font-size:15px;margin-top:24px">我的作品</h1>${mine.map((p)=>`<div class="tile card" style="margin-top:8px"><strong>${esc(p.skill)}</strong><p class="sub">${esc(p.body)}</p></div>`).join("")}`:""}
  `;
}

function quizView(u, skill, duelId) {
  skill = decodeURIComponent(skill || "");
  const qs = quizFor(skill);
  return `<a class="sub" href="#/practice">练习场</a>
    <h1>${esc(skill)} 小测</h1>
    <p class="sub">${duelId?"这是一场对决。提交后等待对方。":"五选一。提交立刻出分。"}</p>
    <form class="tile card" style="margin-top:16px" data-quiz="${esc(skill)}" data-duel-id="${esc(duelId||"")}">
      ${qs.map((item, idx)=>`<fieldset class="q" style="border:0;padding:0;margin-top:16px">
        <legend style="font-weight:600;font-size:14px">${idx+1}. ${esc(item.q)}</legend>
        ${item.a.map((opt, oi)=>`<label class="field" style="display:flex;align-items:center;gap:8px;margin-top:8px">
          <input type="radio" name="q${idx}" value="${oi}" required> <span>${esc(opt)}</span>
        </label>`).join("")}
      </fieldset>`).join("")}
      <button class="btn" style="margin-top:20px" type="submit">交卷</button>
    </form>`;
}

function boardView() {
  const rows = list(usersY).slice().sort((a,b)=>coinsOf(b)-coinsOf(a) || xpOf(b)-xpOf(a)).slice(0,10);
  return `<h1>排行</h1><p class="sub">按技能币。第一名用红字。</p>
    <div class="list">${rows.map((p,i)=>`<a class="tile card row" href="#/people/${p.id}">
      <span class="rank ${i===0?"hot":""}">${i+1}</span>${avatar(p)}
      <div style="flex:1"><strong>${esc(p.name)}</strong><p class="sub">${esc(p.city)} · ${rankOf(xpOf(p))} · ${xpOf(p)} XP</p></div>
      <strong class="${i===0?"hot":""}">${coinsOf(p)}</strong>
    </a>`).join("")}</div>`;
}

function matchList(u, skill) {
  const online = onlineIds();
  const myTeach = new Set((u.offers||[]).filter((o)=>o.kind==="teach").map((o)=>o.skill));
  const myLearn = new Set((u.offers||[]).filter((o)=>o.kind==="learn").map((o)=>o.skill));
  const cards = list(usersY).filter((x)=>x.id!==u.id).map((other) => {
    const theyTeach = (other.offers||[]).filter((o)=>o.kind==="teach");
    const theyLearn = (other.offers||[]).filter((o)=>o.kind==="learn");
    const theyTeachYouWant = theyTeach.filter((o)=>myLearn.has(o.skill));
    const youTeachTheyWant = (u.offers||[]).filter((o)=>o.kind==="teach" && theyLearn.some((t)=>t.skill===o.skill));
    if (skill) {
      if (!theyTeach.some((o)=>o.skill===skill)) return null;
    } else if (!theyTeachYouWant.length && !youTeachTheyWant.length) return null;
    const mutual = theyTeachYouWant.length && youTeachTheyWant.length;
    const sameCity = u.city===other.city && u.city!=="线上";
    const score = (mutual?100:0) + theyTeachYouWant.length*12 + youTeachTheyWant.length*12 + (sameCity?8:0) + Math.min(20, Math.floor(coinsOf(other)/40));
    return { other, theyTeachYouWant, youTeachTheyWant, mutual, sameCity, score };
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  const filters = allSkills();
  const head = `<h1>发现</h1><p class="sub">双向优先。点技能筛选能教的人。</p>
    <div class="skills">${filters.map((s)=>`<a class="chip ${skill===s?"on":""}" href="#/discover/${encodeURIComponent(s)}">${esc(s)}</a>`).join("")}${skill?`<a class="chip" href="#/discover">清除</a>`:""}</div>`;
  if (!cards.length) return `${head}<p class="sub" style="margin-top:16px">暂时没有匹配。</p>`;
  return `${head}
    <div class="list">${cards.map((c)=>`
      <a class="tile card row" href="#/people/${c.other.id}">
        ${avatar(c.other)}
        <div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <strong>${esc(c.other.name)}</strong>
            <span class="sub">${esc(c.other.city)}</span>
            ${online.has(c.other.id)?'<span class="pill accent">在线</span>':""}
            <span class="pill ${c.mutual?"accent":""}">${c.mutual?"双向互换":"单向"}</span>
            ${c.sameCity?'<span class="pill">同城</span>':""}
          </div>
          <p class="sub">${esc(c.other.bio)}</p>
          <div class="skills">${c.theyTeachYouWant.map((o)=>`<span class="pill accent">可学 ${esc(o.skill)}</span>`).join("")}
            ${c.youTeachTheyWant.map((o)=>`<span class="pill">可教 ${esc(o.skill)}</span>`).join("")}</div>
        </div>
      </a>`).join("")}</div>`;
}

function personView(u, id) {
  const p = usersY.get(id);
  if (!p || p.id===u.id) return `<p>没有这个人</p>`;
  const teach = (p.offers||[]).filter((o)=>o.kind==="teach");
  const learn = (p.offers||[]).filter((o)=>o.kind==="learn");
  const myTeach = (u.offers||[]).filter((o)=>o.kind==="teach");
  const myLearn = new Set((u.offers||[]).filter((o)=>o.kind==="learn").map((o)=>o.skill));
  const reviews = jlist(reviewsY).filter((r)=>r.toId===p.id);
  const avg = reviews.length ? (reviews.reduce((s,r)=>s+r.stars,0)/reviews.length).toFixed(1) : null;
  const on = onlineIds().has(p.id);
  return `
    <div class="tile card row">${avatar(p,56)}<div>
      <h1 style="font-size:24px">${esc(p.name)} ${on?'<span class="pill accent">在线</span>':""}</h1>
      <p class="sub">${esc(p.city)} · ${rankOf(xpOf(p))} · ${coinsOf(p)} 币${avg?` · ${avg} 分 · ${reviews.length} 评`:" · 还没有评价"}</p>
      <p style="margin:12px 0">${esc(p.bio)}</p>
      <button class="btn" data-msg="${p.id}">发消息</button>
    </div></div>
    <div class="grid2" style="margin-top:12px">
      <div class="tile card"><p class="sub">能教</p>${teach.map((o)=>`<p style="margin:12px 0 0"><strong>${esc(o.skill)}</strong> <span class="pill ${myLearn.has(o.skill)?"accent":""}">${esc(o.level)}</span><br><span class="sub">${esc(o.blurb)}</span></p>`).join("")}</div>
      <div class="tile card"><p class="sub">想学</p>${learn.map((o)=>`<p style="margin:12px 0 0"><strong>${esc(o.skill)}</strong> <span class="pill">${esc(o.level)}</span><br><span class="sub">${esc(o.blurb)}</span></p>`).join("")}</div>
    </div>
    <form class="tile card" style="margin-top:12px" data-swap="${p.id}">
      <strong>提出互换</strong>
      <label class="field">方式<select name="kind"><option value="mutual">技能对技能</option><option value="credit">用课时</option></select></label>
      <label class="field">我来教<select name="teach">${myTeach.map((o)=>`<option>${esc(o.skill)}</option>`).join("")}</select></label>
      <label class="field">向对方学<select name="learn">${teach.map((o)=>`<option>${esc(o.skill)}</option>`).join("")}</select></label>
      <label class="field">课时数<input name="hours" type="number" min="1" max="8" value="1"></label>
      <button class="btn" style="margin-top:12px" type="submit">发给对方</button>
    </form>
    <h1 style="font-size:15px;margin-top:24px">评价</h1>
    ${reviews.length? reviews.map((r)=>`<div class="tile card" style="margin-top:8px"><strong>${esc(usersY.get(r.fromId)?.name||"")} · ${r.stars} 星</strong><p class="sub">${esc(r.body||"没有文字")}</p></div>`).join("") : `<p class="sub">还没有人评价过。</p>`}
    ${(() => { const ps = jlist(projectsY).filter((x)=>x.userId===p.id).sort((a,b)=>b.at-a.at); return ps.length?`<h1 style="font-size:15px;margin-top:24px">练习证据</h1>`+ps.map((x)=>`<div class="tile card" style="margin-top:8px"><strong>${esc(x.skill)}</strong><p class="sub">${esc(x.body)}</p></div>`).join(""):""; })()}
  `;
}

function allSkills() {
  const set = new Set(SKILLS);
  for (const u of usersY.values()) {
    for (const o of u.offers || []) if (o.skill) set.add(o.skill);
  }
  return [...set];
}

function offerEditor(u) {
  const teach = new Set((u.offers||[]).filter((o)=>o.kind==="teach").map((o)=>o.skill));
  const learn = new Set((u.offers||[]).filter((o)=>o.kind==="learn").map((o)=>o.skill));
  const skills = allSkills();
  const block = (kind, title, set) => `
    <div class="tile card" style="margin-top:12px">
      <strong>${title}</strong>
      <p class="sub">点选，或输入自定义标签后回车。</p>
      <div class="skills" data-kind="${kind}">
        ${skills.map((s)=>`<button type="button" class="chip ${set.has(s)?"on":""}" data-skill="${esc(s)}">${esc(s)}</button>`).join("")}
      </div>
      <div class="add-tag">
        <input data-custom-kind="${kind}" maxlength="16" placeholder="自定义标签，回车添加" />
      </div>
    </div>`;
  return `<form data-offers>${block("teach","我能教的",teach)}${block("learn","我想学的",learn)}
    <p class="err" data-offer-err hidden></p>
    <button class="btn" style="margin-top:16px" type="submit">保存并进入发现</button></form>`;
}

function inboxView(u) {
  const threads = list(threadsY).filter((t)=>t.a===u.id||t.b===u.id).sort((a,b)=>b.updatedAt-a.updatedAt);
  if (!threads.length) return `<h1>消息</h1><div class="tile card" style="margin-top:16px;text-align:center;padding:40px">还没有对话。</div>`;
  return `<h1>消息</h1><div class="list">${threads.map((t)=>{
    const other = usersY.get(t.a===u.id?t.b:t.a);
    const last = jlist(messagesY).filter((m)=>m.threadId===t.id).sort((a,b)=>b.createdAt-a.createdAt)[0];
    const unread = last && last.senderId!==u.id && !last.read;
    return `<a class="tile card row" href="#/inbox/${t.id}">${avatar(other||{name:"?",hue:200})}<div style="flex:1;min-width:0">
      <div style="display:flex;justify-content:space-between"><strong>${esc(other?.name||"")}</strong>${unread?'<span class="pill accent">未读</span>':""}${onlineIds().has(other?.id)?'<span class="pill accent">在线</span>':""}</div>
      <p class="sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(last?.body||"还没有消息")}</p>
    </div></a>`;
  }).join("")}</div>`;
}

const markedRead = new Set();
function markThreadRead(threadId, userId) {
  if (markedRead.has(threadId + userId)) return;
  markedRead.add(threadId + userId);
  const next = jlist(messagesY);
  const dirty = next.some((m) => m.threadId === threadId && m.senderId !== userId && !m.read);
  if (!dirty) return;
  ydoc.transact(() => {
    for (let i = next.length - 1; i >= 0; i--) {
      const m = next[i];
      if (m.threadId === threadId && m.senderId !== userId && !m.read) {
        messagesY.delete(i, 1);
        messagesY.insert(i, [{ ...m, read: true }]);
      }
    }
  });
}

function chatView(u, id) {
  const t = threadsY.get(id);
  if (!t || (t.a!==u.id && t.b!==u.id)) return `<p>没有这场对话</p>`;
  const other = usersY.get(t.a===u.id?t.b:t.a);
  queueMicrotask(() => markThreadRead(id, u.id));
  const msgs = jlist(messagesY).filter((m)=>m.threadId===id).sort((a,b)=>a.createdAt-b.createdAt);
  return `<a class="sub" href="#/inbox">消息</a>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h1 style="font-size:22px">${esc(other.name)} ${onlineIds().has(other.id)?'<span class="pill accent">在线</span>':""}</h1>
      <a href="#/people/${other.id}" style="color:var(--accent);font-size:13px;font-weight:500">主页</a>
    </div>
    <div class="msgs" style="margin-top:16px">${msgs.map((m)=>`<div class="${m.senderId===u.id?"msg-me":"msg-them"}">${esc(m.body)}</div>`).join("")}</div>
    <form class="composer" data-send="${id}"><input name="body" placeholder="写一条消息" autocomplete="off"><button class="btn" type="submit">发送</button></form>`;
}

function swapsView(u) {
  const listS = list(swapsY).filter((s)=>s.from===u.id||s.to===u.id).sort((a,b)=>b.createdAt-a.createdAt);
  const st = {proposed:"待接受",accepted:"已接受",active:"进行中",completed:"已完成",cancelled:"已取消"};
  if (!listS.length) return `<h1>互换</h1><div class="tile card" style="margin-top:16px;text-align:center;padding:40px">还没有互换。</div>`;
  return `<h1>互换</h1><div class="list">${listS.map((s)=>{
    const other = usersY.get(s.from===u.id?s.to:s.from);
    return `<a class="tile card" href="#/swaps/${s.id}" style="display:flex;justify-content:space-between;align-items:center">
      <div><strong>${esc(other?.name||"")}</strong><p class="sub">${s.kind==="mutual"?`你教 ${esc(s.teach)} · 学 ${esc(s.learn)}`:`课时授课 ${esc(s.teach)}`} · ${s.hours} 课时</p></div>
      <span class="pill ${s.status==="completed"?"accent":""}">${st[s.status]}</span>
    </a>`;
  }).join("")}</div>`;
}

function swapDetail(u, id) {
  const s = swapsY.get(id);
  if (!s) return `<p>找不到互换</p>`;
  const other = usersY.get(s.from===u.id?s.to:s.from);
  const lessons = list(lessonsY).filter((l)=>l.swapId===s.id);
  const settled = lessons.filter((l)=>l.settled).length;
  const st = {proposed:"待接受",accepted:"已接受",active:"进行中",completed:"已完成",cancelled:"已取消"};
  const myReview = jlist(reviewsY).find((r)=>r.swapId===s.id && r.fromId===u.id);
  return `<a class="sub" href="#/swaps">互换</a>
    <h1>${esc(other?.name||"")}</h1>
    <div class="skills"><span class="pill accent">${st[s.status]}</span><span class="pill">${s.kind==="mutual"?"技能对技能":"课时"}</span><span class="pill">${settled}/${s.hours} 完成</span></div>
    ${s.status==="proposed" && s.to===u.id ? `<button class="btn" data-accept="${s.id}" style="margin-top:12px">接受</button>`:""}
    ${["proposed","accepted"].includes(s.status)?`<button class="btn ghost" data-cancel="${s.id}" style="margin-top:12px">取消</button>`:""}
    ${["accepted","active"].includes(s.status)?`<form class="tile card" style="margin-top:16px" data-lesson="${s.id}">
      <strong>约一节课</strong>
      <label class="field">时间<input type="datetime-local" name="start" required></label>
      <label class="field">方式<select name="mode"><option value="online">线上</option><option value="offline">线下</option></select></label>
      <label class="field">地点或会议备注<input name="place"></label>
      <button class="btn" style="margin-top:12px" type="submit">排上</button>
    </form>`:""}
    <h1 style="font-size:15px;margin-top:24px">课程</h1>
    ${lessons.length? lessons.map((l)=>{
      const mine = s.from===u.id ? l.fromOk : l.toOk;
      return `<div class="tile card" style="margin-top:8px"><strong>${new Date(l.start).toLocaleString("zh-CN")}</strong>
        <p class="sub">${l.mode==="online"?"线上":"线下"}${l.place?" · "+esc(l.place):""}${l.settled?" · 已结算": mine?" · 你已确认":" · 待确认"}</p>
        ${!l.settled && !mine ? `<button class="btn ink" data-confirm="${l.id}" style="height:36px;margin-top:8px;font-size:12px">确认完成</button>`:""}
      </div>`;
    }).join("") : `<p class="sub">还没有排课。</p>`}
    ${s.status==="completed"?`<form class="tile card" style="margin-top:16px" data-review="${s.id}">
      <strong>评价 ${esc(other?.name||"")}</strong>
      <label class="field">星级<select name="stars">${[5,4,3,2,1].map((n)=>`<option ${myReview?.stars===n?"selected":""}>${n}</option>`).join("")}</select></label>
      <label class="field">短评<textarea name="body">${esc(myReview?.body||"")}</textarea></label>
      <button class="btn" style="margin-top:12px" type="submit">提交评价</button>
    </form>`:""}`;
}

function meView(u) {
  return `<div style="display:flex;justify-content:space-between"><div><h1>我的</h1><p class="sub">${coinsOf(u)} 币 · ${u.credits} 课时 · 连续 ${u.streak||0} 天 · <a href="#/credits" style="color:var(--accent)">流水</a> · <a href="#/practice" style="color:var(--accent)">练习场</a> · <a href="#/board" style="color:var(--accent)">排行</a></p></div>
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
  const rows = jlist(ledgerY).filter((x)=>x.userId===u.id).sort((a,b)=>b.at-a.at);
  return `<a class="sub" href="#/me">我的</a><h1>课时</h1><p class="sub">当前余额 ${u.credits}。新账号送 4 课时。</p>
    ${rows.length? rows.map((r)=>`<div class="tile card" style="margin-top:8px;display:flex;justify-content:space-between"><div>${esc(r.reason)}<p class="sub">${new Date(r.at).toLocaleString("zh-CN")}</p></div><strong style="color:${r.delta>=0?"var(--accent)":"var(--danger)"}">${r.delta>0?"+":""}${r.delta}</strong></div>`).join("") : `<p class="sub" style="margin-top:16px">还没有流水。</p>`}`;
}

function threadOf(a,b) {
  const [x,y] = a<b ? [a,b] : [b,a];
  const id = "t-"+x+"-"+y;
  let t = threadsY.get(id);
  if (!t) { t = { id, a:x, b:y, updatedAt: now() }; threadsY.set(id, t); }
  return t;
}

let renderTimer = 0;
let lastPainted = "";
function scheduleRender(force = false) {
  if (renderTimer) return;
  renderTimer = requestAnimationFrame(() => {
    renderTimer = 0;
    render(force);
  });
}

function render(force = false) {
  const app = document.getElementById("app");
  if (!app) return;
  const r = route();
  const key = location.hash || "#/";
  const typing = document.activeElement && app.contains(document.activeElement) &&
    ["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName);
  if (!force && typing && key === lastPainted) return;

  const u = me();
  if (!u && !["","login","register"].includes(r.path)) { go("#/login"); return; }
  if (u && ["","login","register"].includes(r.path)) { go(needOnboard(u)?"#/onboarding":"#/home"); return; }
  if (u && needOnboard(u) && r.path!=="onboarding" && r.path!=="me") { go("#/onboarding"); return; }

  lastPainted = key;
  if (!u) {
    app.innerHTML = r.path==="login" ? authForm("login") : r.path==="register" ? authForm("register") : land();
    return;
  }
  let inner = "", active = r.path;
  if (r.path==="home") inner = homeView(u);
  else if (r.path==="discover") inner = matchList(u, r.id ? decodeURIComponent(r.id) : "");
  else if (r.path==="people") inner = personView(u, r.id);
  else if (r.path==="practice") inner = practiceView(u);
  else if (r.path==="quiz") { inner = quizView(u, r.id, r.extra); active="practice"; }
  else if (r.path==="board") inner = boardView();
  else if (r.path==="inbox" && r.id) { inner = chatView(u, r.id); active="inbox"; }
  else if (r.path==="inbox") inner = inboxView(u);
  else if (r.path==="swaps" && r.id) { inner = swapDetail(u, r.id); active="swaps"; }
  else if (r.path==="swaps") inner = swapsView(u);
  else if (r.path==="credits") { inner = creditsView(u); active="me"; }
  else if (r.path==="onboarding") inner = `<h1>你能教什么，想学什么？</h1><p class="sub">各选至少一项。可以点现成标签，也可以自己输入。</p>${offerEditor(u)}`;
  else { inner = meView(u); active="me"; }
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
      if ([...usersY.values()].some((u)=>u.email===email)) { err.textContent="这个邮箱已经注册过了"; return; }
      const btn = f.querySelector("button[type=submit]");
      if (btn) { btn.disabled = true; btn.textContent = "进入中…"; }
      const user = { id:uid("u"), email, password, name:String(fd.get("name")||"新用户").slice(0,20), city:String(fd.get("city")||"线上"), bio:"", hue:[214,18,330,152,200][Math.floor(Math.random()*5)], coins:0, xp:0, streak:0, lastDay:"", challengeDay:"", credits:4, offers:[], lastSeenAt: now() };
      usersY.set(user.id, user); setMe(user.id); pushAct(user.id, `${user.name} 加入了技能互换`); go("#/onboarding"); render(true); return;
    }
    const user = [...usersY.values()].find((u)=>u.email===email && u.password===password);
    if (!user) { err.textContent="邮箱或密码不对"; return; }
    setMe(user.id); go(needOnboard(user)?"#/onboarding":"#/home"); return;
  }
  if (f.dataset.offers) {
    const u = me();
    if (!u) return;
    const teach = [...f.querySelectorAll('[data-kind="teach"] .chip.on')].map((el)=>el.dataset.skill).filter(Boolean);
    const learn = [...f.querySelectorAll('[data-kind="learn"] .chip.on')].map((el)=>el.dataset.skill).filter(Boolean);
    const err = f.querySelector("[data-offer-err]");
    if (!teach.length || !learn.length) {
      if (err) { err.hidden = false; err.textContent = "请至少各选一个能教的和想学的（可自定义）"; }
      return;
    }
    usersY.set(u.id, { ...u, offers: [
      ...teach.map((skill)=>({id:uid("o"),skill,kind:"teach",level:"进阶",blurb:"",online:true,offline:false})),
      ...learn.map((skill)=>({id:uid("o"),skill,kind:"learn",level:"入门",blurb:"",online:true,offline:false})),
    ]});
    go("#/home");
    render(true);
    return;
  }
  if (f.dataset.profile) {
    const u = me();
    usersY.set(u.id, { ...u, name:String(fd.get("name")||u.name).slice(0,20), city:String(fd.get("city")||""), bio:String(fd.get("bio")||"").slice(0,200) });
    return;
  }
  if (f.dataset.send) {
    const body = String(fd.get("body")||"").trim();
    if (!body) return;
    const t = threadsY.get(f.dataset.send);
    messagesY.push([{ id:uid("m"), threadId:t.id, senderId:me().id, body, createdAt:now(), read:false }]);
    threadsY.set(t.id, { ...t, updatedAt: now() });
    const u = me();
    if (u && u.challengeDay !== todayStr()) completeChallenge(u, "发了一条消息");
    return;
  }
  if (f.dataset.swap) {
    const u = me(); const otherId = f.dataset.swap;
    const t = threadOf(u.id, otherId);
    const kind = String(fd.get("kind"));
    const swap = { id:uid("s"), threadId:t.id, from:u.id, to:otherId, kind, teach:String(fd.get("teach")), learn: kind==="mutual"?String(fd.get("learn")):"", hours: Math.min(8, Math.max(1, Number(fd.get("hours")||1))), status:"proposed", createdAt:now() };
    swapsY.set(swap.id, swap);
    messagesY.push([{ id:uid("m"), threadId:t.id, senderId:u.id, body: kind==="mutual"?`发起了双向互换：${swap.hours} 课时`:`发起了课时互换`, createdAt:now(), read:false }]);
    threadsY.set(t.id, { ...t, updatedAt: now() });
    pushAct(u.id, `${u.name} 向 ${usersY.get(otherId)?.name||"同伴"} 发起了互换`);
    go("#/swaps/"+swap.id); return;
  }
  if (f.dataset.lesson) {
    const s = swapsY.get(f.dataset.lesson);
    const lesson = { id:uid("l"), swapId:s.id, start: new Date(String(fd.get("start"))).getTime(), mode:String(fd.get("mode")), place:String(fd.get("place")||""), fromOk:false, toOk:false, settled:false };
    lessonsY.set(lesson.id, lesson);
    if (s.status==="accepted") swapsY.set(s.id, { ...s, status:"active" });
    return;
  }
  if (f.dataset.review) {
    const u = me(); const s = swapsY.get(f.dataset.review);
    const toId = s.from===u.id?s.to:s.from;
    const stars = Number(fd.get("stars")||5); const body = String(fd.get("body")||"");
    const all = jlist(reviewsY);
    const idx = all.findIndex((r)=>r.swapId===s.id && r.fromId===u.id);
    const rec = { id: idx>=0?all[idx].id:uid("r"), swapId:s.id, fromId:u.id, toId, stars, body };
    if (idx>=0) { reviewsY.delete(idx,1); reviewsY.insert(idx,[rec]); }
    else reviewsY.push([rec]);
  }
  if (f.dataset.project) {
    const u = me();
    const body = String(fd.get("body")||"").trim();
    if (!body) return;
    projectsY.push([{ id:uid("p"), userId:u.id, skill:String(fd.get("skill")||""), body, at:now() }]);
    grant(u, { coins: 10, xp: 8 });
    pushAct(u.id, `${u.name} 上传了 ${fd.get("skill")} 练习证据`);
    go("#/me");
    return;
  }
  if (f.dataset.duel) {
    const u = me();
    const other = String(fd.get("other")||"");
    const skill = String(fd.get("skill")||"");
    if (!other || other===u.id) return;
    const d = { id:uid("d"), a:u.id, b:other, skill, aScore:null, bScore:null, winner:null, at:now() };
    duelsY.set(d.id, d);
    pushAct(u.id, `${u.name} 发起了 ${skill} 对决`);
    go("#/quiz/"+encodeURIComponent(skill)+"/"+d.id);
    return;
  }
  if (f.dataset.quiz) {
    const u = me();
    const skill = f.dataset.quiz;
    const qs = quizFor(skill);
    let score = 0;
    qs.forEach((item, idx) => { if (Number(fd.get("q"+idx)) === item.i) score += 1; });
    const coins = score === 5 ? 30 : score >= 3 ? 15 : 5;
    grant(u, { coins, xp: score * 6 });
    const fresh = usersY.get(u.id);
    if (fresh && fresh.challengeDay !== todayStr()) completeChallenge(fresh, "完成小测");
    const duelId = f.dataset.duelId;
    if (duelId && duelsY.get(duelId)) {
      const d = duelsY.get(duelId);
      const next = { ...d };
      if (d.a === u.id) next.aScore = score; else if (d.b === u.id) next.bScore = score;
      if (next.aScore != null && next.bScore != null && !next.winner) {
        if (next.aScore !== next.bScore) {
          next.winner = next.aScore > next.bScore ? next.a : next.b;
          const w = usersY.get(next.winner);
          if (w) grant(w, { coins: 30, xp: 20 });
        } else next.winner = "tie";
      }
      duelsY.set(d.id, next);
    }
    pushAct(u.id, `${u.name} 完成了 ${skill} 小测 ${score}/5`);
    alert(`${skill}：${score}/5，+${coins} 技能币`);
    go("#/practice");
    return;
  }
});

function addCustomChip(input) {
  const kind = input.dataset.customKind;
  const name = String(input.value || "").trim().slice(0, 16);
  if (!kind || !name) return;
  const box = input.closest(".tile")?.querySelector(`[data-kind="${kind}"]`);
  if (!box) return;
  const exists = [...box.querySelectorAll(".chip")].find((c) => c.dataset.skill === name);
  if (exists) exists.classList.add("on");
  else {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip on";
    btn.dataset.skill = name;
    btn.textContent = name;
    box.appendChild(btn);
  }
  input.value = "";
}

document.addEventListener("keydown", (e) => {
  const input = e.target;
  if (!(input instanceof HTMLInputElement) || !input.dataset.customKind) return;
  if (e.key !== "Enter") return;
  e.preventDefault();
  addCustomChip(input);
});

document.addEventListener("click", (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.skill && t.closest("[data-kind]")) {
    e.preventDefault();
    t.classList.toggle("on");
    return;
  }
  if (t.dataset.logout) { setMe(null); go("#/"); return; }
  if (t.dataset.msg) { const th = threadOf(me().id, t.dataset.msg); go("#/inbox/"+th.id); return; }
  if (t.dataset.accept) {
    const s = swapsY.get(t.dataset.accept);
    if (s && s.status==="proposed" && s.to===me().id) swapsY.set(s.id, { ...s, status:"accepted" });
    return;
  }
  if (t.dataset.cancel) {
    const s = swapsY.get(t.dataset.cancel);
    if (s && ["proposed","accepted"].includes(s.status)) swapsY.set(s.id, { ...s, status:"cancelled" });
    return;
  }
  if (t.dataset.confirm) {
    const u = me(); const l = lessonsY.get(t.dataset.confirm); const s = swapsY.get(l.swapId);
    const next = { ...l };
    if (s.from===u.id) next.fromOk = true; else next.toOk = true;
    if (next.fromOk && next.toOk && !next.settled) {
      next.settled = true;
      if (s.kind==="credit") {
        const teacher = usersY.get(s.from); const learner = usersY.get(s.to);
        usersY.set(teacher.id, { ...teacher, credits: teacher.credits+1, coins: coinsOf(teacher)+50, xp: xpOf(teacher)+40 });
        usersY.set(learner.id, { ...learner, credits: learner.credits-1, coins: coinsOf(learner)+20, xp: xpOf(learner)+15 });
        ledgerY.push([{ id:uid("c"), userId:teacher.id, delta:1, reason:"完成授课", at:now() }]);
        ledgerY.push([{ id:uid("c"), userId:learner.id, delta:-1, reason:"完成学习", at:now() }]);
        pushAct(teacher.id, `${teacher.name} 教完一节，+50 技能币`);
      } else {
        const teacher = usersY.get(s.from); const learner = usersY.get(s.to);
        usersY.set(teacher.id, { ...teacher, coins: coinsOf(teacher)+50, xp: xpOf(teacher)+40 });
        usersY.set(learner.id, { ...learner, coins: coinsOf(learner)+20, xp: xpOf(learner)+15 });
        pushAct(teacher.id, `${teacher.name} 与 ${learner.name} 完成了一节互换课`);
      }
      const done = list(lessonsY).filter((x)=>x.swapId===s.id && (x.id===l.id?true:x.settled)).length + (next.settled && !l.settled ? 0 : 0);
      const settledCount = list(lessonsY).filter((x)=>x.swapId===s.id && x.settled).length + 1;
      if (settledCount >= s.hours) swapsY.set(s.id, { ...s, status:"completed" });
    }
    lessonsY.set(next.id, next);
  }
});

ydoc.on("update", () => scheduleRender());
provider.awareness.on("change", () => scheduleRender());
window.addEventListener("hashchange", () => render(true));
render(true);
