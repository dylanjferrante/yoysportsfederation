import { sportColor } from '@/lib/utils'
import SportBadge from './SportBadge'

type Player = {
  id: string
  name: string
  sport: string
  position: string
  realTeam: string
  status: string
  points: number
  projected: number
}

export default function PlayerCard({ player, compact = false }: { player: Player; compact?: boolean }) {
  const colors = sportColor(player.sport)

  if (compact) {
    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${colors.bg} text-white flex items-center justify-center text-xs font-bold`}>
            {player.position.slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-sm text-gray-900">{player.name}</p>
            <p className="text-xs text-gray-500">{player.realTeam} · {player.position}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{player.points.toFixed(1)}</p>
          <p className="text-xs text-gray-400">pts</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl ${colors.bg} text-white flex items-center justify-center text-sm font-bold`}>
            {player.position.slice(0, 2)}
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{player.name}</h3>
            <p className="text-sm text-gray-500">{player.realTeam} · {player.position}</p>
          </div>
        </div>
        <SportBadge sport={player.sport} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Season Pts</p>
          <p className="text-xl font-bold text-gray-900">{player.points.toFixed(1)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Projected</p>
          <p className="text-xl font-bold text-gray-500">{player.projected.toFixed(1)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            player.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
            player.status === 'INJURED' ? 'bg-red-100 text-red-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {player.status === 'ACTIVE' ? 'Active' : player.status === 'INJURED' ? 'Injured' : 'Out'}
          </span>
        </div>
      </div>
    </div>
  )
}
