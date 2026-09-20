import { Component, createSignal, startTransition } from "solid-js"
import { Dialog } from "@opencode-ai/ui/dialog"
import { Tabs } from "@opencode-ai/ui/tabs"
import { Icon } from "@opencode-ai/ui/icon"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { SettingsGeneral } from "./settings-general"
import { SettingsKeybinds } from "./settings-keybinds"
import { SettingsProviders } from "./settings-providers"
import { SettingsModels } from "./settings-models"
import { SettingsServers } from "./settings-servers"

export const DialogSettings: Component<{ defaultValue?: string }> = (props) => {
  const language = useLanguage()
  const platform = usePlatform()
  const dialog = useDialog()
  const [tab, setTab] = createSignal(props.defaultValue ?? "general")

  const showProviders = () => {
    void dialog.show(() => <DialogSettings defaultValue="providers" />)
  }

  return (
    <Dialog size="x-large" transition>
      <Tabs
        orientation="vertical"
        variant="settings"
        value={tab()}
        onChange={(value) => void startTransition(() => setTab(value))}
        class="h-full settings-dialog"
      >
        <Tabs.List aria-label={language.t("sidebar.settings")}>
          <Tabs.SectionTitle>{language.t("settings.section.desktop")}</Tabs.SectionTitle>
          <Tabs.Trigger value="general">
            <Icon name="sliders" />
            {language.t("settings.tab.general")}
          </Tabs.Trigger>
          <Tabs.Trigger value="shortcuts">
            <Icon name="keyboard" />
            {language.t("settings.tab.shortcuts")}
          </Tabs.Trigger>
          <Tabs.Trigger value="servers">
            <Icon name="server" />
            {language.t("status.popover.tab.servers")}
          </Tabs.Trigger>
          <Tabs.SectionTitle>{language.t("settings.section.server")}</Tabs.SectionTitle>
          <Tabs.Trigger value="providers">
            <Icon name="providers" />
            {language.t("settings.providers.title")}
          </Tabs.Trigger>
          <Tabs.Trigger value="models">
            <Icon name="models" />
            {language.t("settings.models.title")}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="general" class="no-scrollbar">
          <SettingsGeneral />
        </Tabs.Content>
        <Tabs.Content value="shortcuts" class="no-scrollbar">
          <SettingsKeybinds />
        </Tabs.Content>
        <Tabs.Content value="servers" class="no-scrollbar">
          <SettingsServers />
        </Tabs.Content>
        <Tabs.Content value="providers" class="no-scrollbar">
          <SettingsProviders onBack={showProviders} />
        </Tabs.Content>
        <Tabs.Content value="models" class="no-scrollbar">
          <SettingsModels />
        </Tabs.Content>
        <div class="settings-dialog-footer text-12-medium text-text-weak">
          <span>{language.t("app.name.desktop")}</span>
          <span class="text-11-regular">v{platform.version}</span>
        </div>
      </Tabs>
    </Dialog>
  )
}
