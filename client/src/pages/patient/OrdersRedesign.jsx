import { useEffect, useMemo, useRef, useState } from 'react';
import { api, apiUpload } from '../../api.js';
import { useLanguage } from '../../context/LanguageContext.jsx';

const classOf = (medicine) =>
  medicine.rx_class || (medicine.source === 'RX_VALIDATED' ? 'RX' : 'OTC');
const CATEGORIES = ['All', 'Pain Relief', 'Fever & Cold', 'Vitamins', 'More'];
const PRICE_HINTS = {
  paracetamol: 120,
  amoxicillin: 120,
  ibuprofen: 95,
  metformin: 135,
  amlodipine: 140,
};
const estimatedPrice = (name) =>
  Object.entries(PRICE_HINTS).find(([drug]) => String(name).toLowerCase().includes(drug))?.[1] ||
  100;
function categoryOf(name) {
  const key = String(name).toLowerCase();
  if (/paracetamol|ibuprofen|aspirin|pain/.test(key)) return 'Pain Relief';
  if (/cold|cough|flu|carbocisteine/.test(key)) return 'Fever & Cold';
  if (/vitamin|ascorbic|calcium|zinc/.test(key)) return 'Vitamins';
  return 'More';
}

export default function OrdersRedesign() {
  const { language } = useLanguage();
  const tr = (english, filipino) => (language === 'fil' ? filipino : english);
  const [medicines, setMedicines] = useState([]);
  const [branches, setBranches] = useState([]);
  const [orders, setOrders] = useState({ refills: [], deliveries: [] });
  const [tab, setTab] = useState('OTC');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [quantities, setQuantities] = useState({});
  const [branchId, setBranchId] = useState('');
  const [kind, setKind] = useState('refill');
  const [address, setAddress] = useState('');
  const [uploadingId, setUploadingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const uploadMedicine = useRef(null);
  async function load() {
    try {
      const [m, b, o] = await Promise.all([
        api('/api/patient/medications'),
        api('/api/directory/branches'),
        api('/api/patient/orders'),
      ]);
      setMedicines(m.data.filter((item) => item.status !== 'cancelled'));
      setBranches(b.data);
      setOrders(o.data);
      setBranchId((current) => current || b.data[0]?.id || '');
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const eligible = useMemo(
    () =>
      medicines.filter(
        (medicine) =>
          classOf(medicine) === tab &&
          medicine.drug_name_raw.toLowerCase().includes(search.trim().toLowerCase()) &&
          (tab === 'RX' || category === 'All' || categoryOf(medicine.drug_name_raw) === category)
      ),
    [medicines, tab, category, search]
  );
  const selected = eligible.filter((medicine) => Number(quantities[medicine.id] || 0) > 0);
  const total = selected.reduce(
    (sum, medicine) =>
      sum + estimatedPrice(medicine.drug_name_raw) * Number(quantities[medicine.id]),
    0
  );
  function changeQuantity(id, delta) {
    setQuantities((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(30, Number(current[id] || 0) + delta)),
    }));
  }
  function choosePrescription(medicine) {
    uploadMedicine.current = medicine;
    fileInput.current?.click();
  }
  async function uploadPrescription(event) {
    const file = event.target.files?.[0];
    const medicine = uploadMedicine.current;
    event.target.value = '';
    if (!file || !medicine) return;
    setUploadingId(medicine.id);
    setError('');
    try {
      const form = new FormData();
      form.append('photo', file);
      await apiUpload(`/api/patient/medications/${medicine.id}/prescription`, form);
      setMessage(
        'Prescription uploaded. A pharmacist will validate it before ordering is enabled.'
      );
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploadingId('');
      uploadMedicine.current = null;
    }
  }
  async function placeOrder() {
    setError('');
    setMessage('');
    if (!selected.length) return setError('Choose at least one medicine and quantity.');
    if (!branchId) return setError('Choose a pharmacy branch.');
    if (kind === 'delivery' && !address.trim()) return setError('Enter a delivery address.');
    try {
      for (const medicine of selected)
        await api(kind === 'delivery' ? '/api/patient/deliveries' : '/api/patient/refills', {
          method: 'POST',
          body: {
            medication_id: medicine.id,
            branch_id: branchId,
            address: kind === 'delivery' ? address.trim() : undefined,
            notes: `Requested quantity: ${quantities[medicine.id]}`,
          },
        });
      setMessage(
        'Order request sent. Payment and final availability will be confirmed by the branch.'
      );
      setQuantities({});
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  const history = [
    ...orders.refills.map((item) => ({ ...item, kind: 'Pickup' })),
    ...orders.deliveries.map((item) => ({ ...item, kind: 'Delivery' })),
  ].sort((a, b) => new Date(b.requested_at) - new Date(a.requested_at));

  return (
    <main className="pm-orders-page">
      <header>
        <div>
          <h1>{tr('Orders', 'Mga Order')}</h1>
          <p>{tr('Track your orders.', 'Subaybayan ang iyong mga order.')}</p>
        </div>
        <span>▱</span>
      </header>
      {error && <div className="pm-banner pm-banner--warn">{error}</div>}
      {message && <div className="pm-banner pm-banner--success">{message}</div>}
      <div className="pm-order-search">
        <span>⌕</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={tr('Search anything', 'Maghanap ng gamot')}
        />
      </div>
      <div className="pm-order-tabs">
        <button className={tab === 'OTC' ? 'active' : ''} onClick={() => setTab('OTC')}>
          <strong>{tr('OTC & Vitamins', 'OTC at Bitamina')}</strong>
          <small>{tr('No prescription needed', 'Hindi kailangan ng reseta')}</small>
        </button>
        <button className={tab === 'RX' ? 'active' : ''} onClick={() => setTab('RX')}>
          <strong>{tr('Prescription (Rx) Meds', 'Mga Gamot na may Reseta')}</strong>
          <small>
            {tr('Requires prescription & approval', 'Kailangan ng reseta at pag-apruba')}
          </small>
        </button>
      </div>
      {tab === 'OTC' ? (
        <>
          <h2>Shop OTC &amp; Wellness</h2>
          <div className="pm-order-categories">
            {CATEGORIES.map((item, index) => (
              <button
                key={item}
                className={category === item ? 'active' : ''}
                onClick={() => setCategory(item)}
              >
                <i>{['▦', '♿', '◉', '▤', '•••'][index]}</i>
                <span>{item}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h2>How Prescription Orders Work</h2>
          <div className="pm-rx-steps">
            <span>
              <i>▣</i>Upload<small>Clear photo</small>
            </span>
            <b>→</b>
            <span>
              <i>▤</i>Add Rx Items<small>From your record</small>
            </span>
            <b>→</b>
            <span>
              <i>✓</i>Pharmacist Review<small>Safety approval</small>
            </span>
            <b>→</b>
            <span>
              <i>▱</i>Order<small>Branch prepares</small>
            </span>
          </div>
        </>
      )}
      <section className="pm-order-products">
        {eligible.length === 0 && (
          <div className="pm-order-empty">
            No medicines in this category yet. Add the medicine in the Medications tab first.
          </div>
        )}
        {eligible.map((medicine, index) => {
          const rx = classOf(medicine) === 'RX';
          const approved =
            medicine.status === 'active' && medicine.prescription_status === 'approved';
          const canOrder = !rx ? medicine.status === 'active' : approved;
          const quantity = Number(quantities[medicine.id] || 0);
          return (
            <article className="pm-order-product" key={medicine.id}>
              <div className={`pm-order-pack pm-order-pack--${index % 4}`}>
                <span>+</span>
                <small>PharMate</small>
              </div>
              <div>
                <h3>{medicine.drug_name_raw}</h3>
                <p>
                  {medicine.dosage_instruction ||
                    medicine.frequency ||
                    (rx ? 'Prescription medicine' : 'OTC medicine')}
                </p>
                {rx && (
                  <small className={approved ? 'approved' : 'pending'}>
                    {approved
                      ? '✓ Pharmacist approved'
                      : medicine.prescription_status === 'pending'
                        ? 'Waiting for pharmacist approval'
                        : 'Prescription required'}
                  </small>
                )}
              </div>
              <strong>₱{estimatedPrice(medicine.drug_name_raw).toFixed(2)}</strong>
              {canOrder ? (
                <div className="pm-order-quantity">
                  <button onClick={() => changeQuantity(medicine.id, -1)}>−</button>
                  <span>{quantity}</span>
                  <button onClick={() => changeQuantity(medicine.id, 1)}>+</button>
                </div>
              ) : (
                <button
                  className="pm-upload-order-rx"
                  disabled={
                    uploadingId === medicine.id || medicine.prescription_status === 'pending'
                  }
                  onClick={() => choosePrescription(medicine)}
                >
                  {uploadingId === medicine.id
                    ? 'Uploading…'
                    : medicine.prescription_status === 'pending'
                      ? 'Under Review'
                      : 'Upload Prescription'}
                </button>
              )}
            </article>
          );
        })}
      </section>
      <section className="pm-order-options">
        <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
          <option value="">{tr('Choose pharmacy branch', 'Pumili ng pharmacy branch')}</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <div>
          <button className={kind === 'refill' ? 'active' : ''} onClick={() => setKind('refill')}>
            {tr('Pickup', 'Kunin sa Branch')}
          </button>
          <button
            className={kind === 'delivery' ? 'active' : ''}
            onClick={() => setKind('delivery')}
          >
            {tr('Delivery', 'I-deliver')}
          </button>
        </div>
        {kind === 'delivery' && (
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder={tr('Delivery address', 'Address ng delivery')}
          />
        )}
      </section>
      <footer className="pm-order-total">
        <span>
          {tr('Total estimate', 'Tinatayang kabuuan')}
          <strong>₱{total.toFixed(2)}</strong>
          <small>{tr('Payment at branch', 'Bayad sa branch')}</small>
        </span>
        <button disabled={!selected.length} onClick={placeOrder}>
          {tr('Place Order', 'Umorder')}
        </button>
      </footer>
      {history.length > 0 && (
        <section className="pm-order-history">
          <h2>{tr('Order History', 'Kasaysayan ng Order')}</h2>
          {history.slice(0, 5).map((item) => (
            <div key={`${item.kind}-${item.id}`}>
              <span>
                <strong>{item.drug}</strong>
                <small>
                  {item.kind} · {item.branch}
                </small>
              </span>
              <em>{item.status.replaceAll('_', ' ')}</em>
            </div>
          ))}
        </section>
      )}
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        onChange={uploadPrescription}
      />
    </main>
  );
}
