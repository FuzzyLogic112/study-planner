/* ================================================================
   学航助手 · 功能模块（第2-12轮）
   说明：本文件先于 app.js 加载；仅含函数/变量声明与 DOM 就绪后的绑定，
   运行时依赖 app.js 提供的核心函数（openModal、todayKey、DB 等）。
   ================================================================ */
var reviewKindTab = "全部", reviewTab = "全部";
var REVIEW_KINDS = ["错题","单词","知识点","素材"];
var REVIEW_KIND_STYLE = {
  "错题": { color:"#E0524D", soft:"#FDEBEA" },
  "单词": { color:"#3B82F6", soft:"#E7F0FE" },
  "知识点": { color:"#8B5CF6", soft:"#EFE9FE" },
  "素材": { color:"#F59E0B", soft:"#FEF3C7" }
};
/* 旧错题数据一次性迁移到新复习库 */
function ensureReviewsMigrated(){
  if(DB._reviewsMigrated) return;
  DB._reviewsMigrated = true;
  if((!DB.reviews || !DB.reviews.length) && DB.mistakes && DB.mistakes.length){
    DB.reviews = DB.mistakes.map(function(m){
      var iv = EBBINGHAUS[Math.min(m.stage||0, EBBINGHAUS.length-1)] || 1;
      return { id:m.id, kind:"错题", subject:m.subject, title:m.question, detail:"",
        reason:m.reason||"", fix:m.fix||"", mastery:m.mastery||2,
        ease:2.5, interval:iv, reps:m.stage||0,
        nextReview:m.nextReview, lastReview:m.lastReview, created:m.created };
    });
  }
  if(!DB.reviews) DB.reviews = [];
  saveDB();
}
function dueReviews(){
  ensureReviewsMigrated();
  var t = todayKey();
  return DB.reviews.filter(function(r){ return r.nextReview <= t; });
}
/* SM-2 简化版：q=1 忘了，3 模糊，4 记得，5 很熟 */
function sm2Review(r, q){
  var t = todayKey();
  r.reps = (r.reps||0)+1;
  if(q < 3){ r.reps = 0; r.interval = 1; }
  else {
    r.ease = Math.max(1.3, (r.ease||2.5) + (0.1-(5-q)*(0.08+(5-q)*0.02)));
    if(r.reps===1) r.interval = 1;
    else if(r.reps===2) r.interval = 6;
    else r.interval = Math.round(r.interval * r.ease);
  }
  r.mastery = q; r.lastReview = t; r.nextReview = addDays(t, r.interval);
}
var reviewQueue = [], reviewIdx = 0;
function renderReviews(){
  ensureReviewsMigrated();
  var t = todayKey();
  var due = dueReviews().sort(function(a,b){ return a.nextReview<b.nextReview?-1:1; });
  document.getElementById("dueCountTag").textContent = due.length+" 项待复习";
  /* 今日复习队列 */
  reviewQueue = due; reviewIdx = 0;
  var rl = DB.reviewLog[t] = DB.reviewLog[t] || { done:0, total:0 };
  if(rl.total < due.length) rl.total = due.length;
  renderReviewQueue();

  chipRow(document.getElementById("reviewKindTabs"), ["全部"].concat(REVIEW_KINDS), reviewKindTab, function(v){ reviewKindTab=v; renderReviews(); });
  chipRow(document.getElementById("reviewTabs"), ["全部"].concat(stageSubjects()), reviewTab, function(v){ reviewTab=v; renderReviews(); });
  var list = DB.reviews.filter(function(r){
    return (reviewKindTab==="全部" || r.kind===reviewKindTab) && (reviewTab==="全部" || r.subject===reviewTab);
  }).sort(function(a,b){ return a.nextReview<b.nextReview?-1:1; });
  var ml = document.getElementById("reviewList");
  if(!list.length){
    ml.innerHTML = '<div class="card empty"><div class="em">'+iconSvg("layers",30)+'</div><p>还没有复习项</p><span>错题、单词、知识点、申论素材——值得记住的，都值得再见一面。</span></div>';
    return;
  }
  ml.innerHTML = list.map(function(r){
    var s = SUBJECTS[r.subject]||SUBJECTS["其他"];
    var ks = REVIEW_KIND_STYLE[r.kind]||REVIEW_KIND_STYLE["错题"];
    var d = diffDays(t, r.nextReview);
    var dueTxt = d<0 ? "已逾期 "+(-d)+" 天" : (d===0 ? "今天复习" : d+" 天后（"+r.nextReview.slice(5).replace("-","/")+"）");
    var stars = "";
    for(var i=1;i<=5;i++) stars += '<button class="star-btn'+(i<=r.mastery?" on":"")+'" data-rstar="'+r.id+':'+i+'" aria-label="掌握度 '+i+' 星">'+iconSvg("star",17)+'</button>';
    return '<div class="card mistake-item"><div class="m-body">'+
      '<div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">'+
      '<span class="tag" style="background:'+ks.soft+'; color:'+ks.color+';">'+esc(r.kind)+'</span>'+
      '<span class="tag tag-subj" style="background:'+s.color+'">'+esc(r.subject)+'</span>'+
      '<span class="m-q">'+esc(r.title)+'</span></div>'+
      (r.detail?'<div class="m-row"><span class="lbl">内容</span>'+esc(r.detail)+'</div>':"")+
      (r.reason?'<div class="m-row"><span class="lbl lbl-err">错因</span>'+esc(r.reason)+'</div>':"")+
      (r.fix?'<div class="m-row"><span class="lbl lbl-fix">解析</span>'+esc(r.fix)+'</div>':"")+
      '<div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-top:10px;">'+
      '<span style="font-size:12px; color:var(--ink-3); font-weight:600;">掌握度</span><span class="stars">'+stars+'</span>'+
      '<span class="review-due '+(d<0?"over":d===0?"today":"future")+'">'+iconSvg("clock",14)+' '+dueTxt+'</span>'+
      '<span style="font-size:12px; color:var(--ink-3);">第 '+(r.reps+1)+' 轮 · 间隔 '+r.interval+' 天</span>'+
      '<span style="flex:1"></span>'+
      '<button class="icon-btn" data-edit-review="'+r.id+'" aria-label="编辑">'+iconSvg("edit",15)+'</button>'+
      '<button class="icon-btn danger" data-del-review="'+r.id+'" aria-label="删除">'+iconSvg("trash",15)+'</button>'+
      '</div></div></div>';
  }).join("");
  ml.querySelectorAll("[data-rstar]").forEach(function(b){
    b.addEventListener("click", function(){
      var parts = b.getAttribute("data-rstar").split(":");
      var r = DB.reviews.filter(function(x){ return x.id===parts[0]; })[0];
      if(r){ r.mastery = +parts[1]; saveDB(); renderReviews(); }
    });
  });
  ml.querySelectorAll("[data-edit-review]").forEach(function(b){
    b.addEventListener("click", function(){ reviewForm(b.getAttribute("data-edit-review")); });
  });
  ml.querySelectorAll("[data-del-review]").forEach(function(b){
    b.addEventListener("click", function(){
      var r = DB.reviews.filter(function(x){ return x.id===b.getAttribute("data-del-review"); })[0];
      if(!r) return;
      confirmDialog("删除复习项", "确定删除《"+r.title+"》吗？复习进度也会一并删除。", "删除", function(){
        DB.reviews = DB.reviews.filter(function(x){ return x.id!==r.id; });
        saveDB(); renderReviews(); buildNav(); toast("已删除");
      });
    });
  });
}
function renderReviewQueue(){
  var box = document.getElementById("reviewQueue");
  var t = todayKey();
  var rl = DB.reviewLog[t] = DB.reviewLog[t] || { done:0, total:0 };
  if(reviewIdx >= reviewQueue.length){
    box.innerHTML = reviewQueue.length
      ? '<div class="empty" style="padding:18px 10px;"><p>🎉 今日复习全部完成（'+rl.done+'/'+rl.total+'）</p><span>记忆又加固了一层，明天见。</span></div>'
      : '<div class="empty" style="padding:18px 10px;"><p>今天没有到期的复习项</p><span>记忆正在悄悄巩固中。</span></div>';
    return;
  }
  var r = reviewQueue[reviewIdx];
  var s = SUBJECTS[r.subject]||SUBJECTS["其他"];
  var ks = REVIEW_KIND_STYLE[r.kind]||REVIEW_KIND_STYLE["错题"];
  box.innerHTML =
    '<div class="rq-progress">第 '+(reviewIdx+1)+' / '+reviewQueue.length+' 项 · 今日已复习 '+rl.done+' 项</div>'+
    '<div class="rq-card"><div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;">'+
    '<span class="tag" style="background:'+ks.soft+'; color:'+ks.color+';">'+esc(r.kind)+'</span>'+
    '<span class="tag tag-subj" style="background:'+s.color+'">'+esc(r.subject)+'</span></div>'+
    '<div class="rq-title">'+esc(r.title)+'</div>'+
    (r.detail?'<div class="rq-detail">'+esc(r.detail)+'</div>':"")+
    '<div class="rq-fix" id="rqFix" hidden>'+(r.reason?'<div class="m-row"><span class="lbl lbl-err">错因</span>'+esc(r.reason)+'</div>':"")+(r.fix?'<div class="m-row"><span class="lbl lbl-fix">解析</span>'+esc(r.fix)+'</div>':"")+'</div>'+
    '<div class="rq-ops" id="rqOps">'+
    '<button class="btn btn-soft btn-sm" id="rqShowFix">先自己想，再看解析</button>'+
    '<button class="btn btn-ghost btn-sm" id="rqSkip">跳过</button></div>'+
    '<div class="rq-grades" id="rqGrades" hidden>'+
    '<span>这次记得怎么样？</span><div class="rq-grade-btns">'+
    '<button data-grade="1" class="g1">忘了</button><button data-grade="3" class="g3">模糊</button>'+
    '<button data-grade="4" class="g4">记得</button><button data-grade="5" class="g5">很熟</button>'+
    '</div></div></div>';
  document.getElementById("rqShowFix").addEventListener("click", function(){
    document.getElementById("rqFix").hidden = false;
    document.getElementById("rqOps").hidden = true;
    document.getElementById("rqGrades").hidden = false;
  });
  document.getElementById("rqSkip").addEventListener("click", function(){ reviewIdx++; renderReviewQueue(); });
  box.querySelectorAll("[data-grade]").forEach(function(b){
    b.addEventListener("click", function(){
      var q = +b.getAttribute("data-grade");
      sm2Review(r, q);
      rl.done++; rl.total = Math.max(rl.total, reviewQueue.length);
      addPoints(2, "复习"+r.kind+"《"+r.title+"》");
      saveDB();
      toast(q<3 ? "没关系，已经重新排到明天，加油" : "很好！下次 "+r.interval+" 天后再见 · +2 分");
      reviewIdx++; renderReviewQueue(); buildNav();
    });
  });
}
function reviewForm(id){
  var r = id ? DB.reviews.filter(function(x){ return x.id===id; })[0] : null;
  var isNew = !r;
  r = r || { kind:"错题", subject:stageSubjects()[0]||"其他", title:"", detail:"", reason:"", fix:"", mastery:2 };
  openModal('<h3>'+(isNew?"记录复习项":"编辑复习项")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<form id="reviewFormEl"><div class="form-grid">'+
    '<div class="field"><label>类型</label><select id="rvKind">'+REVIEW_KINDS.map(function(k){ return "<option"+(k===r.kind?" selected":"")+">"+k+"</option>"; }).join("")+'</select></div>'+
    '<div class="field"><label>学科</label><select id="rvSubject">'+stageSubjects().map(function(x){ return "<option"+(x===r.subject?" selected":"")+">"+x+"</option>"; }).join("")+'</select></div>'+
    '<div class="field full"><label>标题 *</label><input id="rvTitle" type="text" maxlength="120" placeholder="错题：题目一句话 / 单词：abandon / 知识点：牛顿第二定律" value="'+esc(r.title)+'"><span class="err">请填写标题</span></div>'+
    '<div class="field full"><label>内容</label><textarea id="rvDetail" rows="2" maxlength="300" placeholder="单词释义例句 / 知识点要点 / 素材正文">'+esc(r.detail||"")+'</textarea></div>'+
    '<div class="field full"><label>错误原因（错题用）</label><input id="rvReason" type="text" maxlength="200" placeholder="如：公式记混了" value="'+esc(r.reason||"")+'"></div>'+
    '<div class="field full"><label>解析 / 正确思路</label><textarea id="rvFix" rows="2" maxlength="300" placeholder="复习时先遮住这里，自己讲一遍">'+esc(r.fix||"")+'</textarea></div>'+
    '<div class="field"><label>当前掌握度</label><select id="rvMastery">'+[1,2,3,4,5].map(function(n){ return '<option value="'+n+'"'+(n===r.mastery?" selected":"")+'>'+n+' 星</option>'; }).join("")+'</select></div>'+
    '</div>'+(isNew?'<p style="font-size:12.5px; color:var(--ink-3); margin-top:10px;">保存后按 SM-2 算法自动安排复习：记得越牢间隔越长，忘了就回到第 1 天。</p>':"")+
    '<div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">'+(isNew?"开始记忆":"保存修改")+'</button></div></form>');
  bindCloseButtons();
  modalBox.querySelector("#reviewFormEl").addEventListener("submit", function(ev){
    ev.preventDefault();
    var ti = modalBox.querySelector("#rvTitle");
    if(!ti.value.trim()){ ti.closest(".field").classList.add("invalid"); return; }
    if(isNew){
      DB.reviews.unshift({
        id:uid(), kind:modalBox.querySelector("#rvKind").value,
        subject:modalBox.querySelector("#rvSubject").value,
        title:ti.value.trim(), detail:modalBox.querySelector("#rvDetail").value.trim(),
        reason:modalBox.querySelector("#rvReason").value.trim(), fix:modalBox.querySelector("#rvFix").value.trim(),
        mastery:+modalBox.querySelector("#rvMastery").value,
        ease:2.5, interval:1, reps:0, created:todayKey(), lastReview:todayKey(), nextReview:addDays(todayKey(),1)
      });
      toast("已加入复习计划，明天第一次见面");
    } else {
      var o = DB.reviews.filter(function(x){ return x.id===id; })[0];
      o.kind = modalBox.querySelector("#rvKind").value;
      o.subject = modalBox.querySelector("#rvSubject").value;
      o.title = ti.value.trim();
      o.detail = modalBox.querySelector("#rvDetail").value.trim();
      o.reason = modalBox.querySelector("#rvReason").value.trim();
      o.fix = modalBox.querySelector("#rvFix").value.trim();
      o.mastery = +modalBox.querySelector("#rvMastery").value;
      toast("已更新");
    }
    saveDB(); closeModal(); renderReviews(); buildNav();
  });
}
document.getElementById("btnAddReview").addEventListener("click", function(){ reviewForm(null); });
document.getElementById("btnAddExam").addEventListener("click", function(){ examForm(null); });
document.getElementById("btnReportText").addEventListener("click", function(){ openReportText(); });
document.getElementById("btnAddRes").addEventListener("click", function(){ resourceForm(null); });
document.querySelectorAll("[data-theme-pick]").forEach(function(b){
  b.addEventListener("click", function(){
    DB.settings.theme = b.getAttribute("data-theme-pick");
    saveDB(); applyTheme();
    toast("已切换为"+b.textContent+"模式");
  });
});

