'use strict';
/* ============================================================
 * 摩卡Tap —— 仿 Mikutap：点击/拖动屏幕，摩卡叫会卡在节拍上
 * 背景音轨：Web Audio 实时合成的劲爆鼓组 + 洗脑和弦循环
 * 视觉（仿 Mikutap）：
 *   · 全屏几何特效，以屏幕正中心为原点铺满全屏
 *   · 新特效叠在旧特效之上，旧特效随即退场
 *   · 固定米白背景；限定调色板：主色黄 + 次色灰（极少点缀色）
 *   · 特效带常驻动效（旋转 / 漂浮 / 环绕 / 波动）并随节拍轻微脉动（只做大小/形状变化，不变色）
 * ============================================================ */

/* ---------- 节奏常量 ---------- */
const BPM = 128;          // 激情劲爆的速度
const SPB = 60 / BPM;     // 每拍秒数
const S16 = SPB / 4;      // 16 分音符（调度步长）
const S8  = SPB / 2;      // 8 分音符（点击量化的最小节奏点）
const MASTER_GAIN = 0.85;

/* ---------- 全局状态 ---------- */
let ctx = null;           // AudioContext
let master = null;        // 总线增益
let bgmBus = null;        // 循环音乐总线
let sfxBus = null;        // 狗叫音效总线
let noiseBuf = null;      // 白噪声（鼓组用）
let started = false;
let bgmMuted = false;
let sfxMuted = false;

let startTime = 0;        // 第 0 步对应的 audio 时间
let nextNoteTime = 0;     // 调度器下一个音符时间
let stepCount = 0;        // 16 分步进计数（0..63 循环 = 4 小节）

const buffers = {};       // 解码后的狗叫样本
const sustainLoops = {};  // 从原样本中实时构建的 WSOLA 延音纹理

// 每条纹理由多个波形相似的语音帧重叠生成。帧位置按黄金分割序列变化，
// 再在目标附近寻找相关度最高的波形，避免固定短片段形成可辨识的循环节。
const SUSTAIN_REGIONS = {
  da: {
    enabled: false,
    regionStart: 0.065, regionEnd: 0.168,
    frame: 0.052, overlap: 0.026, search: 0.007,
    wrapBlend: 0.040, textureDuration: 7.31, seed: 0.17,
  },
  gou: {
    enabled: false,
    regionStart: 0.055, regionEnd: 0.140,
    frame: 0.048, overlap: 0.024, search: 0.006,
    wrapBlend: 0.036, textureDuration: 7.73, seed: 0.43,
  },
  jiao: {
    enabled: true,
    regionStart: 0.125, regionEnd: 0.290,
    frame: 0.100, overlap: 0.050, search: 0.012,
    wrapBlend: 0.040, textureDuration: 12.37, seed: 0.71,
    preferFrameEntry: true,
  },
};
const SUSTAIN_CLAIM_LEAD = 0.008; // 提前声明长音，避免多指延音短暂重叠
const RELEASE_SCHEDULE_LEAD = 0.006;
const EMERGENCY_FADE = 0.018;

const liveVoices = new Set();
let voiceSerial = 0;
let activeSustainVoice = null;
let mouthVoice = null;

let cols = 4, rows = 3;   // 分区网格（纯逻辑分区，无可见格子）
// 手机竖屏优化：4 列 × 3 行（12 格）为一个单元，单元宽 = 屏宽、高 = 400px，
// 自底边向上复制多份，使底部（拇指可及区）即可触发全部 12 个分区。
const MOBILE_UNIT_HEIGHT = 300;
const mobileMedia = window.matchMedia('(max-width: 600px) and (pointer: coarse)');
let mobileTiled = false;
let zones = [];           // 每个分区的音色配置

let mouthTimer = 0;       // 闭嘴定时器
let mouthPopped = false;  // 狗是否处于"叫"的弹起状态（弹簧目标值）
let barkPop = 0;          // 叫弹跳的当前量 0..1（欠阻尼弹簧，可过冲）
let barkPopVel = 0;       // 弹簧速度（每次触发新声音时施加冲量）
const BARK_KICK = 5.2;    // 单次触发给弹簧的冲量（果断起跳）
const BARK_KICK_MAX = 9;  // 连打时冲量累积上限，防止爆炸
let holding = false;      // 是否正在长按延音（驱动 Q 弹成长 / 变红 / 抖动）

/* ---------- 尾巴卷度 & 闲置分享 ---------- */
let energyValue = 0;          // 用户累计的尾巴卷度（每次点击随机 +1..5）
let lastActivityAt = 0;       // 最近一次有效交互的时间（用于闲置检测）
let shareOpen = false;        // 闲置分享弹层是否打开
const IDLE_POPUP_SEC = 3;   // 停下 3 秒无操作即弹出分享卡（nowSec 返回秒）
/* 用于截图的摩卡图：来自 dog-data.js 的 data URL，画进 canvas 不会污染（file:// 也可用） */
let dogShareImg = null;       // 闭嘴
let dogShareImgOpen = null;   // 张嘴
if (window.DOG_CARD_DATA_URL) {
  dogShareImg = new Image();
  dogShareImg.src = window.DOG_CARD_DATA_URL;
}
if (window.DOG_OPEN_DATA_URL) {
  dogShareImgOpen = new Image();
  dogShareImgOpen.src = window.DOG_OPEN_DATA_URL;
}
/* 分享卡底部二维码：来自 qr-data.js 的 data URL，画进 canvas 不污染（file:// 也可用） */
let qrShareImg = null;
if (window.QR_WANGWANG_DATA_URL) {
  qrShareImg = new Image();
  qrShareImg.src = window.QR_WANGWANG_DATA_URL;
}
let holdLevel = 0;        // 长按累积程度 0..1（缓慢增长、松手快速回落）
let jellyScale = 1;       // 果冻层当前缩放（欠阻尼弹簧，带 Q 弹过冲）
let jellyVel = 0;         // 弹簧速度
let lastTick = 0;         // 上一帧时间（求 dt 用）
let latestClaudeText = null;
let latestClaudeTextBornAt = 0;
const INPUT_LOOKAHEAD = 0.12;
const INPUT_QUEUE_LOOKAHEAD = 0.03;
const inputQueue = [];     // 滑动经过的分区按进入顺序排到连续八分音符
const inputVisualTimers = new Set();
let inputSerial = 0;
let lastCommittedInputTime = -Infinity;
const pointers = new Map();// pointerId -> { zone, voice, pendingEntryId, lastX, lastY }

/* 双指捏合/拉伸 → 立即截图并弹出分享卡：手机端没有右键，用这个手势替代。
 * 两个手指只是点触（距离几乎不变）不触发；一起往中间挤或往外拉（距离明显变化）才触发。 */
const PINCH_DELTA = 0.25;               // 两指距离相对初始变化超过 25% 即触发（挤或拉皆可）
const PINCH_MIN_START_DIST = 70;        // 初始两指距离下限，过近不判，避免误触
let pinchStartDist = 0;                 // >0 表示正在跟踪一次双指手势（初始距离）
let pinchTriggered = false;             // 本轮双指手势是否已触发分享，防止重复弹出
const shareGesturePointers = new Set(); // 触发分享的指针 id：抬起/移动时跳过 markActivity，否则会立刻关掉刚弹出的分享卡

function dist2D(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

// 根据当前活跃指针更新双指状态；两指距离明显变大或变小（非纯点触）则立即截图弹分享卡。
function updatePinch() {
  if (!isCoarsePointer) return;            // 仅手机端（触屏）启用，桌面端走右键
  if (pointers.size < 2) { pinchStartDist = 0; pinchTriggered = false; return; }
  if (shareOpen) return;                   // 分享卡已开，不再重复触发
  const ids = [...pointers.keys()];
  const a = pointers.get(ids[0]);
  const b = pointers.get(ids[1]);
  if (!a || !b) return;
  const d = dist2D(a.lastX, a.lastY, b.lastX, b.lastY);
  if (pinchStartDist === 0) { pinchStartDist = d; return; }   // 记录本轮起点
  // 距离相对初始变化超过 PINCH_DELTA（挤到 75% 以下，或拉到 125% 以上）即触发
  const changed =
    d <= pinchStartDist * (1 - PINCH_DELTA) ||
    d >= pinchStartDist * (1 + PINCH_DELTA);
  if (
    !pinchTriggered &&
    pinchStartDist >= PINCH_MIN_START_DIST &&
    changed
  ) {
    pinchTriggered = true;
    for (const id of ids) shareGesturePointers.add(id);  // 这两指后续不参与闲置/关闭判定
    if (started) openShare();
  }
}

const CONTROLS_IDLE_MS = 2000;
const CONTROLS_HOVER_IDLE_MS = 250;
const NAVIGATION_MUTE_KEY = 'moka-navigation-muted';
let controlsIdleTimer = 0;
let navigationMuted = false;

try {
  navigationMuted =
    window.sessionStorage.getItem(NAVIGATION_MUTE_KEY) === '1';
} catch (error) {
  console.warn('[摩卡Tap] 无法读取导航临时静音状态。', error);
}

/* ---------- DOM ---------- */
const stage     = document.getElementById('stage');
const fxCanvas  = document.getElementById('fx');
const dogEl     = document.getElementById('dog');
const dogInner  = document.getElementById('dog-inner');
const dogJelly  = document.getElementById('dog-jelly');
const flashLayer = document.getElementById('zoneflash');
const clickTextLayer = document.getElementById('click-text-layer');
const fx2d      = fxCanvas.getContext('2d');
const topControls = document.getElementById('top-controls');
const musicToggle = document.getElementById('music-toggle');
const sfxToggle = document.getElementById('sfx-toggle');
const reduceUiMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const energyHud = document.getElementById('energy-hud');
const energyNum = document.getElementById('energy-num');
const shareOverlay = document.getElementById('share-overlay');
const shareCard = document.getElementById('share-card');
const shareArt = document.getElementById('share-art');
const shareHint = document.getElementById('share-hint');
const shareActions = document.getElementById('share-actions');
const shareDownload = document.getElementById('share-download');
const shareDismiss = document.getElementById('share-dismiss');
const shareClose = document.getElementById('share-close');
const dogCloseImg = document.getElementById('dog-close');
const isCoarsePointer = window.matchMedia('(pointer: coarse)').matches ||
  ('ontouchstart' in window && navigator.maxTouchPoints > 0);

function showControls() {
  if (reentryMode) return;             // 息屏恢复的欢迎界面期间，不显示声音按钮
  if (pointers.size > 0 || holding) return;
  topControls.classList.add('is-visible');
}

function hideControlsUntilIdle() {
  topControls.classList.remove('is-visible');
  topControls.classList.remove('is-revealing-fast');
  clearTimeout(controlsIdleTimer);
  controlsIdleTimer = setTimeout(showControls, CONTROLS_IDLE_MS);
}

function accelerateControlsReveal() {
  if (
    topControls.classList.contains('is-visible') ||
    pointers.size > 0 ||
    holding
  ) return;
  topControls.classList.add('is-revealing-fast');
  clearTimeout(controlsIdleTimer);
  controlsIdleTimer = setTimeout(showControls, CONTROLS_HOVER_IDLE_MS);
}

function setBusMuted(bus, muted) {
  if (!ctx || !bus) return;
  const now = ctx.currentTime;
  bus.gain.cancelScheduledValues(now);
  bus.gain.setTargetAtTime(muted ? 0 : 1, now, 0.015);
}

function setNavigationMute(muted) {
  navigationMuted = muted;

  try {
    if (muted) {
      window.sessionStorage.setItem(NAVIGATION_MUTE_KEY, '1');
    } else {
      window.sessionStorage.removeItem(NAVIGATION_MUTE_KEY);
    }
  } catch (error) {
    console.warn('[摩卡Tap] 无法保存导航临时静音状态。', error);
  }

  if (!ctx || !master) return;
  const now = ctx.currentTime;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, now, 0.015);
}

function restoreAfterNavigation() {
  if (navigationMuted) setNavigationMute(false);
}

function uiText(key) {
  return { music: '音乐', soundEffects: '音效', turnOn: '开启', turnOff: '关闭' }[key] || key;
}

function updateMuteButton(button, muted, labelKey) {
  const action = uiText(muted ? 'turnOn' : 'turnOff');
  const label = uiText(labelKey);
  button.classList.toggle('is-muted', muted);
  button.setAttribute('aria-pressed', String(muted));
  button.setAttribute('aria-label', `${action}${label}`);
  button.title = `${action}${label}`;
}

function toggleMusic() {
  bgmMuted = !bgmMuted;
  setBusMuted(bgmBus, bgmMuted);
  updateMuteButton(musicToggle, bgmMuted, 'music');
}

function toggleSoundEffects() {
  sfxMuted = !sfxMuted;
  setBusMuted(sfxBus, sfxMuted);
  updateMuteButton(sfxToggle, sfxMuted, 'soundEffects');

  if (sfxMuted) {
    dogInner.classList.remove('bark-image');
  } else if (mouthVoice) {
    dogInner.classList.add('bark-image');
  }
}

function setRhythmScale(element, pulse, amount) {
  element.style.setProperty(
    '--rhythm-scale',
    (1 + pulse * amount).toFixed(4)
  );
}

function updateUiRhythm(beatPosition) {
  if (!Number.isFinite(beatPosition)) {
    setRhythmScale(musicToggle, 0, 0.075);
    setRhythmScale(sfxToggle, 0, 0.075);
    return;
  }

  const phase = ((beatPosition % 1) + 1) % 1;
  const beatIndex = Math.floor(beatPosition);
  const pulse = reduceUiMotion ? 0 : Math.pow(1 - phase, 4.5);
  let musicPulse = 0;
  let sfxPulse = 0;

  if (!bgmMuted && !sfxMuted) {
    if (((beatIndex % 2) + 2) % 2 === 0) musicPulse = pulse;
    else sfxPulse = pulse;
  } else if (!bgmMuted) {
    musicPulse = pulse;
  } else if (!sfxMuted) {
    sfxPulse = pulse;
  }

  setRhythmScale(musicToggle, musicPulse, 0.075);
  setRhythmScale(sfxToggle, sfxPulse, 0.075);
}

