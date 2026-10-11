import { LayoutDashboard, Palette, Plug, Search, Send } from 'lucide-react'
import { type SidebarData } from '../types'

export const sidebarData: SidebarData = {
  navGroups: [
    {
      title: 'Work',
      items: [
        {
          title: 'Dashboard',
          url: '/admin',
          icon: LayoutDashboard,
        },
        {
          title: 'Find a client',
          url: '/admin/lookup',
          icon: Search,
        },
        {
          title: 'Requests',
          url: '/admin/requests',
          icon: Send,
        },
      ],
    },
    {
      title: 'Account',
      items: [
        {
          title: 'Appearance',
          url: '/admin/settings/appearance',
          icon: Palette,
        },
        {
          title: 'Integrations',
          url: '/admin/settings/integrations',
          icon: Plug,
        },
      ],
    },
  ],
}
