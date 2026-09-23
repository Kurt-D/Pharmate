import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiBlobUrl } from '../../api.js';

const PRESCRIPTION_ORDER_DRAFT_KEY = 'pm_prescription_order_draft';

export const ADDRESS_OPTIONS = {
  'National Capital Region': {
    'Metro Manila': {
      Manila: ['Barangay 1', 'Barangay 2', 'Barangay 3'],
      'Quezon City': ['Commonwealth', 'Cubao', 'Diliman'],
      Makati: ['Poblacion', 'Bel-Air', 'Bangkal'],
    },
  },
  'Region IV-A — CALABARZON': {
    Cavite: { Dasmariñas: ['Burol', 'Salawag', 'Paliparan'], Imus: ['Bayan Luma', 'Anabu', 'Alapan'] },
    Laguna: { Calamba: ['Canlubang', 'Real', 'Halang'], 'Santa Rosa': ['Balibago', 'Tagapo', 'Don Jose'] },
  },
  'Region III — Central Luzon': {
    Bulacan: { Malolos: ['Bagna', 'Santo Cristo', 'Tikay'], 'San Jose del Monte': ['Muzon', 'Tungko', 'Gumaoc'] },
    Pampanga: { Angeles: ['Balibago', 'Cutcut', 'Malabanias'], 'City of San Fernando': ['Dolores', 'San Jose', 'Sindalan'] },
  },
};

