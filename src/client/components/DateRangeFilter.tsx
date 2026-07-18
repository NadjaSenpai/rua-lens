export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  return (
    <>
      <label>
        <span>開始日</span>
        <input name="from" type="date" aria-label="開始日" defaultValue={from} />
      </label>
      <label>
        <span>終了日</span>
        <input name="to" type="date" aria-label="終了日" defaultValue={to} />
        <small>終了日を含むUTC期間</small>
      </label>
    </>
  );
}
