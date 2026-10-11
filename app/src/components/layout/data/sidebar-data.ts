import { LayoutDashboard, Palette } from 'lucide-react'
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
