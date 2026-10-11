// D-08: poll every 5 s, back off to 30 s after an error. Callers leave
// refetchIntervalInBackground at its default (false) so a hidden tab stops polling.
export const pollInterval = (q: { state: { status: string } }) =>
  q.state.status === 'error' ? 30_000 : 5_000