function readPrescriptionOrderDraft() {
  try {
    return JSON.parse(sessionStorage.getItem(PRESCRIPTION_ORDER_DRAFT_KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function Icon({ name, size = 22 }) {
  const paths = {
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
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

export default function PrescriptionShop({ checkoutPage = false }) {
  const navigate = useNavigate();
  const [initialDraft] = useState(readPrescriptionOrderDraft);
  const [medications, setMedications] = useState([]);
  const [pendingPrescriptions, setPendingPrescriptions] = useState([]);
  const [branchId, setBranchId] = useState(initialDraft.branchId || '');
  const [quantities, setQuantities] = useState(initialDraft.quantities || {});
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [checkoutOpen] = useState(checkoutPage);
  const [checkoutStep, setCheckoutStep] = useState(0);
  const [fulfillment, setFulfillment] = useState('pickup');
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [city, setCity] = useState('');
  const [barangay, setBarangay] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [streetName, setStreetName] = useState('');
  const [building, setBuilding] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [deliveryLandmark, setDeliveryLandmark] = useState('');
  const [message, setMessage] = useState('');
  const [viewingUrl, setViewingUrl] = useState('');

  useEffect(
    () => () => {
      if (viewingUrl) URL.revokeObjectURL(viewingUrl);
    },
    [viewingUrl]
  );

  useEffect(() => {
    Promise.all([api('/api/patient/medications'), api('/api/directory/branches')])
      .then(([medicineResponse, branchResponse]) => {
        const allMedicines = medicineResponse.data;
        setMedications(
          allMedicines.filter(
            (item) =>
              item.source === 'RX_VALIDATED' &&
              item.prescription_status === 'approved' &&
              Number(item.prescribed_quantity) > 0
          )
        );
        setPendingPrescriptions(
          allMedicines.filter(
            (item) => item.source === 'RX_VALIDATED' && item.prescription_status === 'pending'
          )
        );
        setBranchId(
          (current) =>
            current || branchResponse.data.find((branch) => branch.is_active !== 0)?.id || ''
        );
      })
      .catch((error) => setMessage(error.message || 'Prescription records could not be loaded.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        PRESCRIPTION_ORDER_DRAFT_KEY,
        JSON.stringify({ branchId, quantities })
      );
    } catch {
      /* The ordering flow remains usable when browser storage is unavailable. */
    }
  }, [branchId, quantities]);

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
  const selectedProducts = products.filter((product) => Number(quantities[product.id] || 0) > 0);

  function changeQuantity(product, delta) {
    setQuantities((current) => ({
      ...current,
      [product.id]: Math.max(
        0,
        Math.min(product.remaining, Number(current[product.id] || 0) + delta)
      ),
    }));
  }

  async function viewUpload(prescription) {
    if (!prescription.prescription_photo_id) return;
    try {
      setMessage('');
      setViewingUrl(await apiBlobUrl(`/api/patient/prescriptions/${prescription.prescription_photo_id}/photo`));
    } catch (error) {
      setMessage(error.message || 'Your uploaded prescription could not be opened.');
    }
  }

  function closeUploadViewer() {
    if (viewingUrl) URL.revokeObjectURL(viewingUrl);
    setViewingUrl('');
  }

  async function placeOrder() {
    const selected = selectedProducts;
    if (!branchId) return setMessage('No active pharmacy branch is available.');
    if (!selected.length) return setMessage('Choose a quantity for at least one medicine.');
    if (!recipientName.trim()) return setMessage('Enter the name the pharmacy or driver should call.');
    if (recipientPhone.replace(/\D/g, '').length < 7)
      return setMessage('Enter a valid contact number for delivery updates.');
    if (fulfillment === 'delivery' && (!region || !province || !city || !barangay || !postalCode.trim() || !streetName.trim() || !houseNumber.trim()))
      return setMessage('Complete the delivery address before placing the order.');
    setPlacing(true);
    setMessage('');
    try {
      for (const product of selected) {
        await api(fulfillment === 'delivery' ? '/api/patient/deliveries' : '/api/patient/refills', {
          method: 'POST',
          body: {
            medication_id: product.id,
            branch_id: branchId,
            quantity: Number(quantities[product.id]),
            address: fulfillment === 'delivery'
              ? [
                  `House/Unit ${houseNumber.trim()}${building.trim() ? `, ${building.trim()}` : ''}`,
                  streetName.trim(), barangay, city, province, region, postalCode.trim(),
                  deliveryLandmark.trim() && `Landmark: ${deliveryLandmark.trim()}`,
                ]
                  .filter(Boolean)
                  .join('\n')
              : undefined,
            notes: `Recipient: ${recipientName.trim()} · Contact: ${recipientPhone.trim()}`,
            payment_method: fulfillment === 'delivery' ? 'COD' : 'CASH_ON_PICKUP',
          },
        });
      }
      sessionStorage.removeItem(PRESCRIPTION_ORDER_DRAFT_KEY);
      navigate('/patient/orders?placed=prescription');
    } catch (error) {
      setMessage(error.message || 'The prescription order could not be submitted.');
      setPlacing(false);
    }
  }

  return (
    <div className="pm-rx-shop">
      {checkoutOpen ? (
        <section className="pm-rx-checkout pm-cart-page" aria-labelledby="rx-checkout-title">
          <header className="pm-cart-page__header">
            <button aria-label="Back" onClick={() => checkoutStep ? setCheckoutStep(0) : navigate('/patient/shop?mode=rx')} type="button"><Icon name="back" /></button>
            <div><h2 id="rx-checkout-title">Your Cart</h2></div>
          </header>
          <div className="pm-cart-type-tabs" role="tablist">
            <button role="tab" aria-selected="false" onClick={() => navigate('/patient/cart')} type="button">OTC Medicines</button>
            <button className="active" role="tab" aria-selected="true" type="button">Prescription Medicines</button>
          </div>
          {checkoutStep === 0 ? <>
            <div className="pm-rx-checkout__items">
              {selectedProducts.map((product) => (
                <article key={product.id}>
                  <span><Icon name="medicine" /></span>
                  <div><strong>{product.name}</strong><small>{quantities[product.id]} unit{quantities[product.id] === 1 ? '' : 's'} selected</small></div>
                  <b>Price confirmed by pharmacy</b>
                </article>
              ))}
            </div>
            <p className="pm-rx-checkout__notice">Prescription prices are confirmed by the pharmacy after stock is checked. You can review your delivery details next.</p>
            <button className="pm-rx-checkout__submit" onClick={() => setCheckoutStep(1)} type="button">Proceed to Checkout</button>
          </> : <>
          <div className="pm-rx-checkout__items">
            {selectedProducts.map((product) => (
              <article key={product.id}>
                <span><Icon name="medicine" /></span>
                <div><strong>{product.name}</strong><small>{quantities[product.id]} unit{quantities[product.id] === 1 ? '' : 's'} selected</small></div>
                <b>Price confirmed by pharmacy</b>
              </article>
            ))}
          </div>
          <p className="pm-rx-checkout__notice">Prescription prices are set by the pharmacy after stock is confirmed. No payment is taken yet.</p>
          <fieldset className="pm-rx-checkout__fulfillment">
            <legend>How would you like to receive it?</legend>
            <button className={fulfillment === 'delivery' ? 'active' : ''} onClick={() => setFulfillment('delivery')} type="button"><strong>Doorstep Delivery</strong><small>₱60 · Standard delivery</small></button>
            <button className={fulfillment === 'pickup' ? 'active' : ''} onClick={() => setFulfillment('pickup')} type="button"><strong>Branch Pickup</strong><small>Free · Pick up when ready</small></button>
          </fieldset>
          <label className="pm-rx-checkout__field">Full name<input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder="Full name" /></label>
          <label className="pm-rx-checkout__field">Contact number<input value={recipientPhone} onChange={(event) => setRecipientPhone(event.target.value)} inputMode="tel" placeholder="e.g. 0917 123 4567" type="tel" /></label>
          {fulfillment === 'delivery' && <>
            <label className="pm-rx-checkout__field">Region<select value={region} onChange={(event) => { setRegion(event.target.value); setProvince(''); setCity(''); setBarangay(''); }}><option value="">Select region</option>{Object.keys(ADDRESS_OPTIONS).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="pm-rx-checkout__field">Province<select disabled={!region} value={province} onChange={(event) => { setProvince(event.target.value); setCity(''); setBarangay(''); }}><option value="">Select province</option>{region && Object.keys(ADDRESS_OPTIONS[region]).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="pm-rx-checkout__field">City / Municipality<select disabled={!province} value={city} onChange={(event) => { setCity(event.target.value); setBarangay(''); }}><option value="">Select city or municipality</option>{province && Object.keys(ADDRESS_OPTIONS[region][province]).map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="pm-rx-checkout__field">Barangay<select disabled={!city} value={barangay} onChange={(event) => setBarangay(event.target.value)}><option value="">Select barangay</option>{city && ADDRESS_OPTIONS[region][province][city].map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="pm-rx-checkout__field">Postal code<input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} inputMode="numeric" placeholder="e.g. 1101" /></label>
            <label className="pm-rx-checkout__field">Street name<input value={streetName} onChange={(event) => setStreetName(event.target.value)} placeholder="Street or subdivision" /></label>
            <label className="pm-rx-checkout__field">Building / unit <small>Optional</small><input value={building} onChange={(event) => setBuilding(event.target.value)} placeholder="Building, floor, or unit number" /></label>
            <label className="pm-rx-checkout__field">Delivery instructions <small>Optional</small><input value={houseNumber} onChange={(event) => setHouseNumber(event.target.value)} placeholder="Gate color, floor, or delivery note" /></label>
            <label className="pm-rx-checkout__field">Landmark or delivery instructions <small>Optional — e.g. gate color, nearby store, or where to leave the order.</small><input value={deliveryLandmark} onChange={(event) => setDeliveryLandmark(event.target.value)} placeholder="Add a helpful landmark or instruction" /></label>
          </>}
          {message && <p className="pm-rx-message" role="alert">{message}</p>}
          <button className="pm-rx-checkout__submit" disabled={placing} onClick={placeOrder} type="button">{placing ? 'Placing order…' : 'Place Order'}</button>
          </>}
        </section>
      ) : <>
      <section className="pm-rx-guide">
        <h2>What happens next</h2>
        <div>
          {[
            ['camera', 'Upload Rx', 'Upload a clear prescription photo'],
            ['check', 'Details', 'Provide the prescription details'],
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
            <h2>Upload a Prescription</h2>
            <p>Upload a clear prescription photo and provide its details for pharmacist review.</p>
          </div>
        </div>
        <button
          className="pm-rx-upload-button"
          onClick={() => navigate('/patient/medications/prescription')}
          type="button"
        >
          <Icon name="upload" /> Upload Prescription
        </button>
      </section>

      {pendingPrescriptions.length > 0 && (
        <section className="pm-rx-pending-card" aria-live="polite">
          <span><Icon name="shield" size={26} /></span>
          <div>
            <strong>{pendingPrescriptions.length === 1 ? 'Prescription uploaded' : `${pendingPrescriptions.length} prescriptions uploaded`}</strong>
            <p>Your pharmacist is reviewing your prescription. We will notify you when it is ready.</p>
          </div>
          <b>Awaiting review</b>
          <button onClick={() => viewUpload(pendingPrescriptions[0])} type="button">
            View uploaded prescription
          </button>
        </section>
      )}

      {viewingUrl && (
        <div className="pm-rx-upload-viewer" role="dialog" aria-modal="true" aria-label="Uploaded prescription">
          <div>
            <header>
              <span>
                <strong>Your uploaded prescription</strong>
                <small>This is the redacted image sent for pharmacist review.</small>
              </span>
              <button aria-label="Close uploaded prescription" onClick={closeUploadViewer} type="button">×</button>
            </header>
            <img alt="Your redacted uploaded prescription" src={viewingUrl} />
          </div>
        </div>
      )}

      <section className="pm-rx-medicines">
        <header>
          <h2>Validated Prescription Medicines</h2>
          <p>Balances come from your reviewed prescription and saved orders.</p>
        </header>
        {loading && <p>Loading prescription balances…</p>}
        {!loading && !products.length && (
          <div className="pm-rx-message">
            No approved prescription with a confirmed total quantity is available yet. Upload a
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

      {requestedTotal > 0 && (
        <footer className="pm-rx-order-bar">
          <span>
            <small>Requested quantity</small>
            <strong>{requestedTotal} units</strong>
          </span>
          <button disabled={placing} onClick={() => navigate('/patient/cart?type=rx')} type="button">
            Proceed to Checkout
          </button>
        </footer>
      )}
      </>}
    </div>
  );
}
