export const config = { maxDuration: 60 };

const RESTAURANT_SCHEMA = `{
      "name": "餐厅名", "rating": 4.8, "review_count": 1200, "price_per_person": "￥80",
      "cuisine": "菜系", "distance": "距参考点约300m", "highlight_dish": "招牌菜",
      "dianping_url": "https://www.dianping.com/search/keyword/城市/餐厅名"
    }`;

const DAY_SCHEMA = `{
    "day": 1,
    "city": "当日主城市",
    "route_density": "high",
    "sub_route_summary": "从XX酒店出发 → 景点A → 景点B → 回酒店，单向不折返",
    "sub_route_chain": "大理古城叶榆客栈 → 洱海公园 → 双廊古镇",
    "day_start": {
      "name": "当晚住宿名称/商圈",
      "latlng": [25.04, 102.73],
      "type": "纳西风格民宿",
      "price_range": "350-500元/晚",
      "area": "古城区"
    },
    "attractions": [{
      "id": "d1_a1", "name": "景点名", "latlng": [25.05, 102.74],
      "hours": "08:30-18:00",
      "ticket_type": "free",
      "price": "免费",
      "booking_url": "",
      "baike_summary": "80-150字，仿百度百科公开词条客观介绍：历史、特色、游览价值",
      "baike_url": "https://baike.baidu.com/item/景点名"
    }],
    "meals": {
      "breakfast": { "time_label": "早餐", "area": "人民路早餐区", "anchor_latlng": [25.04, 102.73], "restaurants": [${RESTAURANT_SCHEMA}] },
      "lunch": { "time_label": "午餐", "area": "午餐商圈", "anchor_latlng": [25.05, 102.75], "restaurants": [] },
      "dinner": { "time_label": "晚餐", "area": "晚餐商圈", "anchor_latlng": [25.06, 102.76], "restaurants": [] }
    }
  }`;

function inferDensity(plan) {
  const text = `${plan?.option_label || ''} ${plan?.headline || ''} ${plan?.diff_highlight || ''}`;
  if (/经典|高效|覆盖|紧凑|多城|广度/.test(text)) return 'high';
  if (/慢|深度|小众|佛系|放空|少城/.test(text)) return 'low';
  return 'medium';
}

function densityRules(density) {
  if (density === 'high') return '高密度：4-5个景点，动线紧凑，景点间距顺路，午餐就近解决';
  if (density === 'low') return '低密度：2个景点，留足自由活动时间，不赶场';
  return '中密度：3个景点，节奏适中';
}

