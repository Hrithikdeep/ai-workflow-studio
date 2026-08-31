import { TemplateDetail } from "@/components/templates/template-detail";

type TemplateDetailPageProps = {
  params: Promise<{
    templateId: string;
  }>;
};

export default async function TemplateDetailPage({
  params,
}: TemplateDetailPageProps) {
  const { templateId } = await params;

  return (
    <TemplateDetail templateId={templateId} />
  );
}