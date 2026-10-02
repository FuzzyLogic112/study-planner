"use strict";
/* ================================================================
   学航助手 · 全学段学习规划
   数据层：localStorage 版本化存储（xuehang_db_v1）+ 迁移函数
   ================================================================ */
var DB_KEY = "xuehang_db_v1";
var DB_VERSION = 2;

/* ---------- 学科与常量 ---------- */
var STAGES = ["小学","初中","高中","大学","考研","考公考编","其他"];
var STAGE_SUBJECTS = {
  "小学": ["语文","数学","英语","科学","体育","其他"],
  "初中": ["语文","数学","英语","物理","化学","生物","历史","地理","政治","体育","其他"],
  "高中": ["语文","数学","英语","物理","化学","生物","历史","地理","政治","体育","其他"],
  "大学": ["高等数学","大学英语","专业课","通识课","体育","其他"],
  "考研": ["政治","英语","数学","专业课","其他"],
  "考公考编": ["行测","申论","公共基础","面试","其他"],
  "其他": ["语文","数学","英语","其他"]
};
var SUBJ_PALETTE = [
  ["#E0524D","#FDEBEA"],["#3B82F6","#E7F0FE"],["#22A06B","#E2F5EC"],["#8B5CF6","#EFE9FE"],
  ["#F97316","#FFEEDD"],["#0EA5E9","#E0F2FE"],["#EC4899","#FCE7F3"],["#84CC16","#ECFCCB"],
  ["#F59E0B","#FEF3C7"],["#14B8A6","#CCFBF1"],["#6366F1","#E0E7FF"],["#A16207","#FEF9C3"],
  ["#BE123C","#FFE4E6"],["#0E7490","#CFFAFE"],["#4D7C0F","#E2F0D8"],["#9A8B7A","#F1EAE2"]
];
/* SUBJECTS 取全学段并集：历史数据在任何学段下都有配色，不丢失 */
var SUBJECTS = {};
(function(){
  var seen = {}, i = 0;
  STAGES.forEach(function(st){
    STAGE_SUBJECTS[st].forEach(function(name){
      if(!seen[name]){ seen[name] = 1; var c = SUBJ_PALETTE[i % SUBJ_PALETTE.length]; SUBJECTS[name] = { color:c[0], soft:c[1] }; i++; }
    });
  });
})();
var SUBJECT_LIST = Object.keys(SUBJECTS);
/* 当前学段的学科列表（筛选器 / 表单下拉用） */
function stageSubjects(){
  var st = (typeof DB !== "undefined" && DB && DB.student && DB.student.stage) || "小学";
  return STAGE_SUBJECTS[st] || STAGE_SUBJECTS["小学"];
}
var SOURCES = ["校内","校外","寒假","暑假","自主"];
var EBBINGHAUS = [1,2,4,7,15,30]; /* 复习间隔（天） */
var ENCOURAGES = [
  "太棒了，又攻克了一项任务！","完成啦！你的专注力在悄悄变强。",
  "好样的！积少成多，就是这样进步的。","漂亮！这一项完成得干脆利落。",
  "又前进了一步，今天的你比昨天更厉害。","专注的时光最闪亮，继续加油！"
];

