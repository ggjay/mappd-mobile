const PLAN_SCHEMA = `{
    "option_label": "方案A · 8字以内定位名",
    "diff_highlight": "一句话说明本方案与另一方案的核心差异",
    "headline": "20字以内带有策略特色的方案大标题",
    "planning_logic": "2-3句，清晰指明选了什么、放弃了什么、以及为什么放弃的底层逻辑",
    "experience_tags": ["标签1", "标签2", "标签3"],
    "route_overview": "城市A → 城市B → 城市C 格式的链条",
    "nodes": [{ "city": "城市名", "nights": 1, "core_value": "核心价值留宿原因", "latlng": [25.04, 102.73] }],
    "roundtrip": {
      "outbound": { "method": "去程大交通方式说明", "duration": "耗时描述", "price_ref": "参考价格" },
      "return": { "method": "回程大交通方式说明", "duration": "耗时描述", "price_ref": "参考价格" }
    },
    "accommodation": [{ "nights_label": "第X晚", "location": "留宿特定商圈", "type": "推荐类型", "reason": "J人防防意外推荐理由", "price_range": "价格参考" }],
    "segment_transport": [{ "from": "城市A", "to": "城市B", "method": "接驳交通工具", "self_drive_rec": true, "reason": "J人决策取舍原因" }],
    "cost_estimate": { "transport": 1500, "accommodation": 2000, "food": 1000, "attraction": 600, "total_per_person": "5000-6500", "note": "以上为参考估算，实际以预订价格为准" },
    "peak_season_alert": "仅国庆/五一/暑假旺季时输出，否则为空字符串"
  }`;

function extractOptions(parsed) {
  if (Array.isArray(parsed.options)) return parsed.options;
  if (Array.isArray(parsed.plans)) return parsed.plans;
  if (parsed.options && typeof parsed.options === 'object') {
    return Object.values(parsed.options);
  }
  if (parsed.plan_a && parsed.plan_b) return [parsed.plan_a, parsed.plan_b];
  if (parsed.planA && parsed.planB) return [parsed.planA, parsed.planB];
  return [];
}

/** 常用中国城市坐标 [纬度, 经度]，用于 AI 漏填 latlng 时补全动线 */
const CITY_LATLNG = {
  上海: [31.2304, 121.4737], 北京: [39.9042, 116.4074], 广州: [23.1291, 113.2644],
  深圳: [22.5431, 114.0579], 成都: [30.5728, 104.0668], 杭州: [30.2741, 120.1551],
  南京: [32.0603, 118.7969], 武汉: [30.5928, 114.3055], 西安: [34.3416, 108.9398],
  重庆: [29.563, 106.5516], 天津: [39.3434, 117.3616], 苏州: [31.2989, 120.5853],
  厦门: [24.4798, 118.0894], 青岛: [36.0671, 120.3826], 大连: [38.914, 121.6147],
  昆明: [25.0389, 102.7183], 大理: [25.6065, 100.2676], 丽江: [26.855, 100.2277],
  香格里拉: [27.8258, 99.7065], 迪庆: [27.8258, 99.7065], 西双版纳: [22.0094, 100.7974],
  景洪: [22.0094, 100.7974], 腾冲: [25.017, 98.4907], 贵阳: [26.647, 106.6302],
  长沙: [28.2282, 112.9388], 福州: [26.0745, 119.2965], 海口: [20.044, 110.1999],
  三亚: [18.2528, 109.5119], 哈尔滨: [45.8038, 126.535], 沈阳: [41.8057, 123.4315],
  郑州: [34.7466, 113.6254], 济南: [36.6512, 117.1201], 合肥: [31.8206, 117.2272],
  南昌: [28.682, 115.8579], 太原: [37.8706, 112.5489], 兰州: [36.0611, 103.8343],
  乌鲁木齐: [43.8256, 87.6168], 拉萨: [29.652, 91.1721], 香港: [22.3193, 114.1694],
  澳门: [22.1987, 113.5439], 台北: [25.033, 121.5654],
};

function stripCitySuffix(name) {
  return (name || '').replace(/[省市区县州盟]$/, '').trim();
}

