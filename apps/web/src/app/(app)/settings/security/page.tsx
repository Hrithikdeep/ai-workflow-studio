import { SettingsLayout } from "@/components/settings/settings-layout";
import { SecuritySettings } from "@/components/settings/security-settings";

export default function SecuritySettingsPage() {
  return (
    <SettingsLayout>
      <SecuritySettings />
    </SettingsLayout>
  );
}