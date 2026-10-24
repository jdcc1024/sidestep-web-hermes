// Records every test and every step (expect / pw:api / fixture / hook) with
// start time and duration, as JSONL. Card t_1ccf624f, read-only instrumentation.
import fs from "node:fs";

const OUT = process.env.STEP_LOG ?? "steps.jsonl";

export default class StepReporter {
  constructor() {
    fs.writeFileSync(OUT, "");
  }
  write(o) {
    fs.appendFileSync(OUT, JSON.stringify(o) + "\n");
  }
  id(test) {
    return `${test.location.file.split("/e2e/")[1]}:${test.location.line}`;
  }
  project(test) {
    return test.parent?.project()?.name ?? "?";
  }
  onStepEnd(test, result, step) {
    this.write({
      k: "step",
      test: this.id(test),
      project: this.project(test),
      retry: result.retry,
      cat: step.category,
      title: step.title.slice(0, 200),
      start: step.startTime.getTime(),
      dur: step.duration,
      err: step.error ? String(step.error.message ?? "").slice(0, 300) : undefined,
      depth: (() => { let d = 0, p = step.parent; while (p) { d++; p = p.parent; } return d; })(),
    });
  }
  onTestEnd(test, result) {
    this.write({
      k: "test",
      test: this.id(test),
      title: test.title,
      project: this.project(test),
      tags: test.tags,
      start: result.startTime.getTime(),
      dur: result.duration,
      status: result.status,
      err: result.error ? String(result.error.message ?? "").slice(0, 500) : undefined,
    });
  }
  onEnd(r) {
    this.write({ k: "end", status: r.status, start: r.startTime.getTime(), dur: r.duration });
  }
  printsToStdio() {
    return false;
  }
}