/* ---------- 日期工具（Asia/Shanghai 语义：使用本地日期） ---------- */
function pad2(n){ return (n<10?"0":"")+n; }
function dateKey(d){ return d.getFullYear()+"-"+pad2(d.getMonth()+1)+"-"+pad2(d.getDate()); }
function todayKey(){ return dateKey(new Date()); }
function addDays(key, n){
  var p = key.split("-"); var d = new Date(+p[0], +p[1]-1, +p[2]);
  d.setDate(d.getDate()+n); return dateKey(d);
}
function diffDays(a, b){ /* b - a，天数 */
  var pa=a.split("-"), pb=b.split("-");
  var da=new Date(+pa[0],+pa[1]-1,+pa[2]), db=new Date(+pb[0],+pb[1]-1,+pb[2]);
  return Math.round((db-da)/86400000);
}
function fmtDayLabel(key){
  var t = todayKey();
  if(key===t) return "今天";
  if(key===addDays(t,-1)) return "昨天";
  if(key===addDays(t,1)) return "明天";
  var p=key.split("-"); var d=new Date(+p[0],+p[1]-1,+p[2]);
  var w=["周日","周一","周二","周三","周四","周五","周六"][d.getDay()];
  return (+p[1])+"月"+(+p[2])+"日 "+w;
}
function fmtRelDay(key){
  var d = diffDays(todayKey(), key);
  if(d===0) return "今天截止";
  if(d<0) return "已过 "+(-d)+" 天";
  return "还有 "+d+" 天";
}
function fmtMin(sec){
  if(!sec) return "0分钟";
  var m = Math.round(sec/60);
  if(m<60) return m+"分钟";
  return Math.floor(m/60)+"小时"+(m%60? (m%60)+"分":"");
}
function fmtClock(sec){
  sec = Math.max(0, Math.floor(sec));
  var m = Math.floor(sec/60), s = sec%60;
  return pad2(m)+":"+pad2(s);
}
function uid(){ return "id_"+Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

/* ---------- 种子数据（相对今天动态生成） ---------- */
function seedDB(stage){
  stage = stage || "小学";
  var t = todayKey();
  /* 非小学学段：通用精简种子 */
  if(stage !== "小学") return seedGeneric(stage, t);
  var hw = [
    { id:uid(), title:"实验班 U3 阅读理解", subject:"语文", source:"校外", grade:"五年级", session:"", due: t, planMin:30, actualSec:0, points:5, done:false, doneAt:null, createdAt:t },
    { id:uid(), title:"实验班 U1-2 词汇与语法", subject:"英语", source:"校外", grade:"五年级", session:"", due: t, planMin:25, actualSec:0, points:5, done:false, doneAt:null, createdAt:t },
    { id:uid(), title:"口算 U3 小数乘法", subject:"数学", source:"校内", grade:"五年级", session:"", due: t, planMin:15, actualSec:0, points:3, done:false, doneAt:null, createdAt:t },
    { id:uid(), title:"周记《二十年后的家乡》补写", subject:"语文", source:"校内", grade:"五年级", session:"", due: t, planMin:40, actualSec:1920, points:8, done:true, doneAt:t, createdAt:t },
    { id:uid(), title:"口算 U3、U2 订正", subject:"数学", source:"校内", grade:"五年级", session:"", due: addDays(t,-1), planMin:15, actualSec:900, points:3, done:true, doneAt:addDays(t,-1), createdAt:addDays(t,-1) },
    { id:uid(), title:"学霸 U3 单元练习", subject:"数学", source:"校外", grade:"五年级", session:"", due: addDays(t,-1), planMin:35, actualSec:0, points:6, done:false, doneAt:null, createdAt:addDays(t,-1) },
    { id:uid(), title:"中华文化素养综合课后任务 - L5", subject:"其他", source:"校外", grade:"五年级", session:"第5节", due: addDays(t,3), planMin:30, actualSec:0, points:5, done:false, doneAt:null, createdAt:addDays(t,-4) },
    { id:uid(), title:"晓国际 Think2 下课后任务 - L3", subject:"英语", source:"校外", grade:"五年级", session:"第3节", due: addDays(t,2), planMin:30, actualSec:0, points:5, done:false, doneAt:null, createdAt:addDays(t,-5) }
  ];
  var checks = [
    { id:uid(), name:"早上梳洗", cat:"习惯", subject:"其他", freq:"每天", planMin:10, points:2, icon:"sun" },
    { id:uid(), name:"吃早餐", cat:"习惯", subject:"其他", freq:"每天", planMin:15, points:2, icon:"bowl" },
    { id:uid(), name:"吃午餐", cat:"习惯", subject:"其他", freq:"每天", planMin:20, points:2, icon:"bowl" },
    { id:uid(), name:"吃晚餐", cat:"习惯", subject:"其他", freq:"每天", planMin:20, points:2, icon:"bowl" },
    { id:uid(), name:"睡前洗漱", cat:"习惯", subject:"其他", freq:"每天", planMin:10, points:2, icon:"moon" },
    { id:uid(), name:"自主休息 · 放松眼睛", cat:"习惯", subject:"其他", freq:"每天", planMin:10, points:1, icon:"leaf" },
    { id:uid(), name:"洋葱数学 · 每日一课", cat:"数学", subject:"数学", freq:"每天", planMin:20, points:5, icon:"calc" },
    { id:uid(), name:"晓国际每日打卡", cat:"英语", subject:"英语", freq:"每天", planMin:15, points:5, icon:"globe" },
    { id:uid(), name:"拓词打卡 · 背单词", cat:"英语", subject:"英语", freq:"每天", planMin:10, points:4, icon:"book" },
    { id:uid(), name:"准时起床", cat:"习惯", subject:"其他", freq:"工作日", planMin:0, points:3, icon:"alarm", direct:true }
  ];
  /* 课程：weekday 0=周日 … 6=周六 */
  var courses = [
    { id:uid(), name:"编程 Python P1-2", weekday:0, start:"10:40", end:"12:15", mode:"线上", place:"学而思网校", teacher:"", replay:true, school:false, subject:"其他", suspended:false },
    { id:uid(), name:"晓国际 Think2 下", weekday:0, start:"14:50", end:"17:20", mode:"线下", place:"晓国际英语", teacher:"", replay:false, school:false, subject:"英语", suspended:false },
    { id:uid(), name:"钢琴课", weekday:1, start:"15:00", end:"15:45", mode:"线下", place:"琴行", teacher:"", replay:false, school:false, subject:"其他", suspended:false },
    { id:uid(), name:"大文综合素养 A 班", weekday:1, start:"16:20", end:"18:20", mode:"线上", place:"线上教室", teacher:"", replay:true, school:false, subject:"语文", suspended:false },
    { id:uid(), name:"中华文化素养综合课", weekday:1, start:"18:55", end:"19:55", mode:"线上", place:"线上教室", teacher:"", replay:true, school:false, subject:"其他", suspended:false },
    { id:uid(), name:"钢琴课", weekday:2, start:"15:00", end:"15:45", mode:"线下", place:"琴行", teacher:"", replay:false, school:false, subject:"其他", suspended:false },
    { id:uid(), name:"语文课（校内）", weekday:3, start:"08:00", end:"08:40", mode:"线下", place:"学校", teacher:"", replay:false, school:true, subject:"语文", suspended:false },
    { id:uid(), name:"数学思维 S 班", weekday:3, start:"18:30", end:"20:30", mode:"线下", place:"思维训练中心", teacher:"", replay:false, school:false, subject:"数学", suspended:true },
    { id:uid(), name:"数学课（校内）", weekday:4, start:"08:50", end:"09:30", mode:"线下", place:"学校", teacher:"", replay:false, school:true, subject:"数学", suspended:false },
    { id:uid(), name:"英语课（校内）", weekday:5, start:"10:00", end:"10:40", mode:"线下", place:"学校", teacher:"", replay:false, school:true, subject:"英语", suspended:false },
    { id:uid(), name:"网球课", weekday:6, start:"16:00", end:"17:00", mode:"线下", place:"黄龙世纪广场 B 座", teacher:"", replay:false, school:false, subject:"体育", suspended:false }
  ];
  var mistakes = [
    { id:uid(), subject:"数学", question:"3.6 × 0.25 = ? 计算错误，写成了 9", reason:"小数点位置点错，把乘法当成了移位", fix:"先按整数 36×25=900 计算，再数两位小数点回 0.90", mastery:3, stage:1, created: addDays(t,-3), nextReview: addDays(t,-2), lastReview: addDays(t,-3) },
    { id:uid(), subject:"语文", question:"“二十年后的家乡”习作：结尾只写了总结，没有和开头呼应", reason:"结构意识不足，虎头蛇尾", fix:"结尾用开头的意象收束，如同一条小河，形成首尾呼应", mastery:2, stage:0, created: addDays(t,-1), nextReview: t, lastReview: addDays(t,-1) },
    { id:uid(), subject:"英语", question:"Think2 U2：He ___ (go) to school by bus yesterday. 填了 goes", reason:"一般过去时标志词 yesterday 没有识别出来", fix:"看到 yesterday / last… 先把动词换成过去式 went", mastery:2, stage:2, created: addDays(t,-6), nextReview: t, lastReview: addDays(t,-4) }
  ];
  var goals = [
    { id:uid(), title:"这学期：数学计算零失误", type:"学期目标", deadline:addDays(t,60), desc:"单元测试计算题全对",
      milestones:[
        { id:uid(), text:"口算天天练打卡 30 天", done:true },
        { id:uid(), text:"错题本计算错题复习 3 轮", done:false },
        { id:uid(), text:"期中考试计算题全对", done:false }
      ], done:false, createdAt:t }
  ];
  var rewards = [
    { id:uid(), name:"周末亲子电影之夜", cost:50, icon:"film" },
    { id:uid(), name:"自选一本课外书", cost:80, icon:"book" },
    { id:uid(), name:"公园骑行一小时", cost:30, icon:"bike" }
  ];
  var ledger = [
    { id:uid(), why:"完成任务《周记〈二十年后的家乡〉补写》", amt:8, day:t },
    { id:uid(), why:"完成任务《口算 U3、U2 订正》", amt:3, day:addDays(t,-1) },
    { id:uid(), why:"完成打卡《洋葱数学 · 每日一课》", amt:5, day:addDays(t,-1) },
    { id:uid(), why:"兑换奖励《公园骑行一小时》", amt:-30, day:addDays(t,-2) },
    { id:uid(), why:"开学奖励 · 新学期新气象", amt:142, day:addDays(t,-2) }
  ];
  /* 演示：今天已完成部分打卡 */
  var doneChecks = {};
  doneChecks[t] = [checks[0].id, checks[1].id, checks[6].id];
  doneChecks[addDays(t,-1)] = [checks[6].id, checks[7].id];
  var focusLog = {}; /* day -> 秒 */
  focusLog[t] = 1920;
  focusLog[addDays(t,-1)] = 2700;
  focusLog[addDays(t,-2)] = 1500;
  focusLog[addDays(t,-3)] = 3300;
  focusLog[addDays(t,-4)] = 2100;
  focusLog[addDays(t,-5)] = 2850;
  focusLog[addDays(t,-6)] = 1200;
  return {
    version: DB_VERSION,
    student: { name:"小航", grade:"五年级", term:"五上 · 秋学期", pomodoro:25, stage:stage },
    homeworks: hw,
    checks: checks,
    checkDone: doneChecks,
    checkSecLog: {},
    courses: courses,
    mistakes: mistakes,
    rewards: rewards,
    ledger: ledger,
    points: 128,
    focusLog: focusLog,
    focusSession: null, /* {kind:'hw'|'check', id, title, planSec, startedAt, elapsedBefore, running} */
    settings: { showSchool: true }, focusSessions: [],
    goals: goals, exams: [
      { id:uid(), name:"期中考试（示例）", date:addDays(t, 30), note:"目标：计算零失误" }
    ],
    resources: [
      { id:uid(), kind:"书籍", subject:"语文", title:"《写给孩子的中国历史》", url:"", note:"每天读 20 分钟，已看到第 3 本", createdAt:t },
      { id:uid(), kind:"链接", subject:"数学", title:"洋葱数学", url:"https://www.yangcong345.com", note:"每天一课，跟着打卡走", createdAt:t }
    ], quizBank: [], quizResults: [],
    resources: [], sleepLog: {}, reviewLog: {}, reviews: [],
    templatesApplied: []
  };
}


/* 非小学学段的通用种子数据 */
function seedGeneric(stage, t){
  function H(title, subject, dueOff, planMin, points, done, actualSec){
    return { id:uid(), title:title, subject:subject, source:"自主", grade:"", session:"",
      due:addDays(t, dueOff), planMin:planMin, actualSec:actualSec||0, points:points,
      done:!!done, doneAt:done?t:null, createdAt:t };
  }
  var HW_SEED = {
    "初中": [["数学 · 一次函数练习", "数学", 0, 30, 5], ["英语 · 单词 40 个 + 完形 2 篇", "英语", 0, 25, 5], ["语文 · 文言文《出师表》背诵", "语文", 1, 20, 4]],
    "高中": [["数学 · 导数大题 3 道", "数学", 0, 45, 6], ["英语 · 3500 词 Day12", "英语", 0, 30, 5], ["物理 · 牛顿定律综合卷", "物理", 1, 40, 6]],
    "大学": [["高等数学 · 微积分习题课", "高等数学", 0, 40, 5], ["大学英语 · 六级真题听力一套", "大学英语", 1, 30, 5], ["专业课 · 教材第三章精读", "专业课", 2, 45, 6]],
    "考研": [["政治 · 肖1000 马原 2 章", "政治", 0, 60, 8], ["英语 · 真题阅读 2 篇 + 单词 50", "英语", 0, 60, 8], ["数学 · 高数第三章习题", "数学", 1, 90, 10]],
    "考公考编": [["行测 · 数量关系 20 题", "行测", 0, 40, 6], ["申论 · 大作文一篇", "申论", 1, 60, 8], ["公共基础 · 时政 30 分钟", "公共基础", 0, 30, 4]],
    "其他": [["今日核心任务 · 深度学习 1 小时", "其他", 0, 60, 8], ["阅读 30 分钟", "其他", 0, 30, 4]]
  };
  var list = HW_SEED[stage] || HW_SEED["其他"];
  var hw = list.map(function(a, i){ return H(a[0], a[1], a[2], a[3], a[4], i === list.length - 1, i === list.length - 1 ? a[3]*60 : 0); });
  var checks = [
    { id:uid(), name:"早起打卡", cat:"习惯", subject:"其他", freq:"每天", planMin:5, points:2, icon:"sun", direct:true },
    { id:uid(), name:"专注学习 · 第一时段", cat:"习惯", subject:"其他", freq:"每天", planMin:60, points:6, icon:"target" },
    { id:uid(), name:"午休 20 分钟", cat:"习惯", subject:"其他", freq:"每天", planMin:20, points:2, icon:"moon" },
    { id:uid(), name:"运动 30 分钟", cat:"习惯", subject:"其他", freq:"每天", planMin:30, points:4, icon:"bike" },
    { id:uid(), name:"睡前复盘 10 分钟", cat:"习惯", subject:"其他", freq:"每天", planMin:10, points:3, icon:"book" },
    { id:uid(), name:"23 点前睡觉", cat:"习惯", subject:"其他", freq:"每天", planMin:0, points:3, icon:"moon", direct:true }
  ];
  var courses = [
    { id:uid(), name:"晚间自习", weekday:1, start:"19:00", end:"21:30", mode:"线下", place:"自习室", teacher:"", replay:false, school:false, subject:(STAGE_SUBJECTS[stage]||STAGE_SUBJECTS["小学"])[0], suspended:false },
    { id:uid(), name:"周末模考", weekday:6, start:"09:00", end:"12:00", mode:"线下", place:"自习室", teacher:"", replay:false, school:false, subject:(STAGE_SUBJECTS[stage]||STAGE_SUBJECTS["小学"])[0], suspended:false }
  ];
  return {
    version: DB_VERSION,
    student: { name:"", grade:"", term:"", pomodoro:25, stage:stage },
    homeworks: hw, checks: checks, checkDone: {}, checkSecLog: {},
    courses: courses, mistakes: [], rewards: [], ledger: [], points: 0,
    focusLog: {}, focusSession: null, settings: { showSchool:true },
    goals: [{ id:uid(), title:"90 天拿下核心目标", type:"长期目标", deadline:addDays(t,90), desc:"每天进步一点点",
      milestones:[
        { id:uid(), text:"制定详细到周的学习计划", done:true },
        { id:uid(), text:"坚持打卡 30 天", done:false },
        { id:uid(), text:"完成 3 次模考复盘", done:false }
      ], done:false, createdAt:t }],
    exams: [{ id:uid(), name:"目标大考（示例，可修改）", date:addDays(t, 90), note:"把你的真实考试日期填进来" }],
    focusSessions: [],
    resources: [
      { id:uid(), kind:"链接", subject:(STAGE_SUBJECTS[stage]||STAGE_SUBJECTS["小学"])[1]||"其他", title:"真题资料站（示例）", url:"", note:"把常用的真题/网课链接收在这里", createdAt:t }
    ],
    quizBank: [], quizResults: [],
    resources: [], sleepLog: {}, reviewLog: {}, reviews: [],
    templatesApplied: []
  };
}

/* ---------- 读写与迁移 ---------- */
function migrate(db){
  if(!db || typeof db!=="object") return seedDB();
  if(!db.version || db.version < 1){
    db.version = 1;
  }
  if(db.version < 2){
    db.version = 2;
    db.student = db.student || {};
    if(!db.student.stage) db.student.stage = "小学";
    ["goals","exams","quizBank","quizResults","resources","reviews","templatesApplied","focusSessions"].forEach(function(k){ if(!db[k]) db[k] = []; });
    ["sleepLog","reviewLog"].forEach(function(k){ if(!db[k]) db[k] = {}; });
    if(!db.student.focus) db.student.focus = { rest:5, rounds:4, noise:"off" };
    else { db.student.focus.rest = db.student.focus.rest||5; db.student.focus.rounds = db.student.focus.rounds||4; db.student.focus.noise = db.student.focus.noise||"off"; }
  }
  /* 字段兜底 */
  db.student = db.student || { name:"小航", grade:"五年级", term:"五上 · 秋学期", pomodoro:25, stage:"小学" };
  db.homeworks = db.homeworks || [];
  db.checks = db.checks || [];
  db.checkDone = db.checkDone || {};
  db.checkSecLog = db.checkSecLog || {};
  db.courses = db.courses || [];
  db.courses.forEach(function(c){ if(!c.oddEven) c.oddEven = "每周"; if(!c.leave) c.leave = []; });
  db.mistakes = db.mistakes || [];
  db.rewards = db.rewards || [];
  db.ledger = db.ledger || [];
  db.points = typeof db.points==="number" ? db.points : 0;
  db.focusLog = db.focusLog || {};
  db.focusSession = db.focusSession || null;
  db.settings = db.settings || { showSchool:true };
  /* 跨版本字段兜底（不依赖 version 分支，保证新种子也生效） */
  ["goals","exams","quizBank","quizResults","resources","reviews","templatesApplied","focusSessions"].forEach(function(k){ if(!db[k]) db[k] = []; });
  ["sleepLog","reviewLog"].forEach(function(k){ if(!db[k]) db[k] = {}; });
  if(db.student && !db.student.focus) db.student.focus = { rest:5, rounds:4, noise:"off" };
  return db;
}
function loadDB(){
  try{
    var raw = localStorage.getItem(DB_KEY);
    if(raw){ return migrate(JSON.parse(raw)); }
  }catch(e){ /* 解析失败则回退种子 */ }
  var db = seedDB();
  saveDB(db);
  return db;
}
var saveTimer = null;
function saveDB(db){
  DB = db || DB;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function(){
    try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }catch(e){}
  }, 150);
}
function saveNow(){
  clearTimeout(saveTimer);
  try{ localStorage.setItem(DB_KEY, JSON.stringify(DB)); }catch(e){}
}
var DB = loadDB();

/* ---------- 积分 ---------- */
function addPoints(amt, why){
  DB.points += amt;
  DB.ledger.unshift({ id:uid(), why:why, amt:amt, day:todayKey() });
  saveDB();
}
function addFocusLog(sec){
  if(sec<=0) return;
  var t = todayKey();
  DB.focusLog[t] = (DB.focusLog[t]||0) + sec;
}
/* ================================================================
   UI 基础设施：通知、弹窗、图标
   ================================================================ */
function toast(msg, ms){
  var wrap = document.getElementById("toastWrap");
  var el = document.createElement("div");
  el.className = "toast"; el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(function(){ el.style.opacity="0"; el.style.transition="opacity .3s"; setTimeout(function(){ el.remove(); }, 320); }, ms||2600);
}
function encourage(){ return ENCOURAGES[Math.floor(Math.random()*ENCOURAGES.length)]; }

var modalMask = document.getElementById("modalMask");
var modalBox = document.getElementById("modalBox");
function openModal(html){
  modalBox.innerHTML = html;
  modalMask.classList.add("show");
  var first = modalBox.querySelector("input,select,textarea,button");
  if(first) setTimeout(function(){ first.focus(); }, 60);
}
function closeModal(){ modalMask.classList.remove("show"); modalBox.innerHTML=""; }
modalMask.addEventListener("click", function(e){ if(e.target===modalMask) closeModal(); });
document.addEventListener("keydown", function(e){ if(e.key==="Escape") closeModal(); });

function confirmDialog(title, text, okLabel, onOk){
  openModal(
    '<h3>'+esc(title)+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<p class="confirm-text">'+esc(text)+'</p>'+
    '<div class="modal-foot"><button class="btn btn-ghost" data-close>取消</button>'+
    '<button class="btn btn-primary" id="confirmOk">'+esc(okLabel||"确定")+'</button></div>'
  );
  modalBox.querySelector("#confirmOk").addEventListener("click", function(){ closeModal(); onOk(); });
  bindCloseButtons();
}
function bindCloseButtons(){
  modalBox.querySelectorAll("[data-close]").forEach(function(b){ b.addEventListener("click", closeModal); });
}

