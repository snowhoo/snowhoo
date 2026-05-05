/**
 * 小红故事 - 访客互动增强脚本
 * 功能：
 * 1. 节气/节日横幅（仅当日显示）
 * 2. 趣味访客统计 + 幸运号码
 */

(function () {
  'use strict';

  // ========================
  // 一、节气 & 节日横幅
  // ========================

  // 2026 年二十四节气
  var SOLAR_TERMS_2026 = [
    { date: '2026-01-05', name: '小寒', desc: '小寒料峭，望春来早' },
    { date: '2026-01-20', name: '大寒', desc: '大寒须守火，无由盼春归' },
    { date: '2026-02-04', name: '立春', desc: '冬去春来，万物复苏' },
    { date: '2026-02-19', name: '雨水', desc: '好雨知时节，当春乃发生' },
    { date: '2026-03-05', name: '惊蛰', desc: '春雷响，万物长' },
    { date: '2026-03-20', name: '春分', desc: '昼夜平分，春风和煦' },
    { date: '2026-04-04', name: '清明', desc: '清明时节，思绪纷纷' },
    { date: '2026-04-20', name: '谷雨', desc: '谷雨春光晓，山川黛色青' },
    { date: '2026-05-05', name: '立夏', desc: '四月清和雨乍晴，南山当户转分明' },
    { date: '2026-05-21', name: '小满', desc: '小满动三车，忙得不知他' },
    { date: '2026-06-05', name: '芒种', desc: '时雨及芒种，四野皆插秧' },
    { date: '2026-06-21', name: '夏至', desc: '昼晷已云极，宵漏自此长' },
    { date: '2026-07-07', name: '小暑', desc: '倏忽温风至，因循小暑来' },
    { date: '2026-07-22', name: '大暑', desc: '大暑三秋近，林钟九夏移' },
    { date: '2026-08-07', name: '立秋', desc: '乳鸦啼散玉屏空，一枕新凉一扇风' },
    { date: '2026-08-23', name: '处暑', desc: '处暑无三日，新凉直万金' },
    { date: '2026-09-07', name: '白露', desc: '蒹葭苍苍，白露为霜' },
    { date: '2026-09-23', name: '秋分', desc: '金气秋分，风清露冷秋期半' },
    { date: '2026-10-08', name: '寒露', desc: '袅袅凉风动，凄凄寒露零' },
    { date: '2026-10-23', name: '霜降', desc: '霜降水返壑，风落木归山' },
    { date: '2026-11-07', name: '立冬', desc: '冻笔新诗懒写，寒炉美酒时温' },
    { date: '2026-11-22', name: '小雪', desc: '小雪已晴芦叶暗，长波乍急鹤声嘶' },
    { date: '2026-12-07', name: '大雪', desc: '大雪江南见未曾，今年方始是严凝' },
    { date: '2026-12-21', name: '冬至', desc: '天时人事日相催，冬至阳生春又来' },
  ];

  // 2026 年主要节日
  var FESTIVALS_2026 = [
    { date: '2026-01-01', name: '元旦', desc: '新年第一天，愿你万事胜意', color: '#e74c3c', bgImg: '/images/banner/yuandan-bg.png' },
    { date: '2026-02-14', name: '情人节', desc: '愿有情人终成眷属', color: '#e91e63', bgImg: '/images/banner/qingren-bg.png' },
    { date: '2026-02-17', name: '春节', desc: '恭贺新禧，万事如意！', color: '#c41e3a', bgImg: '/images/banner/chunjie-bg.png' },
    { date: '2026-03-03', name: '元宵节', desc: '灯火阑珊处，花市灯如昼', color: '#e67e22', bgImg: '/images/banner/yuanxiao-bg.png' },
    { date: '2026-04-05', name: '清明节', desc: '清明时节雨纷纷，路上行人欲断魂', color: '#6ab04c', bgImg: '/images/banner/qingming-bg.png' },
    { date: '2026-05-01', name: '劳动节', desc: '致敬每一位劳动者，节日快乐', color: '#c0392b', bgImg: '/images/banner/laodong-bg.png' },
    { date: '2026-05-31', name: '端午节', desc: '粽叶飘香，端午安康', color: '#27ae60', bgImg: '/images/banner/duanwu-bg.png' },
    { date: '2026-08-19', name: '七夕节', desc: '金风玉露一相逢，便胜却人间无数', color: '#c0392b', bgImg: '/images/banner/qixi-bg.png' },
    { date: '2026-10-01', name: '国庆节', desc: '祝祖国繁荣昌盛！', color: '#c41e3a', bgImg: '/images/banner/guoqing-bg.png' },
    { date: '2026-10-08', name: '中秋节', desc: '但愿人长久，千里共婵娟', color: '#e67e22', bgImg: '/images/banner/zhongqiu-bg.png' },
    { date: '2026-10-25', name: '重阳节', desc: '九九重阳，登高望远', color: '#d35400', bgImg: '/images/banner/chongyang-bg.png' },
    { date: '2026-12-25', name: '圣诞节', desc: 'Merry Christmas! 圣诞快乐', color: '#27ae60', bgImg: '/images/banner/shengdan-bg.png' },
  ];

  function getTodayStr() {
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }

  function showBanner() {
    var today = getTodayStr();
    // 操作已存在于 #page-header 中的占位 div
    var banner = document.getElementById('solar-term-banner');
    if (!banner) return;

    // 优先检查节日（节日优先于节气）
    for (var i = 0; i < FESTIVALS_2026.length; i++) {
      var f = FESTIVALS_2026[i];
      if (f.date === today) {
        banner.className = 'festival-banner';
        banner.style.display = 'block';
        banner.style.backgroundImage = 'url(' + f.bgImg + ')';
        banner.style.backgroundSize = 'cover';
        banner.style.backgroundPosition = 'center';
        banner.style.backgroundRepeat = 'no-repeat';
        var fp = f.date.split('-');
        var datePrefix = parseInt(fp[1],10) + '月' + parseInt(fp[2],10) + '日';
        banner.innerHTML =
          '<div class="st-banner-inner" style="border-color:' + f.color + '20' + ';">' +
          '<span class="st-name" style="color:' + f.color + ';">今天是' + datePrefix + '，' + f.name + '</span>' +
          '<span class="st-desc" style="color:#555;">' + f.desc + '</span>' +
          '</div>';
        return;
      }
    }

    // 其次检查节气
    for (var j = 0; j < SOLAR_TERMS_2026.length; j++) {
      var st = SOLAR_TERMS_2026[j];
      if (st.date === today) {
        banner.className = '';
        banner.style.display = 'block';
        banner.style.backgroundImage = '';
        banner.innerHTML =
          '<div class="st-banner-inner">' +
          '<span class="st-icon">🌿</span>' +
          '<span class="st-name">今日 ' + st.name + '</span>' +
          '<span class="st-desc">' + st.desc + '</span>' +
          '<span class="st-icon">🌿</span>' +
          '</div>';
        return;
      }
    }

    // 今日无节日/节气，隐藏横幅
    banner.style.display = 'none';
  }

  // ========================
  // 二、访客幸运号浮动标签（首页右上方）
  // ========================

  function getLuckyNum(visitorId) {
    var seed = 0;
    for (var i = 0; i < visitorId.length; i++) {
      seed = ((seed << 5) - seed + visitorId.charCodeAt(i)) | 0;
    }
    return Math.abs(seed % 9000 + 1000); // 1000~9999
  }

  function isHomePage() {
    // 判断是否首页
    var path = window.location.pathname;
    return path === '/' || path === '/index.html' || path === '' || path === '/page/';
  }

  function getVisitCount() {
    var countKey = 'snowhoo_visit_count';
    return parseInt(localStorage.getItem(countKey) || '0', 10);
  }

  function initLuckyTag() {
    // 不再限制首页，每页都显示

    var visitKey = 'snowhoo_visitor_id';
    var countKey = 'snowhoo_visit_count';

    // 获取或创建访客ID
    var visitorId = localStorage.getItem(visitKey);
    if (!visitorId) {
      visitorId = 'v_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(visitKey, visitorId);
    }

    // 增加访问次数
    var count = parseInt(localStorage.getItem(countKey) || '0', 10) + 1;
    localStorage.setItem(countKey, count);

    var lucky = getLuckyNum(visitorId);

    // 生成徽章文案
    var badge = '';
    var emoji = '🍀';
    if (count === 1) {
      badge = '初次见面';
      emoji = '🌟';
    } else if (count <= 5) {
      badge = '常客';
      emoji = '💫';
    } else if (count <= 10) {
      badge = '老粉';
      emoji = '🔥';
    } else if (count <= 20) {
      badge = '资深';
      emoji = '🎉';
    } else if (count <= 50) {
      badge = '铁粉';
      emoji = '🏆';
    } else {
      badge = '元老';
      emoji = '👑';
    }

    var tag = document.createElement('div');
    tag.id = 'lucky-visitor-tag';
    tag.style.cursor = 'pointer';
    tag.onclick = function() { window.location.href = 'https://snowhoo.net/guestbook/'; };
    tag.innerHTML =
      '<div class="lucky-tag-inner">' +
        '<span class="lucky-emoji">' + emoji + '</span>' +
        '<div class="lucky-info">' +
          '<div class="lucky-row1"><span class="lucky-badge">' + badge + '</span><span class="lucky-readers">读友</span><span class="lucky-count">第' + count + '次来访</span></div>' +
          '<div class="lucky-row2"><span class="lucky-num">幸运号 #' + lucky + '</span><span class="lucky-lottery">留言可抽奖！</span></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(tag);
  }

  // ========================
  // 启动
  // ========================

  function init() {
    showBanner();
    initLuckyTag();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  document.addEventListener('pjax:complete', function () {
    showBanner();
  });
})();