function renderHeatmap(){
  var box = document.getElementById("focusHeatmap");
  if(!box) return;
  var days = [];
  var t = todayKey();
  for(var i=83;i>=0;i--) days.push(addDays(t,-i));
  var max = 0;
  days.forEach(function(d){ max = Math.max(max, DB.focusLog[d]||0); });
  box.innerHTML = days.map(function(d){
    var v = DB.focusLog[d]||0;
    var lv = v===0?0 : max===0?0 : Math.min(4, Math.ceil(v/max*4));
    return '<i class="hm-day lv'+lv+'" title="'+d+" · "+fmtMin(v)+'"></i>';
  }).join("");
}
function renderReport(){
  var st = weekStats();
  var rate = st.totalDue ? Math.round(st.doneDue/st.totalDue*100) : 100;
  var focusMin = Math.round(st.focusSec/60);
  document.getElementById("reportTitle").textContent = DB.student.name+"的本周成长小结";
  var best = "";
  if(focusMin>=300) best = "本周累计专注 "+focusMin+" 分钟，相当于一口气爬了 "+Math.max(1,Math.round(focusMin/60))+" 座知识小山丘。";
  else if(focusMin>0) best = "本周累计专注 "+focusMin+" 分钟，每一分钟都是在给大脑“充电”。";
  else best = "本周刚刚开始，专注时钟还没启动——没关系，今天就是最好的开始。";
  var hwTxt = st.totalDue ?
    ("本周到期 "+st.totalDue+" 项任务，完成了 "+st.doneDue+" 项，完成率 "+rate+"%。" + (rate>=90 ? "这个稳定性非常难得，说明计划安排得合理、执行也跟得上。" : rate>=60 ? "大方向很好，下周可以把未完成的任务拆得更小一点，一口一口吃掉它。" : "下周试着减少任务量、先保证完成率——做完的成就感比做多的数量更重要。")) :
    "本周还没有到期的任务记录，可以在任务页把新任务录入进来，下周的报告就会更丰富。";
  var ptsTxt = st.pointsGain>0 ?
    "积分方面，本周获得 "+st.pointsGain+" 分、兑换消耗 "+st.pointsSpend+" 分，当前余额 "+DB.points+" 分。积分涨涨跌跌的背后，是努力被看见、承诺被兑现的过程。" :
    "积分本周还没有新增。完成任务和打卡就能点亮第一颗星星，要不要今天就试一次？";
  var due = dueReviews().length;
  var mkTxt = due ? ("目前有 "+due+" 道错题等着复习。错题不可怕，可怕的是同一道题错第二次。陪他用“小老师讲题法”过一遍，讲得清楚，记得牢固。") :
    "错题本目前没有逾期未复习的题目，复习节奏很稳。保持住——遗忘曲线最喜欢有规律的人。";
  document.getElementById("reportSummary").innerHTML =
    "<p>"+esc(best)+"</p><p>"+esc(hwTxt)+"</p><p>"+esc(ptsTxt)+"</p><p>"+esc(mkTxt)+"</p>"+
    "<p>最后送一句给"+esc(DB.student.name)+"：你不需要一次做到完美，你只需要比昨天的自己多坚持一点点。这一周，你做到了。</p>";

  document.getElementById("reportKv").innerHTML =
    '<div class="kv"><span style="color:var(--ink-3)">任务完成率（本周到期）</span><b>'+rate+'%（'+st.doneDue+'/'+st.totalDue+'）</b></div>'+
    '<div class="kv"><span style="color:var(--ink-3)">本周专注总时长</span><b>'+fmtMin(st.focusSec)+'</b></div>'+
    '<div class="kv"><span style="color:var(--ink-3)">本周打卡次数</span><b>'+st.checksDone+' 次</b></div>'+
    '<div class="kv"><span style="color:var(--ink-3)">本周获得积分</span><b>+'+st.pointsGain+' 分</b></div>'+
    '<div class="kv"><span style="color:var(--ink-3)">当前积分余额</span><b>'+DB.points+' 分</b></div>'+
    '<div class="kv"><span style="color:var(--ink-3)">复习项总数 / 待复习</span><b>'+DB.reviews.length+' 项 / '+due+' 项</b></div>';+'<div class="kv"><span style="color:var(--ink-3)">本周自测 / 平均正确率</span><b>'+st.quizN+' 次'+(st.quizAvg===null?"":" / "+st.quizAvg+"%")+'</b></div>'+'<div class="kv"><span style="color:var(--ink-3)">本周复习完成</span><b>'+st.reviewDone+' 项次</b></div>'+'<div class="kv"><span style="color:var(--ink-3)">已达成目标</span><b>'+st.goalsDone+' 个</b></div>'

  drawBarChart(document.getElementById("reportFocusChart"), st.days.map(function(d){ return (DB.focusLog[d]||0)/60; }), st.days.map(dayShort), "分钟");

  /* 学科时间分布：本周完成任务的实际用时 + 打卡科目用时（近似） */
  var subjMin = {};
  DB.homeworks.forEach(function(h){
    if(h.done && h.doneAt && st.days.indexOf(h.doneAt)>=0) subjMin[h.subject] = (subjMin[h.subject]||0) + (h.actualSec||0)/60;
  });
  DB.checks.forEach(function(c){
    st.days.forEach(function(d){
      if((DB.checkDone[d]||[]).indexOf(c.id)>=0 && c.planMin>0) subjMin[c.subject] = (subjMin[c.subject]||0) + c.planMin;
    });
  });
  var items = stageSubjects().filter(function(s){ return (subjMin[s]||0)>0; }).map(function(s){
    return { label:s, value:subjMin[s], color:SUBJECTS[s].color };
  });
  var sc = document.getElementById("reportSubjectChart");
  if(!items.length){
    var ctx = sc.getContext("2d"); ctx.clearRect(0,0,sc.width,sc.height);
    ctx.font = "13px sans-serif"; ctx.fillStyle = cssVar("--ink-3");
    ctx.textAlign = "center"; ctx.fillText("本周暂无学科用时数据，完成任务后这里会长出彩虹。", sc.width/2, sc.height/2);
  } else drawHBars(sc, items);

  var pDays = st.days.map(function(d){
    return DB.ledger.filter(function(l){ return l.day===d; }).reduce(function(s,l){ return s+l.amt; }, 0);
  });
  drawLineChart(document.getElementById("reportPointsChart"), pDays, st.days.map(dayShort));

  renderQuizTrendChart();
  renderReviewBarChart(st);

  renderHeatmap();
}
/* ================================================================
   设置
   ================================================================ */