for (const button of topControls.querySelectorAll('button')) {
  button.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') accelerateControlsReveal();
  });
  button.addEventListener('click', (event) => {
    if (!topControls.classList.contains('is-visible')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      accelerateControlsReveal();
    }
  }, { capture: true });
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('pointermove', (event) => event.stopPropagation());
  button.addEventListener('pointerup', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => event.stopPropagation());
}
musicToggle.addEventListener('click', toggleMusic);
sfxToggle.addEventListener('click', toggleSoundEffects);
// 按下手形光标：按下时切换为“按压”形态，松开恢复
{
  const root = document.documentElement;
  const release = () => root.classList.remove('is-pressing');
  window.addEventListener('pointerdown', () => root.classList.add('is-pressing'));
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
}

document.addEventListener(
  'pointerdown',
  (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest('#music-toggle, #sfx-toggle')
    ) {
      return;
    }
    restoreAfterNavigation();
  },
  { capture: true }
);

/* ---------- 和弦走向：C - G - Am - F（简单洗脑） ---------- */
const CHORDS = [
  { bass: 65.41, notes: [261.63, 329.63, 392.00, 523.25] }, // C
  { bass: 49.00, notes: [196.00, 246.94, 293.66, 392.00] }, // G
  { bass: 55.00, notes: [220.00, 261.63, 329.63, 440.00] }, // Am
  { bass: 43.65, notes: [174.61, 220.00, 261.63, 349.23] }, // F
];
const HAT_VEL = [0.34, 0.16, 0.42, 0.16];

// tools/analyze_pitch.py 实测所得：高能量、高置信度有声帧 MIDI 的加权中位数。
// 三段原音音高不一致，因此每个按键都从各自锚点反推固定目标音的 playbackRate。
const BARK_SOURCE_MIDI = Object.freeze({
  da: 71.1950846771,
  gou: 65.5950930881,
  jiao: 71.1226079346,
});

// 固定 A 小调五声音阶（A–C–D–E–G）。第三列 / 第三行是最接近
// 对应原声音高的音：da / jiao → C5，gou → G4。
const BARK_TARGET_MIDI = Object.freeze({
  da: Object.freeze([79, 76, 72, 69]),    // G5, E5, C5, A4
  gou: Object.freeze([72, 69, 67, 64]),   // C5, A4, G4, E4
  jiao: Object.freeze([79, 76, 72, 69]),  // G5, E5, C5, A4
});

/* ============================================================
 * 主色调色板（全页面只用这几支颜色）
 * ==========================================================*/
const C = {
  cream: '#fff2dc',   // 背景 · 米白（固定不变）
  amber: '#ffb400',   // 主色 · 黄
  gray:  '#87837e',   // 次要 · 灰
  coral: '#ff5a5f',   // 点缀（少量）
  teal:  '#16c2a3',   // 点缀（少量）
  blue:  '#3e7bfa',   // 点缀（少量）
};
const ACCENTS = [C.coral, C.teal, C.blue];

/* 形状取色：约 62% 主色黄，28% 灰，10% 点缀色 */
function pickColor(rng) {
  const r = rng();
  if (r < 0.62) return C.amber;
  if (r < 0.9) return C.gray;
  return ACCENTS[(rng() * ACCENTS.length) | 0];
}

/* ---------- 12 个全屏特效（均以屏幕正中心为原点，铺满全屏） ---------- */
const EFFECTS = [
  'rings',    // 同心环爆发
  'poly',     // 多边形绽放
  'spiral',   // 螺旋弹珠
  'rays',     // 放射光芒
  'confetti', // 几何纸屑
  'zigzag',   // 折线穿越
  'pop',      // 弹性几何雨
  'cross',    // 巨大十字
  'orbit',    // 环绕轨道
  'wave',     // 波浪丝带
  'stars',    // 星星弹跳
  'grid',     // 旋转线栅
];

/* ============================================================
 * 音频初始化
 * ==========================================================*/
function initAudio() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();

  master = ctx.createGain();
  master.gain.value = navigationMuted ? 0 : MASTER_GAIN;
  bgmBus = ctx.createGain();
  bgmBus.gain.value = bgmMuted ? 0 : 1;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxMuted ? 0 : 1;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 24;
  comp.ratio.value = 5;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  bgmBus.connect(master);
  sfxBus.connect(master);
  master.connect(comp);
  comp.connect(ctx.destination);

  // 1 秒白噪声
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/**
 * Safari / iOS / 微信内置浏览器：AudioContext 创建后默认 suspended，
 * 仅调用 resume() 不够，必须在用户手势的同步调用栈里真正 start() 一段音频。
 * 否则点击只会走视觉回退（张嘴无声）。
 */
let audioUnlockPromise = null;
function unlockAudio() {
  if (!ctx) return Promise.resolve(false);
  if (ctx.state === 'running') return Promise.resolve(true);

  // 同步播放 1 帧静音：这是 iOS 解锁 Web Audio 的关键手势动作
  try {
    const silent = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
    const src = ctx.createBufferSource();
    src.buffer = silent;
    src.connect(ctx.destination);
    src.start(0);
  } catch (_) { /* 忽略：部分旧环境不允许在 suspended 时 start */ }

  if (!audioUnlockPromise || ctx.state === 'suspended' || ctx.state === 'interrupted') {
    audioUnlockPromise = ctx.resume()
      .then(() => ctx.state === 'running')
      .catch(() => false)
      .finally(() => { audioUnlockPromise = null; });
  }
  return audioUnlockPromise;
}

function bindAudioUnlockGestures() {
  const unlock = () => { unlockAudio(); };
  // pointer + touch 双绑：覆盖桌面 Safari、iPhone Safari、微信 webview
  for (const type of ['pointerdown', 'touchstart', 'mousedown']) {
    window.addEventListener(type, unlock, { capture: true, passive: true });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') unlockAudio();
  });
  // 微信 iOS：等 JSSDK bridge 就绪后再抢一次解锁
  const unlockWeixin = () => {
    try {
      if (window.WeixinJSBridge) {
        window.WeixinJSBridge.invoke('getNetworkType', {}, () => { unlockAudio(); });
      }
    } catch (_) { /* 非微信环境 */ }
  };
  if (window.WeixinJSBridge) unlockWeixin();
  else document.addEventListener('WeixinJSBridgeReady', unlockWeixin, { once: true });
}

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function loadSamples() {
  for (const n of ['da', 'gou', 'jiao']) {
    buffers[n] = await ctx.decodeAudioData(b64ToArrayBuffer(AUDIO_B64[n]));
    sustainLoops[n] = SUSTAIN_REGIONS[n].enabled
      ? buildSustainTexture(buffers[n], SUSTAIN_REGIONS[n])
      : null;
  }
}

function monoMix(source) {
  const mono = new Float32Array(source.length);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const data = source.getChannelData(ch);
    for (let i = 0; i < data.length; i++) mono[i] += data[i];
  }
  const scale = 1 / source.numberOfChannels;
  for (let i = 0; i < mono.length; i++) mono[i] *= scale;
  return mono;
}

function bestWsolaStart(
  input,
  output,
  outputStart,
  overlapFrames,
  regionMin,
  regionMax,
  target,
  searchFrames,
  previousStart
) {
  const candidateStep = 8;
  const compareStep = 4;
  const lo = Math.max(regionMin, target - searchFrames);
  const hi = Math.min(regionMax, target + searchFrames);
  let bestStart = Math.max(regionMin, Math.min(regionMax, target));
  let bestScore = -Infinity;

  for (let start = lo; start <= hi; start += candidateStep) {
    let dot = 0, energyOut = 0, energyIn = 0;
    for (let i = 0; i < overlapFrames; i += compareStep) {
      const a = output[outputStart + i];
      const b = input[start + i];
      dot += a * b;
      energyOut += a * a;
      energyIn += b * b;
    }

    if (energyOut < 1e-9 || energyIn < 1e-9) continue;
    let score = dot / Math.sqrt(energyOut * energyIn);

    // 相关度接近时偏向不同位置，减少连续使用同一组声带周期。
    const distance = Math.abs(start - previousStart);
    if (distance < overlapFrames * 0.18) score -= 0.06;
    score -= Math.abs(Math.log(Math.sqrt(energyIn / energyOut))) * 0.04;

    if (score > bestScore) {
      bestScore = score;
      bestStart = start;
    }
  }
  return bestStart;
}

/* WSOLA 风格的延音纹理：
 * 1. 在稳定元音区内以低差异序列选择不同帧；
 * 2. 用波形相关度微调每一帧的相位；
 * 3. 用 raised-cosine 重叠相加，得到数秒长且无短周期的纹理；
 * 4. 记录每次淡化结束的位置，松手时可从那里逐采样接回原音。 */
function buildSustainTexture(source, region) {
  const sr = source.sampleRate;
  const regionMin = Math.max(0, Math.round(region.regionStart * sr));
  const regionEnd = Math.min(source.length, Math.round(region.regionEnd * sr));
  const frameFrames = Math.round(region.frame * sr);
  const overlapFrames = Math.round(region.overlap * sr);
  const hopFrames = frameFrames - overlapFrames;
  const searchFrames = Math.round(region.search * sr);
  const wrapFrames = Math.round(region.wrapBlend * sr);
  const regionMax = regionEnd - frameFrames;

  if (
    regionMin >= regionMax ||
    overlapFrames <= 1 ||
    hopFrames <= 1 ||
    wrapFrames >= frameFrames
  ) {
    throw new Error('Invalid sustain region');
  }

  const requestedFrames = Math.ceil(region.textureDuration * sr);
  const workingLength = requestedFrames + frameFrames + wrapFrames;
  const channels = Array.from(
    { length: source.numberOfChannels },
    () => new Float32Array(workingLength)
  );
  const inputMono = monoMix(source);
  const outputMono = new Float32Array(workingLength);
  const releaseFrames = [];

  // 第一帧从稳定区后段进入，第二帧固定到最晚安全位置，
  // 让原始起音自然走到成熟元音后再交给纹理。
  const entryStart = regionMax;
  const firstStart = Math.max(regionMin, entryStart - overlapFrames);
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    channels[ch].set(
      source.getChannelData(ch).subarray(firstStart, firstStart + frameFrames),
      0
    );
  }
  outputMono.set(
    inputMono.subarray(firstStart, firstStart + frameFrames),
    0
  );

  let previousStart = firstStart;
  let lastFilled = frameFrames;
  for (
    let step = 1, outputStart = hopFrames;
    outputStart + frameFrames <= workingLength;
    step++, outputStart += hopFrames
  ) {
    let candidateStart;
    if (step === 1) {
      candidateStart = entryStart;
    } else {
      const golden = (region.seed + step * 0.618033988749895) % 1;
      let target = Math.round(regionMin + golden * (regionMax - regionMin));

      // 若目标仍贴着上一帧，移到稳定区的另一侧再做相关搜索。
      if (Math.abs(target - previousStart) < overlapFrames * 0.2) {
        const span = regionMax - regionMin;
        target = Math.round(
          regionMin + ((target - regionMin + span * 0.47) % span)
        );
      }

      candidateStart = bestWsolaStart(
        inputMono,
        outputMono,
        outputStart,
        overlapFrames,
        regionMin,
        regionMax,
        target,
        searchFrames,
        previousStart
      );
    }

    for (let i = 0; i < overlapFrames; i++) {
      const p = i / (overlapFrames - 1);
      const mix = 0.5 - 0.5 * Math.cos(Math.PI * p);
      outputMono[outputStart + i] =
        outputMono[outputStart + i] * (1 - mix) +
        inputMono[candidateStart + i] * mix;

      for (let ch = 0; ch < source.numberOfChannels; ch++) {
        const output = channels[ch];
        const input = source.getChannelData(ch);
        output[outputStart + i] =
          output[outputStart + i] * (1 - mix) +
          input[candidateStart + i] * mix;
      }
    }

    outputMono.set(
      inputMono.subarray(
        candidateStart + overlapFrames,
        candidateStart + frameFrames
      ),
      outputStart + overlapFrames
    );
    for (let ch = 0; ch < source.numberOfChannels; ch++) {
      channels[ch].set(
        source.getChannelData(ch).subarray(
          candidateStart + overlapFrames,
          candidateStart + frameFrames
        ),
        outputStart + overlapFrames
      );
    }

    releaseFrames.push({
      textureFrame: outputStart + overlapFrames,
      sourceFrame: candidateStart + overlapFrames,
    });
    previousStart = candidateStart;
    lastFilled = outputStart + frameFrames;
  }

  // 环形淡化只在数秒至十余秒纹理的最外层发生；
  // 日常听到的是内部不断变化的 WSOLA 帧，不再是几十毫秒短循环。
  const textureFrames = lastFilled - wrapFrames;
  const loopBuffer = ctx.createBuffer(
    source.numberOfChannels,
    textureFrames,
    sr
  );
  for (let ch = 0; ch < source.numberOfChannels; ch++) {
    const input = channels[ch];
    const output = loopBuffer.getChannelData(ch);
    output.set(input.subarray(0, textureFrames));
    for (let i = 0; i < wrapFrames; i++) {
      const p = i / (wrapFrames - 1);
      const mix = 0.5 - 0.5 * Math.cos(Math.PI * p);
      const tail = input[textureFrames + i];
      const head = input[i];
      output[i] = tail * (1 - mix) + head * mix;
    }
  }

  const validReleaseFrames = releaseFrames.filter(
    point =>
      point.textureFrame >= wrapFrames &&
      point.textureFrame < textureFrames
  );
  if (wrapFrames < hopFrames) {
    validReleaseFrames.push({
      textureFrame: wrapFrames,
      sourceFrame: firstStart + wrapFrames,
    });
    validReleaseFrames.sort((a, b) => a.textureFrame - b.textureFrame);
  }
  const attackPoint = region.preferFrameEntry
    ? validReleaseFrames.find(point => point.textureFrame >= frameFrames)
    : validReleaseFrames[0];
  if (!attackPoint) throw new Error('Sustain texture has no release points');

  return {
    buffer: loopBuffer,
    attackOffset: attackPoint.textureFrame / sr,
    tailOffset: attackPoint.sourceFrame / sr,
    releasePoints: validReleaseFrames.map(point => ({
      textureOffset: point.textureFrame / sr,
      sourceOffset: point.sourceFrame / sr,
    })),
  };
}

