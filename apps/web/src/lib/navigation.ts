import {
  LayoutGrid,
  GitBranch,
  List,
  Plug,
  Braces,
  Layers,
  Settings,
  CircleHelp,
} from "lucide-react"

export type NavigationSection = "platform" | "build" | "manage"

export interface NavigationItem {
  id: string
  label: string
  href: string
  icon: any
  section: NavigationSection
  badge?: number
  shortcut?: string
}

export const navigationItems: NavigationItem[] = [
  {
    id: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutGrid,
    section: "platform",
  },
  {
    id: "workflows",
    label: "Workflows",
    href: "/workflows",
    icon: GitBranch,
    section: "platform",
  },
  {
    id: "executions",
    label: "Executions",
    href: "/executions",
    icon: List,
    section: "platform",
  },
  {
    id: "integrations",
    label: "Integrations",
    href: "/integrations",
    icon: Plug,
    section: "build",
  },
  {
    id: "variables",
    label: "Variables",
    href: "/variables",
    icon: Braces,
    section: "build",
  },
  {
    id: "templates",
    label: "Templates",
    href: "/templates",
    icon: Layers,
    section: "build",
  },
  {
    id: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
    section: "manage",
  },
  {
    id: "help",
    label: "Help",
    href: "/help",
    icon: CircleHelp,
    section: "manage",
  },
]