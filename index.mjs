/**
 * volcengine-apigw — Magpie 供应商插件
 *
 * 把火山引擎 APIG 网关（BlueRegion 架构）注册为 magpie 供应商：
 *   - 推理请求走 OpenAI 兼容的 /v1/chat/completions
 *   - provider.models  查 /v1/models 列出账号可用模型 + credit 倍率
 *   - auth.usage        查 /v1/usage/summary 在 magpie quota 里展示 token 用量
 *
 * 安全模型（与 BlueRegionUsage 一致）：
 *   用户持有自己的推理 API Key → 网关 key-auth 校验后注入 consumer ID →
 *   函数只以 consumer ID 过滤 PromQL，用户天然只能查到自己的数据。
 *   本插件只做客户端转发，凭证不离开用户机器。
 *
 * 用量接口前提：网关上已部署 BlueRegionUsage 的 /v1/usage/* 函数路由
 *   (见 https://gitcode.com/solcao/BlueRegionUsage)。
 *   未部署时 auth.usage 降级为错误提示，不影响推理。
 */

const PROVIDER = "volcengine-apigw"
const PLUGIN_VERSION = "0.1.1"

// ---- 数值格式化（万/亿，中文风格）----

function fmtTokens(n) {
  if (n == null || isNaN(n)) return "0"
  n = Number(n)
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿"
  if (n >= 1e4) return (n / 1e4).toFixed(2) + "万"
  return String(Math.round(n))
}

// 网关 API 根地址（带 /v1）：https://<id>.apigateway-cn-beijing.volceapi.com/v1
// openai-compatible 只把 baseURL 与 "/chat/completions" 拼起来，不会补 /v1；
// 网关对裸 /chat/completions 的所有模型都回 404 model_not_found（2026-10-26 实测），
// 所以 baseURL 必须显式带 /v1。/v1/models、/v1/usage/* 同理。
function apiBase(auth) {
  const raw = (auth?.metadata?.gatewayBaseUrl || "").trim().replace(/\/+$/, "")
  if (!raw) return ""
  // 用户可能把 /v1 一起粘进来：先剥掉再统一拼一次，避免 /v1/v1
  return `${raw.replace(/\/v1$/i, "")}/v1`
}

// 静态模型元数据（来源：本机 pi 的 volcengine-apigw/* 配置）
// 网关 /v1/models 只返回 id/name/credit；context/cost/reasoning/inputs 等从此表补充。
const MODEL_META = {
  "deepseek-v4-flash": { context: 1000000, output: 384000, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 0.15, output: 0.6, cache: { read: 0.003, write: 0 } } },
  "deepseek-v4.1-flash": { context: 1048576, output: 384000, reasoning: true, image: true, inputs: ["text", "image"] },
  "deepseek-v4-pro": { context: 1000000, output: 384000, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 0.66, output: 1.98, cache: { read: 0.022, write: 0 } } },
  "doubao-seed-2.1-pro": { context: 256000, output: 128000, reasoning: false, image: true, inputs: ["text", "image"] },
  "glm-5.2": { context: 1000000, output: 131072, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 1.4, output: 4.4, cache: { read: 0.26, write: 0 } } },
  "glm-5.3": { context: 1000000, output: 131072, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 1.4, output: 4.4, cache: { read: 0.26, write: 0 } } },
  "glm-5.3-flash": { context: 1000000, output: 131072, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 0.15, output: 0.5, cache: { read: 0.03, write: 0 } } },
  "hy3": { context: 192000, output: 128000, reasoning: true, image: true, inputs: ["text", "image"] },
  "kimi-k2.7-code": { context: 262144, output: 262144, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 0.95, output: 4, cache: { read: 0.19, write: 0 } } },
  "kimi-k3": { context: 1048576, output: 131072, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 3, output: 15, cache: { read: 0.3, write: 3 } } },
  "MiniMax-M3": { context: 1048576, output: 512000, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 0.3, output: 1.2, cache: { read: 0.06, write: 0 } } },
  "qwen3.7-max": { context: 1000000, output: 65536, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 2.5, output: 7.5, cache: { read: 0.5, write: 3.125 } } },
  "qwen3.7-plus": { context: 1000000, output: 64000, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 0.4, output: 1.6, cache: { read: 0.04, write: 0.5 } } },
  "qwen3.8-flash": { context: 1000000, output: 131072, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 0.15, output: 0.47, cache: { read: 0.016, write: 0.2 } } },
  "qwen3.8-max": { context: 1000000, output: 131072, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 2, output: 6, cache: { read: 0.25, write: 2.5 } } },
  "zhipu/glm-5.3": { context: 1000000, output: 131072, reasoning: true, image: true, inputs: ["text", "image"], cost: { input: 1.4, output: 4.4, cache: { read: 0.26, write: 0 } } },
}