/* ============================================================
 * 鼓组 / 贝斯 / 和弦 合成音色
 * ==========================================================*/
function kick(t) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.11);
  g.gain.setValueAtTime(0.95, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
  o.connect(g); g.connect(bgmBus);
  o.start(t); o.stop(t + 0.26);
}

function snare(t, vol = 0.5) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  n.connect(f); f.connect(g); g.connect(bgmBus);
  n.start(t); n.stop(t + 0.18);
  // 军鼓腔体
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(240, t);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(vol * 0.5, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(g2); g2.connect(bgmBus);
  o.start(t); o.stop(t + 0.1);
}

function hat(t, vol, decay) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  n.connect(f); f.connect(g); g.connect(bgmBus);
  n.start(t); n.stop(t + decay + 0.02);
}

function crash(t) {
  const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.32, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  n.connect(f); f.connect(g); g.connect(bgmBus);
  n.start(t); n.stop(t + 1.3);
}

function stab(t, freqs) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2600, t);
  f.frequency.exponentialRampToValueAtTime(600, t + 0.28);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  f.connect(g); g.connect(bgmBus);
  for (const fr of freqs) {
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = fr;
      o.detune.value = det;
      o.connect(f);
      o.start(t); o.stop(t + 0.3);
    }
  }
}

function bass(t, fr, vol) {
  const o = ctx.createOscillator(); o.type = 'square';
  o.frequency.value = fr * 2;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + S8 * 0.9);
  o.connect(f); f.connect(g); g.connect(bgmBus);
  o.start(t); o.stop(t + S8);
}

/* ============================================================
 * 循环音轨调度器（lookahead 模式）
 * ==========================================================*/
function scheduleStep(s, t) {
  const bar = (s / 16) | 0;   // 第几小节 0..3
  const pos = s % 16;         // 小节内 16 分位置
  const ch = CHORDS[bar];

  if (bar === 0 && pos === 0) crash(t);            // 循环开头镲片
  if (pos % 4 === 0) kick(t);                      // 四踩地板鼓
  if (pos === 4 || pos === 12) snare(t);           // 2、4 拍军鼓
  if (bar === 3 && pos === 14) snare(t, 0.3);      // 末尾加花
  hat(t, HAT_VEL[pos % 4], pos === 14 ? 0.12 : 0.04);
  if (pos % 4 === 2) stab(t, ch.notes);            // 反拍和弦刺
  if (pos % 2 === 0) bass(t, ch.bass, pos % 4 === 0 ? 0.4 : 0.26);
}

function scheduler() {
  const horizon = ctx.currentTime + INPUT_LOOKAHEAD;
  while (nextNoteTime < horizon) {
    scheduleStep(stepCount, nextNoteTime);
    nextNoteTime += S16;
    stepCount = (stepCount + 1) % 64;
  }
  scheduleQueuedInputs(ctx.currentTime + INPUT_QUEUE_LOOKAHEAD);
}

/* ============================================================
 * 点击量化：下一个 8 分节奏点
 * ==========================================================*/
function quantize(unit) {
  const now = ctx.currentTime;
  const k = Math.ceil((now + 0.02 - startTime) / unit);
  let t = startTime + k * unit;
  if (t < now) t += unit;
  return t;
}

function barkPlaybackRate(sample, pitchTier) {
  const sourceMidi = BARK_SOURCE_MIDI[sample];
  const targetMidi = BARK_TARGET_MIDI[sample]?.[pitchTier];
  if (!Number.isFinite(sourceMidi) || !Number.isFinite(targetMidi)) {
    throw new Error(`No fixed pitch target for ${sample}, tier ${pitchTier}`);
  }
  return Math.pow(2, (targetMidi - sourceMidi) / 12);
}

function safeStop(source, when = ctx.currentTime) {
  if (!source) return;
  try { source.stop(when); } catch (_) { /* 已经结束或尚未启动均可忽略 */ }
}

function cleanupVoice(voice) {
  if (!voice || voice.cleaned) return;
  voice.cleaned = true;
  clearTimeout(voice.cleanupTimer);
  liveVoices.delete(voice);

  if (activeSustainVoice === voice) activeSustainVoice = null;
  if (mouthVoice === voice) unlockMouth(voice, 0);

  for (const node of [
    voice.drySource, voice.dryGain,
    voice.loopSource, voice.loopGain,
    voice.tailSource, voice.tailGain,
  ]) {
    if (!node) continue;
    try { node.disconnect(); } catch (_) { /* 节点可能已断开 */ }
  }
}

function createTailSource(voice, boundary, sourceOffset) {
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = voice.sourceBuffer;
  source.playbackRate.setValueAtTime(voice.rate, boundary);
  gain.gain.setValueAtTime(1, boundary);
  source.connect(gain);
  gain.connect(sfxBus);
  source.start(boundary, sourceOffset);

  voice.tailSource = source;
  voice.tailGain = gain;
  voice.tailEndAt =
    boundary + (voice.sourceBuffer.duration - sourceOffset) / voice.rate;
  source.onended = () => cleanupVoice(voice);
}

function playPressVoice(name, rate, when) {
  const sourceBuffer = buffers[name];
  const sustain = sustainLoops[name];

  // da / gou 暂时只走原始一次性播放；延音参数仍完整保留，可随时重新开启。
  if (!sustain) {
    const source = ctx.createBufferSource();
    source.buffer = sourceBuffer;
    source.playbackRate.setValueAtTime(rate, when);
    source.connect(sfxBus);
    source.start(when);
    return null;
  }

  const handoffAt = when + sustain.tailOffset / rate;

  // 完整原音始终先启动；短按只需取消未来的静音事件即可保持原效果。
  const drySource = ctx.createBufferSource();
  const dryGain = ctx.createGain();
  drySource.buffer = sourceBuffer;
  drySource.playbackRate.setValueAtTime(rate, when);
  dryGain.gain.setValueAtTime(1, when);
  dryGain.gain.setValueAtTime(0, handoffAt);
  drySource.connect(dryGain);
  dryGain.connect(sfxBus);

  // 延音源从原音尾段起点开始，起音源在同一采样时刻静音。
  const loopSource = ctx.createBufferSource();
  const loopGain = ctx.createGain();
  loopSource.buffer = sustain.buffer;
  loopSource.loop = true;
  loopSource.playbackRate.setValueAtTime(rate, handoffAt);
  loopGain.gain.setValueAtTime(1, handoffAt);
  loopSource.connect(loopGain);
  loopGain.connect(sfxBus);

  const voice = {
    id: ++voiceSerial,
    name,
    rate,
    when,
    handoffAt,
    visualEndAt: when + 0.28,
    sourceBuffer,
    sustain,
    drySource,
    dryGain,
    loopSource,
    loopGain,
    tailSource: null,
    tailGain: null,
    tailEndAt: 0,
    rateTimeline: [{ time: handoffAt, rate }],
    held: true,
    claimed: false,
    released: false,
    stopped: false,
    cleaned: false,
    mode: 'pending',
    cleanupTimer: 0,
  };

  liveVoices.add(voice);
  drySource.onended = () => {
    if (voice.mode === 'short') cleanupVoice(voice);
  };

  drySource.start(when);
  loopSource.start(handoffAt, sustain.attackOffset);
  return voice;
}

function texturePositionAt(voice, now) {
  const start = voice.handoffAt;
  if (now <= start) return voice.sustain.attackOffset;

  let position = voice.sustain.attackOffset;
  let cursor = start;
  let rate = voice.rateTimeline[0].rate;
  for (let i = 1; i < voice.rateTimeline.length; i++) {
    const event = voice.rateTimeline[i];
    if (event.time >= now) break;
    position += (event.time - cursor) * rate;
    cursor = event.time;
    rate = event.rate;
  }
  return position + (now - cursor) * rate;
}

function textureRateAt(voice, now) {
  let rate = voice.rateTimeline[0].rate;
  for (let i = 1; i < voice.rateTimeline.length; i++) {
    const event = voice.rateTimeline[i];
    if (event.time > now) break;
    rate = event.rate;
  }
  return rate;
}

function isRetunableSustainVoice(voice) {
  return Boolean(
    voice &&
    voice.name === 'jiao' &&
    voice.mode === 'sustain' &&
    voice.held &&
    !voice.released &&
    !voice.stopped &&
    !voice.cleaned
  );
}

function retuneSustainVoice(voice, rate, when = ctx.currentTime) {
  if (!isRetunableSustainVoice(voice)) return false;

  const now = ctx.currentTime;
  const changeAt = Math.max(now, voice.handoffAt, when);
  const playbackRate = voice.loopSource.playbackRate;
  playbackRate.cancelScheduledValues(changeAt);
  playbackRate.setValueAtTime(rate, changeAt);

  // 记录精确的变速时间；队列预调度不会让音高提前改变，收尾也能正确积分纹理位置。
  voice.rateTimeline = voice.rateTimeline.filter(event => event.time < changeAt);
  voice.rateTimeline.push({ time: changeAt, rate });
  voice.rate = rate;
  return true;
}

function nextTextureRelease(voice, now) {
  const sustain = voice.sustain;
  const duration = sustain.buffer.duration;
  const absolutePosition = texturePositionAt(voice, now);
  const rate = textureRateAt(voice, now);
  const minimumPosition =
    absolutePosition + RELEASE_SCHEDULE_LEAD * rate;
  let best = null;

  for (const point of sustain.releasePoints) {
    const turns = Math.max(
      0,
      Math.ceil((minimumPosition - point.textureOffset) / duration - 1e-7)
    );
    const targetPosition = point.textureOffset + turns * duration;
    if (!best || targetPosition < best.targetPosition) {
      best = { ...point, targetPosition };
    }
  }

  if (!best) throw new Error('Sustain texture has no release point');
  return {
    boundary: now + (best.targetPosition - absolutePosition) / rate,
    sourceOffset: best.sourceOffset,
  };
}

function claimSustainVoice(voice) {
  if (!voice || !voice.held || voice.released || voice.claimed) return;

  const previous = activeSustainVoice;
  if (previous && previous !== voice) releaseVoice(previous, true);

  voice.claimed = true;
  voice.mode = 'sustain';
  activeSustainVoice = voice;
  lockMouth(voice);
}

function updateSustainClaims(audioNow) {
  const due = [];
  for (const voice of liveVoices) {
    if (
      voice.held &&
      !voice.released &&
      !voice.claimed &&
      audioNow + SUSTAIN_CLAIM_LEAD >= voice.handoffAt
    ) {
      due.push(voice);
    }
  }

  // 同一帧有多个候选时，最后触发的指针取得唯一长音。
  due.sort((a, b) => a.id - b.id);
  for (const voice of due) claimSustainVoice(voice);
}

function releaseVoice(voice, musical = true) {
  if (!voice || voice.released || voice.stopped || voice.cleaned) return;

  const now = ctx.currentTime;
  voice.held = false;
  voice.released = true;

  if (activeSustainVoice === voice) activeSustainVoice = null;

  if (!musical) {
    forceStopVoice(voice);
    return;
  }

  // 在自然接管点之前松手：让完整原音继续，短按路径与原版一致。
  if (now < voice.handoffAt) {
    voice.mode = 'short';
    voice.dryGain.gain.cancelScheduledValues(now);
    voice.dryGain.gain.setValueAtTime(1, now);
    safeStop(voice.loopSource, now);

    if (mouthVoice === voice) {
      const remainMs = Math.max(0, (voice.visualEndAt - now) * 1000);
      unlockMouth(voice, remainMs);
    }
    return;
  }

  voice.mode = 'tail';
  const releaseRate = textureRateAt(voice, now);
  voice.loopSource.playbackRate.cancelScheduledValues(now);
  voice.loopSource.playbackRate.setValueAtTime(releaseRate, now);
  voice.rateTimeline = voice.rateTimeline.filter(event => event.time <= now);
  voice.rate = releaseRate;
  const release = nextTextureRelease(voice, now);

  // 在最近的 WSOLA 淡化结束点接回与该帧对应的原音尾段。
  voice.loopGain.gain.setValueAtTime(0, release.boundary);
  safeStop(voice.loopSource, release.boundary + 0.01);
  createTailSource(voice, release.boundary, release.sourceOffset);

  const remainMs = Math.max(0, (voice.tailEndAt - now) * 1000);
  if (mouthVoice === voice) unlockMouth(voice, remainMs);
  else openMouth(remainMs);
}

function fadeGain(gainNode, now, stopAt) {
  if (!gainNode) return;
  const param = gainNode.gain;
  const value = Math.max(0, param.value);
  param.cancelScheduledValues(now);
  param.setValueAtTime(value, now);
  param.linearRampToValueAtTime(0, stopAt);
}

function forceStopVoice(voice) {
  if (!voice || voice.stopped || voice.cleaned) return;

  const now = ctx.currentTime;
  const stopAt = now + EMERGENCY_FADE;
  voice.held = false;
  voice.released = true;
  voice.stopped = true;
  voice.mode = 'stopped';

  if (activeSustainVoice === voice) activeSustainVoice = null;
  fadeGain(voice.dryGain, now, stopAt);
  fadeGain(voice.loopGain, now, stopAt);
  fadeGain(voice.tailGain, now, stopAt);
  safeStop(voice.drySource, stopAt);
  safeStop(voice.loopSource, stopAt);
  safeStop(voice.tailSource, stopAt);

  if (mouthVoice === voice) unlockMouth(voice, EMERGENCY_FADE * 1000);
  voice.cleanupTimer = setTimeout(
    () => cleanupVoice(voice),
    (EMERGENCY_FADE + 0.05) * 1000
  );
}

/* ============================================================
 * 分区（纯逻辑，无可见格子）
 * ==========================================================*/
