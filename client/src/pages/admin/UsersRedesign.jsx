import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api.js';

const ROLE_FILTERS = [
  { id: 'all', label: 'All Users' },
  { id: 'staff', label: 'Pharmacists & Admins' },
  { id: 'patient', label: 'Patients' },
  { id: 'caregiver', label: 'Caregivers' },
];
const ROLES = ['patient', 'pharmacist', 'caregiver', 'admin'];
const PAGE_SIZE = 10;

function matchesRoleFilter(user, filter) {
  if (filter === 'all') return true;
  if (filter === 'staff') return ['pharmacist', 'admin'].includes(user.role);
  return user.role === filter;
}

function UserIcon({ name, size = 18 }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    search: <path d="m21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z" />,
    filter: <path d="M3 5h18M6 12h12M10 19h4" />,
    refresh: <path d="M20 11a8 8 0 1 0 1 4m0 0v-5m0 5h-5" />,
    eye: (
      <>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </>
    ),
    edit: <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm9.8-12.2 3 3" />,
    trash: <path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    shield: <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Zm-3-10 2 2 4-5" />,
    chevronLeft: <path d="m15 18-6-6 6-6" />,
    chevronRight: <path d="m9 18 6-6-6-6" />,
  };
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.9"
    >
      {paths[name]}
    </svg>
  );
}

function UserModal({ mode, user, onClose, onSave }) {
  const readOnly = mode === 'view';
  const [draft, setDraft] = useState(() => user || { label: '', role: 'patient', is_active: 1 });
  const title = mode === 'add' ? 'Add User' : mode === 'edit' ? 'Edit User' : 'User Details';

  function submit(event) {
    event.preventDefault();
    if (!readOnly && draft.label.trim()) onSave({ ...draft, label: draft.label.trim() });
  }

  return (
    <div
      className="admin-user-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-labelledby="admin-user-modal-title"
        aria-modal="true"
        className="admin-user-modal"
        role="dialog"
      >
        <header>
          <span>
            <UserIcon name={readOnly ? 'eye' : mode === 'add' ? 'plus' : 'edit'} />
          </span>
          <div>
            <small>Role-based account</small>
            <h2 id="admin-user-modal-title">{title}</h2>
            <p>
              {readOnly
                ? 'Review this account without exposing private patient information.'
                : 'Manage only the identifier, role, and account status.'}
            </p>
          </div>
          <button aria-label="Close dialog" onClick={onClose} type="button">
            <UserIcon name="close" />
          </button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>Account identifier</span>
            <input
              autoFocus={!readOnly}
              disabled={readOnly}
              onChange={(event) =>
                setDraft((current) => ({ ...current, label: event.target.value }))
              }
              placeholder={
                draft.role === 'patient' ? 'Example: P0012' : 'Account email or staff code'
              }
              required
              value={draft.label}
            />
          </label>
          <div className="admin-user-form-grid">
            <label>
              <span>Role</span>
              <select
                disabled={readOnly}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, role: event.target.value }))
                }
                value={draft.role}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {role[0].toUpperCase() + role.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Status</span>
              <select
                disabled={readOnly}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, is_active: Number(event.target.value) }))
                }
                value={Number(draft.is_active)}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
          </div>
          <aside>
            <UserIcon name="shield" size={17} />
            <p>
              Patient names and medical conditions are intentionally excluded from this
              administrative record.
            </p>
          </aside>
          <footer>
            <button className="admin-btn" onClick={onClose} type="button">
              {readOnly ? 'Close' : 'Cancel'}
            </button>
            {!readOnly && (
              <button className="admin-btn primary" type="submit">
                {mode === 'add' ? 'Add User' : 'Save Changes'}
              </button>
            )}
          </footer>
        </form>
      </section>
    </div>
  );
}

function DeleteModal({ user, onClose, onConfirm }) {
  return (
    <div
      className="admin-user-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        aria-labelledby="admin-delete-title"
        aria-modal="true"
        className="admin-user-modal admin-delete-modal"
        role="dialog"
      >
        <header>
          <span>
            <UserIcon name="trash" />
          </span>
          <div>
            <small>Destructive action</small>
            <h2 id="admin-delete-title">Delete Account</h2>
            <p>
              This removes <strong>{user.label}</strong> from the current admin view.
            </p>
          </div>
          <button aria-label="Close delete confirmation" onClick={onClose} type="button">
            <UserIcon name="close" />
          </button>
        </header>
        <div className="admin-delete-modal__body">
          <p>
            Are you sure you want to delete this {user.role} account?
          </p>
        </div>
        <footer>
          <button className="admin-btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="admin-btn danger" onClick={onConfirm} type="button">
            Delete Account
          </button>
        </footer>
      </section>
    </div>
  );
}

