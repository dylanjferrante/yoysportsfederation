// An owner's invite link: claim the club with Google, Apple, or an email and password
import { openInvite } from '@/lib/invites'
import { oauthProviders } from '@/lib/auth'
import { YSF_LEAGUE_ID, YSF_ART } from '@/lib/ysf'
import InviteClient from './InviteClient'

export const metadata = { title: 'yoy Sports Federation · Claim your club' }

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const inv = openInvite(token)
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-[420px] flex flex-col items-center gap-6">
        <span className="inline-flex items-center justify-center h-20"><img src={YSF_ART.primaryOnWhite} alt="yoy Sports Federation" className="h-20 object-contain" /></span>
        {inv ? (
          <>
            {inv.logo && <span className="w-24 h-24 inline-flex items-center justify-center"><img src={inv.logo} alt="" className="w-24 h-24 object-contain" /></span>}
            <h1 className="disp text-[34px] font-extrabold leading-none text-center">{inv.team_name.toUpperCase()}</h1>
            <InviteClient token={token} providers={oauthProviders} home={`/leagues/${YSF_LEAGUE_ID}/myteam`} />
          </>
        ) : (
          <div className="card p-6 text-center font-semibold text-ink-600">This invite link has expired or was already used. Ask the Commission for a new one.</div>
        )}
      </div>
    </div>
  )
}
