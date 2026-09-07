import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiUpload } from '../../api.js';

function Icon({ name, size = 22 }) {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    medicine: (
      <>
        <path d="m10.5 5.5 8 8a4 4 0 0 1-5.7 5.7l-8-8a4 4 0 0 1 5.7-5.7Z" />
        <path d="m8.5 15.5 7-7" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
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
      strokeWidth="2.3"
    >
      {paths[name]}
    </svg>
  );
}

function brandLabel(value) {
  try {
    const brands = Array.isArray(value) ? value : JSON.parse(value || '[]');
    return brands.filter(Boolean).slice(0, 3).join(', ');
  } catch {
    return '';
  }
}

const CATALOG_MODES = [
  { value: 'ALL', label: 'All Medicines', description: 'Complete scheduler catalog' },
  { value: 'OTC', label: 'OTC Medicines', description: 'No prescription required' },
  { value: 'RX', label: 'Prescription Medicines', description: 'Approval required for ordering' },
];

export default function Shop() {
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [mode, setMode] = useState('ALL');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState([]);
  const [orderMedicine, setOrderMedicine] = useState(null);
  const [order, setOrder] = useState({
    quantity: 1,
    branch_id: '',
    fulfillment: 'pickup',
    payment_method: 'CASH_ON_PICKUP',
    address: '',
  });
  const [prescription, setPrescription] = useState(null);
  const [ordering, setOrdering] = useState(false);

  useEffect(() => {
    api('/api/patient/drugs?q=&limit=500')
      .then((response) => {
        setMedicines(response.data);
        setError('');
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    api('/api/directory/branches')
      .then((response) => setBranches(response.data))
      .catch(() => setBranches([]));
  }, []);

  const modeMedicines = useMemo(
    () =>
      medicines.filter(
        (medicine) => medicine.availability && (mode === 'ALL' || medicine.rx_class === mode)
      ),
    [medicines, mode]
  );
  const categories = useMemo(
    () => [
      'All',
      ...new Set(modeMedicines.map((medicine) => medicine.therapeutic_category).filter(Boolean)),
    ],
    [modeMedicines]
  );
  const shown = useMemo(() => {
    const query = search.trim().toLowerCase();
    return modeMedicines.filter((medicine) => {
      const matchesCategory = category === 'All' || medicine.therapeutic_category === category;
      const matchesSearch =
        !query ||
        [
          medicine.generic_name,
          brandLabel(medicine.brand_names_json),
          medicine.common_strength,
          medicine.dosage_form,
          medicine.common_uses,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [category, modeMedicines, search]);

  function chooseMode(nextMode) {
    setMode(nextMode);
    setCategory('All');
    setSearch('');
  }

  function showNextMode() {
    const currentIndex = CATALOG_MODES.findIndex((item) => item.value === mode);
    chooseMode(CATALOG_MODES[(currentIndex + 1) % CATALOG_MODES.length].value);
  }

  function beginOrder(medicine) {
    setOrderMedicine(medicine);
    setPrescription(null);
    setOrder({
      quantity: 1,
      branch_id: branches[0]?.id || '',
      fulfillment: 'pickup',
      payment_method: 'CASH_ON_PICKUP',
      address: '',
    });
  }

  async function placeOrder(event) {
    event.preventDefault();
    setOrdering(true);
    setError('');
    try {
      const body = new FormData();
      Object.entries({ ...order, drug_id: orderMedicine.id }).forEach(([key, value]) =>
        body.append(key, value)
      );
      if (prescription) body.append('photo', prescription);
      const response = await apiUpload('/api/patient/orders', body);
      navigate(
        `/patient/orders?placed=${encodeURIComponent(response.data.id)}&type=${orderMedicine.rx_class === 'RX' ? 'rx' : 'otc'}`
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setOrdering(false);
    }
  }

  return (
    <main className="pm-shop-page">
      <header className="pm-shop-header">
        <div>
          <h1>Medicine Catalog</h1>
          <p>Browse available pharmacy products and place an order.</p>
        </div>
      </header>

      <div className="pm-shop-mode-tabs pm-shop-mode-switcher" aria-live="polite">
        <button
          className="pm-shop-mode-current"
          onClick={showNextMode}
          type="button"
          aria-label={`Show next medicine type after ${CATALOG_MODES.find((item) => item.value === mode)?.label}`}
        >
          <span className="pm-shop-mode-copy">
            <small>Viewing catalog</small>
            <strong>{CATALOG_MODES.find((item) => item.value === mode)?.label}</strong>
            <span>{CATALOG_MODES.find((item) => item.value === mode)?.description}</span>
          </span>
          <b className="pm-shop-mode-arrow" aria-hidden="true">
            ›
          </b>
        </button>
      </div>

      <label className="pm-shop-search">
        <Icon name="search" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search generic name, strength, form, or use"
        />
        <span className="visually-hidden">Search medicine catalog</span>
      </label>

      <div className="pm-shop-filters" aria-label="Medicine categories">
        {categories.map((item) => (
          <button
            className={category === item ? 'active' : ''}
            onClick={() => setCategory(item)}
            type="button"
            key={item}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="pm-shop-heading">
        <div>
          <h2>
            {mode === 'ALL'
              ? 'All Medicines'
              : mode === 'OTC'
                ? 'OTC Medicines'
                : 'Prescription Medicines'}
          </h2>
          <p>
            {shown.length} of {modeMedicines.length} medicines visible
          </p>
        </div>
      </div>

      {mode === 'RX' && (
        <div className="pm-shop-error" role="note">
          <Icon name="shield" />
          Prescription medicines require an uploaded prescription for pharmacist review.
        </div>
      )}
      {error && (
        <div className="pm-shop-error" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="pm-shop-empty">
          <strong>Loading medicine catalog…</strong>
        </div>
      ) : shown.length ? (
        <section className="pm-product-grid">
          {shown.map((medicine) => {
            const brands = brandLabel(medicine.brand_names_json);
            return (
              <article key={medicine.id}>
                <div className="pm-product-visual" aria-hidden="true">
                  <span>
                    <Icon name="medicine" size={34} />
                  </span>
                  <small>{medicine.dosage_form || 'Medicine'}</small>
                </div>
                <div className="pm-product-copy">
                  <em>{medicine.rx_class === 'RX' ? 'Rx · Approval required' : 'OTC'}</em>
                  <h3>{medicine.generic_name}</h3>
                  <p>
                    {[medicine.common_strength, medicine.dosage_form].filter(Boolean).join(' · ')}
                  </p>
                  {brands && <small>Brands: {brands}</small>}
                  {medicine.common_uses && <small>{medicine.common_uses}</small>}
                </div>
                <button
                  className="pm-product-add"
                  onClick={() => beginOrder(medicine)}
                  type="button"
                >
                  <Icon name="plus" size={18} /> Order medicine
                </button>
              </article>
            );
          })}
        </section>
      ) : (
        <div className="pm-shop-empty">
          <Icon name="search" size={30} />
          <strong>No matching medicine</strong>
          <p>Try another name, strength, dosage form, or category.</p>
        </div>
      )}
      {orderMedicine && (
        <div className="pm-confirm-backdrop" role="presentation">
          <form className="pm-confirm-dialog" onSubmit={placeOrder} role="dialog" aria-modal="true">
            <h2>Order {orderMedicine.generic_name}</h2>
            <label>
              Quantity
              <input
                min="1"
                max="100"
                type="number"
                value={order.quantity}
                onChange={(event) =>
                  setOrder((current) => ({ ...current, quantity: event.target.value }))
                }
              />
            </label>
            <label>
              Pharmacy branch
              <select
                required
                value={order.branch_id}
                onChange={(event) =>
                  setOrder((current) => ({ ...current, branch_id: event.target.value }))
                }
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fulfillment
              <select
                value={order.fulfillment}
                onChange={(event) =>
                  setOrder((current) => ({
                    ...current,
                    fulfillment: event.target.value,
                    payment_method: event.target.value === 'delivery' ? 'COD' : 'CASH_ON_PICKUP',
                  }))
                }
              >
                <option value="pickup">Branch pickup</option>
                <option value="delivery">Delivery</option>
              </select>
            </label>
            {order.fulfillment === 'delivery' && (
              <label>
                Delivery address
                <input
                  required
                  value={order.address}
                  onChange={(event) =>
                    setOrder((current) => ({ ...current, address: event.target.value }))
                  }
                />
              </label>
            )}
            {orderMedicine.rx_class === 'RX' && (
              <label>
                Prescription image
                <input
                  accept="image/jpeg,image/png,image/webp"
                  required
                  type="file"
                  onChange={(event) => setPrescription(event.target.files?.[0] || null)}
                />
              </label>
            )}
            <div className="pm-confirm-actions">
              <button type="button" onClick={() => setOrderMedicine(null)}>
                Cancel
              </button>
              <button disabled={ordering} type="submit">
                {ordering ? 'Placing order…' : 'Place Order'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