/* 内联 SVG 图标（stroke 风格） */
function iconSvg(name, size){
  size = size||20;
  var paths = {
    home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-6h6v6"/>',
    book:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
    cal:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    bug:'<path d="M8 3v3M16 3v3M12 6v3"/><rect x="5" y="9" width="14" height="10" rx="5"/><path d="M5 14H2M22 14h-3M7 19l-2 3M17 19l2 3"/>',
    star:'<path d="M12 3l2.7 5.5 6 .9-4.3 4.2 1 6L12 16.8 6.6 19.6l1-6L3.3 9.4l6-.9z"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
    gear:'<circle cx="12" cy="12" r="3.2"/><path d="M19 12a7 7 0 0 0-.14-1.4l2.1-1.63-2-3.46-2.48 1a7 7 0 0 0-2.42-1.4L13.66 2.6h-3.32l-.4 2.51a7 7 0 0 0-2.42 1.4l-2.48-1-2 3.46 2.1 1.63A7 7 0 0 0 5 12c0 .48.05.94.14 1.4l-2.1 1.63 2 3.46 2.48-1a7 7 0 0 0 2.42 1.4l.4 2.51h3.32l.4-2.51a7 7 0 0 0 2.42-1.4l2.48 1 2-3.46-2.1-1.63c.09-.46.14-.92.14-1.4z"/>',
    play:'<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
    pause:'<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none"/>',
    check:'<path d="M4 12.5 9.5 18 20 6.5"/>',
    x:'<path d="M5 5l14 14M19 5 5 19"/>',
    eye:'<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    edit:'<path d="M17 3a2.8 2.8 0 1 1 4 4L8 20l-5 1 1-5z"/>',
    trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/>',
    zap:'<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
    bowl:'<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c1.5-1.5 1.5-2.5 0-4M13 7c1.5-1.5 1.5-2.5 0-4"/>',
    leaf:'<path d="M5 20c0-9 5-14 14-14 0 9-5 14-14 14z"/><path d="M5 20c3-5 7-8 10-10"/>',
    calc:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01"/>',
    globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
    alarm:'<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M5 3 2.5 5.5M19 3l2.5 2.5"/>',
    film:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
    bike:'<circle cx="6" cy="17" r="4"/><circle cx="18" cy="17" r="4"/><path d="M6 17 10 9h5l3 8M10 9 9 5H7"/>',
    gift:'<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13M12 8a3 3 0 1 1 3-3c0 2-3 3-3 3zM12 8a3 3 0 1 0-3-3c0 2 3 3 3 3z"/>',
    timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2.5h6"/>',
    flag:'<path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/>',
    trophy:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a1 1 0 0 0-1 1c0 2.5 2 4 4 4M17 6h3a1 1 0 0 1 1 1c0 2.5-2 4-4 4"/>',
    layers:'<path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 12l9 5 9-5M3 16l9 5 9-5"/>',
    doc:'<path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5M9 13h7M9 17h7"/>',
    link:'<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/>',
    bed:'<path d="M3 18v-8h18v8M3 18v2M21 18v2M3 14h18"/><circle cx="7.5" cy="10.5" r="1.6"/>',
    dumbbell:'<path d="M7 8v8M17 8v8M4 10v4M20 10v4M7 12h10"/>'
  };
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[name]||"")+'</svg>';
}
function checkIcon(name){ return iconSvg(name||"target", 21); }

/* ================================================================
   导航
   ================================================================ */
var NAV = [
  { id:"home", label:"首页", icon:"home" },
  { id:"goals", label:"目标", icon:"flag" },
  { id:"exams", label:"考试", icon:"trophy" },
  { id:"quiz", label:"自测", icon:"doc" },
  { id:"resources", label:"资料库", icon:"link" },
  { id:"homework", label:"任务", icon:"book" },
  { id:"checkin", label:"专注打卡", icon:"target" },
  { id:"schedule", label:"课程表", icon:"cal" },
  { id:"reviews", label:"复习中心", icon:"layers" },
  { id:"points", label:"积分", icon:"star" },
  { id:"report", label:"成长报告", icon:"chart" },
  { id:"settings", label:"设置", icon:"gear" }
];
var currentPage = "home";
function buildNav(){
  var nav = document.getElementById("mainNav");
  nav.innerHTML = NAV.map(function(n){
    var badge = "";
    if(n.id==="homework"){
      var c = DB.homeworks.filter(function(h){ return h.due===todayKey() && !h.done; }).length;
      if(c>0) badge = '<span class="nav-badge">'+c+'</span>';
    }
    if(n.id==="reviews"){
      var d = dueReviews().length;
      if(d>0) badge = '<span class="nav-badge">'+d+'</span>';
    }
    return '<button class="nav-item'+(currentPage===n.id?" active":"")+'" data-nav="'+n.id+'">'+iconSvg(n.icon,20)+'<span class="nav-label">'+n.label+'</span>'+badge+'</button>';
  }).join("");
  nav.querySelectorAll("[data-nav]").forEach(function(b){
    b.addEventListener("click", function(){ goPage(b.getAttribute("data-nav")); });
  });
}
function goPage(id){
  currentPage = id;
  document.querySelectorAll(".page").forEach(function(p){ p.classList.remove("active"); });
  var pg = document.getElementById("page-"+id);
  if(pg) pg.classList.add("active");
  buildNav();
  renderPage(id);
  window.scrollTo({ top:0 });
}
function renderPage(id){
  if(id==="home") renderHome();
  else if(id==="goals") renderGoals();
  else if(id==="exams") renderExams();
 else if(id==="quiz") renderQuiz();
  else if(id==="resources") renderResources();
  else if(id==="homework") renderHomework();
  else if(id==="checkin") renderCheckin();
  else if(id==="schedule") renderSchedule();
  else if(id==="reviews") renderReviews();
  else if(id==="points") renderPoints();
  else if(id==="report") renderReport();
  else if(id==="settings") renderSettings();
}
function renderAll(){ buildNav(); renderPage(currentPage); updateFocusBar(); }
document.querySelectorAll("[data-goto]").forEach(function(el){
  el.addEventListener("click", function(){ goPage(el.getAttribute("data-goto")); });
});

/* ================================================================
   首页仪表盘
   ================================================================ */
function greeting(){
  var h = new Date().getHours();
  if(h<6) return "夜深了";
  if(h<9) return "早上好";
  if(h<12) return "上午好";
  if(h<14) return "中午好";
  if(h<18) return "下午好";
  return "晚上好";
}
function renderHome(){
  var t = todayKey();
  renderGoalBanner();
  renderExamStrip();
  document.getElementById("greetTitle").textContent = greeting()+"，"+DB.student.name;
  var now = new Date();
  var wk = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"][now.getDay()];
  document.getElementById("greetSub").textContent = (now.getMonth()+1)+"月"+now.getDate()+"日 "+wk+" · "+DB.student.term+" · 今天也一起把计划变成进步吧";

  var todayHw = DB.homeworks.filter(function(h){ return h.due===t; });
  var doneHw = todayHw.filter(function(h){ return h.done; }).length;
  var pct = todayHw.length ? Math.round(doneHw/todayHw.length*100) : 0;
  var focusSec = DB.focusLog[t]||0;
  var due = dueReviews().length;
  var C = 2*Math.PI*26;
  document.getElementById("statGrid").innerHTML =
    '<div class="card stat-card"><div class="ring-wrap"><svg width="64" height="64"><circle cx="32" cy="32" r="26" fill="none" stroke="var(--line)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="var(--primary)" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+C+'" stroke-dashoffset="'+(C*(1-pct/100))+'"/></svg><div class="ring-center">'+pct+'%</div></div><div><div class="stat-num">'+doneHw+'<small> / '+todayHw.length+' 项</small></div><div class="stat-label">今日任务进度</div></div></div>'+
    '<div class="card stat-card"><div class="stat-ic" style="background:var(--primary-soft); color:var(--primary-deep);">'+iconSvg("timer",26)+'</div><div><div class="stat-num">'+fmtMin(focusSec)+'</div><div class="stat-label">今日专注时长</div></div></div>'+
    '<div class="card stat-card"><div class="stat-ic" style="background:var(--gold-soft); color:#9A6B12;">'+iconSvg("star",26)+'</div><div><div class="stat-num">'+DB.points+'<small> 分</small></div><div class="stat-label">积分余额</div></div></div>'+
    '<div class="card stat-card"><div class="stat-ic" style="background:var(--red-soft); color:var(--red);">'+iconSvg("bug",26)+'</div><div><div class="stat-num">'+due+'<small> 道</small></div><div class="stat-label">待复习</div></div></div>';

  /* 今日课程 */
  var wd = now.getDay();
  var cs = DB.courses.filter(function(c){ return c.weekday===wd && courseVisibleOn(c, t); }).sort(function(a,b){ return a.start<b.start?-1:1; });
  var tc = document.getElementById("todayCourses");
  if(!cs.length){
    tc.innerHTML = '<div class="empty" style="padding:22px 10px;"><p>今天没有安排课程</p><span>自由探索、阅读和运动也是成长的一部分。</span></div>';
  } else {
    tc.innerHTML = cs.map(function(c){
      var s = SUBJECTS[c.subject]||SUBJECTS["其他"];
      var ol = courseOnLeave(c, t);
      return '<div class="mini-row"><span class="dot" style="background:'+s.color+'"></span><span class="nm">'+esc(c.name)+(c.suspended?' <span class="tag" style="background:var(--red-soft); color:var(--red);">停课</span>':"")+(ol?' <span class="tag" style="background:var(--gold-soft); color:#9A6B12;">请假</span>':"")+'</span><span class="tm">'+c.start+"–"+c.end+' · '+esc(c.mode)+'</span></div>';
    }).join("");
  }

  /* 今日待办速览 */
  var todo = DB.homeworks.filter(function(h){ return (h.due===t && !h.done) || (h.due<t && !h.done); });
  var tt = document.getElementById("todayTodo");
  if(!todo.length){
    tt.innerHTML = '<div class="empty" style="padding:22px 10px;"><p>今天的任务都完成啦</p><span>可以读读课外书，或者陪家人散散步。</span></div>';
  } else {
    tt.innerHTML = todo.slice(0,5).map(function(h){
      var s = SUBJECTS[h.subject]||SUBJECTS["其他"];
      return '<div class="mini-row"><span class="dot" style="background:'+s.color+'"></span><span class="nm">'+esc(h.title)+'</span><span class="tm">'+(h.due<t?"已逾期 · ":"")+'计划 '+h.planMin+' 分钟</span></div>';
    }).join("");
  }

  renderAdvice();
  drawBarChart(document.getElementById("homeFocusChart"), last7Days().map(function(d){ return (DB.focusLog[d]||0)/60; }), last7Days().map(dayShort), "分钟");
}
function dayShort(key){
  var p = key.split("-"); var d = new Date(+p[0],+p[1]-1,+p[2]);
  if(key===todayKey()) return "今天";
  return ["日","一","二","三","四","五","六"][d.getDay()];
}
function last7Days(){
  var arr = []; var t = todayKey();
  for(var i=6;i>=0;i--) arr.push(addDays(t,-i));
  return arr;
}
function renderAdvice(){
  var t = todayKey();
  var overdue = DB.homeworks.filter(function(h){ return h.due<t && !h.done; });
  var due = dueReviews();
  var todayHw = DB.homeworks.filter(function(h){ return h.due===t; });
  var doneToday = todayHw.filter(function(h){ return h.done; }).length;
  var focusMin = Math.round((DB.focusLog[t]||0)/60);
  var txt, why;
  if(overdue.length){
    txt = "有 "+overdue.length+" 项任务已经逾期啦。先别急着赶新任务，陪孩子按计划用一个 "+overdue[0].planMin+" 分钟的专注时段，把《"+overdue[0].title+"》稳稳拿下，欠账清零的感觉会让今晚轻松很多。";
    why = "依据：逾期任务优先处理，避免“破窗效应”让拖延扩散。";
  } else if(due.length){
    txt = "今天有 "+due.length+" 项到了复习时间。花 10 分钟用“讲题法”复习：当小老师讲出来，讲得清才是真掌握。";
    why = "依据：艾宾浩斯复习节点已到，主动输出比重复看书记得牢。";
  } else if(todayHw.length && doneToday===todayHw.length){
    txt = "今天的任务全部完成，专注了 "+focusMin+" 分钟！今晚适合早点休息，或者读一本喜欢的课外书——学有余力，方能行远。";
    why = "依据：今日任务已闭环，给大脑留白有助于记忆巩固。";
  } else if(focusMin>=60){
    txt = "今天已经专注 "+focusMin+" 分钟了，效率不错。注意每 25 分钟起身远眺一次，保护眼睛和脊柱，后半程状态会更好。";
    why = "依据：长时间近距离用眼需要间歇休息，番茄钟节奏正合适。";
  } else {
    txt = "新的一天从最想逃避的那项任务开始吧——先把它做掉，后面的任务都会变得轻松。这叫“先吃掉那只青蛙”。";
    why = "依据：先难后易能降低全天的心理负担，提升掌控感。";
  }
  document.getElementById("adviceTxt").textContent = txt;
  document.getElementById("adviceWhy").textContent = why;
}