/* ================================================================
   目标管理（第2轮）
   ================================================================ */
var GOAL_TYPES = ["长期目标","学期目标","月目标","周目标"];
function goalProgress(g){
  if(!g.milestones || !g.milestones.length) return g.done?100:0;
  var d = g.milestones.filter(function(m){ return m.done; }).length;
  return Math.round(d/g.milestones.length*100);
}
function activeGoals(){
  return DB.goals.filter(function(g){ return !g.done; }).sort(function(a,b){
    if(!a.deadline) return 1; if(!b.deadline) return -1;
    return a.deadline<b.deadline?-1:1;
  });
}
function renderGoalBanner(){
  var box = document.getElementById("goalBanner");
  if(!box) return;
  var gs = activeGoals();
  if(!gs.length){ box.innerHTML = ""; return; }
  var g = gs[0], p = goalProgress(g);
  var dd = g.deadline ? diffDays(todayKey(), g.deadline) : null;
  var ddTxt = dd===null ? "" : (dd<0 ? "已逾期 "+(-dd)+" 天" : dd===0 ? "今天截止" : "还剩 "+dd+" 天");
  var dn = g.milestones.filter(function(m){ return m.done; }).length;
  box.innerHTML =
    '<div class="card goal-banner"><div class="goal-banner-ic">'+iconSvg("flag",24)+'</div>'+
    '<div style="flex:1; min-width:0;"><div class="goal-banner-top"><b>'+esc(g.title)+'</b>'+
    '<span class="more" data-goto="goals">管理目标 →</span></div>'+
    '<div class="pbar"><i style="width:'+p+'%"></i></div>'+
    '<div class="goal-meta"><span>'+g.type+' · 里程碑 '+dn+'/'+g.milestones.length+'</span><span>'+ddTxt+'</span><span>'+p+'%</span></div>'+
    '</div></div>';
}
function renderGoals(){
  var wrap = document.getElementById("goalList");
  var gs = DB.goals.slice().sort(function(a,b){ return (a.done-b.done) || ((b.createdAt||"")<(a.createdAt||"")?-1:1); });
  if(!gs.length){
    wrap.innerHTML = '<div class="card empty"><div class="em">'+iconSvg("flag",30)+'</div><p>还没有设定目标</p><span>点右上「新建目标」，把大梦想拆成小里程碑吧。</span></div>';
    return;
  }
  wrap.innerHTML = gs.map(function(g){
    var p = goalProgress(g);
    var dn = g.milestones.filter(function(m){ return m.done; }).length;
    var dd = g.deadline ? diffDays(todayKey(), g.deadline) : null;
    var ddTxt = dd===null ? "无截止日期" : (dd<0 ? '<b style="color:var(--red);">已逾期 '+(-dd)+' 天</b>' : dd===0 ? '<b style="color:var(--primary-deep);">今天截止</b>' : "还剩 "+dd+" 天");
    var ms = (g.milestones||[]).map(function(m){
      return '<button class="ms-row'+(m.done?" done":"")+'" data-ms="'+g.id+":"+m.id+'">'+
        '<span class="ms-box">'+(m.done?iconSvg("check",13):"")+'</span><span>'+esc(m.text)+'</span></button>';
    }).join("");
    return '<div class="card goal-card'+(g.done?" goal-done":"")+'">'+
      '<div class="goal-head"><div><div class="goal-title">'+(g.done?iconSvg("trophy",18):"")+esc(g.title)+'</div>'+
      '<div class="goal-meta"><span class="tag">'+g.type+'</span><span>'+ddTxt+'</span>'+(g.desc?'<span>'+esc(g.desc)+'</span>':"")+'</div></div>'+
      '<div class="goal-ops"><button class="icon-btn" data-edit-goal="'+g.id+'" aria-label="编辑目标">'+iconSvg("edit",16)+'</button>'+
      '<button class="icon-btn danger" data-del-goal="'+g.id+'" aria-label="删除目标">'+iconSvg("trash",16)+'</button></div></div>'+
      '<div class="pbar big"><i style="width:'+p+'%"></i></div>'+
      '<div class="goal-meta" style="margin:6px 0 10px;"><span>里程碑 '+dn+'/'+g.milestones.length+'</span><span>'+p+'%</span>'+
      (!g.done && dn===g.milestones.length && g.milestones.length ? '<button class="link-btn" data-finish-goal="'+g.id+'">🎉 全部完成，标记达成</button>' : "")+'</div>'+
      '<div class="ms-list">'+(ms || '<div class="empty" style="padding:10px;"><span>暂无里程碑，点击编辑添加。</span></div>')+'</div>'+
      '</div>';
  }).join("");
  wrap.querySelectorAll("[data-ms]").forEach(function(b){
    b.addEventListener("click", function(){
      var parts = b.getAttribute("data-ms").split(":");
      var g = DB.goals.filter(function(x){ return x.id===parts[0]; })[0];
      if(!g) return;
      var m = g.milestones.filter(function(x){ return x.id===parts[1]; })[0];
      if(!m) return;
      m.done = !m.done;
      if(m.done){ addPoints(2, "完成里程碑《"+m.text+"》"); toast("里程碑达成 +2 分，"+encourage()); }
      saveDB(); renderGoals(); renderGoalBanner();
    });
  });
  wrap.querySelectorAll("[data-edit-goal]").forEach(function(b){
    b.addEventListener("click", function(){ goalForm(b.getAttribute("data-edit-goal")); });
  });
  wrap.querySelectorAll("[data-del-goal]").forEach(function(b){
    b.addEventListener("click", function(){
      var g = DB.goals.filter(function(x){ return x.id===b.getAttribute("data-del-goal"); })[0];
      confirmDialog("删除目标", "确定删除目标《"+(g?g.title:"")+"》及全部里程碑吗？", "删除", function(){
        DB.goals = DB.goals.filter(function(x){ return x.id!==b.getAttribute("data-del-goal"); });
        saveDB(); renderGoals(); renderGoalBanner(); toast("目标已删除");
      });
    });
  });
  wrap.querySelectorAll("[data-finish-goal]").forEach(function(b){
    b.addEventListener("click", function(){
      var g = DB.goals.filter(function(x){ return x.id===b.getAttribute("data-finish-goal"); })[0];
      if(!g) return;
      g.done = true;
      addPoints(20, "达成目标《"+g.title+"》");
      saveDB(); renderGoals(); renderGoalBanner();
      toast("🎉 目标达成！+20 分，"+encourage());
    });
  });
}
function goalForm(id){
  var g = id ? DB.goals.filter(function(x){ return x.id===id; })[0] : null;
  g = g || { id:uid(), title:"", type:"学期目标", deadline:"", desc:"", milestones:[], done:false, createdAt:todayKey() };
  var msTxt = g.milestones.map(function(m){ return m.text; }).join("\n");
  openModal('<h3>'+(id?"编辑目标":"新建目标")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<div class="form-grid">'+
    '<div class="field" style="grid-column:1/-1;"><label>目标名称</label><input id="gTitle" type="text" maxlength="40" placeholder="如：90 天考研上岸 / 本学期数学 130+" value="'+esc(g.title)+'"></div>'+
    '<div class="field"><label>目标类型</label><select id="gType">'+GOAL_TYPES.map(function(x){ return "<option"+(x===g.type?" selected":"")+">"+x+"</option>"; }).join("")+'</select></div>'+
    '<div class="field"><label>截止日期</label><input id="gDeadline" type="date" value="'+(g.deadline||"")+'"></div>'+
    '<div class="field" style="grid-column:1/-1;"><label>目标描述（可选）</label><input id="gDesc" type="text" maxlength="80" placeholder="为什么定这个目标？达成后有什么奖励？" value="'+esc(g.desc||"")+'"></div>'+
    '<div class="field" style="grid-column:1/-1;"><label>里程碑拆解（每行一个，先易后难）</label><textarea id="gMs" rows="4" placeholder="每天背 50 个单词\n刷完英语一真题 2015-2020\n模考稳定 380+">'+esc(msTxt)+'</textarea></div>'+
    '</div>'+
    '<div class="modal-ops"><button class="btn btn-soft" data-close>取消</button><button class="btn btn-primary" id="gSave">保存目标</button></div>');
  bindCloseButtons();
  document.getElementById("gSave").addEventListener("click", function(){
    var title = document.getElementById("gTitle").value.trim();
    if(!title){ toast("请填写目标名称"); return; }
    g.title = title;
    g.type = document.getElementById("gType").value;
    g.deadline = document.getElementById("gDeadline").value;
    g.desc = document.getElementById("gDesc").value.trim();
    var lines = document.getElementById("gMs").value.split("\n").map(function(x){ return x.trim(); }).filter(Boolean);
    var oldMap = {};
    g.milestones.forEach(function(m){ oldMap[m.text] = m.done; });
    g.milestones = lines.map(function(x){ return { id:uid(), text:x, done:!!oldMap[x] }; });
    if(!id){ DB.goals.push(g); addPoints(5, "设定新目标《"+title+"》"); }
    saveDB(); closeModal(); renderGoals(); renderGoalBanner(); buildNav();
    toast(id ? "目标已更新" : "目标已创建 +5 分，"+encourage());
  });
}