// 默认元数据：网关返回了 MODEL_META 未收录的新模型时回退
const DEFAULT_META = {
  context: 200000,
  output: 32000,
  reasoning: true,
  image: false,
  inputs: ["text"],
}

// ---- 从 /v1/models 响应构造 magpie 模型表 ----
// 动态字段（网关）：id / name / credit（计量倍率 → rate）
// 静态字段（MODEL_META）：context / output / cost(USD) / reasoning / inputs / image
function buildModels(data) {
  if (!Array.isArray(data)) return null
  const out = {}
  for (const m of data) {
    if (!m || !m.id) continue
    const meta = MODEL_META[m.id] || DEFAULT_META
    const model = {
      id: m.id,
      name: m.name || m.id,
      // 标准模型结构：context/output 放 limit，input 放 modalities
      // （顶层 context/output 会被某些版本忽略，limit 才是规范字段）
      limit: { context: meta.context, output: meta.output },
      modalities: { input: meta.inputs, output: ["text"] },
      // 顶层简化字段（5 分钟示例写法，magpie 接受）
      reasoning: meta.reasoning,
      tool_call: true,
    }
    // cost：美元价（USD / 1M tokens），来自 pi 配置，无则省略
    if (meta.cost) model.cost = meta.cost
    // credit：网关自定义计量倍率（非美元价），映射到 magpie rate
    if (typeof m.credit === "number" && m.credit > 0) {
      model.rate = m.credit
    }
    out[m.id] = model
  }
  return out
}

// ---- 查询 /v1/usage/summary 并构造 magpie usage 窗口 ----

async function fetchSummary(base, key, window) {
  const res = await fetch(`${base}/usage/summary?window=${window}`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(8000),
  })
  // 401/403：Key 失效，抛带 signIn 的错误，让 usage 钩子精确标记账号
  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error(`Key 失效 (${res.status})`), { signIn: "expired" })
  }
  if (!res.ok) return null
  const body = await res.json()
  return body?.data ? body : null
}

// 窗口长度（秒）：today=当日，month≈30 天
function windowSpan(name) {
  return name.startsWith("今日") ? 86400 : 30 * 86400
}

function buildWindow(name, summary) {
  if (!summary?.data) return null
  const d = summary.data
  const hitRate = d.cache_hit_rate != null
    ? (d.cache_hit_rate * 100).toFixed(1) + "%"
    : "—"
  return {
    name,
    display: `输入 ${fmtTokens(d.req_tokens)} · 输出 ${fmtTokens(d.rsp_tokens)} · 缓存命中 ${fmtTokens(d.cached_tokens)} (${hitRate}) · ${d.request_count} 请求`,
    amount: d.total_tokens,
    unit: "tokens",
    span: windowSpan(name), // 窗口长度（秒），让面板显示时间范围
    // 按量计费无 limit：不设 used/limit，aside:true 表示用完不影响推理
    aside: true,
  }
}

