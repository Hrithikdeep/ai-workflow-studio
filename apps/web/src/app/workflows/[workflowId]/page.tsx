import WorkflowEditorPageClient from '@/components/editor/workflow-editor-page-client';

type PageProps = {
  params: Promise<{
    workflowId: string;
  }>;
};

export default async function WorkflowByIdPage({
  params,
}: PageProps) {
  const { workflowId } = await params;

  return (
    <WorkflowEditorPageClient workflowId={workflowId} />
  );
}