/* ================================================================
   考试倒计时（第5轮）
   ================================================================ */
function upcomingExams(){
  var t = todayKey();
  return DB.exams.filter(function(e){ return e.date >= t; })
    .sort(function(a,b){ return a.date<b.date?-1:1; });
}
function renderExamStrip(){
  var box = document.getElementById("examStrip");
  if(!box) return;
  var list = upcomingExams().slice(0,3);
  if(!list.length){ box.innerHTML = ""; return; }
  box.innerHTML = '<div class="exam-strip">' + list.map(function(e){
    var d = diffDays(todayKey(), e.date);
    return '<button class="exam-chip" data-goto="exams"><span class="exam-name">'+esc(e.name)+'</span>'+
      '<span class="exam-days"><b>'+d+'</b> 天</span></button>';
  }).join("") + '</div>';
  box.querySelectorAll("[data-goto]").forEach(function(el){
    el.addEventListener("click", function(){ goPage(el.getAttribute("data-goto")); });
  });
}
function renderExams(){
  var wrap = document.getElementById("examList");
  var t = todayKey();
  var list = DB.exams.slice().sort(function(a,b){ return a.date<b.date?-1:1; });
  if(!list.length){
    wrap.innerHTML = '<div class="card empty"><div class="em">'+iconSvg("trophy",30)+'</div><p>还没有添加考试</p><span>把中考、高考、考研、国考……写下来，倒计时是最好的自律闹钟。</span></div>';
    return;
  }
  wrap.innerHTML = list.map(function(e){
    var d = diffDays(t, e.date);
    var past = d < 0;
    return '<div class="card exam-card'+(past?" past":"")+'">'+
      '<div class="exam-big"><b>'+(past?"已过":d)+'</b><span>'+(past?(-d)+" 天":"天")+'</span></div>'+
      '<div style="flex:1; min-width:0;"><div class="exam-title">'+esc(e.name)+'</div>'+
      '<div class="goal-meta"><span>'+e.date+'</span>'+(e.note?'<span>'+esc(e.note)+'</span>':"")+'</div></div>'+
      '<div class="goal-ops"><button class="icon-btn" data-edit-exam="'+e.id+'" aria-label="编辑考试">'+iconSvg("edit",16)+'</button>'+
      '<button class="icon-btn danger" data-del-exam="'+e.id+'" aria-label="删除考试">'+iconSvg("trash",16)+'</button></div></div>';
  }).join("");
  wrap.querySelectorAll("[data-edit-exam]").forEach(function(b){
    b.addEventListener("click", function(){ examForm(b.getAttribute("data-edit-exam")); });
  });
  wrap.querySelectorAll("[data-del-exam]").forEach(function(b){
    b.addEventListener("click", function(){
      confirmDialog("删除考试", "确定删除这场考试倒计时吗？", "删除", function(){
        DB.exams = DB.exams.filter(function(x){ return x.id!==b.getAttribute("data-del-exam"); });
        saveDB(); renderExams(); renderExamStrip(); toast("已删除");
      });
    });
  });
}
function examForm(id){
  var e = id ? DB.exams.filter(function(x){ return x.id===id; })[0] : null;
  e = e || { id:uid(), name:"", date:addDays(todayKey(), 100), note:"" };
  openModal('<h3>'+(id?"编辑考试":"添加考试倒计时")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<div class="form-grid">'+
    '<div class="field" style="grid-column:1/-1;"><label>考试名称 *</label><input id="eName" type="text" maxlength="30" placeholder="如：2027 考研初试 / 国考笔试 / 高考" value="'+esc(e.name)+'"></div>'+
    '<div class="field"><label>考试日期 *</label><input id="eDate" type="date" value="'+e.date+'"></div>'+
    '<div class="field"><label>备注</label><input id="eNote" type="text" maxlength="40" placeholder="如：目标 380+" value="'+esc(e.note||"")+'"></div>'+
    '</div><p style="font-size:12.5px; color:var(--ink-3); margin-top:10px;">倒计时会显示在首页，帮你把“还有多少天”变成每天的行动。</p>'+
    '<div class="modal-ops"><button class="btn btn-soft" data-close>取消</button><button class="btn btn-primary" id="eSave">保存</button></div>');
  bindCloseButtons();
  document.getElementById("eSave").addEventListener("click", function(){
    var name = document.getElementById("eName").value.trim();
    var date = document.getElementById("eDate").value;
    if(!name){ toast("请填写考试名称"); return; }
    if(!date){ toast("请选择考试日期"); return; }
    e.name = name; e.date = date; e.note = document.getElementById("eNote").value.trim();
    if(!id) DB.exams.push(e);
    saveDB(); closeModal(); renderExams(); renderExamStrip();
    toast(id?"已更新":"考试倒计时已创建，"+diffDays(todayKey(), date)+" 天后见真章");
  });
}


