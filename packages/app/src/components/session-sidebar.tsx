import { createResource, createSignal } from "solid-js"
import { TitlebarTabStrip } from "@/components/titlebar-tab-strip"
import { useGlobal } from "@/context/global"
import { useLanguage } from "@/context/language"
import { useLayout, type LayoutRoute } from "@/context/layout"
import { ServerConnection, useServer } from "@/context/server"
import { tabKey, useTabs } from "@/context/tabs"
import { normalizeSessionInfo } from "@/utils/session"

/**
 * Vertical sessions sidebar for the new (V2) layout.
 * Replaces the horizontal top tab strip: same tabs store, rendered as a
 * full-height column on the left side of the window.
 */
export function SessionSidebar() {
  const layout = useLayout()
  const global = useGlobal()
  const language = useLanguage()
  const server = useServer()
  const tabs = useTabs()
  const tabsStore = tabs.store
  const tabsStoreActions = tabs

  // Same route -> tab matching as the titlebar (display only; the titlebar
  // keeps owning tab bookkeeping so tabs are not double-registered).
  const [session] = createResource(
    () => {
      const route = layout.route()
      if (route.type !== "session") return undefined
      const conn = global.servers.list().find((item) => ServerConnection.key(item) === (route.server ?? server.key))
      return conn ? { route, sdk: global.ensureServerCtx(conn).sdk } : undefined
    },
    ({ route, sdk }) => sdk.api.session.get({ sessionID: route.sessionId }).then(normalizeSessionInfo).catch(() => {}),
  )

  const matchRoute = (route: LayoutRoute) => {
    if (route.type === "home") return
    if (route.type === "draft") {
      return tabsStore.find((item) => item.type === "draft" && item.draftID === route.draftID)
    }
    if (route.type === "session") {
      const main = tabsStore.find(
        (item) => item.type === "session" && item.server === route.server && item.sessionId === route.sessionId,
      )
      if (main) return main
      const s = session()
      if (s?.parentID) {
        const parentID = s.parentID
        const parent = tabsStore.find(
          (item) => item.type === "session" && item.server === route.server && item.sessionId === parentID,
        )
        if (parent) return parent
      }
    }
  }

  const currentTab = () => matchRoute(layout.route())
  const [tabsAreOverflowing, setTabsAreOverflowing] = createSignal(false)

  return (
    <aside
      data-slot="session-sidebar"
      class="hidden md:flex w-60 shrink-0 min-h-0 flex-col bg-v2-background-bg-deep border-r border-v2-border-border-muted"
    >
      <div class="shrink-0 px-3 pt-3 pb-2">
        <span class="text-14-medium text-text-strong">{language.t("session.tabs.title")}</span>
      </div>
      <div class="flex-1 min-h-0 flex flex-col px-2 pb-2">
        <TitlebarTabStrip
          orientation="vertical"
          tabs={tabsStore}
          currentTab={currentTab}
          forceTruncate={tabsAreOverflowing()}
          onOverflowChange={setTabsAreOverflowing}
          onNavigate={(tab, el) => {
            tabs.select(tab)
            el?.scrollIntoView({ behavior: "instant", block: "nearest" })
          }}
          onClose={(tab) => {
            const index = tabsStore.findIndex((item) => tabKey(item) === tabKey(tab))
            if (index !== -1) tabsStoreActions.closeTab(index)
          }}
          onReorder={(keys) => tabsStoreActions.reorder(keys)}
        />
      </div>
    </aside>
  )
}
