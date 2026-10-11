import { LayoutDashboard, Palette, Search } from 'lucide-react'
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
      ],
    },
  ],
}