function buildGrid() {
  const { width, height } = getStageMetrics();
  const landscape = width >= height;
  mobileTiled = !landscape && mobileMedia.matches;
  cols = landscape ? 4 : 3;
  rows = landscape ? 3 : 4;

  zones = [];
  if (mobileTiled) {
    // 手机竖屏：4 列 × 3 行单元（宽=屏宽，高=400px），自底边向上叠加多份。
    // 行 = 音节（大/狗/叫，自上而下），列 = 音高（左高右低）。
    cols = 4; rows = 3;
    const rowMap = [{ n: 'da', s: '大' }, { n: 'gou', s: '狗' }, { n: 'jiao', s: '叫' }];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        zones.push({ sample: rowMap[r].n, syllable: rowMap[r].s, pitchTier: c });
      }
    }
    return;
  }
  if (landscape) {
    // 横屏 3 行 4 列：竖列 = 音节，每列自上而下依次 大 / 狗 / 叫；横列 = 音高（左高右低）
    const rowMap = [{ n: 'da', s: '大' }, { n: 'gou', s: '狗' }, { n: 'jiao', s: '叫' }];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        zones.push({ sample: rowMap[r].n, syllable: rowMap[r].s, pitchTier: c });
      }
    }
  } else {
    // 竖屏 4 行 3 列：横排 = 音节，每行自左而右依次 大 / 狗 / 叫；纵排 = 音高（上高下低）
    const colMap = [{ n: 'da', s: '大' }, { n: 'gou', s: '狗' }, { n: 'jiao', s: '叫' }];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        zones.push({ sample: colMap[c].n, syllable: colMap[c].s, pitchTier: r });
      }
    }
  }
}

function zoneIndex(x, y) {
  const { width, height, left, top } = getStageMetrics();
  const localX = x - left;
  const localY = y - top;
  const c = Math.min(cols - 1, Math.max(0, Math.floor(localX / width * cols)));
  if (mobileTiled) {
    // 单元自底边向上叠加：以屏幕底边为锚，每 400px 一个完整 12 格单元。
    const unitH = MOBILE_UNIT_HEIGHT;
    const rowH = unitH / rows;
    const u = Math.floor((height - localY) / unitH);   // 自底边起第几个单元
    const unitTopY = height - (u + 1) * unitH;          // 该单元顶边 y
    let yFromTop = localY - unitTopY;                   // 单元内自顶向下
    if (yFromTop < 0) yFromTop = 0;
    const r = Math.min(rows - 1, Math.max(0, Math.floor(yFromTop / rowH)));
    return r * cols + c;
  }
  const r = Math.min(rows - 1, Math.max(0, Math.floor(localY / height * rows)));
  return r * cols + c;
}

/* 返回一条指针线段实际穿过的全部格子，避免快速移动时浏览器只上报首尾格。 */
function zonesAlongSegment(x0, y0, x1, y1) {
  const { width, height, left, top } = getStageMetrics();
  const dx = x1 - x0;
  const dy = y1 - y0;
  const times = [0, 1];

  if (Math.abs(dx) > 1e-7) {
    for (let c = 1; c < cols; c++) {
      const t = (left + width * c / cols - x0) / dx;
      if (t > 0 && t < 1) times.push(t);
    }
  }
  if (Math.abs(dy) > 1e-7) {
    if (mobileTiled) {
      // 单元自底边向上叠加：横线以 rowH 为间距、自底边向上排列
      const rowH = MOBILE_UNIT_HEIGHT / rows;
      const maxM = Math.floor(height / rowH);
      for (let m = 1; m <= maxM; m++) {
        const lineY = top + height - m * rowH;
        if (lineY <= top) break;
        const t = (lineY - y0) / dy;
        if (t > 0 && t < 1) times.push(t);
      }
    } else {
      for (let r = 1; r < rows; r++) {
        const t = (top + height * r / rows - y0) / dy;
        if (t > 0 && t < 1) times.push(t);
      }
    }
  }

  times.sort((a, b) => a - b);
  const uniqueTimes = times.filter(
    (t, i) => i === 0 || Math.abs(t - times[i - 1]) > 1e-7
  );
  const result = [];
  const appendAt = (t) => {
    const zi = zoneIndex(x0 + dx * t, y0 + dy * t);
    if (result[result.length - 1] !== zi) result.push(zi);
  };

  appendAt(0);
  for (let i = 1; i < uniqueTimes.length; i++) {
    appendAt((uniqueTimes[i - 1] + uniqueTimes[i]) / 2);
  }
  appendAt(1);
  return result;
}

/* ============================================================
 * 工具：随机数 / 缓动 / 颜色 / 路径
 * ==========================================================*/
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const smooth = t => t * t * (3 - 2 * t);
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeOutBack = t => { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
const easeOutElastic = t =>
  t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1;

function tracePoly(g, x, y, r, sides, rot) {
  g.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i * 2 * Math.PI) / sides;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

function traceStar(g, x, y, r, points, rot) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * 0.46 : r;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath();
}

/* 画一个小几何体（特效的基本粒子） */
function drawPiece(g, kind, color, x, y, r, rot) {
  if (r <= 0) return;
  g.save();
  g.translate(x, y);
  g.rotate(rot || 0);
  switch (kind) {
    case 'circle':
      g.fillStyle = color;
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
      break;
    case 'ring':
      g.strokeStyle = color;
      g.lineWidth = Math.max(2, r * 0.3);
      g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
      break;
    case 'square':
      g.fillStyle = color;
      g.fillRect(-r, -r, r * 2, r * 2);
      break;
    case 'triangle':
      g.fillStyle = color;
      tracePoly(g, 0, 0, r * 1.2, 3, -Math.PI / 2); g.fill();
      break;
    case 'diamond':
      g.fillStyle = color;
      tracePoly(g, 0, 0, r * 1.15, 4, 0); g.fill();
      break;
    case 'hexagon':
      g.fillStyle = color;
      tracePoly(g, 0, 0, r * 1.1, 6, 0); g.fill();
      break;
    case 'star':
      g.fillStyle = color;
      traceStar(g, 0, 0, r * 1.25, 5, -Math.PI / 2); g.fill();
      break;
    case 'cross': {
      g.fillStyle = color;
      const w = r * 0.62;
      g.fillRect(-r, -w / 2, r * 2, w);
      g.fillRect(-w / 2, -r, w, r * 2);
      break;
    }
  }
  g.restore();
}

/* ============================================================
 * 全屏特效引擎（仿 Mikutap）
 *  - 每次触发生成一个全屏特效实例，叠在旧特效之上
 *  - 旧特效播放退场动画后移除
 *  - 页面背景平滑过渡到新特效的落幕背景色
 * ==========================================================*/
const FX_IN = 0.55;    // 入场时长（秒）
const FX_OUT = 0.4;    // 退场时长（秒）

let fxW = 0, fxH = 0;  // 画布尺寸（CSS 像素）
let fxList = [];       // 活跃特效（数组顺序 = 叠放顺序）
let beatP = 0;         // 节拍脉冲 0..1（tick 每帧更新）

function nowSec() {
  return ctx && ctx.state === 'running'
    ? ctx.currentTime
    : performance.now() / 1000;
}
const prog = (t, delay, dur = FX_IN) => clamp01((t - delay) / dur);
const cx0 = () => fxW / 2, cy0 = () => fxH / 2;   // 网页容器正中心

function getStageMetrics() {
  const rect = stage.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || stage.clientWidth || 1),
    height: Math.max(1, rect.height || stage.clientHeight || 1),
    left: rect.left,
    top: rect.top,
  };
}

function fxResize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { width, height } = getStageMetrics();
  fxW = width;
  fxH = height;
  const sceneUnit = fxW >= fxH ? fxH / 2 : fxW / 1.5;
  stage.style.setProperty('--scene-unit', `${sceneUnit}px`);
  fxCanvas.width = Math.round(fxW * dpr);
  fxCanvas.height = Math.round(fxH * dpr);
  fxCanvas.style.width = fxW + 'px';
  fxCanvas.style.height = fxH + 'px';
  fx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 活跃特效重新对齐网页容器正中心
  for (const e of fxList) { e.cx = cx0(); e.cy = cy0(); }
}

/* ---------- 各特效的随机参数预生成（出生即定型，之后纯函数绘制） ----------
 * 中心化特效最大直径 ≈ 0.85~0.92 倍屏幕短边；
 * 零散小元件（纸屑 / 星星 / 几何雨）则随机散布全屏任意位置 */
const BUILD = {
  rings(inst, rng) {
    const minD = Math.min(fxW, fxH);
    for (let i = 0; i < 7; i++) inst.shapes.push({
      delay: i * 0.05,
      rEnd: minD * (0.13 + rng() * 0.29),   // 最大直径 ≈ 0.84 短边
      w: 5 + rng() * 9,
      color: pickColor(rng),
    });
    inst.dotR = minD * 0.07;
  },
  poly(inst, rng) {
    const sides = 3 + (rng() * 5 | 0);
    const minD = Math.min(fxW, fxH);
    [[0.46, C.amber, 0], [0.3, C.gray, 0.09], [0.17, C.amber, 0.18]].forEach(([s, color, d], i) =>
      inst.shapes.push({
        sides, delay: d, color,
        rEnd: minD * s,                       // 最大直径 ≈ 0.92 短边
        w: minD * (0.034 - i * 0.007),
      }));
  },
  spiral(inst, rng) {
    const minD = Math.min(fxW, fxH);
    for (let i = 0; i < 36; i++) inst.shapes.push({
      ang: i * 0.55,
      rad: 6 + i * minD * 0.0125,             // 最大直径 ≈ 0.88 短边
      size: minD * (0.009 + i * 0.0008),
      delay: i * 0.018,
      color: pickColor(rng),
    });
  },
  rays(inst, rng) {
    const minD = Math.min(fxW, fxH);
    const n = 13 + (rng() * 4 | 0);
    inst.r0 = minD * 0.06;
    for (let i = 0; i < n; i++) inst.shapes.push({
      ang: (i / n) * 2 * Math.PI + rng() * 0.15,
      w: 0.09 + rng() * 0.13,
      len: minD * (0.36 + rng() * 0.1),       // 最大直径 ≈ 0.92 短边
      delay: rng() * 0.12,
      color: rng() < 0.12 ? ACCENTS[(rng() * 3) | 0] : (i % 2 ? C.gray : C.amber),
    });
  },
  confetti(inst, rng) {
    const maxD = Math.hypot(fxW, fxH);
    const minD = Math.min(fxW, fxH);
    const kinds = ['square', 'circle', 'triangle', 'diamond'];
    for (let i = 0; i < 30; i++) inst.shapes.push({
      ang: rng() * 2 * Math.PI,
      dist: maxD * (0.12 + rng() * 0.46),
      size: minD * (0.026 + rng() * 0.05),
      spin: inst.dir * (1 + rng() * 2) * 2.2,
      delay: rng() * 0.18,
      kind: kinds[(rng() * 4) | 0],
      color: pickColor(rng),
    });
  },
  zigzag(inst, rng) {
    const minD = Math.min(fxW, fxH);
    const horiz = rng() < 0.5;
    const n = 5 + (rng() * 3 | 0);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      if (horiz) pts.push({
        x: -fxW * 0.08 + f * fxW * 1.16,
        y: fxH * (i % 2 ? 0.72 + rng() * 0.14 : 0.14 + rng() * 0.14),
      });
      else pts.push({
        x: fxW * (i % 2 ? 0.7 + rng() * 0.16 : 0.14 + rng() * 0.16),
        y: -fxH * 0.08 + f * fxH * 1.16,
      });
    }
    const lens = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      lens.push(l); total += l;
    }
    inst.shapes.push({ pts, lens, total, w: minD * (0.026 + rng() * 0.024), color: C.amber });
  },
  pop(inst, rng) {
    const minD = Math.min(fxW, fxH);
    const kinds = ['circle', 'square', 'ring', 'triangle', 'hexagon'];
    for (let i = 0; i < 16; i++) inst.shapes.push({
      x: fxW * (0.06 + rng() * 0.88),
      y: fxH * (0.06 + rng() * 0.88),
      size: minD * (0.036 + rng() * 0.06),
      delay: rng() * 0.28,
      rot: rng() * Math.PI,
      kind: kinds[(rng() * kinds.length) | 0],
      color: pickColor(rng),
    });
  },
  cross(inst, rng) {
    const minD = Math.min(fxW, fxH);
    const size = minD * (0.6 + rng() * 0.25);   // 臂长 0.6~0.85 短边
    inst.shapes.push({
      size,
      w: size * (0.14 + rng() * 0.08),
      color: rng() < 0.2 ? ACCENTS[(rng() * 3) | 0] : C.amber,
    });
  },
  orbit(inst, rng) {
    const minD = Math.min(fxW, fxH);
    const kinds = ['circle', 'square', 'triangle', 'ring'];
    const n = 10;
    for (let i = 0; i < n; i++) inst.shapes.push({
      ang0: (i / n) * 2 * Math.PI,
      rad: minD * (0.18 + rng() * 0.24),        // 轨道直径 ≤ 0.84 短边
      speed: inst.dir * (0.45 + rng() * 0.5),
      size: minD * (0.026 + rng() * 0.032),
      delay: rng() * 0.15,
      kind: kinds[i % 4],
      color: pickColor(rng),
    });
    inst.coreR = minD * 0.055;
  },
  wave(inst, rng) {
    const minD = Math.min(fxW, fxH);
    for (let i = 0; i < 4; i++) inst.shapes.push({
      y0: fxH * (0.14 + i * 0.24) + (rng() - 0.5) * fxH * 0.08,
      amp: minD * (0.03 + rng() * 0.05),
      wl: fxW * (0.45 + rng() * 0.4),
      speed: inst.dir * (1 + rng() * 1.2),
      th: minD * (0.07 + rng() * 0.06),
      side: i % 2 ? 1 : -1,
      delay: i * 0.08,
      color: rng() < 0.12 ? ACCENTS[(rng() * 3) | 0] : (i % 2 ? C.gray : C.amber),
    });
  },
  stars(inst, rng) {
    const minD = Math.min(fxW, fxH);
    for (let i = 0; i < 12; i++) inst.shapes.push({
      x: fxW * (0.07 + rng() * 0.86),
      y: fxH * (0.07 + rng() * 0.86),
      r: minD * (0.034 + rng() * 0.055),
      delay: rng() * 0.25,
      rot: rng() * Math.PI,
      color: pickColor(rng),
    });
  },
  grid(inst, rng) {
    const minD = Math.min(fxW, fxH);
    const n = 11;
    const radius = minD * (0.4 + rng() * 0.04);   // 直径 0.8~0.88 短边
    const lines = [];
    for (let i = 0; i < n; i++) lines.push({
      y: (i - (n - 1) / 2) * (radius * 2 / n),
      w: 4.5 + ((i * 7) % 3) * 4,
      delay: i * 0.045,
      color: i % 2 ? C.gray : C.amber,
    });
    inst.shapes.push({ radius, lines });
  },
};

