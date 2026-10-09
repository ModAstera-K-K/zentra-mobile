type TaskExecutor = (body: {
  data: unknown;
  error: null;
  executionInfo: { taskName: string };
}) => Promise<unknown>;

const tasks = new Map<string, TaskExecutor>();

export function isTaskDefined(name: string): boolean {
  return tasks.has(name);
}

export function defineTask(name: string, executor: TaskExecutor): void {
  tasks.set(name, executor);
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}

export async function isTaskRegisteredAsync(_name: string): Promise<boolean> {
  return false;
}

/** Test hook: start a defined task, as the system does. */
export function startTask(name: string, data: unknown = {}): Promise<unknown> {
  const executor = tasks.get(name);
  if (!executor) throw new Error(`Task ${name} is not defined`);
  return executor({ data, error: null, executionInfo: { taskName: name } });
}
