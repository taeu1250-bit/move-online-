import { useState } from 'react'
export function ProfileForm({
  initial,
  onSave,
}: {
  initial?: { name: string; year: number; dept?: string; skillLevel?: string }
  onSave: (
    name: string,
    year: number,
    dept: string,
    skillLevel: string,
  ) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name || ''),
    [year, setYear] = useState(initial?.year || new Date().getFullYear())
  const [dept, setDept] = useState(initial?.dept || '')
  const skillLevel = initial?.skillLevel || ''
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim() || !dept.trim()) {
          setMessage('이름과 소속 학과 또는 학부를 입력해 주세요.')
          return
        }
        setBusy(true)
        setMessage('')
        try {
          await onSave(name.trim(), year, dept.trim(), skillLevel)
          setMessage('프로필을 저장했어요.')
        } catch (e) {
          setMessage(e instanceof Error ? e.message : '저장할 수 없어요.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <label>
        이름
        <input
          required
          maxLength={30}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        소속 학과 또는 학부
        <input
          required
          maxLength={60}
          value={dept}
          onChange={(e) => setDept(e.target.value)}
        />
      </label>
      <label>
        입학연도
        <input
          required
          type="number"
          min={2000}
          max={new Date().getFullYear()}
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
      </label>
      <p className="hint">
        학교 메일함에 접근할 수 있는지 확인해요. 이름과 재학 정보는 직접
        입력하며 학교의 공식 인증을 거치지 않아요.
      </p>
      <button className="primary full" disabled={busy}>
        프로필 저장
      </button>
      <p role="status">{message}</p>
    </form>
  )
}
