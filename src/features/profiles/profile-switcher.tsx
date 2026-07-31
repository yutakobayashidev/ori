import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { loadProfiles, selectProfile } from './server-functions'

export function ProfileSwitcher() {
  const queryClient = useQueryClient()
  const load = useServerFn(loadProfiles)
  const select = useServerFn(selectProfile)
  const profiles = useQuery({
    queryKey: ['profiles'],
    queryFn: () => load(),
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })
  const selection = useMutation({
    mutationFn: (profileName: string | null) =>
      select({ data: { profileName } }),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  const state = profiles.isError
    ? 'error'
    : selection.isError
      ? 'error'
      : selection.isSuccess
        ? 'success'
        : profiles.isPending || selection.isPending
          ? 'loading'
          : 'default'

  return (
    <div className="profile-switcher" data-state={state}>
      <label htmlFor="relay-profile">プロファイル</label>
      <select
        aria-invalid={state === 'error' ? 'true' : undefined}
        disabled={profiles.isPending || profiles.isError || selection.isPending}
        id="relay-profile"
        onChange={(event) =>
          selection.mutate(
            event.target.value.length ? event.target.value : null,
          )
        }
        value={profiles.data?.selectedProfile ?? ''}
      >
        <option value="">
          {profiles.isPending
            ? '読み込み中'
            : profiles.isError
              ? '取得失敗'
              : '自動'}
        </option>
        {profiles.data?.profiles.map((profile) => (
          <option key={profile} value={profile}>
            {profile}
          </option>
        ))}
      </select>
      <span
        aria-live="polite"
        className="profile-switcher-status"
        role={selection.isError ? 'alert' : 'status'}
      >
        {selection.isError
          ? '切り替えに失敗しました。'
          : selection.isSuccess
            ? '切り替えました。'
            : ''}
      </span>
    </div>
  )
}