/* ---------- 各特效的绘制（t = 出生至今秒数，fade = 退场透明度） ----------
 * beatP 为节拍脉冲：所有特效随节拍轻微缩放 / 增粗（颜色固定不随节拍变化） */
const DRAW = {
  /* 同心环爆发：圆环扩张后呼吸胀缩，随节拍增粗（律动只做运动，不变色） */
  rings(g, inst, t, fade) {
    const minD = Math.min(fxW, fxH);
    inst.shapes.forEach((s, i) => {
      const k = easeOutCubic(prog(t, s.delay));
      if (k <= 0) return;
      const r = k * s.rEnd * (1 + 0.04 * Math.sin(t * 1.4 + i)) + beatP * minD * 0.012;
      g.globalAlpha = (1 - k * 0.5) * fade;
      g.strokeStyle = s.color;
      g.lineWidth = s.w * (1 + beatP * 0.5);
      g.beginPath(); g.arc(inst.cx, inst.cy, r, 0, 7); g.stroke();
    });
    const dk = easeOutBack(prog(t, 0));
    if (dk > 0) {
      g.globalAlpha = fade;
      g.fillStyle = C.amber;
      g.beginPath(); g.arc(inst.cx, inst.cy, inst.dotR * dk * (1 + beatP * 0.2), 0, 7); g.fill();
    }
  },

  /* 多边形绽放：三层多边形描边放大并旋转，随节拍胀缩 */
  poly(g, inst, t, fade) {
    const minD = Math.min(fxW, fxH);
    inst.shapes.forEach((s, i) => {
      const k = easeOutCubic(prog(t, s.delay));
      if (k <= 0) return;
      const r = k * s.rEnd * (1 + beatP * 0.035 + 0.03 * Math.sin(t * 1.1 + i * 1.9));
      const rot = inst.rot0 + inst.dir * (1 - k) * 1.3 + t * 0.18 * inst.dir;
      g.globalAlpha = (1 - k * 0.3) * fade;
      g.strokeStyle = s.color;
      g.lineWidth = s.w * (1 + beatP * 0.4) + beatP * minD * 0.0015;
      tracePoly(g, inst.cx, inst.cy, r, s.sides, rot);
      g.stroke();
    });
  },

  /* 螺旋弹珠：圆点沿螺旋线依次弹出，整体旋转，随节拍跳动 */
  spiral(g, inst, t, fade) {
    const rot = inst.rot0 + t * 0.45 * inst.dir + beatP * 0.05 * inst.dir;
    inst.shapes.forEach((s, i) => {
      const k = easeOutBack(prog(t, s.delay));
      if (k <= 0) return;
      const a = s.ang + rot;
      const r = s.rad * k * (1 + beatP * 0.04) + Math.sin(t * 1.5 + i * 0.5) * 4;
      const x = inst.cx + Math.cos(a) * r;
      const y = inst.cy + Math.sin(a) * r;
      const sz = s.size * k * (1 + beatP * 0.25);
      g.globalAlpha = fade;
      drawPiece(g, i % 6 === 5 ? 'square' : 'circle', s.color, x, y, sz, a);
    });
  },

  /* 放射光芒：楔形光刃旋出，缓慢自转，随节拍伸长 */
  rays(g, inst, t, fade) {
    for (const s of inst.shapes) {
      const k = easeOutCubic(prog(t, s.delay, 0.5));
      if (k <= 0) continue;
      const rot = inst.rot0 + inst.dir * (1 - k) * 0.8 + t * 0.14 * inst.dir;
      const len = s.len * k * (1 + beatP * 0.09);
      const a = s.ang + rot;
      g.globalAlpha = 0.88 * fade;
      g.fillStyle = s.color;
      g.beginPath();
      g.moveTo(inst.cx, inst.cy);
      g.arc(inst.cx, inst.cy, inst.r0 + len, a - s.w, a + s.w);
      g.closePath(); g.fill();
    }
  },

  /* 几何纸屑：小几何体从中心炸开，漂浮 + 随节拍颠簸 */
  confetti(g, inst, t, fade) {
    inst.shapes.forEach((s, i) => {
      const k = easeOutBack(prog(t, s.delay));
      if (k <= 0) return;
      const x = inst.cx + Math.cos(s.ang) * s.dist * k * (1 + beatP * 0.025);
      const y = inst.cy + Math.sin(s.ang) * s.dist * k * (1 + beatP * 0.025)
        + Math.sin(t * 2.2 + i * 1.3) * 6;
      const sz = s.size * k * (1 + beatP * 0.18);
      const rot = s.spin * k + t * 0.6 * inst.dir;
      g.globalAlpha = fade;
      drawPiece(g, s.kind, s.color, x, y, sz, rot);
    });
  },

  /* 折线穿越：粗折线横扫全屏（带灰色重影），端点圆点随节拍猛跳 */
  zigzag(g, inst, t, fade) {
    const s = inst.shapes[0];
    const k = easeOutCubic(prog(t, 0, 0.6));
    if (k <= 0) return;
    g.save();
    g.translate(0, Math.sin(t * 1.6) * 7);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // 灰色重影
    g.save();
    g.translate(0, s.w * 2.1);
    g.globalAlpha = 0.4 * fade;
    g.strokeStyle = C.gray;
    g.lineWidth = s.w * (1 + beatP * 0.2);
    strokePartial(g, s.pts, s.lens, k * s.total);
    g.stroke();
    g.restore();
    // 主折线
    g.globalAlpha = fade;
    g.strokeStyle = s.color;
    g.lineWidth = s.w * (1 + beatP * 0.3);
    const tip = strokePartial(g, s.pts, s.lens, k * s.total);
    g.stroke();
    g.fillStyle = C.gray;
    g.beginPath(); g.arc(tip.x, tip.y, s.w * (1.1 + beatP * 0.45), 0, 7); g.fill();
    g.restore();
  },

  /* 弹性几何雨：几何体在随机位置 Q 弹冒出，浮动 + 随节拍缩放 */
  pop(g, inst, t, fade) {
    inst.shapes.forEach((s, i) => {
      const k = easeOutBack(prog(t, s.delay));
      if (k <= 0) return;
      const y = s.y + Math.sin(t * 2 + i * 1.7) * 7;
      const sz = s.size * k * (1 + beatP * 0.2);
      g.globalAlpha = 0.96 * fade;
      drawPiece(g, s.kind, s.color, s.x, y, sz, s.rot + t * 0.4 * inst.dir + beatP * 0.08 * inst.dir);
    });
  },

  /* 巨大十字：横竖两臂依次弹出并旋转定格，随节拍轻微胀缩 */
  cross(g, inst, t, fade) {
    const s = inst.shapes[0];
    const k1 = easeOutBack(prog(t, 0));
    const k2 = easeOutBack(prog(t, 0.13));
    if (k1 <= 0) return;
    g.save();
    g.translate(inst.cx, inst.cy);
    g.rotate(inst.rot0 + inst.dir * (1 - k1) * 1.6 + Math.sin(t * 1.3) * 0.07 + beatP * 0.02 * inst.dir);
    const pulse = 1 + beatP * 0.12;
    g.scale(pulse, pulse);
    const L = s.size / 2, w = s.w / 2;
    g.globalAlpha = fade;
    g.fillStyle = s.color;
    g.fillRect(-L * k1, -w, L * 2 * k1, w * 2);
    if (k2 > 0) g.fillRect(-w, -L * k2, w * 2, L * 2 * k2);
    g.globalAlpha = 0.6 * fade;
    g.strokeStyle = C.gray;
    g.lineWidth = Math.max(2, s.w * 0.28);
    g.beginPath(); g.arc(0, 0, s.size * 0.68 * k1 * (1 + beatP * 0.08), 0, 7); g.stroke();
    g.restore();
  },

  /* 环绕轨道：几何体沿轨道持续环绕中心公转，轨道随节拍收缩膨胀 */
  orbit(g, inst, t, fade) {
    inst.shapes.forEach(s => {
      const k = easeOutCubic(prog(t, s.delay));
      if (k <= 0) return;
      const a = s.ang0 + t * s.speed + inst.dir * (1 - k) * 1.8;
      const R = s.rad * k * (1 + beatP * 0.09);
      const x = inst.cx + Math.cos(a) * R;
      const y = inst.cy + Math.sin(a) * R;
      g.globalAlpha = fade;
      drawPiece(g, s.kind, s.color, x, y, s.size * (0.6 + 0.4 * k) * (1 + beatP * 0.15), t * 1.2 * inst.dir);
    });
    const ck = easeOutBack(prog(t, 0));
    if (ck > 0) {
      g.globalAlpha = fade;
      drawPiece(g, 'circle', C.amber, inst.cx, inst.cy,
        inst.coreR * ck * (1 + beatP * 0.2), 0);
    }
  },

  /* 波浪丝带：四条波浪带交替滑入，持续起伏，振幅随节拍加大 */
  wave(g, inst, t, fade) {
    const step = Math.max(14, fxW / 28);
    for (const s of inst.shapes) {
      const k = easeOutCubic(prog(t, s.delay, 0.6));
      if (k <= 0) continue;
      const off = (1 - k) * (fxW + 120) * s.side;
      const amp = s.amp * (0.6 + 0.4 * k) * (1 + beatP * 0.3);
      g.globalAlpha = 0.9 * fade;
      g.fillStyle = s.color;
      g.beginPath();
      for (let x = -60; x <= fxW + 60; x += step) {
        const y = s.y0 + Math.sin((x / s.wl) * Math.PI * 2 + t * s.speed) * amp;
        x === -60 ? g.moveTo(x + off, y) : g.lineTo(x + off, y);
      }
      for (let x = fxW + 60; x >= -60; x -= step) {
        const y = s.y0 + s.th * (1 + beatP * 0.12)
          + Math.sin((x / s.wl) * Math.PI * 2 + t * s.speed + 0.9) * amp;
        g.lineTo(x + off, y);
      }
      g.closePath(); g.fill();
    }
  },

  /* 星星弹跳：星星弹性冒出并闪烁自转，随节拍闪烁加剧 */
  stars(g, inst, t, fade) {
    inst.shapes.forEach((s, i) => {
      const k = easeOutElastic(prog(t, s.delay));
      if (k <= 0) return;
      const tw = 1 + 0.15 * Math.sin(t * 3.2 + i * 2.1) + beatP * 0.18;
      g.globalAlpha = 0.97 * fade;
      drawPiece(g, 'star', s.color, s.x, s.y, s.r * k * tw, s.rot + t * 0.7 * inst.dir);
    });
  },

  /* 旋转线栅：圆形视窗内平行线逐条展开，整体旋转，随节拍胀缩增粗 */
  grid(g, inst, t, fade) {
    const s = inst.shapes[0];
    const R = s.radius * (1 + beatP * 0.06 + 0.03 * Math.sin(t * 1.3));
    g.save();
    g.translate(inst.cx, inst.cy);
    g.rotate(inst.rot0 + t * 0.22 * inst.dir + beatP * 0.025 * inst.dir);
    g.beginPath(); g.arc(0, 0, R, 0, 7); g.clip();
    for (const ln of s.lines) {
      const k = easeOutCubic(prog(t, ln.delay));
      if (k <= 0) continue;
      g.globalAlpha = 0.92 * fade;
      g.strokeStyle = ln.color;
      g.lineWidth = ln.w * (1 + beatP * 0.35);
      g.beginPath();
      g.moveTo(-R * k, ln.y);
      g.lineTo(R * k, ln.y);
      g.stroke();
    }
    g.restore();
    const ok = easeOutBack(prog(t, 0));
    if (ok > 0) {
      g.globalAlpha = fade;
      g.strokeStyle = C.amber;
      g.lineWidth = 6 * (1 + beatP * 0.35);
      g.beginPath(); g.arc(inst.cx, inst.cy, R * ok, 0, 7); g.stroke();
    }
  },
};

/* 折线按可见长度部分描边，返回当前端点 */
function strokePartial(g, pts, lens, vis) {
  g.beginPath();
  g.moveTo(pts[0].x, pts[0].y);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = lens[i - 1];
    if (acc + seg <= vis) {
      g.lineTo(pts[i].x, pts[i].y);
      acc += seg;
    } else {
      const f = seg > 0 ? (vis - acc) / seg : 0;
      const tx = pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f;
      const ty = pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f;
      g.lineTo(tx, ty);
      return { x: tx, y: ty };
    }
  }
  return pts[pts.length - 1];
}

/* 生成一个全屏特效实例（原点固定在屏幕正中心） */
function buildEffect(type) {
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const inst = {
    type,
    cx: cx0(), cy: cy0(),
    t0: 0, state: 'in', outT0: 0,
    rot0: rng() * Math.PI * 2,
    dir: rng() < 0.5 ? -1 : 1,
    shapes: [],
  };
  BUILD[type](inst, rng);
  return inst;
}

/* 触发全屏特效：新特效叠上，旧特效退场 */
function spawnEffect(zi, when) {
  const type = EFFECTS[zi % EFFECTS.length];
  const now = nowSec();

  for (const e of fxList) {
    if (e.state !== 'out') { e.state = 'out'; e.outT0 = now; }
  }
  while (fxList.length > 6) fxList.shift();   // 快速连打时兜底清理

  const inst = buildEffect(type);
  inst.t0 = Math.min(when, now + 0.05);       // 尽量贴节拍，最多延迟 50ms
  fxList.push(inst);
}

