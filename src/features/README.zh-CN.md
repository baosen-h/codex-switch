# Features

Feature 文件夹是页面级产品代码的主要归属位置。`src/pages` 已经废弃；新的路由级 UI 应该添加到 `src/features/<feature>` 下。

当一个页面拥有明确的状态、存储、API 编排、异步流程，或者包含多个页面专属组件时，就应该使用 feature 文件夹。可复用的应用外壳放在 `components/app`，产品级通用 UI 放在 `components/domain`，稳定的通用基础组件放在 `components/ui`。

## 所有权

- `App.tsx` 只从 `features/<name>` 导入功能页面。
- 每个功能都通过 `index.ts` 导出公共页面。
- `FeaturePage.tsx` 负责数据、异步调用、功能状态和页面区块组合。
- `components/` 存放功能内 UI，可以非常贴近该页面的具体需求。
- `hooks/` 存放功能内有状态逻辑，适用于在功能内部复用，或用于保持页面文件清晰。
- `storage.ts`、`constants.ts`、`types.ts`、`*Utils.ts` 等辅助文件存放非 React 逻辑。
- 应避免跨 feature 导入。如果两个功能需要同一段行为，应把稳定部分提升到 `components/domain`、`components/ui` 或 `utils`。

## UI 集成策略

新的 UI 设计应该先落在目标 feature 内。例如，新的 prompt composer 设计应该先放到 `features/talking/components`，而不是直接放进 `components/ui`。

只有满足以下条件时，才把组件提升到 `components/ui`：

- 至少两个功能都需要它，
- props 已经稳定，
- 不依赖功能特定的数据结构，
- 可以通过共享 tokens 样式化，而不是依赖页面专属假设。

新的包依赖也应该先封装在 feature-local 组件后面。这样即使 UI 库与 Semi UI、Theme UI 或现有 CSS 冲突，影响范围也更小。

## 推荐结构

```txt
features/example/
  index.ts
  ExamplePage.tsx
  README.md
  types.ts
  constants.ts
  storage.ts
  hooks/
  components/
```

## 当前功能

- `talking`：主要聊天功能和 prompt composer 边界。
- `drawing`：图片生成和图片编辑流程。
- `providers`：可复用 API Provider 配置。
- `agents`：Codex、Claude 和 Gemini 运行时 Provider 配置。
- `settings`：应用偏好、视觉回退和联网搜索设置。
- `sessions`：已记录会话浏览和 handoff 复制。

## 重构规则

- 保持行为不变的结构调整要与视觉优化分开。
- 除非任务明确要求视觉变更，否则重构时保留 class name。
- 移动 feature 边界后运行 `npm run build`。
- 对视觉变更，需要运行应用并手动检查被修改的功能；如果变更影响大范围布局或可能造成视觉回归，运行 `npm run ui:shot`。
