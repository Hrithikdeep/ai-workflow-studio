import { Suspense } from "react";

import { IntegrationDetail } from "@/components/integrations/integration-detail";

type IntegrationDetailPageProps = {
  params: Promise<{
    integrationId: string;
  }>;
};

export default async function IntegrationDetailPage({
  params,
}: IntegrationDetailPageProps) {
  const { integrationId } = await params;

  // `integrationId` may be a real Integration UUID or a legacy provider
  // slug (`slack`, `http`, …). The backend `GET /integrations/:id`
  // resolves both; the client component fetches and handles not-found.
  return (
    <Suspense fallback={null}>
      <IntegrationDetail integrationId={integrationId} />
    </Suspense>
  );
}
