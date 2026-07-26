#!/usr/bin/env node
/**
 * DAG Reset — Initialize a clean DAG for a new project
 *
 * Usage:
 *   node scripts/dag-reset.js "<Project Name>"
 *
 * This clears all nodes, edges, and logs,
 * leaving you with a fresh DAG ready for /create-issues to populate.
 */

const fs = require('fs');
const path = require('path');

const DAG_FILE = path.resolve(__dirname, '..', 'dag.json');
const projectName = process.argv[2] || 'My Project';

const freshDAG = {
  project: projectName,
  lastUpdated: new Date().toISOString(),
  phases: [
    { id: "phase-1", name: "Foundation", description: "Core infrastructure and setup" },
    { id: "phase-2", name: "Core Features", description: "Main value proposition" },
    { id: "phase-3", name: "Polish", description: "Enhancements and optimization" }
  ],
  nodes: [],
  edges: [],
  log: []
};

fs.writeFileSync(DAG_FILE, JSON.stringify(freshDAG, null, 2));

console.log(`\n  DAG reset for project: "${projectName}"`);
console.log(`  File: ${DAG_FILE}`);
console.log(`\n  Ready for /create-issues to populate.\n`);
