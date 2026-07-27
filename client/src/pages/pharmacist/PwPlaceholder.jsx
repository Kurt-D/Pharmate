/** Placeholder for pharmacist console tabs whose screens arrive in later sprints. */
export default function PwPlaceholder({ title, sprint }) {
  return (
    <>
      <h2 className="h4 fw-bold mb-1">{title}</h2>
      <div className="pw-card p-4 mt-3 text-muted">Arrives in {sprint}.</div>
    </>
  );
}