/* ================================================================
   手绘图表（canvas）
   ================================================================ */
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function drawBarChart(canvas, values, labels, unit){
  if(!canvas) return;
  var dpr = window.devicePixelRatio||1;
  var W = canvas.width, H = canvas.height;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.aspectRatio = W+" / "+H;
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  var ink3 = cssVar("--ink-3")||"#A08F7D", line = cssVar("--line")||"#F3E4D5", primary = cssVar("--primary")||"#F97316", ink = cssVar("--ink")||"#2D2418";
  var max = Math.max.apply(null, values.concat([10]));
  max = Math.ceil(max/10)*10;
  var padL=48, padB=24, padT=16, padR=8;
  var cw = W-padL-padR, ch = H-padT-padB;
  ctx.font = "11px sans-serif";
  /* 网格 */
  for(var g=0; g<=2; g++){
    var y = padT + ch - ch*g/2;
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    ctx.fillStyle = ink3; ctx.textAlign = "right";
    ctx.fillText(Math.round(max*g/2)+(g===2?unit:""), padL-6, y+4);
  }
  var bw = Math.min(34, cw/values.length*0.55);
  values.forEach(function(v,i){
    var x = padL + cw*(i+0.5)/values.length;
    var h = ch * v/max;
    var y2 = padT + ch - h;
    ctx.fillStyle = i===values.length-1 ? primary : primary;
    ctx.globalAlpha = i===values.length-1 ? 1 : 0.45;
    roundRect(ctx, x-bw/2, y2, bw, Math.max(h,2), 5); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink; ctx.textAlign = "center";
    if(v>0) ctx.fillText(Math.round(v), x, y2-5);
    ctx.fillStyle = ink3;
    ctx.fillText(labels[i], x, H-8);
  });
}
function drawHBars(canvas, items){ /* items: {label, value, color} 横向条 */
  if(!canvas) return;
  var dpr = window.devicePixelRatio||1;
  var W = canvas.width, H = canvas.height;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.aspectRatio = W+" / "+H;
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  var ink3 = cssVar("--ink-3")||"#A08F7D", ink = cssVar("--ink")||"#2D2418";
  var max = Math.max.apply(null, items.map(function(i){ return i.value; }).concat([1]));
  var padL=44, padR=52, rowH = H/items.length;
  ctx.font = "12px sans-serif";
  items.forEach(function(it,i){
    var y = rowH*i + rowH/2;
    ctx.fillStyle = ink; ctx.textAlign = "right";
    ctx.fillText(it.label, padL-8, y+4);
    var bw = (W-padL-padR) * it.value/max;
    ctx.fillStyle = it.color;
    roundRect(ctx, padL, y-8, Math.max(bw,3), 16, 6); ctx.fill();
    ctx.fillStyle = ink3; ctx.textAlign = "left";
    ctx.fillText(Math.round(it.value)+" 分钟", padL+Math.max(bw,3)+8, y+4);
  });
}
function drawLineChart(canvas, values, labels){
  if(!canvas) return;
  var dpr = window.devicePixelRatio||1;
  var W = canvas.width, H = canvas.height;
  canvas.width = W*dpr; canvas.height = H*dpr;
  canvas.style.aspectRatio = W+" / "+H;
  var ctx = canvas.getContext("2d");
  ctx.scale(dpr,dpr);
  var ink3 = cssVar("--ink-3")||"#A08F7D", line = cssVar("--line")||"#F3E4D5", primary = cssVar("--primary")||"#F97316", ink = cssVar("--ink")||"#2D2418";
  var max = Math.max.apply(null, values.concat([5]));
  var min = Math.min.apply(null, values.concat([0]));
  var padL=30, padB=24, padT=18, padR=12;
  var cw = W-padL-padR, ch = H-padT-padB;
  ctx.font = "11px sans-serif";
  for(var g=0; g<=2; g++){
    var y = padT + ch - ch*g/2;
    ctx.strokeStyle = line; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(W-padR,y); ctx.stroke();
    ctx.fillStyle = ink3; ctx.textAlign = "right";
    ctx.fillText(Math.round(min+(max-min)*g/2), padL-6, y+4);
  }
  ctx.strokeStyle = primary; ctx.lineWidth = 2.4; ctx.beginPath();
  values.forEach(function(v,i){
    var x = padL + cw*(values.length===1?0.5:i/(values.length-1));
    var y2 = padT + ch - ch*(v-min)/((max-min)||1);
    if(i===0) ctx.moveTo(x,y2); else ctx.lineTo(x,y2);
  });
  ctx.stroke();
  values.forEach(function(v,i){
    var x = padL + cw*(values.length===1?0.5:i/(values.length-1));
    var y2 = padT + ch - ch*(v-min)/((max-min)||1);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x,y2,4,0,7); ctx.fill();
    ctx.fillStyle = primary; ctx.beginPath(); ctx.arc(x,y2,2.4,0,7); ctx.fill();
    ctx.fillStyle = ink; ctx.textAlign = "center";
    ctx.fillText(v, x, y2-9);
    ctx.fillStyle = ink3;
    ctx.fillText(labels[i], x, H-8);
  });
}
function roundRect(ctx,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
/* ================================================================
   任务管理
   ================================================================ */
var hwFilter = { subject:"全部", source:"全部", status:"全部", todayOnly:false };
function chipRow(el, options, current, onPick){
  el.innerHTML = options.map(function(o){
    return '<button class="chip'+(o===current?" on":"")+'" data-v="'+esc(o)+'">'+esc(o)+'</button>';
  }).join("");
  el.querySelectorAll(".chip").forEach(function(c){
    c.addEventListener("click", function(){ onPick(c.getAttribute("data-v")); });
  });
}
function hwStatus(h){
  var t = todayKey();
  if(DB.focusSession && DB.focusSession.kind==="hw" && DB.focusSession.id===h.id) return { k:"doing", label:"专注中" };
  if(h.done) return { k:"done", label:"已完成" };
  if(h.due < t) return { k:"over", label:"已逾期" };
  if(h.due > t) return { k:"future", label:"未到期" };
  return { k:"todo", label:"待完成" };
}
function renderHomework(){
  chipRow(document.getElementById("fSubject"), ["全部"].concat(stageSubjects()), hwFilter.subject, function(v){ hwFilter.subject=v; renderHomework(); });
  chipRow(document.getElementById("fSource"), ["全部"].concat(SOURCES), hwFilter.source, function(v){ hwFilter.source=v; renderHomework(); });
  chipRow(document.getElementById("fStatus"), ["全部","待完成","已完成"], hwFilter.status, function(v){ hwFilter.status=v; renderHomework(); });
  document.getElementById("btnTodayHw").classList.toggle("btn-primary", hwFilter.todayOnly);
  document.getElementById("btnTodayHw").classList.toggle("btn-ghost", !hwFilter.todayOnly);

  var t = todayKey();
  var list = DB.homeworks.filter(function(h){
    if(hwFilter.todayOnly && h.due!==t) return false;
    if(hwFilter.subject!=="全部" && h.subject!==hwFilter.subject) return false;
    if(hwFilter.source!=="全部" && h.source!==hwFilter.source) return false;
    if(hwFilter.status==="待完成" && h.done) return false;
    if(hwFilter.status==="已完成" && !h.done) return false;
    return true;
  });
  var wrap = document.getElementById("hwGroups");
  if(!list.length){
    wrap.innerHTML = '<div class="card empty"><div class="em">'+iconSvg("book",30)+'</div><p>没有符合条件的任务</p><span>换个筛选条件看看，或者新增一项任务吧。</span></div>';
    return;
  }
  /* 按日期分组：今天与逾期置顶，其后按日期倒序 */
  var groups = {};
  list.forEach(function(h){ (groups[h.due] = groups[h.due]||[]).push(h); });
  var keys = Object.keys(groups).sort(function(a,b){ return a<b?1:-1; });
  wrap.innerHTML = keys.map(function(k){
    var items = groups[k];
    var doneN = items.filter(function(h){ return h.done; }).length;
    var actual = items.reduce(function(s,h){ return s+(h.actualSec||0); },0);
    var rows = items.map(hwRowHtml).join("");
    return '<div class="hw-group"><div class="hw-group-head"><span class="day">'+fmtDayLabel(k)+'</span><span class="rel">'+k+' · '+fmtRelDay(k)+'</span>'+
      '<span class="stats"><span>任务 <b>'+items.length+'</b> 项</span><span>已完成 <b>'+doneN+'</b></span><span>待完成 <b>'+(items.length-doneN)+'</b></span><span>实际用时 <b>'+fmtMin(actual)+'</b></span></span></div>'+
      '<div class="hw-list">'+rows+'</div></div>';
  }).join("");
  bindHwActions(wrap);
}
function hwRowHtml(h){
  var s = SUBJECTS[h.subject]||SUBJECTS["其他"];
  var st = hwStatus(h);
  var meta = "";
  if(h.grade) meta += '<span class="tag">'+esc(h.grade)+'</span>';
  if(h.source) meta += '<span class="tag">'+esc(h.source)+'</span>';
  if(h.session) meta += '<span class="tag">'+esc(h.session)+'</span>';
  meta += '<span class="tag tag-points">完成 +'+h.points+' 分</span>';
  meta += '<span class="tag">截止 '+h.due.slice(5).replace("-","/")+'</span>';
  var times = '<span>计划 '+h.planMin+' 分钟</span>';
  if(h.actualSec>0) times += '<span class="actual">⚡ 实际 '+fmtMin(h.actualSec)+'</span>';
  var focusBtn = h.done ? "" : '<button class="focus-start-btn" data-focus="'+h.id+'">'+iconSvg("play",13)+' 专注</button>';
  return '<div class="hw-item'+(h.done?" is-done":"")+'">'+
    '<button class="hw-check'+(h.done?" checked":"")+'" data-toggle="'+h.id+'" aria-label="'+(h.done?"标记为未完成":"标记为已完成")+'">'+(h.done?iconSvg("check",15):"")+'</button>'+
    '<div class="hw-body"><div class="hw-title"><span class="tag tag-subj" style="background:'+s.color+'">'+esc(h.subject)+'</span><span class="t">'+esc(h.title)+'</span><span class="status-pill st-'+st.k+'">'+st.label+'</span></div>'+
    '<div class="hw-meta">'+meta+'</div><div class="hw-times">'+times+'</div></div>'+
    '<div class="hw-actions">'+focusBtn+
    '<button class="icon-btn" data-view="'+h.id+'" aria-label="查看详情">'+iconSvg("eye",17)+'</button>'+
    '<button class="icon-btn" data-edit-hw="'+h.id+'" aria-label="编辑任务">'+iconSvg("edit",16)+'</button>'+
    '<button class="icon-btn danger" data-del-hw="'+h.id+'" aria-label="删除任务">'+iconSvg("trash",16)+'</button></div></div>';
}
function findHw(id){ return DB.homeworks.filter(function(h){ return h.id===id; })[0]; }
function bindHwActions(wrap){
  wrap.querySelectorAll("[data-toggle]").forEach(function(b){
    b.addEventListener("click", function(){
      var h = findHw(b.getAttribute("data-toggle")); if(!h) return;
      if(h.done){ h.done=false; h.doneAt=null; toast("已恢复为待完成"); }
      else { completeHomework(h, true); return; }
      saveDB(); renderHomework(); buildNav();
    });
  });
  wrap.querySelectorAll("[data-focus]").forEach(function(b){
    b.addEventListener("click", function(){ startFocus("hw", b.getAttribute("data-focus")); });
  });
  wrap.querySelectorAll("[data-view]").forEach(function(b){
    b.addEventListener("click", function(){ viewHomework(b.getAttribute("data-view")); });
  });
  wrap.querySelectorAll("[data-edit-hw]").forEach(function(b){
    b.addEventListener("click", function(){ homeworkForm(b.getAttribute("data-edit-hw")); });
  });
  wrap.querySelectorAll("[data-del-hw]").forEach(function(b){
    b.addEventListener("click", function(){
      var h = findHw(b.getAttribute("data-del-hw")); if(!h) return;
      confirmDialog("删除任务", "确定要删除《"+h.title+"》吗？删除后无法恢复。", "删除", function(){
        DB.homeworks = DB.homeworks.filter(function(x){ return x.id!==h.id; });
        if(DB.focusSession && DB.focusSession.kind==="hw" && DB.focusSession.id===h.id){ DB.focusSession=null; }
        saveDB(); renderHomework(); buildNav(); updateFocusBar();
        toast("任务已删除");
      });
    });
  });
}
function completeHomework(h, manual){
  h.done = true; h.doneAt = todayKey();
  addPoints(h.points, "完成任务《"+h.title+"》");
  saveDB(); renderHomework(); buildNav();
  toast("+"+h.points+" 分 · "+encourage());
}
function viewHomework(id){
  var h = findHw(id); if(!h) return;
  var st = hwStatus(h);
  var rows = [
    ["学科", h.subject], ["来源", h.source||"—"], ["年级", h.grade||"—"],
    ["截止日期", h.due+"（"+fmtRelDay(h.due)+"）"], ["计划用时", h.planMin+" 分钟"],
    ["实际用时", h.actualSec>0 ? fmtMin(h.actualSec) : "尚未开始"], ["完成积分", "+"+h.points+" 分"],
    ["状态", st.label]
  ];
  openModal('<h3>任务详情<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<div style="font-size:17px; font-weight:800; margin-bottom:10px;">'+esc(h.title)+'</div>'+
    rows.map(function(r){ return '<div class="kv"><span style="color:var(--ink-3)">'+r[0]+'</span><b>'+esc(r[1])+'</b></div>'; }).join("")+
    '<div class="modal-foot"><button class="btn btn-ghost" data-close>关闭</button>'+(h.done?"":'<button class="btn btn-primary" id="vFocus">开始专注</button>')+'</div>');
  bindCloseButtons();
  var fb = modalBox.querySelector("#vFocus");
  if(fb) fb.addEventListener("click", function(){ closeModal(); startFocus("hw", h.id); });
}
function homeworkForm(id){
  var h = id ? findHw(id) : null;
  var isNew = !h;
  h = h || { title:"", subject:"语文", source:"校内", grade:DB.student.grade, session:"", due:todayKey(), planMin:DB.student.pomodoro, points:5 };
  openModal('<h3>'+(isNew?"新增任务":"编辑任务")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<form id="hwForm"><div class="form-grid">'+
    '<div class="field full"><label for="hwTitle">任务名称 *</label><input id="hwTitle" maxlength="60" value="'+esc(h.title)+'" placeholder="如：实验班 U3 阅读理解"><span class="err">请填写任务名称</span></div>'+
    '<div class="field"><label for="hwSubject">学科</label><select id="hwSubject">'+stageSubjects().map(function(s){ return '<option'+(s===h.subject?" selected":"")+'>'+s+'</option>'; }).join("")+'</select></div>'+
    '<div class="field"><label for="hwSource">来源</label><select id="hwSource">'+SOURCES.map(function(s){ return '<option'+(s===h.source?" selected":"")+'>'+s+'</option>'; }).join("")+'</select></div>'+
    '<div class="field"><label for="hwSession">节次（可选）</label><input id="hwSession" maxlength="12" value="'+esc(h.session||"")+'" placeholder="如：第3节 / L5"></div>'+
    '<div class="field"><label for="hwDue">截止日期 *</label><input id="hwDue" type="date" value="'+h.due+'"><span class="err">请选择截止日期</span></div>'+
    '<div class="field"><label for="hwPlan">计划用时（分钟）*</label><input id="hwPlan" type="number" min="1" max="600" value="'+h.planMin+'"><span class="err">请填写 1~600 的分钟数</span></div>'+
    '<div class="field"><label for="hwPoints">完成积分</label><input id="hwPoints" type="number" min="0" max="100" value="'+h.points+'"><span class="hint">完成这项任务可获得的积分</span></div>'+
    '</div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">'+(isNew?"添加任务":"保存修改")+'</button></div></form>');
  bindCloseButtons();
  modalBox.querySelector("#hwForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var title = modalBox.querySelector("#hwTitle");
    var due = modalBox.querySelector("#hwDue");
    var plan = modalBox.querySelector("#hwPlan");
    var ok = true;
    [[title, title.value.trim().length>0],[due, !!due.value],[plan, +plan.value>=1 && +plan.value<=600]].forEach(function(pair){
      pair[0].closest(".field").classList.toggle("invalid", !pair[1]);
      if(!pair[1]) ok = false;
    });
    if(!ok) return;
    var data = {
      title: title.value.trim(),
      subject: modalBox.querySelector("#hwSubject").value,
      source: modalBox.querySelector("#hwSource").value,
      session: modalBox.querySelector("#hwSession").value.trim(),
      grade: DB.student.grade,
      due: due.value,
      planMin: Math.round(+plan.value),
      points: Math.max(0, Math.round(+modalBox.querySelector("#hwPoints").value||0))
    };
    if(isNew){
      data.id = uid(); data.actualSec = 0; data.done = false; data.doneAt = null; data.createdAt = todayKey();
      DB.homeworks.unshift(data);
      toast("任务已添加");
    } else {
      var old = findHw(id);
      Object.keys(data).forEach(function(k){ old[k] = data[k]; });
      toast("任务已更新");
    }
    saveDB(); closeModal(); renderHomework(); buildNav();
  });
}
document.getElementById("btnAddHw").addEventListener("click", function(){ homeworkForm(null); });
document.getElementById("btnTodayHw").addEventListener("click", function(){
  hwFilter.todayOnly = !hwFilter.todayOnly;
  if(hwFilter.todayOnly){ hwFilter.status = "全部"; }
  renderHomework();
});

