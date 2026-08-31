/**
 * Idempotent seed for the Templates feature.
 *
 * A template must point at a REAL saved workflow, so this creates a small
 * set of real starter workflows (Workflow + WorkflowVersion v1 + Node/Edge
 * rows using the real NodeType enum) and a matching WorkflowTemplate row
 * for each, per workspace.
 *
 * Runs only for workspaces that have at least one membership (i.e. a real
 * user) and currently have zero templates. Safe to run repeatedly.
 *
 *   pnpm --filter api exec ts-node prisma/seed-templates.ts
 */
import { PrismaClient, type NodeType, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type SeedNode = {
  key: string;
  type: NodeType;
  label: string;
  config?: Prisma.InputJsonValue;
};

type SeedTemplate = {
  name: string;
  description: string;
  category: string;
  featured: boolean;
  nodes: SeedNode[];
  /** ordered [from, to] pairs referencing node keys */
  edges: Array<[string, string]>;
};

const TEMPLATES: SeedTemplate[] = [
  {
    name: 'Webhook to Slack Alert',
    description:
      'Receive an inbound webhook event and post a formatted alert to a Slack channel.',
    category: 'Operations',
    featured: true,
    nodes: [
      { key: 't', type: 'WEBHOOK', label: 'Incoming Event' },
      { key: 's', type: 'SLACK', label: 'Post to Slack', config: { channel: '', message: '{{ input }}' } },
      { key: 'o', type: 'OUTPUT', label: 'Done' },
    ],
    edges: [
      ['t', 's'],
      ['s', 'o'],
    ],
  },
  {
    name: 'Scheduled Site Health Check',
    description:
      'Call an endpoint, check the response, and notify Slack when the check does not pass.',
    category: 'Operations',
    featured: false,
    nodes: [
      { key: 't', type: 'MANUAL_TRIGGER', label: 'Start' },
      { key: 'h', type: 'HTTP_REQUEST', label: 'Health Request', config: { method: 'GET', url: 'https://example.com/health' } },
      { key: 'c', type: 'CONDITION', label: 'Is Healthy?', config: { leftValue: '{{ previous.output.http.status }}', operator: 'equals', rightValue: '200' } },
      { key: 's', type: 'SLACK', label: 'Alert Slack', config: { channel: '', message: 'Health check failed' } },
      { key: 'o', type: 'OUTPUT', label: 'Result' },
    ],
    edges: [
      ['t', 'h'],
      ['h', 'c'],
      ['c', 's'],
      ['s', 'o'],
    ],
  },
  {
    name: 'AI Text Classifier',
    description:
      'Send text to an AI prompt, normalize the response to structured JSON, and return the result.',
    category: 'AI',
    featured: true,
    nodes: [
      { key: 't', type: 'MANUAL_TRIGGER', label: 'Start' },
      { key: 'a', type: 'AI_PROMPT', label: 'Classify', config: { prompt: 'Classify the following text: {{ input.text }}' } },
      { key: 'j', type: 'JSON_TRANSFORM', label: 'Shape Result', config: { expression: '{ "label": "{{ previous.output }}" }' } },
      { key: 'o', type: 'OUTPUT', label: 'Result' },
    ],
    edges: [
      ['t', 'a'],
      ['a', 'j'],
      ['j', 'o'],
    ],
  },
  {
    name: 'Lead Capture to Database',
    description:
      'Accept a lead via webhook, enrich it with an external API, store it in PostgreSQL, and send a confirmation email.',
    category: 'Data',
    featured: false,
    nodes: [
      { key: 't', type: 'WEBHOOK', label: 'New Lead' },
      { key: 'h', type: 'HTTP_REQUEST', label: 'Enrich Lead', config: { method: 'GET', url: 'https://example.com/enrich' } },
      { key: 'p', type: 'POSTGRES', label: 'Insert Lead', config: { integrationId: '', operation: 'insert', query: 'INSERT INTO leads (email) VALUES ($1)', params: ['{{ input.email }}'] } },
      { key: 'g', type: 'GMAIL', label: 'Send Confirmation', config: { integrationId: '', to: '{{ input.email }}', subject: 'Thanks for reaching out', body: 'We received your details.' } },
      { key: 'o', type: 'OUTPUT', label: 'Done' },
    ],
    edges: [
      ['t', 'h'],
      ['h', 'p'],
      ['p', 'g'],
      ['g', 'o'],
    ],
  },
];

async function seedWorkspace(workspaceId: string) {
  const existing = await prisma.workflowTemplate.count({ where: { workspaceId } });
  if (existing > 0) {
    return { workspaceId, created: 0, skipped: true };
  }

  let created = 0;
  for (const [tplIndex, tpl] of TEMPLATES.entries()) {
    await prisma.$transaction(async (tx) => {
      const workflow = await tx.workflow.create({
        data: {
          name: tpl.name,
          description: tpl.description,
          status: 'DRAFT',
        },
      });
      const version = await tx.workflowVersion.create({
        data: { workflowId: workflow.id, version: 1, isPublished: false },
      });

      const idByKey = new Map<string, string>();
      for (const [i, n] of tpl.nodes.entries()) {
        const node = await tx.node.create({
          data: {
            workflowVersionId: version.id,
            type: n.type,
            label: n.label,
            positionX: 120 + i * 220,
            positionY: 160 + tplIndex * 20,
            config: (n.config ?? {}) as Prisma.InputJsonValue,
          },
        });
        idByKey.set(n.key, node.id);
      }
      for (const [from, to] of tpl.edges) {
        await tx.edge.create({
          data: {
            workflowVersionId: version.id,
            sourceNodeId: idByKey.get(from)!,
            targetNodeId: idByKey.get(to)!,
          },
        });
      }

      await tx.workflowTemplate.create({
        data: {
          workspaceId,
          workflowId: workflow.id,
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          featured: tpl.featured,
        },
      });
    });
    created += 1;
  }
  return { workspaceId, created, skipped: false };
}

async function main() {
  const workspaces = await prisma.workspace.findMany({
    where: { memberships: { some: {} } },
    select: { id: true, name: true },
  });

  for (const ws of workspaces) {
    const result = await seedWorkspace(ws.id);
    console.log(
      `${ws.name} (${ws.id}): ${
        result.skipped ? 'skipped (already has templates)' : `${result.created} templates`
      }`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