/* ================================================================
自测组卷（第7轮）：录题 -> 组卷 -> 计时自测 -> 判分 -> 错题入库
================================================================ */
var QUIZ_TYPES = ["单选","多选","判断","填空"];
var quizPaper = null, quizIdx = 0, quizAnswers = {}, quizStartTs = 0, quizTimerInt = null, quizSubject = "全部";
function quizQCount(subject){
return DB.quizBank.filter(function(q){ return subject==="全部" || q.subject===subject;}).length;
}
function renderQuiz(){
stopQuizTimer();
var subjects = stageSubjects();
var w = document.getElementById("quizBody");
var counts = subjects.map(function(x){ return { s:x, n:quizQCount(x)};});
var totalN = DB.quizBank.length;
var results = DB.quizResults.slice().sort(function(a,b){ return b.at-a.at;}).slice(0,10);
var avg = DB.quizResults.length? Math.round(DB.quizResults.reduce(function(a,r){ return a+r.correct/r.total;},0)/DB.quizResults.length*100): null;
w.innerHTML =
'<div class="grid two-col">'+
'<div class="card"><h2>开始自测</h2>'+
'<div class="form-grid" style="margin-top:12px;">'+
'<div class="field"><label>学科</label><select id="qzSubject"><option>全部</option>'+subjects.map(function(x){ return "<option>"+x+"</option>";}).join("")+'</select></div>'+
'<div class="field"><label>题量</label><select id="qzCount"><option value="5">5 题</option><option value="10" selected>10 题</option><option value="20">20 题</option></select></div>'+
'</div>'+
'<div class="txt" style="margin:10px 0;">题库共 '+totalN+' 题'+(avg===null?"":" · 历史平均正确率 "+avg+"%")+'</div>'+
'<button class="btn btn-primary" id="qzStart">开始组卷自测</button></div>'+
'<div class="card"><h2>历史成绩 <span class="more" id="qzClearHist">清空</span></h2>'+
'<div class="mini-list" id="quizHist" style="margin-top:8px;">'+
(results.length? results.map(function(r){
var p = Math.round(r.correct/r.total*100);
return '<div class="mini-row"><span class="nm">'+esc(r.subject)+' · '+r.correct+'/'+r.total+'（'+p+'%）</span><span class="tm">'+r.day.slice(5).replace("-","/")+' · 用时 '+fmtMin(r.secs)+'</span></div>';
}).join(""): '<div class="empty" style="padding:14px;"><span>还没有自测记录，组一套卷子试试手。</span></div>')+
'</div></div></div>'+
'<div class="card" style="margin-top:16px;"><h2>题库 <span class="more" id="qzAddBank">＋ 录题</span></h2>'+
'<div class="filters" id="qzBankTabs" style="margin:10px 0;"></div>'+
'<div id="qzBankList"></div></div>';
document.getElementById("qzStart").addEventListener("click", function(){
var sub = document.getElementById("qzSubject").value;
var n = +document.getElementById("qzCount").value;
startQuiz(sub, n);
});
document.getElementById("qzClearHist").addEventListener("click", function(){
confirmDialog("清空历史", "确定清空全部自测成绩吗？", "清空", function(){
DB.quizResults = []; saveDB(); renderQuiz(); toast("历史成绩已清空");
});
});
document.getElementById("qzAddBank").addEventListener("click", function(){ quizForm(null);});
renderQuizBank("全部");
}
function renderQuizBank(tab){
chipRow(document.getElementById("qzBankTabs"), ["全部"].concat(stageSubjects()), tab, function(v){ renderQuizBank(v);});
var list = DB.quizBank.filter(function(q){ return tab==="全部" || q.subject===tab;});
var box = document.getElementById("qzBankList");
if(!list.length){
box.innerHTML = '<div class="empty" style="padding:16px;"><span>题库是空的，点右上「录题」把做过的题攒起来，攒够 10 道就能组卷了。</span></div>';
return;
}
box.innerHTML = list.map(function(q){
var s = SUBJECTS[q.subject]||SUBJECTS["其他"];
return '<div class="mini-row"><span class="tag tag-subj" style="background:'+s.color+'">'+esc(q.subject)+'</span>'+
'<span class="tag">'+q.qtype+'</span><span class="nm">'+esc(q.stem.slice(0,42))+(q.stem.length>42?"…":"")+'</span>'+
'<span style="flex:1"></span>'+
'<button class="icon-btn" data-edit-q="'+q.id+'" aria-label="编辑题目">'+iconSvg("edit",15)+'</button>'+
'<button class="icon-btn danger" data-del-q="'+q.id+'" aria-label="删除题目">'+iconSvg("trash",15)+'</button></div>';
}).join("");
box.querySelectorAll("[data-edit-q]").forEach(function(b){ b.addEventListener("click", function(){ quizForm(b.getAttribute("data-edit-q"));});});
box.querySelectorAll("[data-del-q]").forEach(function(b){
b.addEventListener("click", function(){
confirmDialog("删除题目", "确定从题库删除这道题吗？", "删除", function(){
DB.quizBank = DB.quizBank.filter(function(x){ return x.id!==b.getAttribute("data-del-q");});
saveDB(); renderQuizBank(tab); toast("已删除");
});
});
});
}
function startQuiz(subject, n){
var pool = DB.quizBank.filter(function(q){ return subject==="全部" || q.subject===subject;});
if(pool.length < 3){ toast("题库题目太少（至少 3 道），先去录几道题吧"); return;}
pool = pool.slice();
for(var i=pool.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var tmp=pool[i]; pool[i]=pool[j]; pool[j]=tmp;}
quizPaper = pool.slice(0, Math.min(n, pool.length));
quizIdx = 0; quizAnswers = {}; quizSubject = subject; quizStartTs = Date.now();
renderQuizRunner();
}
function stopQuizTimer(){ if(quizTimerInt){ clearInterval(quizTimerInt); quizTimerInt = null;}}
function renderQuizRunner(){
stopQuizTimer();
var w = document.getElementById("quizBody");
var q = quizPaper[quizIdx];
var s = SUBJECTS[q.subject]||SUBJECTS["其他"];
var total = quizPaper.length;
var body = "";
if(q.qtype==="单选" || q.qtype==="多选"){
body = '<div class="qz-opts">' + q.options.map(function(op, i){
var sel = q.qtype==="单选"? quizAnswers[q.id]===i: (quizAnswers[q.id]||[]).indexOf(i)>=0;
return '<button class="qz-opt'+(sel?" sel":"")+'" data-opt="'+i+'"><span class="qz-key">'+String.fromCharCode(65+i)+'</span>'+esc(op)+'</button>';
}).join("") + '</div>';
} else if(q.qtype==="判断"){
body = '<div class="qz-opts"><button class="qz-opt'+(quizAnswers[q.id]===true?" sel":"")+'" data-judge="1"><span class="qz-key">✓</span>正确</button>'+
'<button class="qz-opt'+(quizAnswers[q.id]===false?" sel":"")+'" data-judge="0"><span class="qz-key">✗</span>错误</button></div>';
} else {
body = '<input id="qzFill" class="qz-fill" type="text" placeholder="把答案写在这里" value="'+esc(quizAnswers[q.id]||"")+'">';
}
w.innerHTML =
'<div class="card qz-runner"><div class="qz-top"><button class="link-btn" id="qzQuit">← 退出自测</button>'+
'<span class="qz-count">第 '+(quizIdx+1)+' / '+total+' 题</span><span class="qz-timer">'+iconSvg("timer",15)+' <b id="qzTimer">00:00</b></span></div>'+
'<div class="pbar" style="margin:10px 0 16px;"><i id="qzBar" style="width:'+Math.round(quizIdx/total*100)+'%"></i></div>'+
'<div style="display:flex; gap:8px; align-items:center; margin-bottom:10px;"><span class="tag tag-subj" style="background:'+s.color+'">'+esc(q.subject)+'</span><span class="tag">'+q.qtype+'</span></div>'+
'<div class="qz-stem">'+esc(q.stem)+'</div>'+ body +
'<div class="qz-nav"><button class="btn btn-ghost btn-sm" id="qzPrev"'+(quizIdx===0?" disabled":"")+'>上一题</button>'+
(quizIdx<total-1? '<button class="btn btn-primary btn-sm" id="qzNext">下一题</button>': '<button class="btn btn-primary btn-sm" id="qzSubmit">交卷判分</button>')+'</div></div>';
quizTimerInt = setInterval(function(){
var el = document.getElementById("qzTimer");
if(el) el.textContent = fmtClock(Math.floor((Date.now()-quizStartTs)/1000));
}, 1000);
document.getElementById("qzQuit").addEventListener("click", function(){
confirmDialog("退出自测", "现在退出，这次自测不计分。确定吗？", "退出", function(){ stopQuizTimer(); renderQuiz();});
});
var prev = document.getElementById("qzPrev");
if(prev) prev.addEventListener("click", function(){ collectQuizAnswer(); if(quizIdx>0){ quizIdx--; renderQuizRunner();}});
w.querySelectorAll("[data-opt]").forEach(function(b){
b.addEventListener("click", function(){
var i = +b.getAttribute("data-opt");
if(q.qtype==="单选"){ quizAnswers[q.id] = i;}
else { var arr = quizAnswers[q.id]||[]; var k = arr.indexOf(i); if(k>=0) arr.splice(k,1); else arr.push(i); quizAnswers[q.id] = arr;}
renderQuizRunner();
});
});
w.querySelectorAll("[data-judge]").forEach(function(b){
b.addEventListener("click", function(){ quizAnswers[q.id] = b.getAttribute("data-judge")==="1"; renderQuizRunner();});
});
var fill = document.getElementById("qzFill");
if(fill) fill.addEventListener("input", function(){ quizAnswers[q.id] = fill.value;});
var nx = document.getElementById("qzNext");
if(nx) nx.addEventListener("click", function(){ collectQuizAnswer(); quizIdx++; renderQuizRunner();});
var sm = document.getElementById("qzSubmit");
if(sm) sm.addEventListener("click", function(){ collectQuizAnswer(); finishQuiz();});
}
function collectQuizAnswer(){
var q = quizPaper[quizIdx];
var fill = document.getElementById("qzFill");
if(fill && q.qtype==="填空") quizAnswers[q.id] = fill.value;
}
function gradeQuestion(q){
var a = quizAnswers[q.id];
if(q.qtype==="单选") return a === q.answer;
if(q.qtype==="多选"){
if(!Array.isArray(a)) return false;
var x = a.slice().sort().join(","), y = q.answer.slice().sort().join(",");
return x===y && a.length>0;
}
if(q.qtype==="判断") return a === q.answer;
if(q.qtype==="填空"){
if(typeof a!=="string") return false;
return a.trim().toLowerCase() === String(q.answer).trim().toLowerCase();
}
return false;
}
function correctAnswerText(q){
if(q.qtype==="单选") return String.fromCharCode(65+q.answer)+"．"+q.options[q.answer];
if(q.qtype==="多选") return q.answer.map(function(i){ return String.fromCharCode(65+i);}).join("、");
if(q.qtype==="判断") return q.answer? "正确": "错误";
return String(q.answer);
}
function finishQuiz(){
stopQuizTimer();
collectQuizAnswer();
var secs = Math.floor((Date.now()-quizStartTs)/1000);
var detail = quizPaper.map(function(q){ return { q:q, ok:gradeQuestion(q)};});
var correct = detail.filter(function(d){ return d.ok;}).length;
var total = detail.length;
var pct = Math.round(correct/total*100);
DB.quizResults.push({ id:uid(), day:todayKey(), subject:quizSubject, total:total, correct:correct, secs:secs, at:Date.now()});
if(DB.quizResults.length>100) DB.quizResults = DB.quizResults.slice(-100);
addPoints(correct*2, "自测："+quizSubject+" 答对 "+correct+"/"+total+" 题");
addFocusLog(secs);
saveDB();
var w = document.getElementById("quizBody");
w.innerHTML =
'<div class="card" style="text-align:center; padding:34px 20px;"><div style="font-size:15px; color:var(--ink-3);">本次自测成绩</div>'+
'<div style="font-size:56px; font-weight:800; color:'+(pct>=80?"var(--green)":pct>=60?"var(--primary-deep)":"var(--red)")+'; margin:8px 0;">'+pct+'<small style="font-size:20px;">分</small></div>'+
'<div class="txt">答对 '+correct+' / '+total+' 题 · 用时 '+fmtMin(secs)+' · +'+(correct*2)+' 积分</div>'+
'<div style="display:flex; gap:10px; justify-content:center; margin-top:18px; flex-wrap:wrap;">'+
'<button class="btn btn-soft btn-sm" id="qzToReview">错题一键入库</button>'+
'<button class="btn btn-ghost btn-sm" id="qzAgain">再来一套</button>'+
'<button class="btn btn-ghost btn-sm" id="qzBack">返回</button></div></div>'+
'<div class="card" style="margin-top:16px;"><h2>逐题解析</h2><div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">'+
detail.map(function(d, i){
var q = d.q, s = SUBJECTS[q.subject]||SUBJECTS["其他"];
return '<div class="qz-review'+(d.ok?" ok":"")+'"><div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">'+
'<b>'+(i+1)+'．</b><span class="tag tag-subj" style="background:'+s.color+'">'+esc(q.subject)+'</span>'+
'<span style="font-weight:800; color:'+(d.ok?"var(--green)":"var(--red)")+'">'+(d.ok?"✓ 答对":"✗ 答错")+'</span></div>'+
'<div style="font-size:14px; margin-bottom:6px;">'+esc(q.stem)+'</div>'+
'<div class="txt">正确答案：'+esc(correctAnswerText(q))+'</div>'+
(q.analysis?'<div class="txt" style="margin-top:4px;">解析：'+esc(q.analysis)+'</div>':"")+'</div>';
}).join("")+'</div></div>';
document.getElementById("qzToReview").addEventListener("click", function(){
var n = 0;
detail.forEach(function(d){
if(d.ok) return;
var q = d.q;
DB.reviews.unshift({ id:uid(), kind:"错题", subject:q.subject, title:""+q.stem.slice(0,60),
detail:"", reason:"自测答错", fix:"正确答案："+correctAnswerText(q)+(q.analysis?"；解析："+q.analysis:""),
mastery:1, ease:2.5, interval:1, reps:0, created:todayKey(), lastReview:todayKey(), nextReview:addDays(todayKey(),1)});
n++;
});
saveDB(); buildNav();
toast(n? n+" 道错题已加入复习中心，明天见": "全部答对，无需入库，太棒了！");
});
document.getElementById("qzAgain").addEventListener("click", function(){ startQuiz(quizSubject, total);});
document.getElementById("qzBack").addEventListener("click", function(){ renderQuiz();});
buildNav();
}
function quizForm(id){
var q = id? DB.quizBank.filter(function(x){ return x.id===id;})[0]: null;
var isNew =!q;
q = q || { subject:stageSubjects()[0]||"其他", qtype:"单选", stem:"", options:["","","",""], answer:0, analysis:""};
openModal('<h3>'+(isNew?"录入题目":"编辑题目")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
'<form id="quizFormEl"><div class="form-grid">'+
'<div class="field"><label>学科</label><select id="qqSubject">'+stageSubjects().map(function(x){ return "<option"+(x===q.subject?" selected":"")+">"+x+"</option>";}).join("")+'</select></div>'+
'<div class="field"><label>题型</label><select id="qqType">'+QUIZ_TYPES.map(function(x){ return "<option"+(x===q.qtype?" selected":"")+">"+x+"</option>";}).join("")+'</select></div>'+
'<div class="field full"><label>题干 *</label><textarea id="qqStem" rows="2" maxlength="300" placeholder="把题目写下来">'+esc(q.stem)+'</textarea><span class="err">请填写题干</span></div>'+
'<div class="field full" id="qqOptsWrap"><label>选项（A-D）</label><div id="qqOpts">'+
[0,1,2,3].map(function(i){ return '<div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;"><b style="width:18px;">'+String.fromCharCode(65+i)+'</b><input data-op="'+i+'" type="text" maxlength="80" value="'+esc(q.options[i]||"")+'" placeholder="选项'+String.fromCharCode(65+i)+'"></div>';}).join("")+'</div></div>'+
'<div class="field full" id="qqAnsWrap"><label>正确答案</label><div id="qqAns"></div></div>'+
'<div class="field full"><label>解析（可选）</label><textarea id="qqAnalysis" rows="2" maxlength="300" placeholder="为什么选这个？">'+esc(q.analysis||"")+'</textarea></div>'+
'</div><div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">'+(isNew?"加入题库":"保存修改")+'</button></div></form>');
bindCloseButtons();
function renderAns(){
var qt = modalBox.querySelector("#qqType").value;
var box = modalBox.querySelector("#qqAns");
modalBox.querySelector("#qqOptsWrap").style.display = (qt==="单选"||qt==="多选")? "": "none";
if(qt==="单选"){
box.innerHTML = [0,1,2,3].map(function(i){ return '<label style="margin-right:14px;"><input type="radio" name="qqA" value="'+i+'"'+(q.answer===i?" checked":"")+'> '+String.fromCharCode(65+i)+'</label>';}).join("");
} else if(qt==="多选"){
var cur = Array.isArray(q.answer)?q.answer:[];
box.innerHTML = [0,1,2,3].map(function(i){ return '<label style="margin-right:14px;"><input type="checkbox" name="qqA" value="'+i+'"'+(cur.indexOf(i)>=0?" checked":"")+'> '+String.fromCharCode(65+i)+'</label>';}).join("");
} else if(qt==="判断"){
box.innerHTML = '<label style="margin-right:14px;"><input type="radio" name="qqA" value="1"'+(q.answer===true?" checked":"")+'> 正确</label><label><input type="radio" name="qqA" value="0"'+(q.answer===false?" checked":"")+'> 错误</label>';
} else {
box.innerHTML = '<input id="qqAnsText" type="text" maxlength="60" placeholder="填空答案" value="'+esc(typeof q.answer==="string"?q.answer:"")+'">';
}
}
modalBox.querySelector("#qqType").addEventListener("change", renderAns);
renderAns();
modalBox.querySelector("#quizFormEl").addEventListener("submit", function(ev){
ev.preventDefault();
var stem = modalBox.querySelector("#qqStem");
if(!stem.value.trim()){ stem.closest(".field").classList.add("invalid"); return;}
var qt = modalBox.querySelector("#qqType").value;
var data = { subject:modalBox.querySelector("#qqSubject").value, qtype:qt, stem:stem.value.trim(),
analysis:modalBox.querySelector("#qqAnalysis").value.trim()};
if(qt==="单选"||qt==="多选"){
data.options = [0,1,2,3].map(function(i){ return modalBox.querySelector('[data-op="'+i+'"]').value.trim();});
if(data.options.some(function(o){ return!o;})){ toast("请把 4 个选项填完整"); return;}
var checked = Array.prototype.slice.call(modalBox.querySelectorAll('[name="qqA"]:checked')).map(function(x){ return +x.value;});
if(!checked.length){ toast("请勾选正确答案"); return;}
data.answer = qt==="单选"? checked[0]: checked;
} else if(qt==="判断"){
var j = modalBox.querySelector('[name="qqA"]:checked');
if(!j){ toast("请选择正确/错误"); return;}
data.answer = j.value==="1"; data.options = [];
} else {
var at = modalBox.querySelector("#qqAnsText").value.trim();
if(!at){ toast("请填写填空答案"); return;}
data.answer = at; data.options = [];
}
if(isNew){ data.id = uid(); DB.quizBank.push(data); toast("已加入题库（共 "+DB.quizBank.length+" 题）");}
else { var o = DB.quizBank.filter(function(x){ return x.id===id;})[0]; Object.keys(data).forEach(function(k){ o[k]=data[k];}); toast("题目已更新");}
saveDB(); closeModal(); renderQuiz();
});
}