/* 每帧绘制：固定米白背景 → 各特效（按叠放顺序） */
function fxFrame(now) {
  fx2d.clearRect(0, 0, fxW, fxH);

  for (let i = fxList.length - 1; i >= 0; i--) {
    const inst = fxList[i];
    let outK = 0;
    if (inst.state === 'out') {
      outK = clamp01((now - inst.outT0) / FX_OUT);
      if (outK >= 1) { fxList.splice(i, 1); continue; }   // 退场完毕，移除
    }
    const t = now - inst.t0;
    if (t < 0) continue;                                  // 等待节拍点

    // 常驻特效整体随节拍呼吸；退场特效整体淡出 + 缩小
    const fade = 1 - smooth(outK);
    const sc = inst.state === 'out' ? 1 - 0.22 * outK : 1 + beatP * 0.02;
    fx2d.save();
    fx2d.translate(inst.cx, inst.cy);
    fx2d.scale(sc, sc);
    fx2d.translate(-inst.cx, -inst.cy);
    DRAW[inst.type](fx2d, inst, t, fade);
    fx2d.restore();
  }
}

/* ---------- 张嘴 / 闭嘴（JS 弹簧驱动，快速果断带 Q 弹） ---------- */
function openMouth(holdMs) {
  mouthPopped = true;
  dogInner.classList.toggle('bark-image', !sfxMuted);
  clearTimeout(mouthTimer);
  mouthTimer = setTimeout(() => {
    if (!mouthVoice) {
      mouthPopped = false;
      dogInner.classList.remove('bark-image');
    }
  }, holdMs);
}

function lockMouth(voice) {
  mouthVoice = voice;
  clearTimeout(mouthTimer);
  mouthPopped = true;
  dogInner.classList.toggle('bark-image', !sfxMuted);
  holding = true;   // 开始长按果冻动画（变大 / 变红 / 高频抖动）
}

function unlockMouth(voice, holdMs) {
  if (mouthVoice !== voice) return;
  mouthVoice = null;
  holding = false;  // 松手：果冻动画 Q 弹回落
  openMouth(holdMs);
}

/* ============================================================
 * 激活分区（点击或拖动经过）
 * ==========================================================*/
/* 分区按钮闪光：被激活的分区短暂显示半透明白色再淡出 */
function flashZone(zi) {
  const r = (zi / cols) | 0, c = zi % cols;
  const el = document.createElement('div');
  el.className = 'zone-flash';
  el.style.left   = `calc(${c * 100 / cols}% + 3px)`;
  el.style.top    = `calc(${r * 100 / rows}% + 3px)`;
  el.style.width  = `calc(${100 / cols}% - 6px)`;
  el.style.height = `calc(${100 / rows}% - 6px)`;
  el.addEventListener('animationend', () => el.remove());
  flashLayer.appendChild(el);
}

/* 点击弹出的字样：一半宣泄不满（…滚开），一半期待美好（…来 / 吉祥话）。
   每次点击随机抽取，且与上一次不同。 */
const CLICK_PHRASES = [
  // —— 宣泄：把讨厌的统统赶走 ——
  '加班滚开', '霉运滚开', '烦恼滚开', '焦虑滚开', '内卷滚开',
  'PUA 滚开', '老板滚开', '改需求滚开', '996 滚开', '脱发滚开',
  '失眠滚开', '负能量滚开', '房贷滚开', '拖延滚开', '摆烂滚开',
  'KPI 滚开', '周报滚开', '压力滚开', '孤单滚开', 'emo 滚开',
  '穷鬼滚开', '烂桃花滚开', '倒霉滚开', '起床气滚开', '周一滚开',
  '社恐滚开', '容貌焦虑滚开', '甲方滚开', 'bug 滚开', '内耗滚开',
  '开会滚开', '复盘滚开', '对齐滚开', '赋能滚开', '闭环滚开',
  '通勤滚开', '挤地铁滚开', '堵车滚开', '闹钟滚开', '早起滚开',
  '熬夜滚开', '通宵滚开', '改稿滚开', '返工滚开', '扣钱滚开',
  '画大饼滚开', '甩锅滚开', '抢功劳滚开', '已读不回滚开', '工作群滚开',
  '催婚滚开', '催生滚开', '攀比滚开', '凡尔赛滚开', '杠精滚开',
  '喷子滚开', '绿茶滚开', '海王滚开', '渣男滚开', '渣女滚开',
  '前任滚开', '遗憾滚开', '自我怀疑滚开', '拖延症滚开', '懒癌滚开',
  '社死滚开', '尴尬滚开', '紧张滚开', '怯场滚开', '黑眼圈滚开',
  '颈椎病滚开', '久坐滚开', '痛经滚开', '头痛滚开', '牙痛滚开',
  '蚊子滚开', '雾霾滚开', '寒冬滚开', '雨天滚开', '长胖滚开',
  '痘痘滚开', '过敏滚开', '晕车滚开', '套路滚开', '诈骗滚开',
  '推销滚开', '砍一刀滚开', '空头支票滚开', '职场算计滚开', '小人滚开',
  // —— 期待：把好运统统招来 ——
  '好运来', '财来', '桃花来', '福气来', '喜事来',
  '暴富来', '升职来', '加薪来', '奖金来', '恋爱来',
  '好心情来', '自由来', '假期来', '锦鲤来', 'offer 来',
  '好运爆棚', '招财进宝', '万事如意', '心想事成', '步步高升',
  '逢考必过', '财源滚滚', '笑口常开', '平安喜乐', '大吉大利',
  '一夜暴富', '十连出金', '欧气满满', '烦恼清零', '诸事顺遂',
  '好运到', '财运到', '福星到', '贵人到', '姻缘来',
  '正缘来', '表白成功', '暗恋成真', '脱单来', '全家健康',
  '父母长寿', '阖家欢乐', '贵人相助', '逢凶化吉', '吉星高照',
  '福禄双全', '五福临门', '招财猫来', '数钱手软', '工资翻倍',
  '年终奖来', '股票涨停', '一夜暴瘦', '马甲线来', '体检全绿',
  '睡个好觉', '好梦来', '元气满满', '小确幸来', '治愈来',
  '温柔来', '浪漫来', '仪式感来', '说走就走', '环球旅行',
  '海岛度假', '日出来', '星空来', '极光来', '流星来',
  '彩虹来', '好天气来', '樱花来', '雪花来', '新年来',
  '财务自由', '提前退休', '躺平自由', '松弛感来', '多巴胺来',
  '内啡肽来', '幸福爆棚', '快乐加倍', '春风得意', '鹏程万里',
  '前途无量', '光明未来', '逆风翻盘', 'C 位出道', '高光时刻',
  '稳拿第一', '金榜题名', '学业有成', '论文过稿', '课题中标',
  '成果来', '烟火气来', '笑容满面', '烦恼全消', '好事发生',
  '万事胜意', '长乐长安', '岁岁平安', '福气满满', '财气冲天',
  '鸿运当头', '紫气东来', '飞黄腾达', '平步青云', '前程似锦',
  '大展宏图', '财通四海', '日进斗金', '和气生财', '龙腾虎跃',
];
let lastClickPhraseIndex = -1;
function pickClickPhrase() {
  if (CLICK_PHRASES.length < 2) return CLICK_PHRASES[0];
  let i = lastClickPhraseIndex;
  while (i === lastClickPhraseIndex) {
    i = (Math.random() * CLICK_PHRASES.length) | 0;
  }
  lastClickPhraseIndex = i;
  return CLICK_PHRASES[i];
}

function spawnClaudeText(clientX, clientY) {
  if (latestClaudeText) latestClaudeText.style.transform = '';

  const stageRect = stage.getBoundingClientRect();
  const textEl = document.createElement('div');
  const floatEl = document.createElement('span');
  const copyEl = document.createElement('span');
  textEl.className = 'click-claude';
  floatEl.className = 'click-claude-float';
  copyEl.className = 'click-claude-copy';
  copyEl.textContent = pickClickPhrase();
  textEl.style.left = `${clientX - stageRect.left}px`;
  textEl.style.top = `${clientY - stageRect.top}px`;

  floatEl.appendChild(copyEl);
  textEl.appendChild(floatEl);
  clickTextLayer.appendChild(textEl);
  latestClaudeText = copyEl;
  latestClaudeTextBornAt = nowSec();

  textEl.addEventListener('animationend', (event) => {
    if (event.animationName !== 'claudeTextFade') return;
    if (latestClaudeText === copyEl) latestClaudeText = null;
    textEl.remove();
  });
}

function reflowQueuedInputTimes() {
  let when = quantize(S8);
  if (Number.isFinite(lastCommittedInputTime)) {
    when = Math.max(when, lastCommittedInputTime + S8);
  }
  for (const entry of inputQueue) {
    entry.when = when;
    when += S8;
  }
}

function removeQueuedSample(sample) {
  for (let i = inputQueue.length - 1; i >= 0; i--) {
    const entry = inputQueue[i];
    if (entry.sample !== sample) continue;

    inputQueue.splice(i, 1);
    const state = pointers.get(entry.pointerId);
    if (state && state.pendingEntryId === entry.id) {
      state.pendingEntryId = null;
    }
  }
}

function enqueueActivation(zi, pointerId) {
  hideControlsUntilIdle();
  addEnergy();
  const z = zones[zi];
  removeQueuedSample(z.sample);
  const entry = {
    id: ++inputSerial,
    kind: 'press',
    pointerId,
    zone: zi,
    sample: z.sample,
    pitchTier: z.pitchTier,
    when: 0,
  };
  inputQueue.push(entry);
  reflowQueuedInputTimes();
  flashZone(zi);
  if (!ctx || ctx.state !== 'running') {
    // 手势内立刻解锁；若仍未 running，先给视觉反馈，解锁成功后由调度器补播队列
    unlockAudio();
    entry.visualFallback = true;
    openMouth(280);
    barkPopVel = Math.min(barkPopVel + BARK_KICK, BARK_KICK_MAX);
    spawnEffect(zi, nowSec());
  }
  return entry;
}

function enqueueSustainRetune(zi, pointerId, voice) {
  hideControlsUntilIdle();
  const z = zones[zi];
  removeQueuedSample(z.sample);
  const entry = {
    id: ++inputSerial,
    kind: 'sustain-retune',
    pointerId,
    zone: zi,
    sample: z.sample,
    pitchTier: z.pitchTier,
    voice,
    when: 0,
  };
  inputQueue.push(entry);
  reflowQueuedInputTimes();
  flashZone(zi);
  return entry;
}

function scheduleActivationVisual(zi, when) {
  const waitMs = Math.max(0, (when - ctx.currentTime) * 1000);
  const timer = setTimeout(() => {
    inputVisualTimers.delete(timer);
    openMouth(280);
    barkPopVel = Math.min(barkPopVel + BARK_KICK, BARK_KICK_MAX);
    spawnEffect(zi, ctx.currentTime);
  }, waitMs);
  inputVisualTimers.add(timer);
}

function playQueuedInput(entry) {
  const rate = barkPlaybackRate(entry.sample, entry.pitchTier);
  if (entry.kind === 'sustain-retune') {
    if (retuneSustainVoice(entry.voice, rate, entry.when)) {
      scheduleActivationVisual(entry.zone, entry.when);
    }
    return;
  }

  const state = pointers.get(entry.pointerId);
  const stillHeld =
    state &&
    state.zone === entry.zone &&
    state.pendingEntryId === entry.id;
  const voice = playPressVoice(entry.sample, rate, entry.when);

  if (stillHeld) {
    state.pendingEntryId = null;
    state.voice = voice;
  } else if (voice) {
    // 已滑过或已松手的 jiao 只保留短音，不进入未来的长音循环。
    releaseVoice(voice, true);
  }
  if (!entry.visualFallback) scheduleActivationVisual(entry.zone, entry.when);
}

function scheduleQueuedInputs(horizon) {
  while (inputQueue.length && inputQueue[0].when < horizon) {
    const entry = inputQueue.shift();
    lastCommittedInputTime = entry.when;
    playQueuedInput(entry);
  }
}

function cancelQueuedInputs(pointerId) {
  for (let i = inputQueue.length - 1; i >= 0; i--) {
    if (inputQueue[i].pointerId === pointerId) inputQueue.splice(i, 1);
  }
  reflowQueuedInputTimes();
}

function clearInputVisualTimers() {
  for (const timer of inputVisualTimers) clearTimeout(timer);
  inputVisualTimers.clear();
}

/* ============================================================
 * 节拍动画循环：摩卡律动（压缩 + 晃动）+ 长按果冻动画 + 全屏特效
 * ==========================================================*/
/* ============================================================
 * 尾巴卷度 & 闲置分享弹层
 * ==========================================================*/

// 标记一次有效交互，重置闲置计时；若分享弹层开着则顺手关掉。
function markActivity() {
  lastActivityAt = nowSec();
  if (shareOpen) closeShare();
}

// 每次点击随机累加 1..5 点尾巴卷度，刷新 HUD 并飘出一个 +N。
function addEnergy() {
  const gain = 1 + ((Math.random() * 5) | 0);   // 1..5 整数
  energyValue += gain;
  if (energyNum) energyNum.textContent = String(energyValue);
  // HUD 节拍式弹一下
  if (energyHud) {
    energyHud.style.setProperty('--energy-scale', '1.14');
    setTimeout(() => energyHud.style.setProperty('--energy-scale', '1'), 90);
    const pop = document.createElement('span');
    pop.className = 'energy-pop';
    pop.textContent = `+${gain}`;
    energyHud.appendChild(pop);
    pop.addEventListener('animationend', () => pop.remove(), { once: true });
  }
}

