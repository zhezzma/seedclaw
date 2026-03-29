# Model Select Menu Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 抽出共享的模型菜单内容组件，并让聊天输入框与智能体概览页共用同一份模型选择列表 UI。

**Architecture:** 新增 `ModelSelectMenuContent.vue` 负责模型菜单内容显示，封装搜索、provider 分组、unknown current、选中高亮与右侧勾。`ChatInput.vue` 和 `AgentOverview.vue` 保留各自的 trigger / open state / 选中回调，只替换菜单内容区域。

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, node:test 源码结构断言测试, Tailwind/daisyUI

---

### Task 1: 为共享模型菜单内容组件建立测试与骨架

**Files:**
- Create: `src/components/models/ModelSelectMenuContent.vue`
- Create: `tests/model-select-menu-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/models/ModelSelectMenuContent.vue')
const source = readFileSync(componentPath, 'utf8')

test('model select menu content exposes grouped search and unknown-current rendering', () => {
  assert.match(source, /const searchText = ref\(''\)/)
  assert.match(source, /m\.name/)
  assert.match(source, /m\.id/)
  assert.match(source, /filteredGroups/)
  assert.match(source, /unknownCurrent/)
  assert.match(source, /defineEmits/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/model-select-menu-content.test.ts`
Expected: FAIL because `ModelSelectMenuContent.vue` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  availableModels: Array<{ provider: string; models: Array<{ id: string; name: string }> }>
  currentModel: string
}>()

const emit = defineEmits<{
  (e: 'select', modelId: string): void
}>()