/* ================================================================
   资料库（第9轮）：学习资料的链接 / 书籍 / 笔记元信息管理
   ================================================================ */
var RES_KINDS = ["链接","书籍","视频","笔记","其他"];
var resKindTab = "全部", resSubjTab = "全部";
function renderResources(){
  chipRow(document.getElementById("resKindTabs"), ["全部"].concat(RES_KINDS), resKindTab, function(v){ resKindTab=v; renderResources(); });
  chipRow(document.getElementById("resSubjTabs"), ["全部"].concat(stageSubjects()), resSubjTab, function(v){ resSubjTab=v; renderResources(); });
  var list = DB.resources.filter(function(r){
    return (resKindTab==="全部"||r.kind===resKindTab) && (resSubjTab==="全部"||r.subject===resSubjTab);
  }).sort(function(a,b){ return (b.createdAt||"")<(a.createdAt||"")?-1:1; });
  var box = document.getElementById("resList");
  if(!list.length){
    box.innerHTML = '<div class="card empty"><div class="em">'+iconSvg("link",30)+'</div><p>资料库是空的</p><span>把常用的网课、电子书、笔记链接收进来，找资料不再翻聊天记录。</span></div>';
    return;
  }
  box.innerHTML = list.map(function(r){
    var su = SUBJECTS[r.subject]||SUBJECTS["其他"];
    var linkPart = r.url ? '<a class="res-link" href="'+esc(r.url)+'" target="_blank" rel="noopener">打开链接 ↗</a>' : "";
    return '<div class="card res-card"><div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin-bottom:8px;">'+
      '<span class="tag tag-subj" style="background:'+su.color+'">'+esc(r.subject)+'</span>'+
      '<span class="tag">'+esc(r.kind)+'</span><b style="font-size:15px;">'+esc(r.title)+'</b>'+
      '<span style="flex:1"></span>'+
      '<button class="icon-btn" data-edit-res="'+r.id+'" aria-label="编辑资料">'+iconSvg("edit",15)+'</button>'+
      '<button class="icon-btn danger" data-del-res="'+r.id+'" aria-label="删除资料">'+iconSvg("trash",15)+'</button></div>'+
      (r.note?'<div class="txt" style="margin-bottom:8px;">'+esc(r.note)+'</div>':"")+ linkPart +'</div>';
  }).join("");
  box.querySelectorAll("[data-edit-res]").forEach(function(b){ b.addEventListener("click", function(){ resourceForm(b.getAttribute("data-edit-res")); }); });
  box.querySelectorAll("[data-del-res]").forEach(function(b){
    b.addEventListener("click", function(){
      confirmDialog("删除资料", "确定删除这条资料记录吗？", "删除", function(){
        DB.resources = DB.resources.filter(function(x){ return x.id!==b.getAttribute("data-del-res"); });
        saveDB(); renderResources(); toast("已删除");
      });
    });
  });
}
function resourceForm(id){
  var r = id ? DB.resources.filter(function(x){ return x.id===id; })[0] : null;
  var isNew = !r;
  r = r || { kind:"链接", subject:stageSubjects()[0]||"其他", title:"", url:"", note:"" };
  openModal('<h3>'+(isNew?"添加资料":"编辑资料")+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
    '<form id="resFormEl"><div class="form-grid">'+
    '<div class="field"><label>类型</label><select id="rsKind">'+RES_KINDS.map(function(k){ return "<option"+(k===r.kind?" selected":"")+">"+k+"</option>"; }).join("")+'</select></div>'+
    '<div class="field"><label>学科</label><select id="rsSubject">'+stageSubjects().map(function(x){ return "<option"+(x===r.subject?" selected":"")+">"+x+"</option>"; }).join("")+'</select></div>'+
    '<div class="field full"><label>标题 *</label><input id="rsTitle" type="text" maxlength="60" placeholder="如：B站《高数期末速成》" value="'+esc(r.title)+'"><span class="err">请填写标题</span></div>'+
    '<div class="field full"><label>链接（可选）</label><input id="rsUrl" type="url" maxlength="300" placeholder="https://…" value="'+esc(r.url||"")+'"></div>'+
    '<div class="field full"><label>备注</label><textarea id="rsNote" rows="2" maxlength="300" placeholder="这份资料好在哪？看到第几节了？">'+esc(r.note||"")+'</textarea></div>'+
    '</div><p style="font-size:12.5px; color:var(--ink-3); margin-top:10px;">资料库只保存链接与文字备注，不上传文件——大文件请存在网盘，链接收录进来即可。</p>'+
    '<div class="modal-foot"><button type="button" class="btn btn-ghost" data-close>取消</button><button type="submit" class="btn btn-primary">'+(isNew?"加入资料库":"保存修改")+'</button></div></form>');
  bindCloseButtons();
  modalBox.querySelector("#resFormEl").addEventListener("submit", function(ev){
    ev.preventDefault();
    var ti = modalBox.querySelector("#rsTitle");
    if(!ti.value.trim()){ ti.closest(".field").classList.add("invalid"); return; }
    var url = modalBox.querySelector("#rsUrl").value.trim();
    if(url && url.indexOf("http://")!==0 && url.indexOf("https://")!==0){ toast("链接请以 http:// 或 https:// 开头"); return; }
    var data = { kind:modalBox.querySelector("#rsKind").value, subject:modalBox.querySelector("#rsSubject").value,
      title:ti.value.trim(), url:url, note:modalBox.querySelector("#rsNote").value.trim() };
    if(isNew){ data.id = uid(); data.createdAt = todayKey(); DB.resources.unshift(data); toast("已加入资料库"); }
    else { var o = DB.resources.filter(function(x){ return x.id===id; })[0]; Object.keys(data).forEach(function(k){ o[k]=data[k]; }); toast("已更新"); }
    saveDB(); closeModal(); renderResources();
  });
}

