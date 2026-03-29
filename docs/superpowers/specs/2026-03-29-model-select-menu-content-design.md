# 模型选择菜单内容组件设计

日期：2026-03-29

## 背景

当前项目里至少有两处模型选择 UI：

1. 聊天输入框中的模型选择下拉
2. 智能体概览页中的默认模型选择

两者当前实现不一致：
- 聊天输入框使用自定义下拉列表，支持 provider 分组、选中态高亮、右侧勾选图标
- 智能体概览页仍使用原生 `<select>`

目标是以聊天输入框中的模型选择列表为基准，抽出一份可复用的“菜单内容组件”，并让智能体概览页改为相同风格的交互。

## 目标

- 抽象出一份共享的模型选择菜单内容组件
- 只抽象“下拉菜单内容显示部分”，不抽象触发器和开关逻辑
- 聊天输入框与智能体概览页共用该内容组件
- 在菜单内容中加入搜索框
- 搜索匹配范围为：模型显示名 `m.name` + 模型 ID `m.id`
- 搜索结果仍按 provider 分组显示，不打平成单列表
- 保持聊天输入框现有视觉样式为基准实现

## 非目标

- 不抽象 thinking 选择器
- 不抽象 dropdown/modal/popup 的壳子
- 不统一各页面的打开/关闭状态管理
- 不修改模型数据源结构
- 不引入新的测试框架

## 组件设计

### 新组件

建议新增：

`src/components/models/ModelSelectMenuContent.vue`

该组件只负责渲染菜单内容，不负责触发按钮和展开收起。

### 组件职责

- 渲染标题
- 渲染搜索输入框
- 渲染 provider 分组标题
- 渲染模型列表项
- 渲染当前选中高亮
- 渲染右侧勾选图标
- 渲染当前值不在列表中的 unknown current 项
- 点击某项时发出 select 事件

### 非职责

以下内容由父组件继续负责：

- trigger 按钮
- dropdown 是否打开
- 点击外部关闭
- 面板定位与容器尺寸
- 选中后的业务处理
  - 聊天输入框：发送 `/model {provider}/{model}`
  - 智能体概览页：更新 `defaultProvider/defaultModel`

## 数据接口

### Props

- `availableModels`
  - 直接接收 `useModelsState().availableModels`
- `currentModel: string`
  - 格式为 `provider/modelId`
- `title?: string`
  - 默认为 i18n 的 `provider.selectModel`
- `searchPlaceholder?: string`
  - 默认为“搜索模型名或 ID...”
- `showUnknownCurrent?: boolean`
  - 默认 `true`
- `unknownCurrentLabel?: string`
  - 控制 unknown model 文案

### Emits

- `select(modelId: string)`
  - 返回完整值 `provider/modelId`

## 内部状态与派生逻辑

组件内部维护：

- `searchText`

派生数据：

1. `normalizedGroups`
   - 标准化 provider / model 数据，便于统一渲染
2. `filteredGroups`
   - 基于 `searchText` 过滤后的分组结果
   - 过滤后仍保留 provider 分组结构
3. `isCurrentModelAvailable`
   - 判断当前值是否仍存在于 availableModels 中
4. `unknownCurrentItem`
   - 当前模型存在值但不在列表中时的回退显示项

## 搜索规则

### 匹配范围

搜索时匹配以下两个字段：

- `m.name`
- `m.id`

不匹配 provider 名。

### 分组规则

搜索后仍按 provider 分组：

- 每个 provider 组只显示命中的模型
- 若某个 provider 没有任何命中项，则该 provider 组不显示
- 不将所有搜索结果拍平成单个列表

### Unknown current 项行为

若 `currentModel` 不在 `availableModels` 中：

- 默认在列表顶部显示 unknown current 项
- 当存在搜索词时：
  - 若 unknown current 的完整字符串匹配搜索词，则继续显示
  - 否则隐藏

## 视觉与交互规范

以聊天输入框当前模型选择列表为基准：

