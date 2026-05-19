export function Banner({ show }: { show: boolean }) {
  return (
    <header>
      {show && <strong>Live</strong>}
      {show ? <em>yes</em> : <em>no</em>}
    </header>
  );
}