/* ================================================================
   专注计时引擎（任务 / 打卡共用，刷新可恢复）
   会话：{kind, id, title, planSec, startedAt(ms), elapsedBefore(sec), running}
   ================================================================ */
var focusTick = null;
function sessionElapsed(s){
  var el = s.elapsedBefore||0;
  if(s.running && s.startedAt) el += (Date.now()-s.startedAt)/1000;
  return Math.floor(el);
}
function startFocus(kind, id){
  var title, planSec;
  if(kind==="hw"){
    var h = findHw(id); if(!h || h.done) return;
    title = h.title; planSec = h.planMin*60;
  } else {
    var c = DB.checks.filter(function(x){ return x.id===id; })[0];
    if(!c) return;
    title = c.name; planSec = Math.max(c.planMin,1)*60;
  }
  if(DB.focusSession){
    confirmDialog("已有专注进行中", "正在专注《"+DB.focusSession.title+"》，开始新的专注将放弃当前进度。确定切换吗？", "切换专注", function(){
      DB.focusSession = { kind:kind, id:id, title:title, planSec:planSec, startedAt:Date.now(), elapsedBefore:0, running:true };
      saveNow(); openFocusView(); updateFocusBar();
    });
    return;
  }
  DB.focusSession = { kind:kind, id:id, title:title, planSec:planSec, startedAt:Date.now(), elapsedBefore:0, running:true };
  saveNow();
  openFocusView();
  updateFocusBar();
}
function persistSessionTick(){
  var s = DB.focusSession; if(!s) return;
  if(s.running && s.startedAt){
    s.elapsedBefore = (s.elapsedBefore||0) + (Date.now()-s.startedAt)/1000;
    s.startedAt = Date.now();
  }
  saveNow();
}
/* ---------- 白噪音引擎（WebAudio 合成，零外部依赖） ---------- */
var _noise = { ctx:null, src:null, gain:null };
function stopNoise(){
  try{
    if(_noise.src){ _noise.src.stop(); _noise.src.disconnect(); }
    if(_noise.gain){ _noise.gain.disconnect(); }
    if(_noise.ctx && _noise.ctx.state==="running"){ _noise.ctx.suspend(); }
  }catch(e){}
  _noise.src = null; _noise.gain = null;
}
function startNoise(kind){
  stopNoise();
  if(!kind || kind==="off") return;
  try{
    if(!_noise.ctx) _noise.ctx = new (window.AudioContext||window.webkitAudioContext)();
    var ctx = _noise.ctx;
    if(ctx.state==="suspended") ctx.resume();
    var len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    var i, w, last = 0, b = [0,0,0,0,0,0,0];
    for(i=0;i<len;i++){
      w = Math.random()*2-1;
      if(kind==="white"){ d[i] = w*0.35; }
      else if(kind==="pink"){
        b[0]=0.99886*b[0]+w*0.0555179; b[1]=0.99332*b[1]+w*0.0750759; b[2]=0.96900*b[2]+w*0.1538520;
        b[3]=0.86650*b[3]+w*0.3104856; b[4]=0.55000*b[4]+w*0.5329522; b[5]=-0.7616*b[5]-w*0.0168980;
        d[i]=(b[0]+b[1]+b[2]+b[3]+b[4]+b[5]+b[6]+w*0.5362)*0.11; b[6]=w*0.115926;
      } else { last=(last+0.02*w)/1.02; d[i]=last*3.2; }
    }
    var src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    var gain = ctx.createGain(); gain.gain.value = 0.5;
    src.connect(gain); gain.connect(ctx.destination); src.start();
    _noise.src = src; _noise.gain = gain;
  }catch(e){ /* 设备不支持音频时静默跳过 */ }
}
function pauseResumeFocus(){
  var s = DB.focusSession; if(!s) return;
  if(s.running){
    s.elapsedBefore = sessionElapsed(s);
    s.running = false; s.startedAt = null;
  } else {
    s.running = true; s.startedAt = Date.now();
  }
  try{ if(_noise.ctx){ if(s.running) _noise.ctx.resume(); else _noise.ctx.suspend(); } }catch(e){}
  saveNow(); updateFocusBar(); refreshFocusView();
}
function finishFocus(){
  var s = DB.focusSession; if(!s) return;
  var elapsed = sessionElapsed(s);
  var keepSession = s;
  DB.focusSession = null;
  stopTick();
  closeModal();
  if(keepSession.kind==="hw"){
    var h = findHw(keepSession.id);
    if(h){
      h.actualSec = (h.actualSec||0) + elapsed;
      addFocusLog(elapsed);
      h.done = true; h.doneAt = todayKey();
      addPoints(h.points, "完成任务《"+h.title+"》（专注 "+fmtMin(elapsed)+"）");
      toast("专注 "+fmtMin(elapsed)+" · +"+h.points+" 分 · "+encourage(), 3400);
    }
  } else {
    var c = DB.checks.filter(function(x){ return x.id===keepSession.id; })[0];
    if(c){
      addFocusLog(elapsed);
      markCheckDone(c, elapsed, true);
    }
  }
  var fc = DB.student.focus || { rest:5, rounds:4 };
  DB.focusSessions.push({ day: todayKey(), title: keepSession.title, kind: keepSession.kind, sec: elapsed, at: Date.now() });
  if(DB.focusSessions.length > 300) DB.focusSessions = DB.focusSessions.slice(-300);
  stopNoise();
  var todayN = DB.focusSessions.filter(function(x){ return x.day===todayKey(); }).length;
  if(fc.rounds > 1 && todayN % fc.rounds === 0){
    setTimeout(function(){ toast("🎉 完成一轮 "+fc.rounds+" 个专注时段！起来走走，休息 "+fc.rest+" 分钟再回来。", 4200); }, 3600);
  } else if(fc.rest){
    setTimeout(function(){ toast("休息 "+fc.rest+" 分钟：喝口水、看看远处，眼睛也需要下课。", 3600); }, 3600);
  }
  saveNow();
  renderAll();
}
function giveUpFocus(){
  var s = DB.focusSession; if(!s) return;
  var elapsed = sessionElapsed(s);
  confirmDialog("放弃这次专注？", "本次已专注 "+fmtMin(elapsed)+"。放弃后这段时间不会计入记录。陪孩子复盘一下：是任务太难，还是环境太吵？找到原因，下次会更好。", "确认放弃", function(){
    DB.focusSession = null;
    stopTick(); stopNoise(); closeModal();
    saveNow(); updateFocusBar(); renderAll();
    toast("已放弃本次专注，没关系，调整好再来");
  });
}
function openFocusView(){
  var s = DB.focusSession; if(!s) return;
  openModal(
    '<div class="focus-view">'+
    '<div class="focus-task-sub">正在专注</div>'+
    '<div class="focus-task-name">'+esc(s.title)+'</div>'+
    '<div class="focus-task-sub">计划用时 '+Math.round(s.planSec/60)+' 分钟 · 时间到就是胜利，不必追求完美</div>'+
    '<div class="focus-ring-wrap"><svg width="250" height="250" viewBox="0 0 250 250"><circle cx="125" cy="125" r="108" fill="none" stroke="var(--line)" stroke-width="13"/><circle id="focusRing" cx="125" cy="125" r="108" fill="none" stroke="var(--primary)" stroke-width="13" stroke-linecap="round"/></svg>'+
    '<div class="focus-ring-center"><div class="focus-count" id="focusCount">00:00</div><div class="focus-elapsed-label">已专注</div><div class="focus-elapsed" id="focusElapsed">00:00</div></div></div>'+
    '<div class="focus-round" id="focusRound"></div>'+
    '<div class="noise-row"><span>背景音</span><div class="noise-btns" id="noiseBtns">'+
    [["off","关"],["white","白噪音"],["pink","粉噪音"],["brown","棕噪音"]].map(function(n){
      return '<button data-noise="'+n[0]+'" class="'+((DB.student.focus||{}).noise===n[0]?"on":"")+'">'+n[1]+'</button>';
    }).join("")+'</div></div>'+
    '<div class="focus-btns">'+
    '<button class="btn btn-ghost btn-lg" id="fPause">暂停</button>'+
    '<button class="btn btn-primary btn-lg" id="fFinish">完成任务</button>'+
    '<button class="btn btn-danger-soft btn-lg" id="fGiveUp">放弃</button></div>'+
    '<div class="focus-hint">把手机放远一点，深呼吸——这段时间只属于这一件事。</div></div>'
  );
  var rn = DB.focusSessions.filter(function(x){ return x.day===todayKey(); }).length + 1;
  document.getElementById("focusRound").textContent = "今日第 "+rn+" 个专注时段";
  modalBox.querySelector("#fPause").addEventListener("click", pauseResumeFocus);
  modalBox.querySelectorAll("[data-noise]").forEach(function(b){
    b.addEventListener("click", function(){
      var k = b.getAttribute("data-noise");
      DB.student.focus.noise = k; saveDB();
      modalBox.querySelectorAll("[data-noise]").forEach(function(x){ x.classList.toggle("on", x===b); });
      startNoise(k);
      toast(k==="off" ? "背景音已关闭" : "背景音："+b.textContent+"（循环播放）");
    });
  });
  startNoise((DB.student.focus||{}).noise || "off");
  modalBox.querySelector("#fFinish").addEventListener("click", finishFocus);
  modalBox.querySelector("#fGiveUp").addEventListener("click", giveUpFocus);
  startTick();
  refreshFocusView();
}
function refreshFocusView(){
  var s = DB.focusSession;
  var countEl = document.getElementById("focusCount");
  if(!s || !countEl) return;
  var elapsed = sessionElapsed(s);
  var remain = Math.max(0, s.planSec - elapsed);
  countEl.textContent = fmtClock(remain);
  document.getElementById("focusElapsed").textContent = fmtClock(elapsed);
  var ring = document.getElementById("focusRing");
  var C = 2*Math.PI*108;
  var frac = s.planSec>0 ? Math.min(1, elapsed/s.planSec) : 1;
  ring.setAttribute("stroke-dasharray", C);
  ring.setAttribute("stroke-dashoffset", C*(1-frac));
  ring.setAttribute("stroke", remain===0 ? "var(--green)" : "var(--primary)");
  var p = document.getElementById("fPause");
  if(p) p.textContent = s.running ? "暂停" : "继续";
}
function startTick(){
  stopTick();
  focusTick = setInterval(function(){
    refreshFocusView();
    updateFocusBar();
    persistSessionTick();
  }, 1000);
}
function stopTick(){ if(focusTick){ clearInterval(focusTick); focusTick = null; } }