/* ================================================================
   作息健康（第10轮）：睡眠记录 + 运动打卡整合
   ================================================================ */
function sleepHours(bed, wake){
  if(!bed || !wake) return null;
  var b = bed.split(":"), w = wake.split(":");
  var bm = (+b[0])*60 + (+b[1]), wm = (+w[0])*60 + (+w[1]);
  var diff = wm - bm;
  if(diff <= 0) diff += 24*60;
  return Math.round(diff/60*10)/10;
}
function renderSleepCard(){
  var box = document.getElementById("sleepCard");
  if(!box) return;
  var t = todayKey();
  var rec = DB.sleepLog[t] || { bed:"23:00", wake:"07:00" };
  var hrs = sleepHours(rec.bed, rec.wake);
  var days = last7Days();
  var vals = days.map(function(d){ var r = DB.sleepLog[d]; return r ? sleepHours(r.bed, r.wake) : 0; });
  var avg = vals.filter(function(v){ return v>0; });
  var avgH = avg.length ? (avg.reduce(function(a,b){ return a+b; },0)/avg.length).toFixed(1) : "—";
  var tip = hrs===null ? "" : hrs < 6 ? "睡眠严重不足，今天别熬夜了，效率比时长重要。"
    : hrs < 7 ? "睡眠偏少，试着提前半小时上床，记忆需要睡眠来巩固。"
    : hrs <= 9 ? "睡眠充足，大脑电量满格，适合挑战难题。"
    : "睡得有点多，注意作息规律，固定起床时间更重要。";
  box.innerHTML =
    '<h2>睡眠记录 <span class="tag" style="background:var(--primary-soft); color:var(--primary-deep);">近 7 天平均 '+avgH+' 小时</span></h2>'+
    '<div style="display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; margin:12px 0;">'+
    '<div class="field" style="min-width:130px;"><label>昨晚上床</label><input id="slBed" type="time" value="'+esc(rec.bed||"23:00")+'"></div>'+
    '<div class="field" style="min-width:130px;"><label>今晨起床</label><input id="slWake" type="time" value="'+esc(rec.wake||"07:00")+'"></div>'+
    '<button class="btn btn-primary btn-sm" id="slSave">保存睡眠</button>'+
    (hrs!==null?'<span class="txt">昨晚睡了 <b>'+hrs+'</b> 小时</span>':"")+'</div>'+
    (tip?'<div class="txt" style="margin-bottom:10px;">💤 '+tip+'</div>':"")+
    '<canvas class="chart" id="sleepChart" width="640" height="180"></canvas>';
  document.getElementById("slSave").addEventListener("click", function(){
    var bed = document.getElementById("slBed").value, wake = document.getElementById("slWake").value;
    if(!bed || !wake){ toast("请填写上床和起床时间"); return; }
    DB.sleepLog[t] = { bed:bed, wake:wake };
    addPoints(2, "记录睡眠");
    saveDB(); renderSleepCard();
    var h = sleepHours(bed, wake);
    toast("睡眠已记录："+h+" 小时 +2 分");
  });
  drawBarChart(document.getElementById("sleepChart"), vals, days.map(dayShort), "小时");
}
/* 运动打卡快捷入口：没有运动类打卡时一键创建 */
function ensureExerciseCheck(){
  var has = DB.checks.some(function(c){ return /运动|跑步|锻炼|健身/.test(c.name); });
  if(has){ toast("已有运动类打卡计划"); return; }
  DB.checks.push({ id:uid(), name:"运动 30 分钟", cat:"习惯", subject:"体育", freq:"每天", planMin:30, points:4, icon:"dumbbell" });
  saveDB(); renderCheckin();
  toast("已添加「运动 30 分钟」打卡，动起来吧");
}

/* ================================================================
   场景模板（第11轮）：一键切换备考场景
   ================================================================ */
