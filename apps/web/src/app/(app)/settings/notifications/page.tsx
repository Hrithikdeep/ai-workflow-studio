import { SettingsLayout } from "@/components/settings/settings-layout";
import { NotificationsSettings } from "@/components/settings/notifications-settings";

export default function NotificationsSettingsPage() {
  return (
    <SettingsLayout>
      <NotificationsSettings />
    </SettingsLayout>
  );
}