/* 悬浮计时条 */
function updateFocusBar(){
  var bar = document.getElementById("focusBar");
  var s = DB.focusSession;
  if(!s){ bar.classList.remove("show"); if(!modalBox.querySelector(".focus-view")){ stopTick(); stopNoise(); } return; }
  bar.classList.add("show");
  document.getElementById("fbName").textContent = s.title;
  document.getElementById("fbTime").textContent = fmtClock(sessionElapsed(s));
  document.getElementById("fbToggle").textContent = s.running ? "暂停" : "继续";
  if(!focusTick) startTick();
}
document.getElementById("fbToggle").addEventListener("click", pauseResumeFocus);
document.getElementById("fbFinish").addEventListener("click", finishFocus);
document.getElementById("fbName").addEventListener("click", function(){ if(DB.focusSession) openFocusView(); });
document.getElementById("fbTime").addEventListener("click", function(){ if(DB.focusSession) openFocusView(); });
/* ================================================================
   专注打卡
   ================================================================ */
var checkTab = "全部";
var CHECK_CATS = ["全部","习惯","学科","数学","英语"];
function isCheckDoneToday(c){
  var arr = DB.checkDone[todayKey()]||[];
  return arr.indexOf(c.id)>=0;
}
function lastCheckLog(){ return DB._lastCheckSec || {}; }
function renderCheckin(){
  renderSleepCard();
  /* 本周日期条 */
  var t = todayKey();
  var now = new Date(); var mondayOffset = (now.getDay()+6)%7;
  var strip = document.getElementById("weekStrip");
  var html = "";
  for(var i=0;i<7;i++){
    var key = addDays(t, i-mondayOffset);
    var d = new Date(key.replace(/-/g,"/"));
    var done = (DB.checkDone[key]||[]).length;
    var marks = "";
    for(var m=0;m<Math.min(DB.checks.length,8);m++) marks += '<i class="'+(m<done?"done":"")+'"></i>';
    html += '<div class="week-day'+(key===t?" today":"")+'"><div class="wd">'+["一","二","三","四","五","六","日"][i]+'</div><div class="dn">'+d.getDate()+'</div><div class="marks">'+marks+'</div></div>';
  }
  strip.innerHTML = html;

  chipRow(document.getElementById("checkTabs"), CHECK_CATS, checkTab, function(v){ checkTab=v; renderCheckin(); });

  var list = DB.checks.filter(function(c){
    if(checkTab==="全部") return true;
    if(checkTab==="学科") return c.cat!=="习惯";
    return c.cat===checkTab;
  });
  var grid = document.getElementById("checkGrid");
  if(!list.length){
    grid.innerHTML = '<div class="card empty" style="grid-column:1/-1;"><div class="em">'+iconSvg("target",30)+'</div><p>这个分类下还没有打卡计划</p><span>从一个小而容易的习惯开始，比如“睡前阅读 10 分钟”。</span></div>';
    return;
  }
  var secLog = (DB.checkSecLog && DB.checkSecLog[t]) || {};
  grid.innerHTML = list.map(function(c){
    var done = isCheckDoneToday(c);
    var s = SUBJECTS[c.subject]||SUBJECTS["其他"];
    var actual = secLog[c.id]||0;
    var freqTag = c.freq==="工作日" ? "工作日" : "每天";
    var actions;
    if(done){
      actions = '<div class="check-done-note">'+iconSvg("check",15)+' 今日已完成'+(actual>0?" · 实际 "+fmtMin(actual):"")+'</div>';
    } else if(c.direct){
      actions = '<button class="btn btn-primary btn-sm" data-done-check="'+c.id+'">'+iconSvg("check",14)+' 打卡完成 +'+c.points+' 分</button>';
    } else {
      actions = '<button class="btn btn-primary btn-sm" data-focus-check="'+c.id+'">'+iconSvg("play",13)+' 开始计时</button>'+
                '<button class="btn btn-soft btn-sm" data-done-check="'+c.id+'">直接完成</button>';
    }
    actions += '<span style="flex:1"></span><button class="icon-btn" data-edit-check="'+c.id+'" aria-label="编辑计划">'+iconSvg("edit",15)+'</button><button class="icon-btn danger" data-del-check="'+c.id+'" aria-label="删除计划">'+iconSvg("trash",15)+'</button>';
    return '<div class="card check-card'+(done?" done":"")+'"><div class="check-top"><div class="check-ic" style="background:'+s.soft+'; color:'+s.color+';">'+checkIcon(c.icon)+'</div>'+
      '<div style="flex:1; min-width:0;"><div class="check-name">'+esc(c.name)+'</div><div class="check-freq">'+freqTag+' · '+esc(c.cat)+(c.direct?" · 打勾即完成":" · 专注计时")+'</div></div>'+
      (done?'<span class="status-pill st-done">已打卡</span>':'')+'</div>'+
      '<div class="check-times"><span>计划 <b>'+(c.planMin>0? c.planMin+" 分钟":"—")+'</b></span><span>实际 <b>'+(actual>0? fmtMin(actual):"未开始")+'</b></span><span class="pts">+'+c.points+' 分</span></div>'+
      '<div class="check-actions">'+actions+'</div></div>';
  }).join("");
  grid.querySelectorAll("[data-focus-check]").forEach(function(b){
    b.addEventListener("click", function(){ startFocus("check", b.getAttribute("data-focus-check")); });
  });
  grid.querySelectorAll("[data-done-check]").forEach(function(b){
    b.addEventListener("click", function(){
      var c = DB.checks.filter(function(x){ return x.id===b.getAttribute("data-done-check"); })[0];
      if(c) markCheckDone(c, 0, false);
    });
  });
  grid.querySelectorAll("[data-edit-check]").forEach(function(b){
    b.addEventListener("click", function(){ checkForm(b.getAttribute("data-edit-check")); });
  });
  grid.querySelectorAll("[data-del-check]").forEach(function(b){
    b.addEventListener("click", function(){
      var c = DB.checks.filter(function(x){ return x.id===b.getAttribute("data-del-check"); })[0];
      if(!c) return;
      confirmDialog("删除打卡计划", "确定要删除《"+c.name+"》吗？历史打卡记录会保留在统计中。", "删除", function(){
        DB.checks = DB.checks.filter(function(x){ return x.id!==c.id; });
        saveDB(); renderCheckin(); toast("打卡计划已删除");
      });
    });
  });
}
function markCheckDone(c, actualSec, fromFocus){
  var t = todayKey();
  var arr = DB.checkDone[t] = DB.checkDone[t]||[];
  if(arr.indexOf(c.id)<0) arr.push(c.id);
  if(actualSec>0){
    DB.checkSecLog = DB.checkSecLog||{};
    DB.checkSecLog[t] = DB.checkSecLog[t]||{};
    DB.checkSecLog[t][c.id] = (DB.checkSecLog[t][c.id]||0) + actualSec;
  }
  addPoints(c.points, "完成打卡《"+c.name+"》"+(fromFocus?"（专注 "+fmtMin(actualSec)+"）":""));
  saveDB();
  toast("打卡成功 · +"+c.points+" 分 · "+encourage(), 3000);
  if(currentPage==="checkin") renderCheckin();
  buildNav();
}
function checkForm(id){
  var c = id ? DB.checks.filter(function(x){ return x.id===id; })[0] : null;
  var isNew = !c;
  c = c || { name:"", cat:"习惯", subject:"其他", freq:"每天", planMin:15, points:3, direct:false, icon:"target" };
  openModal('<h3>'+(isNew?"新增打卡计划":"编辑打卡计划")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<form id="checkForm"><div class="form-grid">'+
    '<div class="field full"><label for="ckName">计划名称 *</label><input id="ckName" maxlength="40" value="'+esc(c.name)+'" placeholder="如：睡前阅读"><span class="err">请填写计划名称</span></div>'+
    '<div class="field"><label for="ckCat">分类</label><select id="ckCat">'+["习惯","数学","英语"].concat(["语文","科学","体育"]).map(function(x){ return '<option'+(x===c.cat?" selected":"")+'>'+x+'</option>'; }).join("")+'</select></div>'+
    '<div class="field"><label for="ckSubject">学科</label><select id="ckSubject">'+stageSubjects().map(function(s){ return '<option'+(s===c.subject?" selected":"")+'>'+s+'</option>'; }).join("")+'</select></div>'+
    '<div class="field"><label for="ckFreq">频率</label><select id="ckFreq"><option'+(c.freq==="每天"?" selected":"")+'>每天</option><option'+(c.freq==="工作日"?" selected":"")+'>工作日</option></select></div>'+
    '<div class="field"><label for="ckPlan">计划用时（分钟）</label><input id="ckPlan" type="number" min="0" max="600" value="'+c.planMin+'"><span class="hint">填 0 表示无需计时、打勾即完成</span></div>'+
    '<div class="field"><label for="ckPoints">完成积分</label><input id="ckPoints" type="number" min="0" max="100" value="'+c.points+'"></div>'+
    '</div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">'+(isNew?"添加计划":"保存修改")+'</button></div></form>');
  bindCloseButtons();
  modalBox.querySelector("#checkForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var name = modalBox.querySelector("#ckName");
    if(!name.value.trim()){ name.closest(".field").classList.add("invalid"); return; }
    var plan = Math.max(0, Math.round(+modalBox.querySelector("#ckPlan").value||0));
    var data = {
      name: name.value.trim(),
      cat: modalBox.querySelector("#ckCat").value,
      subject: modalBox.querySelector("#ckSubject").value,
      freq: modalBox.querySelector("#ckFreq").value,
      planMin: plan,
      points: Math.max(0, Math.round(+modalBox.querySelector("#ckPoints").value||0)),
      direct: plan===0
    };
    if(isNew){ data.id = uid(); data.icon = "target"; DB.checks.push(data); toast("打卡计划已添加"); }
    else { var old = DB.checks.filter(function(x){ return x.id===id; })[0]; Object.keys(data).forEach(function(k){ old[k]=data[k]; }); toast("打卡计划已更新"); }
    saveDB(); closeModal(); renderCheckin();
  });
}
document.getElementById("btnAddCheck").addEventListener("click", function(){ checkForm(null); });
document.getElementById("btnAddExercise").addEventListener("click", function(){ ensureExerciseCheck(); });

/* ================================================================
   课程表
   ================================================================ */