function CredentialModal({ credential, onClose, onSave, saving }) {
  const [draft, setDraft] = useState(() => ({
    ...credential,
    license_number: credential.license_number || '',
    license_jurisdiction: credential.license_jurisdiction || '',
    license_expires_on: credential.license_expires_on ? String(credential.license_expires_on).slice(0, 10) : '',
    license_evidence_url: credential.license_evidence_url || '',
    license_status: credential.license_status || 'PENDING',
  }));

  function submit(event) {
    event.preventDefault();
    onSave(draft);
  }

  return (
    <div className="admin-user-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section aria-labelledby="admin-credential-title" aria-modal="true" className="admin-user-modal" role="dialog">
        <header>
          <span><UserIcon name="shield" /></span>
          <div>
            <small>Clinical review access</small>
            <h2 id="admin-credential-title">Pharmacist approval</h2>
            <p>Record the license check before granting clinical signing access.</p>
          </div>
          <button aria-label="Close approval dialog" onClick={onClose} type="button"><UserIcon name="close" /></button>
        </header>
        <form onSubmit={submit}>
          <label>
            <span>License number</span>
            <input required onChange={(event) => setDraft((current) => ({ ...current, license_number: event.target.value }))} value={draft.license_number} />
          </label>
          <div className="admin-user-form-grid">
            <label>
              <span>Jurisdiction</span>
              <input required onChange={(event) => setDraft((current) => ({ ...current, license_jurisdiction: event.target.value }))} value={draft.license_jurisdiction} />
            </label>
            <label>
              <span>Expires on</span>
              <input required onChange={(event) => setDraft((current) => ({ ...current, license_expires_on: event.target.value }))} type="date" value={draft.license_expires_on} />
            </label>
          </div>
          <label>
            <span>Verification record URL</span>
            <input required onChange={(event) => setDraft((current) => ({ ...current, license_evidence_url: event.target.value }))} placeholder="https://…" type="url" value={draft.license_evidence_url} />
          </label>
          <label>
            <span>Approval status</span>
            <select onChange={(event) => setDraft((current) => ({ ...current, license_status: event.target.value }))} value={draft.license_status}>
              <option value="PENDING">Pending review</option>
              <option value="VERIFIED">Approved for clinical review</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </label>
          <aside>
            <UserIcon name="shield" size={17} />
            <p>Approve only after independently confirming the pharmacist’s current license.</p>
          </aside>
          <footer>
            <button className="admin-btn" onClick={onClose} type="button">Cancel</button>
            <button className="admin-btn primary" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save approval'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export default function Users() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [credentials, setCredentials] = useState({});
  const [credentialModal, setCredentialModal] = useState(null);
  const [credentialSaving, setCredentialSaving] = useState(false);

  useEffect(() => {
    if (!modal && !deleteTarget && !credentialModal) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [modal, deleteTarget, credentialModal]);

  const load = useCallback(() => {
    setError('');
    return Promise.all([
      ...ROLES.map((role) => api(`/api/admin/users?role=${role}`)),
      api('/api/admin/pharmacist-credentials'),
    ])
      .then((responses) => {
        const credentialResponse = responses.pop();
        const credentialById = Object.fromEntries(
          (credentialResponse.data?.pharmacists || []).map((credential) => [credential.id, credential])
        );
        setCredentials(credentialById);
        setUsers(
          responses
            .flatMap((response) => response.data)
            .map((user) => ({ ...user, is_active: Number(user.is_active), credential: credentialById[user.id] || null }))
        );
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(
    () =>
      users
        .filter((user) => matchesRoleFilter(user, activeFilter))
        .filter((user) => status === 'all' || (status === 'active') === Boolean(user.is_active))
        .filter((user) =>
          [user.label, user.role].some((value) =>
            String(value).toLowerCase().includes(query.trim().toLowerCase())
          )
        )
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    [activeFilter, query, status, users]
  );

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleUsers = shown.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function changeFilter(next) {
    setActiveFilter(next);
    setPage(1);
  }

  async function toggle(user) {
    try {
      if (!String(user.id).startsWith('local-'))
        await api(`/api/admin/users/${user.id}/active`, {
          method: 'PUT',
          body: { active: !user.is_active },
        });
      setUsers((rows) =>
        rows.map((row) => (row.id === user.id ? { ...row, is_active: row.is_active ? 0 : 1 } : row))
      );
    } catch (toggleError) {
      setError(toggleError.message);
    }
  }

  async function saveCredential(draft) {
    setCredentialSaving(true);
    setError('');
    try {
      await api(`/api/admin/pharmacist-credentials/${draft.id}`, { method: 'PUT', body: draft });
      setCredentialModal(null);
      await load();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setCredentialSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      if (!String(deleteTarget.id).startsWith('local-')) {
        await api(`/api/admin/users/${deleteTarget.id}`, { method: 'DELETE' });
      }
      setUsers((rows) => rows.filter((row) => row.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  return (
    <div className="admin-user-management">
      {error && <div className="admin-error">{error}</div>}
      <section className="admin-card admin-user-card">
        <nav aria-label="User categories" className="admin-user-tabs">
          {ROLE_FILTERS.map((filter) => (
            <button
              aria-current={activeFilter === filter.id ? 'page' : undefined}
              className={activeFilter === filter.id ? 'active' : ''}
              key={filter.id}
              onClick={() => changeFilter(filter.id)}
              type="button"
            >
              {filter.label}
              <span>{users.filter((user) => matchesRoleFilter(user, filter.id)).length}</span>
            </button>
          ))}
        </nav>
        <div className="admin-user-toolbar">
          <label className="admin-user-search">
            <UserIcon name="search" size={17} />
            <input
              aria-label="Search users"
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search by account ID or role…"
              type="search"
              value={query}
            />
          </label>
          <label className="admin-user-filter">
            <UserIcon name="filter" size={16} />
            <select
              aria-label="Filter users by status"
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button
            aria-label="Refresh user list"
            className="admin-user-refresh"
            onClick={load}
            type="button"
          >
            <UserIcon name="refresh" size={17} />
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table admin-user-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Account ID</th>
                <th>Role</th>
                <th>Status</th>
                <th>Clinical approval</th>
                <th>Date Added</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user, index) => (
                <tr key={user.id}>
                  <td>{String((currentPage - 1) * PAGE_SIZE + index + 1).padStart(2, '0')}</td>
                  <td>
                    <span className="admin-account-code">{user.label}</span>
                  </td>
                  <td>
                    <span className="admin-role-badge">{user.role}</span>
                  </td>
                  <td>
                    <button
                      className={`admin-status-toggle ${user.is_active ? 'is-active' : 'is-inactive'}`}
                      onClick={() => toggle(user)}
                      type="button"
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td>
                    {user.role === 'pharmacist' ? (
                      <button
                        className={`admin-credential-status is-${String(user.credential?.license_status || 'pending').toLowerCase()}`}
                        onClick={() => setCredentialModal(user.credential || { id: user.id, license_status: 'PENDING' })}
                        type="button"
                      >
                        <UserIcon name="shield" size={14} /> {user.credential?.license_status === 'VERIFIED' ? 'Approved' : 'Review approval'}
                      </button>
                    ) : (
                      <span className="admin-credential-na">—</span>
                    )}
                  </td>
                  <td>
                    {user.created_at
                      ? new Date(user.created_at).toLocaleString('en-PH', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : 'Not recorded'}
                  </td>
                  <td>
                    <div className="admin-row-actions">
                      <button
                        aria-label={`View ${user.label}`}
                        onClick={() => setModal({ mode: 'view', user })}
                        type="button"
                      >
                        <UserIcon name="eye" size={16} />
                      </button>
                      <button
                        aria-label={`Delete ${user.label}`}
                        className="danger"
                        onClick={() => setDeleteTarget(user)}
                        type="button"
                      >
                        <UserIcon name="trash" size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visibleUsers.length && <div className="admin-empty">No matching accounts.</div>}
        </div>
        <footer className="admin-user-pagination">
          <div>
            <button
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              <UserIcon name="chevronLeft" size={15} />
            </button>
            {Array.from({ length: pageCount }, (_, index) => index + 1)
              .slice(0, 5)
              .map((number) => (
                <button
                  className={currentPage === number ? 'active' : ''}
                  key={number}
                  onClick={() => setPage(number)}
                  type="button"
                >
                  {number}
                </button>
              ))}
            <button
              aria-label="Next page"
              disabled={currentPage === pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
              type="button"
            >
              <UserIcon name="chevronRight" size={15} />
            </button>
          </div>
          <p>
            Showing {visibleUsers.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–
            {Math.min(currentPage * PAGE_SIZE, shown.length)} of {shown.length} accounts
          </p>
        </footer>
      </section>
      <p className="admin-note">
        <UserIcon name="shield" size={17} /> Patient accounts are displayed by patient code only.
        Names and medical conditions remain excluded from the admin view.
      </p>
      {modal && (
        <UserModal
          key={`${modal.mode}-${modal.user?.id || 'new'}`}
          mode={modal.mode}
          onClose={() => setModal(null)}
          user={modal.user}
        />
      )}
      {credentialModal && (
        <CredentialModal
          credential={credentials[credentialModal.id] || credentialModal}
          onClose={() => setCredentialModal(null)}
          onSave={saveCredential}
          saving={credentialSaving}
        />
      )}
      {deleteTarget && (
        <DeleteModal
          onClose={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
          user={deleteTarget}
        />
      )}
    </div>
  );
}
