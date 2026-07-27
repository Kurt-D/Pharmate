/** Light placeholder for patient tabs whose full screens arrive in later sprints. */
export default function Placeholder({ title, note }) {
  return (
    <>
      <h1 className="pm-title">{title}</h1>
      <p className="pm-subtitle">{note}</p>
      <div className="pm-banner pm-banner--info">Coming in a later sprint.</div>
    </>
  );
}
