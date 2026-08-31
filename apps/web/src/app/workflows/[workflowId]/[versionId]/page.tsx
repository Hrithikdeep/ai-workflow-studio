import WorkflowEditorPageClient from '@/components/editor/workflow-editor-page-client';

type PageProps = {
  params: Promise<{
    workflowId: string;
    versionId: string;
  }>;
};

export default async function WorkflowEditorPage({
  params,
}: PageProps) {
  const { workflowId, versionId } = await params;

  return (
    <WorkflowEditorPageClient
      workflowId={workflowId}
      versionId={versionId}
    />
  );
}