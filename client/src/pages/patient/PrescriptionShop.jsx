import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const RX_PRODUCTS = [
  {
    id: 'amoxicillin-500',
    name: 'Amoxicillin 500 mg',
    generic: 'Amoxicillin',
    category: 'Antibiotic',
    price: 120,
    pack: '10 capsules',
    total: 90,
    purchased: 50,
  },
  {
    id: 'amlodipine-5',
    name: 'Amlodipine 5 mg',
    generic: 'Amlodipine',
    category: 'Maintenance medicine',
    price: 95,
    pack: '30 tablets',
    total: 90,
    purchased: 60,
  },
  {
    id: 'metformin-500',
    name: 'Metformin 500 mg',
    generic: 'Metformin',
    category: 'Maintenance medicine',
    price: 135,
    pack: '30 tablets',
    total: 120,
    purchased: 90,
  },
];
function Icon({ name, size = 22 }) {
  const paths = {
    upload: (
      <>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M5 14v6h14v-6" />
      </>
    ),
    file: (
      <>
        <path d="M6 3h8l4 4v14H6Z" />
        <path d="M14 3v5h5" />
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
const money = (value) => `₱${Number(value).toFixed(2)}`;

export default function PrescriptionShop() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [prescription, setPrescription] = useState(null);
  const [preview, setPreview] = useState('');
  const [quantities, setQuantities] = useState({});
  const [message, setMessage] = useState('');
  useEffect(() => {
    try {
      setPrescription(JSON.parse(localStorage.getItem('pm_rx_prescription') || 'null'));
    } catch {
      setPrescription(null);
    }
  }, []);
  const selected = RX_PRODUCTS.filter((product) => Number(quantities[product.id] || 0) > 0);
  const total = selected.reduce(
    (sum, product) => sum + product.price * Number(quantities[product.id]),
    0
  );
  function uploadPrescription(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (preview) URL.revokeObjectURL(preview);
    const previewUrl = URL.createObjectURL(file);
    const next = {
      id: `RX-${Date.now().toString().slice(-7)}`,
      name: file.name,
      type: file.type,
      uploaded_at: new Date().toISOString(),
      status: 'pending_verification',
      preview: previewUrl,
    };
    setPreview(previewUrl);
    setPrescription(next);
    localStorage.setItem('pm_rx_prescription', JSON.stringify(next));
    setMessage('Prescription uploaded and ready to attach to this order.');
  }
  function changeQuantity(product, delta) {
    const remaining = product.total - product.purchased;
    setQuantities((current) => ({
      ...current,
      [product.id]: Math.max(0, Math.min(remaining, Number(current[product.id] || 0) + delta)),
    }));
  }
  function placeOrder() {
    if (!prescription) return setMessage('Upload a clear prescription image or PDF first.');
    if (!selected.length) return setMessage('Choose at least one prescribed medicine.');
    const order = {
      id: `RXO-${Date.now().toString().slice(-8)}`,
      type: 'rx',
      created_at: new Date().toISOString(),
      status: 'prescription_under_review',
      fulfillment: 'delivery',
      contact: 'Confirmed after approval',
      address: 'Confirmed after pharmacist approval',
      payment: 'cod',
      prescription,
      total,
      items: selected.map((product) => ({
        id: product.id,
        name: product.name,
        generic: product.generic,
        strength: product.name.replace(product.generic, '').trim(),
        category: product.category,
        quantity: Number(quantities[product.id]),
        max_quantity: product.total - product.purchased,
        unit_price: product.price,
        pack: product.pack,
      })),
      pharmacist: null,
      rejection_reason: '',
    };
    const previous = JSON.parse(localStorage.getItem('pm_rx_orders') || '[]');
    localStorage.setItem('pm_rx_orders', JSON.stringify([order, ...previous]));
    navigate(`/patient/orders?placed=${encodeURIComponent(order.id)}&type=rx`);
  }
  return (
    <div className="pm-rx-shop">
      <section className="pm-rx-guide">
        <h2>How Prescription Orders Work</h2>
        <div>
          {[
            ['upload', 'Upload Rx', 'Clear image or PDF'],
            ['medicine', 'Add Rx Items', 'Within allowed balance'],
            ['shield', 'Pharmacist Review', 'Safety and quantity check'],
            ['check', 'Delivery', 'Packed after approval'],
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
        <div className="pm-rx-message" role="status">
          {message}
        </div>
      )}
      <section className="pm-rx-upload-card">
        <div className="pm-rx-upload-title">
          <span>
            <Icon name="file" size={30} />
          </span>
          <div>
            <h2>{prescription ? 'Prescription Uploaded' : 'Prescription Required'}</h2>
            <p>
              {prescription
                ? 'Review the file status before choosing quantities.'
                : 'Upload a valid prescription before adding Rx medicine.'}
            </p>
          </div>
        </div>
        {prescription ? (
          <div className="pm-rx-file-preview">
            {preview && prescription.type?.startsWith('image/') ? (
              <img src={preview} alt="Prescription preview" />
            ) : (
              <span>
                <Icon name="file" size={32} />
              </span>
            )}
            <div>
              <strong>{prescription.name}</strong>
              <small>Uploaded {new Date(prescription.uploaded_at).toLocaleString()}</small>
              <em className={prescription.status}>
                {prescription.status === 'verified'
                  ? 'Verified'
                  : prescription.status === 'needs_resubmission'
                    ? 'Needs Resubmission'
                    : 'Pending Verification'}
              </em>
            </div>
            <button onClick={() => inputRef.current?.click()} type="button">
              Replace
            </button>
          </div>
        ) : (
          <ul>
            <li>Doctor’s name and PRC license number</li>
            <li>Prescription date and patient name</li>
            <li>Medicine, strength, dosage, and quantity</li>
          </ul>
        )}
        <input
          ref={inputRef}
          hidden
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          capture="environment"
          onChange={uploadPrescription}
        />
        <button
          className="pm-rx-upload-button"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          <Icon name={prescription ? 'camera' : 'upload'} />
          {prescription ? 'Upload a Clearer File' : 'Upload Prescription'}
        </button>
        <small>Supports camera photos, gallery images, and PDF files.</small>
      </section>
      {prescription && (
        <>
          <section className="pm-rx-medicines">
            <header>
              <h2>Prescription Medicines</h2>
              <p>Quantities cannot exceed the doctor-prescribed balance.</p>
            </header>
            {RX_PRODUCTS.map((product) => {
              const remaining = product.total - product.purchased;
              const quantity = Number(quantities[product.id] || 0);
              const usedPercent = Math.round((product.purchased / product.total) * 100);
              return (
                <article key={product.id}>
                  <div className="pm-rx-med-header">
                    <span>
                      <Icon name="medicine" />
                    </span>
                    <div>
                      <h3>{product.name}</h3>
                      <p>
                        {product.generic} · {product.category}
                      </p>
                    </div>
                    <strong>
                      {money(product.price)}
                      <small>/ {product.pack}</small>
                    </strong>
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
                      <strong>{remaining} units</strong>
                    </div>
                    <progress max="100" value={usedPercent}>
                      {usedPercent}% used
                    </progress>
                    <p>
                      {usedPercent}% dispensed · {100 - usedPercent}% remaining
                    </p>
                  </div>
                  <div className="pm-rx-quantity-row">
                    <span>
                      <strong>Requested quantity</strong>
                      <small>Maximum {remaining} units</small>
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
                        disabled={quantity >= remaining}
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
          <footer className="pm-rx-order-bar">
            <span>
              <small>Requested total</small>
              <strong>{money(total)}</strong>
            </span>
            <button disabled={!selected.length} onClick={placeOrder} type="button">
              Submit for Pharmacist Review
            </button>
          </footer>
        </>
      )}
    </div>
  );
}
