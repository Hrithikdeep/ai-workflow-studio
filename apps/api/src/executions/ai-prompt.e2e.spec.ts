import { randomBytes } from 'node:crypto';

// A valid encryption key must exist before CryptoService is first used.
process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');

// Step 8: keep retry backoff instant so the retry e2e stays fast.
process.env.AI_EXECUTOR_RETRY_BASE_MS = '0';

import { ExecutionStatus, ExecutionStepStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CryptoService } from '../crypto/crypto.service';
import { IntegrationCredentialsService } from '../integrations/integration-credentials.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { WorkflowsService } from '../workflows/workflows.service';
import { AiService } from '../ai/ai.service';
import { OpenAiAdapter } from '../ai/adapters/openai.adapter';
import { AiNodeExecutor } from './executors/ai.executor';
import { ExecutionsService } from './executions.service';

/**
 * End-to-end: MANUAL_TRIGGER -> AI_PROMPT -> OUTPUT, run through the real
 * execution engine, real graph-persistence path, real Integration +
 * encrypted-credential + AiService + OpenAiAdapter — with ONLY the OpenAI
 * HTTP boundary (`fetch`) mocked. No real API key.
 */
describe('AI_PROMPT workflow (E2E, DB-backed, OpenAI HTTP mocked)', () => {
  jest.setTimeout(30000);

  const prisma = new PrismaService();
  const crypto = new CryptoService();
  const credentials = new IntegrationCredentialsService(prisma, crypto);
  const integrations = new IntegrationsService(
    prisma,
    credentials,
    {} as never,
  );
  const workflows = new WorkflowsService(prisma);
  const aiExecutor = new AiNodeExecutor(
    integrations,
    credentials,
    new AiService(new OpenAiAdapter()),
  );
  const executions = new ExecutionsService(
    prisma as never,
    undefined,
    undefined,
    undefined,
    undefined,
    aiExecutor,
  );

  const FAKE_KEY = 'sk-test-not-real';
  const AI_ANSWER = 'Hello, friend.';

  let workspaceId = '';
  let workflowId = '';
  const extraWorkflowIds: string[] = [];
  let integrationId = '';
  let fetchSpy: jest.SpyInstance;

  const okResponse = (answer: string) =>
    ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'gpt-4.1-mini-2025-04-14',
          choices: [
            {
              message: { role: 'assistant', content: answer },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
        }),
    }) as unknown as Response;

  const rateLimited = () =>
    ({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({ error: { message: 'slow down', type: 'rate_limit' } }),
    }) as unknown as Response;

  /** Build MANUAL_TRIGGER -> AI_PROMPT -> OUTPUT and return the version id. */
  async function makeGraph(name: string): Promise<{ versionId: string }> {
    const wf = await workflows.create({ name });
    extraWorkflowIds.push(wf.id);
    const version = await workflows.getLatestDraftVersion(wf.id);
    const uid = randomBytes(6).toString('hex');
    await workflows.saveGraph(version.id, {
      nodes: [
        { id: `t-${uid}`, type: 'MANUAL_TRIGGER', label: 'Start', positionX: 0, positionY: 0, config: {} },
        {
          id: `a-${uid}`,
          type: 'AI_PROMPT',
          label: 'Ask',
          positionX: 200,
          positionY: 0,
          config: { integrationId, model: 'gpt-4.1-mini', prompt: 'Say hi.' },
        },
        {
          id: `o-${uid}`,
          type: 'OUTPUT',
          label: 'Return',
          positionX: 400,
          positionY: 0,
          config: { value: '{{ previous.output.text }}' },
        },
      ],
      edges: [
        { id: `e1-${uid}`, source: `t-${uid}`, target: `a-${uid}` },
        { id: `e2-${uid}`, source: `a-${uid}`, target: `o-${uid}` },
      ],
    } as never);
    return { versionId: version.id };
  }

  beforeAll(async () => {
    await prisma.$connect();
    const ws = await prisma.workspace.create({
      data: {
        name: 'AI e2e',
        slug: `ai-e2e-${Date.now()}-${randomBytes(3).toString('hex')}`,
      },
    });
    workspaceId = ws.id;

    const created = await integrations.create(workspaceId, {
      provider: 'openai',
      name: 'E2E OpenAI',
      config: { apiKey: FAKE_KEY },
    });
    integrationId = created.id;
  });

  afterAll(async () => {
    const ids = [workflowId, ...extraWorkflowIds].filter(Boolean);
    if (ids.length > 0) {
      await prisma.workflow.deleteMany({ where: { id: { in: ids } } });
    }
    if (workspaceId) {
      await prisma.integrationCredential.deleteMany({ where: { workspaceId } });
      await prisma.integration.deleteMany({ where: { workspaceId } });
      await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    }
    await prisma.$disconnect();
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('accepts the AI_PROMPT graph, runs it, persists safe output, and chains {{ previous.output.text }}', async () => {
    // ---- real graph-persistence path accepts AI_PROMPT --------------------
    const wf = await workflows.create({ name: 'ai-e2e-wf' });
    workflowId = wf.id;
    const version = await workflows.getLatestDraftVersion(workflowId);

    const uid = randomBytes(6).toString('hex');
    const nTrigger = `n-trigger-${uid}`;
    const nAi = `n-ai-${uid}`;
    const nOutput = `n-output-${uid}`;

    await workflows.saveGraph(version.id, {
      nodes: [
        {
          id: nTrigger,
          type: 'MANUAL_TRIGGER',
          label: 'Start',
          positionX: 0,
          positionY: 0,
          config: {},
        },
        {
          id: nAi,
          type: 'AI_PROMPT',
          label: 'Ask the model',
          positionX: 200,
          positionY: 0,
          config: {
            integrationId,
            model: 'gpt-4.1-mini',
            prompt: 'Say hello in one short sentence.',
          },
        },
        {
          id: nOutput,
          type: 'OUTPUT',
          label: 'Return',
          positionX: 400,
          positionY: 0,
          config: { value: '{{ previous.output.text }}' },
        },
      ],
      edges: [
        { id: `e1-${uid}`, source: nTrigger, target: nAi },
        { id: `e2-${uid}`, source: nAi, target: nOutput },
      ],
    } as never);

    // ---- mock ONLY the OpenAI HTTP boundary ------------------------------
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'gpt-4.1-mini-2025-04-14',
          choices: [
            { message: { role: 'assistant', content: AI_ANSWER }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 },
        }),
    } as unknown as Response);

    // ---- run through the real engine ------------------------------------
    const result = await executions.runWorkflow(
      workflowId,
      version.id,
      {},
      'MANUAL',
      {},
      workspaceId,
    );

    // 8. final status
    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);

    // 3/4/5. AI executor was reached; AiService -> adapter -> mocked fetch
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${FAKE_KEY}`,
    );

    const steps = result.steps;
    const aiStep = steps.find((s: any) => s.node?.type === 'AI_PROMPT');
    const outStep = steps.find((s: any) => s.node?.type === 'OUTPUT');

    // 3/6. AI output persisted to ExecutionStep.output, normalized + redacted
    expect(aiStep?.status).toBe(ExecutionStepStatus.SUCCEEDED);
    const aiOut = aiStep!.output as any;
    expect(aiOut).toMatchObject({
      nodeType: 'AI_PROMPT',
      status: 'SUCCEEDED',
      text: AI_ANSWER,
      model: 'gpt-4.1-mini-2025-04-14',
      usage: { inputTokens: 9, outputTokens: 4 },
      finishReason: 'stop',
      attempts: 1,
      config: { integrationId, model: 'gpt-4.1-mini' },
    });

    // 7. OUTPUT resolved {{ previous.output.text }}
    expect(outStep?.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect((outStep!.output as any).config.value).toBe(AI_ANSWER);

    // 9/10. no credential / Authorization anywhere in the returned execution
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(FAKE_KEY);
    expect(serialized).not.toContain('sk-test');
    expect(serialized).not.toContain('Bearer ');
    expect(serialized.toLowerCase()).not.toContain('authorization');
    expect(serialized).not.toContain('"apiKey"');

    // …and the same for the independently re-read persisted rows
    const persisted = await executions.findOne(result.id);
    const persistedSerialized = JSON.stringify(persisted);
    expect(persistedSerialized).not.toContain(FAKE_KEY);
    expect(persistedSerialized).not.toContain('Bearer ');
    expect(persistedSerialized.toLowerCase()).not.toContain('authorization');
    expect(persistedSerialized).not.toContain('"apiKey"');

    // credential is still only in the encrypted IntegrationCredential row
    const credRow = await prisma.integrationCredential.findFirst({
      where: { workspaceId, integrationId },
    });
    expect(credRow?.data).toMatch(/^v1:/);
    expect(credRow?.data).not.toContain(FAKE_KEY);
  });

  // -------------------------------------------------------------------------
  // STEP 8 — retry: first OpenAI attempt 429, second attempt succeeds
  // -------------------------------------------------------------------------
  it('retries a 429 and succeeds; usage persisted; OUTPUT still resolves', async () => {
    const { versionId } = await makeGraph('ai-e2e-retry-ok');

    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(rateLimited())
      .mockResolvedValueOnce(okResponse('Hi there.'));

    const result = await executions.runWorkflow(
      extraWorkflowIds[extraWorkflowIds.length - 1],
      versionId,
      {},
      'MANUAL',
      {},
      workspaceId,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2); // initial 429 + successful retry
    expect(result.status).toBe(ExecutionStatus.SUCCEEDED);

    const aiStep = result.steps.find((s: any) => s.node?.type === 'AI_PROMPT');
    const outStep = result.steps.find((s: any) => s.node?.type === 'OUTPUT');
    expect(aiStep?.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect((aiStep!.output as any)).toMatchObject({
      status: 'SUCCEEDED',
      text: 'Hi there.',
      usage: { inputTokens: 9, outputTokens: 4 },
      attempts: 2,
    });
    expect(outStep?.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect((outStep!.output as any).config.value).toBe('Hi there.');

    // persisted rows carry no secret
    const persisted = await executions.findOne(result.id);
    const s = JSON.stringify(persisted);
    expect(s).not.toContain(FAKE_KEY);
    expect(s).not.toContain('Bearer ');
    expect(s.toLowerCase()).not.toContain('authorization');
    expect(s).not.toContain('"apiKey"');
  });

  // -------------------------------------------------------------------------
  // STEP 8 — retry exhausted: every attempt 429 → FAILED execution
  // -------------------------------------------------------------------------
  it('exhausts retries on persistent 429 → AI_PROMPT FAILED, OUTPUT SKIPPED, Execution FAILED', async () => {
    const { versionId } = await makeGraph('ai-e2e-retry-exhausted');

    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(rateLimited());

    const result = await executions.runWorkflow(
      extraWorkflowIds[extraWorkflowIds.length - 1],
      versionId,
      {},
      'MANUAL',
      {},
      workspaceId,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(result.status).toBe(ExecutionStatus.FAILED);

    const aiStep = result.steps.find((s: any) => s.node?.type === 'AI_PROMPT');
    const outStep = result.steps.find((s: any) => s.node?.type === 'OUTPUT');
    expect(aiStep?.status).toBe(ExecutionStepStatus.FAILED);
    expect((aiStep!.output as any).code).toBe('AI_RATE_LIMITED');
    expect((aiStep!.output as any).attempts).toBe(3);
    expect(aiStep?.error).toBe(
      'The AI provider rate limited the request. Try again shortly.',
    );
    expect(outStep?.status).toBe(ExecutionStepStatus.SKIPPED);

    const s = JSON.stringify(await executions.findOne(result.id));
    expect(s).not.toContain(FAKE_KEY);
    expect(s).not.toContain('Bearer ');
    expect(s.toLowerCase()).not.toContain('authorization');
    expect(s).not.toContain('"apiKey"');
    expect(s).not.toContain('slow down'); // raw provider body never persisted
  });
});
