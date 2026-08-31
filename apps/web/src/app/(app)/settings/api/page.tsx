import { SettingsLayout } from "@/components/settings/settings-layout";
import { ApiDeveloperSettings } from "@/components/settings/api-developer-settings";

export default function ApiDeveloperSettingsPage() {
  return (
    <SettingsLayout>
      <ApiDeveloperSettings />
    </SettingsLayout>
  );
}