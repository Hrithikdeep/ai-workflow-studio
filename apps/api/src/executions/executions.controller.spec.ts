import { ExecutionsController } from './executions.controller';
import { ExecutionsService } from './executions.service';

describe('ExecutionsController', () => {
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    runWorkflow: jest.fn(),
    remove: jest.fn(),
  } as unknown as ExecutionsService;

  const controller = new ExecutionsController(service);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists executions with filtering and pagination', async () => {
    const result = [{ id: 'exec-1' }];
    (service.findAll as jest.Mock).mockResolvedValue(result);

    await expect(
      controller.findAll('SUCCEEDED', 'workflow-1', 'version-1', 10, 25),
    ).resolves.toBe(result);

    expect(service.findAll).toHaveBeenCalledWith({
      status: 'SUCCEEDED',
      workflowId: 'workflow-1',
      workflowVersionId: 'version-1',
      skip: 10,
      take: 25,
    });
  });

  it('runs a workflow execution with the configured trigger payload', async () => {
    const result = { id: 'exec-2', status: 'RUNNING' };
    (service.runWorkflow as jest.Mock).mockResolvedValue(result);

    await expect(
      controller.run(
        {
          workflowId: 'workflow-1',
          workflowVersionId: 'version-1',
          triggerType: 'WEBHOOK',
          input: { source: 'webhook' },
        },
        'workspace-1',
      ),
    ).resolves.toBe(result);

    expect(service.runWorkflow).toHaveBeenCalledWith(
      'workflow-1',
      'version-1',
      { source: 'webhook' },
      'WEBHOOK',
      {},
      'workspace-1',
    );
  });

  it('returns a single execution detail by id', async () => {
    const result = { id: 'exec-3', status: 'SUCCEEDED' };
    (service.findOne as jest.Mock).mockResolvedValue(result);

    await expect(controller.findOne('exec-3')).resolves.toBe(result);
    expect(service.findOne).toHaveBeenCalledWith('exec-3');
  });

  it('deletes an execution by id', async () => {
    const result = { id: 'exec-4', deleted: true };
    (service.remove as jest.Mock).mockResolvedValue(result);

    await expect(controller.remove('exec-4')).resolves.toBe(result);
    expect(service.remove).toHaveBeenCalledWith('exec-4');
  });
});