const searchText = ref('')
const unknownCurrent = computed(() => props.currentModel)
const filteredGroups = computed(() => props.availableModels)
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/model-select-menu-content.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/models/ModelSelectMenuContent.vue tests/model-select-menu-content.test.ts
git commit -m "test(models): add shared model menu content skeleton"
```

### Task 2: 完成共享组件的搜索、分组与菜单渲染

**Files:**
- Modify: `src/components/models/ModelSelectMenuContent.vue`
- Modify: `tests/model-select-menu-content.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('model select menu content renders grouped search UI and emits full model ids', () => {
  assert.match(source, /placeholder=.*search/i)
  assert.match(source, /provider\.selectModel/)
  assert.match(source, /emit\('select', `\$\{group\.provider\}\/\$\{m\.id\}`\)/)
  assert.match(source, /bg-primary\/10 text-primary/)
  assert.match(source, /<CheckIcon/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/model-select-menu-content.test.ts`
Expected: FAIL because the skeleton lacks real template and emit wiring.

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { CheckIcon, MagnifyingGlassIcon } from '@heroicons/vue/24/outline'

interface ModelOption { id: string; name: string }
interface ModelGroup { provider: string; models: ModelOption[] }

const props = withDefaults(defineProps<{
  availableModels: ModelGroup[]
  currentModel: string
  title?: string
  searchPlaceholder?: string
  showUnknownCurrent?: boolean
}>(), {
  title: 'provider.selectModel',
  searchPlaceholder: '搜索模型名或 ID...',
  showUnknownCurrent: true,
})

const emit = defineEmits<{ (e: 'select', modelId: string): void }>()
const { t } = useI18n()
const searchText = ref('')
const normalizedQuery = computed(() => searchText.value.trim().toLowerCase())
const normalizedGroups = computed(() => props.availableModels)
const isCurrentModelAvailable = computed(() => normalizedGroups.value.some(group => group.models.some(m => `${group.provider}/${m.id}` === props.currentModel)))
const unknownCurrent = computed(() => {
  if (!props.showUnknownCurrent || !props.currentModel || isCurrentModelAvailable.value) return null
  const query = normalizedQuery.value
  if (query && !props.currentModel.toLowerCase().includes(query)) return null
  return props.currentModel
})
const filteredGroups = computed(() => normalizedGroups.value
  .map(group => ({
    provider: group.provider,
    models: group.models.filter(m => {
      const query = normalizedQuery.value
      if (!query) return true
      return m.name.toLowerCase().includes(query) || m.id.toLowerCase().includes(query)
    })
  }))
  .filter(group => group.models.length > 0)
)
const handleSelect = (provider: string, modelId: string) => emit('select', `${provider}/${modelId}`)
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/model-select-menu-content.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/models/ModelSelectMenuContent.vue tests/model-select-menu-content.test.ts
git commit -m "feat(models): add shared model menu content"
```

### Task 3: 接入聊天输入框模型选择器

**Files:**
- Modify: `src/components/chat/ChatInput.vue`
- Modify: `tests/chat-input-model-selected-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
test('chat input reuses the shared model menu content component', () => {
  assert.match(source, /import ModelSelectMenuContent from '\.\.\/models\/ModelSelectMenuContent\.vue'/)
  assert.match(source, /<ModelSelectMenuContent/)
  assert.match(source, /@select="handleModelSelect"/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/chat-input-model-selected-state.test.ts`
Expected: FAIL because `ChatInput.vue` still renders the model list inline.

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import ModelSelectMenuContent from '../models/ModelSelectMenuContent.vue'
</script>

<template>
  <ul v-if="modelDropdownOpen" class="...existing container classes...">
    <ModelSelectMenuContent
      :available-models="availableModels"
      :current-model="currentModel"
      @select="handleModelSelect"
    />
  </ul>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/chat-input-model-selected-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/chat/ChatInput.vue tests/chat-input-model-selected-state.test.ts
git commit -m "refactor(chat): reuse shared model menu content"
```

### Task 4: 接入智能体概览页模型选择器

**Files:**
- Modify: `src/components/agents/tabs/AgentOverview.vue`
- Create: `tests/agent-overview-model-dropdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const componentPath = path.resolve(testDir, '../src/components/agents/tabs/AgentOverview.vue')
const source = readFileSync(componentPath, 'utf8')

test('agent overview reuses the shared model menu content component instead of a native select', () => {
  assert.match(source, /import ModelSelectMenuContent from '\.\.\/\.\.\/models\/ModelSelectMenuContent\.vue'/)
  assert.match(source, /const modelDropdownOpen = ref\(false\)/)
  assert.match(source, /<ModelSelectMenuContent/)
  assert.doesNotMatch(source, /<select v-model="currentModel"/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/agent-overview-model-dropdown.test.ts`
Expected: FAIL because `AgentOverview.vue` still uses native `<select>`.

- [ ] **Step 3: Write minimal implementation**

```vue
<script setup lang="ts">
import ModelSelectMenuContent from '../../../components/models/ModelSelectMenuContent.vue'
const modelDropdownOpen = ref(false)
const toggleModelDropdown = () => { modelDropdownOpen.value = !modelDropdownOpen.value }
const handleModelSelect = (modelId: string) => {
  modelDropdownOpen.value = false
  currentModel.value = modelId
}
</script>

<template>
  <div class="dropdown w-full" :class="{ 'dropdown-open': modelDropdownOpen }">
    <button @click.stop="toggleModelDropdown" class="btn ...">{{ currentModel || $t('agent.selectModel') }}</button>
    <div v-if="modelDropdownOpen" class="dropdown-content ...">
      <ModelSelectMenuContent
        :available-models="availableModels"
        :current-model="currentModel"
        @select="handleModelSelect"
      />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/agent-overview-model-dropdown.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/agents/tabs/AgentOverview.vue tests/agent-overview-model-dropdown.test.ts
git commit -m "refactor(agent): reuse shared model menu content"
```

### Task 5: 全量验证

**Files:**
- Modify: `tests/model-select-menu-content.test.ts`
- Modify: `tests/chat-input-model-selected-state.test.ts`
- Modify: `tests/chat-input-thinking-selected-state.test.ts`
- Modify: `tests/agent-overview-model-dropdown.test.ts`

- [ ] **Step 1: Write/adjust failing integration assertions if needed**

```ts
test('shared model menu content keeps grouped provider output and search input wiring', () => {
  assert.match(source, /v-for="group in filteredGroups"/)
  assert.match(source, /v-model="searchText"/)
})
```

- [ ] **Step 2: Run focused tests to verify failures are meaningful**

Run: `node --experimental-strip-types --test tests/model-select-menu-content.test.ts tests/chat-input-model-selected-state.test.ts tests/agent-overview-model-dropdown.test.ts`
Expected: FAIL only if assertions do not match current implementation.

- [ ] **Step 3: Finalize minimal implementation/test alignment**

```bash
# If assertions expose mismatches, update component/template imports or classes only as needed.
```

- [ ] **Step 4: Run full verification**

Run: `node --experimental-strip-types --test tests/model-select-menu-content.test.ts tests/chat-input-model-selected-state.test.ts tests/chat-input-thinking-selected-state.test.ts tests/agent-overview-model-dropdown.test.ts && /root/.nvm/versions/node/v23.0.0/bin/npm run tcs`
Expected: All tests PASS, type check PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/models/ModelSelectMenuContent.vue src/components/chat/ChatInput.vue src/components/agents/tabs/AgentOverview.vue tests/model-select-menu-content.test.ts tests/chat-input-model-selected-state.test.ts tests/chat-input-thinking-selected-state.test.ts tests/agent-overview-model-dropdown.test.ts
git commit -m "feat(models): share model menu content across chat and agents"
```
