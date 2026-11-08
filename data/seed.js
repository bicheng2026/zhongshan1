/* 中山一号 · 内置兜底数据
 * 作用：即使开源题库文件缺失/抓取失败，全站所有功能（闯关、模考、每日一练、AI 指导）
 * 也能完整跑起来不会白屏。开源数据到位后自动让位，本文件只在空缺时补齐。 */
(function () {
  'use strict';
  window.ZS_Q = window.ZS_Q || {};

  function q(subject, n, o) {
    return Object.assign({
      id: 'q_' + subject + '_seed' + String(n).padStart(2, '0'),
      subject: subject, type: 'choice', stem: '', options: [], answer: '', analysis: '',
      year: 2024, source: '中山一号内置样例题', region: '广西', paper: '',
      tags: [], difficulty: 2, score: 5
    }, o);
  }
  function opts(a, b, c, d) {
    return [{ key: 'A', text: a }, { key: 'B', text: b }, { key: 'C', text: c }, { key: 'D', text: d }];
  }

  var seed = {
    math: [
      q('math', 1, { stem: '已知集合 $A=\\{x\\in\\mathbb{R}\\mid |x|\\le 2\\}$，$B=\\{x\\in\\mathbb{Z}\\mid \\sqrt{x}\\le 4\\}$，则 $A\\cap B=$',
        options: opts('$(0,2)$', '$[0,2]$', '$\\{0,2\\}$', '$\\{0,1,2\\}$'), answer: 'D',
        analysis: '$B=\\{0,1,2,\\dots,16\\}$（$x$ 为非负整数且 $x\\le16$），与 $A=[-2,2]$ 取交集得 $\\{0,1,2\\}$。',
        year: 2010, source: '2010 新课标 数学选择题', region: '全国', tags: ['集合', '交集'], difficulty: 1 }),
      q('math', 2, { stem: '函数 $f(x)=\\ln x + \\dfrac{1}{x-2}$ 的定义域是',
        options: opts('$(0,+\\infty)$', '$(0,2)\\cup(2,+\\infty)$', '$[0,2)\\cup(2,+\\infty)$', '$(2,+\\infty)$'), answer: 'B',
        analysis: '$\\ln x$ 要求 $x>0$；分母要求 $x\\ne 2$。取交集得 $(0,2)\\cup(2,+\\infty)$。',
        tags: ['函数定义域'], difficulty: 2 }),
      q('math', 3, { stem: '已知等差数列 $\\{a_n\\}$ 中 $a_1=2$，$a_3+a_5=16$，则公差 $d=$',
        options: opts('$1$', '$2$', '$3$', '$4$'), answer: 'B',
        analysis: '$a_3+a_5=2a_1+6d=4+6d=16$，故 $d=2$。也可用 $a_3+a_5=2a_4$ 快速定位。',
        tags: ['等差数列'], difficulty: 2 }),
      q('math', 4, { stem: '若 $\\sin\\alpha=\\dfrac{3}{5}$ 且 $\\alpha\\in(\\dfrac{\\pi}{2},\\pi)$，则 $\\tan\\alpha=$',
        options: opts('$\\dfrac{3}{4}$', '$-\\dfrac{3}{4}$', '$\\dfrac{4}{3}$', '$-\\dfrac{4}{3}$'), answer: 'B',
        analysis: '第二象限 $\\cos\\alpha=-\\dfrac45$，故 $\\tan\\alpha=\\dfrac{3/5}{-4/5}=-\\dfrac34$。象限符号是本题唯一陷阱。',
        tags: ['同角三角函数'], difficulty: 2 }),
      q('math', 5, { stem: '求函数 $f(x)=x^3-3x^2+1$ 的极大值。', type: 'open',
        answer: '$f(0)=1$',
        analysis: "$f'(x)=3x^2-6x=3x(x-2)$，在 $x<0$ 为正、$0<x<2$ 为负、$x>2$ 为正，故 $x=0$ 取极大值 $f(0)=1$；$x=2$ 取极小值 $-3$。",
        tags: ['导数', '极值'], difficulty: 3, score: 12 }),
      q('math', 6, { stem: '已知向量 $\\vec a=(1,2)$，$\\vec b=(x,-1)$，若 $\\vec a\\perp\\vec b$，则 $x=$',
        options: opts('$-2$', '$-1$', '$1$', '$2$'), answer: 'D',
        analysis: '$\\vec a\\cdot\\vec b = x-2=0$，故 $x=2$。', tags: ['向量'], difficulty: 1 })
    ],
    physics: [
      q('physics', 1, { stem: '一物体从静止开始做匀加速直线运动，第 1 s 内位移为 2 m，则前 3 s 内位移为',
        options: opts('$6\\,\\mathrm{m}$', '$12\\,\\mathrm{m}$', '$18\\,\\mathrm{m}$', '$24\\,\\mathrm{m}$'), answer: 'C',
        analysis: '由 $s_1=\\tfrac12 a(1)^2=2$ 得 $a=4\\,\\mathrm{m/s^2}$；$s_3=\\tfrac12 a(3)^2=18\\,\\mathrm{m}$。也可用初速为零时位移比 $1:4:9$。',
        tags: ['运动学'], difficulty: 2 }),
      q('physics', 2, { stem: '关于摩擦力，下列说法正确的是',
        options: opts('摩擦力方向总与物体运动方向相反', '静摩擦力大小恒等于 $\\mu N$',
          '滑动摩擦力可以与物体运动方向相同', '摩擦力一定做负功'), answer: 'C',
        analysis: '摩擦力阻碍的是「相对运动或相对运动趋势」，不是对地运动。传送带加速物体时滑动摩擦力与运动方向相同且做正功；静摩擦力大小由平衡/牛顿第二定律决定，只有最大静摩擦力才约等于 $\\mu N$。',
        tags: ['摩擦力'], difficulty: 3 }),
      q('physics', 3, { stem: '质量为 2 kg 的物体受合力 6 N，从静止开始运动 3 s，末速度大小为',
        options: opts('$3\\,\\mathrm{m/s}$', '$6\\,\\mathrm{m/s}$', '$9\\,\\mathrm{m/s}$', '$18\\,\\mathrm{m/s}$'), answer: 'C',
        analysis: '$a=F/m=3\\,\\mathrm{m/s^2}$，$v=at=9\\,\\mathrm{m/s}$。', tags: ['牛顿第二定律'], difficulty: 1 }),
      q('physics', 4, { stem: '闭合电路中外电阻增大时（电源内阻不计为零），以下说法正确的是',
        options: opts('路端电压减小', '总电流增大', '路端电压增大', '电源输出功率一定增大'), answer: 'C',
        analysis: '$I=\\dfrac{E}{R+r}$，$R$ 增大则 $I$ 减小，$U=E-Ir$ 增大。输出功率在 $R=r$ 时最大，故不一定增大。',
        tags: ['闭合电路欧姆定律'], difficulty: 3 }),
      q('physics', 5, { stem: '一带电粒子垂直射入匀强磁场，仅受洛伦兹力，其运动性质是',
        options: opts('匀加速直线运动', '匀速圆周运动', '平抛运动', '匀减速直线运动'), answer: 'B',
        analysis: '洛伦兹力始终垂直速度、不做功，速率不变，只改变方向，充当向心力，故为匀速圆周运动，半径 $r=\\dfrac{mv}{qB}$。',
        tags: ['洛伦兹力'], difficulty: 2 }),
      q('physics', 6, { stem: '一个物体沿光滑斜面下滑，机械能是否守恒？简述理由。', type: 'open',
        answer: '守恒。斜面光滑无摩擦，支持力始终垂直于位移不做功，只有重力做功，故机械能守恒。',
        analysis: '判断守恒看「除重力/弹簧弹力外是否有其他力做功」，不是看是否受其他力。支持力存在但不做功。',
        tags: ['机械能守恒'], difficulty: 2, score: 12 })
    ],
    chemistry: [
      q('chemistry', 1, { stem: '设 $N_A$ 为阿伏加德罗常数的值。下列说法正确的是',
        options: opts('标准状况下 $22.4\\,\\mathrm{L}$ 水含分子数为 $N_A$',
          '$1\\,\\mathrm{mol}\\ \\mathrm{NaCl}$ 中含 $N_A$ 个 $\\mathrm{NaCl}$ 分子',
          '$28\\,\\mathrm{g}\\ \\mathrm{N_2}$ 含分子数为 $N_A$',
          '$1\\,\\mathrm{mol/L}$ 的盐酸中含 $N_A$ 个 $\\mathrm{H^+}$'), answer: 'C',
        analysis: 'A：标况下水是液体，不能用气体摩尔体积；B：离子晶体不存在分子；D：没给体积。$28\\,\\mathrm{g}\\ \\mathrm{N_2}=1\\,\\mathrm{mol}$。',
        tags: ['阿伏加德罗常数'], difficulty: 3 }),
      q('chemistry', 2, { stem: '下列元素中，非金属性最强的是',
        options: opts('$\\mathrm{F}$', '$\\mathrm{Cl}$', '$\\mathrm{O}$', '$\\mathrm{N}$'), answer: 'A',
        analysis: '同周期从左到右非金属性增强，同主族从上到下减弱，氟是非金属性最强的元素。',
        tags: ['元素周期律'], difficulty: 1 }),
      q('chemistry', 3, { stem: '下列反应中，属于氧化还原反应的是',
        options: opts('$\\mathrm{CaCO_3}\\xrightarrow{\\Delta}\\mathrm{CaO}+\\mathrm{CO_2}$',
          '$\\mathrm{NaOH}+\\mathrm{HCl}=\\mathrm{NaCl}+\\mathrm{H_2O}$',
          '$\\mathrm{Zn}+2\\mathrm{HCl}=\\mathrm{ZnCl_2}+\\mathrm{H_2}\\uparrow$',
          '$\\mathrm{BaCl_2}+\\mathrm{Na_2SO_4}=\\mathrm{BaSO_4}\\downarrow+2\\mathrm{NaCl}$'), answer: 'C',
        analysis: '判断依据是化合价是否变化。C 中 Zn: $0\\to+2$，H: $+1\\to0$。其余均为非氧化还原反应。',
        tags: ['氧化还原反应'], difficulty: 2 }),
      q('chemistry', 4, { stem: '在 $\\mathrm{CH_3COOH}$ 溶液中加入少量 $\\mathrm{CH_3COONa}$ 固体，溶液的 pH 将',
        options: opts('增大', '减小', '不变', '先减小后增大'), answer: 'A',
        analysis: '同离子效应使 $\\mathrm{CH_3COOH}\\rightleftharpoons\\mathrm{CH_3COO^-}+\\mathrm{H^+}$ 左移，$[\\mathrm{H^+}]$ 减小，pH 增大。',
        tags: ['电离平衡'], difficulty: 3 }),
      q('chemistry', 5, { stem: '原电池中，负极发生的反应是',
        options: opts('还原反应', '氧化反应', '中和反应', '不放电时无反应'), answer: 'B',
        analysis: '负极失电子被氧化，正极得电子被还原，可记「负氧正还」。电子由负极经外电路流向正极。',
        tags: ['电化学'], difficulty: 1 }),
      q('chemistry', 6, { stem: '简述配制一定物质的量浓度溶液时，定容俯视刻度线会造成浓度偏大还是偏小，并说明理由。', type: 'open',
        answer: '偏大。俯视时液面最低点看起来已到刻度线，实际液面低于刻度线，溶液体积偏小，而溶质物质的量不变，故 $c=n/V$ 偏大。',
        analysis: '误差分析统一回到 $c=\\dfrac{n}{V}$：只看操作改变了 $n$ 还是 $V$。',
        tags: ['配制溶液', '误差分析'], difficulty: 3, score: 12 })
    ],
    chinese: [
      q('chinese', 1, { stem: '下列各句中，加点的成语使用恰当的一项是',
        options: opts('他做事一向小心翼翼，这次却首当其冲地承担了最难的任务。',
          '这篇文章文不加点，一气呵成，读来酣畅淋漓。',
          '会议室里大家侃侃而谈，只有他一人噤若寒蝉，气氛十分热烈。',
          '这些苹果汗牛充栋地堆在果园里，果农笑得合不拢嘴。'), answer: 'B',
        analysis: '「文不加点」指写文章一气呵成、不用修改，不是「不加标点」，B 使用正确。「首当其冲」指最先受到冲击或遭遇灾难，不是「带头」；「汗牛充栋」只形容藏书多；「噤若寒蝉」与「气氛热烈」矛盾。',
        tags: ['成语运用'], difficulty: 3 }),
      q('chinese', 2, { stem: '下列句子没有语病的一项是',
        options: opts('通过这次活动，使同学们增强了团队意识。',
          '能否取得好成绩，关键在于平时的扎实积累。',
          '为了防止此类事故不再发生，学校加强了安全教育。',
          '他的写作水平明显改进了。'), answer: 'B',
        analysis: 'A 缺主语（「通过…使…」连用）；C 否定不当（「防止…不再」双重否定表肯定）；D 搭配不当（水平应「提高」）。B 两面对两面，正确。',
        tags: ['病句辨析'], difficulty: 3 }),
      q('chinese', 3, { stem: '「无边落木萧萧下，不尽长江滚滚来」出自杜甫的',
        options: opts('《春望》', '《登高》', '《望岳》', '《茅屋为秋风所破歌》'), answer: 'B',
        analysis: '出自《登高》，全诗被称为「古今七律第一」。注意与「会当凌绝顶」（《望岳》）区分。',
        tags: ['名句名篇'], difficulty: 1 }),
      q('chinese', 4, { stem: '补写出下列名篇名句中的空缺部分：故不积跬步，________。', type: 'fill',
        answer: '无以至千里', analysis: '出自《荀子·劝学》：「故不积跬步，无以至千里；不积小流，无以成江海。」注意「至」不要写成「致」。',
        tags: ['名句默写'], difficulty: 1 }),
      q('chinese', 5, { stem: '文言实词「兵」在「收天下之兵，聚之咸阳」中的意思是',
        options: opts('士兵', '兵器', '战争', '军队'), answer: 'B',
        analysis: '出自贾谊《过秦论》，「兵」在此指兵器。同篇「行军用兵之道」中指军事策略，需据语境判断。',
        tags: ['文言实词'], difficulty: 2 }),
      q('chinese', 6, { stem: '简述论述类文本阅读中，如何快速定位作者的中心论点。', type: 'open',
        answer: '看标题与首尾段；找「因此、可见、总之、我认为」等结论性标志词；区分论点与论据；把各段分论点合并归纳；注意反驳型文章要先找出被驳观点。',
        analysis: '中心论点是「作者的主张」，必须是可判断真假的陈述句，不能是论题或现象描述。',
        tags: ['论述类文本'], difficulty: 3, score: 12 })
    ],
    english: [
      q('english', 1, { stem: 'The manager suggested that the meeting ______ until next Friday.',
        options: opts('is postponed', 'be postponed', 'will be postponed', 'would postpone'), answer: 'B',
        analysis: 'suggest 表「建议」时宾语从句用虚拟语气 $(should)+$ 动词原形；会议是被推迟，故用被动 $(should)\\ be\\ postponed$。注意 suggest 表「表明」时不用虚拟。',
        tags: ['虚拟语气'], difficulty: 3 }),
      q('english', 2, { stem: 'It was in the small village ______ he spent his childhood.',
        options: opts('which', 'where', 'that', 'when'), answer: 'C',
        analysis: '强调句型 It is/was + 被强调部分 + that + 其余。去掉 It was 和 that 后句子仍完整：he spent his childhood in the small village。若填 where 则成了定语从句，但前面有介词 in 与之冲突。',
        tags: ['强调句'], difficulty: 3 }),
      q('english', 3, { stem: 'By the time he arrived, the film ______ for ten minutes.',
        options: opts('has begun', 'had been on', 'had begun', 'was beginning'), answer: 'B',
        analysis: 'by the time + 过去时，主句用过去完成时；for ten minutes 是时间段，须用延续性动词 be on，不能用瞬间动词 begin。',
        tags: ['时态', '延续性动词'], difficulty: 3 }),
      q('english', 4, { stem: '语法填空：He is the only one of the students who ______ (have) been to Britain.', type: 'fill',
        answer: 'has',
        analysis: 'the only one of + 复数名词 + 定语从句，从句谓语与 one 一致用单数；若无 the only，则与 students 一致用复数 have。',
        tags: ['主谓一致'], difficulty: 3 }),
      q('english', 5, { stem: 'Choose the word closest in meaning to "reluctant".',
        options: opts('eager', 'unwilling', 'careless', 'grateful'), answer: 'B',
        analysis: 'reluctant = unwilling（不情愿的）。搭配 be reluctant to do sth.。',
        tags: ['词义猜测'], difficulty: 2 }),
      q('english', 6, { stem: '请用 2–3 句英文说明「读后续写」中如何保持与原文情节连贯。', type: 'open',
        answer: '参考答案：Keep the same characters, tense and narrative voice as the original story. Pick up the unresolved conflict or the object mentioned in the given sentences, and let every new action grow logically from what has happened. Finally, echo the theme or an earlier detail to close the loop.',
        analysis: '评分关注：人物与视角一致、时态一致、承接给定句、情节因果合理、主题回扣、语言 accuracy。',
        tags: ['读后续写'], difficulty: 4, score: 12 })
    ],
    politics: [
      q('politics', 1, { stem: '马克思主义哲学的直接理论来源是',
        options: opts('古希腊朴素唯物主义', '德国古典哲学', '英国古典政治经济学', '法国空想社会主义'), answer: 'B',
        analysis: '直接理论来源是德国古典哲学（黑格尔辩证法 + 费尔巴哈唯物主义）。英国古典政治经济学、法国空想社会主义分别是马克思主义政治经济学、科学社会主义的来源，注意三分对应。',
        tags: ['哲学基本派别'], difficulty: 2 }),
      q('politics', 2, { stem: '「不谋全局者，不足谋一域」体现的唯物辩证法道理是',
        options: opts('矛盾具有特殊性', '整体居于主导地位，要树立全局观念',
          '量变必然引起质变', '事物发展是前进性与曲折性的统一'), answer: 'B',
        analysis: '强调全局对部分的统率作用，方法论是立足整体、统筹全局，同时重视部分的作用。',
        tags: ['联系观', '整体与部分'], difficulty: 2 }),
      q('politics', 3, { stem: '我国的根本政治制度是',
        options: opts('人民代表大会制度', '中国共产党领导的多党合作和政治协商制度',
          '民族区域自治制度', '基层群众自治制度'), answer: 'A',
        analysis: '人民代表大会制度是根本政治制度；后三项是基本政治制度。国体是人民民主专政，政体是人民代表大会制度，勿混。',
        tags: ['政治与法治'], difficulty: 1 }),
      q('politics', 4, { stem: '商品的价值量由______决定。', type: 'fill',
        answer: '生产该商品的社会必要劳动时间',
        analysis: '价值量由社会必要劳动时间决定，与个别劳动时间无关；社会劳动生产率与价值量成反比，与价值总量无关（同一劳动在同一时间创造的价值总量不变）。',
        tags: ['经济与社会'], difficulty: 2 }),
      q('politics', 5, { stem: '实践是认识的基础，下列能体现「实践是检验认识真理性的唯一标准」的是',
        options: opts('读书破万卷，下笔如有神', '不入虎穴，焉得虎子',
          '是骡子是马，拉出来遛遛', '秀才不出门，全知天下事'), answer: 'C',
        analysis: '「拉出来遛遛」即用实践结果检验判断。B 强调实践是认识的来源；A 强调量变与积累；D 强调间接经验。四个选项对应四个不同原理，是高频易错点。',
        tags: ['认识论'], difficulty: 3 }),
      q('politics', 6, { stem: '运用矛盾主次方面原理，简析如何看待人工智能给教育带来的影响。', type: 'open',
        answer: '参考答案要点：①矛盾的主要方面决定事物性质，人工智能赋能个性化学习、提高效率是主流，应肯定并积极运用；②矛盾的次要方面也不容忽视，存在依赖、数据隐私、思维惰性等问题；③坚持两点论与重点论统一，既抓主流又完善规范与引导，防止支流转化。',
        analysis: '答题结构：原理 + 方法论 + 结合材料分两面 + 落脚到「怎么办」。注意「主次方面」用于评价同一事物的性质，「主次矛盾」用于解决多个任务，别混用。',
        tags: ['矛盾观'], difficulty: 4, score: 12 })
    ]
  };

  Object.keys(seed).forEach(function (k) {
    if (!Array.isArray(window.ZS_Q[k]) || window.ZS_Q[k].length === 0) window.ZS_Q[k] = seed[k];
  });

  /* 其余数据兜底：保证每个栏目都有内容、每个功能都有可跑的数据 */
  if (!Array.isArray(window.ZS_CONCLUSIONS) || !window.ZS_CONCLUSIONS.length) {
    window.ZS_CONCLUSIONS = [
      { id: 'c_seed_1', subject: 'math', title: '等差数列片段和性质',
        formula: '$S_n, S_{2n}-S_n, S_{3n}-S_{2n}$ 仍成等差数列，公差为 $n^2d$',
        content: '把前 n 项、第 n+1 到 2n 项、第 2n+1 到 3n 项各看作一段，三段和构成等差数列。选择填空可跳过求首项与公差直接写出结果。',
        source: '本站整理·需按教材核对', tags: ['数列'] },
      { id: 'c_seed_2', subject: 'math', title: '焦点三角形面积公式',
        formula: '$S_{\\triangle PF_1F_2}=b^2\\tan\\dfrac{\\theta}{2}$（椭圆，$\\theta=\\angle F_1PF_2$）',
        content: '由椭圆定义 $|PF_1|+|PF_2|=2a$ 与余弦定理联立可得。双曲线对应 $S=\\dfrac{b^2}{\\tan(\\theta/2)}$。前提：P 在曲线上且 F1、F2 为两焦点。',
        source: '本站整理·需按教材核对', tags: ['解析几何'] },
      { id: 'c_seed_3', subject: 'physics', title: '等时圆',
        formula: '$t=\\sqrt{\\dfrac{2R}{g}}$（沿竖直圆上任意弦从最高点滑下或从任意点滑到最低点）',
        content: '光滑弦上加速度 $a=g\\cos\\theta$，弦长 $L=2R\\cos\\theta$，由 $L=\\tfrac12at^2$ 得时间与倾角无关。前提：光滑、从静止释放、弦端点在圆上。',
        source: '本站整理·需按教材核对', tags: ['运动学'] },
      { id: 'c_seed_4', subject: 'physics', title: '串反并同',
        formula: '动态电路中，某电阻增大时：与它串联的支路电流/电压变小（反），与它并联的支路变大（同）',
        content: '仅适用于「单一电阻变化、电源有内阻」的闭合电路动态分析，本质是 $U=E-Ir$ 与分压关系。含电容或多个电阻同时变化时不适用。',
        source: '本站整理·需按教材核对', tags: ['恒定电流'] },
      { id: 'c_seed_5', subject: 'chemistry', title: '等效平衡的三种情形',
        formula: '恒温恒容：投料按化学计量数折算后与原来相同即等效',
        content: '反应前后气体分子数不等的反应，恒温恒容下必须「折算后完全相同」；分子数相等的反应只需「成比例」；恒温恒压下一律「成比例」即可。',
        source: '本站整理·需按教材核对', tags: ['化学平衡'] },
      { id: 'c_seed_6', subject: 'math', title: '三次函数对称中心',
        formula: '$f(x)=ax^3+bx^2+cx+d$ 的对称中心为 $\\left(-\\dfrac{b}{3a},\\ f\\!\\left(-\\dfrac{b}{3a}\\right)\\right)$',
        content: "由 $f''(x)=6ax+2b=0$ 解出拐点横坐标。前提 $a\\ne0$。常用于已知对称中心反求参数或求 $f(x_1)+f(x_2)$。",
        source: '本站整理·需按教材核对', tags: ['导数'] }
    ];
  }
  if (!Array.isArray(window.ZS_TEXTBOOKS) || !window.ZS_TEXTBOOKS.length) {
    var tb = [];
    (window.ZS_SUBJECTS || []).forEach(function (s) {
      ['必修 第一册', '必修 第二册', '选择性必修 第一册', '选择性必修 第二册', '选择性必修 第三册'].forEach(function (v, i) {
        tb.push({ id: 'tb_' + s.id + '_' + i, subject: s.id, grade: i < 2 ? '必修' : '选择性必修',
          volume: v, title: '人教版 · ' + s.name + ' · ' + v, url: '',
          source: 'TapXWorld/ChinaTextbook（开源人教版电子课本）',
          note: '待接入开源直链；可在「全站设置」里登记本机教材路径' });
      });
    });
    window.ZS_TEXTBOOKS = tb;
  }
  if (!Array.isArray(window.ZS_UNIVERSITIES) || !window.ZS_UNIVERSITIES.length) {
    window.ZS_UNIVERSITIES = [
      { id: 'u_1', name: '广西大学', province: '广西', city: '南宁', type: '综合', level: '211 / 双一流',
        intro: '广西唯一的国家「211 工程」和「双一流」建设高校，学科覆盖工、农、理、文、经管。', site: 'www.gxu.edu.cn' },
      { id: 'u_2', name: '广西医科大学', province: '广西', city: '南宁', type: '医药', level: '省部共建',
        intro: '广西医学教育与科研中心，临床医学、口腔医学、预防医学为优势学科。', site: 'www.gxmu.edu.cn' },
      { id: 'u_3', name: '广西师范大学', province: '广西', city: '桂林', type: '师范', level: '省部共建',
        intro: '坐落在桂林，教师教育与人文社科见长，王城、育才、雁山三校区。', site: 'www.gxnu.edu.cn' },
      { id: 'u_4', name: '桂林电子科技大学', province: '广西', city: '桂林', type: '理工', level: '省部共建',
        intro: '电子信息特色鲜明，信息与通信工程、计算机科学与技术实力较强。', site: 'www.guet.edu.cn' },
      { id: 'u_5', name: '清华大学', province: '北京', city: '北京', type: '综合', level: '985 / 211 / 双一流',
        intro: '综合性研究型大学，工科、理科、经管、人文均居国内前列。', site: 'www.tsinghua.edu.cn' },
      { id: 'u_6', name: '北京大学', province: '北京', city: '北京', type: '综合', level: '985 / 211 / 双一流',
        intro: '文理基础学科与人文社科实力雄厚，元培学院实行通识与自由选专业。', site: 'www.pku.edu.cn' },
      { id: 'u_7', name: '浙江大学', province: '浙江', city: '杭州', type: '综合', level: '985 / 211 / 双一流',
        intro: '学科门类齐全，工科、农学、医学与计算机方向突出。', site: 'www.zju.edu.cn' },
      { id: 'u_8', name: '中山大学', province: '广东', city: '广州', type: '综合', level: '985 / 211 / 双一流',
        intro: '广州、珠海、深圳三校区，医学、管理学与海洋科学有传统优势。', site: 'www.sysu.edu.cn' }
    ];
  }
  if (!Array.isArray(window.ZS_PAPERS)) window.ZS_PAPERS = [];
})();
