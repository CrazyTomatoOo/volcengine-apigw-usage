# volcengine-apigw-usage

火山引擎 APIG 网关的 Magpie 插件：把 BlueRegion 架构的推理网关注册为 magpie 供应商，并提供 token 用量查询。

## 功能

- **推理转发**：通过 OpenAI 兼容的 `/chat/completions` 调用网关后端模型（SDK 在 baseURL 后追加该路径；网关同时支持 `/v1/chat/completions`）
- **动态模型列表**：从网关 `/v1/models` 获取账号可用模型 + credit 计量倍率
- **用量查询**：在 magpie quota 面板展示今日/本月 token 用量（输入/输出/缓存命中/请求数）
- **静态元数据富化**：context 窗口、USD 价格、推理/多模态标记来自内置 `MODEL_META` 表

## 安全模型

与 [BlueRegionUsage](https://gitcode.com/solcao/BlueRegionUsage) 一致：

- 用户持有自己的推理 API Key → 网关 key-auth 校验后注入 consumer ID
- 函数只以 consumer ID 过滤 PromQL，用户天然只能查到自己的数据
- 插件只做客户端转发，凭证不离开用户机器

## 前提

网关上需已部署 BlueRegionUsage 的 `/v1/usage/*` 函数路由。未部署时推理不受影响，用量查询会降级为错误提示。

## 安装

```bash
magpie plugin add /path/to/volcengine-apigw
magpie plugin login volcengine-apigw
```

登录时会询问：
1. **网关基础地址**（gatewayBaseUrl）：如 `https://xxx.apigateway-cn-beijing.volceapi.com`
2. **API Key**：网关推理 Key（UUID 形式）

## 用量接口

| 端点 | 用途 |
|---|---|
| `GET /v1/models` | 模型列表 + credit 倍率 |
| `GET /v1/usage/summary?window=today\|month` | 汇总用量 |
| `POST /chat/completions` | 推理（magpie 自动调用，等价于 `/v1/chat/completions`） |

## 支持的模型

16 个，包括 DeepSeek V4 Flash/Pro、GLM 5.2/5.3/5.3-Flash、Doubao Seed 2.1 Pro、Kimi K3、Qwen3.7/3.8 系列等。完整列表见 `volcengine-apigw/index.mjs` 的 `MODEL_META`。

## 目录结构

```
volcengine-apigw/             # magpie 插件
  index.mjs                  # 插件主体
  package.json               # npm 包定义
  README.md                  # 插件文档
```

## License

MIT