function baikeItemUrl(name) {
  return `https://baike.baidu.com/item/${encodeURIComponent(name.replace(/\s/g, ''))}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS' || req.method === 'GET') { res.status(200).end(); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }

    const { plan, days, day: singleDay, travelers, destination, start_point } = body;
    const totalDays = Math.min(Math.max(parseInt(days, 10) || 3, 1), 14);
    const targetDay = singleDay ? Math.min(Math.max(parseInt(singleDay, 10), 1), totalDays) : null;
    const density = plan?.route_density || inferDensity(plan);

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(200).json({ days: [], error: '未配置 DEEPSEEK_API_KEY，请在 Vercel 环境变量中添加' });
    }

    const nodesStr = (plan?.nodes || []).map(n => `${n.city}(${n.nights}晚)`).join(' → ');
    const accHint = (plan?.accommodation || [])
      .map(a => `${a.nights_label}:${a.location}(${a.type})`)
      .join('；');

    const prompt = `# 角色
你是 Mappd 分天行程规划师。内容描述须基于百度百科等公开百科资料的客观表述风格（勿编造具体百科未载明的数据）。

# 行程上下文
- 出发城市：${start_point || '未知'}
- 目的地：${destination || '未知'}
- 总天数：${totalDays} 天
- 人数：${travelers || 2} 人
- 方案定位：${plan?.option_label || ''} / ${plan?.headline || ''}
- 方案差异：${plan?.diff_highlight || ''}
- 宏观动线：${plan?.route_overview || nodesStr}
- 住宿参考：${accHint || '按 nodes 推断'}

# 规划密度（必须遵守）
route_density = "${density}"
${densityRules(density)}

# 硬规则 · 单向动线
1. 当日子路线必须以 day_start（当晚住宿）为起点，按地理顺路单向推进，禁止折返、禁止重复经过同一景点
2. sub_route_chain 格式：住宿名 → 景点A → 景点B → …（体现顺序）
3. attractions 按游览顺序排列，latlng 真实合理

# 任务
${targetDay ? `只生成第 ${targetDay} 天` : `生成第1-${totalDays}天`}

# 景点百科字段
- baike_summary：80-150字，百度百科公开词条风格的客观介绍
- baike_url：https://baike.baidu.com/item/词条名

# 输出（仅 JSON）
{ "days": [${DAY_SCHEMA}] }`;

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.25,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      return res.status(200).json({ days: [], error: `DeepSeek 请求失败: ${response.status}` });
    }

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      return res.status(200).json({ days: [], error: 'AI 未返回内容' });
    }

    let text = data.choices[0].message.content.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const parsed = JSON.parse(text);
    let daysList = Array.isArray(parsed.days) ? parsed.days : (parsed.day ? [parsed] : []);

    daysList = await Promise.all(
      daysList.map((d, i) => normalizeDay(d, targetDay || d.day || i + 1, destination, plan, density)),
    );

    if (targetDay && daysList.length === 0) {
      daysList = [await normalizeDay({ city: destination }, targetDay, destination, plan, density)];
    }

    return res.status(200).json({ days: daysList });
  } catch (error) {
    return res.status(200).json({ days: [], error: error.message });
  }
}

async function normalizeDay(raw, dayNum, destination, plan, density) {
  const day = { ...raw, day: raw.day || dayNum };
  day.city = day.city || destination || '';
  day.route_density = raw.route_density || density || 'medium';
  day.sub_route_summary = day.sub_route_summary || `第${dayNum}天游览`;
  day.sub_route_chain = day.sub_route_chain || '';

  const rawAttractions = Array.isArray(raw.attractions) ? raw.attractions : [];
  day.day_start = normalizeDayStart(raw.day_start, dayNum, destination, plan, rawAttractions);
  day.attractions = await Promise.all(
    rawAttractions.map((a, i) => normalizeAttraction(a, dayNum, i)),
  );

  ['breakfast', 'lunch', 'dinner'].forEach(slot => {
    if (!day.meals) day.meals = {};
    day.meals[slot] = normalizeMealSlot(day.meals[slot], slot, day.attractions[0]?.latlng || day.day_start?.latlng);
  });

  if (!day.sub_route_chain && day.day_start) {
    day.sub_route_chain = [day.day_start.name, ...day.attractions.map(a => a.name)].join(' → ');
  }

  return day;
}

function normalizeDayStart(raw, dayNum, destination, plan, rawAttractions) {
  const accList = plan?.accommodation || [];
  const acc = accList[dayNum - 1] || accList[accList.length - 1] || {};
  const firstAttr = rawAttractions[0];
  const base = raw || {};
  const city = destination || '';
  return {
    name: base.name || acc.location || `${city}住宿`,
    latlng: Array.isArray(base.latlng) ? base.latlng : (firstAttr?.latlng || [25.04, 102.73]),
    type: base.type || acc.type || '舒适型住宿',
    price_range: base.price_range || acc.price_range || '',
    area: base.area || acc.location || city,
  };
}

async function normalizeAttraction(a, dayNum, index) {
  const name = a.name || '景点';
  const baikeUrl = a.baike_url || baikeItemUrl(name);
  return {
    id: a.id || `d${dayNum}_a${index + 1}`,
    name,
    latlng: Array.isArray(a.latlng) ? a.latlng : (a.lat != null ? [a.lat, a.lng] : [25.04, 102.73]),
    cover_image: a.cover_image && !String(a.cover_image).includes('placehold') ? a.cover_image : '',
    hours: a.hours || '全天开放',
    highlights: a.highlights || '',
    baike_summary: a.baike_summary || a.highlights || `${name}是当地知名游览目的地，详见百度百科词条介绍。`,
    baike_url: baikeUrl,
    ticket_type: a.ticket_type === 'paid' ? 'paid' : 'free',
    price: a.price || (a.ticket_type === 'paid' ? '￥待定' : '免费'),
    booking_url: a.booking_url || '',
  };
}

function normalizeMealSlot(slot, key, fallbackLatlng) {
  const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
  const s = slot || {};
  let restaurants = Array.isArray(s.restaurants) ? s.restaurants : [];
  restaurants = restaurants.map((r, i) => ({
    name: r.name || `餐厅${i + 1}`,
    rating: parseFloat(r.rating) || 4.5,
    review_count: r.review_count || 500,
    price_per_person: r.price_per_person || '￥—',
    cuisine: r.cuisine || '本地菜',
    distance: r.distance || '',
    highlight_dish: r.highlight_dish || '',
    dianping_url: r.dianping_url || `https://www.dianping.com/search/keyword/${encodeURIComponent(r.name || '美食')}`,
  }));
  restaurants.sort((a, b) => b.rating - a.rating);

  return {
    time_label: s.time_label || labels[key],
    area: s.area || labels[key] + '商圈',
    anchor_latlng: s.anchor_latlng || fallbackLatlng || [25.04, 102.73],
    restaurants: restaurants.slice(0, 5),
  };
}
