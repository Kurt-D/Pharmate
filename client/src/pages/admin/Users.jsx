import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

// User Management (Fig 51). Pseudonymous — patients by code, staff by role.
// Activate / deactivate accounts. No "Add Patient" (patients self-register with
// pseudonymity; adding one by name would break TC-05).
export default function Users() {
  const [role, setRole] = useState('patient');
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/admin/users?role=${role}`);
      setUsers(r.data);
    } catch (e) {
      setError(e.message);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(u) {
    await api(`/api/admin/users/${u.id}/active`, { method: 'PUT', body: { active: !u.is_active } });
    setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, is_active: x.is_active ? 0 : 1 } : x)));
  }

  return (
    <>
      <h2 className="h4 fw-bold mb-1">User Management</h2>
      <p className="text-muted">Accounts by code/role — never a name (TC-05).</p>
      {error && <div className="alert alert-warning py-2">{error}</div>}

      <div className="mb-3">
        <select
          className="form-select form-select-sm d-inline-block"
          style={{ width: 'auto' }}
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {['patient', 'pharmacist', 'caregiver', 'admin'].map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>

      <div className="pw-card p-3">
        <table className="table table-sm align-middle mb-0">
          <thead>
            <tr>
              <th>Account</th>
              <th>Role</th>
              <th>Joined</th>
              <th className="text-end">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="pw-code">{u.label}</td>
                <td className="text-capitalize">{u.role}</td>
                <td className="small text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="text-end">
                  <button
                    className={
                      'btn btn-sm ' + (u.is_active ? 'btn-outline-danger' : 'btn-outline-success')
                    }
                    onClick={() => toggle(u)}
                  >
                    {u.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