var weekOffset = 0; /* 相对本周的周数偏移 */
function termWeekNum(key){
  /* 返回该日期是本学期第几周（需设置学期开始日期），未设置返回 null */
  var ts = DB.settings.termStart;
  if(!ts) return null;
  var d = diffDays(ts, key);
  if(d < 0) return null;
  return Math.floor(d/7)+1;
}
function courseVisibleOn(c, key){
  if(c.suspended) return true; /* 停课仍显示，由样式区分 */
  var wn = termWeekNum(key);
  if(wn && c.oddEven==="单周" && wn%2===0) return false;
  if(wn && c.oddEven==="双周" && wn%2===1) return false;
  return true;
}
function courseOnLeave(c, key){ return (c.leave||[]).indexOf(key) >= 0; }
function weekMonday(offset){
  var now = new Date();
  var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay()+6)%7) + offset*7);
  return d;
}
function renderSchedule(){
  document.getElementById("toggleSchool").checked = !!DB.settings.showSchool;
  var monday = weekMonday(weekOffset);
  var sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
  var wn = termWeekNum(dateKey(monday));
  document.getElementById("weekRange").textContent =
    (monday.getMonth()+1)+"月"+monday.getDate()+"日 – "+(sunday.getMonth()+1)+"月"+sunday.getDate()+"日"+(weekOffset===0?"（本周）":"")+(wn?(" · 第 "+wn+" 周"):"");
  var tt = document.getElementById("timetable");
  var t = todayKey();
  var html = "";
  for(var i=0;i<7;i++){
    var d = new Date(monday); d.setDate(monday.getDate()+i);
    var key = dateKey(d);
    var wd = d.getDay();
    var isToday = key===t;
    var holiday = (wd===0||wd===6) && DB.settings.showSchool ? "周末" : "";
    var dayCourses = DB.courses.filter(function(c){
      if(c.weekday!==wd) return false;
      if(c.school && !DB.settings.showSchool) return false;
      if(!courseVisibleOn(c, key)) return false;
      return true;
    }).sort(function(a,b){ return a.start<b.start?-1:1; });
    var blocks = dayCourses.length ? dayCourses.map(function(c){
      var s = SUBJECTS[c.subject]||SUBJECTS["其他"];
      var onLeave = courseOnLeave(c, key);
      var meta = c.mode+(c.place?" · "+esc(c.place):"")+(c.teacher?" · "+esc(c.teacher):"")+(c.replay?" · 可回放":"")+(c.oddEven && c.oddEven!=="每周"?" · "+c.oddEven:"");
      return '<div class="tt-course'+(c.suspended?" suspended":"")+(onLeave?" on-leave":"")+'" data-course="'+c.id+'" style="background:'+s.soft+'; color:'+s.color+'; border-color:'+s.color+'33;">'+
        (c.suspended?'<span class="susp-tag">停课</span>':"")+
        (onLeave?'<span class="leave-tag">请假</span>':"")+
        '<div class="cn">'+esc(c.name)+'</div><div class="ct">'+c.start+"–"+c.end+'</div><div class="cm">'+meta+'</div>'+
        (!c.suspended?'<button class="leave-btn" data-leave="'+c.id+':'+key+'">'+(onLeave?"销假":"请假")+'</button>':"")+'</div>';
    }).join("") : '<div class="tt-empty">无课程安排</div>';
    html += '<div class="tt-day'+(isToday?" today":"")+'"><div class="tt-day-head"><div class="wd">'+["周一","周二","周三","周四","周五","周六","周日"][i]+'</div><div class="dn">'+d.getDate()+'</div>'+(holiday?'<span class="holiday-tag">'+holiday+'</span>':"")+'</div>'+blocks+'</div>';
  }
  tt.innerHTML = html;
  tt.querySelectorAll("[data-leave]").forEach(function(b){
    b.addEventListener("click", function(ev){
      ev.stopPropagation();
      var parts = b.getAttribute("data-leave").split(":");
      var c = DB.courses.filter(function(x){ return x.id===parts[0]; })[0];
      if(!c) return;
      c.leave = c.leave || [];
      var i = c.leave.indexOf(parts[1]);
      if(i>=0){ c.leave.splice(i,1); toast("已销假"); } else { c.leave.push(parts[1]); toast("已请假："+c.name+"（"+parts[1].slice(5).replace("-","/")+"）"); }
      saveDB(); renderSchedule();
    });
  });
  tt.querySelectorAll("[data-course]").forEach(function(el){
    el.addEventListener("click", function(){ courseForm(el.getAttribute("data-course")); });
  });
}
document.getElementById("btnPrevWeek").addEventListener("click", function(){ weekOffset--; renderSchedule(); });
document.getElementById("btnNextWeek").addEventListener("click", function(){ weekOffset++; renderSchedule(); });
document.getElementById("btnThisWeek").addEventListener("click", function(){ weekOffset=0; renderSchedule(); });
document.getElementById("toggleSchool").addEventListener("change", function(e){
  DB.settings.showSchool = e.target.checked; saveDB(); renderSchedule();
});
function courseForm(id){
  var c = id ? DB.courses.filter(function(x){ return x.id===id; })[0] : null;
  var isNew = !c;
  c = c || { name:"", weekday:1, start:"16:00", end:"17:00", mode:"线下", place:"", teacher:"", replay:false, school:false, subject:"其他", suspended:false, oddEven:"每周", leave:[] };
  var wds = ["周日","周一","周二","周三","周四","周五","周六"];
  openModal('<h3>'+(isNew?"新增课程":"编辑课程")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<form id="courseForm"><div class="form-grid">'+
    '<div class="field full"><label for="csName">课程名称 *</label><input id="csName" maxlength="40" value="'+esc(c.name)+'" placeholder="如：数学思维 S 班"><span class="err">请填写课程名称</span></div>'+
    '<div class="field"><label for="csWeekday">星期</label><select id="csWeekday">'+wds.map(function(w,i){ return '<option value="'+i+'"'+(i===c.weekday?" selected":"")+'>'+w+'</option>'; }).join("")+'</select></div>'+
    '<div class="field"><label for="csSubject">学科</label><select id="csSubject">'+stageSubjects().map(function(s){ return '<option'+(s===c.subject?" selected":"")+'>'+s+'</option>'; }).join("")+'</select></div>'+
    '<div class="field"><label for="csStart">开始时间</label><input id="csStart" type="time" value="'+c.start+'"></div>'+
    '<div class="field"><label for="csEnd">结束时间</label><input id="csEnd" type="time" value="'+c.end+'"><span class="err">结束时间需晚于开始时间</span></div>'+
    '<div class="field"><label for="csMode">上课形式</label><select id="csMode"><option'+(c.mode==="线上"?" selected":"")+'>线上</option><option'+(c.mode==="线下"?" selected":"")+'>线下</option></select></div>'+
    '<div class="field"><label for="csOddEven">重复</label><select id="csOddEven">'+["每周","单周","双周"].map(function(x){ return "<option"+(x===(c.oddEven||"每周")?" selected":"")+">"+x+"</option>"; }).join("")+'</select></div>'+
    '<div class="field"><label for="csPlace">地点（可选）</label><input id="csPlace" maxlength="30" value="'+esc(c.place||"")+'" placeholder="如：黄龙世纪广场 B 座"></div>'+
    '<div class="field"><label for="csTeacher">老师（可选）</label><input id="csTeacher" maxlength="20" value="'+esc(c.teacher||"")+'"></div>'+
    '<div class="field"><label>选项</label><div style="display:flex; gap:14px; flex-wrap:wrap; padding-top:8px;">'+
    '<label class="switch"><input type="checkbox" id="csReplay"'+(c.replay?" checked":"")+'><span class="track"></span>可回放</label>'+
    '<label class="switch"><input type="checkbox" id="csSchool"'+(c.school?" checked":"")+'><span class="track"></span>校内课</label>'+
    '<label class="switch"><input type="checkbox" id="csSusp"'+(c.suspended?" checked":"")+'><span class="track"></span>停课</label>'+
    '</div></div>'+
    '</div><div class="modal-foot">'+(isNew?"":'<button type="button" class="btn btn-danger-soft" id="csDelete" style="margin-right:auto;">删除课程</button>')+'<button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">'+(isNew?"添加课程":"保存修改")+'</button></div></form>');
  bindCloseButtons();
  var del = modalBox.querySelector("#csDelete");
  if(del) del.addEventListener("click", function(){
    confirmDialog("删除课程", "确定要删除《"+c.name+"》吗？", "删除", function(){
      DB.courses = DB.courses.filter(function(x){ return x.id!==c.id; });
      saveDB(); renderSchedule(); toast("课程已删除");
    });
  });
  modalBox.querySelector("#courseForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var name = modalBox.querySelector("#csName");
    var endF = modalBox.querySelector("#csEnd").closest(".field");
    var start = modalBox.querySelector("#csStart").value, end = modalBox.querySelector("#csEnd").value;
    var ok = true;
    name.closest(".field").classList.toggle("invalid", !name.value.trim());
    if(!name.value.trim()) ok = false;
    endF.classList.toggle("invalid", !(start && end && end>start));
    if(!(start && end && end>start)) ok = false;
    if(!ok) return;
    var data = {
      name: name.value.trim(),
      weekday: +modalBox.querySelector("#csWeekday").value,
      subject: modalBox.querySelector("#csSubject").value,
      start: start, end: end,
      mode: modalBox.querySelector("#csMode").value,
      oddEven: modalBox.querySelector("#csOddEven").value,
      place: modalBox.querySelector("#csPlace").value.trim(),
      teacher: modalBox.querySelector("#csTeacher").value.trim(),
      replay: modalBox.querySelector("#csReplay").checked,
      school: modalBox.querySelector("#csSchool").checked,
      suspended: modalBox.querySelector("#csSusp").checked
    };
    if(isNew){ data.id = uid(); DB.courses.push(data); toast("课程已添加"); }
    else { var old = DB.courses.filter(function(x){ return x.id===id; })[0]; Object.keys(data).forEach(function(k){ old[k]=data[k]; }); toast("课程已更新"); }
    saveDB(); closeModal(); renderSchedule();
  });
}
document.getElementById("btnAddCourse").addEventListener("click", function(){ courseForm(null); });

/* ================================================================
   错题本（艾宾浩斯复习）
   ================================================================ */
/* ================================================================
   积分中心
   ================================================================ */
var REWARD_ICONS = ["gift","film","book","bike","star","sun"];
function renderPoints(){
  document.getElementById("pointsNum").textContent = DB.points;
  var rg = document.getElementById("rewardGrid");
  if(!DB.rewards.length){
    rg.innerHTML = '<div class="empty" style="padding:22px 8px;"><p>还没有奖励</p><span>和孩子一起商量一个他真正想要的奖励吧。</span></div>';
  } else {
    rg.innerHTML = DB.rewards.map(function(r){
      var afford = DB.points >= r.cost;
      return '<div class="card reward-card" style="padding:16px; box-shadow:none;">'+
        '<div class="check-ic" style="background:var(--gold-soft); color:#9A6B12;">'+iconSvg(r.icon||"gift",21)+'</div>'+
        '<div class="r-name">'+esc(r.name)+'</div><div class="r-cost">'+r.cost+' 分'+(afford?"":" · 还差 "+(r.cost-DB.points)+" 分")+'</div>'+
        '<div style="display:flex; gap:6px; margin-top:12px; flex-wrap:wrap;">'+
        '<button class="btn '+(afford?"btn-primary":"btn-ghost")+' btn-sm" data-redeem="'+r.id+'"'+(afford?"":" disabled")+'>兑换</button>'+
        '<button class="icon-btn" data-edit-reward="'+r.id+'" aria-label="编辑奖励">'+iconSvg("edit",15)+'</button>'+
        '<button class="icon-btn danger" data-del-reward="'+r.id+'" aria-label="删除奖励">'+iconSvg("trash",15)+'</button></div></div>';
    }).join("");
  }
  rg.querySelectorAll("[data-redeem]").forEach(function(b){
    b.addEventListener("click", function(){
      var r = DB.rewards.filter(function(x){ return x.id===b.getAttribute("data-redeem"); })[0];
      if(!r || DB.points < r.cost) return;
      confirmDialog("兑换奖励", "用 "+r.cost+" 分兑换《"+r.name+"》吗？记得兑现承诺，这是积分制度最珍贵的部分。", "确认兑换", function(){
        addPoints(-r.cost, "兑换奖励《"+r.name+"》");
        saveDB(); renderPoints();
        toast("兑换成功！去享受《"+r.name+"》吧");
      });
    });
  });
  rg.querySelectorAll("[data-edit-reward]").forEach(function(b){
    b.addEventListener("click", function(){ rewardForm(b.getAttribute("data-edit-reward")); });
  });
  rg.querySelectorAll("[data-del-reward]").forEach(function(b){
    b.addEventListener("click", function(){
      var r = DB.rewards.filter(function(x){ return x.id===b.getAttribute("data-del-reward"); })[0];
      if(!r) return;
      confirmDialog("删除奖励", "确定要删除奖励《"+r.name+"》吗？", "删除", function(){
        DB.rewards = DB.rewards.filter(function(x){ return x.id!==r.id; });
        saveDB(); renderPoints(); toast("奖励已删除");
      });
    });
  });

  var ll = document.getElementById("ledgerList");
  if(!DB.ledger.length){
    ll.innerHTML = '<div class="empty" style="padding:22px 8px;"><p>还没有积分记录</p><span>完成第一项任务或打卡，积分就会动起来。</span></div>';
  } else {
    ll.innerHTML = DB.ledger.slice(0,30).map(function(l){
      return '<div class="ledger-row"><span class="why">'+esc(l.why)+'</span><span class="when">'+l.day.slice(5).replace("-","/")+'</span><span class="ledger-amt '+(l.amt>=0?"plus":"minus")+'">'+(l.amt>=0?"+":"")+l.amt+' 分</span></div>';
    }).join("");
  }
}
function rewardForm(id){
  var r = id ? DB.rewards.filter(function(x){ return x.id===id; })[0] : null;
  var isNew = !r;
  r = r || { name:"", cost:50, icon:"gift" };
  openModal('<h3>'+(isNew?"新增奖励":"编辑奖励")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<form id="rewardForm"><div class="form-grid">'+
    '<div class="field full"><label for="rwName">奖励名称 *</label><input id="rwName" maxlength="40" value="'+esc(r.name)+'" placeholder="如：周末去动物园"><span class="err">请填写奖励名称</span></div>'+
    '<div class="field"><label for="rwCost">所需积分</label><input id="rwCost" type="number" min="1" max="9999" value="'+r.cost+'"></div>'+
    '<div class="field"><label for="rwIcon">图标</label><select id="rwIcon">'+REWARD_ICONS.map(function(ic){ return '<option value="'+ic+'"'+(ic===r.icon?" selected":"")+'>'+ic+'</option>'; }).join("")+'</select></div>'+
    '</div><p style="font-size:12.5px; color:var(--ink-3); margin-top:10px;">小贴士：最好的奖励是“体验”（一起做某件事），其次才是物品——陪伴感才是孩子最想要的。</p>'+
    '<div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">'+(isNew?"添加奖励":"保存修改")+'</button></div></form>');
  bindCloseButtons();
  modalBox.querySelector("#rewardForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    var name = modalBox.querySelector("#rwName");
    if(!name.value.trim()){ name.closest(".field").classList.add("invalid"); return; }
    var cost = Math.max(1, Math.round(+modalBox.querySelector("#rwCost").value||1));
    if(isNew){ DB.rewards.push({ id:uid(), name:name.value.trim(), cost:cost, icon:modalBox.querySelector("#rwIcon").value }); toast("奖励已添加"); }
    else {
      var old = DB.rewards.filter(function(x){ return x.id===id; })[0];
      old.name = name.value.trim(); old.cost = cost; old.icon = modalBox.querySelector("#rwIcon").value;
      toast("奖励已更新");
    }
    saveDB(); closeModal(); renderPoints();
  });
}
document.getElementById("btnAddReward").addEventListener("click", function(){ rewardForm(null); });

