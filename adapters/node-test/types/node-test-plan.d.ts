/**
 * Switch plan of a session: the real absolute path of every switched file and
 * the absolute path of a JSON file with its `SwitchedFile`. A test process
 * reads the index once and a `SwitchedFile` only when it loads that file, so a
 * process that loads few switched files reads little.
 */
export type NodeTestPlan = Record<string, string>
