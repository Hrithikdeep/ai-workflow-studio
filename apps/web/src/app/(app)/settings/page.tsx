import { SettingsLayout } from "@/components/settings/settings-layout";
import { GeneralSettings } from "@/components/settings/general-settings";

export default function SettingsPage() {
  return (
    <SettingsLayout>
      <GeneralSettings />
    </SettingsLayout>
  );
}