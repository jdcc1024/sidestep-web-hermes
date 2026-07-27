#!/usr/bin/env node
/**
 * DAG Prune & Archive Utility
 *
 * 1. Archives completed nodes and obsolete edges into dag-archive.json.
 * 2. Removes the "agents" entity entirely from dag.json.
 * 3. Keeps dag.json lightweight (~5 KB) for active AI sessions and DAG viewer.
 *
 * Usage:
 *   node scripts/dag-prune.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DAG_FILE = path.join(ROOT, 'dag.json');
const ARCHIVE_FILE = path.join(ROOT, 'dag-archive.json');

if (!fs.existsSync(DAG_FILE)) {
  console.error(`Error: ${DAG_FILE} not found.`);
  process.exit(1);
}

const dag = JSON.parse(fs.readFileSync(DAG_FILE, 'utf8'));

// Load existing archive if present
let archive = {
  project: dag.project,
  archivedAt: new Date().toISOString(),
  nodes: [],
  edges: [],
  log: []
};

if (fs.existsSync(ARCHIVE_FILE)) {
  try {
    archive = JSON.parse(fs.readFileSync(ARCHIVE_FILE, 'utf8'));
  } catch (e) {
    console.warn(`Warning: Existing archive could not be parsed. Initializing new archive.`);
  }
}

const completedNodes = dag.nodes.filter(n => n.status === 'completed' || n.status === 'obsolete');
const activeNodes = dag.nodes.filter(n => n.status !== 'completed' && n.status !== 'obsolete');

const activeNodeIds = new Set(activeNodes.map(n => n.id));

// Keep edges where the target (to) is an active node
const activeEdges = dag.edges.filter(e => activeNodeIds.has(e.to));
const archivedEdges = dag.edges.filter(e => !activeNodeIds.has(e.to));

// Merge completed nodes into archive without duplicates by ID
const archiveNodeIds = new Set(archive.nodes.map(n => n.id));
completedNodes.forEach(n => {
  if (!archiveNodeIds.has(n.id)) {
    archive.nodes.push(n);
  }
});

// Deduplicate archived edges
const existingEdgeKeys = new Set(archive.edges.map(e => `${e.from}->${e.to}`));
archivedEdges.forEach(e => {
  const key = `${e.from}->${e.to}`;
  if (!existingEdgeKeys.has(key)) {
    archive.edges.push(e);
    existingEdgeKeys.add(key);
  }
});

archive.archivedAt = new Date().toISOString();

// Construct new pruned DAG without any "agents" key
const updatedDAG = {
  project: dag.project,
  lastUpdated: new Date().toISOString(),
  phases: dag.phases,
  nodes: activeNodes,
  edges: activeEdges,
  log: (dag.log || []).slice(-20)
};

// Write output files
fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archive, null, 2));
fs.writeFileSync(DAG_FILE, JSON.stringify(updatedDAG, null, 2));

console.log(`\n✅ DAG Prune & Archive Complete!`);
console.log(`  • Active tasks in dag.json: ${activeNodes.length}`);
console.log(`  • Archived tasks in dag-archive.json: ${archive.nodes.length}`);
console.log(`  • Agents entity: Removed completely`);
console.log(`  • File: ${DAG_FILE}\n`);
