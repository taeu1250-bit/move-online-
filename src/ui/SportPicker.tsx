import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { sports, type Sport } from '../domain/model'
import { SportMark } from './common'
import './sport-picker.css'

export function SportPicker({ value, onChange, home = false, allowed }: {
  value: Sport | '전체'
  onChange: (value: Sport | '전체') => void
  home?: boolean
  allowed?: readonly Sport[]
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const main: (Sport | '전체')[] = allowed ? [...allowed] : home
    ? ['전체', '풋살', '축구', '농구', '러닝']
    : ['풋살', '축구', '농구', '러닝', '헬스']
  const extra = sports.filter(s => !main.includes(s))
  const selectedExtra = value !== '전체' && extra.includes(value)
  useEffect(() => {
    if (open) dialog.current?.showModal()
    else dialog.current?.close()
  }, [open])
  function close() { setOpen(false); trigger.current?.focus() }
  return <>
    <div className={home ? 'chips filter-options sport-options' : 'sport-grid'} role="group" aria-label="운동 종목">
      {main.map(s => <button type="button" key={s} aria-pressed={value === s} onClick={() => onChange(s)}>
        {!home && s !== '전체' && <SportMark sport={s} />}{s}
      </button>)}
      {!allowed && <button type="button" ref={trigger} aria-haspopup="dialog" aria-expanded={open}
        aria-pressed={selectedExtra} onClick={() => setOpen(true)}>
        {selectedExtra ? value : '더보기'}<ChevronDown size={18} />
      </button>}
    </div>
    {!allowed && <dialog ref={dialog} className="sport-sheet" aria-labelledby="sport-sheet-title"
      onCancel={e => { e.preventDefault(); close() }}
      onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className="sport-sheet-content">
        <div className="section-head"><h2 id="sport-sheet-title">운동 종목 선택</h2>
          <button type="button" aria-label="종목 선택 닫기" onClick={close}><X /></button>
        </div>
        <div className="sport-grid">{extra.map(s => <button type="button" key={s} aria-pressed={value === s}
          onClick={() => { onChange(s); close() }}><SportMark sport={s} />{s}</button>)}</div>
      </div>
    </dialog>}
  </>
}
