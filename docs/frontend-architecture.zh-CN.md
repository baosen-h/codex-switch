# 前端架构

本项目使用 feature folder 管理页面级代码。目标是在贡献者引入新的设计组件或样式方案时，仍然能让 UI 变更保持清晰、可控、低风险。

## 目录职责

- `src/features/*`：路由级产品功能。页面编排、功能内组件、hooks、存储辅助函数和功能文档都放在这里。
- `src/components/app`：可复用的应用外壳组件，例如标题栏、侧边栏、引导、更新提示和 toast。
- `src/components/domain`：可复用的产品领域组件，例如 Provider 头像、消息渲染、品牌图标和能力标签。
- `src/components/ui`：稳定的通用基础组件和图标。实验性功能设计不要先放到这里。
- `src/utils`：与具体产品页面无关的辅助函数和共享业务逻辑。
- `src/pages`：已废弃。不要在这里添加新文件。

## 功能边界

每个功能应该只暴露很小的公共入口：

```txt
features/example/
  index.ts
  ExamplePage.tsx
  README.md
  types.ts
  components/
  hooks/
```

`App.tsx` 应该只从 `features/<name>` 导入功能页面，不要直接导入功能内部组件。在功能内部，页面文件负责组合区块并管理编排逻辑。组件应该接收明确的 props，避免直接调用无关 API。

## 引入新的 UI 设计

引入新的 UI 设计时：

1. 先放到目标功能内，通常是 `features/<feature>/components`。
2. 让包装组件的 API 贴近现有功能数据流。
3. 先保持现有行为，再做视觉优化。
4. 把具体 UI 包的细节限制在功能包装组件内。
5. 只有同一个组件被多个功能需要时，才提升到 `components/ui`。

这样可以降低 Semi UI、Theme UI、其他 UI 库和本地 CSS 之间的冲突风险。

## 适合优先改造的位置

- Prompt/chat UI：从 `features/talking/components` 开始。
- 图片 prompt 控件：从 `features/drawing/components` 开始。
- Provider/model 表单：从 `features/providers/components` 或 `features/agents/components` 开始。
- Transcript/list 布局：从 `features/sessions/components` 开始。

## Review 检查清单

- `npm run build` 通过。
- 功能 README 仍然与代码一致。
- 应用路由从 `features/<name>` 导入。
- 没有在缺少明确理由的情况下新增跨功能导入。
- 新的共享 UI 在拥有稳定、功能无关的 API 前，不提升到 `components/ui`。
- 视觉变更在窄屏和宽屏下都能保持文字不溢出。
