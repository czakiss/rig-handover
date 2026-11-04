import type { DigestRow } from '../digest/types.js';

// Plan § 2a. Rows come in already sorted by job (readNight's contract); the
// view never re-sorts. One table. Missing data renders as an em dash,
// never an empty cell (styleguide). Marks: retries >= 3 and any 'fail'
// lastStatus are wrapped in <span class="warn"> — the one warning color
// the layout ships, so a copy of the page carries the marks too.
export function DigestPage({ night, rows }: { night: string; rows: DigestRow[] }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{row.owner ?? '—'}</td>
                <td>{row.runs}</td>
                <td class={mark(row)}>{row.retries}</td>
                <td class={mark(row)}>{row.lastStatus}</td>
                <td>{row.lastError ?? '—'}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// 'warn' when the row deserves a mark, else undefined so hono/jsx drops the
// attribute (no class="" noise in the HTML).
function mark(row: DigestRow): string | undefined {
  return row.retries >= 3 || row.lastStatus === 'fail' ? 'warn' : undefined;
}
