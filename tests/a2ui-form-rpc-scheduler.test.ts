import test from 'node:test'
import assert from 'node:assert/strict'
import { createA2uiRpcScheduler } from '../src/composables/useA2UIState.ts'

/** 表单 rpc 调度：快级联串行、安装类慢操作旁路（回归：安装中点保存被卡死）。 */

function deferred<T = void>() {
    let resolve!: (v: T) => void
    let reject!: (e: unknown) => void
    const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
    })
    return { promise, resolve, reject }
}

test('快操作串行：按调度顺序执行，前序未落地前后续不启动', async () => {
    const scheduler = createA2uiRpcScheduler()
    const order: string[] = []
    const gate = deferred()

    const p1 = scheduler.schedule(async () => {
        await gate.promise
        order.push('a')
    }, false)
    const p2 = scheduler.schedule(async () => {
        order.push('b')
    }, false)

    // 前序被 gate 挡住时，后续不得提前执行
    await Promise.resolve()
    assert.deepEqual(order, [])
    gate.resolve()
    await Promise.all([p1, p2])
    assert.deepEqual(order, ['a', 'b'])
})

test('慢操作旁路：不等待串行链、也不阻塞链上的后续快操作', async () => {
    const scheduler = createA2uiRpcScheduler()
    const order: string[] = []
    const slowGate = deferred()

    // 安装类慢操作先入（旁路，被 gate 挡住——模拟分钟级下载）
    const slow = scheduler.schedule(async () => {
        await slowGate.promise
        order.push('slow')
    }, true)
    // 快级联后入：不得被慢操作卡住
    const fast = scheduler.schedule(async () => {
        order.push('fast')
    }, false)

    await fast
    assert.deepEqual(order, ['fast'], '快操作必须在慢操作完成前完成')
    slowGate.resolve()
    await slow
    assert.deepEqual(order, ['fast', 'slow'])
})

test('save/settled 只等快链：慢操作在途时 settled 立即落地', async () => {
    const scheduler = createA2uiRpcScheduler()
    const slowGate = deferred()
    const slow = scheduler.schedule(() => slowGate.promise, true)

    const settled = await Promise.race([
        scheduler.settled,
        new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 20)),
    ])
    assert.notEqual(settled, 'timeout', 'settled 不得等待旁路的慢操作')
    slowGate.resolve()
    await slow
})

test('快操作失败不毒化链：后续照常执行', async () => {
    const scheduler = createA2uiRpcScheduler()
    const order: string[] = []
    const failing = scheduler.schedule(async () => {
        order.push('fail')
        throw new Error('boom')
    }, false)
    await assert.rejects(failing, /boom/)
    const next = scheduler.schedule(async () => {
        order.push('next')
    }, false)
    await next
    assert.deepEqual(order, ['fail', 'next'])
})

test('慢操作失败不影响链与自身旁路 promise（静默消化）', async () => {
    const scheduler = createA2uiRpcScheduler()
    const slow = scheduler.schedule(async () => {
        throw new Error('install failed')
    }, true)
    // 返回的旁路 promise 已吞错（UI 错误提示由 api-client 全局 toast 承担）
    await slow
    const fast = scheduler.schedule(async () => {}, false)
    await fast
})
