import { House, Users, Lightbulb, Sparkles, ListChecks, Radar, Store, Settings, CircleHelp } from 'lucide-react'

// The one list of places in the app (#220). Nav draws it as a bottom bar on a
// phone and a top bar on a laptop; nothing else may keep its own list of pages.
export const PRIMARY_LINKS = [
  { to: '/', label: 'Home', Icon: House },
  { to: '/gallery', label: 'Artists', Icon: Users },
  { to: '/brief', label: 'Ideas', Icon: Lightbulb },
  { to: '/concepts', label: 'AI', Icon: Sparkles },
]

export const MORE_GROUPS = [
  {
    label: 'Plan',
    links: [
      { to: '/pipeline', label: 'Pipeline', Icon: ListChecks, description: 'Your shortlist and what to do next' },
      { to: '/conventions', label: 'Radar', Icon: Radar, description: 'Conventions near you' },
      { to: '/studios', label: 'Studios', Icon: Store, description: 'Where your artists work' },
    ],
  },
  {
    label: 'App',
    links: [
      { to: '/settings', label: 'Settings', Icon: Settings, description: 'Backup, account and appearance' },
      { to: '/help', label: 'Help', Icon: CircleHelp, description: 'How to use Sable' },
    ],
  },
]
