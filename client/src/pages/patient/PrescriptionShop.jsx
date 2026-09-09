import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';

function Icon({ name, size = 22 }) {
  const paths = {
    upload: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M5 14v6h14v-6" />
      </>
    ),
    medicine: (
      <>
        <path d="m10.5 5.5 8 8a4 4 0 0 1-5.7 5.7l-8-8a4 4 0 0 1 5.7-5.7Z" />
        <path d="m8.5 15.5 7-7" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    minus: <path d="M5 12h14" />,
    camera: (
      <>
        <path d="M4 7h4l2-3h4l2 3h4v12H4Z" />
        <circle cx="12" cy="13" r="3" />
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

function medicineName(item) {
  const name = item.drug_name_raw || 'Prescription medicine';
  const strength = [item.strength_value, item.strength_unit].filter(Boolean).join(' ');
  return strength && !name.toLowerCase().includes(strength.toLowerCase())
    ? `${name} ${strength}`
    : name;
}

export default function PrescriptionShop() {
  const navigate = useNavigate();
  const [medications, setMedications] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [quantities, setQuantities] = useState({});
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    Promise.all([api('/api/patient/medications'), api('/api/directory/branches')])
      .then(([medicineResponse, branchResponse]) => {
        setMedications(
          medicineResponse.data.filter(
            (item) =>
              item.rx_class === 'RX' &&
              item.prescription_status === 'approved' &&
              Number(item.prescribed_quantity) > 0
          )
        );
        setBranchId(branchResponse.data.find((branch) => branch.is_active !== 0)?.id || '');
      })
      .catch((error) => setMessage(error.message || 'Prescription records could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  const products = useMemo(
    () =>
      medications.map((item) => {
        const total = Number(item.prescribed_quantity || 0);
        const purchased = Math.min(total, Number(item.purchased_quantity || 0));
        return {
          ...item,
          name: medicineName(item),
          total,
          purchased,
          remaining: total - purchased,
        };
      }),
    [medications]
  );
  const requestedTotal = products.reduce(
    (sum, product) => sum + Number(quantities[product.id] || 0),
    0
  );

  function changeQuantity(product, delta) {
    setQuantities((current) => ({
      ...current,
      [product.id]: Math.max(
        0,
        Math.min(product.remaining, Number(current[product.id] || 0) + delta)
      ),
    }));
  }

  async function placeOrder() {
    const selected = products.filter((product) => Number(quantities[product.id] || 0) > 0);
    if (!branchId) return setMessage('No active pharmacy branch is available.');
    if (!selected.length) return setMessage('Choose a quantity for at least one medicine.');
    setPlacing(true);
    setMessage('');
    try {
      for (const product of selected) {
        await api('/api/patient/refills', {
          method: 'POST',
          body: {
            medication_id: product.id,
            branch_id: branchId,
            quantity: Number(quantities[product.id]),
            payment_method: 'CASH_ON_PICKUP',
          },
        });
      }
      navigate('/patient/orders?placed=prescription');
    } catch (error) {
      setMessage(error.message || 'The prescription order could not be submitted.');
      setPlacing(false);
    }
  }

  return (
    <div className="pm-rx-shop">
      <section className="pm-rx-guide">
        <h2>Prescription Ordering</h2>
        <div>
          {[
            ['camera', 'Scan Rx', 'OCR reads the prescription'],
            ['check', 'Confirm', 'Check every detected detail'],
            ['shield', 'Review', 'A pharmacist validates it'],
            ['medicine', 'Order', 'Limited to the saved balance'],
          ].map(([icon, title, help], index) => (
            <article key={title}>
              <span>
                <Icon name={icon} />
              </span>
              <b>{index + 1}</b>
              <strong>{title}</strong>
              <small>{help}</small>
            </article>
          ))}
        </div>
      </section>

      {message && (
        <div className="pm-rx-message" role="alert">
          {message}
        </div>
      )}

      <section className="pm-rx-upload-card">
        <div className="pm-rx-upload-title">
          <span>
            <Icon name="upload" size={30} />
          </span>
          <div>
            <h2>Scan a Prescription</h2>
            <p>Use OCR, confirm the detected details, and send them for pharmacist review.</p>
          </div>
        </div>
        <button
          className="pm-rx-upload-button"
          onClick={() => navigate('/patient/medications/prescription')}
          type="button"
        >
          <Icon name="camera" /> Open Prescription Scanner
        </button>
      </section>

      <section className="pm-rx-medicines">
        <header>
          <h2>Validated Prescription Medicines</h2>
          <p>Balances come from your reviewed prescription and saved orders.</p>
        </header>
        {loading && <p>Loading prescription balances…</p>}
        {!loading && !products.length && (
          <div className="pm-rx-message">
            No approved prescription with a confirmed total quantity is available yet. Scan a
            prescription first.
          </div>
        )}
        {products.map((product) => {
          const quantity = Number(quantities[product.id] || 0);
          const usedPercent = product.total
            ? Math.round((product.purchased / product.total) * 100)
            : 0;
          return (
            <article key={product.id}>
              <div className="pm-rx-med-header">
                <span>
                  <Icon name="medicine" />
                </span>
                <div>
                  <h3>{product.name}</h3>
                  <p>{product.dosage_form_snapshot || 'Prescription medicine'}</p>
                </div>
              </div>
              <div className="pm-rx-balance">
                <div>
                  <small>Total Prescribed</small>
                  <strong>{product.total} units</strong>
                </div>
                <div>
                  <small>Already Purchased</small>
                  <strong>{product.purchased} units</strong>
                </div>
                <div>
                  <small>Remaining Balance</small>
                  <strong>{product.remaining} units</strong>
                </div>
                <progress max="100" value={usedPercent}>
                  {usedPercent}% used
                </progress>
                <p>
                  {usedPercent}% ordered · {100 - usedPercent}% remaining
                </p>
              </div>
              <div className="pm-rx-quantity-row">
                <span>
                  <strong>Requested quantity</strong>
                  <small>Maximum {product.remaining} units</small>
                </span>
                <div>
                  <button
                    onClick={() => changeQuantity(product, -1)}
                    disabled={!quantity}
                    aria-label={`Remove one ${product.name}`}
                    type="button"
                  >
                    <Icon name="minus" />
                  </button>
                  <b>{quantity}</b>
                  <button
                    onClick={() => changeQuantity(product, 1)}
                    disabled={quantity >= product.remaining}
                    aria-label={`Add one ${product.name}`}
                    type="button"
                  >
                    <Icon name="plus" />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {products.length > 0 && (
        <footer className="pm-rx-order-bar">
          <span>
            <small>Requested quantity</small>
            <strong>{requestedTotal} units</strong>
          </span>
          <button disabled={!requestedTotal || placing} onClick={placeOrder} type="button">
            {placing ? 'Submitting…' : 'Submit for Pharmacist Review'}
          </button>
        </footer>
      )}
    </div>
  );
}