- provider 分组标题样式保持一致
- 选中项使用 `bg-primary/10 text-primary`
- 右侧显示勾选图标
- 未选中项保留右侧占位，避免文字抖动
- 模型名称区域继续使用 `flex-1 min-w-0`，保证长文本省略与右侧图标共存

共享组件只输出菜单内容节点；外层 dropdown-content / modal body 由父组件决定。

## 聊天输入框接入方式

### 保留部分

聊天输入框继续保留：

- dropdown trigger 按钮
- `modelDropdownOpen`
- 点击外部关闭逻辑
- `handleModelSelect`
- 容器定位与移动端样式

### 替换部分

将当前聊天输入框中的模型列表 `<ul>...</ul>` 内容替换为共享组件。

调用方式：

- 传入 `availableModels`
- 传入 `currentModel`
- 监听 `select`
- 在 `select` 回调中继续调用现有 `handleModelSelect`

## 智能体概览页接入方式

### 当前问题

智能体概览页使用原生 `<select>`，样式和体验与聊天输入框不一致，也无法复用搜索与选中态能力。

### 迁移目标

改成和聊天输入框类似的交互：

- 一个按钮式触发器显示当前模型
- 点击后展开 dropdown 面板
- 面板内部放共享模型菜单内容组件

### 保留部分

保留现有 `currentModel` computed：

- getter 继续返回 `provider/model`
- setter 继续拆分 provider/model 并调用 `agentsState.updateAgent`

### 新增部分

智能体概览页新增：

- 控制模型 dropdown 展开的本地状态
- 点击模型项后关闭 dropdown 的逻辑
- 若需要，可增加点击外部关闭逻辑，风格与页面已有交互保持一致

## 测试策略

延续当前项目的源码结构断言测试风格。

### 1. 共享组件测试

新增测试覆盖：

- 存在搜索输入框
- 搜索逻辑匹配 `m.name + m.id`
- 搜索结果仍按 provider 分组渲染
- unknown current 项的渲染分支存在
- 选中项使用主题色高亮和右侧勾选图标

### 2. 聊天输入框接入测试

新增或更新测试覆盖：

- `ChatInput.vue` 已改为使用共享模型菜单内容组件
- 聊天输入框仍通过自己的 `handleModelSelect` 处理选择结果
- 现有模型选中样式与布局不回退

### 3. 智能体概览页接入测试

新增测试覆盖：

- 原生 `<select>` 已移除
- 组件改为使用共享模型菜单内容组件
- 仍通过 `currentModel` 的 setter 更新 agent 默认模型
- trigger 文案能展示当前模型或 unknown current 值

## 实施顺序

1. 新增 `ModelSelectMenuContent.vue`
2. 先迁移聊天输入框到共享组件
3. 补齐聊天输入框回归测试
4. 再迁移智能体概览页到共享组件
5. 补齐智能体概览页测试
6. 最后做必要的样式微调

## 风险与规避

### 风险 1：聊天输入框回归

聊天输入框已有移动端与桌面端不同定位逻辑，若误把外层容器一起抽走，容易破坏现有布局。

**规避**：只抽菜单内容，不动外层 dropdown 容器。

### 风险 2：智能体概览页状态更新断裂

当前概览页通过 `currentModel` computed setter 直接更新 agent，改造时若绕开这个入口，容易破坏更新逻辑。

**规避**：选中回调统一写回 `currentModel`。

### 风险 3：搜索后分组丢失

很多实现会在搜索时直接平铺结果，和需求冲突。

**规避**：搜索结果保持 `provider -> models[]` 的数据结构后再渲染。

### 风险 4：unknown current 项消失

当当前模型不在列表中时，用户可能失去上下文。

**规避**：保留 unknown current 分支，并明确其搜索行为。

## 成功标准

完成后应满足：

- 聊天输入框与智能体概览页共用同一份模型菜单内容组件
- 两边的模型列表视觉与交互保持一致
- 搜索支持模型名和模型 ID
- 搜索结果仍按 provider 分组显示
- 当前选中项保持主题色高亮与右侧勾选图标
- 智能体概览页不再使用原生 `<select>`
- 各处 trigger 与选中后的业务动作仍由各自父组件管理