/* ================================================================
   成长报告
   ================================================================ */
function weekStats(){
  var days = last7Days(); /* 近 7 天（含今天） */
  var inWeek = function(key){ return days.indexOf(key)>=0; };
  var doneHw = DB.homeworks.filter(function(h){ return h.done && h.doneAt && inWeek(h.doneAt); }).length;
  var totalDue = DB.homeworks.filter(function(h){ return inWeek(h.due); }).length;
  var doneDue = DB.homeworks.filter(function(h){ return inWeek(h.due) && h.done; }).length;
  var focusSec = days.reduce(function(s,d){ return s+(DB.focusLog[d]||0); }, 0);
  var pointsGain = DB.ledger.filter(function(l){ return inWeek(l.day) && l.amt>0; }).reduce(function(s,l){ return s+l.amt; }, 0);
  var pointsSpend = DB.ledger.filter(function(l){ return inWeek(l.day) && l.amt<0; }).reduce(function(s,l){ return s-l.amt; }, 0);
  var checksDone = days.reduce(function(s,d){ return s+((DB.checkDone[d]||[]).length); }, 0);
  var quiz = DB.quizResults.filter(function(r){ return inWeek(r.day); });
  var quizAvg = quiz.length ? Math.round(quiz.reduce(function(a,r){ return a+r.correct/r.total; },0)/quiz.length*100) : null;
  var reviewDone = days.reduce(function(s2,d){ return s2+((DB.reviewLog[d]||{}).done||0); }, 0);
  var goalsDone = DB.goals.filter(function(g){ return g.done; }).length;
  return { days:days, doneHw:doneHw, totalDue:totalDue, doneDue:doneDue, focusSec:focusSec, pointsGain:pointsGain, pointsSpend:pointsSpend, checksDone:checksDone, quizN:quiz.length, quizAvg:quizAvg, reviewDone:reviewDone, goalsDone:goalsDone };
}
function renderQuizTrendChart(){
  var qByDay = {};
  DB.quizResults.forEach(function(r){ (qByDay[r.day] = qByDay[r.day] || []).push(r); });
  var qDays = Object.keys(qByDay).sort().slice(-14);
  var qc = document.getElementById("reportQuizChart");
  if(!qc) return;
  if(!qDays.length){
    var qctx = qc.getContext("2d"); qctx.clearRect(0,0,qc.width,qc.height);
    qctx.font = "13px sans-serif"; qctx.fillStyle = cssVar("--ink-3");
    qctx.textAlign = "center"; qctx.fillText("还没有自测记录，去自测页组一套卷子吧。", qc.width/2, qc.height/2);
  } else {
    drawLineChart(qc, qDays.map(function(d){
      var arr = qByDay[d];
      return Math.round(arr.reduce(function(a,r){ return a+r.correct/r.total; },0)/arr.length*100);
    }), qDays.map(function(d){ return d.slice(5).replace("-","/"); }));
  }
}
function renderReviewBarChart(st){
  var el = document.getElementById("reportReviewChart");
  if(!el) return;
  drawBarChart(el, st.days.map(function(d){ return (DB.reviewLog[d]||{}).done||0; }), st.days.map(dayShort), "项");
}
function last30Days(){
  var arr = []; var t = todayKey();
  for(var i=29;i>=0;i--) arr.push(addDays(t,-i));
  return arr;
}
function buildReportText(range){
  var days = range==="month" ? last30Days() : last7Days();
  var label = range==="month" ? "月报" : "周报";
  var from = days[0].slice(5).replace("-","/"), to = days[days.length-1].slice(5).replace("-","/");
  var inR = function(key){ return days.indexOf(key)>=0; };
  var doneDue = DB.homeworks.filter(function(h){ return inR(h.due) && h.done; }).length;
  var totalDue = DB.homeworks.filter(function(h){ return inR(h.due); }).length;
  var focusMin = Math.round(days.reduce(function(a,d){ return a+(DB.focusLog[d]||0); },0)/60);
  var pts = DB.ledger.filter(function(l){ return inR(l.day) && l.amt>0; }).reduce(function(a,l){ return a+l.amt; },0);
  var quiz = DB.quizResults.filter(function(r){ return inR(r.day); });
  var qAvg = quiz.length ? Math.round(quiz.reduce(function(a,r){ return a+r.correct/r.total; },0)/quiz.length*100)+"%" : "暂无";
  var rev = days.reduce(function(a,d){ return a+((DB.reviewLog[d]||{}).done||0); },0);
  var rate = totalDue ? Math.round(doneDue/totalDue*100)+"%" : "—";
  var L = [];
  L.push("【学航助手 · 学习"+label+"】"+from+" – "+to);
  L.push("学习者：" + (DB.student.name||"") + "（" + (DB.student.stage||"") + (DB.student.grade||"") + "）");
  L.push("");
  L.push("任务：到期 "+totalDue+" 项，完成 "+doneDue+" 项，完成率 "+rate);
  L.push("专注：累计 "+fmtMin(focusMin*60)+"（日均 "+(days.length?Math.round(focusMin/days.length):0)+" 分钟）");
  L.push("复习：完成 "+rev+" 项次");
  L.push("自测："+quiz.length+" 次"+(quiz.length?"，平均正确率 "+qAvg:""));
  L.push("积分：+"+pts+" 分（余额 "+DB.points+"）");
  L.push("");
  L.push("本"+(range==="month"?"月":"周")+"一句话："+(focusMin>0 ? "坚持本身就是答案，继续保持这份节奏。" : "万事开头难，先从每天一个 25 分钟专注开始。"));
  return L.join("\n");
}
function openReportText(){
  openModal('<h3>学习报告<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<div style="display:flex; gap:8px; margin-bottom:12px;">'+
    '<button class="btn btn-soft btn-sm" id="rpWeek">生成周报</button>'+
    '<button class="btn btn-soft btn-sm" id="rpMonth">生成月报</button>'+
    '<button class="btn btn-primary btn-sm" id="rpCopy">复制文本</button></div>'+
    '<textarea id="rpText" rows="14" style="width:100%; font-size:13.5px; line-height:1.7; border:1.5px solid var(--line-2); border-radius:12px; padding:12px;" readonly></textarea>'+
    '<p style="font-size:12.5px; color:var(--ink-3); margin-top:8px;">复制后可发到家庭群，和家人一起见证进步。</p>');
  bindCloseButtons();
  var ta = document.getElementById("rpText");
  ta.value = buildReportText("week");
  document.getElementById("rpWeek").addEventListener("click", function(){ ta.value = buildReportText("week"); });
  document.getElementById("rpMonth").addEventListener("click", function(){ ta.value = buildReportText("month"); });
  document.getElementById("rpCopy").addEventListener("click", function(){
    function done(){ toast("报告已复制，去家庭群分享吧"); }
    function fallback(){
      ta.removeAttribute("readonly"); ta.select();
      try{ document.execCommand("copy"); done(); }catch(e){ toast("复制失败，请手动长按复制"); }
      ta.setAttribute("readonly","");
    }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(ta.value).then(done, function(){ fallback(); });
    } else fallback();
  });
}
function renderSettings(){
  document.getElementById("setName").value = DB.student.name||"";
  document.getElementById("setGrade").value = DB.student.grade||"";
  var ff = DB.student.focus || { rest:5, rounds:4, noise:"off" };
  if(document.getElementById("setRest")){ document.getElementById("setRest").value = ff.rest; document.getElementById("setRounds").value = ff.rounds; document.getElementById("setNoise").value = ff.noise; }
  applyTheme();
  renderTemplates();
  document.getElementById("setStage").innerHTML = STAGES.map(function(x){
    return "<option"+(x===(DB.student.stage||"小学")?" selected":"")+">"+x+"</option>";
  }).join("");
  document.getElementById("setTerm").value = DB.student.term||"";
  document.getElementById("setPomodoro").value = DB.student.pomodoro||25;
  document.getElementById("setTermStart").value = DB.settings.termStart||"";
  document.getElementById("sideStudent").textContent = (DB.student.name||"小航")+"同学";
  document.getElementById("sideMeta").textContent = "家长模式 · 管理员 · "+(DB.student.grade||"")+" "+(DB.student.term||"");
}
document.getElementById("btnAddGoal").addEventListener("click", function(){ goalForm(null); });
(function initFocusForm(){
  var f = DB.student.focus || { rest:5, rounds:4, noise:"off" };
  document.getElementById("setRest").value = f.rest;
  document.getElementById("setRounds").value = f.rounds;
  document.getElementById("setNoise").value = f.noise;
  document.getElementById("focusForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    DB.student.focus.rest = Math.min(60, Math.max(0, Math.round(+document.getElementById("setRest").value||0)));
    DB.student.focus.rounds = Math.min(12, Math.max(1, Math.round(+document.getElementById("setRounds").value||4)));
    DB.student.focus.noise = document.getElementById("setNoise").value;
    saveDB(); toast("专注设置已保存");
  });
})();
document.getElementById("studentForm").addEventListener("submit", function(ev){
  ev.preventDefault();
  var name = document.getElementById("setName").value.trim();
  if(name) DB.student.name = name;
  DB.student.grade = document.getElementById("setGrade").value.trim();
  DB.student.stage = document.getElementById("setStage").value || "小学";
  DB.student.term = document.getElementById("setTerm").value.trim() || DB.student.term;
  DB.settings.termStart = document.getElementById("setTermStart").value || "";
  var pom = Math.min(120, Math.max(5, Math.round(+document.getElementById("setPomodoro").value||25)));
  DB.student.pomodoro = pom;
  saveDB(); renderAll(); renderSettings();
  toast("设置已保存，学科体系已切换为「"+DB.student.stage+"」");
});
document.getElementById("btnExport").addEventListener("click", function(){
  saveNow();
  var blob = new Blob([JSON.stringify(DB, null, 2)], { type:"application/json" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "学航助手备份_"+todayKey()+".json";
  DB.settings.lastExport = todayKey(); saveDB();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){ URL.revokeObjectURL(a.href); }, 2000);
  toast("备份已导出，请妥善保存这个 JSON 文件");
});
document.getElementById("btnImport").addEventListener("click", function(){
  document.getElementById("importFile").click();
});
document.getElementById("importFile").addEventListener("change", function(ev){
  var file = ev.target.files[0];
  if(!file) return;
  var reader = new FileReader();
  reader.onload = function(){
    try{
      var parsed = JSON.parse(reader.result);
      if(!parsed || typeof parsed!=="object" || !("homeworks" in parsed)) throw new Error("bad");
      confirmDialog("导入备份", "导入将覆盖当前全部数据，确定继续吗？", "导入并覆盖", function(){
        DB = migrate(parsed);
        saveNow(); renderAll(); renderSettings();
        toast("导入成功，数据已恢复");
      });
    }catch(e){
      toast("导入失败：文件格式不正确，请选择由本系统导出的 JSON");
    }
    ev.target.value = "";
  };
  reader.readAsText(file);
});
document.getElementById("btnReset").addEventListener("click", function(){
  confirmDialog("清空并重置", "将删除全部数据并恢复为初始演示数据，当前记录不可恢复。确定继续吗？", "清空重置", function(){
    DB = seedDB(DB.student.stage);
    saveNow(); renderAll(); renderSettings();
    toast("已恢复为初始演示数据");
  });
});



/* ================================================================
   初始化
   ================================================================ */
function init(){
  applyTheme();
  buildNav();
  document.querySelectorAll(".page").forEach(function(p){ p.classList.remove("active"); });
  document.getElementById("page-home").classList.add("active");
  currentPage = "home";
  buildNav();
  renderSettings();
  renderHome();
  updateFocusBar(); /* 刷新恢复：若会话存在，悬浮条 + 每秒节流保存自动接管 */
  if(!DB.settings.guided){ setTimeout(showGuide, 600); }
  var le = DB.settings.lastExport;
  if(le && diffDays(le, todayKey()) > 30){
    setTimeout(function(){ toast("超过 30 天没备份了，去「设置」导出一份 JSON 存好，数据安全第一。", 5000); }, 2500);
  }
  window.addEventListener("beforeunload", function(){ persistSessionTick(); saveNow(); });
  document.addEventListener("visibilitychange", function(){
    if(document.visibilityState==="hidden"){ persistSessionTick(); saveNow(); }
  });
}
init();