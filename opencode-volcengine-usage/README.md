# opencode-volcengine-usage

Magpie / OpenCode 供应商插件：**火山引擎 APIG 网关（BlueRegion 架构）**。

把你的网关注册为 magpie 供应商，agent 即可通过 `volcengine/<model>` 访问网关上的模型；同时在 magpie 的额度面板展示个人 Token 用量（今日 / 本月）。

## 它做什么

- **推理转发**：模型走 OpenAI 兼容的 `/v1/chat/completions`，agent 发来的 Anthropic / Responses / Gemini 请求由 magpie 网关自动转换。
- **模型列表**：`provider.models` 查询网关 `/v1/models`，按账号列出可用模型及 `credit` 计量倍率（映射到 magpie `rate` 字段）。
- **用量展示**：`auth.usage` 查询 `/v1/usage/summary`，在 magpie quota 面板显示今日 / 本月的输入 / 输出 / 缓存命中 / 请求数。

## 前提

网关上已部署 [BlueRegionUsage](https://gitcode.com/solcao/BlueRegionUsage) 的 `/v1/usage/*` 函数路由。未部署时不影响推理，仅用量展示降级为错误提示。

## 安装

```bash
# 文件夹就地加载
magpie plugin add ./opencode-volcengine-usage

# 或从 git
magpie plugin add gitcode:solcao/opencode-volcengine-usage
```

## 登录

```bash
magpie plugin login volcengine
```

会依次询问：

1. **API Key** — 网关签发的个人推理 Key（`api-key-xxxxxxxx` 形式）
2. **网关基础地址** — 如 `https://gateway.example.com`

登录时插件会调 `/v1/models` 校验 Key 并提取 consumer ID 作为账号名。

## 验证

```bash
magpie plugin              # volcengine (火山引擎网关, N models)  signed in
magpie provider test volcengine
magpie quota               # 今日 / 本月 token 用量
```

之后 agent 可用 `volcengine/deepseek-v4-pro` 等模型 ID。

## 安全模型

与 BlueRegionUsage 一致：

- 用户 API Key 在网关 key-auth 层校验后注入 consumer ID，**凭证止于网关**
- 用量函数只以 consumer ID 作 PromQL 过滤，用户天然只能查到自己的数据
- 本插件只做客户端转发，凭证不离开用户机器
- `plugin-auth.json` 权限 600，与 OpenCode / magpie 其他插件相同

## 配置文件

| 文件 | 内容 |
|------|------|
| `~/.config/magpie/plugin-auth.json` | 登录信息（Key + gatewayBaseUrl，权限 600） |
| `~/.config/magpie/plugin-providers.json` | 插件列出的供应商和模型缓存 |

## 选项

无。网关地址和 API Key 在登录时提供。

## License

Apache-2.0