var TEMPLATES = [
  { id:"kaoyan", name:"考研冲刺", emoji:"📚", stage:"考研", desc:"政治英语数学专业课四轮复习，90 天上岸计划。",
    exams:[{ name:"全国硕士研究生招生考试（初试）", days:90, note:"目标 380+" }],
    goals:[{ title:"考研上岸", type:"长期目标", days:90, desc:"每天进步一点点",
      milestones:["完成第一轮全面复习","英语真题刷完近 10 年","模考 3 次稳定 380+","专业课背诵 3 轮"] }],
    checks:[
      { name:"英语 · 单词 50 个 + 长难句", subject:"英语", planMin:30, points:5 },
      { name:"政治 · 刷题 1 章", subject:"政治", planMin:45, points:6 },
      { name:"专业课 · 精读 1 节", subject:"专业课", planMin:60, points:8 },
      { name:"睡前复盘 10 分钟", subject:"其他", planMin:10, points:3 } ],
    courses:[
      { name:"上午自习", weekday:1, start:"08:30", end:"11:30", subject:"政治", place:"图书馆" },
      { name:"上午自习", weekday:3, start:"08:30", end:"11:30", subject:"英语", place:"图书馆" },
      { name:"下午自习", weekday:2, start:"14:00", end:"17:30", subject:"数学", place:"图书馆" },
      { name:"下午自习", weekday:4, start:"14:00", end:"17:30", subject:"专业课", place:"图书馆" },
      { name:"周末模考", weekday:6, start:"09:00", end:"12:00", subject:"英语", place:"自习室" } ],
    resources:[
      { kind:"书籍", subject:"政治", title:"肖1000", note:"马原+毛中特先刷完" },
      { kind:"书籍", subject:"英语", title:"历年真题（近 10 年）", note:"精做阅读，总结题型" } ] },
  { id:"kaogong", name:"考公备考", emoji:"🏛️", stage:"考公考编", desc:"行测申论双线推进，60 天冲刺上岸。",
    exams:[{ name:"国家公务员考试（笔试）", days:60, note:"目标进面" }],
    goals:[{ title:"公务员上岸", type:"长期目标", days:60, desc:"行测申论双线推进",
      milestones:["行测五大模块刷完一轮","申论大作文写满 10 篇","全真模考 5 次","面试提前准备"] }],
    checks:[
      { name:"行测 · 刷题 50 道", subject:"行测", planMin:60, points:6 },
      { name:"申论 · 小题 2 道", subject:"申论", planMin:45, points:6 },
      { name:"时政积累 20 分钟", subject:"公共基础", planMin:20, points:3 } ],
    courses:[
      { name:"晚间行测班", weekday:2, start:"19:00", end:"21:00", subject:"行测", place:"线上" },
      { name:"晚间行测班", weekday:4, start:"19:00", end:"21:00", subject:"行测", place:"线上" },
      { name:"周末申论精讲", weekday:6, start:"09:00", end:"11:30", subject:"申论", place:"线上" } ],
    resources:[
      { kind:"书籍", subject:"行测", title:"粉笔 980", note:"模块刷题主力" },
      { kind:"笔记", subject:"申论", title:"大作文素材本", note:"名言+案例分类积累" } ] },
  { id:"gaokao", name:"高考冲刺", emoji:"🎯", stage:"高中", desc:"一轮收官、二轮突破、三轮模考，100 天全力以赴。",
    exams:[{ name:"普通高等学校招生全国统一考试", days:100, note:"目标 600+" }],
    goals:[{ title:"高考 600+", type:"长期目标", days:100, desc:"每天进步一点点",
      milestones:["一轮复习收官","二轮专题突破","三轮全真模考","心态与作息调整"] }],
    checks:[
      { name:"晨读 30 分钟", subject:"语文", planMin:30, points:4 },
      { name:"数学限时训练 1 套", subject:"数学", planMin:60, points:6 },
      { name:"英语单词 + 完形", subject:"英语", planMin:30, points:4 },
      { name:"错题复盘 20 分钟", subject:"其他", planMin:20, points:4 } ],
    courses:[
      { name:"晚自习", weekday:1, start:"19:00", end:"21:30", subject:"数学", place:"教室" },
      { name:"晚自习", weekday:3, start:"19:00", end:"21:30", subject:"英语", place:"教室" },
      { name:"周末大考", weekday:6, start:"08:00", end:"11:30", subject:"语文", place:"教室" } ],
    resources:[
      { kind:"书籍", subject:"数学", title:"五年高考三年模拟", note:"按专题刷" } ] },
  { id:"finalweek", name:"大学期末周", emoji:"🎓", stage:"大学", desc:"21 天火力全开，GPA 保卫战。",
    exams:[{ name:"期末考试周", days:21, note:"目标 GPA 3.5+" }],
    goals:[{ title:"期末 GPA 3.5+", type:"月目标", days:21, desc:"不挂科是底线",
      milestones:["整理各科复习笔记","刷完近 3 年历年题","重点章节二刷","考前心态调整"] }],
    checks:[
      { name:"图书馆自习 3 小时", subject:"专业课", planMin:180, points:10 },
      { name:"背诵 1 小时", subject:"其他", planMin:60, points:5 } ],
    courses:[
      { name:"图书馆自习", weekday:1, start:"09:00", end:"12:00", subject:"专业课", place:"图书馆" },
      { name:"图书馆自习", weekday:3, start:"14:00", end:"17:00", subject:"高等数学", place:"图书馆" },
      { name:"图书馆自习", weekday:5, start:"09:00", end:"12:00", subject:"大学英语", place:"图书馆" } ],
    resources:[
      { kind:"笔记", subject:"专业课", title:"各科复习笔记", note:"按考试周倒排整理" } ] }
];
function renderTemplates(){
  var box = document.getElementById("templateGrid");
  if(!box) return;
  box.innerHTML = TEMPLATES.map(function(t){
    var applied = DB.templatesApplied.indexOf(t.id) >= 0;
    return '<div class="tpl-card"><div class="tpl-emoji">'+t.emoji+'</div>'+
      '<div class="tpl-name">'+esc(t.name)+(applied?' <span class="tag" style="background:var(--green-soft); color:var(--green);">已应用</span>':"")+'</div>'+
      '<div class="txt" style="margin:6px 0 10px;">'+esc(t.desc)+'</div>'+
      '<div class="goal-meta" style="margin-bottom:12px;"><span>'+t.stage+'</span><span>'+t.exams.length+' 场考试</span><span>'+t.checks.length+' 个打卡</span><span>'+t.courses.length+' 节课程</span></div>'+
      '<button class="btn btn-soft btn-sm" data-tpl="'+t.id+'">'+(applied?"再次应用":"一键应用")+'</button></div>';
  }).join("");
  box.querySelectorAll("[data-tpl]").forEach(function(b){
    b.addEventListener("click", function(){ applyTemplate(b.getAttribute("data-tpl")); });
  });
}
function applyTemplate(tid){
  var t = TEMPLATES.filter(function(x){ return x.id===tid; })[0];
  if(!t) return;
  confirmDialog("应用模板「"+t.name+"」",
    "将切换学段为「"+t.stage+"」，并添加 "+t.exams.length+" 场考试、"+t.goals[0].milestones.length+" 个里程碑目标、"+t.checks.length+" 个打卡、"+t.courses.length+" 节课程。已有数据不会被删除。确定吗？",
    "应用模板", function(){
      var tk = todayKey();
      DB.student.stage = t.stage;
      t.exams.forEach(function(e){
        if(!DB.exams.some(function(x){ return x.name===e.name; }))
          DB.exams.push({ id:uid(), name:e.name, date:addDays(tk, e.days), note:e.note||"" });
      });
      t.goals.forEach(function(g){
        DB.goals.push({ id:uid(), title:g.title, type:g.type, deadline:addDays(tk, g.days), desc:g.desc||"",
          milestones:g.milestones.map(function(m){ return { id:uid(), text:m, done:false }; }), done:false, createdAt:tk });
      });
      t.checks.forEach(function(c){
        if(!DB.checks.some(function(x){ return x.name===c.name; }))
          DB.checks.push({ id:uid(), name:c.name, cat:"习惯", subject:c.subject, freq:"每天", planMin:c.planMin||20, points:c.points||4, icon:"target" });
      });
      t.courses.forEach(function(c){
        DB.courses.push({ id:uid(), name:c.name, weekday:c.weekday, start:c.start, end:c.end, mode:"线下",
          place:c.place||"自习室", teacher:"", replay:false, school:false, subject:c.subject, suspended:false, oddEven:"每周", leave:[] });
      });
      t.resources.forEach(function(r){
        DB.resources.unshift({ id:uid(), kind:r.kind, subject:r.subject, title:r.title, url:"", note:r.note||"", createdAt:tk });
      });
      if(DB.templatesApplied.indexOf(t.id)<0) DB.templatesApplied.push(t.id);
      addPoints(10, "应用场景模板「"+t.name+"」");
      saveDB(); renderAll(); renderSettings(); renderTemplates();
      toast("模板已应用：学段 → "+t.stage+"，配套计划已就绪 +10 分");
    });
}

/* ================================================================
   体验工程（第12轮）：主题 / 新手引导 / 备份提醒
   ================================================================ */
function applyTheme(){
  var th = (DB.settings && DB.settings.theme) || "auto";
  var root = document.documentElement;
  if(th === "dark") root.setAttribute("data-theme", "dark");
  else if(th === "light") root.setAttribute("data-theme", "light");
  else root.removeAttribute("data-theme");
  document.querySelectorAll("[data-theme-pick]").forEach(function(b){
    var on = b.getAttribute("data-theme-pick") === th;
    b.classList.toggle("btn-primary", on);
    b.classList.toggle("btn-soft", !on);
  });
}
function showGuide(){
  var steps = [
    { t:"欢迎使用学航助手", d:"这是为你打造的全学段学习规划工具：从小学到考研、考公，一个 App 管全部。核心循环只有五步：定目标 → 做任务 → 专注 → 复习 → 复盘。" },
    { t:"先定一个小目标", d:"去「目标」页新建第一个目标，拆成 3 个小里程碑；再去「任务」页录入今天的待办，用专注计时一个一个拿下。记得越牢、间隔越长的复习，交给「复习中心」的 SM-2 算法。" },
    { t:"数据属于你自己", d:"所有数据只保存在这台设备的浏览器里，不上传任何服务器。换设备前记得去「设置」导出 JSON 备份。备考的话，可以试试「设置 → 场景模板」一键切换考研 / 考公 / 高考 / 期末周。" }
  ];
  var i = 0;
  function render(){
    openModal('<h3>'+steps[i].t+'<button class="icon-btn x" data-close aria-label="关闭">'+iconSvg("x",18)+'</button></h3>'+
      '<p style="font-size:14.5px; line-height:1.8; color:var(--ink-2);">'+steps[i].d+'</p>'+
      '<div style="display:flex; gap:6px; justify-content:center; margin:14px 0;">'+
      steps.map(function(_,k){ return '<i style="width:8px; height:8px; border-radius:99px; background:'+(k===i?"var(--primary)":"var(--line-2)")+';"></i>'; }).join("")+'</div>'+
      '<div class="modal-ops"><button class="btn btn-ghost" id="gdSkip">跳过</button>'+
      (i<steps.length-1 ? '<button class="btn btn-primary" id="gdNext">下一步</button>' : '<button class="btn btn-primary" id="gdDone">开始使用</button>')+'</div>');
    bindCloseButtons();
    function finish(){ DB.settings.guided = true; saveDB(); closeModal(); }
    document.getElementById("gdSkip").addEventListener("click", finish);
    var nx = document.getElementById("gdNext");
    if(nx) nx.addEventListener("click", function(){ i++; render(); });
    var dn = document.getElementById("gdDone");
    if(dn) dn.addEventListener("click", finish);
  }
  render();
}