export const VolcengineUsagePlugin = async ({ client }) => ({
  // 供应商声明：模型由 provider.models 钩子按账号填充
  config: async (cfg) => {
    cfg.provider ??= {}
    cfg.provider[PROVIDER] ??= {
      name: "火山引擎 APIG 网关",
      npm: "@ai-sdk/openai-compatible",
      models: {},
    }
  },

  auth: {
    provider: PROVIDER,

    // 无 authorize：magpie 自动询问 API Key（type:"api" 内置），
    // prompts 的回答自动存入 metadata。key 自动存入 auth.key。
    // consumer ID 在 provider.models 阶段从 /v1/models 响应提取（通过 client.auth.set）。
    methods: [
      {
        type: "api",
        label: "火山引擎 APIG 网关 API Key",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        prompts: [
          {
            type: "text",
            key: "gatewayBaseUrl",
            message: "网关基础地址 (gatewayBaseUrl)",
            placeholder: "https://xxxxxxxxxx.apigateway-cn-beijing.volceapi.com",
            validate: (v) => {
              if (!v || !v.trim()) return "网关地址必填"
              try {
                const u = new URL(v.trim())
                if (u.protocol !== "http:" && u.protocol !== "https:")
                  return "必须是 http(s) URL"
              } catch {
                return "地址格式非法"
              }
              return undefined
            },
          },
        ],
      },
    ],

    // 每个账号的请求：baseURL + apiKey（openai-compatible 自动发 Bearer）
    // baseURL 必须带 /v1（见 apiBase）：SDK 在其后拼 /chat/completions。
    async loader(getAuth) {
      const auth = await getAuth()
      if (auth?.type !== "api") return {}
      const base = apiBase(auth)
      if (!base) return {}
      return {
        baseURL: base,
        apiKey: auth.key,
        headers: { "x-magpie-plugin": `volcengine-usage/${PLUGIN_VERSION}` },
      }
    },

    // magpie 自有钩子：查询本月/今日 token 用量展示在 quota 面板
    async usage(getAuth) {
      const auth = await getAuth()
      if (auth?.type !== "api") return { error: "未登录", windows: [] }
      const base = apiBase(auth)
      if (!base) return { error: "缺少网关地址（重新登录配置）", windows: [] }

      const key = auth.key
      const [todayR, monthR] = await Promise.allSettled([
        fetchSummary(base, key, "today"),
        fetchSummary(base, key, "month"),
      ])
      // 任一返回 401/403 → Key 失效，精确标记账号需重新登录
      const signInExpired = [todayR, monthR].some(
        (r) => r.status === "rejected" && r.reason?.signIn === "expired"
      )
      if (signInExpired) {
        return {
          error: "Key 失效，请重新登录",
          signIn: "expired",
          windows: [],
        }
      }
      const today = todayR.status === "fulfilled" ? todayR.value : null
      const month = monthR.status === "fulfilled" ? monthR.value : null

      if (!today && !month) {
        const err = todayR.status === "rejected"
          ? `用量接口不可达: ${todayR.reason?.message || todayR.reason}`
          : "用量接口未部署或返回错误（/v1/usage/summary）"
        return { error: err, windows: [] }
      }

      const windows = []
      const todayW = today && buildWindow("今日 (UTC+8)", today)
      const monthW = month && buildWindow("本月 (UTC+8)", month)
      if (todayW) windows.push(todayW)
      if (monthW) windows.push(monthW)

      return {
        plan: "火山引擎 APIG 网关",
        user: auth.accountId || today?.consumer || month?.consumer,
        windows,
      }
    },
  },

  // 按账号列出网关上的模型（从 /v1/models 动态获取，含 credit 倍率）
  provider: {
    id: PROVIDER,
    async models(provider, { auth } = {}) {
      if (auth?.type !== "api") return provider.models
      const base = apiBase(auth)
      if (!base) return provider.models
      try {
        const res = await fetch(`${base}/models`, {
          headers: { authorization: `Bearer ${auth.key}` },
          signal: AbortSignal.timeout(10000),
        })
        if (!res.ok) {
          // 401/403 时标记需重新登录；其他错误保留原列表
          if (res.status === 401 || res.status === 403)
            throw Object.assign(new Error("Key 失效"), { signIn: "expired" })
          return provider.models
        }
        const body = await res.json()
        // 不调用 client.auth.set：它会把整个 auth 对象替换成 body，
        // 抹掉 type/key/metadata，导致后续 loader 拿不到 baseURL/apiKey，
        // SDK 回退到内置 api(ark) → 401。consumer ID 改由 usage 钩子从响应里取。
        const built = buildModels(body?.data)
        return built || provider.models
      } catch (e) {
        if (e?.signIn === "expired") throw e
        return provider.models
      }
    },
  },
})

export default VolcengineUsagePlugin