function cityNameMatch(a, b) {
  const na = stripCitySuffix(a);
  const nb = stripCitySuffix(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function lookupCityLatlng(city, fallbackCity) {
  const raw = (city || '').trim();
  if (!raw) return fallbackCity ? lookupCityLatlng(fallbackCity) : null;
  if (CITY_LATLNG[raw]) return CITY_LATLNG[raw];
  const short = stripCitySuffix(raw);
  if (CITY_LATLNG[short]) return CITY_LATLNG[short];
  for (const [key, coords] of Object.entries(CITY_LATLNG)) {
    if (raw.includes(key) || key.includes(short)) return coords;
  }
  return fallbackCity && !cityNameMatch(city, fallbackCity)
    ? lookupCityLatlng(fallbackCity)
    : null;
}

function parseRouteCities(routeOverview) {
  return (routeOverview || '')
    .split(/(?:→|->|—|–|-|至|到|→)/)
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeLatlng(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw) && raw.length >= 2) {
    const a = +raw[0], b = +raw[1];
    if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
  }
  if (typeof raw === 'object') {
    const lat = raw.lat ?? raw.latitude;
    const lng = raw.lng ?? raw.lon ?? raw.longitude;
    if (lat != null && lng != null) {
      const a = +lat, b = +lng;
      if (Number.isFinite(a) && Number.isFinite(b)) return [a, b];
    }
  }
  return null;
}

function hasValidLatlng(latlng) {
  return normalizeLatlng(latlng) !== null;
}

/** 按 route_overview / 出发城市补全 nodes[].latlng，保证地图上至少 2 个可连线点 */
function enrichPlanNodes(plan, startPoint) {
  const nodes = Array.isArray(plan.nodes) ? plan.nodes.map(n => ({ ...n })) : [];
  const routeCities = parseRouteCities(plan.route_overview);
  const start = startPoint || '';

  const fillNode = (n) => {
    const normalized = normalizeLatlng(n.latlng);
    if (normalized) return { ...n, latlng: normalized };
    const ll = lookupCityLatlng(n.city, start);
    return ll ? { ...n, latlng: [...ll] } : n;
  };

  let working = nodes.map(fillNode);
  const geoCount = () => working.filter(n => hasValidLatlng(n.latlng)).length;

  if (routeCities.length >= 2 && geoCount() < 2) {
    working = routeCities.map((city) => {
      const existing = nodes.find(n => cityNameMatch(n.city, city));
      const ll = existing && hasValidLatlng(existing.latlng)
        ? existing.latlng
        : lookupCityLatlng(city, start);
      if (!ll) return null;
      return {
        city,
        nights: existing?.nights ?? 1,
        core_value: existing?.core_value || '',
        latlng: [...ll],
      };
    }).filter(Boolean);
  } else if (routeCities.length >= 2 && geoCount() < routeCities.length) {
    const merged = [];
    routeCities.forEach((city) => {
      const existing = working.find(n => cityNameMatch(n.city, city))
        || nodes.find(n => cityNameMatch(n.city, city));
      const ll = existing && hasValidLatlng(fillNode(existing).latlng)
        ? fillNode(existing).latlng
        : lookupCityLatlng(city, start);
      if (!ll) return;
      merged.push({
        city,
        nights: existing?.nights ?? 1,
        core_value: existing?.core_value || '',
        latlng: [...ll],
      });
    });
    if (merged.length >= geoCount()) working = merged;
  } else {
    working = working.map(fillNode);
  }

  plan.nodes = working;
  return plan;
}

function normalizePlan(raw, index, startPoint) {
  const plan = typeof raw === 'object' && raw !== null ? { ...raw } : {};
  const label = plan.option_label || `方案 ${String.fromCharCode(65 + index)}`;

  plan.option_label = label;
  plan.headline =
    plan.headline ||
    plan.title ||
    plan.plan_title ||
    plan.name ||
    (label.includes('·') ? label.split('·').slice(1).join('·').trim() : '') ||
    plan.route_overview ||
    `推荐路线 ${index + 1}`;

  plan.diff_highlight = plan.diff_highlight || plan.diff || '';
  plan.experience_tags = Array.isArray(plan.experience_tags) ? plan.experience_tags : [];
  plan.nodes = Array.isArray(plan.nodes) ? plan.nodes : [];
  plan.route_overview = plan.route_overview || '';
  plan.planning_logic = plan.planning_logic || '';
  plan.roundtrip = plan.roundtrip || { outbound: {}, return: {} };
  plan.accommodation = Array.isArray(plan.accommodation) ? plan.accommodation : [];
  plan.segment_transport = Array.isArray(plan.segment_transport) ? plan.segment_transport : [];
  plan.cost_estimate = plan.cost_estimate || {
    transport: 0, accommodation: 0, food: 0, attraction: 0,
    total_per_person: '—', note: '以上为参考估算，实际以预订价格为准',
  };
  plan.peak_season_alert = plan.peak_season_alert || '';

  return enrichPlanNodes(plan, startPoint);
}

const FALLBACK_PLAN = {
  option_label: "方案 · 自校准",
  diff_highlight: "数据对齐中",
  headline: "精算链路重置中",
  planning_logic: "触发了数据对齐自校准流程，请重新点击触发按钮。",
  experience_tags: ["自校准"],
  route_overview: "等待中",
  nodes: [],
  roundtrip: { outbound: {}, return: {} },
  accommodation: [],
  segment_transport: [],
  cost_estimate: { transport: 0, accommodation: 0, food: 0, attraction: 0, total_per_person: "0", note: "" },
  peak_season_alert: "",
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS' || req.method === 'GET') { res.status(200).end(); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
    const { start_point, destination, days, travelers, hasDrive, hasTrain, travel_styles = [] } = body;

    const STYLE_LABELS = {
      nature: '自然风景（山水、国家公园、海岸等自然景观优先）',
      culture: '城市人文（历史街区、博物馆、建筑地标优先）',
      food: '在地美食（特色餐饮、市集、地方风味优先）',
      relaxed: '慢节奏（减少赶场，留足自由活动时间）',
      niche: '小众探索（避开热门打卡，倾向非网红目的地）',
    };
    const styleLabels = (Array.isArray(travel_styles) ? travel_styles : [])
      .filter(s => STYLE_LABELS[s])
      .map(s => STYLE_LABELS[s]);
    const styleConstraint = styleLabels.length > 0
      ? styleLabels.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
      : '  用户未指定风格偏好，按目的地资源与天数自由平衡';

    const transportConstraint = hasDrive && hasTrain
      ? '用户同时倾向自驾与高铁，两方案可分别侧重其一'
      : hasDrive
        ? '用户倾向自驾，至少一个方案以自驾走廊为主'
        : hasTrain
          ? '用户倾向高铁，至少一个方案以轨道交通接驳为主'
          : '用户未指定交通偏好，两方案应在交通方式上形成明显对比（如自驾环线 vs 高铁枢纽）';

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return res.status(200).json({ error: "API KEY Missing" });

    const prompt = `# 角色定义
你是一个专业旅游路线规划师，专门执行 [Mappd 大路线规划 Skill]。

# 用户画像与场景参数
- 出发城市：【${start_point}】
- 目的地大区：【${destination}】
- 出行天数：【${days}】天
- 出行人数：【${travelers}】人
- 自驾倾向：${hasDrive ? '是' : '否'}，高铁/轨道交通倾向：${hasTrain ? '是' : '否'}

# 旅游风格（软约束，不可违反硬规则）
${styleConstraint}

# 交通偏好（软约束）
${transportConstraint}

# 双方案要求（必须遵守）
你必须输出恰好 2 套路线方案，放入 options 数组。两方案须满足：
1. **差异明显**：至少 2 项维度不同（途经城市组合 / 动线节奏 / 交通方式 / 体验侧重 中的任意两项）
2. **均合法**：各自独立满足下方全部硬规则
3. **可对比**：diff_highlight 必须直指与另一方案的差异，禁止泛泛而谈
4. 建议策略对比方向示例（择其适用来设计，不必全部套用）：
   - 方案A：经典高效覆盖 vs 方案B：小众慢游深度
   - 方案A：自驾环线 vs 方案B：高铁枢纽串联
   - 方案A：多城广度 vs 方案B：少城深度

# 规划规则（硬规则，每个方案均须满足）
规则1 · 单向动线：除出发城市外，任何城市不得出现两次
规则2 · 地理聚类：相邻节点地理相邻或交通顺路；nodes 中给出真实中国城市经纬度 [纬度, 经度]
规则3 · 天数守恒：所有 nights 之和 + 长途交通天数（单程>4h 占 0.5天）= 总天数；每节点至少 1 晚
规则4 · 取舍说明：planning_logic 须说明放弃了什么及原因
规则5 · 密度推断：按天数与人数合理推断节点数量
规则6 · 预算：舒适型标准估算

规则7 · 地图融合标注（用于动线总览一页展示）
- nodes[].city 必须与 segment_transport 的 from/to 首尾相接、名称一致（可含「市」字）
- accommodation.location 必须包含对应 nodes 中的城市名，nights_label 与节点顺序一致
- roundtrip.outbound.method 须写清【${start_point}】到首站城市的交通方式与耗时；return 须写清末站返回交通

# 输出格式
严格只输出一个合法 JSON 对象，不要 Markdown 标记。
**每个 options 数组元素都必须完整包含 headline 字段（禁止省略、禁止为 null）。**
{
  "options": [
    ${PLAN_SCHEMA},
    ${PLAN_SCHEMA}
  ]
}`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    let resultText = data.choices[0].message.content.trim();
    if (resultText.startsWith('```')) {
      resultText = resultText.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(resultText.trim());
    let options = extractOptions(parsed);

    // 兼容旧版单方案响应
    if (options.length === 0 && parsed.headline) {
      options = [parsed];
    }

    options = options.slice(0, 2).map((opt, i) => normalizePlan(opt, i, start_point));

    if (options.length === 1) {
      const alt = normalizePlan({ ...options[0], option_label: '方案 B' }, 1, start_point);
      alt.headline = alt.headline === options[0].headline
        ? `${alt.headline}（备选）`
        : alt.headline;
      alt.diff_highlight = alt.diff_highlight || '备选动线，与方案 A 形成对比';
      options.push(alt);
    }

    return res.status(200).json({ options });
  } catch (error) {
    return res.status(200).json({
      options: [
        { ...FALLBACK_PLAN, option_label: '方案 A' },
        { ...FALLBACK_PLAN, option_label: '方案 B', diff_highlight: error.message },
      ],
    });
  }
}
