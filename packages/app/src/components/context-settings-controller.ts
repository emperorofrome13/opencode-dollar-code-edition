import { createEffect, onCleanup, type Accessor } from "solid-js"
import { createStore } from "solid-js/store"
import type { ConfigContextSettingsResponses } from "@opencode-ai/sdk/v2/client"

export type ContextSettingsStatus = ConfigContextSettingsResponses[200]
export type ContextSetting = "compactSkills" | "dcp" | "manualMode" | "automaticStrategies" | "rtk"
export type ContextSettingsSource = {
  directory: string | undefined
  protocol: Promise<"v1" | "v2">
  read: (directory: string) => Promise<ContextSettingsStatus>
  write: (directory: string, setting: ContextSetting, enabled: boolean) => Promise<ContextSettingsStatus>
}

export function createContextSettingsController(source: Accessor<ContextSettingsSource>) {
  const [state, setState] = createStore({
    data: undefined as ContextSettingsStatus | undefined,
    loading: false,
    saving: false,
    unsupported: false,
    error: undefined as "load" | "save" | undefined,
    detail: "",
    saved: false,
  })
  let generation = 0
  const detail = (error: unknown) => error instanceof Error ? error.message : String(error)
  const refresh = async () => {
    const current = source()
    const run = ++generation
    setState({ data: undefined, loading: !!current.directory, saving: false, unsupported: false, error: undefined, detail: "", saved: false })
    if (!current.directory) return
    await current.protocol.then(async (protocol) => {
      if (run !== generation) return
      if (protocol !== "v1") {
        setState({ unsupported: true })
        return
      }
      const data = await current.read(current.directory!)
      if (run === generation) setState({ data })
    }).catch((error: unknown) => {
      if (run === generation) setState({ error: "load", detail: detail(error) })
    }).finally(() => {
      if (run === generation) setState({ loading: false })
    })
  }
  createEffect(() => { void refresh() })
  onCleanup(() => { generation++ })

  return {
    state,
    refresh,
    set: async (setting: ContextSetting, enabled: boolean) => {
      const current = source()
      if (!current.directory || !state.data || state.loading || state.saving || state.unsupported) return
      if (setting !== "compactSkills" && setting !== "rtk" && !state.data.registered) return
      const run = generation
      setState({ saving: true, error: undefined, detail: "" })
      await current.write(current.directory, setting, enabled).then((data) => {
        if (run === generation) setState({ data, saved: true })
      }).catch((error: unknown) => {
        if (run === generation) setState({ error: "save", detail: detail(error) })
      }).finally(() => {
        if (run === generation) setState({ saving: false })
      })
    },
  }
}
