#!/usr/bin/env node
/**
 * Patchea los workflows para compatibilidad con la instancia n8n del usuario.
 * Fixes: typeVersions, parameter formats, credentials vacias.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CLEAN_DIR = path.join(__dirname, '..', 'workflows', 'clean');
const uuid = () => crypto.randomUUID();

function fixWorkflow(filename) {
  const filepath = path.join(CLEAN_DIR, filename);
  if (!fs.existsSync(filepath)) { console.log('  SKIP:', filename, '(no existe)'); return; }

  const wf = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  let fixes = 0;

  for (const node of wf.nodes) {
    // ── Remove empty credentials ──
    if (node.credentials) {
      const allEmpty = Object.values(node.credentials).every(c => !c.id && !c.name);
      if (allEmpty) {
        delete node.credentials;
        fixes++;
      }
    }

    // ── Fix IF nodes → v2.3 ──
    if (node.type === 'n8n-nodes-base.if') {
      node.typeVersion = 2.3;
      if (node.parameters?.conditions?.options) {
        node.parameters.conditions.options.typeValidation = 'strict';
        node.parameters.conditions.options.version = 3;
      }
      if (node.parameters?.conditions?.conditions) {
        for (const c of node.parameters.conditions.conditions) {
          if (!c.id) c.id = uuid();
        }
      }
      fixes++;
    }

    // ── Fix Switch nodes → v3.3 ──
    if (node.type === 'n8n-nodes-base.switch') {
      node.typeVersion = 3.3;
      if (node.parameters?.rules?.values) {
        for (const rule of node.parameters.rules.values) {
          if (!rule.renameOutput) rule.renameOutput = true;
          if (rule.conditions?.options) {
            rule.conditions.options.typeValidation = 'strict';
            rule.conditions.options.version = 2;
          } else if (rule.conditions) {
            rule.conditions.options = {
              caseSensitive: true,
              leftValue: '',
              typeValidation: 'strict',
              version: 2,
            };
          }
          if (rule.conditions?.conditions) {
            for (const c of rule.conditions.conditions) {
              if (!c.id) c.id = uuid();
            }
          }
        }
      }
      if (!node.parameters.options) node.parameters.options = {};
      fixes++;
    }

    // ── Fix Google Sheets → v4.7 ──
    if (node.type === 'n8n-nodes-base.googleSheets') {
      node.typeVersion = 4.7;
      fixes++;
    }

    // ── Fix Telegram nodes → v1.2 (keep) ──
    // Already v1.2, OK

    // ── Fix Gmail → v2.1 (keep) ──
    // Already v2.1, OK

    // ── Fix respondToWebhook ──
    if (node.type === 'n8n-nodes-base.respondToWebhook') {
      node.typeVersion = 1.1;
      // Fix responseBody to be proper format
      if (node.parameters?.options?.responseCode) {
        // responseCode should be a number in options, not expression
        const code = node.parameters.options.responseCode;
        if (typeof code === 'string' && !code.startsWith('=')) {
          node.parameters.options.responseCode = parseInt(code) || 200;
        }
      }
      fixes++;
    }

    // ── Fix Webhook node ──
    if (node.type === 'n8n-nodes-base.webhook') {
      node.typeVersion = 2;
      fixes++;
    }

    // ── Fix Execute Workflow ──
    if (node.type === 'n8n-nodes-base.executeWorkflow') {
      node.typeVersion = 1.2;
      fixes++;
    }

    // ── Fix Execute Workflow Trigger ──
    if (node.type === 'n8n-nodes-base.executeWorkflowTrigger') {
      node.typeVersion = 1.1;
      fixes++;
    }

    // ── Fix Schedule Trigger ──
    if (node.type === 'n8n-nodes-base.scheduleTrigger') {
      node.typeVersion = 1.2;
      fixes++;
    }
  }

  fs.writeFileSync(filepath, JSON.stringify(wf, null, 2) + '\n', 'utf8');
  console.log('  FIXED:', filename, '(' + fixes + ' fixes)');
}

console.log('Parcheando workflows...\n');
const files = fs.readdirSync(CLEAN_DIR).filter(f => f.endsWith('.json'));
for (const f of files) {
  fixWorkflow(f);
}
console.log('\nListo.');
