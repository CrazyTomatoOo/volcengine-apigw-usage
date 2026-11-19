# 只注册 OpenAI-compatible 提供者

**Status:** accepted

插件此前同时注册 `volcengine-apigw` 和 `volcengine-apigw-anthropic`，两者使用同一个网关和 API Key，却因为 magpie 按 provider 隔离认证，需要分别登录并产生两套额度窗口。由于 magpie 网关会把 Anthropic Messages 请求转换成目标 provider 的协议，Claude Code 可以直接使用 `volcengine-apigw/<model>`，因此我们删除 `volcengine-apigw-anthropic`，只保留一个 OpenAI-compatible provider。

## Considered Options

- **保留两个 provider**：原生 Anthropic 路径保真度更高，但需要重复登录、重复展示用量，并让用户误以为必须二选一。
- **保留 deprecated 别名**：可以平滑迁移，但仍然保留第二套 provider 注册和认证，违背简化的目的。
- **只保留 Anthropic provider**：会失去对其他 OpenAI-compatible agent 的直接支持。

## Consequences

- 用户只需登录一次，额度面板也只显示一套窗口。
- 所有 Anthropic 客户端都经过 magpie 的协议转换；Anthropic 特有的 thinking、cache、beta 字段和工具调用语义可能与原生 `/v1/messages` 路径不同。
- 已选择 `volcengine-apigw-anthropic/<model>` 的用户需要改为 `volcengine-apigw/<model>`，并清理旧登录。
- 如果以后必须要求原生 Anthropic Messages 直通，应重新引入一个独立的 provider，而不是让单一 provider 同时承担两种协议。
