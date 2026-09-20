import { createMemo, For, Show, type Component, type JSX } from "solid-js"
import { useParams } from "@solidjs/router"
import { Button } from "@opencode-ai/ui/button"
import { Switch } from "@opencode-ai/ui/switch"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useServer } from "@/context/server"
import { useServerSDK } from "@/context/server-sdk"
import { useServerSync } from "@/context/server-sync"
import { decode64 } from "@/utils/base64"
import { createContextSettingsController } from "./context-settings-controller"

export const SettingsContext: Component<{
  row: Component<{ title: string | JSX.Element; description: string | JSX.Element; children: JSX.Element }>
  sessionID?: string
}> = (props) => {
  const language = useLanguage()
  const sdk = useServerSDK()
  const sync = useServerSync()
  const params = useParams()
  const layout = useLayout()
  const connection = useServer()
  const directory = createMemo(() => {
    if (props.sessionID) return sync().session.lineage.peek(props.sessionID)?.session.directory
    const route = decode64(params.dir)
    if (route) return route
    // No project open: fall back to the home-page project picker, then the
    // first open project, so the toggles work at any time. The panel always
    // shows which directory they apply to.
    const selection = layout.home.selection()
    if (selection.directory && selection.server === connection.key) return selection.directory
    return layout.projects.list()[0]?.worktree
  })
  const controller = createContextSettingsController(createMemo(() => {
    const server = sdk()
    return {
      directory: directory(),
      protocol: server.protocol,
      read: async (directory: string) => {
        const result = await server.client.config.contextSettings({ directory }, { throwOnError: true })
        if (!result.data) throw new Error(language.t("settings.context.emptyResponse"))
        return result.data
      },
      write: async (directory, setting, enabled) => {
        const result = await server.client.config.updateContextSettings({ directory, setting, enabled }, { throwOnError: true })
        if (!result.data) throw new Error(language.t("settings.context.emptyResponse"))
        return result.data
      },
    }
  }))
  const disabled = () => !controller.state.data || controller.state.loading || controller.state.saving || controller.state.unsupported
  const rows = ["compactSkills", "dcp", "manualMode", "automaticStrategies", "rtk"] as const
  const checked = (setting: typeof rows[number]) => {
    const data = controller.state.data
    if (!data) return false
    if (setting === "compactSkills") return data.compactSkillsOverride ?? data.compactSkills
    return data[setting]
  }
  return (
    <section class="flex flex-col gap-2" data-component="settings-context">
      <h3 class="text-16-medium text-text-strong">{language.t("settings.context.title")}</h3>
      <p class="text-14-regular text-text-weak">{language.t("settings.context.restart")}</p>
      <Show when={!directory()}><p role="status">{language.t("settings.context.noProject")}</p></Show>
      <Show when={controller.state.unsupported}><p role="status">{language.t("settings.context.unsupported")}</p></Show>
      <Show when={controller.state.loading}><p role="status">{language.t("settings.context.loading")}</p></Show>
      <Show when={controller.state.data}>{(data) => (
        <div class="text-14-regular text-text-weak break-all">
          <p>{language.t("settings.context.project", { directory: data().directory })}</p>
          <p>{language.t("settings.context.files", { config: data().configFile, dcp: data().dcpFile })}</p>
          <p>{language.t(data().compactSkills ? "settings.context.compactActive" : "settings.context.compactInactive")}</p>
          <p>{language.t(data().registered ? "settings.context.dcpConfigured" : "settings.context.dcpMissing")}</p>
          <p>{language.t(data().rtk ? "settings.context.rtkConfigured" : "settings.context.rtkMissing")}</p>
        </div>
      )}</Show>
      <div class="bg-surface-base px-4 rounded-lg">
        <For each={rows}>{(setting) => (
          <props.row title={language.t(`settings.context.${setting}.title`)} description={language.t(`settings.context.${setting}.description`)}>
            <div data-action={`settings-context-${setting}`}>
              <Switch
                aria-label={language.t(`settings.context.${setting}.title`)}
                checked={checked(setting)}
                disabled={disabled() || (setting !== "compactSkills" && setting !== "rtk" && !controller.state.data?.registered) ||
                  ((setting === "manualMode" || setting === "automaticStrategies") && !controller.state.data?.dcp) ||
                  (setting === "automaticStrategies" && !controller.state.data?.manualMode)}
                onChange={(enabled) => void controller.set(setting, enabled)}
              />
            </div>
          </props.row>
        )}</For>
      </div>
      <Show when={controller.state.saving}><p role="status">{language.t("settings.context.saving")}</p></Show>
      <Show when={controller.state.saved}><p role="status">{language.t("settings.context.saved")}</p></Show>
      <Show when={controller.state.error}>
        <p role="alert">{language.t(controller.state.error === "save" ? "settings.context.saveError" : "settings.context.loadError", { detail: controller.state.detail })}</p>
      </Show>
      <Show when={directory() && !controller.state.unsupported}>
        <Button size="small" variant="ghost" disabled={controller.state.loading || controller.state.saving} onClick={() => void controller.refresh()}>
          {language.t("settings.context.refresh")}
        </Button>
      </Show>
    </section>
  )
}
