import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';
const roles = ['patient', 'pharmacist', 'caregiver', 'admin'];
export default function Users() {
  const [role, setRole] = useState('patient'),
    [users, setUsers] = useState([]),
    [query, setQuery] = useState(''),
    [status, setStatus] = useState('all'),
    [error, setError] = useState('');
  const load = useCallback(
    () =>
      api(`/api/admin/users?role=${role}`)
        .then((r) => setUsers(r.data))
        .catch((e) => setError(e.message)),
    [role]
  );
  useEffect(() => {
    load();
  }, [load]);
  const shown = useMemo(
    () =>
      users.filter(
        (u) =>
          (status === 'all' || (status === 'active') === !!u.is_active) &&
          u.label.toLowerCase().includes(query.toLowerCase())
      ),
    [users, query, status]
  );
  async function toggle(u) {
    try {
      await api(`/api/admin/users/${u.id}/active`, {
        method: 'PUT',
        body: { active: !u.is_active },
      });
      setUsers((rows) =>
        rows.map((x) => (x.id === u.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x))
      );
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-card">
        <div className="admin-toolbar">
          {roles.map((r) => (
            <button
              key={r}
              className={`admin-btn ${role === r ? 'primary' : ''}`}
              onClick={() => setRole(r)}
            >
              {r === 'patient' ? 'Patients' : r[0].toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <div className="admin-toolbar">
          <input
            className="admin-input"
            placeholder="Search account code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            className="admin-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>ACCOUNT</th>
                <th>ROLE</th>
                <th>DATE ADDED</th>
                <th>STATUS</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((u, i) => (
                <tr key={u.id}>
                  <td>{i + 1}</td>
                  <td className="admin-code">{u.label}</td>
                  <td>{u.role}</td>
                  <td>{new Date(u.created_at).toLocaleString()}</td>
                  <td>
                    <span className={`admin-badge ${u.is_active ? 'green' : 'red'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="admin-btn" onClick={() => toggle(u)}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <div className="admin-empty">No matching accounts.</div>}
        </div>
      </div>
      <p className="admin-note" style={{ marginTop: 14 }}>
        Patient accounts are displayed by patient code only. Names and medical conditions are
        intentionally excluded from the admin view.
      </p>
    </>
  );
}