// 截取当前游戏画面为离屏 canvas：特效 + 摩卡 + 点击飘字。
// 不含尾巴卷度 HUD（避免与卡片前景的尾巴卷度重复）。data-URL 摩卡图 + canvas→canvas 特效层均不污染画布。
function captureSceneCanvas() {
  const W = Math.max(1, Math.round(stage.clientWidth));
  const H = Math.max(1, Math.round(stage.clientHeight));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const rect = stage.getBoundingClientRect();
  const ox = rect.left, oy = rect.top;

  // 1) 米白背景
  g.fillStyle = '#fff2dc';
  g.fillRect(0, 0, W, H);

  // 2) 特效层（铺满）
  try { g.drawImage(fxCanvas, 0, 0, W, H); } catch (e) { /* 忽略 */ }

  // 3) 摩卡：按当前张嘴/闭嘴状态选图，并套用屏幕上同样的滤镜（长按变红等），
  //    位置/缩放取 dogJelly 当前的渲染盒，尽量还原画面上的真实状态。
  const mouthOpen = dogInner.classList.contains('bark-image') &&
    dogShareImgOpen && dogShareImgOpen.complete && dogShareImgOpen.naturalWidth > 0;
  const dogImg = mouthOpen ? dogShareImgOpen : dogShareImg;
  if (dogImg && dogImg.complete && dogImg.naturalWidth > 0) {
    const r = dogJelly.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const flt = getComputedStyle(dogJelly).filter;   // 例：hue-rotate(-28deg) saturate(1.47) brightness(1.03)
      g.save();
      if (flt && flt !== 'none') g.filter = flt;
      g.drawImage(dogImg, r.left - ox, r.top - oy, r.width, r.height);
      g.restore();
    }
  }

  // 4) 点击飘字（珊瑚红祝福语）
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const phrases = clickTextLayer.querySelectorAll('.click-claude-copy');
  for (const el of phrases) {
    const r = el.getBoundingClientRect();
    if (r.width === 0) continue;
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize) || 30;
    g.fillStyle = cs.color || '#ff5a5f';
    g.font = `900 ${size}px "PingFang SC","Microsoft YaHei",sans-serif`;
    g.shadowColor = 'rgba(255,180,0,0.9)';
    g.shadowOffsetY = size * 0.08;
    g.fillText(el.textContent, r.left + r.width / 2 - ox, r.top + r.height / 2 - oy);
    g.shadowOffsetY = 0;
  }

  return cv;
}

