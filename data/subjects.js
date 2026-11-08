/* 中山一号 · 科目元数据、段位、成就、知识点章节
 * 六科专属入口的配置全部集中在这里，后面加内容只改本文件。 */
window.ZS_SUBJECTS = [
  { id: 'chinese', name: '语文', short: '语', color: '#c0392b', soft: '#fdeceb',
    desc: '现代文阅读 · 古诗文 · 语言文字运用 · 作文',
    chapters: ['论述类文本阅读', '文学类文本阅读', '实用类文本阅读', '文言文阅读',
               '古代诗歌鉴赏', '名句名篇默写', '语言文字运用', '写作'] },
  { id: 'math', name: '数学', short: '数', color: '#1f5fbf', soft: '#e8f0fd',
    desc: '函数与导数 · 数列 · 立体几何 · 解析几何 · 概率统计',
    chapters: ['集合与常用逻辑用语', '函数与导数', '三角函数与解三角形', '数列',
               '立体几何', '解析几何', '概率与统计', '复数与向量', '不等式'] },
  { id: 'english', name: '英语', short: '英', color: '#7b3fa1', soft: '#f3eafb',
    desc: '阅读理解 · 完形填空 · 语法填空 · 短文改错 · 写作',
    chapters: ['阅读理解', '七选五', '完形填空', '语法填空', '短文改错', '应用文写作', '读后续写'] },
  { id: 'physics', name: '物理', short: '物', color: '#0e7c86', soft: '#e3f5f6',
    desc: '力学 · 电磁学 · 热学 · 光学 · 近代物理 · 实验',
    chapters: ['运动学与牛顿定律', '功和能', '动量', '圆周运动与万有引力', '机械振动与波',
               '静电场', '恒定电流', '磁场与电磁感应', '交变电流', '热学', '光学与近代物理', '实验'] },
  { id: 'chemistry', name: '化学', short: '化', color: '#b5651d', soft: '#fdf0e3',
    desc: '物质结构 · 反应原理 · 有机化学 · 实验探究',
    chapters: ['物质结构与元素周期律', '化学键与晶体', '化学反应原理', '水溶液中的离子平衡',
               '电化学', '元素化合物', '有机化学基础', '化学实验', '工艺流程'] },
  { id: 'politics', name: '政治', short: '政', color: '#8b1e3f', soft: '#fbeaf0',
    desc: '中国特色社会主义 · 经济与社会 · 政治与法治 · 哲学 · 文化 · 当代国际政治',
    chapters: ['中国特色社会主义', '经济与社会', '政治与法治', '哲学唯物论', '哲学辩证法',
               '认识论与历史观', '文化与文化强国', '当代国际政治与经济', '法律与生活', '逻辑与思维'] }
];

window.ZS_SUBJECT_MAP = {};
window.ZS_SUBJECTS.forEach(function (s) { window.ZS_SUBJECT_MAP[s.id] = s; });

/* 广西 2024 起「3+1+2」：语数英用新课标 II 卷，物化政等选择性科目广西自主命题。
   这里只做题目适用范围筛选的默认值，不改题库原始 region。 */
window.ZS_REGION_INFO = {
  home: '广西',
  note: '广西自 2024 年起实行「3+1+2」：语文、数学、英语使用新课标 II 卷；物理、化学、政治等选择性考试科目为广西自主命题。本站默认优先展示广西及新课标 II 卷题目，可切换拓展省份。',
  extended: ['新课标II卷适用省份', '山西', '辽宁', '吉林', '黑龙江', '广西', '海南',
             '重庆', '贵州', '云南', '西藏', '甘肃', '新疆']
};

/* 段位：按累计 XP 晋级，纯文字徽章，不依赖图片 */
window.ZS_RANKS = [
  { min: 0,    name: '初入书山', badge: '壹' },
  { min: 100,  name: '识字童子', badge: '贰' },
  { min: 300,  name: '勤学秀才', badge: '叁' },
  { min: 600,  name: '笃行廪生', badge: '肆' },
  { min: 1000, name: '博闻举人', badge: '伍' },
  { min: 1600, name: '明理解元', badge: '陆' },
  { min: 2400, name: '贯通贡士', badge: '柒' },
  { min: 3500, name: '登科进士', badge: '捌' },
  { min: 5000, name: '翰林编修', badge: '玖' },
  { min: 7000, name: '金榜状元', badge: '拾' }
];

/* 成就：达成条件在 app.js 的 checkAchievements() 里判定 */
window.ZS_ACHIEVEMENTS = [
  { id: 'first',      name: '第一题',     desc: '完成第一道题',              icon: '起' },
  { id: 'combo5',     name: '手感来了',   desc: '连续答对 5 题',             icon: '连' },
  { id: 'combo10',    name: '十连不败',   desc: '连续答对 10 题',            icon: '十' },
  { id: 'level3',     name: '闯关新秀',   desc: '任意一关拿到 3 星',         icon: '星' },
  { id: 'subject1',   name: '单科通关',   desc: '通关某一科全部关卡',        icon: '通' },
  { id: 'wrong0',     name: '错题清零',   desc: '把错题本全部标记掌握',      icon: '净' },
  { id: 'exam1',      name: '首战模考',   desc: '完成一次在线模拟考试',      icon: '考' },
  { id: 'exam90',     name: '高分答卷',   desc: '模考得分率 ≥ 90%',          icon: '优' },
  { id: 'talk1',      name: '开口讲书',   desc: '完成一次语音复盘',          icon: '讲' },
  { id: 'outline1',   name: '提纲成篇',   desc: '生成第一份复习提纲',        icon: '纲' },
  { id: 'daily7',     name: '七日不辍',   desc: '完成一个七天练习包',        icon: '恒' },
  { id: 'note1',      name: '笔记入库',   desc: '上传或口述第一份笔记',      icon: '记' }
];

/* 每科 10 关，每关 8 题；关卡按难度递进，题目由 buildLevels() 从题库切分 */
window.ZS_LEVELS_PER_SUBJECT = 10;
window.ZS_QUESTIONS_PER_LEVEL = 8;
