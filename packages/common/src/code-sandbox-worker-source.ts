/**
 * Source of the worker thread that runs model-written code in QuickJS (WebAssembly). It is plain
 * JavaScript run with `new Worker(source, { eval: true })`, so no build step can rewrite it, and it
 * loads its modules with dynamic `import()`, which works whether the worker starts as CommonJS or
 * as an ES module. Inside QuickJS the code sees only `tools`, `callTool` and `console`: no
 * filesystem, network, timers or process. A native stack overflow can still escape QuickJS's own
 * limits, which is why this runs in a worker the parent can terminate.
 *
 * Messages to the parent: { type: 'call', id, tool, args } | { type: 'log', text } | { type: 'done', ok, value | error }.
 * Messages from the parent: { id, ok, value } where value is the tool result as JSON, or an error message.
 */
export const SANDBOX_WORKER_SOURCE = String.raw`
const describe = (error) => {
  if (error && typeof error === 'object') return (error.name ? error.name + ': ' : '') + (error.message ?? JSON.stringify(error));
  return String(error);
};

const prelude = (toolNames) => '(() => {' +
  'const call = globalThis.__call; const log = globalThis.__log; delete globalThis.__call; delete globalThis.__log;' +
  'const format = (value) => typeof value === "string" ? value : JSON.stringify(value);' +
  'const write = (...args) => log(args.map(format).join(" "));' +
  'globalThis.console = Object.freeze({ log: write, info: write, warn: write, error: write });' +
  'globalThis.callTool = (name, args) => call(String(name), JSON.stringify(args ?? {})).then((text) => JSON.parse(text));' +
  'const tools = {}; for (const name of ' + JSON.stringify(toolNames) + ') tools[name] = (args) => globalThis.callTool(name, args);' +
  'globalThis.tools = new Proxy(Object.freeze(tools), { get: (target, name) => name in target || typeof name !== "string" || name === "then" ? target[name] : (args) => globalThis.callTool(name, args) });' +
  '})();';

const program = (code) => '(async () => {\n' + code + '\n})().then((value) => JSON.stringify(value === undefined ? null : value) ?? "null")';

function installHost(vm, runtime, parentPort) {
  const pending = new Map();
  let nextId = 0;
  parentPort.on('message', ({ id, ok, value }) => {
    const deferred = pending.get(id);
    if (!deferred) return;
    pending.delete(id);
    const handle = ok ? vm.newString(value) : vm.newError(value);
    if (ok) deferred.resolve(handle); else deferred.reject(handle);
    handle.dispose();
  });
  const call = vm.newFunction('__call', (nameHandle, argsHandle) => {
    const id = nextId++;
    const deferred = vm.newPromise();
    pending.set(id, deferred);
    deferred.settled.then(() => runtime.executePendingJobs());
    parentPort.postMessage({ type: 'call', id, tool: vm.getString(nameHandle), args: vm.getString(argsHandle) });
    return deferred.handle;
  });
  const log = vm.newFunction('__log', (textHandle) => {
    parentPort.postMessage({ type: 'log', text: vm.getString(textHandle) });
  });
  vm.setProp(vm.global, '__call', call);
  vm.setProp(vm.global, '__log', log);
  call.dispose();
  log.dispose();
}

async function evaluate(vm, runtime, workerData) {
  const setup = vm.evalCode(prelude(workerData.toolNames), 'prelude.js');
  if (setup.error) return { ok: false, error: describe(vm.dump(setup.error)) };
  setup.value.dispose();
  const started = vm.evalCode(program(workerData.code), 'code.js');
  if (started.error) return { ok: false, error: describe(vm.dump(started.error)) };
  const promise = vm.resolvePromise(started.value);
  started.value.dispose();
  runtime.executePendingJobs();
  const settled = await promise;
  if (settled.error) return { ok: false, error: describe(vm.dump(settled.error)) };
  return { ok: true, value: vm.getString(settled.value) };
}

(async () => {
  const { parentPort, workerData } = await import('node:worker_threads');
  try {
    const core = await import(workerData.coreUrl);
    const variantModule = await import(workerData.variantUrl);
    const quickjs = await core.newQuickJSWASMModuleFromVariant(variantModule.default?.default ?? variantModule.default);
    const runtime = quickjs.newRuntime();
    runtime.setMemoryLimit(workerData.limits.memoryBytes);
    runtime.setMaxStackSize(workerData.limits.stackBytes);
    runtime.setInterruptHandler(core.shouldInterruptAfterDeadline(Date.now() + workerData.limits.timeoutMs));
    const vm = runtime.newContext();
    installHost(vm, runtime, parentPort);
    parentPort.postMessage({ type: 'done', ...(await evaluate(vm, runtime, workerData)) });
  } catch (error) {
    parentPort.postMessage({ type: 'done', ok: false, error: describe(error) });
  }
})();
`;