// 圆角矩形路径（兼容老浏览器，不依赖 ctx.roundRect）
function roundRectPath(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// 四角小星星装饰（分享卡点缀用）
function sparklePath(g, cx, cy, r) {
  g.beginPath();
  g.moveTo(cx, cy - r);
  g.quadraticCurveTo(cx, cy, cx + r, cy);
  g.quadraticCurveTo(cx, cy, cx, cy + r);
  g.quadraticCurveTo(cx, cy, cx - r, cy);
  g.quadraticCurveTo(cx, cy, cx, cy - r);
  g.closePath();
}

// 合成竖屏分享海报（1080×1920，9:16 适合朋友圈全屏分享图）：
// 奶油底 + 顶部品牌行 + 圆角照片窗（当前画面截图）+ 尾巴卷度大数字 + 底部二维码/网址条。
function drawShareCard() {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const FONT = '"PingFang SC","Microsoft YaHei",sans-serif';

  // 1) 奶油底色：上浅下暖的纵向渐变
  const bgGrad = g.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, '#fff8ea');
  bgGrad.addColorStop(1, '#ffdf9e');
  g.fillStyle = bgGrad;
  g.fillRect(0, 0, W, H);

  // 1.2) 角落装饰：半透明琥珀圆点 + 小星星，增加活泼感
  g.fillStyle = 'rgba(255,170,40,0.14)';
  for (const [cx, cy, r] of [[64, 330, 46], [1020, 170, 30], [56, 1540, 34], [1026, 1260, 52]]) {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(255,180,0,0.55)';
  sparklePath(g, 150, 160, 16); g.fill();
  sparklePath(g, 940, 280, 20); g.fill();
  sparklePath(g, 990, 1180, 14); g.fill();

  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';

  // 2) 顶部品牌行：🐶 摩卡叫 · 攒卷度
  g.fillStyle = '#4a3b2a';
  g.font = `900 64px ${FONT}`;
  g.fillText('🐶 摩卡叫 · 攒卷度', W / 2, 142);
  // 品牌下方琥珀小弧线
  g.strokeStyle = '#ffb400';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(W / 2 - 120, 170);
  g.quadraticCurveTo(W / 2, 188, W / 2 + 120, 170);
  g.stroke();

  // 3) 圆角照片窗：白边相框 + 软阴影，内嵌当前画面截图（cover）
  const px = 76, py = 228, pw = W - 152, ph = 920;
  g.save();
  g.shadowColor = 'rgba(150,90,0,0.28)';
  g.shadowBlur = 34;
  g.shadowOffsetY = 14;
  roundRectPath(g, px, py, pw, ph, 40);
  g.fillStyle = '#fffdf6';
  g.fill();
  g.restore();
  const shot = captureSceneCanvas();
  const ix = px + 14, iy = py + 14, iw = pw - 28, ih = ph - 28;
  g.save();
  roundRectPath(g, ix, iy, iw, ih, 30);
  g.clip();
  const scale = Math.max(iw / shot.width, ih / shot.height);
  const dw = shot.width * scale;
  const dh = shot.height * scale;
  g.drawImage(shot, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
  g.restore();

  // 4) 尾巴卷度数字区：柔光托底 + 白描边琥珀大数字（全图最醒目）
  const numText = String(energyValue);
  const NUM_CENTER_Y = 1426;   // 数字槽的垂直中心：槽位置/高度固定，不随字号变化
  const NUM_MAX_FONT = 240;
  const NUM_MAX_W = W - 260;   // 数字最大宽度（两侧各留 130px），超过则等比缩小字号
  let numFont = NUM_MAX_FONT;
  g.font = `900 ${numFont}px ${FONT}`;
  const numW = g.measureText(numText).width;
  if (numW > NUM_MAX_W) {
    numFont = Math.floor((NUM_MAX_FONT * NUM_MAX_W) / numW);
    g.font = `900 ${numFont}px ${FONT}`;
  }
  // 数字无下伸部，视觉中心 ≈ baseline - 0.35em；按槽中心反推 baseline，缩小后仍垂直居中
  const numBaseline = Math.round(NUM_CENTER_Y + numFont * 0.35);
  const glow = g.createRadialGradient(W / 2, NUM_CENTER_Y, 30, W / 2, NUM_CENTER_Y, 430);
  glow.addColorStop(0, 'rgba(255,190,60,0.45)');
  glow.addColorStop(1, 'rgba(255,190,60,0)');
  g.fillStyle = glow;
  g.fillRect(0, 1148, W, 460);

  g.fillStyle = '#a06a12';
  g.font = `800 48px ${FONT}`;
  g.fillText('我 的 尾 巴 卷 度', W / 2, 1280);

  g.font = `900 ${numFont}px ${FONT}`;
  g.lineWidth = Math.max(8, Math.round(numFont * 0.075));
  g.lineJoin = 'round';
  g.strokeStyle = '#fffdf6';
  g.strokeText(numText, W / 2, numBaseline);
  g.fillStyle = '#ff9d1c';
  g.shadowColor = 'rgba(160,95,0,0.35)';
  g.shadowBlur = 4;
  g.shadowOffsetY = 10;
  g.fillText(numText, W / 2, numBaseline);
  g.shadowBlur = 0;
  g.shadowOffsetY = 0;

  // 5) 祝福短语
  g.fillStyle = '#8a5a10';
  g.font = `800 48px ${FONT}`;
  g.fillText('尾巴卷卷 · 烦恼滚开', W / 2, 1612);

  // 6) 底部白色导流条：左二维码 + 右文案（二维码未就绪时降级为纯网址）
  const fx = 76, fy = 1680, fw = W - 152, fh = 150;
  g.save();
  g.shadowColor = 'rgba(150,90,0,0.18)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 6;
  roundRectPath(g, fx, fy, fw, fh, 30);
  g.fillStyle = '#fffdf6';
  g.fill();
  g.restore();

  if (qrShareImg && qrShareImg.complete && qrShareImg.naturalWidth > 0) {
    // 二维码小白卡（纯白底，与条底色拉开层次；关闭平滑保证码点边缘锐利）
    const qc = 118;  // 白卡边长
    const qx = fx + 16, qy = fy + (fh - qc) / 2;
    roundRectPath(g, qx, qy, qc, qc, 16);
    g.fillStyle = '#ffffff';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = '#f0dcb8';
    g.stroke();
    g.imageSmoothingEnabled = false;
    g.drawImage(qrShareImg, qx + 8, qy + 8, qc - 16, qc - 16);
    g.imageSmoothingEnabled = true;

    g.textAlign = 'left';
    g.fillStyle = '#4a3b2a';
    g.font = `800 44px ${FONT}`;
    g.fillText('扫码一起攒尾巴卷度', qx + qc + 28, fy + 64);
    g.fillStyle = '#a0742c';
    g.font = `600 31px ${FONT}`;
    g.fillText('dewyue.github.io/moka-wangwang/', qx + qc + 28, fy + 110);
    g.textAlign = 'center';
  } else {
    g.fillStyle = '#a0742c';
    g.font = `600 36px ${FONT}`;
    g.fillText('dewyue.github.io/moka-wangwang/', W / 2, fy + 90);
  }

  return cv.toDataURL('image/png');
}

function openShare() {
  if (shareOpen) return;
  shareOpen = true;
  shareArt.src = drawShareCard();

  // 手机端：提示长按保存（依赖系统原生长按菜单）；桌面端：提供下载按钮
  if (isCoarsePointer) {
    shareHint.style.display = '';
    shareHint.textContent = '长按图片即可保存到相册';
    shareDownload.style.display = 'none';
  } else {
    shareHint.style.display = 'none';
    shareDownload.style.display = '';
  }

  shareOverlay.classList.add('is-open');
}

function closeShare() {
  if (!shareOpen) return;
  shareOpen = false;
  shareOverlay.classList.remove('is-open');
  shareCard.style.transform = '';
  // 关闭后重置闲置计时，避免立刻再次弹出
  lastActivityAt = nowSec();
}

function downloadShareImage() {
  const url = shareArt.src;
  if (!url) return;
  const a = document.createElement('a');
  a.href = url;
  a.download = `moka-weiba-${energyValue}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

if (shareDismiss) shareDismiss.addEventListener('click', closeShare);
if (shareClose) shareClose.addEventListener('click', closeShare);
if (shareDownload) shareDownload.addEventListener('click', downloadShareImage);
// 阻止分享弹层内的指针事件冒泡到 stage，否则会立刻被 markActivity 关掉
if (shareOverlay) {
  shareOverlay.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    // 点击卡片以外的遮罩区域 → 关闭
    if (e.target === shareOverlay) closeShare();
  });
}
// 手机端额外提供一个下载兜底：点图片区域也可触发（部分浏览器支持）
if (shareArt) shareArt.addEventListener('click', () => {
  if (isCoarsePointer) downloadShareImage();
});

function tick() {
  requestAnimationFrame(tick);
  const now = nowSec();
  const dt = Math.min(0.05, Math.max(0.001, now - lastTick));
  lastTick = now;
  const uiBeatPosition =
    started && ctx && startTime > 0 && ctx.currentTime >= startTime
      ? (ctx.currentTime - startTime) / SPB
      : null;
  updateUiRhythm(uiBeatPosition);

  // 闲置分享检测：已开始、无指针按下、非长按、弹层未开，超过 3 秒无操作则弹出
  if (
    started &&
    !shareOpen &&
    !reentryMode &&          // 息屏恢复的欢迎界面期间，暂停闲置弹分享
    pointers.size === 0 &&
    !holding &&
    lastActivityAt > 0 &&
    now - lastActivityAt >= IDLE_POPUP_SEC
  ) {
    openShare();
  }

  if (started && ctx) {
    const t = ctx.currentTime;
    updateSustainClaims(t);
    const phase = (((t - startTime) / SPB) % 1 + 1) % 1;  // 当前拍内相位 0..1
    beatP = Math.pow(1 - phase, 2.4);                      // 拍头强、迅速衰减

    // 摩卡律动：拍头向上跳 + 上下压缩（压扁拉伸），叠加两拍一周期的左右晃动
    const sway = Math.sin(((t - startTime) / (SPB * 2)) * Math.PI * 2);
    dogEl.style.transform =
      `translate(${(sway * 5).toFixed(2)}px, ${(-9 * beatP).toFixed(2)}px)` +
      ` rotate(${(sway * 2.4).toFixed(2)}deg)` +
      ` scale(${(1 + 0.06 * beatP).toFixed(4)}, ${(1 - 0.05 * beatP).toFixed(4)})`;

    // 闲置分享卡片：随节拍放大缩小 + 左右摆动，节奏感与摩卡一致
    if (shareOpen) {
      shareCard.style.transform =
        `rotate(${(sway * 2.2).toFixed(2)}deg)` +
        ` scale(${(1 + 0.05 * beatP).toFixed(4)}, ${(1 - 0.035 * beatP).toFixed(4)})`;
    }
  }

  /* ---------- 叫弹跳弹簧 ----------
   * 高刚度(320) + 低阻尼(13)：约 90ms 快速冲起、带过冲后果断定住；
   * 张嘴期间维持弹起，闭嘴快速弹回；每次队列发声时注入冲量，
   * 嘴张着也会重新弹一下。 */
  const popTarget = mouthPopped ? 1 : 0;
  barkPopVel += (popTarget - barkPop) * 320 * dt;
  barkPopVel *= Math.exp(-13 * dt);
  barkPopVel = Math.max(-10, Math.min(10, barkPopVel));
  barkPop += barkPopVel * dt;
  dogInner.style.transform =
    `scale(${(1 + 0.28 * barkPop).toFixed(4)}) rotate(${(-3.5 * barkPop).toFixed(2)}deg)`;

  if (latestClaudeText) {
    const textAge = Math.max(0, now - latestClaudeTextBornAt);
    const shakeEnvelope = Math.max(0, 1 - textAge / 0.72);
    const shakeX =
      (Math.sin(now * 94) + Math.sin(now * 151 + 1.3) * 0.55) *
      3.8 * shakeEnvelope;
    const shakeY =
      (Math.cos(now * 103 + 0.4) + Math.sin(now * 173) * 0.45) *
      2.8 * shakeEnvelope;
    const shakeRotate = Math.sin(now * 127 + 0.8) * 3.2 * shakeEnvelope;
    latestClaudeText.style.transform =
      `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px)` +
      ` rotate(${(-3.5 * barkPop + shakeRotate).toFixed(2)}deg)` +
      ` scale(${(1 + 0.28 * barkPop).toFixed(4)})`;
  }

  /* ---------- 长按果冻动画 ----------
   * holdLevel 缓慢累积（约 1.1s 时间常数），松手后快速回落；
   * 缩放走欠阻尼弹簧，起步和收尾都带 Q 弹过冲；
   * 抖动为 ~19Hz 高频，幅度随 holdLevel 增大并封顶。 */
  const holdTarget = holding ? 1 : 0;
  const tau = holding ? 1.1 : 0.22;
  holdLevel += (holdTarget - holdLevel) * (1 - Math.exp(-dt / tau));

  const scaleTarget = 1 + 0.16 * holdLevel;                // 逐渐变大（最大 1.16，弹簧过冲略超）
  jellyVel += (scaleTarget - jellyScale) * 55 * dt;
  jellyVel *= Math.exp(-7 * dt);
  jellyScale += jellyVel * dt;

  const amp = 6 * holdLevel;                               // 抖动幅度渐大，封顶 6px
  const jx = (Math.sin(now * 120) + Math.sin(now * 197 + 1.7) * 0.6) * amp * 0.55;
  const jy = (Math.cos(now * 128 + 0.6) + Math.sin(now * 233 + 3.1) * 0.6) * amp * 0.55;
  const jr = (Math.sin(now * 108 + 2.2) + Math.sin(now * 181) * 0.5) * 2.4 * holdLevel;
  dogJelly.style.transform =
    `translate(${jx.toFixed(2)}px, ${jy.toFixed(2)}px)` +
    ` rotate(${jr.toFixed(2)}deg) scale(${jellyScale.toFixed(4)})`;

  // 颜色逐渐变红（黄色图 hue-rotate 负角度 → 红，辅以饱和提升）
  if (holdLevel > 0.004) {
    dogJelly.style.filter =
      `hue-rotate(${(-42 * holdLevel).toFixed(1)}deg)` +
      ` saturate(${(1 + 0.7 * holdLevel).toFixed(3)})` +
      ` brightness(${(1 + 0.04 * holdLevel).toFixed(3)})`;
  } else {
    dogJelly.style.filter = '';
  }

  fxFrame(now);
}

/* ============================================================
 * 指针交互：跨格补全 + 节奏队列；jiao 长音在原纹理上直接切换音高
 * ==========================================================*/
function retuneHeldJiao(pointerId, state, zi) {
  const z = zones[zi];
  if (!z || z.sample !== 'jiao' || !state.voice) return false;
  if (!isRetunableSustainVoice(state.voice)) return false;

  state.zone = zi;
  state.pendingEntryId = null;
  enqueueSustainRetune(zi, pointerId, state.voice);
  return true;
}

function enterZone(pointerId, state, zi) {
  if (zi === state.zone) return;
  if (retuneHeldJiao(pointerId, state, zi)) return;

  if (state.voice) {
    releaseVoice(state.voice, true);
    state.voice = null;
  }

  state.zone = zi;
  const entry = enqueueActivation(zi, pointerId);
  state.pendingEntryId = entry.id;
}

function tryActivate(pointerId, x, y, state) {
  if (!state) {
    state = {
      zone: -1,
      voice: null,
      pendingEntryId: null,
      lastX: x,
      lastY: y,
    };
    enterZone(pointerId, state, zoneIndex(x, y));
    return state;
  }

  for (const zi of zonesAlongSegment(state.lastX, state.lastY, x, y)) {
    enterZone(pointerId, state, zi);
  }
  state.lastX = x;
  state.lastY = y;
  return state;
}

stage.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  // 右键（次键）：立即截取当前画面并弹出分享弹层，不等 3 秒闲置
  if (e.button === 2) {
    if (started) openShare();
    return;
  }
  markActivity();
  // 必须在手势同步栈内解锁，否则 iOS 会一直 suspended → 只有嘴动没有声音
  unlockAudio();
  if (!started || !buffers.da) {
    pointers.set(e.pointerId, {
      zone: -1,
      voice: null,
      pendingEntryId: null,
      lastX: e.clientX,
      lastY: e.clientY,
    });
    hideControlsUntilIdle();
    start();
    updatePinch();
    return;
  }
  spawnClaudeText(e.clientX, e.clientY);
  try { stage.setPointerCapture(e.pointerId); } catch (_) { /* 某些旧浏览器不支持 */ }
  pointers.set(
    e.pointerId,
    tryActivate(e.pointerId, e.clientX, e.clientY, null)
  );
  updatePinch();
}, { passive: false });

stage.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  if (!started || !buffers.da) return;
  e.preventDefault();
  // 触发分享卡的那两指：移动不再算“有效交互”，否则 markActivity 会立刻把卡关掉。
  if (!shareGesturePointers.has(e.pointerId)) markActivity();
  pointers.set(
    e.pointerId,
    tryActivate(
      e.pointerId,
      e.clientX,
      e.clientY,
      pointers.get(e.pointerId)
    )
  );
  updatePinch();
}, { passive: false });

function endPointer(e, musical) {
  // 右键只用于截图弹层，其按下/抬起都不参与游戏交互与闲置检测，
  // 否则 pointerup 的 markActivity 会立刻把刚弹出的分享层关掉。
  if (e.button === 2) return;
  // 捏合触发分享的那两指同理：抬起时不重置闲置计时，免得把分享卡带走。
  const isShareGesture = shareGesturePointers.has(e.pointerId);
  const state = pointers.get(e.pointerId);
  if (!isShareGesture) markActivity();
  if (state && state.voice) {
    if (musical) releaseVoice(state.voice, true);
    else forceStopVoice(state.voice);
  }
  if (!musical) cancelQueuedInputs(e.pointerId);
  pointers.delete(e.pointerId);
  if (isShareGesture) shareGesturePointers.delete(e.pointerId);
  if (pointers.size < 2) { pinchStartDist = 0; pinchTriggered = false; }
  if (pointers.size === 0) hideControlsUntilIdle();
  try {
    if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  } catch (_) { /* 指针捕获可能已经自动释放 */ }
}

window.addEventListener('pointerup', (e) => endPointer(e, true));
window.addEventListener('pointercancel', (e) => endPointer(e, false));
window.addEventListener('blur', () => {
  inputQueue.length = 0;
  clearInputVisualTimers();
  pointers.clear();
  shareGesturePointers.clear();
  pinchStartDist = 0;
  pinchTriggered = false;
  for (const voice of [...liveVoices]) forceStopVoice(voice);
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

/* ============================================================
 * 启动
 * ==========================================================*/
async function start() {
  if (started) return;
  started = true;
  hideControlsUntilIdle();

  // 资源已在欢迎界面预加载完毕；这里确保音频已解锁再启动节拍调度。
  await unlockAudio();

  startTime = ctx.currentTime + 0.12;
  nextNoteTime = startTime;
  lastCommittedInputTime = -Infinity;
  inputQueue.length = 0;
  stepCount = 0;
  setInterval(scheduler, 25);

  // 尾巴卷度 HUD 上场，并初始化闲置计时（用户还没点也算“进入游戏”）
  if (energyHud) energyHud.classList.add('is-on');
  lastActivityAt = nowSec();
}

/* ============================================================
 * 息屏/切后台恢复：手机锁屏后系统会把 AudioContext 挂起（iOS 甚至置为 closed），
 * 同时 setInterval 被冻结，亮屏后 startTime/nextNoteTime 已失准，导致无声、
 * 只能刷新。这里在页面恢复可见时重对齐节拍；上下文若已被系统关闭则重建。
 * ==========================================================*/

// 重对齐节拍时钟：把拍点重新锚定到“现在”，清掉过期队列，避免追帧爆音或卡死。
function rebaseBeatClock() {
  if (!ctx || !started) return;
  startTime = ctx.currentTime + 0.12;
  nextNoteTime = startTime;
  stepCount = 0;
  lastCommittedInputTime = -Infinity;
  inputQueue.length = 0;
}

// 重建音频上下文（iOS 息屏后 ctx 可能被置为 closed，resume 也救不回，只能新建）。
// 等价于“刷新页面听声音”，但保留尾巴卷度等游戏进度。
async function restartAudio() {
  try { if (ctx) await ctx.close(); } catch (_) { /* 已关闭 */ }
  initAudio();                          // 新建 ctx + 总线 + 压缩器 + 噪声 buffer
  await unlockAudio();
  try { await loadSamples(); } catch (_) { /* 解码失败兜底：不阻塞，下次手势再试 */ }
  rebaseBeatClock();
}

let wasHidden = false;   // 是否经历过页面不可见（息屏/切后台）
let reentryMode = false; // 处于“息屏恢复→点按钮继续”的二次进入流程

// 息屏/切后台恢复后音频多被系统挂起，静默 resume 在 iOS 上基本失败。
// 改为回到欢迎页，让用户再点一次按钮（真实手势）重新加载声音；尾巴卷度等进度保留。
function showWelcomeForContinue() {
  if (!started || !welcomeAd || !welcomeEnter) return;
  reentryMode = true;
  // 恢复期间只展示欢迎界面的大按钮：关掉分享卡、隐藏左上角声音按钮，
  // 并停掉“闲置 3 秒弹分享/显按钮”的定时器。
  if (shareOpen) closeShare();
  clearTimeout(controlsIdleTimer);
  if (topControls) topControls.classList.remove('is-visible');
  // 大按钮回到初始形态（非按下态）
  welcomeEnter.classList.remove('is-pressed');
  welcomeEnter.disabled = false;
  if (welcomeStatus) welcomeStatus.classList.add('hide');   // 首次已加载过，不再提示“资源加载中”
  if (welcomeCta) {
    welcomeCta.textContent = '按下继续';
    welcomeCta.classList.remove('hide');
  }
  welcomeAd.hidden = false;
  // 先解除 hidden 再下一帧移除 hide，保证淡入过渡生效
  requestAnimationFrame(() => welcomeAd.classList.remove('hide'));
}

// 页面隐藏时打标；恢复可见时只要已经开始，就回到欢迎页走“继续”流程
// （息屏后音频即便看似 running 实际也常被破坏，统一让用户点一次按钮重建最稳）。
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { wasHidden = true; return; }
  if (!wasHidden) return;
  wasHidden = false;
  if (started) showWelcomeForContinue();
});

// bfcache（iOS Safari 前进/后退缓存）恢复时同样处理。
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  if (started) showWelcomeForContinue();
});

let resourcesReady;
function preloadImages() {
  const imgs = dogInner ? dogInner.querySelectorAll('img') : [];
  return Promise.all(
    [...imgs].map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          })
    )
  );
}

function preloadResources() {
  resourcesReady = (async () => {
    initAudio();
    bindAudioUnlockGestures();
    // 页面加载阶段 resume 多半会被 Safari 拒绝；真正解锁靠用户手势。
    unlockAudio().catch(() => {});
    await Promise.all([loadSamples(), preloadImages()]);
  })().catch((error) => {
    console.error('[摩卡Tap] 资源预加载失败。', error);
  });
  return resourcesReady;
}

let resizeTimer = 0;
function handleLayoutResize() {
  fxResize();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildGrid, 150);
}
window.addEventListener('resize', handleLayoutResize);
if (window.ResizeObserver) {
  const stageResizeObserver = new ResizeObserver(handleLayoutResize);
  stageResizeObserver.observe(stage);
}
// 手机/桌面切换（媒体查询变化）时重建分区布局
if (mobileMedia.addEventListener) {
  mobileMedia.addEventListener('change', buildGrid);
} else if (mobileMedia.addListener) {
  mobileMedia.addListener(buildGrid);
}

buildGrid();
fxResize();
updateMuteButton(musicToggle, bgmMuted, 'music');
updateMuteButton(sfxToggle, sfxMuted, 'soundEffects');
showControls();
requestAnimationFrame(tick);

/* ============================================================
 * 欢迎界面：预加载全部资源，3D 按钮按下后进入正式画面
 * ============================================================ */
const welcomeAd = document.getElementById('welcome-ad');
const welcomeEnter = document.getElementById('welcome-enter');
const welcomeStatus = document.getElementById('welcome-status');
const welcomeCta = document.getElementById('welcome-cta');

preloadResources();

if (resourcesReady && welcomeEnter) {
  resourcesReady.then(() => {
    welcomeEnter.disabled = false;
    if (welcomeStatus) welcomeStatus.classList.add('hide');
    if (welcomeCta) welcomeCta.classList.remove('hide');
  });
}

if (welcomeAd && welcomeEnter) {
  welcomeAd.addEventListener('pointerdown', (event) => event.stopPropagation());
  // 必须在用户手势（pointerdown / touchstart）内同步解锁音频，
  // 否则 Safari / iOS / 微信会拒绝，进入后只有动画没有声音。
  const unlockFromWelcomeGesture = () => { unlockAudio(); };
  welcomeEnter.addEventListener('pointerdown', unlockFromWelcomeGesture);
  welcomeEnter.addEventListener('touchstart', unlockFromWelcomeGesture, { passive: true });
  welcomeEnter.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (welcomeEnter.disabled) return;
    // 手势栈内再抢一次解锁（部分 iOS 版本对 click 更认）
    const unlockWait = unlockAudio();
    // 锁定“按下”形态，短暂展示后再切场
    welcomeEnter.classList.add('is-pressed');
    if (reentryMode) {
      // 息屏恢复后的二次进入：重建音频上下文 + 重新解码样本（等价于首次加载逻辑），
      // 重对齐节拍时钟；尾巴卷度等游戏进度保持不变。
      reentryMode = false;
      await unlockWait;
      await restartAudio();
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      // 重新计时闲置，避免一回来就立刻弹分享卡
      lastActivityAt = nowSec();
    } else {
      await Promise.all([resourcesReady, unlockWait]);
      await new Promise((resolve) => window.setTimeout(resolve, 160));
      await start();
    }
    welcomeAd.classList.add('hide');
    window.setTimeout(() => { welcomeAd.hidden = true; }, 450);
  });
}
